import { useEffect, useState } from 'react';
import { API_BASE_URL } from '@/constants/api';

export type Habit = {
  id: number;
  name: string;
  description?: string | null;
  frequency: string;
  targetPerPeriod?: number | null;
  color?: string | null;
};

export type HabitLog = {
  id: number;
  habitId: number;
  date: string;
  value?: number | null;
  note?: string | null;
};

export function useHabits() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [logs, setLogs] = useState<Record<number, HabitLog | null>>({});
  const [loading, setLoading] = useState(false);

  const fetchHabits = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/habits`);
      if (!res.ok) {
        console.error('Failed to load habits', await res.text());
        return;
      }
      const data: Habit[] = await res.json();
      setHabits(data);
    } catch (e) {
      console.error('Network error while loading habits', e);
    }
  };

  const fetchLogForHabit = async (habitId: number) => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/habits/${habitId}/logs`,
      );
      if (!res.ok) {
        console.error('Failed to load habit logs', await res.text());
        return;
      }
      const data: HabitLog[] = await res.json();
      const today = new Date().toISOString().slice(0, 10);
      const todayLog =
        data.find((l) => l.date.slice(0, 10) === today) ?? null;
      setLogs((prev) => ({ ...prev, [habitId]: todayLog }));
    } catch (e) {
      console.error('Network error while loading habit logs', e);
    }
  };

  const toggleToday = async (habitId: number) => {
    const existing = logs[habitId];
    const newValue = existing && existing.value === 1 ? 0 : 1;
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/habits/${habitId}/logs`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: newValue }),
        },
      );
      if (!res.ok) {
        console.error('Failed to update habit log', await res.text());
        return;
      }
      const updated: HabitLog = await res.json();
      setLogs((prev) => ({ ...prev, [habitId]: updated }));
    } catch (e) {
      console.error('Network error while updating habit log', e);
    }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await fetchHabits();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    habits.forEach((h) => {
      fetchLogForHabit(h.id).catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [habits.length]);

  return { habits, logs, loading, toggleToday };
}

