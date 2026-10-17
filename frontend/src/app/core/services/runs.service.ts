import { Injectable, NgZone } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { RunHistoryRecord, RunLogEvent, RunSummary } from '../models/run.model';

@Injectable({ providedIn: 'root' })
export class RunsService {
  private readonly baseUrl = `${environment.apiUrl}/runs`;

  constructor(
    private readonly http: HttpClient,
    private readonly zone: NgZone
  ) {}

  start(scriptId: string, inputs: Record<string, string>): Observable<{ id: string }> {
    return this.http.post<{ id: string }>(this.baseUrl, { scriptId, inputs });
  }

  list(): Observable<RunSummary[]> {
    return this.http.get<RunSummary[]>(this.baseUrl);
  }

  history(): Observable<RunHistoryRecord[]> {
    return this.http.get<RunHistoryRecord[]>(`${this.baseUrl}/history`);
  }

  sendInput(id: string, text: string): Observable<{ ok: true }> {
    return this.http.post<{ ok: true }>(`${this.baseUrl}/${id}/input`, { text });
  }

  stop(id: string): Observable<{ ok: true }> {
    return this.http.post<{ ok: true }>(`${this.baseUrl}/${id}/stop`, {});
  }

  /** Server-Sent Events stream of live logs for a run. Completes when the backend closes the stream. */
  watchLogs(id: string): Observable<RunLogEvent> {
    return new Observable<RunLogEvent>((subscriber) => {
      const source = new EventSource(`${this.baseUrl}/${id}/logs`);
      source.onmessage = (message) => {
        this.zone.run(() => {
          try {
            subscriber.next(JSON.parse(message.data) as RunLogEvent);
          } catch {
            // ignore malformed event
          }
        });
      };
      source.onerror = () => {
        this.zone.run(() => {
          subscriber.complete();
          source.close();
        });
      };
      return () => source.close();
    });
  }
}
