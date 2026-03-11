import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { PrismaClient } from './generated/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

// Адаптер принимает { url }. Иначе внутри Prisma — ошибка "reading 'replace'". Запускай из папки apps/api.
const databaseUrl = process.env.DATABASE_URL || 'file:./dev.db';
const adapter = new PrismaBetterSqlite3({ url: databaseUrl });
const app = express();
const prisma = new PrismaClient({ adapter });

app.use(cors());
app.use(express.json());

function asyncHandler(fn: (req: express.Request, res: express.Response) => Promise<void>) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
}

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Activity categories — всегда отдаём простые объекты (без Prisma), чтобы избежать ошибок сериализации
function serializeCategory(c: { id: number; name: string; color: string; description: string | null; type: string }) {
  return {
    id: c.id,
    name: String(c.name),
    color: String(c.color),
    description: c.description != null ? String(c.description) : null,
    type: String(c.type),
  };
}

function clampPriority(value: unknown): number {
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return 0;
  return Math.max(0, Math.min(3, Math.round(numeric)));
}

function toDayBounds(input: Date) {
  const start = new Date(input);
  start.setHours(0, 0, 0, 0);
  const end = new Date(input);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function serializeTask(t: {
  id: number;
  title: string;
  description: string | null;
  date: Date | null;
  dueDate: Date | null;
  status: string;
  priority: number;
  projectId: number | null;
  parentTaskId: number | null;
  estimatedMinutes: number | null;
  actualMinutes: number | null;
  taskCategoryId: number | null;
  taskCategory?: { id: number; name: string; color: string; type: string } | null;
}) {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    date: t.date ? t.date.toISOString().slice(0, 10) : null,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    status: t.status,
    priority: t.priority,
    projectId: t.projectId,
    parentTaskId: t.parentTaskId,
    estimatedMinutes: t.estimatedMinutes,
    actualMinutes: t.actualMinutes,
    taskCategoryId: t.taskCategoryId,
    taskCategory: t.taskCategory
      ? {
          id: t.taskCategory.id,
          name: String(t.taskCategory.name),
          color: String(t.taskCategory.color),
          type: String(t.taskCategory.type),
        }
      : null,
  };
}

function serializeTimeEntry(e: {
  id: number;
  categoryId: number;
  taskId: number | null;
  startTime: Date;
  endTime: Date | null;
  durationMinutes: number | null;
  notes: string | null;
}) {
  return {
    id: e.id,
    categoryId: e.categoryId,
    taskId: e.taskId,
    startTime: e.startTime.toISOString(),
    endTime: e.endTime ? e.endTime.toISOString() : null,
    durationMinutes: e.durationMinutes,
    notes: e.notes,
  };
}

async function hasEntryOverlap(
  startTime: Date,
  endTime: Date,
  excludeEntryId?: number,
) {
  const overlap = await prisma.timeEntry.findFirst({
    where: {
      endTime: { not: null, gt: startTime },
      startTime: { lt: endTime },
      ...(excludeEntryId ? { id: { not: excludeEntryId } } : {}),
    },
    select: { id: true },
  });
  return Boolean(overlap);
}

app.get('/api/activity-categories', async (_req, res) => {
  const rows = await prisma.activityCategory.findMany();
  res.json(rows.map(serializeCategory));
});

app.post('/api/activity-categories', async (req, res) => {
  const { name, color, description, type } = req.body;
  const category = await prisma.activityCategory.create({
    data: { name, color, description, type },
  });
  res.status(201).json(serializeCategory(category));
});

// Time entries
app.post('/api/time-entries/start', async (req, res) => {
  const { categoryId, projectId, taskId, notes } = req.body as {
    categoryId?: number;
    projectId?: number;
    taskId?: number | null;
    notes?: string;
  };

  if (!categoryId) {
    res.status(400).json({ error: 'categoryId is required' });
    return;
  }

  const active = await prisma.timeEntry.findFirst({ where: { endTime: null } });
  if (active) {
    res.status(409).json({ error: 'There is already an active timer' });
    return;
  }

  const entry = await prisma.timeEntry.create({
    data: {
      categoryId: Number(categoryId),
      projectId: projectId ?? null,
      taskId: taskId ?? null,
      notes: notes ?? null,
      startTime: new Date(),
    },
  });
  res.status(201).json(serializeTimeEntry(entry));
});

