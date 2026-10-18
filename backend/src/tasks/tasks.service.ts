import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { mkdir, readdir, readFile, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { ManifestsService } from '../manifests/manifests.service.js';

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

const NAME_PATTERN = /^[\p{L}\p{N} _.-]+$/u;

@Injectable()
export class TasksService {
  constructor(private readonly manifests: ManifestsService) {}

  private getRoot(scriptId: string): string {
    const manifest = this.manifests.findOne(scriptId);
    if (!manifest.taskFolders) {
      throw new NotFoundException(`У скрипта "${scriptId}" нет менеджера задач`);
    }
    return join(this.manifests.resolveScriptCwd(manifest), manifest.taskFolders);
  }

  private sanitizeName(name: string): string {
    const trimmed = name.trim();
    if (!trimmed || !NAME_PATTERN.test(trimmed) || trimmed.includes('..')) {
      throw new BadRequestException('Недопустимое имя — разрешены буквы, цифры, пробел, "-", "_", "."');
    }
    return trimmed;
  }

  /** Resolves a task (or file-within-task) path, refusing anything outside the task root. */
  private resolveSafe(root: string, ...segments: string[]): string {
    const target = resolve(root, ...segments);
    const safeRoot = resolve(root);
    if (target !== safeRoot && !target.startsWith(safeRoot + sep)) {
      throw new BadRequestException('Недопустимый путь');
    }
    return target;
  }

  async list(scriptId: string): Promise<TaskSummary[]> {
    const root = this.getRoot(scriptId);
    let entries;
    try {
      entries = await readdir(root, { withFileTypes: true });
    } catch {
      return [];
    }

    const summaries: TaskSummary[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const files = await this.listFiles(scriptId, entry.name);
      let updatedAt: string | null = null;
      for (const f of files) {
        if (!updatedAt || f.modifiedAt > updatedAt) updatedAt = f.modifiedAt;
      }
      summaries.push({
        name: entry.name,
        hasOwn: files.some((f) => f.role === 'own'),
        hasQuery: files.some((f) => f.role === 'query'),
        competitorCount: files.filter((f) => f.role === 'competitor').length,
        updatedAt
      });
    }
    return summaries.sort((a, b) => a.name.localeCompare(b.name));
  }

  async create(scriptId: string, name: string): Promise<void> {
    const safeName = this.sanitizeName(name);
    const root = this.getRoot(scriptId);
    const dir = this.resolveSafe(root, safeName);
    if (existsSync(dir)) {
      throw new BadRequestException(`Задача "${safeName}" уже существует`);
    }
    await mkdir(dir, { recursive: true });
  }

  async remove(scriptId: string, taskName: string): Promise<void> {
    const root = this.getRoot(scriptId);
    const dir = this.resolveSafe(root, this.sanitizeName(taskName));
    await rm(dir, { recursive: true, force: true });
  }

  async listFiles(scriptId: string, taskName: string): Promise<TaskFile[]> {
    const root = this.getRoot(scriptId);
    const dir = this.resolveSafe(root, this.sanitizeName(taskName));
    let names: string[];
    try {
      names = await readdir(dir);
    } catch {
      return [];
    }

    const files: TaskFile[] = [];
    for (const name of names) {
      const info = await stat(join(dir, name));
      if (!info.isFile()) continue;
      const lower = name.toLowerCase();
      const role: TaskFileRole = lower.startsWith('own.') ? 'own' : lower === 'query.txt' ? 'query' : 'competitor';
      files.push({ name, role, size: info.size, modifiedAt: info.mtime.toISOString() });
    }
    return files;
  }

  async saveOwn(scriptId: string, taskName: string, content: Buffer): Promise<void> {
    const root = this.getRoot(scriptId);
    const dir = this.resolveSafe(root, this.sanitizeName(taskName));
    if (!existsSync(dir)) throw new NotFoundException(`Задача "${taskName}" не найдена`);
    await this.removeByRole(dir, 'own');
    await writeFile(join(dir, 'own.txt'), content);
  }

  async getQuery(scriptId: string, taskName: string): Promise<string> {
    const root = this.getRoot(scriptId);
    const dir = this.resolveSafe(root, this.sanitizeName(taskName));
    const target = join(dir, 'query.txt');
    if (!existsSync(target)) return '';
    return readFile(target, 'utf-8');
  }

  async saveQuery(scriptId: string, taskName: string, text: string): Promise<void> {
    const root = this.getRoot(scriptId);
    const dir = this.resolveSafe(root, this.sanitizeName(taskName));
    if (!existsSync(dir)) throw new NotFoundException(`Задача "${taskName}" не найдена`);
    const target = join(dir, 'query.txt');
    if (text.trim()) {
      await writeFile(target, text, 'utf-8');
    } else if (existsSync(target)) {
      await unlink(target);
    }
  }

  async saveCompetitors(
    scriptId: string,
    taskName: string,
    files: { originalname: string; buffer: Buffer }[]
  ): Promise<void> {
    const root = this.getRoot(scriptId);
    const dir = this.resolveSafe(root, this.sanitizeName(taskName));
    if (!existsSync(dir)) throw new NotFoundException(`Задача "${taskName}" не найдена`);

    const existing = new Set((await readdir(dir)).map((f) => f.toLowerCase()));
    for (const file of files) {
      const base = file.originalname.replace(/\.(html?|txt)$/i, '').trim() || 'competitor';
      let candidate = `${base}.txt`;
      let i = 2;
      while (existing.has(candidate.toLowerCase()) || candidate.toLowerCase() === 'own.txt' || candidate.toLowerCase() === 'query.txt') {
        candidate = `${base} (${i}).txt`;
        i++;
      }
      existing.add(candidate.toLowerCase());
      await writeFile(join(dir, candidate), file.buffer);
    }
  }

  async deleteFile(scriptId: string, taskName: string, fileName: string): Promise<void> {
    const root = this.getRoot(scriptId);
    const dir = this.resolveSafe(root, this.sanitizeName(taskName));
    const target = this.resolveSafe(dir, fileName);
    await unlink(target);
  }

  private async removeByRole(dir: string, role: TaskFileRole): Promise<void> {
    const names = await readdir(dir);
    for (const name of names) {
      const lower = name.toLowerCase();
      const matches = role === 'own' ? lower.startsWith('own.') : role === 'query' ? lower === 'query.txt' : false;
      if (matches) await unlink(join(dir, name));
    }
  }
}
