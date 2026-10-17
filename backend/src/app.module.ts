import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { ManifestsModule } from './manifests/manifests.module.js';
import { RunsModule } from './runs/runs.module.js';
import { HistoryModule } from './history/history.module.js';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), ManifestsModule, HistoryModule, RunsModule],
  controllers: [AppController],
  providers: [AppService]
})
export class AppModule {}