app.post('/api/time-entries/stop', async (req, res) => {
  const { taskId } = (req.body ?? {}) as { taskId?: number | null };
  const active = await prisma.timeEntry.findFirst({
    where: { endTime: null },
  });
  if (!active) {
    res.status(400).json({ error: 'No active time entry' });
    return;
  }
  const now = new Date();
  const durationMinutes = Math.round(
    (now.getTime() - active.startTime.getTime()) / 60000,
  );
  const updated = await prisma.timeEntry.update({
    where: { id: active.id },
    data: {
      endTime: now,
      durationMinutes,
      ...(taskId !== undefined ? { taskId: taskId ?? null } : {}),
    },
  });
  res.json(serializeTimeEntry(updated));
});

app.post('/api/time-entries', async (req, res) => {
  const { categoryId, taskId, startTime, endTime, notes } = req.body as {
    categoryId?: number;
    taskId?: number | null;
    startTime?: string;
    endTime?: string;
    notes?: string;
  };

  if (!categoryId || !startTime || !endTime) {
    res.status(400).json({ error: 'categoryId, startTime and endTime are required' });
    return;
  }

  const start = new Date(startTime);
  const end = new Date(endTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    res.status(400).json({ error: 'Invalid time range' });
    return;
  }

  if (await hasEntryOverlap(start, end)) {
    res.status(409).json({ error: 'Time range overlaps with another entry' });
    return;
  }

  const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60000);
  const created = await prisma.timeEntry.create({
    data: {
      categoryId: Number(categoryId),
      taskId: taskId ?? null,
      startTime: start,
      endTime: end,
      durationMinutes,
      notes: notes ?? null,
    },
  });
  res.status(201).json(serializeTimeEntry(created));
});

app.patch('/api/time-entries/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { taskId, categoryId, startTime, endTime, notes } = req.body as {
    taskId?: number | null;
    categoryId?: number;
    startTime?: string;
    endTime?: string;
    notes?: string | null;
  };
  const current = await prisma.timeEntry.findUnique({ where: { id } });
  if (!current) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const data: {
    taskId?: number | null;
    categoryId?: number;
    startTime?: Date;
    endTime?: Date | null;
    durationMinutes?: number | null;
    notes?: string | null;
  } = {};
  if (taskId !== undefined) data.taskId = taskId === null ? null : Number(taskId);
  if (categoryId !== undefined) data.categoryId = Number(categoryId);
  if (notes !== undefined) data.notes = notes ?? null;

  const nextStart = startTime ? new Date(startTime) : current.startTime;
  const nextEnd = endTime === null ? null : endTime ? new Date(endTime) : current.endTime;
  if (startTime !== undefined || endTime !== undefined) {
    if (Number.isNaN(nextStart.getTime()) || (nextEnd && Number.isNaN(nextEnd.getTime()))) {
      res.status(400).json({ error: 'Invalid time format' });
      return;
    }
    if (nextEnd && nextEnd <= nextStart) {
      res.status(400).json({ error: 'endTime must be later than startTime' });
      return;
    }
    if (nextEnd && (await hasEntryOverlap(nextStart, nextEnd, id))) {
      res.status(409).json({ error: 'Time range overlaps with another entry' });
      return;
    }
    data.startTime = nextStart;
    data.endTime = nextEnd;
    data.durationMinutes = nextEnd
      ? Math.round((nextEnd.getTime() - nextStart.getTime()) / 60000)
      : null;
  }

  const updated = await prisma.timeEntry.update({
    where: { id },
    data,
  });
  const rows = await prisma.timeEntry.findMany({
    where: { id: updated.id },
    select: { id: true, categoryId: true, startTime: true, endTime: true, durationMinutes: true, notes: true, taskId: true },
  });
  const e = rows[0];
  if (!e) {
    return res.status(404).json({ error: 'Not found' });
  }
  const categoryIds = [e.categoryId];
  const categories = await prisma.activityCategory.findMany({
    where: { id: { in: categoryIds } },
    select: { id: true, name: true, color: true, type: true },
  });
  const cat = categories[0];
  res.json({
    id: e.id,
    categoryId: e.categoryId,
    taskId: e.taskId,
    startTime: e.startTime.toISOString(),
    endTime: e.endTime ? e.endTime.toISOString() : null,
    durationMinutes: e.durationMinutes,
    notes: e.notes,
    category: cat ? { id: cat.id, name: String(cat.name), color: String(cat.color), type: String(cat.type) } : undefined,
  });
});

app.delete('/api/time-entries/:id', async (req, res) => {
  const id = Number(req.params.id);
  await prisma.timeEntry.delete({ where: { id } });
  res.status(204).send();
});

