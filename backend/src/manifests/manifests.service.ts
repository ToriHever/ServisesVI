import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ManifestIndexEntry, ScriptManifest } from './manifest.types.js';

@Injectable()
export class ManifestsService implements OnModuleInit {
  private readonly manifestsDir: string;
  private cache = new Map<string, ScriptManifest>();

  constructor(private readonly config: ConfigService) {
    const scriptsDir = this.config.get<string>('SCRIPTS_DIR', '../scripts');
    this.manifestsDir = join(scriptsDir, 'manifests');
  }

  async onModuleInit() {
    await this.reload();
  }

  getScriptsDir(): string {
    return this.config.get<string>('SCRIPTS_DIR', '../scripts');
  }

  async reload(): Promise<void> {
    const indexRaw = await readFile(join(this.manifestsDir, 'index.json'), 'utf-8');
    const index = JSON.parse(indexRaw) as { scripts: ManifestIndexEntry[] };

    const next = new Map<string, ScriptManifest>();
    for (const entry of index.scripts) {
      const raw = await readFile(join(this.manifestsDir, entry.file), 'utf-8');
      const manifest = JSON.parse(raw) as ScriptManifest;
      next.set(manifest.id, manifest);
    }
    this.cache = next;
  }

  findAll(): ScriptManifest[] {
    return [...this.cache.values()];
  }

  findOne(id: string): ScriptManifest {
    const manifest = this.cache.get(id);
    if (!manifest) {
      throw new NotFoundException(`Манифест "${id}" не найден`);
    }
    return manifest;
  }

  resolveScriptCwd(manifest: ScriptManifest): string {
    return join(this.getScriptsDir(), manifest.cwd);
  }
}
