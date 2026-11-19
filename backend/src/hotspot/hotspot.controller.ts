// 灵感引擎路由：内容池 / 关键词 / 竞品 / 拆解 / 复刻文案 / 视频工坊 / 我的音色 / 达人匹配 / 会话管理
import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, Req, UploadedFile, UseGuards, UseInterceptors, ForbiddenException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Request } from 'express';
import { HotspotService } from './hotspot.service';
import { BreakdownService } from './breakdown.service';
import { VideoService } from './video.service';
import { VoiceService } from './voice.service';
import { MatchService } from './match.service';
import { CreationService } from './creation.service';
import { SessionStore } from './scraper/session.store';
import { BrandAccessGuard } from '../contentpro/brand-access.guard';

const num = (v?: string | number, d?: number) => (v === undefined || v === '' ? d : Number(v));

@Controller('hotspot')
@UseGuards(JwtAuthGuard, BrandAccessGuard)
export class HotspotController {
  constructor(
    private hotspot: HotspotService,
    private breakdown: BreakdownService,
    private video: VideoService,
    private voice: VoiceService,
    private match: MatchService,
    private creation: CreationService,
    private sessions: SessionStore,
  ) {}

  private me(req: Request) {
    return req.user as { id: number; role: string };
  }

  // ─── 内容池 ─────────────────────────────────────────────────────────
  @Get('contents')
  contents(
    @Query()
    q: {
      brandId?: string;
      platform?: string;
      sourceType?: string;
      keyword?: string;
      breakdown?: string;
      sort?: string;
      page?: string;
      pageSize?: string;
    },
  ) {
    return this.hotspot.contents({
      brandId: num(q.brandId, 1)!,
      platform: q.platform,
      sourceType: q.sourceType,
      keyword: q.keyword,
      breakdown: q.breakdown,
      sort: q.sort,
      page: num(q.page, 1),
      pageSize: num(q.pageSize, 24),
    });
  }

  @Get('contents/:id')
  contentDetail(@Query('brandId') brandId?: string, @Param('id', ParseIntPipe) id?: number) {
    return this.hotspot.contentDetail(num(brandId, 1)!, id!);
  }

  /** 本机抓取结果导入（小红书等平台在服务器 IP 会被风控，抓取只在本机执行后推送） */
  @Post('contents/import')
  importContents(@Req() req: Request, @Body() body: { brandId?: number; sourceType?: string; sourceKeyword?: string; items: Record<string, unknown>[] }) {
    if (this.me(req).role !== 'ADMIN') throw new ForbiddenException('仅超级管理员可导入抓取结果');
    return this.hotspot.importContents({
      brandId: Number(body.brandId ?? 1),
      sourceType: body.sourceType ?? 'search',
      sourceKeyword: body.sourceKeyword,
      items: (body.items ?? []) as never[],
    });
  }

  // ─── 抓取触发 ────────────────────────────────────────────────────────
  @Post('scrape/run')
  scrapeRun(@Body() body: { brandId: number; platform: string; keyword: string }) {
    return this.hotspot.scrapeNow(Number(body.brandId ?? 1), body.platform, String(body.keyword ?? '').trim());
  }

  @Post('scrape/round')
  scrapeRound() {
    return this.hotspot.runScrapeRound();
  }

  @Get('scrape/status')
  scrapeStatus() {
    return this.hotspot.roundStatus();
  }

  // ─── 关键词 ─────────────────────────────────────────────────────────
  @Get('keywords')
  keywords(@Query('brandId') brandId?: string) {
    return this.hotspot.keywords(num(brandId, 1)!);
  }

  @Post('keywords')
  addKeyword(@Body() body: { brandId?: number; keyword: string; platforms?: string[] }) {
    return this.hotspot.addKeyword(Number(body.brandId ?? 1), body.keyword, body.platforms);
  }

  @Put('keywords/:id')
  updateKeyword(@Param('id', ParseIntPipe) id: number, @Body() body: { brandId?: number; enabled?: boolean; platforms?: string[] }) {
    return this.hotspot.updateKeyword(Number(body.brandId ?? 1), id, body);
  }

  @Delete('keywords/:id')
  deleteKeyword(@Param('id', ParseIntPipe) id: number, @Query('brandId') brandId?: string) {
    return this.hotspot.deleteKeyword(num(brandId, 1)!, id);
  }

  // ─── 竞品 ───────────────────────────────────────────────────────────
  @Get('competitors')
  competitors(@Query('brandId') brandId?: string) {
    return this.hotspot.competitors(num(brandId, 1)!);
  }

  @Post('competitors/parse')
  parseCompetitor(@Body() body: { brandId?: number; platform: string; url: string; alias?: string; note?: string }) {
    return this.hotspot.parseCompetitor(
      Number(body.brandId ?? 1),
      body.platform,
      body.url,
      body.alias,
      body.note,
    );
  }

