// 智能混剪视频生成：拆解/产品 → LLM 分镜脚本 → 素材匹配 → TTS 配音 → ffmpeg 合成 15-30s 竖版视频
// 进程内串行队列；计费走 QuotaService（失败退回）
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { QuotaService } from '../contentpro/quota.service';
import { chatJson, llmEnabled } from './llm.util';
import { buildAss, materialVideoDir, probeDurationSec, runFfmpeg, subtitleFont, uploadRoot } from './media.util';
import { sparkCloneTts, sparkSeedanceGenerate, sparkSpeakerExists, sparkSpeakers, sparkTts } from './spark.tts';
import { cogConfigured, cogVideoGenerate } from './cogvideo';
import { VoiceService } from './voice.service';

/** 下拉收录的豆包音色上限（中文·视频配音场景优先） */
const DOUBAO_VOICE_MAX = Number(process.env.DOUBAO_VOICE_MAX ?? 18);
const VIDEO_AIGC_COST = Number(process.env.VIDEO_AIGC_COST ?? 50);
/** AI 成片每段固定 5 秒（CogVideoX 单段时长） */
const AIGC_SEG_SEC = 5;

/** AI 成片视频生成通道：sparkhub=Seedance（默认，走 spark-hub 平台）| zhipu=CogVideoX 直连 */
function videoGenProvider(): 'sparkhub' | 'zhipu' {
  const env = (process.env.VIDEO_GEN_PROVIDER ?? '').trim().toLowerCase();
  if (env === 'zhipu') return 'zhipu';
  if (env === 'sparkhub' || env === '') return 'sparkhub';
  return 'zhipu';
}
/** AI 成片是否可用（任一通道已配置即可） */
const aigcConfigured = () => cogConfigured() || Boolean((process.env.SPARKHUB_API_KEY ?? '').trim());
/** 首帧图公网前缀：spark-hub Seedance 需要可公开访问的图片 URL（生产配 nginx 域名；本地不配则纯文生视频） */
const publicBaseUrl = () => (process.env.PUBLIC_BASE_URL ?? '').trim().replace(/\/+$/, '');

const VIDEO_COST = Number(process.env.VIDEO_QUOTA_COST ?? 10);
const MIN_TOTAL_SEC = Number(process.env.VIDEO_MIN_SEC ?? 15);
const MAX_TOTAL_SEC = Number(process.env.VIDEO_MAX_SEC ?? 30);
const WIDTH = 720;
const HEIGHT = 1280;
const FPS = 30;

/** 可挑选的 TTS 音色（edge-tts）；TTS_VOICE 仍是全局兜底默认 */
export const TTS_VOICES = [
  { id: 'zh-CN-XiaoxiaoNeural', name: '晓晓', gender: '女', style: '温暖亲切' },
  { id: 'zh-CN-XiaoyiNeural', name: '晓伊', gender: '女', style: '活泼甜美' },
  { id: 'zh-CN-YunxiNeural', name: '云希', gender: '男', style: '阳光年轻' },
  { id: 'zh-CN-YunjianNeural', name: '云健', gender: '男', style: '成熟浑厚' },
  { id: 'zh-CN-YunyangNeural', name: '云扬', gender: '男', style: '专业播报' },
  { id: 'zh-CN-YunxiaNeural', name: '云夏', gender: '男', style: '少年音' },
  { id: 'zh-CN-liaoning-XiaobeiNeural', name: '小北', gender: '女', style: '东北话' },
  { id: 'zh-HK-HiuMaanNeural', name: '曼怡', gender: '女', style: '粤语' },
];
const VOICE_IDS = new Set(TTS_VOICES.map((v) => v.id));

interface Shot {
  durSec: number;
  voiceover: string;
  subtitle: string;
  mediaQuery: string;
  mediaType?: 'image' | 'video';
  mediaUrl?: string;
  /** AI 成片（engine=aigc）：喂给 CogVideoX 的画面提示词 */
  visualPrompt?: string;
}

interface Storyboard {
  title: string;
  shots: Shot[];
}

@Injectable()
export class VideoService {
  private readonly logger = new Logger(VideoService.name);
  private queue: number[] = [];
  private aigcQueue: number[] = [];
  private draining = false;
  private drainingAigc = false;

  constructor(
    private prisma: PrismaService,
    private quota: QuotaService,
    private customVoices: VoiceService,
  ) {}

  /** 创建任务：engine=mixcut 素材混剪（默认）/ engine=aigc CogVideoX 生成画面；按引擎扣算力 → 入对应队列 */
  async createTask(input: {
    brandId: number;
    userId: number;
    productId: number;
    breakdownId?: number;
    hotContentId?: number;
    title?: string;
    voice?: string;
    engine?: string;
    materialVideoIds?: number[];
    materialImageIds?: number[];
    focusPoints?: string[];
  }) {
    if (!llmEnabled()) throw new BadRequestException('LLM_API_KEY 未配置，无法生成分镜');
    const engine = input.engine === 'aigc' ? 'aigc' : 'mixcut';
    if (engine === 'aigc' && !aigcConfigured()) {
      throw new BadRequestException('AI成片未配置：请配置 COGVIDEO_API_KEY（智谱）或 SPARKHUB_API_KEY（Seedance）');
    }
    const product = await this.prisma.product.findFirst({
      where: { id: input.productId, brandId: input.brandId },
    });
    if (!product) throw new NotFoundException('产品不存在');
    if (input.voice && !VOICE_IDS.has(input.voice)) {
      if (input.voice.startsWith('S_')) {
        await this.customVoices.assertVoiceUsable(input.brandId, input.voice);
      } else if (!(await sparkSpeakerExists(input.voice).catch(() => false))) {
        throw new BadRequestException('不支持的音色');
      }
    }
    const cost = engine === 'aigc' ? VIDEO_AIGC_COST : VIDEO_COST;
    await this.quota.assertEnough(input.brandId, cost);
    await this.quota.consume(input.brandId, cost, input.userId, engine === 'aigc' ? 'AI成片' : '视频混剪');
    const task = await this.prisma.videoGenTask.create({
      data: {
        brandId: input.brandId,
        productId: input.productId,
        breakdownId: input.breakdownId ?? null,
        hotContentId: input.hotContentId ?? null,
        title: input.title ?? null,
        voice: input.voice ?? null,
        engine,
        status: 'queued',
        materialVideoIds: (input.materialVideoIds ?? []).slice(0, 20),
        materialImageIds: (input.materialImageIds ?? []).slice(0, 20),
        focusPoints: (input.focusPoints ?? []).map((s) => String(s).slice(0, 200)).slice(0, 20),
      },
    });
    this.enqueue(task.id, engine);
    return { id: task.id, status: task.status, cost, engine };
  }

