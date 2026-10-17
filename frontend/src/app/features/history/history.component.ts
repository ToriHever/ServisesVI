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
        this.runs.set(runs);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  showLog(run: RunHistoryRecord): void {
    this.selectedLog.set(run.log);
  }

  severityFor(status: string): 'success' | 'danger' | 'warn' | 'info' {
    if (status === 'finished') return 'success';
    if (status === 'failed') return 'danger';
    if (status === 'stopped') return 'warn';
    return 'info';
  }
}
