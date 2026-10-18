export interface TaskSummary {
  name: string;
  hasOwn: boolean;
  hasQuery: boolean;
  competitorCount: number;
  updatedAt: string | null;
}

export type TaskFileRole = 'own' | 'query' | 'competitor';

export interface TaskFile {
  name: string;
  role: TaskFileRole;
  size: number;
  modifiedAt: string;
}