  @Post('competitors/:id/sync')
  syncCompetitor(@Param('id', ParseIntPipe) id: number, @Query('brandId') brandId?: string) {
    return this.hotspot.syncCompetitor(id, num(brandId, 1)!);
  }

  @Put('competitors/:id')
  toggleCompetitor(@Param('id', ParseIntPipe) id: number, @Body() body: { brandId?: number; enabled: boolean }) {
    return this.hotspot.toggleCompetitor(Number(body.brandId ?? 1), id, body.enabled);
  }

  @Delete('competitors/:id')
  deleteCompetitor(@Param('id', ParseIntPipe) id: number, @Query('brandId') brandId?: string) {
    return this.hotspot.deleteCompetitor(num(brandId, 1)!, id);
  }

  // ─── 拆解 ───────────────────────────────────────────────────────────
  @Post('breakdown')
  requestBreakdown(@Body() body: { brandId?: number; contentId: number }) {
    return this.breakdown.request(Number(body.contentId), Number(body.brandId ?? 1));
  }

  @Get('breakdowns')
  breakdowns(
    @Query()
    q: { brandId?: string; status?: string; platform?: string; page?: string; pageSize?: string },
  ) {
    return this.breakdown.list(num(brandIdNum(q), 1)!, {
      status: q.status,
      platform: q.platform,
      page: num(q.page, 1),
      pageSize: num(q.pageSize, 20),
    });
  }

  // ─── 爆款复刻文案（落 XhsHistory 审核流）────────────────────────────
  @Post('creation/article')
  generateArticle(
    @Req() req: Request,
    @Body()
    body: {
      brandId?: number;
      breakdownId: number;
      productId: number;
      strategyId?: number | null;
      extra?: string;
      wordCount?: string | null;
    },
  ) {
    return this.creation.generateFromBreakdown({
      brandId: Number(body.brandId ?? 1),
      userId: this.me(req).id,
      breakdownId: Number(body.breakdownId),
      productId: Number(body.productId),
      strategyId: body.strategyId ?? null,
      extra: body.extra,
      wordCount: body.wordCount ?? null,
    });
  }

  // ─── 视频工坊 ───────────────────────────────────────────────────────
  // 我的音色（路由在前，避免被下方 voices 相关段匹配）
  @Post('voices/sample')
  @UseInterceptors(FileInterceptor('file'))
  uploadVoiceSample(
    @Query('brandId') brandId?: string,
    @UploadedFile() file?: { originalname?: string; size?: number; buffer?: Buffer },
  ) {
    return this.voice.saveSample(num(brandId, 1)!, file);
  }

  @Post('voices')
  createCustomVoice(
    @Req() req: Request,
    @Body() body: { brandId?: number; name?: string; sampleUrl?: string; consent?: boolean },
  ) {
    return this.voice.create(Number(body.brandId ?? 1), this.me(req).id, body);
  }

  @Get('voices/custom')
  listCustomVoices(@Query('brandId') brandId?: string) {
    return this.voice.list(num(brandId, 1)!);
  }

  @Post('voices/custom/sync')
  syncVoices(@Query('brandId') brandId?: string) {
    return this.voice.sync(num(brandId, 1)!);
  }

  @Post('voices/custom/:id/preview')
  previewCustomVoice(@Param('id', ParseIntPipe) id: number, @Query('brandId') brandId?: string) {
    return this.voice.preview(num(brandId, 1)!, id);
  }

  @Delete('voices/custom/:id')
  deleteCustomVoice(@Param('id', ParseIntPipe) id: number, @Query('brandId') brandId?: string) {
    return this.voice.disable(num(brandId, 1)!, id);
  }

  @Get('voices')
  voices(@Query('brandId') brandId?: string) {
    return this.video.voices(num(brandId, 1)!);
  }

  @Post('videos/voice-preview')
  voicePreview(@Body() body: { voice?: string; text?: string }) {
    return this.video.voicePreview(body.voice, body.text);
  }

  @Post('videos/generate')
  generateVideo(
    @Req() req: Request,
    @Body()
    body: { brandId?: number; productId: number; breakdownId?: number; hotContentId?: number; title?: string; voice?: string; engine?: string },
  ) {
    return this.video.createTask({
      brandId: Number(body.brandId ?? 1),
      userId: this.me(req).id,
      productId: Number(body.productId),
      breakdownId: body.breakdownId,
      hotContentId: body.hotContentId,
      title: body.title,
      voice: body.voice,
      engine: body.engine,
    });
  }

  @Get('videos')
  videos(@Query() q: { brandId?: string; status?: string; page?: string; pageSize?: string }) {
    return this.video.tasks(num(brandIdNum(q), 1)!, {
      status: q.status,
      page: num(q.page, 1),
      pageSize: num(q.pageSize, 20),
    });
  }

