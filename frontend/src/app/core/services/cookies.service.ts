import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { CookieKeyInfo } from '../models/cookie.model';

@Injectable({ providedIn: 'root' })
export class CookiesService {
  private readonly baseUrl = `${environment.apiUrl}/cookies`;

  constructor(private readonly http: HttpClient) {}

  list(): Observable<CookieKeyInfo[]> {
    return this.http.get<CookieKeyInfo[]>(this.baseUrl);
  }

  get(key: string): Observable<{ key: string; content: string }> {
    return this.http.get<{ key: string; content: string }>(`${this.baseUrl}/${key}`);
  }

  set(key: string, content: string): Observable<{ ok: true }> {
    return this.http.put<{ ok: true }>(`${this.baseUrl}/${key}`, { content });
  }
}
