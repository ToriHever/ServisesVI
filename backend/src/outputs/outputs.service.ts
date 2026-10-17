import { Injectable, NotFoundException } from '@nestjs/common';
import { readdir, stat } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { ManifestsService } from '../manifests/manifests.service.js';
import type { ScriptManifest } from '../manifests/manifest.types.js';

export interface OutputFile {
  path: string;
  size: number;
  modifiedAt: string;
}

interface OutputSpec {
  type: 'file' | 'dir';
  relPath: string;
}

const MAX_FILES = 500;
const MAX_DEPTH = 6;
const SAFE_SEGMENT = /^[\w.\- ]+$/;
const TEMPLATE_MARKER = /[<[*(]/;

@Injectable()
export class OutputsService {
  constructor(private readonly manifests: ManifestsService) {}

  /**
   * Manifests describe outputs loosely ("results/<engine>/results.csv", "Clarity.csv",
   * "debug/"). A literal path (no template markers) is checked directly — this matters for
   * scripts that write straight into their own cwd, where a broad recursive listing would
   * also surface the script's own source files. Only a path with a dedicated subfolder
   * (derived up to the first template marker, or stated outright with a trailing "/") gets
   * walked recursively.
   */
  private resolveSpecs(manifest: ScriptManifest): OutputSpec[] {
    const specs: OutputSpec[] = [];
    const seenDirs = new Set<string>();

    for (const output of manifest.outputs) {
      const path = output.path;

      if (!TEMPLATE_MARKER.test(path)) {
        if (path.endsWith('/')) {
          const dir = path.replace(/\/+$/, '');
          if (dir && !seenDirs.has(dir)) {
            seenDirs.add(dir);
            specs.push({ type: 'dir', relPath: dir });
          }
        } else {
          specs.push({ type: 'file', relPath: path });
        }
        continue;
      }

      const specialIdx = path.search(TEMPLATE_MARKER);
      const base = path.slice(0, specialIdx);
      const slashIdx = base.lastIndexOf('/');
      if (slashIdx === -1) continue; // template marker in the cwd root itself — nothing safe to walk
      const dir = base.slice(0, slashIdx);
      if (seenDirs.has(dir)) continue;
      const segments = dir.split('/').filter(Boolean);
      if (!segments.every((s) => SAFE_SEGMENT.test(s))) continue;
      seenDirs.add(dir);
      specs.push({ type: 'dir', relPath: dir });
    }
    return specs;
  }

  async list(scriptId: string): Promise<OutputFile[]> {
    const manifest = this.manifests.findOne(scriptId);
    const scriptCwd = this.manifests.resolveScriptCwd(manifest);
    const specs = this.resolveSpecs(manifest);

    const files: OutputFile[] = [];
    for (const spec of specs) {
      const full = join(scriptCwd, spec.relPath);
      if (spec.type === 'file') {
        try {
          const info = await stat(full);
          if (info.isFile()) {
            files.push({ path: spec.relPath, size: info.size, modifiedAt: info.mtime.toISOString() });
          }
        } catch {
          // output not produced yet
        }
      } else {
        await this.walk(full, scriptCwd, files, 0);
      }
    }
    files.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
    return files.slice(0, MAX_FILES);
  }

  private async walk(dir: string, scriptCwd: string, out: OutputFile[], depth: number): Promise<void> {
    if (depth > MAX_DEPTH || out.length >= MAX_FILES) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (out.length >= MAX_FILES) return;
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await this.walk(full, scriptCwd, out, depth + 1);
      } else if (entry.isFile()) {
        const info = await stat(full);
        out.push({
          path: relative(scriptCwd, full).split(sep).join('/'),
          size: info.size,
          modifiedAt: info.mtime.toISOString()
        });
      }
    }
  }

  /** Resolves a requested relative path to an absolute one, refusing anything outside the script's cwd. */
  resolveDownloadPath(scriptId: string, relativePath: string): string {
    const manifest = this.manifests.findOne(scriptId);
    const scriptCwd = resolve(this.manifests.resolveScriptCwd(manifest));
    const target = resolve(scriptCwd, relativePath);
    if (target !== scriptCwd && !target.startsWith(scriptCwd + sep)) {
      throw new NotFoundException('Файл не найден');
    }
    return target;
  }
}
