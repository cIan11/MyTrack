import { useEffect, useState } from 'react';
import { API_BASE_URL } from '@/constants/api';

export type ActivityCategory = {
  id: number;
  name: string;
  color: string;
  description?: string | null;
  type: string;
};

export function useActivityCategories() {
  const [categories, setCategories] = useState<ActivityCategory[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/activity-categories`);
      if (!res.ok) {
        console.error('Failed to load categories', await res.text());
        return;
      }
      const data = await res.json();
      setCategories(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Network error while loading categories', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  return { categories, loading, refresh };
}
