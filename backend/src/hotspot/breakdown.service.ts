// 爆款拆解：图文直接 LLM 结构化；视频 → 下载 → 抽帧+抽音频 → ASR+视觉理解 → LLM 汇总
// 进程内串行队列执行（避免并发风控/供应商限速）
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import type { HotContent } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { HotspotService } from './hotspot.service';
import { chatJson, chatText, chatVision, llmEnabled, transcribeAudio, type ContentPart } from './llm.util';
import { fetchXhsNoteDetail } from './scraper/xhs.scraper';
import { fetchBiliVideoDetail } from './scraper/bilibili.scraper';
import { runFfmpeg, probeDurationSec, uploadRoot } from './media.util';

const FRAMES = Number(process.env.BREAKDOWN_FRAMES ?? 8);

interface BreakdownResult {
  hook: string;
  structure: { stage: string; summary: string; voiceover?: string }[];
  sellingPoints: string[];
  cta: string;
  styleTags: string[];
  scriptText: string;
  replicateTips: string;
}

@Injectable()
export class BreakdownService {
  private readonly logger = new Logger(BreakdownService.name);
  private queue: number[] = [];
  private draining = false;

  constructor(
    private prisma: PrismaService,
    private hotspot: HotspotService,
  ) {}

  /** 请求拆解：建/复用拆解行并入队；已有 done 拆解直接返回 */
  async request(hotContentId: number, brandId: number) {
    const content = await this.prisma.hotContent.findFirst({
      where: { id: hotContentId, OR: [{ isPublic: true }, { brandId }] },
    });
    if (!content) throw new NotFoundException('内容不存在');
    if (!llmEnabled()) throw new BadRequestException('LLM_API_KEY 未配置，无法拆解');

    const existing = await this.prisma.contentBreakdown.findUnique({ where: { hotContentId } });
    if (existing) {
      if (existing.status === 'done') return { id: existing.id, status: existing.status, queued: false };
      if (existing.status === 'processing') return { id: existing.id, status: existing.status, queued: true };
      await this.prisma.contentBreakdown.update({
        where: { id: existing.id },
        data: { status: 'pending', errorMsg: null },
      });
      this.enqueue(existing.id);
      return { id: existing.id, status: 'pending', queued: true };
    }
    const row = await this.prisma.contentBreakdown.create({
      data: { hotContentId, brandId, status: 'pending' },
    });
    this.enqueue(row.id);
    return { id: row.id, status: 'pending', queued: true };
  }

