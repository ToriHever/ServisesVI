import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { SelectModule } from 'primeng/select';
import { CheckboxModule } from 'primeng/checkbox';
import { DatePickerModule } from 'primeng/datepicker';
import { TagModule } from 'primeng/tag';
import { DialogModule } from 'primeng/dialog';
import { TooltipModule } from 'primeng/tooltip';
import { ScriptsService } from '../../core/services/scripts.service';
import { RunsService } from '../../core/services/runs.service';
import { OutputsService } from '../../core/services/outputs.service';
import { environment } from '../../../environments/environment';
import type { ScriptManifest } from '../../core/models/manifest.model';
import type { RunStatus } from '../../core/models/run.model';
import type { OutputFile } from '../../core/models/output-file.model';

@Component({
  selector: 'app-script-run',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    ButtonModule,
    InputTextModule,
    TextareaModule,
    SelectModule,
    CheckboxModule,
    DatePickerModule,
    TagModule,
    DialogModule,
    TooltipModule
  ],
  templateUrl: './script-run.component.html'
})
export class ScriptRunComponent implements OnInit, OnDestroy {
  readonly manifest = signal<ScriptManifest | null>(null);
  readonly form = new FormGroup({});
  readonly runId = signal<string | null>(null);
  readonly status = signal<RunStatus | null>(null);
  readonly log = signal('');
  readonly continuation = new FormControl('');
  readonly outputsVisible = signal(false);
  readonly outputs = signal<OutputFile[]>([]);
  readonly outputsLoading = signal(false);
  readonly novncAttention = signal(false);
  readonly downloadMessage = signal('');
  readonly attachedExisting = signal(false);

