import { useEffect, useState } from 'react';
import { API_BASE_URL } from '@/constants/api';

export type ActivityCategory = {
  id: number;
  name: string;
  color: string;
  description?: string | null;
  type: string;
};

export type TimeEntry = {
  id: number;
  categoryId: number;
  taskId?: number | null;
  startTime: string;
  endTime?: string | null;
  durationMinutes?: number | null;
  notes?: string | null;
  category?: ActivityCategory;
};

type Summary = {
  range: string | null;
  from: string;
  to: string;
  totalMinutes: number;
  byCategory: { categoryId: number; name: string; minutes: number }[];
};

type CreateManualEntryInput = {
  categoryId: number;
  startTime: string;
  endTime: string;
  taskId?: number | null;
  notes?: string;
};

const DEFAULT_CATEGORIES = [
  { name: 'Работа', color: '#2563eb', type: 'work' },
  { name: 'Учеба', color: '#16a34a', type: 'study' },
  { name: 'Полезный досуг', color: '#0891b2', type: 'leisure' },
  { name: 'Дом', color: '#f59e0b', type: 'home' },
  { name: 'Здоровье', color: '#dc2626', type: 'health' },
  { name: 'Потерянное время', color: '#6b7280', type: 'wasted' },
] as const;

export function useTimeTracker() {
  const [categories, setCategories] = useState<ActivityCategory[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [activeEntry, setActiveEntry] = useState<TimeEntry | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const fetchCategories = async (): Promise<ActivityCategory[]> => {
    try {
      setLastError(null);
      const res = await fetch(`${API_BASE_URL}/api/activity-categories`);
      if (!res.ok) {
        const text = await res.text();
        const msg = `Категории: ${res.status} ${res.statusText}${text ? ` — ${text.slice(0, 200)}` : ''}`;
        setLastError(msg);
        console.error('Failed to load categories', msg);
        return [];
      }
      const data = await res.json();
      const list = Array.isArray(data)
        ? data.filter(
            (c: unknown): c is ActivityCategory =>
              c != null &&
              typeof c === 'object' &&
              'id' in c &&
              'name' in c &&
              typeof (c as ActivityCategory).name === 'string',
          )
        : [];
      setCategories(list);
      return list;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLastError(`Сеть (категории): ${msg}`);
      console.error('Network error while loading categories', e);
      return [];
    }
  };

  const fetchEntries = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/time-entries`);
      if (!res.ok) {
        console.error('Failed to load time entries', await res.text());
        return;
      }
      const data = await res.json();
      const list: TimeEntry[] = Array.isArray(data) ? data : [];
      setEntries(list);
      const active = list.find((e) => !e.endTime);
      setActiveEntry(active ?? null);
    } catch (e) {
      console.error('Network error while loading time entries', e);
    }
  };

  const fetchSummary = async (range: 'day' | 'week' | 'month' = 'day') => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/time-entries/summary?range=${range}`);
      if (!res.ok) {
        const text = await res.text();
        const msg = `Сводка: ${res.status} ${res.statusText}${text ? ` — ${text.slice(0, 200)}` : ''}`;
        setLastError((prev) => prev || msg);
        setSummary(null);
        return;
      }
      setLastError(null);
      const data = await res.json();
      if (data && typeof data.totalMinutes === 'number' && Array.isArray(data.byCategory)) {
        setSummary(data as Summary);
      } else {
        setSummary(null);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLastError((prev) => prev || `Сеть (сводка): ${msg}`);
      setSummary(null);
    }
  };

  const ensureDefaultCategories = async () => {
    const list = await fetchCategories();
    if (list.length > 0) {
      return;
    }

    for (const c of DEFAULT_CATEGORIES) {
      try {
        const res = await fetch(`${API_BASE_URL}/api/activity-categories`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...c, description: null }),
        });
        if (!res.ok) {
          console.error('Failed to create category', await res.text());
        }
      } catch (e) {
        console.error('Error creating default category', e);
      }
    }

    await fetchCategories();
  };

  const start = async (
    categoryId: number,
    options?: { taskId?: number; notes?: string },
  ) => {
    if (!categoryId) {
      setLastError('Категория обязательна для запуска таймера.');
      return false;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/time-entries/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryId,
          notes: options?.notes,
          taskId: options?.taskId ?? undefined,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        setLastError(text || 'Не удалось запустить таймер');
        return false;
      }
      const data: TimeEntry = await res.json();
      setActiveEntry(data);
      await fetchEntries();
      await fetchSummary();
      return true;
    } catch (e) {
      setLastError(e instanceof Error ? e.message : 'Ошибка сети');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const attachTask = async (entryId: number, taskId: number | null) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/time-entries/${entryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId }),
      });
      if (!res.ok) {
        console.error('Failed to attach task', await res.text());
        return false;
      }
      const updated: TimeEntry = await res.json();
      if (activeEntry?.id === entryId) setActiveEntry(updated);
      await fetchEntries();
      await fetchSummary();
      return true;
    } catch (e) {
      console.error('Error attaching task', e);
      return false;
    }
  };

  const createManualEntry = async (payload: CreateManualEntryInput) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/time-entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setLastError(await res.text());
        return false;
      }
      setLastError(null);
      await fetchEntries();
      await fetchSummary();
      return true;
    } catch (e) {
      setLastError(e instanceof Error ? e.message : 'Ошибка сети');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const updateEntry = async (
    entryId: number,
    patch: Partial<{
      categoryId: number;
      taskId: number | null;
      startTime: string;
      endTime: string;
      notes: string | null;
    }>,
  ) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/time-entries/${entryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        setLastError(await res.text());
        return false;
      }
      await fetchEntries();
      await fetchSummary();
      return true;
    } catch (e) {
      setLastError(e instanceof Error ? e.message : 'Ошибка сети');
      return false;
    }
  };

  const deleteEntry = async (entryId: number) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/time-entries/${entryId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        setLastError(await res.text());
        return false;
      }
      await fetchEntries();
      await fetchSummary();
      return true;
    } catch (e) {
      setLastError(e instanceof Error ? e.message : 'Ошибка сети');
      return false;
    }
  };

  const stop = async (taskId?: number | null): Promise<TimeEntry | null> => {
    if (!activeEntry) return null;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/time-entries/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: taskId ?? undefined }),
      });
      if (!res.ok) {
        setLastError(await res.text());
        return null;
      }
      const stopped: TimeEntry = await res.json();
      setActiveEntry(null);
      await fetchEntries();
      await fetchSummary();
      return stopped;
    } catch (e) {
      setLastError(e instanceof Error ? e.message : 'Ошибка сети');
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      await ensureDefaultCategories();
      await fetchEntries();
      await fetchSummary();
    })();
  }, []);

  const checkApiHealth = async (): Promise<{ ok: boolean; message: string }> => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/health`);
      if (res.ok) {
        setLastError(null);
        return { ok: true, message: 'API доступен' };
      }
      const text = await res.text();
      return { ok: false, message: `${res.status}: ${text.slice(0, 100)}` };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, message: msg };
    }
  };

  return {
    categories,
    entries,
    activeEntry,
    summary,
    loading,
    lastError,
    start,
    stop,
    attachTask,
    createManualEntry,
    updateEntry,
    deleteEntry,
    checkApiHealth,
    refresh: async () => {
      setLastError(null);
      await fetchEntries();
      await fetchSummary();
    },
    refreshAll: async () => {
      setLastError(null);
      await ensureDefaultCategories();
      await fetchEntries();
      await fetchSummary();
    },
  };
}
