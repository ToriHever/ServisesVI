export type InputKind = 'file' | 'text' | 'select' | 'flag' | 'date';

export interface ManifestInput {
  key: string;
  label: string;
  kind: InputKind;
  path?: string;
  required?: boolean;
  options?: string[];
  flag?: string;
}

export interface ManifestEnvVar {
  name: string;
  required: boolean;
  file: string;
}

export interface ManifestOutput {
  path: string;
  kind: string;
  description?: string;
}

export type BlockingKind = 'manual-captcha' | 'manual-login' | 'notepad-edit' | 'interactive-menu';

export interface ManifestExecution {
  headless: boolean;
  interactive: boolean;
  blocking: BlockingKind[];
  resumable: boolean;
}

export interface ScriptManifest {
  id: string;
  name: string;
  description: string;
  cwd: string;
  command: string;
  args: string[];
  install: { needed: boolean; command?: string };
  inputs: ManifestInput[];
  env: ManifestEnvVar[];
  outputs: ManifestOutput[];
  execution: ManifestExecution;
  knownIssues: string[];
}

export interface ManifestIndexEntry {
  id: string;
  file: string;
}
