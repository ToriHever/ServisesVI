import { Module } from '@nestjs/common';
import { ManifestsService } from './manifests.service.js';
import { ManifestsController } from './manifests.controller.js';

@Module({
  controllers: [ManifestsController],
  providers: [ManifestsService],
  exports: [ManifestsService]
})
export class ManifestsModule {}
