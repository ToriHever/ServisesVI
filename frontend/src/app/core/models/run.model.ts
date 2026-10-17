export type RunStatus = 'running' | 'finished' | 'failed' | 'stopped';

export interface RunSummary {
  id: string;
  scriptId: string;
  status: RunStatus;
  startedAt: string;
}

export interface RunHistoryRecord {
  id: string;
  scriptId: string;
  status: RunStatus;
  startedAt: string;
  finishedAt: string | null;
  exitCode: number | null;
  paramsJson: string;
  log: string;
}

export interface RunLogEvent {
  type: 'log' | 'status' | 'exit';
  stream?: 'stdout' | 'stderr';
  text?: string;
  status?: RunStatus;
  exitCode?: number | null;
  at: string;
}
