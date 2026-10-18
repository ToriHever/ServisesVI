import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TagModule } from 'primeng/tag';
import { RunsService } from '../../core/services/runs.service';
import { CookiesService } from '../../core/services/cookies.service';
import type { RunHistoryRecord, RunStatus } from '../../core/models/run.model';
import type { CookieKeyInfo } from '../../core/models/cookie.model';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, TagModule],
  templateUrl: './dashboard.component.html'
})
export class DashboardComponent implements OnInit {
  readonly recentRuns = signal<RunHistoryRecord[]>([]);
  readonly cookieKeys = signal<CookieKeyInfo[]>([]);

  constructor(
    private readonly runsService: RunsService,
    private readonly cookiesService: CookiesService
  ) {}

  ngOnInit(): void {
    this.runsService.history().subscribe((runs) => this.recentRuns.set(runs.slice(0, 5)));
    this.cookiesService.list().subscribe((keys) => this.cookieKeys.set(keys));
  }

  severityFor(status: RunStatus): 'success' | 'danger' | 'warn' | 'info' {
    if (status === 'finished') return 'success';
    if (status === 'failed') return 'danger';
    if (status === 'stopped') return 'warn';
    return 'info';
  }
}
