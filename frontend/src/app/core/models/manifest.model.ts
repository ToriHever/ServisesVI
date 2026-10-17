export type InputKind = 'file' | 'text' | 'select' | 'flag' | 'date';

export interface ManifestInput {
  key: string;
  label: string;
  kind: InputKind;
  path?: string;
  required?: boolean;
  options?: string[];
  flag?: string;
  /** For kind=="file" cookie inputs: shared key the backend stores one global value under. */
  cookieKey?: string;
}

export type BlockingKind = 'manual-captcha' | 'manual-login' | 'notepad-edit' | 'interactive-menu';

export interface ScriptManifest {
  id: string;
  name: string;
  description: string;
  cwd: string;
  command: string;
  args: string[];
  install: { needed: boolean; command?: string };
  inputs: ManifestInput[];
  env: { name: string; required: boolean; file: string }[];
  outputs: { path: string; kind: string; description?: string }[];
  execution: {
    headless: boolean;
    interactive: boolean;
    blocking: BlockingKind[];
    resumable: boolean;
  };
  knownIssues: string[];
}
