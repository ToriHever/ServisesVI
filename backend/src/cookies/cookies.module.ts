import { Module } from '@nestjs/common';
import { CookiesService } from './cookies.service.js';
import { CookiesController } from './cookies.controller.js';
import { ManifestsModule } from '../manifests/manifests.module.js';

@Module({
  imports: [ManifestsModule],
  controllers: [CookiesController],
  providers: [CookiesService],
  exports: [CookiesService]
})
export class CookiesModule {}
