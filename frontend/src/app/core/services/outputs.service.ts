import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { OutputFile } from '../models/output-file.model';

@Injectable({ providedIn: 'root' })
export class OutputsService {
  constructor(private readonly http: HttpClient) {}

  list(scriptId: string): Observable<OutputFile[]> {
    return this.http.get<OutputFile[]>(`${environment.apiUrl}/scripts/${scriptId}/outputs`);
  }

  downloadUrl(scriptId: string, path: string): string {
    return `${environment.apiUrl}/scripts/${scriptId}/outputs/download?path=${encodeURIComponent(path)}`;
  }
}