app.get('/api/time-entries', async (req, res) => {
  const { from, to, date } = req.query;
  const where: any = {};
  if (date && typeof date === 'string') {
    const day = new Date(date);
    const { start, end } = toDayBounds(day);
    where.startTime = { gte: start, lte: end };
  } else if (from || to) {
    where.startTime = {};
    if (from) where.startTime.gte = new Date(from as string);
    if (to) where.startTime.lte = new Date(to as string);
  }
  const rows = await prisma.timeEntry.findMany({
    where,
    orderBy: { startTime: 'desc' },
    select: {
      id: true,
      categoryId: true,
      taskId: true,
      startTime: true,
      endTime: true,
      durationMinutes: true,
      notes: true,
    },
  });
  const categoryIds = [...new Set(rows.map((e) => e.categoryId))];
  const categories =
    categoryIds.length > 0
      ? await prisma.activityCategory.findMany({
          where: { id: { in: categoryIds } },
          select: { id: true, name: true, color: true, type: true },
        })
      : [];
  const nameById: Record<number, { name: string; color: string; type: string }> = {};
  for (const c of categories) {
    nameById[c.id] = { name: String(c.name), color: String(c.color), type: String(c.type) };
  }
  const entries = rows.map((e) => ({
    id: e.id,
    categoryId: e.categoryId,
    taskId: e.taskId ?? null,
    startTime: e.startTime.toISOString(),
    endTime: e.endTime ? e.endTime.toISOString() : null,
    durationMinutes: e.durationMinutes,
    notes: e.notes,
    category: nameById[e.categoryId]
      ? { id: e.categoryId, name: nameById[e.categoryId].name, color: nameById[e.categoryId].color, type: nameById[e.categoryId].type }
      : undefined,
  }));
  res.json(entries);
});

// Lyubyshev-style reports: day/week/month, with plan/fact
app.get('/api/reports', async (req, res) => {
  const { range = 'day', date } = req.query as {
    range?: string;
    date?: string;
  };

  const base = date ? new Date(date) : new Date();
  const from = new Date(base);
  const to = new Date(base);

  // normalize to full period
  if (range === 'week') {
    const day = from.getDay();
    const diff = (day === 0 ? -6 : 1) - day;
    from.setDate(from.getDate() + diff);
    from.setHours(0, 0, 0, 0);

    to.setDate(from.getDate() + 6);
    to.setHours(23, 59, 59, 999);
  } else if (range === 'month') {
    from.setDate(1);
    from.setHours(0, 0, 0, 0);

    to.setMonth(from.getMonth() + 1, 0);
    to.setHours(23, 59, 59, 999);
  } else {
    from.setHours(0, 0, 0, 0);
    to.setHours(23, 59, 59, 999);
  }

  const entries = await prisma.timeEntry.findMany({
    where: { startTime: { gte: from, lte: to } },
    include: { category: true },
  });

  type Agg = {
    categoryId: number;
    name: string;
    plannedMinutes: number;
    actualMinutes: number;
  };

  const byCategory = new Map<number, Agg>();

  for (const e of entries) {
    const minutes =
      e.durationMinutes ??
      Math.round((to.getTime() - e.startTime.getTime()) / 60000);
    const existing = byCategory.get(e.categoryId) ?? {
      categoryId: e.categoryId,
      name: e.category.name,
      plannedMinutes: 0,
      actualMinutes: 0,
    };
    existing.actualMinutes += minutes;
    byCategory.set(e.categoryId, existing);
  }

  const rows = Array.from(byCategory.values());
  const totalPlanned = 0;
  const totalActual = rows.reduce((sum, r) => sum + r.actualMinutes, 0);

  res.json({
    range,
    from,
    to,
    totalPlanned,
    totalActual,
    byCategory: rows,
  });
});

