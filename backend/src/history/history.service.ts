import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { RunStatus } from '../runs/run.types.js';

export interface RunRecord {
  id: string;
  scriptId: string;
  status: RunStatus;
  startedAt: string;
  finishedAt: string | null;
  exitCode: number | null;
  paramsJson: string;
  log: string;
}

@Injectable()
export class HistoryService implements OnModuleInit {
  private db!: Database.Database;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const dbPath = this.config.get<string>('DB_PATH', './data/servisesvi.db');
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        scriptId TEXT NOT NULL,
        status TEXT NOT NULL,
        startedAt TEXT NOT NULL,
        finishedAt TEXT,
        exitCode INTEGER,
        paramsJson TEXT NOT NULL,
        log TEXT NOT NULL DEFAULT ''
      );
    `);
  }

  create(record: Omit<RunRecord, 'finishedAt' | 'exitCode' | 'log'>): void {
    this.db
      .prepare(
        `INSERT INTO runs (id, scriptId, status, startedAt, finishedAt, exitCode, paramsJson, log)
         VALUES (@id, @scriptId, @status, @startedAt, NULL, NULL, @paramsJson, '')`
      )
      .run(record);
  }

  updateStatus(id: string, status: RunStatus): void {
    this.db.prepare(`UPDATE runs SET status = ? WHERE id = ?`).run(status, id);
  }

  finish(id: string, status: RunStatus, exitCode: number | null, log: string): void {
    this.db
      .prepare(
        `UPDATE runs SET status = ?, exitCode = ?, finishedAt = ?, log = ? WHERE id = ?`
      )
      .run(status, exitCode, new Date().toISOString(), log, id);
  }

  findAll(limit = 100): RunRecord[] {
    return this.db
      .prepare(`SELECT * FROM runs ORDER BY startedAt DESC LIMIT ?`)
      .all(limit) as RunRecord[];
  }

  findOne(id: string): RunRecord | undefined {
    return this.db.prepare(`SELECT * FROM runs WHERE id = ?`).get(id) as RunRecord | undefined;
  }
}
