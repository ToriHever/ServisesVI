import { Controller, Get, NotFoundException, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { existsSync, statSync } from 'node:fs';
import { basename } from 'node:path';
import { OutputsService } from './outputs.service.js';

@Controller('scripts/:id/outputs')
export class OutputsController {
  constructor(private readonly outputs: OutputsService) {}

  @Get()
  list(@Param('id') id: string) {
    return this.outputs.list(id);
  }

  @Get('download')
  download(@Param('id') id: string, @Query('path') path: string, @Res() res: Response) {
    const target = this.outputs.resolveDownloadPath(id, path);
    if (!existsSync(target) || !statSync(target).isFile()) {
      throw new NotFoundException('Файл не найден');
    }
    res.download(target, basename(target));
  }
}
