import { useEffect, useState } from 'react';
import { API_BASE_URL } from '@/constants/api';

export type Project = {
  id: number;
  name: string;
  description?: string | null;
  status: string;
};

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);

  const fetchProjects = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/projects`);
      if (!res.ok) {
        console.error('Failed to load projects', await res.text());
        return;
      }
      const data: Project[] = await res.json();
      setProjects(data);
    } catch (e) {
      console.error('Network error while loading projects', e);
    }
  };

  const addProject = async (name: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        console.error('Failed to create project', await res.text());
        return;
      }
      const p: Project = await res.json();
      setProjects((prev) => [p, ...prev]);
    } catch (e) {
      console.error('Network error while creating project', e);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  return { projects, addProject, refresh: fetchProjects };
}

