import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { TaskFile, TaskSummary } from '../models/task.model';

@Injectable({ providedIn: 'root' })
export class TasksService {
  constructor(private readonly http: HttpClient) {}

  private base(scriptId: string): string {
    return `${environment.apiUrl}/scripts/${scriptId}/tasks`;
  }

  list(scriptId: string): Observable<TaskSummary[]> {
    return this.http.get<TaskSummary[]>(this.base(scriptId));
  }

  create(scriptId: string, name: string): Observable<{ ok: true }> {
    return this.http.post<{ ok: true }>(this.base(scriptId), { name });
  }

  remove(scriptId: string, task: string): Observable<{ ok: true }> {
    return this.http.delete<{ ok: true }>(`${this.base(scriptId)}/${encodeURIComponent(task)}`);
  }

  listFiles(scriptId: string, task: string): Observable<TaskFile[]> {
    return this.http.get<TaskFile[]>(`${this.base(scriptId)}/${encodeURIComponent(task)}/files`);
  }

  uploadOwn(scriptId: string, task: string, file: File): Observable<{ ok: true }> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<{ ok: true }>(`${this.base(scriptId)}/${encodeURIComponent(task)}/files/own`, form);
  }

  uploadCompetitors(scriptId: string, task: string, files: FileList | File[]): Observable<{ ok: true }> {
    const form = new FormData();
    for (const file of Array.from(files)) form.append('files', file);
    return this.http.post<{ ok: true }>(`${this.base(scriptId)}/${encodeURIComponent(task)}/files/competitors`, form);
  }

  getQuery(scriptId: string, task: string): Observable<{ text: string }> {
    return this.http.get<{ text: string }>(`${this.base(scriptId)}/${encodeURIComponent(task)}/query`);
  }

  saveQuery(scriptId: string, task: string, text: string): Observable<{ ok: true }> {
    return this.http.put<{ ok: true }>(`${this.base(scriptId)}/${encodeURIComponent(task)}/query`, { text });
  }

  deleteFile(scriptId: string, task: string, fileName: string): Observable<{ ok: true }> {
    return this.http.delete<{ ok: true }>(
      `${this.base(scriptId)}/${encodeURIComponent(task)}/files/${encodeURIComponent(fileName)}`
    );
  }
}
