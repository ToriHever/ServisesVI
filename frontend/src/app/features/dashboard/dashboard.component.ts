import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TagModule } from 'primeng/tag';
import { RunsService } from '../../core/services/runs.service';
import { CookiesService } from '../../core/services/cookies.service';
import type { RunHistoryRecord, RunStatus, RunSummary } from '../../core/models/run.model';
import type { CookieKeyInfo } from '../../core/models/cookie.model';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, TagModule],
  templateUrl: './dashboard.component.html'
})
export class DashboardComponent implements OnInit {
  readonly recentRuns = signal<RunHistoryRecord[]>([]);
  readonly activeRuns = signal<RunSummary[]>([]);
  readonly cookieKeys = signal<CookieKeyInfo[]>([]);

  constructor(
    private readonly runsService: RunsService,
    private readonly cookiesService: CookiesService
  ) {}

  ngOnInit(): void {
    // Свежие запуски первыми — явная сортировка, не зависим от порядка API.
    this.runsService.history().subscribe((runs) =>
      this.recentRuns.set(
        [...runs].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)).slice(0, 5)
      )
    );
    // Бэкенд держит живые процессы в памяти — показываем их, чтобы можно было
    // вернуться к запуску после закрытия/перезагрузки вкладки.
    this.runsService.list().subscribe((runs) =>
      this.activeRuns.set(runs.filter((run) => run.status === 'running'))
    );
    this.cookiesService.list().subscribe((keys) => this.cookieKeys.set(keys));
  }

  severityFor(status: RunStatus): 'success' | 'danger' | 'warn' | 'info' {
    if (status === 'finished') return 'success';
    if (status === 'failed') return 'danger';
    if (status === 'stopped') return 'warn';
    return 'info';
  }
}
