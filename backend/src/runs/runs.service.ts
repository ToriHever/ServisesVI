import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import crossSpawn from 'cross-spawn';
import * as pty from 'node-pty';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { parse as parseDotenv } from 'dotenv';
import { Subject } from 'rxjs';
import stripAnsi from 'strip-ansi';
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
  child?: pty.IPty;
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
    const stdinAnswers: string[] = [];
    for (const input of manifest.inputs) {
      const value = inputs[input.key];
      if (input.kind === 'flag') {
        if (input.stdinAnswer && value !== undefined) {
          const [onAnswer, offAnswer] = input.stdinAnswer.split('/');
          stdinAnswers.push(value === 'true' ? onAnswer : offAnswer);
          continue;
        }
        // Always pass the on/off flag explicitly when set — scripts fall back to an
        // interactive stdin prompt if neither variant is present on argv.
        if (!input.cliFlag || value === undefined) continue;
        const [onFlag, offFlag] = input.cliFlag.split('/');
        extraArgs.push(value === 'true' ? onFlag : offFlag);
      } else if (input.kind === 'text' || input.kind === 'select' || input.kind === 'date') {
        if (!value) continue;
        if (input.stdinAnswer) {
          stdinAnswers.push(value);
          continue;
        }
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

    this.launch(run, scriptCwd, extraArgs, env, stdinAnswers).catch((err: Error) => {
      this.appendLog(run, 'stderr', `[внутренняя ошибка] ${err.message}\n`);
      this.finish(run, 'failed', null);
    });

    return { id };
  }

  private async launch(
    run: RunState,
    scriptCwd: string,
    extraArgs: string[],
    env: NodeJS.ProcessEnv,
    stdinAnswers: string[]
  ): Promise<void> {
    const { manifest } = run;

    const installed = await this.ensureInstalled(run, scriptCwd);
    if (!installed) {
      this.finish(run, 'failed', null);
      return;
    }
    if (run.status === 'stopped') return;

    // Spawned inside a pseudo-terminal rather than plain pipes: several scripts in this
    // repo only wire up keyboard shortcuts / menu prompts when process.stdin.isTTY is true
    // (readline.emitKeypressEvents is gated behind that check) — over a plain pipe those
    // prompts print but can never receive an answer and the process exits almost
    // immediately, silently skipping the rest of the run.
    let child: pty.IPty;
    try {
      child = pty.spawn(this.resolvePtyCommand(manifest.command), [...manifest.args, ...extraArgs], {
        cwd: scriptCwd,
        env,
        cols: 120,
        rows: 30
      });
    } catch (err) {
      this.appendLog(run, 'stderr', `[не удалось запустить процесс] ${(err as Error).message}\n`);
      this.finish(run, 'failed', null);
      return;
    }
    run.child = child;

    child.onData((data) => this.appendLog(run, 'stdout', this.cleanTerminalOutput(data)));
    child.onExit(({ exitCode }) => {
      this.finish(run, exitCode === 0 ? 'finished' : 'failed', exitCode);
    });

    await this.sendStdinAnswers(run, stdinAnswers);
  }

  /**
   * Types pre-collected form answers into the pty right after spawn, for prompts that have
   * no CLI equivalent — the user picked the answer in the launch form instead of the
   * "continue" box. Answers are sent in manifest.inputs order with a short delay between
   * each, mirroring how fast a human could react; only safe for the first prompt(s) a script
   * shows unconditionally, never for a submenu that depends on an earlier choice.
   */
  private async sendStdinAnswers(run: RunState, answers: string[]): Promise<void> {
    for (const answer of answers) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      if (run.status !== 'running' || !run.child) return;
      run.child.write(`${answer}\r`);
    }
  }

  /** node-pty resolves the executable itself and needs the real Windows extension. */
  private resolvePtyCommand(command: string): string {
    if (process.platform !== 'win32') return command;
    if (command === 'node') return 'node.exe';
    if (command === 'npm') return 'npm.cmd';
    if (command === 'npx') return 'npx.cmd';
    return command;
  }

  /** Runs the manifest's install command once, if node_modules is missing. */
  private async ensureInstalled(run: RunState, scriptCwd: string): Promise<boolean> {
    const { install } = run.manifest;
    if (!install.needed) return true;
    if (existsSync(join(scriptCwd, 'node_modules'))) return true;

    const command = install.command ?? 'npm install';
    const [cmd, ...args] = command.split(' ');
    this.appendLog(run, 'stdout', `[установка зависимостей] ${command}\n`);

    const installChild = crossSpawn(cmd, args, {
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

  /**
   * strip-ansi only removes CSI escapes (cursor movement, colors); OSC sequences like the
   * terminal-title-set the console title sequence (`ESC ] 0 ; <title> BEL`) node emits at
   * startup slip through and corrupt the log, so strip those too.
   */
  private cleanTerminalOutput(text: string): string {
    return stripAnsi(text.replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, ''));
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
    // '\r' is what a pty delivers for the Enter key — scripts reading raw keypresses
    // (not readline's line-buffered input) only recognize that, not '\n'.
    run.child.write(text.endsWith('\r') ? text : `${text}\r`);
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
