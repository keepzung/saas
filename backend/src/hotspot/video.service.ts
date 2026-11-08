// 智能混剪视频生成：拆解/产品 → LLM 分镜脚本 → 素材匹配 → TTS 配音 → ffmpeg 合成 15-30s 竖版视频
// 进程内串行队列；计费走 QuotaService（失败退回）
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { QuotaService } from '../contentpro/quota.service';
import { chatJson, llmEnabled } from './llm.util';
import { buildAss, probeDurationSec, runFfmpeg, subtitleFont, uploadRoot } from './media.util';

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
}

interface Storyboard {
  title: string;
  shots: Shot[];
}

@Injectable()
export class VideoService {
  private readonly logger = new Logger(VideoService.name);
  private queue: number[] = [];
  private draining = false;

  constructor(
    private prisma: PrismaService,
    private quota: QuotaService,
  ) {}

  /** 创建混剪任务：预检并扣算力 → 入队；voice 由用户挑选（缺省用 TTS_VOICE） */
  async createTask(input: {
    brandId: number;
    userId: number;
    productId: number;
    breakdownId?: number;
    hotContentId?: number;
    title?: string;
    voice?: string;
  }) {
    if (!llmEnabled()) throw new BadRequestException('LLM_API_KEY 未配置，无法生成分镜');
    const product = await this.prisma.product.findFirst({
      where: { id: input.productId, brandId: input.brandId },
    });
    if (!product) throw new NotFoundException('产品不存在');
    if (input.voice && !VOICE_IDS.has(input.voice)) throw new BadRequestException('不支持的音色');
    await this.quota.assertEnough(input.brandId, VIDEO_COST);
    await this.quota.consume(input.brandId, VIDEO_COST, input.userId, '视频混剪');
    const task = await this.prisma.videoGenTask.create({
      data: {
        brandId: input.brandId,
        productId: input.productId,
        breakdownId: input.breakdownId ?? null,
        hotContentId: input.hotContentId ?? null,
        title: input.title ?? null,
        voice: input.voice ?? null,
        engine: 'mixcut',
        status: 'queued',
      },
    });
    this.enqueue(task.id);
    return { id: task.id, status: task.status, cost: VIDEO_COST };
  }

  /** 音色清单（前端下拉） */
  voices() {
    return { default: process.env.TTS_VOICE ?? 'zh-CN-XiaoxiaoNeural', items: TTS_VOICES };
  }

  /** 音色试听：生成一句短音频（同音色覆盖写，不堆积文件） */
  async voicePreview(voice?: string, text?: string) {
    const v = voice && VOICE_IDS.has(voice) ? voice : process.env.TTS_VOICE ?? 'zh-CN-XiaoxiaoNeural';
    const line = (text ?? '大家好，今天给大家带来一款超值好物，喜欢的记得看到最后。').slice(0, 60);
    const { EdgeTTS } = (await import('node-edge-tts')) as {
      EdgeTTS: new (o?: Record<string, unknown>) => { ttsPromise: (t: string, p: string) => Promise<void> };
    };
    const outDir = path.join(uploadRoot(), 'hotspot', 'previews');
    fs.mkdirSync(outDir, { recursive: true });
    const fileName = `preview_${v}.mp3`;
    const outPath = path.join(outDir, fileName);
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
    await this.quota.assertEnough(brandId, VIDEO_COST);
    await this.quota.consume(brandId, VIDEO_COST, userId, '视频混剪重试');
    await this.prisma.videoGenTask.update({
      where: { id },
      data: { status: 'queued', errorMsg: null },
    });
    this.enqueue(id);
    return { id, status: 'queued' };
  }

  private enqueue(id: number) {
    this.queue.push(id);
    void this.drain();
  }

