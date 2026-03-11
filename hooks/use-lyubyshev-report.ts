import { useEffect, useState } from 'react';
import { API_BASE_URL } from '@/constants/api';

export type LyubyshevRange = 'day' | 'week' | 'month';

export type LyubyshevRow = {
  categoryId: number;
  name: string;
  plannedMinutes: number;
  actualMinutes: number;
};

export type LyubyshevReport = {
  range: string;
  from: string;
  to: string;
  totalPlanned: number;
  totalActual: number;
  byCategory: LyubyshevRow[];
};

export function useLyubyshevReport(range: LyubyshevRange, date: Date) {
  const [report, setReport] = useState<LyubyshevReport | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/reports?range=${range}&date=${date
          .toISOString()
          .slice(0, 10)}`,
      );
      if (!res.ok) {
        console.error('Failed to load report', await res.text());
        return;
      }
      const data: LyubyshevReport = await res.json();
      setReport(data);
    } catch (e) {
      console.error('Network error while loading report', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, date.toISOString().slice(0, 10)]);

  return { report, loading, refresh: fetchReport };
}

