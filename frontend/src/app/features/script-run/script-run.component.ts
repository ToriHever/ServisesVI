import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { SelectModule } from 'primeng/select';
import { CheckboxModule } from 'primeng/checkbox';
import { DatePickerModule } from 'primeng/datepicker';
import { TagModule } from 'primeng/tag';
import { ScriptsService } from '../../core/services/scripts.service';
import { RunsService } from '../../core/services/runs.service';
import type { ScriptManifest } from '../../core/models/manifest.model';
import type { RunStatus } from '../../core/models/run.model';

@Component({
  selector: 'app-script-run',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ButtonModule,
    InputTextModule,
    TextareaModule,
    SelectModule,
    CheckboxModule,
    DatePickerModule,
    TagModule
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

  private logSub?: Subscription;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly scriptsService: ScriptsService,
    private readonly runsService: RunsService
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.scriptsService.get(id).subscribe((manifest) => {
      this.manifest.set(manifest);
      for (const input of manifest.inputs) {
        this.form.addControl(
          input.key,
          new FormControl('', input.required ? Validators.required : [])
        );
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
    this.runsService.start(manifest.id, this.form.value as Record<string, string>).subscribe({
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
}
