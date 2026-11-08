// 抓取产物统一结构：各平台 scraper 输出 → upsert 入 HotContent
export interface ScrapedItem {
  platform: string;
  contentId: string;
  kind: 'note' | 'video';
  title: string;
  content?: string | null;
  coverUrl?: string | null;
  videoUrl?: string | null;
  durationSec?: number | null;
  authorId?: string;
  authorName?: string;
  authorAvatar?: string | null;
  authorFans?: number | null;
  topics?: string[];
  publishTime?: Date | null;
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
  shareCount?: number;
  collectCount?: number;
  raw?: Record<string, unknown>;
}

/** 会话缺失/过期：提示本机重新扫码推送 */
export class SessionMissingError extends Error {
  constructor(platform: string) {
    super(`${platform} 会话缺失或已过期，请在本机运行登录脚本重新扫码并推送`);
  }
}

/** 平台风控拦截（非会话问题，等待退避即可） */
export class PlatformBlockedError extends Error {
  constructor(platform: string, detail = '') {
    super(`${platform} 触发风控拦截 ${detail}`);
  }
}

/** "1.2万" / "3,456" / "1.2w" → 数字 */
export function parseCount(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return Math.round(v);
  const s = String(v).trim().replace(/,/g, '');
  const m = s.match(/^([\d.]+)\s*(万|w|亿)?$/i);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return 0;
  const unit = (m[2] ?? '').toLowerCase();
  if (unit === '万' || unit === 'w') return Math.round(n * 10000);
  if (unit === '亿') return Math.round(n * 100000000);
  return Math.round(n);
}

/** "3:24" / "1:02:11" → 秒 */
export function parseDuration(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return Math.round(v);
  const parts = String(v).trim().split(':').map((x) => parseInt(x, 10));
  if (parts.some((x) => !Number.isFinite(x))) return null;
  return parts.reduce((acc, x) => acc * 60 + x, 0);
}

export function stripHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .trim();
}

export function normalizeUrl(u: unknown): string | null {
  if (!u) return null;
  let s = String(u).trim();
  if (s.startsWith('//')) s = `https:${s}`;
  else if (s.startsWith('http://')) s = s.replace(/^http:\/\//, 'https://');
  if (!/^https:\/\//.test(s)) return null;
  return s;
}
