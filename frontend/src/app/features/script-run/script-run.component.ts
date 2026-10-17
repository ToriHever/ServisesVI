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
import { ScriptsService } from '../../core/services/scripts.service';
import { RunsService } from '../../core/services/runs.service';
import { OutputsService } from '../../core/services/outputs.service';
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
    DialogModule
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

  private logSub?: Subscription;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly scriptsService: ScriptsService,
    private readonly runsService: RunsService,
    private readonly outputsService: OutputsService
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
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
        this.logSub = this.runsService.watchLogs(id).subscribe((event) => {
          if (event.type === 'log' && event.text) {
            this.log.update((current) => current + event.text);
          } else if (event.type === 'exit') {
            this.status.set(event.status ?? null);
          }
        });
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
    const text = this.continuation.value;
    if (!id || !text) return;
    this.runsService.sendInput(id, text).subscribe(() => this.continuation.setValue(''));
  }

  stop(): void {
    const id = this.runId();
    if (!id) return;
    this.runsService.stop(id).subscribe(() => this.status.set('stopped'));
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
