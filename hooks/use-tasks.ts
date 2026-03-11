import { useEffect, useMemo, useState } from 'react';
import { API_BASE_URL } from '@/constants/api';

export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'archived';

export type TaskFilter = 'today' | 'overdue' | 'done' | 'all';

export type Task = {
  id: number;
  title: string;
  description?: string | null;
  date?: string | null;
  dueDate?: string | null;
  status: TaskStatus;
  priority: number;
  projectId?: number | null;
  parentTaskId?: number | null;
  estimatedMinutes?: number | null;
  actualMinutes?: number | null;
  taskCategoryId?: number | null;
  taskCategory?: {
    id: number;
    name: string;
    color: string;
    type: string;
  } | null;
};

/** Собрать дерево: корневые задачи и вложенные подзадачи */
export function tasksWithSubtasks(tasks: Task[]): { root: Task; subtasks: Task[] }[] {
  const roots = tasks.filter((t) => !t.parentTaskId);
  const byParent = new Map<number, Task[]>();
  for (const t of tasks) {
    if (t.parentTaskId != null) {
      const list = byParent.get(t.parentTaskId) ?? [];
      list.push(t);
      byParent.set(t.parentTaskId, list);
    }
  }
  return roots.map((root) => ({
    root,
    subtasks: byParent.get(root.id) ?? [],
  }));
}

export function useTasks(
  forDate: Date,
  filter: TaskFilter = 'today',
  options?: { categoryId?: number | 'all' },
) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);

  const dateParam = useMemo(() => forDate.toISOString().slice(0, 10), [forDate]);

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/tasks?date=${encodeURIComponent(dateParam)}&filter=${encodeURIComponent(filter)}&categoryId=${encodeURIComponent(String(options?.categoryId ?? 'all'))}`,
      );
      if (!res.ok) {
        console.error('Failed to load tasks', await res.text());
        return;
      }
      const data: Task[] = await res.json();
      setTasks(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  };

  const addTask = async (
    title: string,
    options?: {
      description?: string;
      priority?: number;
      parentTaskId?: number;
      dueDate?: string | null;
      estimatedMinutes?: number;
      taskCategoryId?: number | null;
    },
  ) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          date: dateParam,
          description: options?.description ?? null,
          priority: options?.priority ?? 0,
          parentTaskId: options?.parentTaskId ?? null,
          dueDate: options?.dueDate ?? null,
          estimatedMinutes: options?.estimatedMinutes ?? null,
          taskCategoryId: options?.taskCategoryId ?? null,
        }),
      });
      if (!res.ok) {
        console.error('Failed to create task', await res.text());
        return null;
      }
      const created: Task = await res.json();
      await fetchTasks();
      return created;
    } catch (e) {
      console.error('Network error while creating task', e);
      return null;
    }
  };

  const addSubtask = async (
    parentTaskId: number,
    title: string,
    options?: { description?: string; priority?: number; taskCategoryId?: number | null },
  ) => {
    return addTask(title, {
      description: options?.description,
      priority: options?.priority ?? 0,
      parentTaskId,
      taskCategoryId: options?.taskCategoryId ?? null,
    });
  };

  const updateTask = async (
    taskId: number,
    patch: Partial<Pick<Task, 'title' | 'description' | 'status' | 'priority' | 'dueDate' | 'taskCategoryId'>>,
  ) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        console.error('Failed to update task', await res.text());
        return null;
      }
      const updated: Task = await res.json();
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      return updated;
    } catch (e) {
      console.error('Network error while updating task', e);
      return null;
    }
  };

  const toggleTask = async (task: Task) => {
    const newStatus: TaskStatus = task.status === 'done' ? 'todo' : 'done';
    await updateTask(task.id, { status: newStatus });
  };

  const deleteTask = async (taskId: number) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/tasks/${taskId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        console.error('Failed to delete task', await res.text());
        return false;
      }
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      return true;
    } catch (e) {
      console.error('Network error while deleting task', e);
      return false;
    }
  };

  useEffect(() => {
    fetchTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateParam, filter, options?.categoryId]);

  return {
    tasks,
    loading,
    addTask,
    addSubtask,
    updateTask,
    toggleTask,
    deleteTask,
    refresh: fetchTasks,
  };
}