// Simple daily/weekly/monthly summary based on startTime (no include to avoid serialization issues)
app.get('/api/time-entries/summary', async (req, res) => {
  try {
    const range = typeof req.query.range === 'string' ? req.query.range : 'day';
    const now = new Date();
    const from = new Date(now);

    if (range === 'week') {
      const day = from.getDay();
      const diff = (day === 0 ? -6 : 1) - day;
      from.setDate(from.getDate() + diff);
      from.setHours(0, 0, 0, 0);
    } else if (range === 'month') {
      from.setDate(1);
      from.setHours(0, 0, 0, 0);
    } else {
      from.setHours(0, 0, 0, 0);
    }

    const entries = await prisma.timeEntry.findMany({
      where: { startTime: { gte: from, lte: now } },
      select: { categoryId: true, startTime: true, durationMinutes: true },
    });

    const categoryIds = [...new Set(entries.map((e) => e.categoryId))];
    const categories =
      categoryIds.length > 0
        ? await prisma.activityCategory.findMany({
            where: { id: { in: categoryIds } },
            select: { id: true, name: true },
          })
        : [];
    const nameById: Record<number, string> = {};
    for (const c of categories) {
      nameById[c.id] = String(c.name);
    }

    const byCategory: Record<
      number,
      { categoryId: number; name: string; minutes: number }
    > = {};

    for (const e of entries) {
      const startMs = e.startTime instanceof Date ? e.startTime.getTime() : new Date(e.startTime).getTime();
      const minutes =
        e.durationMinutes ??
        Math.round((now.getTime() - startMs) / 60000);
      const key = e.categoryId;
      const categoryName = nameById[key] ?? 'Без категории';
      if (!byCategory[key]) {
        byCategory[key] = {
          categoryId: e.categoryId,
          name: categoryName,
          minutes: 0,
        };
      }
      byCategory[key].minutes += minutes;
    }

    const totalMinutes = Object.values(byCategory).reduce(
      (sum, c) => sum + c.minutes,
      0,
    );

    res.json({
      range,
      from: from.toISOString(),
      to: now.toISOString(),
      totalMinutes,
      byCategory: Object.values(byCategory),
    });
  } catch (err) {
    console.error('Summary error:', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Summary failed',
    });
  }
});

// Tasks (daily planner) — возвращаем плоский список; даты сериализуем в ISO
app.get('/api/tasks', async (req, res) => {
  const { date, filter, categoryId } = req.query as {
    date?: string;
    filter?: string;
    categoryId?: string;
  };
  const mode = filter ?? 'today';
  const where: any = {};
  const baseDate = date ? new Date(date) : new Date();
  const { start, end } = toDayBounds(baseDate);

  if (mode === 'today') {
    where.OR = [{ date: { gte: start, lte: end } }, { date: null }];
    where.status = { not: 'done' };
  } else if (mode === 'done') {
    where.status = 'done';
  } else if (mode === 'overdue') {
    where.dueDate = { lt: start };
    where.status = { not: 'done' };
  }
  if (categoryId && categoryId !== 'all') {
    where.taskCategoryId = Number(categoryId);
  }

  const rows = await prisma.task.findMany({
    where,
    orderBy: [{ priority: 'desc' }, { id: 'asc' }],
    include: {
      taskCategory: { select: { id: true, name: true, color: true, type: true } },
    },
  });
  res.json(rows.map(serializeTask));
});

app.post('/api/tasks', async (req, res) => {
  const {
    title,
    description,
    date,
    dueDate,
    priority,
    projectId,
    parentTaskId,
    taskCategoryId,
  } = req.body;
  if (!title || typeof title !== 'string') {
    res.status(400).json({ error: 'title is required' });
    return;
  }

  const task = await prisma.task.create({
    data: {
      title,
      description: description ?? null,
      date: date ? new Date(date) : null,
      dueDate: dueDate ? new Date(dueDate) : null,
      priority: clampPriority(priority),
      projectId: projectId ?? null,
      parentTaskId: parentTaskId ?? null,
      estimatedMinutes: req.body.estimatedMinutes ?? null,
      taskCategoryId: taskCategoryId ?? null,
    },
    include: {
      taskCategory: { select: { id: true, name: true, color: true, type: true } },
    },
  });
  res.status(201).json(serializeTask(task));
});

app.get('/api/tasks/:id', async (req, res) => {
  const id = Number(req.params.id);
  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      taskCategory: { select: { id: true, name: true, color: true, type: true } },
      subtasks: {
        include: {
          taskCategory: { select: { id: true, name: true, color: true, type: true } },
        },
        orderBy: [{ status: 'asc' }, { id: 'asc' }],
      },
    },
  });
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  res.json({
    ...serializeTask(task),
    subtasks: task.subtasks.map((sub) => serializeTask(sub)),
  });
});

app.patch('/api/tasks/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { title, description, status, priority, dueDate, taskCategoryId } = req.body;
  const data: {
    title?: string;
    description?: string | null;
    status?: string;
    priority?: number;
    dueDate?: Date | null;
    taskCategoryId?: number | null;
  } = {};
  if (title !== undefined) data.title = title;
  if (description !== undefined) data.description = description ?? null;
  if (status !== undefined) data.status = status;
  if (priority !== undefined) data.priority = clampPriority(priority);
  if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;
  if (taskCategoryId !== undefined) data.taskCategoryId = taskCategoryId ? Number(taskCategoryId) : null;
  const task = await prisma.task.update({
    where: { id },
    data,
    include: {
      taskCategory: { select: { id: true, name: true, color: true, type: true } },
    },
  });
  res.json(serializeTask(task));
});

app.delete('/api/tasks/:id', async (req, res) => {
  const id = Number(req.params.id);
  await prisma.task.delete({ where: { id } });
  res.status(204).send();
});

