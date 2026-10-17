import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ManifestsService } from '../manifests/manifests.service.js';

export interface CookieKeyInfo {
  key: string;
  scripts: string[];
  hasValue: boolean;
  updatedAt: string | null;
}

@Injectable()
export class CookiesService {
  private readonly vaultDir: string;

  constructor(
    private readonly config: ConfigService,
    private readonly manifests: ManifestsService
  ) {
    this.vaultDir = this.config.get<string>('COOKIE_VAULT_DIR', './data/cookies');
  }

  private pathFor(key: string): string {
    // cookie keys come only from our own manifests (domain-like strings), never from
    // request input, so this is safe without extra sanitization.
    return join(this.vaultDir, `${key}.json`);
  }

  async list(): Promise<CookieKeyInfo[]> {
    const known = this.manifests.listCookieKeys();
    return Promise.all(
      known.map(async ({ key, scripts }) => {
        try {
          const info = await stat(this.pathFor(key));
          return { key, scripts, hasValue: true, updatedAt: info.mtime.toISOString() };
        } catch {
          return { key, scripts, hasValue: false, updatedAt: null };
        }
      })
    );
  }

  async get(key: string): Promise<string | null> {
    try {
      return await readFile(this.pathFor(key), 'utf-8');
    } catch {
      return null;
    }
  }

  async set(key: string, content: string): Promise<void> {
    await mkdir(this.vaultDir, { recursive: true });
    await writeFile(this.pathFor(key), content, 'utf-8');
  }
}
