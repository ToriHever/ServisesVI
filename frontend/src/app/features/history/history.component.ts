import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { RunsService } from '../../core/services/runs.service';
import type { RunHistoryRecord } from '../../core/models/run.model';

@Component({
  selector: 'app-history',
  standalone: true,
  imports: [CommonModule, TableModule, TagModule, ButtonModule, DialogModule],
  templateUrl: './history.component.html'
})
export class HistoryComponent implements OnInit {
  readonly runs = signal<RunHistoryRecord[]>([]);
  readonly loading = signal(true);
  readonly selectedLog = signal<string | null>(null);

  constructor(private readonly runsService: RunsService) {}

  ngOnInit(): void {
    this.runsService.history().subscribe({
      next: (runs) => {
        // Свежие запуски всегда первыми (явная сортировка, не зависим от порядка API).
        this.runs.set([...runs].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)));
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  showLog(run: RunHistoryRecord): void {
    // Как и на странице запуска: последние события сверху.
    this.selectedLog.set(run.log.split('\n').reverse().join('\n'));
  }

  severityFor(status: string): 'success' | 'danger' | 'warn' | 'info' | 'secondary' {
    if (status === 'finished') return 'success';
    if (status === 'failed') return 'danger';
    if (status === 'stopped') return 'secondary';
    return 'info';
  }

  iconFor(status: string): string {
    if (status === 'finished') return 'pi pi-check-circle';
    if (status === 'failed') return 'pi pi-times-circle';
    if (status === 'stopped') return 'pi pi-clock';
    return 'pi pi-spin pi-spinner';
  }
}
