import { Module } from '@nestjs/common';
import { RunsService } from './runs.service.js';
import { RunsController } from './runs.controller.js';
import { ManifestsModule } from '../manifests/manifests.module.js';
import { HistoryModule } from '../history/history.module.js';

@Module({
  imports: [ManifestsModule, HistoryModule],
  controllers: [RunsController],
  providers: [RunsService]
})
export class RunsModule {}
