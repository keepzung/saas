// 我的音色：spark-hub 平台复刻音色同步 + 本地样音上传（训练在火山控制台由运营完成）
// 平台已训练音色（state=Success/Active）同步进来自动可用；本地上传样音 status=waiting 等待训练
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { CustomVoice } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { probeDurationSec, runFfmpeg, uploadRoot } from './media.util';
import { sparkCloneSpeakers, sparkCloneTts, sparkConfigured, sparkInvalidateCache } from './spark.tts';

const LOCAL_VOICE_LIMIT = Number(process.env.VOICE_CLONE_MAX_PER_BRAND ?? 3);
const SAMPLE_MIN_SEC = Number(process.env.VOICE_SAMPLE_MIN_SEC ?? 10);
const SAMPLE_MAX_SEC = 300;
const SAMPLE_MAX_MB = 25;
const SAMPLE_EXTS = new Set(['.webm', '.mp3', '.wav', '.m4a', '.aac', '.ogg', '.mp4']);
const PREVIEW_LINE = '大家好，这是我用自己的声音复刻的专属音色，以后每条视频都可以由我来配音。';
/** 平台音色列表同步节流（毫秒）；手动同步接口可打破 */
const SYNC_THROTTLE_MS = Number(process.env.VOICE_SYNC_THROTTLE_MS ?? 60000);
const CLONE_OK_STATES = new Set(['Success', 'Active']);

