import { useEffect, useState } from 'react';
import { API_BASE_URL } from '@/constants/api';

export type Goal = {
  id: number;
  title: string;
  description?: string | null;
  category?: string | null;
  status: string;
};

export function useGoals() {
  const [goals, setGoals] = useState<Goal[]>([]);

  const fetchGoals = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/goals`);
      if (!res.ok) {
        console.error('Failed to load goals', await res.text());
        return;
      }
      const data: Goal[] = await res.json();
      setGoals(data);
    } catch (e) {
      console.error('Network error while loading goals', e);
    }
  };

  const addGoal = async (title: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/goals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) {
        console.error('Failed to create goal', await res.text());
        return;
      }
      const g: Goal = await res.json();
      setGoals((prev) => [g, ...prev]);
    } catch (e) {
      console.error('Network error while creating goal', e);
    }
  };

  useEffect(() => {
    fetchGoals();
  }, []);

  return { goals, addGoal, refresh: fetchGoals };
}