  @Post('videos/:id/retry')
  retryVideo(@Req() req: Request, @Param('id', ParseIntPipe) id: number, @Query('brandId') brandId?: string) {
    return this.video.retry(num(brandId, 1)!, id, this.me(req).id);
  }

  @Delete('videos/:id')
  removeVideo(@Param('id', ParseIntPipe) id: number, @Query('brandId') brandId?: string) {
    return this.video.remove(num(brandId, 1)!, id);
  }

  /** 品牌自有视频素材库（视频工坊预览；混剪/AI成片的素材源，MaterialVideo 表） */
  @Get('material-videos')
  materialVideos(@Query() q: { brandId?: string; page?: string; pageSize?: string }) {
    return this.video.materialVideos(num(brandIdNum(q), 1)!, {
      page: num(q.page, 1),
      pageSize: num(q.pageSize, 24),
    });
  }

  /** 上传品牌视频素材（mp4/mov/webm/m4v，单文件 ≤ 500MB） */
  @Post('material-videos/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 500 * 1024 * 1024 },
      fileFilter: (_req: unknown, file: { originalname: string }, cb: (err: Error | null, acceptFile: boolean) => void) =>
        cb(null, /\.(mp4|mov|webm|m4v)$/i.test(file.originalname)),
      storage: materialVideoDiskStorage(),
    }),
  )
  uploadMaterialVideo(
    @UploadedFile() file: { path: string; originalname?: string; size?: number } | undefined,
    @Query('brandId') brandId?: string,
    @Query('tags') tags?: string,
  ) {
    return this.video.uploadMaterialVideo(num(brandId, 1)!, file, tags);
  }

  @Delete('material-videos/:id')
  removeMaterialVideo(@Param('id', ParseIntPipe) id: number, @Query('brandId') brandId?: string) {
    return this.video.removeMaterialVideo(num(brandId, 1)!, id);
  }

  // ─── 达人匹配 ───────────────────────────────────────────────────────
  @Post('match/run')
  matchRun(@Req() req: Request, @Body() body: { brandId?: number; productId: number; topK?: number }) {
    return this.match.run({
      brandId: Number(body.brandId ?? 1),
      productId: Number(body.productId),
      userId: this.me(req).id,
      topK: body.topK,
    });
  }

  @Get('match')
  matchList(@Query() q: { brandId?: string; productId?: string; status?: string; page?: string; pageSize?: string }) {
    return this.match.list(num(brandIdNum(q), 1)!, {
      productId: q.productId ? Number(q.productId) : undefined,
      status: q.status,
      page: num(q.page, 1),
      pageSize: num(q.pageSize, 30),
    });
  }

  @Put('match/:id/status')
  matchStatus(@Param('id', ParseIntPipe) id: number, @Body() body: { brandId?: number; status: string }) {
    return this.match.updateStatus(Number(body.brandId ?? 1), id, body.status);
  }

  // ─── 平台会话（本机登录脚本推送；仅 ADMIN 可写）─────────────────────
  @Get('sessions')
  sessionList() {
    return this.sessions.list();
  }

  @Post('sessions')
  pushSession(
    @Req() req: Request,
    @Body() body: { platform: string; label?: string; brandId?: number; storageState: string | object; note?: string },
  ) {
    if (this.me(req).role !== 'ADMIN') throw new ForbiddenException('仅超级管理员可推送登录态');
    const state = typeof body.storageState === 'string' ? body.storageState : JSON.stringify(body.storageState);
    JSON.parse(state); // 合法性校验
    return this.sessions.save(body.platform, body.label ?? '默认', Number(body.brandId ?? 1), state, body.note);
  }

  @Delete('sessions/:id')
  removeSession(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    if (this.me(req).role !== 'ADMIN') throw new ForbiddenException('仅超级管理员可删除登录态');
    return this.sessions.remove(id);
  }
}

function brandIdNum(q: Record<string, string | undefined>) {
  return num(q.brandId, 1);
}

/** 品牌视频素材上传的 multer 磁盘存储（落 _tmp，由 service 移入品牌目录） */
function materialVideoDiskStorage() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { diskStorage } = require('multer');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { materialVideoDir } = require('./media.util') as typeof import('./media.util');
  return diskStorage({
    destination: (_req: unknown, _file: unknown, cb: (err: null, dir: string) => void) => {
      try {
        cb(null, materialVideoDir());
      } catch (e) {
        cb(e as null, '');
      }
    },
    filename: (_req: unknown, file: { originalname: string }, cb: (err: null, name: string) => void) => {
      const ext = (file.originalname || '').match(/\.(mp4|mov|webm|m4v)$/i)?.[0]?.toLowerCase() ?? '.mp4';
      cb(null, `up_${Date.now()}_${Math.floor(Math.random() * 1e6)}${ext}`);
    },
  });
}
