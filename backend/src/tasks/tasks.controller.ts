import { Body, Controller, Delete, Get, Param, Post, Put, UploadedFile, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { TasksService } from './tasks.service.js';

interface UploadedFileLike {
  originalname: string;
  buffer: Buffer;
}

@Controller('scripts/:id/tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  list(@Param('id') id: string) {
    return this.tasks.list(id);
  }

  @Post()
  create(@Param('id') id: string, @Body() body: { name: string }) {
    return this.tasks.create(id, body.name).then(() => ({ ok: true }));
  }

  @Delete(':task')
  remove(@Param('id') id: string, @Param('task') task: string) {
    return this.tasks.remove(id, task).then(() => ({ ok: true }));
  }

  @Get(':task/files')
  listFiles(@Param('id') id: string, @Param('task') task: string) {
    return this.tasks.listFiles(id, task);
  }

  @Post(':task/files/own')
  @UseInterceptors(FileInterceptor('file'))
  async saveOwn(@Param('id') id: string, @Param('task') task: string, @UploadedFile() file: UploadedFileLike) {
    await this.tasks.saveOwn(id, task, file.buffer);
    return { ok: true };
  }

  @Post(':task/files/competitors')
  @UseInterceptors(FilesInterceptor('files', 50))
  async saveCompetitors(
    @Param('id') id: string,
    @Param('task') task: string,
    @UploadedFiles() files: UploadedFileLike[]
  ) {
    await this.tasks.saveCompetitors(
      id,
      task,
      files.map((f) => ({ originalname: f.originalname, buffer: f.buffer }))
    );
    return { ok: true };
  }

  @Get(':task/query')
  async getQuery(@Param('id') id: string, @Param('task') task: string) {
    return { text: await this.tasks.getQuery(id, task) };
  }

  @Put(':task/query')
  async saveQuery(@Param('id') id: string, @Param('task') task: string, @Body() body: { text: string }) {
    await this.tasks.saveQuery(id, task, body.text ?? '');
    return { ok: true };
  }

  @Delete(':task/files/:fileName')
  async deleteFile(@Param('id') id: string, @Param('task') task: string, @Param('fileName') fileName: string) {
    await this.tasks.deleteFile(id, task, fileName);
    return { ok: true };
  }
}
