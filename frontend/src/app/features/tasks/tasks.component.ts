import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { ScriptsService } from '../../core/services/scripts.service';
import { TasksService } from '../../core/services/tasks.service';
import type { ScriptManifest } from '../../core/models/manifest.model';
import type { TaskFile, TaskSummary } from '../../core/models/task.model';

@Component({
  selector: 'app-tasks',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ButtonModule, InputTextModule, TextareaModule, TagModule, TooltipModule],
  templateUrl: './tasks.component.html'
})
export class TasksComponent implements OnInit {
  readonly manifest = signal<ScriptManifest | null>(null);
  readonly scriptId = signal('');
  readonly tasks = signal<TaskSummary[]>([]);
  readonly loading = signal(true);
  readonly newTaskName = signal('');

  readonly selectedTask = signal<string | null>(null);
  readonly selectedFiles = signal<TaskFile[]>([]);
  readonly queryText = signal('');
  readonly uploading = signal(false);

  constructor(
    private readonly route: ActivatedRoute,
    private readonly scriptsService: ScriptsService,
    private readonly tasksService: TasksService
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.scriptId.set(id);
    this.scriptsService.get(id).subscribe((manifest) => this.manifest.set(manifest));
    this.loadTasks();
  }

  loadTasks(): void {
    this.loading.set(true);
    this.tasksService.list(this.scriptId()).subscribe({
      next: (tasks) => {
        this.tasks.set(tasks);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  createTask(): void {
    const name = this.newTaskName().trim();
    if (!name) return;
    this.tasksService.create(this.scriptId(), name).subscribe(() => {
      this.newTaskName.set('');
      this.loadTasks();
    });
  }

  deleteTask(name: string): void {
    this.tasksService.remove(this.scriptId(), name).subscribe(() => {
      if (this.selectedTask() === name) this.closeTask();
      this.loadTasks();
    });
  }

  openTask(name: string): void {
    this.selectedTask.set(name);
    this.loadFiles(name);
  }

  closeTask(): void {
    this.selectedTask.set(null);
    this.selectedFiles.set([]);
    this.queryText.set('');
  }

  private loadFiles(name: string): void {
    this.tasksService.listFiles(this.scriptId(), name).subscribe((files) => this.selectedFiles.set(files));
    this.tasksService.getQuery(this.scriptId(), name).subscribe((res) => this.queryText.set(res.text));
  }

  onOwnFileSelected(event: Event): void {
    const task = this.selectedTask();
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!task || !file) return;
    this.uploading.set(true);
    this.tasksService.uploadOwn(this.scriptId(), task, file).subscribe({
      next: () => {
        this.uploading.set(false);
        input.value = '';
        this.loadFiles(task);
        this.loadTasks();
      },
      error: () => this.uploading.set(false)
    });
  }

  onCompetitorFilesSelected(event: Event): void {
    const task = this.selectedTask();
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (!task || !files || files.length === 0) return;
    this.uploading.set(true);
    this.tasksService.uploadCompetitors(this.scriptId(), task, files).subscribe({
      next: () => {
        this.uploading.set(false);
        input.value = '';
        this.loadFiles(task);
        this.loadTasks();
      },
      error: () => this.uploading.set(false)
    });
  }

  saveQuery(): void {
    const task = this.selectedTask();
    if (!task) return;
    this.tasksService.saveQuery(this.scriptId(), task, this.queryText()).subscribe(() => {
      this.loadFiles(task);
      this.loadTasks();
    });
  }

  deleteFile(name: string): void {
    const task = this.selectedTask();
    if (!task) return;
    this.tasksService.deleteFile(this.scriptId(), task, name).subscribe(() => {
      this.loadFiles(task);
      this.loadTasks();
    });
  }
}
