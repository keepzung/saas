// 小红书网页版抓取：搜索页 + 热门feed，拦截平台自带签名请求（模式同 tools/spark/fetch-xhs-covers-v3.cjs）
import type { Page } from 'playwright-core';
import { PlatformBlockedError, ScrapedItem, parseCount, normalizeUrl } from './types';
import { sleep } from './browser.util';

const SEARCH_API = '/api/sns/web/v1/search/notes';
const HOMEFEED_API = '/api/sns/web/v1/homefeed';

interface XhsCard {
  id?: string;
  note_id?: string;
  xsec_token?: string;
  note_card?: {
    type?: string;
    display_title?: string;
    desc?: string;
    user?: { userid?: string; user_id?: string; nick_name?: string; nickname?: string; avatar?: string };
    interact_info?: { liked_count?: string; collected_count?: string; comment_count?: string; share_count?: string };
    cover?: { url?: string; url_default?: string; info_list?: { url?: string }[] };
    tag_items?: { name?: string }[];
    time?: number;
  };
}

function parseCards(items: XhsCard[], keyword: string): ScrapedItem[] {
  const out: ScrapedItem[] = [];
  for (const it of items) {
    const id = it.id || it.note_id;
    const card = it.note_card;
    if (!id || !card) continue;
    const cover =
      normalizeUrl(card.cover?.url) ??
      normalizeUrl(card.cover?.url_default) ??
      (Array.isArray(card.cover?.info_list) ? normalizeUrl(card.cover.info_list.at(-1)?.url) : null);
    out.push({
      platform: 'xhs',
      contentId: id,
      kind: card.type === 'video' ? 'video' : 'note',
      title: (card.display_title ?? '').trim().slice(0, 200),
      coverUrl: cover,
      authorId: card.user?.userid ?? card.user?.user_id ?? '',
      authorName: card.user?.nick_name ?? card.user?.nickname ?? '',
      authorAvatar: normalizeUrl(card.user?.avatar),
      likeCount: parseCount(card.interact_info?.liked_count),
      collectCount: parseCount(card.interact_info?.collected_count),
      commentCount: parseCount(card.interact_info?.comment_count),
      shareCount: parseCount(card.interact_info?.share_count),
      topics: Array.isArray(card.tag_items) ? card.tag_items.map((t) => t.name ?? '').filter(Boolean).slice(0, 10) : [],
      publishTime: card.time ? new Date(card.time) : null,
      raw: { xsec_token: it.xsec_token ?? null, keyword },
    });
  }
  return out;
}

/** 关键词搜索（一页 ~20 条） */
export async function scrapeXhsSearch(page: Page, keyword: string): Promise<ScrapedItem[]> {
  const collected: ScrapedItem[] = [];
  let blocked = false;
  const onResponse = (res: import('playwright-core').Response) => {
    if (!res.url().includes(SEARCH_API)) return;
    res
      .json()
      .then((j: { code?: number; data?: { items?: XhsCard[] } }) => {
        if (j?.code === -100 || j?.code === 461) {
          blocked = true;
          return;
        }
        const items = j?.data?.items;
        if (Array.isArray(items)) collected.push(...parseCards(items, keyword));
      })
      .catch(() => {});
  };
  page.on('response', onResponse);
  try {
    await page.goto(
      `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keyword)}&source=web_explore_feed`,
      { waitUntil: 'domcontentloaded', timeout: 30000 },
    );
    await sleep(4500);
    if (page.url().includes('login') || page.url().includes('passport')) {
      throw new PlatformBlockedError('xhs', '（跳转登录页，会话可能已过期）');
    }
  } finally {
    page.removeListener('response', onResponse);
  }
  if (blocked && !collected.length) throw new PlatformBlockedError('xhs', '（search code -100/461）');
  return collected;
}

/** 热门/探索 feed（登录态首页信息流） */
export async function scrapeXhsHot(page: Page): Promise<ScrapedItem[]> {
  const collected: ScrapedItem[] = [];
  let blocked = false;
  const onResponse = (res: import('playwright-core').Response) => {
    if (!res.url().includes(HOMEFEED_API)) return;
    res
      .json()
      .then((j: { code?: number; data?: { items?: XhsCard[] } }) => {
        if (j?.code === -100 || j?.code === 461) {
          blocked = true;
          return;
        }
        const items = j?.data?.items;
        if (Array.isArray(items)) collected.push(...parseCards(items, '热门feed'));
      })
      .catch(() => {});
  };
  page.on('response', onResponse);
  try {
    await page.goto('https://www.xiaohongshu.com/explore', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(4500);
    if (page.url().includes('login') || page.url().includes('passport')) {
      throw new PlatformBlockedError('xhs', '（跳转登录页，会话可能已过期）');
    }
  } finally {
    page.removeListener('response', onResponse);
  }
  if (blocked && !collected.length) throw new PlatformBlockedError('xhs', '（homefeed code -100/461）');
  return collected;
}

/** 拆解时取笔记详情正文/视频直链（搜索卡里没有正文，需要带 xsec_token 打开笔记页） */
export async function fetchXhsNoteDetail(
  page: Page,
  noteId: string,
  xsecToken: string | null,
): Promise<{ desc?: string; videoUrl?: string | null; topics?: string[]; time?: Date | null }> {
  const url = xsecToken
    ? `https://www.xiaohongshu.com/explore/${noteId}?xsec_token=${encodeURIComponent(xsecToken)}&xsec_source=pc_search`
    : `https://www.xiaohongshu.com/explore/${noteId}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3000);
  if (page.url().includes('login') || page.url().includes('passport')) {
    throw new PlatformBlockedError('xhs', '（详情页跳登录，会话可能已过期）');
  }
  const state = (await page
    .evaluate(() => {
      const w = window as unknown as { __INITIAL_STATE__?: Record<string, unknown> };
      return w.__INITIAL_STATE__ ? JSON.stringify(w.__INITIAL_STATE__) : null;
    })
    .catch(() => null)) as string | null;
  if (!state) return {};
  try {
    const j = JSON.parse(state) as {
      note?: {
        noteDetailMap?: Record<
          string,
          { note?: { desc?: string; type?: string; time?: number; tagList?: { name?: string }[]; video?: { media?: { stream?: { h264?: { masterUrl?: string }[]; h265?: { masterUrl?: string }[] } } } } }
        >;
      };
    };
    const detail = j.note?.noteDetailMap?.[noteId] ?? Object.values(j.note?.noteDetailMap ?? {})[0];
    const note = detail?.note;
    const streams = note?.video?.media?.stream;
    const videoUrl = normalizeUrl(streams?.h264?.[0]?.masterUrl) ?? normalizeUrl(streams?.h265?.[0]?.masterUrl) ?? null;
    return {
      desc: note?.desc ?? undefined,
      videoUrl,
      topics: Array.isArray(note?.tagList) ? note.tagList.map((t) => t.name ?? '').filter(Boolean).slice(0, 10) : undefined,
      time: note?.time ? new Date(note.time) : null,
    };
  } catch {
    return {};
  }
}
