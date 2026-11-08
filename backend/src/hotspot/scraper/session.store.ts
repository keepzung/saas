// 平台登录态存储：本机扫码 → push-session 推送 → 服务器只读使用（永不主动登录）
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SessionMissingError } from './types';

@Injectable()
export class SessionStore {
  private readonly logger = new Logger(SessionStore.name);

  constructor(private prisma: PrismaService) {}

  /** 取登录态（storageState JSON 字符串）；缺失/过期抛 SessionMissingError */
  async getState(platform: string, label = '默认'): Promise<string> {
    const row = await this.prisma.platformSession.findUnique({
      where: { platform_label: { platform, label } },
    });
    if (!row?.storageState) throw new SessionMissingError(platform);
    if (row.status === 'expired' || row.status === 'manual_required') {
      // 已标记过期则不再尝试，避免反复空跑触发风控
      throw new SessionMissingError(platform);
    }
    return typeof row.storageState === 'string' ? row.storageState : JSON.stringify(row.storageState);
  }

  async mark(platform: string, status: 'active' | 'expired' | 'manual_required', note?: string) {
    try {
      await this.prisma.platformSession.updateMany({
        where: { platform },
        data: { status, note: note ?? null, ...(status === 'active' ? { lastOkAt: new Date() } : {}) },
      });
    } catch {
      /* 行不存在忽略 */
    }
    if (status !== 'active') {
      this.logger.warn(`platform ${platform} 会话状态 → ${status}${note ? `：${note}` : ''}`);
      this.notifyWeCom(platform, status, note).catch(() => {});
    }
  }

  async markOk(platform: string) {
    await this.prisma.platformSession.updateMany({
      where: { platform },
      data: { status: 'active', lastOkAt: new Date(), lastCheckAt: new Date() },
    });
  }

  /** 本机登录脚本推送登录态（upsert） */
  async save(platform: string, label: string, brandId: number, storageStateJson: string, note?: string) {
    const storageState = JSON.parse(storageStateJson) as object;
    return this.prisma.platformSession.upsert({
      where: { platform_label: { platform, label } },
      create: { platform, label, brandId, storageState, status: 'active', lastOkAt: new Date(), note },
      update: { storageState, status: 'active', lastOkAt: new Date(), note: note ?? undefined },
    });
  }

  /** 登录态列表（前端展示各平台登录状态） */
  list() {
    return this.prisma.platformSession
      .findMany({ orderBy: [{ platform: 'asc' }, { label: 'asc' }] })
      .then((rows) =>
        rows.map((r) => ({
          id: r.id,
          platform: r.platform,
          label: r.label,
          brand_id: r.brandId,
          status: r.status,
          has_state: Boolean(r.storageState),
          last_ok_at: r.lastOkAt,
          note: r.note,
          updated_at: r.updatedAt,
        })),
      );
  }

  async remove(id: number) {
    await this.prisma.platformSession.delete({ where: { id } });
    return { id };
  }

  /** 企业微信机器人告警（WECOM_WEBHOOK_URL 未配则跳过） */
  private async notifyWeCom(platform: string, status: string, note?: string) {
    const url = process.env.WECOM_WEBHOOK_URL;
    if (!url) return;
    const text = `【灵感引擎】${platform} 登录态${status === 'expired' ? '已过期' : '需要人工登录'}${
      note ? `：${note}` : ''
    }，请尽快在本机执行登录脚本重新推送。`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msgtype: 'text', text: { content: text } }),
    });
  }
}