app.get('/api/dashboard', async (req, res) => {
  const dateRaw = typeof req.query.date === 'string' ? req.query.date : undefined;
  const day = dateRaw ? new Date(dateRaw) : new Date();
  const { start, end } = toDayBounds(day);

  const [tasks, entries] = await Promise.all([
    prisma.task.findMany({
      where: {
        OR: [{ date: { gte: start, lte: end } }, { date: null }],
      },
      select: { id: true, status: true },
    }),
    prisma.timeEntry.findMany({
      where: { startTime: { gte: start, lte: end } },
      select: { categoryId: true, durationMinutes: true, startTime: true, endTime: true },
    }),
  ]);

  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((t) => t.status === 'done').length;
  const totalMinutes = entries.reduce((sum, e) => {
    if (typeof e.durationMinutes === 'number') return sum + e.durationMinutes;
    if (e.endTime) return sum + Math.round((e.endTime.getTime() - e.startTime.getTime()) / 60000);
    return sum;
  }, 0);
  const hasLogsToday = entries.length > 0;

  const streakDays = hasLogsToday ? 1 : 0;

  res.json({
    date: start.toISOString().slice(0, 10),
    tasks: {
      total: totalTasks,
      done: doneTasks,
      remaining: Math.max(totalTasks - doneTasks, 0),
    },
    time: {
      totalMinutes,
      hasLogsToday,
    },
    streak: streakDays,
  });
});

// Habits
app.get('/api/habits', async (_req, res) => {
  const habits = await prisma.habit.findMany();
  res.json(habits);
});

app.post('/api/habits', async (req, res) => {
  const { name, description, frequency, targetPerPeriod, color } = req.body;
  const habit = await prisma.habit.create({
    data: { name, description, frequency, targetPerPeriod, color },
  });
  res.status(201).json(habit);
});

app.get('/api/habits/:id/logs', async (req, res) => {
  const habitId = Number(req.params.id);
  const logs = await prisma.habitLog.findMany({
    where: { habitId },
    orderBy: { date: 'desc' },
  });
  res.json(logs);
});

app.post('/api/habits/:id/logs', async (req, res) => {
  const habitId = Number(req.params.id);
  const { value, note } = req.body;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const log = await prisma.habitLog.upsert({
    where: {
      habitId_date: {
        habitId,
        date: today,
      },
    },
    update: { value, note },
    create: { habitId, date: today, value, note },
  });
  res.status(201).json(log);
});

// Mood
app.get('/api/mood', async (req, res) => {
  const { from, to } = req.query;
  const where: any = {};
  if (from || to) {
    where.dateTime = {};
    if (from) where.dateTime.gte = new Date(from as string);
    if (to) where.dateTime.lte = new Date(to as string);
  }
  const entries = await prisma.moodEntry.findMany({
    where,
    orderBy: { dateTime: 'desc' },
  });
  res.json(entries);
});

app.post('/api/mood', async (req, res) => {
  const { moodScore, tags, note } = req.body;
  const entry = await prisma.moodEntry.create({
    data: { moodScore, tags, note, dateTime: new Date() },
  });
  res.status(201).json(entry);
});

// Goals & projects
app.get('/api/goals', async (_req, res) => {
  const goals = await prisma.goal.findMany({
    include: { milestones: true },
  });
  res.json(goals);
});

app.post('/api/goals', async (req, res) => {
  const {
    title,
    description,
    category,
    specific,
    measurable,
    achievable,
    relevant,
    timeBound,
    dueDate,
  } = req.body;
  const goal = await prisma.goal.create({
    data: {
      title,
      description,
      category,
      specific,
      measurable,
      achievable,
      relevant,
      timeBound,
      dueDate: dueDate ? new Date(dueDate) : null,
    },
  });
  res.status(201).json(goal);
});

app.patch('/api/goals/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body;
  const goal = await prisma.goal.update({
    where: { id },
    data: { status },
  });
  res.json(goal);
});

app.get('/api/projects', async (_req, res) => {
  const projects = await prisma.project.findMany();
  res.json(projects);
});

app.post('/api/projects', async (req, res) => {
  const { name, description, startDate, dueDate, color } = req.body;
  const project = await prisma.project.create({
    data: {
      name,
      description,
      startDate: startDate ? new Date(startDate) : null,
      dueDate: dueDate ? new Date(dueDate) : null,
      color,
    },
  });
  res.status(201).json(project);
});

const PORT = process.env.PORT || 4000;

// Все необработанные ошибки — JSON, а не HTML
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('API error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`API server listening on port ${PORT}`);
});