@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);
  private lastSyncAt = 0;

  constructor(private prisma: PrismaService) {}

  /** 复刻能力是否可用（spark-hub key 已配置） */
  available(): boolean {
    return sparkConfigured();
  }

  // ───────────────────────── 平台音色同步 ─────────────────────────

  /** 拉取平台 clone-speakers，upsert 成 status=ready 的行（节流 60s，手动同步可打破） */
  private async syncPlatform(brandId: number, force = false): Promise<void> {
    if (!sparkConfigured()) return;
    if (!force && Date.now() - this.lastSyncAt < SYNC_THROTTLE_MS) return;
    this.lastSyncAt = Date.now();
    let speakers: Awaited<ReturnType<typeof sparkCloneSpeakers>>;
    try {
      speakers = await sparkCloneSpeakers();
    } catch (e) {
      this.logger.warn(`平台复刻音色同步失败: ${(e as Error).message?.split('\n')[0]}`);
      return;
    }
    const ok = speakers.filter((s) => CLONE_OK_STATES.has(s.state));
    const okIds = new Set(ok.map((s) => s.speaker_id));
    const existing = await this.prisma.customVoice.findMany({
      where: { brandId, source: 'platform' },
    });
    const byType = new Map(existing.filter((r) => r.voiceType).map((r) => [r.voiceType as string, r]));

    for (const s of ok) {
      const row = byType.get(s.speaker_id);
      if (row) {
        // 平台改名/换试听音频时跟随更新
        if (row.name !== s.name || row.previewUrl !== s.preview_url || !row.enabled) {
          await this.prisma.customVoice.update({
            where: { id: row.id },
            data: { name: s.name, previewUrl: s.preview_url, enabled: true, status: 'ready', errorMsg: null },
          });
        }
      } else {
        await this.prisma.customVoice.create({
          data: {
            brandId,
            name: s.name,
            voiceType: s.speaker_id,
            status: 'ready',
            source: 'platform',
            previewUrl: s.preview_url,
          },
        });
      }
    }
    // 平台已回收/训练失败的音色下架
    for (const row of existing) {
      if (row.voiceType && !okIds.has(row.voiceType) && row.enabled) {
        await this.prisma.customVoice.update({
          where: { id: row.id },
          data: { enabled: false, status: 'failed', errorMsg: '平台音色已不可用（被回收或训练失败）' },
        });
      }
    }
  }

  /** 手动同步（前端按钮） */
  async sync(brandId: number) {
    sparkInvalidateCache();
    this.lastSyncAt = 0;
    await this.syncPlatform(brandId, true);
    const ready = await this.prisma.customVoice.count({ where: { brandId, source: 'platform', status: 'ready', enabled: true } });
    return { synced: ready };
  }

  // ───────────────────────── 列表 ─────────────────────────

  async list(brandId: number) {
    await this.syncPlatform(brandId);
    const rows = await this.prisma.customVoice.findMany({
      where: { brandId, enabled: true },
      orderBy: [{ source: 'asc' }, { createdAt: 'desc' }],
    });
    const localCount = rows.filter((r) => r.source === 'local').length;
    return {
      limit: LOCAL_VOICE_LIMIT,
      configured: sparkConfigured(),
      local_count: localCount,
      items: rows.map((r) => this.serialize(r)),
    };
  }

  /** 视频工坊音色下拉：ready 的自定义音色并入 items */
  async listReady(brandId: number) {
    await this.syncPlatform(brandId);
    const rows = await this.prisma.customVoice.findMany({
      where: { brandId, status: 'ready', enabled: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.voiceType ?? '',
      name: r.name,
      gender: '—',
      style: r.source === 'platform' ? '复刻音色' : '我的音色',
      custom: true,
      customVoiceId: r.id,
    }));
  }

  // ───────────────────────── 本地样音上传（待训练） ─────────────────────────

  async saveSample(brandId: number, file?: { originalname?: string; size?: number; buffer?: Buffer }) {
    if (!file?.buffer?.length) throw new BadRequestException('未收到音频文件');
    if ((file.size ?? 0) > SAMPLE_MAX_MB * 1024 * 1024) throw new BadRequestException(`音频不能超过 ${SAMPLE_MAX_MB}MB`);
    const rawExt = path.extname(file.originalname ?? '').toLowerCase();
    if (!SAMPLE_EXTS.has(rawExt)) {
      throw new BadRequestException('仅支持 webm / mp3 / wav / m4a / aac / ogg 音频');
    }
    const dir = path.join(uploadRoot(), 'voices', String(brandId));
    fs.mkdirSync(dir, { recursive: true });

    // 统一转 16k 单声道 wav（MediaRecorder 产出 webm/opus，火山控制台训练以常规格式为佳）
    const tmpRaw = path.join(dir, `raw_${randomUUID().slice(0, 8)}${rawExt}`);
    const wavPath = path.join(dir, `${randomUUID().slice(0, 12)}.wav`);
    fs.writeFileSync(tmpRaw, file.buffer);
    try {
      await runFfmpeg(['-y', '-i', tmpRaw, '-ar', '16000', '-ac', '1', '-b:a', '96k', wavPath]);
    } finally {
      fs.rmSync(tmpRaw, { force: true });
    }
    const dur = (await probeDurationSec(wavPath)) ?? 0;
    if (dur < SAMPLE_MIN_SEC) {
      fs.rmSync(wavPath, { force: true });
      throw new BadRequestException(`录音太短（${dur.toFixed(1)} 秒），请录 ${SAMPLE_MIN_SEC} 秒以上`);
    }
    if (dur > SAMPLE_MAX_SEC) {
      fs.rmSync(wavPath, { force: true });
      throw new BadRequestException(`录音太长（${Math.round(dur)} 秒），请控制在 ${SAMPLE_MAX_SEC} 秒以内`);
    }
    return {
      url: `/uploads/voices/${brandId}/${path.basename(wavPath)}`,
      duration_sec: Math.round(dur),
    };
  }

  /** 登记待训练样音（训练在火山控制台由运营完成后，同步接口不会自动关联——需运营以同名规则命名或管理员改绑） */
  async create(brandId: number, userId: number, dto: { name?: string; sampleUrl?: string; consent?: boolean }) {
    if (!dto.consent) throw new BadRequestException('请先确认已获得声音所有者的授权');
    const name = (dto.name ?? '').trim().slice(0, 20);
    if (!name) throw new BadRequestException('请填写音色名称');

    const count = await this.prisma.customVoice.count({ where: { brandId, source: 'local', enabled: true } });
    if (count >= LOCAL_VOICE_LIMIT) {
      throw new BadRequestException(`每个工作区最多提交 ${LOCAL_VOICE_LIMIT} 个待训练音色，请先删除不需要的记录`);
    }
    const samplePath = this.resolveUploadPath(dto.sampleUrl ?? '');
    if (!samplePath || !fs.existsSync(samplePath)) throw new BadRequestException('请先录制或上传训练音频');
    const dur = (await probeDurationSec(samplePath)) ?? 0;
    if (dur < SAMPLE_MIN_SEC) throw new BadRequestException('训练音频无效或过短，请重新录制');

    const row = await this.prisma.customVoice.create({
      data: {
        brandId,
        userId,
        name,
        status: 'waiting',
        source: 'local',
        sampleUrl: dto.sampleUrl ?? null,
        durationSec: Math.round(dur),
      },
    });
    return this.serialize(row);
  }

  // ───────────────────────── 试听 ─────────────────────────

  /** 平台音色自带免费试听直链则直接返回；否则用复刻合成一句 */
  async preview(brandId: number, id: number) {
    const row = await this.prisma.customVoice.findFirst({ where: { id, brandId, enabled: true } });
    if (!row) throw new NotFoundException('音色不存在');
    if (row.status !== 'ready' || !row.voiceType) throw new BadRequestException('音色尚未训练完成');
    if (row.previewUrl) return { url: row.previewUrl, voice: row.voiceType, cached: true };
    const audio = await sparkCloneTts(PREVIEW_LINE, row.voiceType);
    const dir = path.join(uploadRoot(), 'voices', String(brandId));
    fs.mkdirSync(dir, { recursive: true });
    const fileName = `preview_${row.id}.mp3`; // 同音色覆盖写，不堆积文件
    fs.writeFileSync(path.join(dir, fileName), audio);
    return { url: `/uploads/voices/${brandId}/${fileName}`, voice: row.voiceType, cached: false };
  }

  // ───────────────────────── 删除 / 视频任务联动 ─────────────────────────

  async disable(brandId: number, id: number) {
    const row = await this.prisma.customVoice.findFirst({ where: { id, brandId, enabled: true } });
    if (!row) throw new NotFoundException('音色不存在');
    if (row.source === 'platform') throw new BadRequestException('平台音色由管理员统一管理，如需下架请联系管理员');
    await this.prisma.customVoice.update({ where: { id }, data: { enabled: false } });
    return { id, deleted: true };
  }

  /** createTask 白名单校验：S_ 开头的音色必须是本工作区 ready 的自定义音色 */
  async assertVoiceUsable(brandId: number, voice: string) {
    const cv = await this.prisma.customVoice.findFirst({
      where: { voiceType: voice, brandId, status: 'ready', enabled: true },
    });
    if (!cv) throw new BadRequestException('自定义音色不存在或尚未训练完成');
    return cv;
  }

  private resolveUploadPath(url: string): string | null {
    if (!url.startsWith('/uploads/')) return null;
    return path.join(uploadRoot(), url.replace(/^\/uploads\//, '').replace(/\//g, path.sep));
  }

  private serialize(row: CustomVoice) {
    return {
      id: row.id,
      name: row.name,
      voice_type: row.voiceType,
      status: row.status,
      source: row.source,
      sample_url: row.sampleUrl,
      preview_url: row.previewUrl,
      duration_sec: row.durationSec,
      error_msg: row.errorMsg,
      created_at: row.createdAt,
    };
  }
}
