import { Controller, Get, Param, Post } from '@nestjs/common';
import { ManifestsService } from './manifests.service.js';

@Controller('scripts')
export class ManifestsController {
  constructor(private readonly manifests: ManifestsService) {}

  @Get()
  findAll() {
    return this.manifests.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.manifests.findOne(id);
  }

  @Post('reload')
  reload() {
    return this.manifests.reload().then(() => ({ ok: true }));
  }
}
