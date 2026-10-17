import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { spawn, type ChildProcessByStdio } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { parse as parseDotenv } from 'dotenv';
import { Subject } from 'rxjs';
import type { Readable, Writable } from 'node:stream';
import { ManifestsService } from '../manifests/manifests.service.js';
import { HistoryService } from '../history/history.service.js';
import { CookiesService } from '../cookies/cookies.service.js';
import type { ScriptManifest } from '../manifests/manifest.types.js';
import type { RunLogEvent, RunStatus, StartRunDto } from './run.types.js';

interface RunState {
  id: string;
  scriptId: string;
  manifest: ScriptManifest;
  child: ChildProcessByStdio<Writable, Readable, Readable>;
  status: RunStatus;
  logs: string[];
  startedAt: string;
  events: Subject<RunLogEvent>;
}

@Injectable()
export class RunsService {
  private runs = new Map<string, RunState>();

  constructor(
    private readonly manifests: ManifestsService,
    private readonly history: HistoryService,
    private readonly cookies: CookiesService
  ) {}

  list() {
    return [...this.runs.values()].map((r) => ({
      id: r.id,
      scriptId: r.scriptId,
      status: r.status,
      startedAt: r.startedAt
    }));
  }

  getState(id: string): RunState {
    const run = this.runs.get(id);
    if (!run) throw new NotFoundException(`Запуск "${id}" не найден`);
    return run;
  }

  async start(dto: StartRunDto): Promise<{ id: string }> {
    const manifest = this.manifests.findOne(dto.scriptId);
    const scriptCwd = this.manifests.resolveScriptCwd(manifest);
    const inputs = dto.inputs ?? {};

    for (const input of manifest.inputs) {
      // Cookie-backed inputs may be satisfied from the global vault instead of this run's form.
      if (input.cookieKey) continue;
      if (input.required && !(input.key in inputs) && input.kind !== 'flag') {
        throw new BadRequestException(`Отсутствует обязательный параметр "${input.key}"`);
      }
    }

    // "file" inputs are written to their declared path inside the script's cwd.
    for (const input of manifest.inputs) {
      if (input.kind !== 'file' || !input.path) continue;

      if (input.cookieKey) {
        const inlineValue = inputs[input.key];
        const content = inlineValue || (await this.cookies.get(input.cookieKey));
        if (content === null || content === undefined) {
          if (input.required) {
            throw new BadRequestException(
              `Нет сохранённых cookies "${input.cookieKey}" для параметра "${input.key}" — заполните их на странице "Cookies" или в этой форме`
            );
          }
          continue;
        }
        if (inlineValue) await this.cookies.set(input.cookieKey, inlineValue);
        const targetPath = join(scriptCwd, input.path);
        await mkdir(dirname(targetPath), { recursive: true });
        await writeFile(targetPath, content, 'utf-8');
        continue;
      }

      if (inputs[input.key] === undefined) continue;
      if (input.path.includes('<')) {
        throw new BadRequestException(
          `Параметр "${input.key}" требует загрузки нескольких файлов в папку (путь из манифеста: "${input.path}") — такой ввод пока не поддержан в UI`
        );
      }
      const targetPath = join(scriptCwd, input.path);
      await mkdir(dirname(targetPath), { recursive: true });
      await writeFile(targetPath, inputs[input.key], 'utf-8');
    }

    const extraArgs: string[] = [];
    for (const input of manifest.inputs) {
      const value = inputs[input.key];
      if (input.kind === 'text' || input.kind === 'select' || input.kind === 'date') {
        if (value) extraArgs.push(value);
      } else if (input.kind === 'flag') {
        if (value === 'true' && input.flag) extraArgs.push(input.flag);
      }
    }

    const env = this.loadEnv(manifest);
    const id = randomUUID();
    const events = new Subject<RunLogEvent>();

    const child = spawn(manifest.command, [...manifest.args, ...extraArgs], {
      cwd: scriptCwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false
    }) as ChildProcessByStdio<Writable, Readable, Readable>;

    const startedAt = new Date().toISOString();
    const run: RunState = {
      id,
      scriptId: dto.scriptId,
      manifest,
      child,
      status: 'running',
      logs: [],
      startedAt,
      events
    };
    this.runs.set(id, run);
    this.history.create({
      id,
      scriptId: dto.scriptId,
      status: 'running',
      startedAt,
      paramsJson: JSON.stringify(inputs)
    });

    const onChunk = (stream: 'stdout' | 'stderr') => (chunk: Buffer) => {
      const text = chunk.toString('utf-8');
      run.logs.push(text);
      events.next({ type: 'log', stream, text, at: new Date().toISOString() });
    };
    child.stdout.on('data', onChunk('stdout'));
    child.stderr.on('data', onChunk('stderr'));

    child.on('close', (exitCode) => {
      const status: RunStatus = exitCode === 0 ? 'finished' : 'failed';
      run.status = status;
      this.history.finish(id, status, exitCode, run.logs.join(''));
      events.next({ type: 'exit', status, exitCode, at: new Date().toISOString() });
      events.complete();
    });

    return { id };
  }

  sendInput(id: string, text: string): void {
    const run = this.getState(id);
    if (run.status !== 'running') {
      throw new BadRequestException('Процесс уже завершён');
    }
    run.child.stdin.write(text.endsWith('\n') ? text : `${text}\n`);
  }

  stop(id: string): void {
    const run = this.getState(id);
    if (run.status === 'running') {
      run.child.kill();
      run.status = 'stopped';
      this.history.finish(id, 'stopped', null, run.logs.join(''));
    }
  }

  subscribe(id: string) {
    return this.getState(id).events.asObservable();
  }

  getBufferedLog(id: string): string {
    return this.getState(id).logs.join('');
  }

  private loadEnv(manifest: ScriptManifest): NodeJS.ProcessEnv {
    const scriptsDir = this.manifests.getScriptsDir();
    const env: NodeJS.ProcessEnv = { ...process.env };
    const files = new Set(manifest.env.map((e) => e.file));
    for (const file of files) {
      const path = join(scriptsDir, file);
      if (existsSync(path)) {
        Object.assign(env, parseDotenv(readFileSync(path, 'utf-8')));
      }
    }
    return env;
  }
}