  /** 音色清单（前端下拉）：edge 系统音色 + 豆包大模型音色 + 本工作区复刻音色 */
  async voices(brandId?: number) {
    const [custom, doubao] = await Promise.all([
      brandId ? this.customVoices.listReady(brandId).catch(() => []) : Promise.resolve([]),
      this.doubaoVoices().catch(() => []),
    ]);
    return {
      default: process.env.TTS_VOICE ?? 'zh-CN-XiaoxiaoNeural',
      items: [...TTS_VOICES.map((v) => ({ ...v, provider: 'edge' })), ...doubao, ...custom],
    };
  }

  /** 豆包大模型音色（中文·视频配音优先，来自 spark-hub 平台，带缓存） */
  private async doubaoVoices() {
    const list = await sparkSpeakers();
    const zh = list
      .filter((s) => s.voice_type.startsWith('zh_'))
      .sort((a, b) => {
        const av = (a.categories ?? []).includes('视频配音') ? 0 : 1;
        const bv = (b.categories ?? []).includes('视频配音') ? 0 : 1;
        return av - bv;
      })
      .slice(0, DOUBAO_VOICE_MAX);
    return zh.map((s) => ({
      id: s.voice_type,
      name: s.name,
      gender: s.gender,
      style: (s.categories ?? []).includes('视频配音') ? '视频配音' : (s.categories ?? [])[0] ?? '通用',
      provider: 'doubao',
    }));
  }

  /** 音色试听：生成一句短音频（同音色覆盖写，不堆积文件）；复刻/豆包音色走 spark-hub */
  async voicePreview(voice?: string, text?: string) {
    const line = (text ?? '大家好，今天给大家带来一款超值好物，喜欢的记得看到最后。').slice(0, 60);
    const outDir = path.join(uploadRoot(), 'hotspot', 'previews');
    fs.mkdirSync(outDir, { recursive: true });
    if (voice && voice.startsWith('S_')) {
      const fileName = `preview_${voice}.mp3`;
      fs.writeFileSync(path.join(outDir, fileName), await sparkCloneTts(line, voice));
      return { url: `/uploads/hotspot/previews/${fileName}`, voice };
    }
    if (voice && !VOICE_IDS.has(voice)) {
      const fileName = `preview_${voice.replace(/[^\w.-]/g, '_')}.mp3`;
      fs.writeFileSync(path.join(outDir, fileName), await sparkTts(line, voice));
      return { url: `/uploads/hotspot/previews/${fileName}`, voice };
    }
    const v = voice && VOICE_IDS.has(voice) ? voice : process.env.TTS_VOICE ?? 'zh-CN-XiaoxiaoNeural';
    const fileName = `preview_${v}.mp3`;
    const outPath = path.join(outDir, fileName);
    const { EdgeTTS } = (await import('node-edge-tts')) as {
      EdgeTTS: new (o?: Record<string, unknown>) => { ttsPromise: (t: string, p: string) => Promise<void> };
    };
    const tts = new EdgeTTS({ voice: v, lang: 'zh-CN', rate: process.env.TTS_RATE ?? 'default' });
    await tts.ttsPromise(line, outPath);
    return { url: `/uploads/hotspot/previews/${fileName}`, voice: v };
  }

