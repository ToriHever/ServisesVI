import { Body, Controller, Get, NotFoundException, Param, Put } from '@nestjs/common';
import { CookiesService } from './cookies.service.js';

@Controller('cookies')
export class CookiesController {
  constructor(private readonly cookies: CookiesService) {}

  @Get()
  list() {
    return this.cookies.list();
  }

  @Get(':key')
  async get(@Param('key') key: string) {
    const content = await this.cookies.get(key);
    if (content === null) {
      throw new NotFoundException(`Cookies для "${key}" ещё не сохранены`);
    }
    return { key, content };
  }

  @Put(':key')
  async set(@Param('key') key: string, @Body() body: { content: string }) {
    await this.cookies.set(key, body.content ?? '');
    return { ok: true };
  }
}