  list(brandId: number, q: { status?: string; platform?: string; page?: number; pageSize?: number }) {
    const page = Math.max(1, q.page ?? 1);
    const pageSize = Math.min(60, Math.max(1, q.pageSize ?? 20));
    const where = {
      brandId,
      ...(q.status ? { status: q.status } : {}),
      ...(q.platform ? { hotContent: { platform: q.platform } } : {}),
    };
    return Promise.all([
      this.prisma.contentBreakdown.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          hotContent: {
            select: {
              id: true,
              platform: true,
              title: true,
              coverUrl: true,
              kind: true,
              likeCount: true,
              viewCount: true,
              authorName: true,
            },
          },
        },
      }),
      this.prisma.contentBreakdown.count({ where }),
    ]).then(([rows, total]) => ({
      total,
      page,
      page_size: pageSize,
      items: rows,
    }));
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
          this.logger.warn(`拆解 #${id} 失败: ${(e as Error).message?.split('\n')[0]}`);
        }
      }
    } finally {
      this.draining = false;
    }
  }

  private async run(id: number) {
    const row = await this.prisma.contentBreakdown.findUnique({
      where: { id },
      include: { hotContent: true },
    });
    if (!row) return;
    await this.prisma.contentBreakdown.update({ where: { id }, data: { status: 'processing' } });
    await this.prisma.hotContent.update({ where: { id: row.hotContentId }, data: { breakdownStatus: 'processing' } });
    const tmpDir = path.join(uploadRoot(), 'hotspot', 'tmp', String(id));
    fs.mkdirSync(tmpDir, { recursive: true });
    let partial = false;
    try {
      // 1. 补正文/视频直链（搜索卡里没有正文）
      let content = row.hotContent;
      if (!content.content || (content.kind === 'video' && !content.videoUrl)) {
        content = await this.enrichContent(content);
      }

      // 2. 视频素材准备 + 感知
      let transcript = '';
      let visual = '';
      let videoPath: string | null = null;
      if (content.videoUrl) {
        videoPath = await this.downloadVideo(content.videoUrl, content.platform, tmpDir);
        // B站 dash 流音视频分离：下载音频轨并合成带声视频，否则 ASR 无音可转
        const audioUrl = (content.rawJson as { bili_audio_url?: string } | null)?.bili_audio_url;
        if (videoPath && audioUrl) {
          const audioPath = await this.downloadFile(audioUrl, path.join(tmpDir, 'audio_src.m4s'), {
            Referer: 'https://www.bilibili.com/',
          });
          if (audioPath) {
            const muxed = path.join(tmpDir, 'muxed.mp4');
            try {
              await runFfmpeg(['-y', '-i', videoPath, '-i', audioPath, '-c', 'copy', '-map', '0:v:0', '-map', '1:a:0', muxed]);
              videoPath = muxed;
            } catch {
              /* 合成失败就用无声视频，文案信息仍在 */
            }
          }
        }
      }
      if (videoPath) {
        transcript = await this.tryAsr(videoPath, tmpDir);
        visual = await this.tryVisionFrames(videoPath, tmpDir, content.title);
      } else if (content.kind === 'video') {
        partial = true; // 视频直链拿不到：按文案降级拆解
      } else if (content.coverUrl) {
        visual = await this.tryVisionImage(content.coverUrl, content.title);
      }

      // 3. LLM 汇总拆解
      const result = await this.synthesize(content, transcript, visual, partial);
      await this.prisma.contentBreakdown.update({
        where: { id },
        data: {
          status: 'done',
          partial,
          hook: result.hook,
          structure: result.structure,
          sellingPoints: result.sellingPoints,
          cta: result.cta,
          styleTags: result.styleTags,
          scriptText: result.scriptText,
          replicateTips: result.replicateTips,
          aiModel: process.env.LLM_MODEL ?? 'glm-4-flash',
          rawAnalysis: { transcript, visual } as object,
          errorMsg: null,
        },
      });
      await this.prisma.hotContent.update({ where: { id: row.hotContentId }, data: { breakdownStatus: 'done' } });
    } catch (e) {
      const msg = (e as Error).message?.slice(0, 500) ?? 'unknown';
      await this.prisma.contentBreakdown.update({ where: { id }, data: { status: 'failed', errorMsg: msg } });
      await this.prisma.hotContent.update({ where: { id: row.hotContentId }, data: { breakdownStatus: 'failed' } });
      throw e;
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  /** 拆解前补详情：正文/视频直链/话题 */
  private async enrichContent(content: HotContent) {
    let detail: { desc?: string; videoUrl?: string | null; topics?: string[]; time?: Date | null } = {};
    if (content.platform === 'xhs') {
      const token = (content.rawJson as { xsec_token?: string } | null)?.xsec_token ?? null;
      detail = await this.hotspot.withPlatformSession('xhs', (page) => fetchXhsNoteDetail(page, content.contentId, token));
    } else if (content.platform === 'bilibili') {
      detail = await this.hotspot.withPlatformSession('bilibili', (page) => fetchBiliVideoDetail(page, content.contentId));
    } else {
      return content;
    }
    const data = {
      content: content.content ?? detail.desc ?? null,
      videoUrl: content.videoUrl ?? detail.videoUrl ?? null,
      ...(detail.topics?.length ? { topics: detail.topics } : {}),
      ...(detail.time ? { publishTime: detail.time } : {}),
      // B站 dash 音频轨直链存 rawJson 供拆解合成音轨
      ...((detail as { audioUrl?: string | null }).audioUrl
        ? { rawJson: { ...(content.rawJson as object | null ?? {}), bili_audio_url: (detail as { audioUrl?: string }).audioUrl } }
        : {}),
    };
    return this.prisma.hotContent.update({ where: { id: content.id }, data });
  }

  private async downloadVideo(url: string, platform: string, tmpDir: string): Promise<string | null> {
    const dest = path.join(tmpDir, 'video.mp4');
    const headers: Record<string, string> = platform === 'bilibili' ? { Referer: 'https://www.bilibili.com/' } : {};
    return this.downloadFile(url, dest, headers, 10 * 1024);
  }

  private async downloadFile(
    url: string,
    dest: string,
    headers: Record<string, string> = {},
    minSize = 1024,
  ): Promise<string | null> {
    try {
      const res = await fetch(url, { headers });
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < minSize) return null;
      fs.writeFileSync(dest, buf);
      return dest;
    } catch {
      return null;
    }
  }

  private async tryAsr(videoPath: string, tmpDir: string): Promise<string> {
    const audioPath = path.join(tmpDir, 'audio.mp3');
    try {
      await runFfmpeg(['-y', '-i', videoPath, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '64k', audioPath]);
      if (!fs.existsSync(audioPath) || fs.statSync(audioPath).size < 1024) return '';
      // 智谱 transcriptions 限制单文件 0-30 秒：长音频按 28s 分段转写后拼接
      const dur = (await probeDurationSec(audioPath)) ?? 0;
      if (dur <= 29) return await transcribeAudio(audioPath);
      const segList = path.join(tmpDir, 'audio_seg_%02d.mp3');
      await runFfmpeg(['-y', '-i', audioPath, '-f', 'segment', '-segment_time', '28', '-c', 'copy', segList]);
      const segs = fs.readdirSync(tmpDir).filter((f) => /^audio_seg_\d+\.mp3$/.test(f)).sort();
      const texts: string[] = [];
      for (const s of segs) {
        try {
          texts.push(await transcribeAudio(path.join(tmpDir, s)));
        } catch {
          /* 单段失败跳过 */
        }
      }
      return texts.join('');
    } catch (e) {
      this.logger.warn(`ASR 失败（降级为纯视觉拆解）: ${(e as Error).message?.split('\n')[0]}`);
      return '';
    }
  }

  private async tryVisionFrames(videoPath: string, tmpDir: string, title: string): Promise<string> {
    try {
      const dur = await probeDurationSec(videoPath);
      if (!dur) return '';
      const frames: string[] = [];
      for (let i = 0; i < FRAMES; i++) {
        const t = Math.min(dur - 0.2, ((i + 0.5) / FRAMES) * dur);
        const f = path.join(tmpDir, `frame_${i}.jpg`);
        await runFfmpeg(['-y', '-ss', String(Math.max(0, t)), '-i', videoPath, '-frames:v', '1', '-vf', 'scale=480:-2', f]);
        if (fs.existsSync(f)) frames.push(f);
      }
      if (!frames.length) return '';
      // glm-4v 单次图片数量有限制（1210），按组分批调用后拼接
      const CHUNK = Number(process.env.VISION_CHUNK ?? 4);
      const chunks: string[][] = [];
      for (let i = 0; i < frames.length; i += CHUNK) chunks.push(frames.slice(i, i + CHUNK));
      const out: string[] = [];
      for (let ci = 0; ci < chunks.length; ci++) {
        const parts: ContentPart[] = [
          {
            type: 'text',
            text: `这是一条短视频（标题：${title}）按时间顺序抽取的第 ${ci + 1} 组画面（全片共 ${frames.length} 帧中的第 ${ci * CHUNK + 1}-${ci * CHUNK + chunks[ci].length} 帧）。请按帧顺序描述每个画面在做什么、出现什么产品/文字/人物。简洁中文分点输出。`,
          },
        ];
        for (const f of chunks[ci]) {
          const b64 = fs.readFileSync(f).toString('base64');
          parts.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } });
        }
        out.push(await chatVision('你是短视频画面分析助手，只输出画面分析内容本身。', parts));
      }
      return out.join('\n');
    } catch (e) {
      this.logger.warn(`视频帧视觉分析失败: ${(e as Error).message?.split('\n')[0]}`);
      return '';
    }
  }

  private async tryVisionImage(coverUrl: string, title: string): Promise<string> {
    try {
      const res = await fetch(coverUrl);
      if (!res.ok) return '';
      const buf = Buffer.from(await res.arrayBuffer());
      const b64 = buf.toString('base64');
      return await chatVision(
        '你是内容封面分析助手，只输出分析内容本身。',
        [
          { type: 'text', text: `这是一条内容的封面图（标题：${title}）。简要描述封面传达的主题与风格。` },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } },
        ],
      );
    } catch {
      return '';
    }
  }

  private async synthesize(
    content: {
      platform: string;
      kind: string;
      title: string;
      content: string | null;
      topics: string[];
      likeCount: number;
      viewCount: number;
      collectCount: number;
      commentCount: number;
    },
    transcript: string,
    visual: string,
    partial: boolean,
  ): Promise<BreakdownResult> {
    const sys = [
      '你是爆款内容拆解专家。对给定的热门内容输出结构化拆解，帮助品牌方复刻同类爆款。',
      '输出严格 JSON：',
      '{"hook":"开头钩子(如何在前3秒抓注意力)","structure":[{"stage":"阶段名(如 黄金3秒/痛点共鸣/产品展示/信任背书/行动号召)","summary":"这一段做了什么","voiceover":"若有口播原文摘录"}],"sellingPoints":["提炼出的卖点/爆点"],"cta":"结尾行动号召是什么","styleTags":["内容风格标签，如 口播/测评/剧情/vlog/图文/沉浸式，3-6个"],"scriptText":"完整口播文案或内容文字稿","replicateTips":"给品牌方的复刻建议，2-4句"}',
    ].join('\n');
    const user = [
      `平台：${content.platform}；类型：${content.kind === 'video' ? '视频' : '图文笔记'}`,
      `标题：${content.title}`,
      content.content ? `正文/描述：\n${content.content.slice(0, 2000)}` : '',
      content.topics.length ? `话题标签：${content.topics.join('、')}` : '',
      `数据：点赞 ${content.likeCount}，播放 ${content.viewCount}，收藏 ${content.collectCount}，评论 ${content.commentCount}`,
      partial ? '（注意：视频源不可得，仅基于文本信息拆解，涉及画面结构部分给出合理推断即可）' : '',
      transcript ? `语音转写（口播全文）：\n${transcript.slice(0, 3000)}` : '',
      visual ? `画面分析：\n${visual.slice(0, 2000)}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    const parsed = await chatJson<BreakdownResult>(sys, user, { temperature: 0.4 });
    if (!parsed || !Array.isArray(parsed.structure)) throw new Error('拆解 JSON 解析失败');
    return {
      hook: String(parsed.hook ?? ''),
      structure: parsed.structure.slice(0, 12).map((s) => ({
        stage: String(s?.stage ?? ''),
        summary: String(s?.summary ?? ''),
        ...(s?.voiceover ? { voiceover: String(s.voiceover) } : {}),
      })),
      sellingPoints: Array.isArray(parsed.sellingPoints) ? parsed.sellingPoints.map(String).slice(0, 10) : [],
      cta: String(parsed.cta ?? ''),
      styleTags: Array.isArray(parsed.styleTags) ? parsed.styleTags.map(String).slice(0, 8) : [],
      scriptText: String(parsed.scriptText ?? ''),
      replicateTips: String(parsed.replicateTips ?? ''),
    };
  }
}
