import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service.js';
import { TasksController } from './tasks.controller.js';
import { ManifestsModule } from '../manifests/manifests.module.js';

@Module({
  imports: [ManifestsModule],
  controllers: [TasksController],
  providers: [TasksService]
})
export class TasksModule {}