  private logSub?: Subscription;
  private runStartedAt = 0;
  private novncOpenedForRun = false;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly scriptsService: ScriptsService,
    private readonly runsService: RunsService,
    private readonly outputsService: OutputsService
  ) {}

  ngOnInit(): void {
    // Navigating between two script-run pages reuses this component instance (same route
    // config), so ngOnInit only fires once — react to paramMap instead of reading a snapshot,
    // otherwise clicking a different script in the sidebar leaves the old script's page showing.
    this.route.paramMap.subscribe((params) => this.loadScript(params.get('id')!));
  }

  private loadScript(id: string): void {
    this.logSub?.unsubscribe();
    this.manifest.set(null);
    this.runId.set(null);
    this.status.set(null);
    this.log.set('');
    this.outputs.set([]);
    this.outputsVisible.set(false);
    this.novncAttention.set(false);
    this.downloadMessage.set('');
    this.attachedExisting.set(false);
    this.novncOpenedForRun = false;
    for (const key of Object.keys(this.form.controls)) this.form.removeControl(key);

    this.scriptsService.get(id).subscribe((manifest) => {
      this.manifest.set(manifest);
      for (const input of manifest.inputs) {
        // Cookie-backed inputs can fall back to the global vault, so the form
        // never requires them even if the manifest marks them required.
        const requiresValue = input.required && !input.cookieKey;
        const initialValue = input.kind === 'flag' ? false : '';
        this.form.addControl(input.key, new FormControl(initialValue, requiresValue ? Validators.required : []));
      }
    });

    // Если этот скрипт уже выполняется (вкладку закрыли или перезагрузили страницу) —
    // переподключаемся к живому процессу: бэкенд держит его в памяти, лог и ввод
    // продолжают работать, ничего не теряется.
    this.runsService.list().subscribe((runs) => {
      const active = runs
        .filter((run) => run.scriptId === id && run.status === 'running')
        .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))[0];
      if (active) this.attachToRun(active.id);
    });
  }

  private attachToRun(id: string): void {
    this.runId.set(id);
    this.status.set('running');
    this.attachedExisting.set(true);
    this.runStartedAt = Date.now();
    this.runsService.get(id).subscribe((record) => {
      const buffered = record?.bufferedLog ?? '';
      // Лог показывается инвертированно: последние события сверху, без прокрутки.
      this.log.set(buffered.split('\n').reverse().join('\n'));
      // Если в хвосте лога уже капча/блокировка — подсвечиваем кнопку noVNC,
      // но не открываем popup сами: без жеста пользователя браузер его заблокирует.
      if (/капч|captcha|блокировк|ожидани/i.test(buffered.slice(-3000))) {
        this.novncAttention.set(true);
      }
    });
    this.watchRun(id);
  }

  private watchRun(id: string): void {
    this.logSub?.unsubscribe();
    this.logSub = this.runsService.watchLogs(id).subscribe((event) => {
      if (event.type === 'log' && event.text) {
        // Новые события — наверх: лог инвертирован, следить за ходом run'а
        // удобнее без прокрутки вниз.
        this.log.update((current) => event.text + current);
        this.detectBrowserProblem(event.text);
      } else if (event.type === 'exit') {
        this.status.set(event.status ?? null);
        const manifest = this.manifest();
        if (event.status === 'finished' && manifest) this.downloadNewOutputs(manifest.id);
      }
    });
  }

  ngOnDestroy(): void {
    this.logSub?.unsubscribe();
  }

  get isBlocking(): boolean {
    return (this.manifest()?.execution.blocking.length ?? 0) > 0;
  }

  start(): void {
    const manifest = this.manifest();
    if (!manifest || this.form.invalid) return;

    this.log.set('');
    this.status.set('running');
    this.downloadMessage.set('');
    this.novncAttention.set(false);
    this.novncOpenedForRun = false;
    this.runStartedAt = Date.now();
    const formValue = this.form.value as Record<string, unknown>;
    const inputs: Record<string, string> = {};
    for (const input of manifest.inputs) {
      const value = formValue[input.key];
      if (input.kind === 'flag') {
        // Always send an explicit true/false — if omitted, scripts with a cliFlag
        // for this field fall back to an interactive stdin prompt instead of using it.
        inputs[input.key] = value ? 'true' : 'false';
      } else if (value) {
        inputs[input.key] = value as string;
      }
    }
    this.runsService.start(manifest.id, inputs).subscribe({
      next: ({ id }) => {
        this.runId.set(id);
        this.watchRun(id);
      },
      error: (err) => {
        this.status.set('failed');
        const message = err?.error?.message ?? err?.message ?? 'неизвестная ошибка';
        this.log.update((current) => current + `[Ошибка запуска] ${message}\n`);
      }
    });
  }

  sendContinuation(): void {
    const id = this.runId();
    if (!id) return;
    // Пустой ввод — это просто Enter: именно его ждут prompt'ы
    // «Нажмите Enter для продолжения» (после капчи и т.п.).
    const text = this.continuation.value ?? '';
    this.runsService.sendInput(id, text).subscribe(() => this.continuation.setValue(''));
  }

  stop(): void {
    const id = this.runId();
    if (!id) return;
    this.runsService.stop(id).subscribe(() => this.status.set('stopped'));
  }

  openNovnc(): void {
    const popup = window.open(environment.novncUrl, '_blank');
    if (popup) {
      popup.opener = null;
      this.novncAttention.set(false);
    } else {
      this.novncAttention.set(true);
    }
  }

  private detectBrowserProblem(text: string): void {
    const manifest = this.manifest();
    if (!manifest || manifest.execution.headless || this.novncOpenedForRun) return;
    if (!/капч|captcha|блокировк|критическая ошибка|missing x server|detached frame|❌/i.test(text)) return;
    this.novncOpenedForRun = true;
    this.novncAttention.set(true);
    this.openNovnc();
  }

  private downloadNewOutputs(scriptId: string): void {
    this.outputsService.list(scriptId).subscribe({
      next: (files) => {
        const freshFiles = files.filter((file) => Date.parse(file.modifiedAt) >= this.runStartedAt - 2000);
        this.outputs.set(freshFiles);
        if (freshFiles.length === 0) {
          this.downloadMessage.set('Новых файлов результатов нет.');
          return;
        }
        this.downloadMessage.set(
          freshFiles.length === 1
            ? 'Результат скачивается на компьютер.'
            : `Скачиваются ${freshFiles.length} файла. Разрешите множественное скачивание, если браузер спросит.`
        );
        freshFiles.forEach((file, index) => {
          window.setTimeout(() => this.triggerDownload(scriptId, file.path), index * 300);
        });
      },
      error: () => this.downloadMessage.set('Не удалось получить файлы результатов для скачивания.')
    });
  }

  private triggerDownload(scriptId: string, path: string): void {
    const anchor = document.createElement('a');
    anchor.href = this.outputsService.downloadUrl(scriptId, path);
    anchor.download = path.split('/').pop() ?? 'result';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  openOutputs(): void {
    const manifest = this.manifest();
    if (!manifest) return;
    this.outputsVisible.set(true);
    this.loadOutputs(manifest.id);
  }

  private loadOutputs(scriptId: string): void {
    this.outputsLoading.set(true);
    this.outputsService.list(scriptId).subscribe({
      next: (files) => {
        this.outputs.set(files);
        this.outputsLoading.set(false);
      },
      error: () => this.outputsLoading.set(false)
    });
  }

  refreshOutputs(): void {
    const manifest = this.manifest();
    if (manifest) this.loadOutputs(manifest.id);
  }

  downloadUrl(path: string): string {
    const manifest = this.manifest();
    return manifest ? this.outputsService.downloadUrl(manifest.id, path) : '';
  }
}
