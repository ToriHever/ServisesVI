import { Body, Controller, Get, Param, Post, Sse } from '@nestjs/common';
import { map, type Observable } from 'rxjs';
import { RunsService } from './runs.service.js';
import { HistoryService } from '../history/history.service.js';
import type { SendInputDto, StartRunDto } from './run.types.js';

@Controller('runs')
export class RunsController {
  constructor(
    private readonly runs: RunsService,
    private readonly history: HistoryService
  ) {}

  @Get()
  list() {
    return this.runs.list();
  }

  @Get('history')
  listHistory() {
    return this.history.findAll();
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    const record = this.history.findOne(id);
    if (!record) return null;
    return { ...record, log: undefined, bufferedLog: this.safeBuffered(id) ?? record.log };
  }

  @Post()
  start(@Body() dto: StartRunDto) {
    return this.runs.start(dto);
  }

  @Post(':id/input')
  sendInput(@Param('id') id: string, @Body() dto: SendInputDto) {
    this.runs.sendInput(id, dto.text);
    return { ok: true };
  }

  @Post(':id/stop')
  stop(@Param('id') id: string) {
    this.runs.stop(id);
    return { ok: true };
  }

  @Sse(':id/logs')
  logs(@Param('id') id: string): Observable<MessageEvent> {
    return this.runs.subscribe(id).pipe(map((event) => ({ data: event }) as MessageEvent));
  }

  private safeBuffered(id: string): string | undefined {
    try {
      return this.runs.getBufferedLog(id);
    } catch {
      return undefined;
    }
  }
}
