import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { extname } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import { randomUUID } from 'crypto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ContentproService } from './contentpro.service';
import {
  BatchGenerateDto,
  ContentTaskDto,
  GenerateArticleDto,
  MaterialImageAssignDto,
  MaterialImageImportDto,
  MaterialSetDto,
  MaterialTagDto,
  SaveArticleDto,
  StrategyDto,
} from './dto/contentpro.dto';

const UPLOAD_ROOT = process.env.UPLOAD_ROOT
  ? process.env.UPLOAD_ROOT
  : // dist/contentpro/contentpro.controller.js → backend/uploads
    require('path').resolve(__dirname, '..', '..', 'uploads');
const ALLOWED_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp']);

@Controller()
@UseGuards(JwtAuthGuard)
export class ContentproController {
  constructor(private service: ContentproService) {}

  // ─── 素材库 ──────────────────────────────────────────────────────
  @Get('content-pro/material-tags')
  tags(@Query('brandId') brandId?: string) {
    return this.service.tags(Number(brandId ?? 1));
  }

  @Post('content-pro/material-tags')
  createTag(@Body() dto: MaterialTagDto, @Query('brandId') brandId?: string) {
    return this.service.createTag(Number(brandId ?? 1), dto);
  }

  @Put('content-pro/material-tags/:id')
  updateTag(@Param('id', ParseIntPipe) id: number, @Body() dto: MaterialTagDto) {
    return this.service.updateTag(id, dto);
  }

  @Post('content-pro/material-tags/batch-delete')
  deleteTags(@Body() body: { ids: number[] }) {
    return this.service.deleteTags(body.ids ?? []);
  }

  @Get('content-pro/material-sets')
  sets(@Query('brandId') brandId?: string) {
    return this.service.sets(Number(brandId ?? 1));
  }

  @Post('content-pro/material-sets')
  createSet(@Body() dto: MaterialSetDto, @Query('brandId') brandId?: string) {
    return this.service.createSet(Number(brandId ?? 1), dto);
  }

  @Put('content-pro/material-sets/:id')
  updateSet(@Param('id', ParseIntPipe) id: number, @Body() dto: MaterialSetDto) {
    return this.service.updateSet(id, dto);
  }

  @Post('content-pro/material-sets/batch-delete')
  deleteSets(@Body() body: { ids: number[] }) {
    return this.service.deleteSets(body.ids ?? []);
  }

  @Get('content-pro/material-images')
  images(
    @Query()
    query: {
      brandId?: string;
      setId?: string;
      typeId?: string;
      unassigned?: string;
      keyword?: string;
      page?: string;
      pageSize?: string;
    },
  ) {
    return this.service.images({ ...query, brandId: Number(query.brandId ?? 1) });
  }

  @Post('content-pro/material-images/import')
  importImages(@Body() dto: MaterialImageImportDto, @Query('brandId') brandId?: string) {
    return this.service.importImages(Number(brandId ?? 1), dto);
  }

  @Put('content-pro/material-images/:id')
  updateImage(@Param('id', ParseIntPipe) id: number, @Body() dto: Record<string, unknown>) {
    return this.service.updateImage(id, dto as never);
  }

  @Post('content-pro/material-images/batch-assign')
  assignImages(@Body() dto: MaterialImageAssignDto) {
    return this.service.assignImages(dto);
  }

  @Post('content-pro/material-images/batch-delete')
  deleteImages(@Body() body: { ids: number[] }) {
    return this.service.deleteImages(body.ids ?? []);
  }