  async tasks(brandId: number, q: { status?: string; page?: number; pageSize?: number }) {
    const page = Math.max(1, q.page ?? 1);
    const pageSize = Math.min(60, Math.max(1, q.pageSize ?? 20));
    const where = { brandId, ...(q.status ? { status: q.status } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.videoGenTask.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          breakdown: { select: { id: true, hook: true, styleTags: true } },
        },
      }),
      this.prisma.videoGenTask.count({ where }),
    ]);
    // product 是普通列非关系，单独取名称
    const productIds = [...new Set(rows.map((r) => r.productId))];
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, displayName: true },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));
    return {
      total,
      page,
      page_size: pageSize,
      items: rows.map((r) => {
        const p = productMap.get(r.productId);
        return {
        id: r.id,
        title: r.title ?? p?.displayName ?? p?.name ?? '',
        product: p ? p.displayName ?? p.name : '',
        engine: r.engine,
        voice: r.voice,
        status: r.status,
        script: r.script,
        audio_url: r.audioUrl,
        video_url: r.videoUrl,
        cover_url: r.coverUrl,
        duration_sec: r.durationSec,
        error_msg: r.errorMsg,
        breakdown: r.breakdown ? { id: r.breakdown.id, hook: r.breakdown.hook, style_tags: r.breakdown.styleTags } : null,
        created_at: r.createdAt,
        };
      }),
    };
  }

  async retry(brandId: number, id: number, userId: number) {
    const task = await this.prisma.videoGenTask.findFirst({ where: { id, brandId } });
    if (!task) throw new NotFoundException('任务不存在');
    if (task.status !== 'failed') throw new BadRequestException('仅失败任务可重试');
    await this.quota.assertEnough(brandId, task.engine === 'aigc' ? VIDEO_AIGC_COST : VIDEO_COST);
    await this.quota.consume(brandId, task.engine === 'aigc' ? VIDEO_AIGC_COST : VIDEO_COST, userId, task.engine === 'aigc' ? 'AI成片重试' : '视频混剪重试');
    await this.prisma.videoGenTask.update({
      where: { id },
      data: { status: 'queued', errorMsg: null },
    });
    this.enqueue(id, task.engine === 'aigc' ? 'aigc' : 'mixcut');
    return { id, status: 'queued' };
  }

  /** 品牌自有视频素材库列表（视频工坊「品牌素材库」预览；混剪/AI成片的素材源；支持按产品过滤） */
  async materialVideos(brandId: number, q: { page?: number; pageSize?: number; productNodeId?: number; noProduct?: string }) {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 24;
    const where = {
      brandId,
      ...(q.noProduct === '1'
        ? { productNodeId: null }
        : q.productNodeId
          ? { productNodeId: q.productNodeId }
          : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.materialVideo.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: { id: true, url: true, thumbUrl: true, durationSec: true, tags: true, productNodeId: true, createdAt: true },
      }),
      this.prisma.materialVideo.count({ where }),
    ]);
    return { total, page, page_size: pageSize, items: rows };
  }

  /** 上传品牌视频素材：multer 已落盘到 _tmp，此处移动到品牌目录并入 MaterialVideo */
  async uploadMaterialVideo(
    brandId: number,
    file: { path: string; originalname?: string; size?: number } | undefined,
    tagsCsv?: string,
    productNodeId?: number,
  ) {
    if (!file?.path) throw new BadRequestException('未收到视频文件');
    const ext = path.extname(file.originalname || '').toLowerCase() || '.mp4';
    const dir = materialVideoDir(brandId);
    const filename = `bv_${Date.now()}_${Math.floor(Math.random() * 1e6)}${ext}`;
    fs.renameSync(file.path, path.join(dir, filename));
    const tags = (tagsCsv ?? '')
      .split(/[,，、\s]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    const url = `/uploads/materials/brand-videos/${brandId}/${filename}`;
    const durationSec = await probeDurationSec(path.join(dir, filename));
    const row = await this.prisma.materialVideo.create({
      data: { brandId, url, tags: tags.length ? tags : ['品牌视频'], durationSec: durationSec ?? null, ...(productNodeId ? { productNodeId } : {}) },
    });
    this.logger.log(`品牌素材上传 brand=${brandId} -> ${url} (${Math.round((file.size ?? 0) / 1024 / 1024)}MB, ${durationSec ?? '?'}s)`);
    return { id: row.id, url: row.url, tags: row.tags, durationSec: row.durationSec };
  }

  /** 批量调整视频素材产品归属（素材库页用；productNodeId=null 表示移出产品） */
  async assignMaterialVideos(brandId: number, ids: number[], productNodeId: number | null) {
    if (!ids?.length) throw new BadRequestException('未选择素材');
    const r = await this.prisma.materialVideo.updateMany({
      where: { id: { in: ids }, brandId },
      data: { productNodeId: productNodeId ?? null },
    });
    return { count: r.count };
  }

  /** 删除品牌视频素材（仅删记录与引用，源文件保留在磁盘上） */
  async removeMaterialVideo(brandId: number, id: number) {
    const row = await this.prisma.materialVideo.findFirst({ where: { id, brandId } });
    if (!row) throw new NotFoundException('素材不存在');
    await this.prisma.materialVideo.delete({ where: { id: row.id } });
    return { id, deleted: true };
  }

  /** 删除任务（进行中的不允许删；已产出的视频文件保留在磁盘上不回收） */
  async remove(brandId: number, id: number) {
    const task = await this.prisma.videoGenTask.findFirst({ where: { id, brandId } });
    if (!task) throw new NotFoundException('任务不存在');
    if (['queued', 'scripting', 'rendering'].includes(task.status)) {
      throw new BadRequestException('任务进行中，等完成或失败后再删除');
    }
    await this.prisma.videoGenTask.delete({ where: { id } });
    return { id, deleted: true };
  }

  private enqueue(id: number, engine = 'mixcut') {
    if (engine === 'aigc') this.aigcQueue.push(id);
    else this.queue.push(id);
    void this.drain(engine === 'aigc' ? 'aigc' : 'mixcut');
  }

  /** 双队列：混剪（快任务）与 AI 成片（每段 1-3 分钟）互不阻塞 */
  private async drain(engine: 'mixcut' | 'aigc') {
    if (engine === 'aigc') {
      if (this.drainingAigc) return;
      this.drainingAigc = true;
    } else {
      if (this.draining) return;
      this.draining = true;
    }
    try {
      const take = () => (engine === 'aigc' ? this.aigcQueue.shift() : this.queue.shift());
      for (let id = take(); id !== undefined; id = take()) {
        try {
          if (engine === 'aigc') await this.runAigc(id);
          else await this.run(id);
        } catch (e) {
          const msg = (e as Error).message?.slice(0, 500) ?? 'unknown';
          this.logger.warn(`视频任务 #${id}(${engine}) 失败: ${msg.split('\n')[0]}`);
          const task = await this.prisma.videoGenTask.findUnique({ where: { id } });
          if (task && task.status !== 'done') {
            const cost = task.engine === 'aigc' ? VIDEO_AIGC_COST : VIDEO_COST;
            await this.prisma.videoGenTask.update({ where: { id }, data: { status: 'failed', errorMsg: msg } });
            await this.quota.refund(task.brandId, cost, undefined, `视频任务失败退回 #${id}`);
          }
        }
      }
    } finally {
      if (engine === 'aigc') this.drainingAigc = false;
      else this.draining = false;
    }
  }

  private async run(id: number) {
    const task = await this.prisma.videoGenTask.findUnique({ where: { id } });
    if (!task) return;
    const tmpDir = path.join(uploadRoot(), 'hotspot', 'tmp', `video_${id}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    try {
      // ── 1. 分镜脚本 ──
      await this.prisma.videoGenTask.update({ where: { id }, data: { status: 'scripting' } });
      const ctx = await this.gatherContext(task.breakdownId, task.hotContentId, task.brandId, task.productId);
      const board = await this.storyboard(ctx, task.title ?? undefined, task.focusPoints);

      // ── 2. 素材匹配（用户指定素材按镜头顺序优先占用，其余自动匹配）──
      await this.prisma.videoGenTask.update({ where: { id }, data: { status: 'rendering', script: board as object } });
      const assigned = await this.assignMedia(task.brandId, board.shots, task.productId, task.materialVideoIds, task.materialImageIds);

      // ── 3. TTS 配音（S_ 开头=复刻音色走克隆合成；豆包系走 doubao_tts_2_0；其余 edge-tts）──
      const voice = task.voice || process.env.TTS_VOICE || 'zh-CN-XiaoxiaoNeural';
      const rate = process.env.TTS_RATE ?? 'default';
      const { EdgeTTS } = (await import('node-edge-tts')) as { EdgeTTS: new (o?: Record<string, unknown>) => { ttsPromise: (t: string, p: string) => Promise<void> } };
      const audioFiles: string[] = [];
      const shotDur: number[] = [];
      for (let i = 0; i < assigned.length; i++) {
        const shot = assigned[i];
        const mp3 = path.join(tmpDir, `tts_${i}.mp3`);
        if (shot.voiceover?.trim()) {
          if (voice.startsWith('S_')) {
            fs.writeFileSync(mp3, await sparkCloneTts(shot.voiceover, voice));
          } else if (!VOICE_IDS.has(voice)) {
            fs.writeFileSync(mp3, await sparkTts(shot.voiceover, voice));
          } else {
            const tts = new EdgeTTS({ voice, lang: 'zh-CN', rate });
            await tts.ttsPromise(shot.voiceover, mp3);
          }
        }
        const ttsDur = fs.existsSync(mp3) ? ((await probeDurationSec(mp3)) ?? 0) : 0;
        // 镜头时长：至少容下配音+0.6s，至少 2.5s，文本很短时按字幕节奏 3s
        const dur = Math.max(2.5, Math.min(9, Math.round((ttsDur + 0.6) * 10) / 10 || 3));
        shotDur.push(dur);
        audioFiles.push(mp3);
      }
      let total = shotDur.reduce((a, b) => a + b, 0);
      // 总时长约束：超长等比压缩到上限，不足则按比例放宽镜头
      if (total > MAX_TOTAL_SEC) {
        const k = MAX_TOTAL_SEC / total;
        for (let i = 0; i < shotDur.length; i++) shotDur[i] = Math.max(1.8, Math.round(shotDur[i] * k * 10) / 10);
        total = shotDur.reduce((a, b) => a + b, 0);
      } else if (total < MIN_TOTAL_SEC) {
        const k = MIN_TOTAL_SEC / total;
        for (let i = 0; i < shotDur.length; i++) shotDur[i] = Math.round(shotDur[i] * k * 10) / 10;
        total = shotDur.reduce((a, b) => a + b, 0);
      }

      // ── 4. 逐镜头出片段（图片 KenBurns / 视频截取，统一 720x1280@30）──
      const segFiles: string[] = [];
      for (let i = 0; i < assigned.length; i++) {
        const seg = path.join(tmpDir, `seg_${i}.mp4`);
        const dur = shotDur[i];
        const scale = `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT},fps=${FPS},format=yuv420p`;
        if (assigned[i].mediaType === 'video') {
          await runFfmpeg(['-y', '-ss', '0', '-t', String(dur), '-i', assigned[i].mediaUrl!, '-vf', scale, '-an', '-c:v', 'libx264', '-preset', 'fast', seg]);
        } else {
          const frames = Math.max(2, Math.round(dur * FPS));
          // 先 4x 超采样再 zoompan：zoompan 位移在输入像素上取整，低分辨率画布会整帧抖动；高分辨率下取整不可见
          const upW = WIDTH * 4;
          const upH = HEIGHT * 4;
          const zoom = `zoompan=z='min(zoom+0.0016,1.22)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${WIDTH}x${HEIGHT}:fps=${FPS},format=yuv420p`;
          await runFfmpeg([
            '-y',
            '-loop', '1',
            '-i', assigned[i].mediaUrl!,
            '-vf', `scale=${upW}:${upH}:force_original_aspect_ratio=increase,crop=${upW}:${upH},${zoom}`,
            '-frames:v', String(frames),
            '-c:v', 'libx264', '-preset', 'fast',
            seg,
          ]);
        }
        segFiles.push(seg);
      }

      // ── 5. 拼接视频 + 拼接音频 + 烧字幕 + 输出（混剪/AI成片共用尾部）──
      const out = await this.assembleTail(id, tmpDir, segFiles, audioFiles, shotDur, assigned);
      await this.prisma.videoGenTask.update({
        where: { id },
        data: {
          status: 'done',
          videoUrl: out.videoUrl,
          coverUrl: out.coverUrl,
          durationSec: out.durationSec,
          script: assigned as object,
        },
      });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  /** 共用尾部：拼接片段 → 配音对齐 → 烧字幕/BGM → 输出成片与封面 */
  private async assembleTail(
    id: number,
    tmpDir: string,
    segFiles: string[],
    audioFiles: string[],
    shotDur: number[],
    shots: Shot[],
  ): Promise<{ videoUrl: string; coverUrl: string | null; durationSec: number }> {
    const concatList = path.join(tmpDir, 'concat.txt');
    fs.writeFileSync(concatList, segFiles.map((f) => `file '${f.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n'));
    const interV = path.join(tmpDir, 'inter_v.mp4');
    await runFfmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', concatList, '-c', 'copy', interV]);

    // 音频：TTS 片段按镜头时长对齐（不足补静音；超长自动变速塞入，绝不硬截断口播）
    const audioInputs: string[] = [];
    const filterParts: string[] = [];
    for (let i = 0; i < audioFiles.length; i++) {
      const padded = path.join(tmpDir, `tts_pad_${i}.m4a`);
      if (fs.existsSync(audioFiles[i])) {
        // 配音比镜头长时 atempo 加速（≤3x），而不是 -t 硬截——避免口播被砍半句
        const audioDur = (await probeDurationSec(audioFiles[i])) ?? shotDur[i];
        const tempo = audioDur > shotDur[i] + 0.05 ? Math.min(3, audioDur / shotDur[i]) : 1;
        const af =
          tempo > 1
            ? `atempo=${tempo.toFixed(3)},apad=whole_dur=${shotDur[i]}`
            : `apad=whole_dur=${shotDur[i]}`;
        await runFfmpeg(['-y', '-i', audioFiles[i], '-af', af, '-t', String(shotDur[i]), '-ar', '24000', '-ac', '1', '-b:a', '64k', padded]);
      } else {
        await runFfmpeg(['-y', '-f', 'lavfi', '-i', `anullsrc=r=24000:cl=mono`, '-t', String(shotDur[i]), '-b:a', '64k', padded]);
      }
      audioInputs.push(padded);
    }
    audioInputs.forEach((_, i) => filterParts.push(`[${i}:a]`));
    const voiceM4a = path.join(tmpDir, 'voice.m4a');
    const voiceArgs = ['-y'];
    for (const f of audioInputs) voiceArgs.push('-i', f);
    voiceArgs.push('-filter_complex', `${filterParts.join('')}concat=n=${audioInputs.length}:v=0:a=1[a]`, '-map', '[a]', '-c:a', 'aac', '-b:a', '128k', voiceM4a);
    await runFfmpeg(voiceArgs);

    // 字幕
    const font = subtitleFont();
    const subLines: { start: number; end: number; text: string }[] = [];
    let cursor = 0;
    shots.forEach((s, i) => {
      if (s.subtitle?.trim()) subLines.push({ start: cursor + 0.15, end: cursor + shotDur[i] - 0.15, text: s.subtitle.trim() });
      cursor += shotDur[i];
    });
    const outName = `hotspot_video_${id}_${randomUUID().slice(0, 8)}.mp4`;
    const outDir = path.join(uploadRoot(), 'hotspot', 'videos');
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, outName);
    const coverPath = path.join(outDir, outName.replace(/\.mp4$/, '.jpg'));

    const bgmPath = process.env.BGM_PATH && fs.existsSync(process.env.BGM_PATH) ? process.env.BGM_PATH : null;
    const assFile = path.join(tmpDir, 'subs.ass');
    if (subLines.length && font) fs.writeFileSync(assFile, buildAss(subLines, { fontName: font.family }), 'utf8');
    // Windows 盘符冒号在 filtergraph 里必须转义（C\:/...），否则 subtitles 滤镜解析错位
    const escFilterPath = (p: string) => p.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
    const subFilter = subLines.length && font
      ? `subtitles=filename='${escFilterPath(assFile)}':fontsdir='${escFilterPath(path.dirname(font.file))}'`
      : null;

    const finalArgs: string[] = ['-y', '-i', interV, '-i', voiceM4a];
    let filter = '';
    let mapAudio = '1:a';
    if (bgmPath) {
      finalArgs.push('-stream_loop', '-1', '-i', bgmPath);
      filter = `[2:a]volume=0.25[bgm];[1:a][bgm]amix=inputs=2:duration=first:dropout_transition=2[aout]`;
      mapAudio = '[aout]';
    }
    if (subFilter) filter = filter ? `${filter};[0:v]${subFilter}[vout]` : `[0:v]${subFilter}[vout]`;
    if (filter) {
      finalArgs.push('-filter_complex', filter, '-map', subFilter ? '[vout]' : '0:v', '-map', mapAudio);
    } else {
      finalArgs.push('-map', '0:v', '-map', mapAudio);
    }
    finalArgs.push('-shortest', '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-c:a', 'aac', '-movflags', '+faststart', outPath);
    await runFfmpeg(finalArgs);

    // 封面取首帧
    await runFfmpeg(['-y', '-ss', '0.4', '-i', outPath, '-frames:v', '1', '-q:v', '3', coverPath]).catch(() => {});

    const total = shotDur.reduce((a, b) => a + b, 0);
    const dur = (await probeDurationSec(outPath)) ?? Math.round(total);
    return {
      videoUrl: `/uploads/hotspot/videos/${outName}`,
      coverUrl: fs.existsSync(coverPath) ? `/uploads/hotspot/videos/${path.basename(coverPath)}` : null,
      durationSec: Math.round(dur),
    };
  }

  /** AI 成片（engine=aigc）：LLM 三段分镜 → CogVideoX 逐段生成画面（素材图作首帧）→ 共用尾部合成 */
  private async runAigc(id: number) {
    const task = await this.prisma.videoGenTask.findUnique({ where: { id } });
    if (!task) return;
    const tmpDir = path.join(uploadRoot(), 'hotspot', 'tmp', `video_${id}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    try {
      // ── 1. 分镜脚本（画面提示词导向）──
      await this.prisma.videoGenTask.update({ where: { id }, data: { status: 'scripting' } });
      const ctx = await this.gatherContext(task.breakdownId, task.hotContentId, task.brandId, task.productId);
      const board = await this.storyboardAigc(ctx, task.title ?? undefined, task.focusPoints);
      const shots = board.shots.map((s) => ({ ...s, durSec: AIGC_SEG_SEC }));
      await this.prisma.videoGenTask.update({ where: { id }, data: { status: 'rendering', script: shots as object } });

      // ── 2. 首帧图：用户指定素材优先，其次素材库匹配（没有则纯文生视频）──
      const frames = await this.pickAigcFrames(task.brandId, task.productId, shots, task.materialImageIds);
      const provider = videoGenProvider();
      const pubBase = publicBaseUrl();

      // ── 3. 逐段生成画面（sparkhub=Seedance 2.0 / zhipu=CogVideoX）──
      const voice = task.voice || process.env.TTS_VOICE || 'zh-CN-XiaoxiaoNeural';
      const rate = process.env.TTS_RATE ?? 'default';
      const { EdgeTTS } = (await import('node-edge-tts')) as { EdgeTTS: new (o?: Record<string, unknown>) => { ttsPromise: (t: string, p: string) => Promise<void> } };
      const segFiles: string[] = [];
      const audioFiles: string[] = [];
      for (let i = 0; i < shots.length; i++) {
        const shot = shots[i];
        await this.prisma.videoGenTask.update({
          where: { id },
          data: { status: 'rendering', errorMsg: `正在 AI 生成第 ${i + 1}/${shots.length} 段画面（${provider === 'sparkhub' ? 'Seedance' : 'CogVideoX'}，约 1-2 分钟/段）` },
        });
        const seg = path.join(tmpDir, `seg_${i}.mp4`);
        const raw = path.join(tmpDir, `raw_${i}.mp4`);
        let buf: Buffer;
        if (provider === 'sparkhub') {
          // Seedance 要求首帧为公网 URL；未配 PUBLIC_BASE_URL（本地）时退化为纯文生视频
          const firstUrl = frames[i].url && pubBase ? pubBase + frames[i].url : null;
          buf = await sparkSeedanceGenerate(shot.visualPrompt ?? shot.subtitle ?? shot.voiceover, {
            firstImageUrl: firstUrl,
            durationSec: AIGC_SEG_SEC,
          });
        } else {
          buf = await cogVideoGenerate(shot.visualPrompt ?? shot.subtitle ?? shot.voiceover, frames[i].local ?? null);
        }
        fs.writeFileSync(raw, buf);
        const scale = `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT},fps=${FPS},format=yuv420p`;
        await runFfmpeg(['-y', '-i', raw, '-t', String(AIGC_SEG_SEC), '-vf', scale, '-an', '-c:v', 'libx264', '-preset', 'fast', seg]);
        segFiles.push(seg);

        // 配音与画面并行度低，段内先出音频（复用统一音色路由）
        const mp3 = path.join(tmpDir, `tts_${i}.mp3`);
        if (shot.voiceover?.trim()) {
          if (voice.startsWith('S_')) {
            fs.writeFileSync(mp3, await sparkCloneTts(shot.voiceover, voice));
          } else if (!VOICE_IDS.has(voice)) {
            fs.writeFileSync(mp3, await sparkTts(shot.voiceover, voice));
          } else {
            const tts = new EdgeTTS({ voice, lang: 'zh-CN', rate });
            await tts.ttsPromise(shot.voiceover, mp3);
          }
        }
        audioFiles.push(mp3);
      }
      await this.prisma.videoGenTask.update({ where: { id }, data: { errorMsg: null } });
      const shotDur = shots.map(() => AIGC_SEG_SEC);

      // ── 4. 共用尾部合成 ──
      const out = await this.assembleTail(id, tmpDir, segFiles, audioFiles, shotDur, shots);
      await this.prisma.videoGenTask.update({
        where: { id },
        data: {
          status: 'done',
          videoUrl: out.videoUrl,
          coverUrl: out.coverUrl,
          durationSec: out.durationSec,
          script: shots as object,
        },
      });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  /** AI 成片分镜：固定 3 镜头 × 5 秒，每镜头给 CogVideoX 的画面提示词 */
  private async storyboardAigc(
    ctx: Awaited<ReturnType<typeof VideoService.prototype.gatherContext>>,
    titleOverride?: string,
    focusPoints: string[] = [],
  ): Promise<Storyboard> {
    const asArr = (v: unknown): string[] =>
      Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean).slice(0, 8) : [];
    const sys = [
      '你是竖屏带货短视频编导。输出一条 15 秒、3 个镜头的分镜脚本，每个镜头的画面将由 AI 视频模型（CogVideoX）生成。',
      '每个字段要求：',
      'visualPrompt 是直接喂给 AI 视频模型的画面提示词：主体+动作+镜头运动+光线+氛围，写实商业广告质感，竖版构图，禁止出现文字/字幕/贴纸等描述；',
      'voiceover 是该镜头口播（口语化，每句 ≤20 字）；subtitle 是烧录字幕（≤12 字，无标点）。',
      '三段节奏：第1段抓注意力钩子，第2段展示产品核心卖点，第3段行动号召/购买理由。',
      '输出严格 JSON：{"title":"视频标题(≤20字)","shots":[{"visualPrompt":"...","voiceover":"...","subtitle":"..."}]}（恰好 3 个 shots）',
    ].join('\n');
    const user = [
      ctx.product ? `产品：${ctx.product.displayName ?? ctx.product.name}` : '',
      ctx.product?.knowledge ? `产品知识（节选）：${ctx.product.knowledge.slice(0, 500)}` : '',
      ctx.strategy ? `人设方向：${asArr(ctx.strategy.persona).join('、')}` : '',
      ctx.strategy ? `产品卖点：${asArr(ctx.strategy.sellingPoints).join('；')}` : '',
      focusPoints.length ? `本次重点卖点/政策（口播与画面提示词围绕这些展开）：${focusPoints.join('；')}` : '',
      ctx.breakdown ? `爆款拆解参考：钩子 ${ctx.breakdown.hook ?? ''}；卖点 ${asArr(ctx.breakdown.sellingPoints).join('；')}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    const parsed = await chatJson<{ title?: string; shots?: { visualPrompt?: string; voiceover?: string; subtitle?: string }[] }>(sys, user, { temperature: 0.7 });
    const raw = parsed?.shots?.filter((s) => s?.visualPrompt || s?.voiceover) ?? [];
    if (!raw.length) throw new Error('分镜 JSON 解析失败');
    const shots = raw.slice(0, 3).map((s) => ({
      durSec: AIGC_SEG_SEC,
      voiceover: String(s?.voiceover ?? ''),
      subtitle: String(s?.subtitle ?? '').slice(0, 12),
      mediaQuery: '',
      visualPrompt: String(s?.visualPrompt ?? '').slice(0, 300),
    }));
    return { title: (titleOverride ?? parsed?.title ?? '').slice(0, 40), shots };
  }

  /** AI 成片首帧：用户指定图片优先按序作首帧；其余按提示词/产品名匹配，最多每段一张；素材库为空返回 null（纯文生视频） */
  private async pickAigcFrames(
    brandId: number,
    productId: number,
    shots: Shot[],
    pinnedImageIds: number[] = [],
  ): Promise<{ local: string | null; url: string | null }[]> {
    const images = await this.prisma.materialImage.findMany({
      where: { brandId, status: 1 },
      include: { type: { select: { name: true } } },
    });
    if (!images.length) return shots.map(() => ({ local: null, url: null }));
    const orderedPinned = pinnedImageIds
      .map((id) => images.find((m) => m.id === id))
      .filter((m): m is (typeof images)[number] => Boolean(m));
    const productName = String(
      (await this.prisma.product.findUnique({ where: { id: productId }, select: { name: true } }))?.name ?? '',
    );
    const hit = (haystack: string, query: string) => {
      const tokens = query.split(/[\s,，、/]+/).filter((t) => t.length >= 2);
      return tokens.some((t) => haystack.includes(t) || t.includes(haystack));
    };
    const used = new Set<number>();
    return shots.map((shot, i) => {
      // 用户勾选的图片按镜头顺序优先作首帧（勾选数多于镜头时截断，少于时其余镜头自动匹配）
      const pinnedImg = i < orderedPinned.length ? orderedPinned[i] : null;
      const query = `${shot.visualPrompt ?? ''} ${productName}`;
      const img =
        pinnedImg ??
        images.find((m) => !used.has(m.id) && hit(m.name ?? '', query)) ??
        images.find((m) => !used.has(m.id) && m.productNodeId === productId) ??
        images.find((m) => !used.has(m.id));
      if (!img) return { local: null, url: null };
      used.add(img.id);
      const local = this.resolveMediaFileSync(img.url, brandId);
      return { local, url: local ? img.url : null };
    });
  }

  /** /uploads/... → 本地文件路径（不下载外链；AI 成片首帧只用本地素材） */
  private resolveMediaFileSync(url: string, brandId: number): string | null {
    if (!url.startsWith('/uploads/')) return null;
    const p = path.join(uploadRoot(), url.replace(/^\/uploads\//, '').replace(/\//g, path.sep));
    return fs.existsSync(p) ? p : null;
  }

  /** 汇总创作上下文：拆解 + 产品知识 */
  private async gatherContext(breakdownId: number | null, hotContentId: number | null, brandId: number, productId: number) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    const breakdown = breakdownId
      ? await this.prisma.contentBreakdown.findUnique({ where: { id: breakdownId } })
      : null;
    const hot = hotContentId
      ? await this.prisma.hotContent.findUnique({ where: { id: hotContentId } })
      : breakdown
        ? await this.prisma.hotContent.findUnique({ where: { id: breakdown.hotContentId } })
        : null;
    const strategy = await this.prisma.writingStrategy.findFirst({ where: { brandId, enabled: true } });
    return { product, breakdown, hot, strategy };
  }

  /** LLM 生成分镜 */
  private async storyboard(ctx: {
    product: { name: string; displayName: string | null; knowledge: string | null; salesPolicy: string | null } | null;
    breakdown: {
      hook: string | null;
      structure: unknown;
      sellingPoints: unknown;
      cta: string | null;
      scriptText: string | null;
      styleTags: string[];
    } | null;
    hot: { title: string; content: string | null } | null;
    strategy: { persona: unknown; sellingPoints: unknown } | null;
  }, titleOverride?: string, focusPoints: string[] = []): Promise<Storyboard> {
    const asArr = (v: unknown): string[] =>
      Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean).slice(0, 8) : [];
    const sys = [
      '你是 15-30 秒竖屏带货短视频编导。根据爆款拆解结构与产品信息，输出分镜脚本。',
      `要求：${Math.round((MIN_TOTAL_SEC + MAX_TOTAL_SEC) / 2)} 秒左右；3-6 个镜头；每镜头 2.5-9 秒；`,
      'voiceover 是该镜头口播（口语化，每句 ≤22 字）；subtitle 是烧录字幕（≤16 字，去掉标点更利落）；mediaQuery 是为该镜头挑选素材的关键词（1-3 个词，产品/场景词）。',
      '全部镜头的口播合计 ≤ 65 字（保证 30 秒内能自然念完，不赶不截）。',
      '参考爆款结构但不照抄文案，结合产品卖点重新创作。',
      '输出严格 JSON：{"title":"视频标题(≤20字)","shots":[{"durSec":4,"voiceover":"...","subtitle":"...","mediaQuery":"..."}]}',
    ].join('\n');
    const user = [
      ctx.product ? `产品：${ctx.product.displayName ?? ctx.product.name}` : '',
      ctx.product?.knowledge ? `产品知识（节选）：${ctx.product.knowledge.slice(0, 600)}` : '',
      ctx.strategy ? `人设方向：${asArr(ctx.strategy.persona).join('、')}` : '',
      ctx.strategy ? `产品卖点：${asArr(ctx.strategy.sellingPoints).join('；')}` : '',
      focusPoints.length ? `本次重点卖点/政策（口播围绕这些展开）：${focusPoints.join('；')}` : '',
      ctx.breakdown
        ? `爆款拆解参考：\n钩子：${ctx.breakdown.hook ?? ''}\n结构：${JSON.stringify(ctx.breakdown.structure).slice(0, 600)}\n卖点：${asArr(ctx.breakdown.sellingPoints).join('；')}\nCTA：${ctx.breakdown.cta ?? ''}\n原文案：${(ctx.breakdown.scriptText ?? '').slice(0, 500)}`
        : '',
      ctx.hot ? `参考热门内容标题：${ctx.hot.title}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    const parsed = await chatJson<Storyboard>(sys, user, { temperature: 0.7 });
    if (!parsed?.shots?.length) throw new Error('分镜 JSON 解析失败');
    const shots = parsed.shots
      .slice(0, 6)
      .map((s) => ({
        durSec: Math.max(2.5, Math.min(9, Number(s?.durSec) || 4)),
        voiceover: String(s?.voiceover ?? ''),
        subtitle: String(s?.subtitle ?? '').slice(0, 18),
        mediaQuery: String(s?.mediaQuery ?? ''),
      }));
    if (!shots.length) throw new Error('分镜为空');
    return { title: (titleOverride ?? parsed.title ?? '').slice(0, 40), shots };
  }

  /** 镜头素材分配：用户指定素材按镜头顺序优先占用 → 品牌视频素材 tags 命中 → 图片素材 name/typeTag 命中 → 产品图 → 品牌图随机 */
  private async assignMedia(
    brandId: number,
    shots: Shot[],
    productId: number,
    pinnedVideoIds: number[] = [],
    pinnedImageIds: number[] = [],
  ): Promise<Shot[]> {
    const videos = await this.prisma.materialVideo.findMany({ where: { brandId } });
    const images = await this.prisma.materialImage.findMany({
      where: { brandId, status: 1 },
      include: { type: { select: { name: true } } },
    });
    const out: Shot[] = [];
    const usedVideo = new Set<number>();
    const usedImage = new Set<number>();

    // 预分配：用户勾选的视频按顺序占用靠前镜头，视频用完再轮到勾选的图片
    const pinned = new Map<number, { mediaType: 'image' | 'video'; id: number; url: string }>();
    const orderedVideos = pinnedVideoIds
      .map((id) => videos.find((v) => v.id === id))
      .filter((v): v is (typeof videos)[number] => Boolean(v));
    const orderedImages = pinnedImageIds
      .map((id) => images.find((m) => m.id === id))
      .filter((m): m is (typeof images)[number] => Boolean(m));
    shots.forEach((_, idx) => {
      if (idx < orderedVideos.length) {
        pinned.set(idx, { mediaType: 'video', id: orderedVideos[idx].id, url: orderedVideos[idx].url });
      } else if (idx < orderedVideos.length + orderedImages.length) {
        const img = orderedImages[idx - orderedVideos.length];
        pinned.set(idx, { mediaType: 'image', id: img.id, url: img.url });
      }
    });

    const hit = (haystack: string[], query: string) => {
      const tokens = query.split(/[\s,，、/]+/).filter((t) => t.length >= 2);
      return tokens.some((t) => haystack.some((h) => h && (h.includes(t) || t.includes(h))));
    };

    for (const shot of shots) {
      const idx = out.length;
      const pre = pinned.get(idx);
      if (pre) {
        const mediaUrl = await this.resolveMediaFile(pre.url, brandId);
        if (mediaUrl && fs.existsSync(mediaUrl)) {
          (pre.mediaType === 'video' ? usedVideo : usedImage).add(pre.id);
          out.push({ ...shot, mediaType: pre.mediaType, mediaUrl });
          continue;
        }
      }

      let mediaType: 'image' | 'video' | undefined;
      let mediaUrl: string | undefined;

      if (videos.length) {
        const v = videos.find((m) => !usedVideo.has(m.id) && m.tags.length && hit(m.tags, shot.mediaQuery));
        if (v) {
          usedVideo.add(v.id);
          mediaType = 'video';
          mediaUrl = await this.resolveMediaFile(v.url, brandId);
        }
      }
      if (!mediaUrl) {
        const img =
          images.find((m) => !usedImage.has(m.id) && m.name && hit([m.name, m.type?.name ?? ''], shot.mediaQuery)) ??
          images.find((m) => !usedImage.has(m.id) && m.productNodeId === productId);
        if (img) {
          usedImage.add(img.id);
          mediaType = 'image';
          mediaUrl = await this.resolveMediaFile(img.url, brandId);
        }
      }
      if (!mediaUrl) {
        const pool = images.filter((m) => !usedImage.has(m.id));
        const img = (pool.length ? pool : images)[Math.floor(Math.random() * Math.max(1, pool.length || images.length))];
        if (img) {
          usedImage.add(img.id);
          mediaType = 'image';
          mediaUrl = await this.resolveMediaFile(img.url, brandId);
        }
      }
      if (!mediaUrl || !fs.existsSync(mediaUrl)) {
        throw new BadRequestException('品牌素材库无可用图片/视频，请先在内容工厂素材库上传产品素材');
      }
      out.push({ ...shot, mediaType, mediaUrl });
    }
    return out;
  }

  /** /uploads/... → 本地文件路径；外链下载为临时文件后返回路径 */
  private async resolveMediaFile(url: string, brandId: number): Promise<string> {
    if (url.startsWith('/uploads/')) {
      return path.join(uploadRoot(), url.replace(/^\/uploads\//, '').replace(/\//g, path.sep));
    }
    if (!/^https?:\/\//.test(url)) return url;
    const dir = path.join(uploadRoot(), 'hotspot', 'tmp', `dl_${brandId}`);
    fs.mkdirSync(dir, { recursive: true });
    const ext = path.extname(new URL(url).pathname).slice(0, 5) || '.img';
    const dest = path.join(dir, `${randomUUID()}${ext}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`素材下载失败 http ${res.status}`);
    fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
    return dest;
  }
}
