import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import spawn from 'cross-spawn';
import type { ChildProcessByStdio } from 'node:child_process';
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
  /** Undefined while installing dependencies, before the actual script process starts. */
  child?: ChildProcessByStdio<Writable, Readable, Readable>;
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
      if (input.kind === 'flag') {
        // Always pass the on/off flag explicitly when set — scripts fall back to an
        // interactive stdin prompt if neither variant is present on argv.
        if (!input.cliFlag || value === undefined) continue;
        const [onFlag, offFlag] = input.cliFlag.split('/');
        extraArgs.push(value === 'true' ? onFlag : offFlag);
      } else if (input.kind === 'text' || input.kind === 'select' || input.kind === 'date') {
        if (!value) continue;
        extraArgs.push(input.cliFlag ? `${input.cliFlag}${value}` : value);
      }
    }

    const env = this.loadEnv(manifest);
    const id = randomUUID();
    const events = new Subject<RunLogEvent>();
    const startedAt = new Date().toISOString();

    const run: RunState = {
      id,
      scriptId: dto.scriptId,
      manifest,
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

    this.launch(run, scriptCwd, extraArgs, env).catch((err: Error) => {
      this.appendLog(run, 'stderr', `[внутренняя ошибка] ${err.message}\n`);
      this.finish(run, 'failed', null);
    });

    return { id };
  }

  private async launch(
    run: RunState,
    scriptCwd: string,
    extraArgs: string[],
    env: NodeJS.ProcessEnv
  ): Promise<void> {
    const { manifest } = run;

    const installed = await this.ensureInstalled(run, scriptCwd);
    if (!installed) {
      this.finish(run, 'failed', null);
      return;
    }
    if (run.status === 'stopped') return;

    const child = spawn(manifest.command, [...manifest.args, ...extraArgs], {
      cwd: scriptCwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false
    }) as ChildProcessByStdio<Writable, Readable, Readable>;
    run.child = child;

    child.stdout.on('data', (chunk: Buffer) => this.appendLog(run, 'stdout', chunk.toString('utf-8')));
    child.stderr.on('data', (chunk: Buffer) => this.appendLog(run, 'stderr', chunk.toString('utf-8')));
    child.on('error', (err) => {
      this.appendLog(run, 'stderr', `[не удалось запустить процесс] ${err.message}\n`);
      this.finish(run, 'failed', null);
    });
    child.on('close', (exitCode) => {
      this.finish(run, exitCode === 0 ? 'finished' : 'failed', exitCode);
    });
  }

  /** Runs the manifest's install command once, if node_modules is missing. */
  private async ensureInstalled(run: RunState, scriptCwd: string): Promise<boolean> {
    const { install } = run.manifest;
    if (!install.needed) return true;
    if (existsSync(join(scriptCwd, 'node_modules'))) return true;

    const command = install.command ?? 'npm install';
    const [cmd, ...args] = command.split(' ');
    this.appendLog(run, 'stdout', `[установка зависимостей] ${command}\n`);

    const installChild = spawn(cmd, args, {
      cwd: scriptCwd,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    installChild.stdout?.on('data', (chunk: Buffer) => this.appendLog(run, 'stdout', chunk.toString('utf-8')));
    installChild.stderr?.on('data', (chunk: Buffer) => this.appendLog(run, 'stderr', chunk.toString('utf-8')));

    const exitCode: number | null = await new Promise((resolve) => {
      let settled = false;
      const settle = (code: number | null) => {
        if (settled) return;
        settled = true;
        resolve(code);
      };
      installChild.on('error', (err) => {
        this.appendLog(run, 'stderr', `[установка зависимостей] не удалось запустить: ${err.message}\n`);
        settle(null);
      });
      installChild.on('close', settle);
    });
    if (exitCode !== 0) {
      this.appendLog(run, 'stderr', `[установка зависимостей] завершилась с кодом ${exitCode}\n`);
      return false;
    }
    this.appendLog(run, 'stdout', `[установка зависимостей] готово\n`);
    return true;
  }

  private appendLog(run: RunState, stream: 'stdout' | 'stderr', text: string): void {
    run.logs.push(text);
    run.events.next({ type: 'log', stream, text, at: new Date().toISOString() });
  }

  private finish(run: RunState, status: RunStatus, exitCode: number | null): void {
    if (run.status !== 'running') return;
    run.status = status;
    this.history.finish(run.id, status, exitCode, run.logs.join(''));
    run.events.next({ type: 'exit', status, exitCode, at: new Date().toISOString() });
    run.events.complete();
  }

  sendInput(id: string, text: string): void {
    const run = this.getState(id);
    if (run.status !== 'running' || !run.child) {
      throw new BadRequestException('Процесс ещё не готов принимать ввод или уже завершён');
    }
    run.child.stdin.write(text.endsWith('\n') ? text : `${text}\n`);
  }

  stop(id: string): void {
    const run = this.getState(id);
    if (run.status === 'running') {
      run.child?.kill();
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
