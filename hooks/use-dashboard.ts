import { useEffect, useMemo, useState } from 'react';
import { API_BASE_URL } from '@/constants/api';

type DashboardSummary = {
  date: string;
  tasks: {
    total: number;
    done: number;
    remaining: number;
  };
  time: {
    totalMinutes: number;
    hasLogsToday: boolean;
  };
  streak: number;
};

export function useDashboard(forDate: Date) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dateParam = useMemo(() => forDate.toISOString().slice(0, 10), [forDate]);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboard?date=${encodeURIComponent(dateParam)}`);
      if (!res.ok) {
        setError(await res.text());
        return;
      }
      const data = (await res.json()) as DashboardSummary;
      setSummary(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сети');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateParam]);

  return { summary, loading, error, refresh };
}
