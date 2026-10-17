import { Module } from '@nestjs/common';
import { RunsService } from './runs.service.js';
import { RunsController } from './runs.controller.js';
import { ManifestsModule } from '../manifests/manifests.module.js';
import { HistoryModule } from '../history/history.module.js';
import { CookiesModule } from '../cookies/cookies.module.js';

@Module({
  imports: [ManifestsModule, HistoryModule, CookiesModule],
  controllers: [RunsController],
  providers: [RunsService]
})
export class RunsModule {}
