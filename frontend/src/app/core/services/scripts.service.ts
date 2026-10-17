import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { ScriptManifest } from '../models/manifest.model';

@Injectable({ providedIn: 'root' })
export class ScriptsService {
  private readonly baseUrl = `${environment.apiUrl}/scripts`;

  constructor(private readonly http: HttpClient) {}

  list(): Observable<ScriptManifest[]> {
    return this.http.get<ScriptManifest[]>(this.baseUrl);
  }

  get(id: string): Observable<ScriptManifest> {
    return this.http.get<ScriptManifest>(`${this.baseUrl}/${id}`);
  }
}
