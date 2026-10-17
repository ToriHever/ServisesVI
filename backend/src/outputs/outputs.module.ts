import { Module } from '@nestjs/common';
import { OutputsService } from './outputs.service.js';
import { OutputsController } from './outputs.controller.js';
import { ManifestsModule } from '../manifests/manifests.module.js';

@Module({
  imports: [ManifestsModule],
  controllers: [OutputsController],
  providers: [OutputsService]
})
export class OutputsModule {}