  private async drain() {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.queue.length) {
        const id = this.queue.shift()!;
        try {
          await this.run(id);
        } catch (e) {
          const msg = (e as Error).message?.slice(0, 500) ?? 'unknown';
          this.logger.warn(`视频任务 #${id} 失败: ${msg.split('\n')[0]}`);
          const task = await this.prisma.videoGenTask.findUnique({ where: { id } });
          if (task && task.status !== 'done') {
            await this.prisma.videoGenTask.update({ where: { id }, data: { status: 'failed', errorMsg: msg } });
            await this.quota.refund(task.brandId, VIDEO_COST, undefined, `视频任务失败退回 #${id}`);
          }
        }
      }
    } finally {
      this.draining = false;
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
      const board = await this.storyboard(ctx, task.title ?? undefined);

      // ── 2. 素材匹配 ──
      await this.prisma.videoGenTask.update({ where: { id }, data: { status: 'rendering', script: board as object } });
      const assigned = await this.assignMedia(task.brandId, board.shots, task.productId);

      // ── 3. TTS 配音（任务级音色优先，缺省全局 TTS_VOICE）──
      const voice = task.voice || process.env.TTS_VOICE || 'zh-CN-XiaoxiaoNeural';
      const rate = process.env.TTS_RATE ?? 'default';
      const { EdgeTTS } = (await import('node-edge-tts')) as { EdgeTTS: new (o?: Record<string, unknown>) => { ttsPromise: (t: string, p: string) => Promise<void> } };
      const audioFiles: string[] = [];
      const shotDur: number[] = [];
      for (let i = 0; i < assigned.length; i++) {
        const shot = assigned[i];
        const mp3 = path.join(tmpDir, `tts_${i}.mp3`);
        if (shot.voiceover?.trim()) {
          const tts = new EdgeTTS({ voice, lang: 'zh-CN', rate });
          await tts.ttsPromise(shot.voiceover, mp3);
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
          const zoom = `zoompan=z='min(zoom+0.0016,1.22)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${WIDTH}x${HEIGHT}:fps=${FPS}`;
          await runFfmpeg([
            '-y',
            '-loop', '1',
            '-i', assigned[i].mediaUrl!,
            '-vf', `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT},${zoom}`,
            '-frames:v', String(frames),
            '-c:v', 'libx264', '-preset', 'fast',
            seg,
          ]);
        }
        segFiles.push(seg);
      }

      // ── 5. 拼接视频 + 拼接音频 + 烧字幕 ──
      const concatList = path.join(tmpDir, 'concat.txt');
      fs.writeFileSync(concatList, segFiles.map((f) => `file '${f.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n'));
      const interV = path.join(tmpDir, 'inter_v.mp4');
      await runFfmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', concatList, '-c', 'copy', interV]);

      // 音频：TTS 片段按镜头时长对齐（不足补静音）
      const audioInputs: string[] = [];
      const filterParts: string[] = [];
      for (let i = 0; i < audioFiles.length; i++) {
        const padded = path.join(tmpDir, `tts_pad_${i}.m4a`);
        if (fs.existsSync(audioFiles[i])) {
          // apad 需要重编码（不能 -c copy）：补齐到镜头时长，统一重采样便于 concat
          await runFfmpeg(['-y', '-i', audioFiles[i], '-af', `apad=whole_dur=${shotDur[i]}`, '-t', String(shotDur[i]), '-ar', '24000', '-ac', '1', '-b:a', '64k', padded]);
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
      assigned.forEach((s, i) => {
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

      const dur = (await probeDurationSec(outPath)) ?? Math.round(total);
      await this.prisma.videoGenTask.update({
        where: { id },
        data: {
          status: 'done',
          videoUrl: `/uploads/hotspot/videos/${outName}`,
          coverUrl: fs.existsSync(coverPath) ? `/uploads/hotspot/videos/${path.basename(coverPath)}` : null,
          durationSec: Math.round(dur),
          script: assigned as object,
        },
      });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
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
  }, titleOverride?: string): Promise<Storyboard> {
    const asArr = (v: unknown): string[] =>
      Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean).slice(0, 8) : [];
    const sys = [
      '你是 15-30 秒竖屏带货短视频编导。根据爆款拆解结构与产品信息，输出分镜脚本。',
      `要求：${Math.round((MIN_TOTAL_SEC + MAX_TOTAL_SEC) / 2)} 秒左右；3-6 个镜头；每镜头 2.5-9 秒；`,
      'voiceover 是该镜头口播（口语化，每句 ≤30 字）；subtitle 是烧录字幕（≤16 字，去掉标点更利落）；mediaQuery 是为该镜头挑选素材的关键词（1-3 个词，产品/场景词）。',
      '参考爆款结构但不照抄文案，结合产品卖点重新创作。',
      '输出严格 JSON：{"title":"视频标题(≤20字)","shots":[{"durSec":4,"voiceover":"...","subtitle":"...","mediaQuery":"..."}]}',
    ].join('\n');
    const user = [
      ctx.product ? `产品：${ctx.product.displayName ?? ctx.product.name}` : '',
      ctx.product?.knowledge ? `产品知识（节选）：${ctx.product.knowledge.slice(0, 600)}` : '',
      ctx.strategy ? `人设方向：${asArr(ctx.strategy.persona).join('、')}` : '',
      ctx.strategy ? `产品卖点：${asArr(ctx.strategy.sellingPoints).join('；')}` : '',
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

  /** 镜头素材分配：品牌视频素材 tags 命中 → 图片素材 name/typeTag 命中 → 产品图 → 品牌图随机 */
  private async assignMedia(brandId: number, shots: Shot[], productId: number): Promise<Shot[]> {
    const videos = await this.prisma.materialVideo.findMany({ where: { brandId } });
    const images = await this.prisma.materialImage.findMany({
      where: { brandId, status: 1 },
      include: { type: { select: { name: true } } },
    });
    const out: Shot[] = [];
    const usedVideo = new Set<number>();
    const usedImage = new Set<number>();
    const hit = (haystack: string[], query: string) => {
      const tokens = query.split(/[\s,，、/]+/).filter((t) => t.length >= 2);
      return tokens.some((t) => haystack.some((h) => h && (h.includes(t) || t.includes(h))));
    };

    for (const shot of shots) {
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
