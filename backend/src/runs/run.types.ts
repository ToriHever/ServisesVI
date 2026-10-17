export type RunStatus = 'running' | 'finished' | 'failed' | 'stopped';

export interface StartRunDto {
  scriptId: string;
  /** Values keyed by manifest input.key. For kind "file" this is the file's text content. */
  inputs?: Record<string, string>;
}

export interface SendInputDto {
  text: string;
}

export interface RunLogEvent {
  type: 'log' | 'status' | 'exit';
  stream?: 'stdout' | 'stderr';
  text?: string;
  status?: RunStatus;
  exitCode?: number | null;
  at: string;
}
