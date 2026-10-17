import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TextareaModule } from 'primeng/textarea';
import { CookiesService } from '../../core/services/cookies.service';
import type { CookieKeyInfo } from '../../core/models/cookie.model';

@Component({
  selector: 'app-cookies',
  standalone: true,
  imports: [CommonModule, FormsModule, TableModule, TagModule, ButtonModule, DialogModule, TextareaModule],
  templateUrl: './cookies.component.html'
})
export class CookiesComponent implements OnInit {
  readonly keys = signal<CookieKeyInfo[]>([]);
  readonly loading = signal(true);
  readonly editingKey = signal<string | null>(null);
  readonly editingContent = signal('');
  readonly saving = signal(false);

  constructor(private readonly cookiesService: CookiesService) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.cookiesService.list().subscribe({
      next: (keys) => {
        this.keys.set(keys);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  edit(info: CookieKeyInfo): void {
    this.editingKey.set(info.key);
    this.editingContent.set('');
    if (info.hasValue) {
      this.cookiesService.get(info.key).subscribe((res) => this.editingContent.set(res.content));
    }
  }

  save(): void {
    const key = this.editingKey();
    if (!key) return;
    this.saving.set(true);
    this.cookiesService.set(key, this.editingContent()).subscribe({
      next: () => {
        this.saving.set(false);
        this.editingKey.set(null);
        this.load();
      },
      error: () => this.saving.set(false)
    });
  }

  cancel(): void {
    this.editingKey.set(null);
  }
}
