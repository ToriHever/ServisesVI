import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { ScriptsService } from '../../core/services/scripts.service';
import type { ScriptManifest } from '../../core/models/manifest.model';

@Component({
  selector: 'app-script-list',
  standalone: true,
  imports: [CommonModule, TableModule, ButtonModule, TagModule, RouterLink],
  templateUrl: './script-list.component.html'
})
export class ScriptListComponent implements OnInit {
  readonly scripts = signal<ScriptManifest[]>([]);
  readonly loading = signal(true);

  constructor(private readonly scriptsService: ScriptsService) {}

  ngOnInit(): void {
    this.scriptsService.list().subscribe({
      next: (scripts) => {
        this.scripts.set(scripts);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }
}