  @Post('content-pro/upload')
  @UseInterceptors(FileInterceptor('file'))
  upload(@UploadedFile() file: unknown, @Query('brandId') brandId?: string) {
    const f = file as { originalname?: string; buffer?: Buffer } | undefined;
    if (!f?.buffer) {
      return { url: null, error: 'no file' };
    }
    const ext = extname(f.originalname ?? '').toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      return { url: null, error: '仅支持 png/jpg/jpeg/webp' };
    }
    const dir = String(brandId ?? 1);
    const target = require('path').join(UPLOAD_ROOT, 'materials', dir);
    mkdirSync(target, { recursive: true });
    const filename = `${randomUUID()}${ext}`;
    writeFileSync(require('path').join(target, filename), f.buffer);
    return { url: `/uploads/materials/${dir}/${filename}` };
  }

  @Post('content-pro/upload-cover')
  @UseInterceptors(FileInterceptor('file'))
  uploadCover(@UploadedFile() file: unknown, @Query('brandId') brandId?: string) {
    return this.upload(file, brandId);
  }

  // ─── 创作策略 ────────────────────────────────────────────────────
  @Get('content-pro/strategies')
  strategies(@Query('brandId') brandId?: string) {
    return this.service.strategies(Number(brandId ?? 1));
  }

  @Post('content-pro/strategies')
  createStrategy(@Body() dto: StrategyDto, @Req() req: Request, @Query('brandId') brandId?: string) {
    const user = req.user as { id: number };
    return this.service.createStrategy(Number(brandId ?? 1), dto as never, user.id);
  }

  @Put('content-pro/strategies/:id')
  updateStrategy(@Param('id', ParseIntPipe) id: number, @Body() dto: Partial<StrategyDto>) {
    return this.service.updateStrategy(id, dto as Record<string, unknown>);
  }

  @Patch('content-pro/strategies/:id/toggle')
  toggleStrategy(@Param('id', ParseIntPipe) id: number, @Body() body: { enabled: boolean }) {
    return this.service.updateStrategy(id, { enabled: body.enabled });
  }

  @Delete('content-pro/strategies/:id')
  deleteStrategy(@Param('id', ParseIntPipe) id: number) {
    return this.service.deleteStrategy(id);
  }

  // ─── AI 生成 / 历史 ──────────────────────────────────────────────
  @Get('content-pro/ai/health')
  aiHealth() {
    return this.service.aiHealth();
  }

  @Post('content-pro/ai/generate-article')
  generate(@Body() dto: GenerateArticleDto, @Query('brandId') brandId?: string) {
    return this.service.generate({ ...dto, brandId: Number(brandId ?? 1) });
  }

  @Get('content-pro/ai/random-images')
  randomImages(
    @Query('brandId') brandId?: string,
    @Query('productId') productId?: string,
    @Query('num') num?: string,
  ) {
    return this.service.randomImages(Number(brandId ?? 1), productId, num);
  }

  @Get('content-pro/history/xhs')
  history(
    @Query()
    query: {
      brandId?: string;
      keyword?: string;
      status?: string;
      taskId?: string;
      page?: string;
      pageSize?: string;
    },
  ) {
    return this.service.history({ ...query, brandId: Number(query.brandId ?? 1) });
  }

  @Get('content-pro/history/xhs/:id')
  historyDetail(@Param('id', ParseIntPipe) id: number, @Query('brandId') brandId?: string) {
    return this.service.historyDetail(Number(brandId ?? 1), id);
  }

  @Post('content-pro/history/xhs')
  saveHistory(@Body() dto: SaveArticleDto, @Req() req: Request, @Query('brandId') brandId?: string) {
    const user = req.user as { id: number };
    return this.service.saveHistory(Number(brandId ?? 1), dto, user.id);
  }

  @Delete('content-pro/history/xhs/:id')
  deleteHistory(@Param('id', ParseIntPipe) id: number) {
    return this.service.deleteHistory(id);
  }

  // ─── 批量图文 ────────────────────────────────────────────────────
  @Post('content-pro/batch-generate')
  batchGenerate(@Body() dto: BatchGenerateDto, @Req() req: Request, @Query('brandId') brandId?: string) {
    const user = req.user as { id: number };
    return this.service.batchGenerate(Number(brandId ?? 1), dto, user.id);
  }

  @Get('content-pro/batch-tasks')
  batchTasks(
    @Query() query: { brandId?: string; page?: string; page_size?: string; status?: string },
  ) {
    return this.service.batchTasks(Number(query.brandId ?? 1), query);
  }

  // ─── 内容创作任务（任务分发）────────────────────────────────────
  @Get('content-tasks')
  contentTasks(
    @Query()
    query: {
      brandId?: string;
      keyword?: string;
      status?: string;
      hideVoided?: string;
      page?: string;
      page_size?: string;
    },
  ) {
    return this.service.contentTasks({ ...query, brandId: Number(query.brandId ?? 1) });
  }

  @Post('content-tasks')
  createContentTask(
    @Body() dto: ContentTaskDto,
    @Req() req: Request,
    @Query('brandId') brandId?: string,
  ) {
    const user = req.user as { id: number };
    return this.service.createContentTask(Number(brandId ?? 1), dto, user.id);
  }

  @Get('content-tasks/:id')
  contentTaskDetail(@Param('id', ParseIntPipe) id: number, @Query('brandId') brandId?: string) {
    return this.service.contentTaskDetail(Number(brandId ?? 1), id);
  }

  @Post('content-tasks/:id/void')
  voidContentTask(@Param('id', ParseIntPipe) id: number, @Query('brandId') brandId?: string) {
    return this.service.voidContentTask(Number(brandId ?? 1), id);
  }
}
