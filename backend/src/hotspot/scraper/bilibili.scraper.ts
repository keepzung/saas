// B站抓取：热门榜/搜索/UP主投稿。B站风控宽松，热门与投稿可直接 page 内 fetch 官方接口，
// 搜索走拦截（前端自己完成 wbi 签名）
import type { Page } from 'playwright-core';
import { ScrapedItem, parseDuration, parseCount, stripHtml, normalizeUrl } from './types';
import { sleep } from './browser.util';

interface BiliArc {
  bvid?: string;
  aid?: number;
  title?: string;
  description?: string;
  desc?: string;
  pic?: string;
  duration?: number;
  pubdate?: number;
  tname?: string;
  owner?: { mid?: number; name?: string; face?: string };
  stat?: { view?: number; like?: number; reply?: number; share?: number; favorite?: number; danmaku?: number };
}

function toItem(a: BiliArc, sourceKeyword: string): ScrapedItem | null {
  const bvid = a.bvid ?? (a.aid ? `av${a.aid}` : null);
  if (!bvid) return null;
  return {
    platform: 'bilibili',
    contentId: bvid,
    kind: 'video',
    title: stripHtml(a.title).slice(0, 200),
    content: stripHtml(a.description ?? a.desc ?? '').slice(0, 2000) || null,
    coverUrl: normalizeUrl(a.pic),
    durationSec: typeof a.duration === 'number' ? a.duration : parseDuration(a.duration),
    authorId: String(a.owner?.mid ?? ''),
    authorName: a.owner?.name ?? '',
    authorAvatar: normalizeUrl(a.owner?.face),
    topics: a.tname ? [a.tname] : [],
    publishTime: a.pubdate ? new Date(a.pubdate * 1000) : null,
    viewCount: a.stat?.view ?? 0,
    likeCount: a.stat?.like ?? 0,
    commentCount: a.stat?.reply ?? 0,
    shareCount: a.stat?.share ?? 0,
    collectCount: a.stat?.favorite ?? 0,
    raw: { keyword: sourceKeyword },
  };
}

/** B站综合热门（无需登录也可用；登录态更稳） */
export async function scrapeBiliHot(page: Page, limit = 40): Promise<ScrapedItem[]> {
  await page.goto('https://www.bilibili.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(2500);
  const rows = (await page
    .evaluate(async () => {
      const res = await fetch('https://api.bilibili.com/x/web-interface/popular?ps=50&pn=1', {
        credentials: 'include',
      });
      return res.json();
    })
    .catch(() => null)) as { code?: number; data?: { list?: BiliArc[] } } | null;
  if (!rows || rows.code !== 0 || !Array.isArray(rows.data?.list)) {
    return [];
  }
  return (rows.data?.list ?? []).slice(0, limit).map((a) => toItem(a, '综合热门')!).filter(Boolean);
}

/** B站搜索结果相对时间 → Date（"8小时前"/"2天前"/"昨天 12:00"/"2024-1-1"） */
function parseBiliDate(s: string | null): Date | null {
  if (!s) return null;
  const str = s.trim();
  const now = Date.now();
  const rel = str.match(/^(\d+)\s*(秒|分钟|小时|天)前$/);
  if (rel) {
    const unit = { 秒: 1, 分钟: 60, 小时: 3600, 天: 86400 }[rel[2]] ?? 1;
    return new Date(now - Number(rel[1]) * unit * 1000);
  }
  if (str.startsWith('昨天')) return new Date(now - 86400000);
  const abs = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (abs) return new Date(Number(abs[1]), Number(abs[2]) - 1, Number(abs[3]));
  return null;
}

/** 关键词搜索：搜索页为 SSR/水合渲染（无 XHR 可拦），直接解析 DOM 卡片 */
export async function scrapeBiliSearch(page: Page, keyword: string): Promise<ScrapedItem[]> {
  await page.goto(`https://search.bilibili.com/all?keyword=${encodeURIComponent(keyword)}`, {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  });
  await sleep(5000);
  const cards = (await page
    .evaluate(() => {
      const pick = (el: Element, sel: string) => el.querySelector(sel)?.textContent?.trim() ?? null;
      return [...document.querySelectorAll('.bili-video-card')].slice(0, 30).map((el) => {
        const a = el.querySelector('a[href*="/video"]');
        const img = el.querySelector('img');
        return {
          href: a?.getAttribute('href') ?? null,
          title: pick(el, '.bili-video-card__info--tit') ?? el.querySelector('h3')?.textContent?.trim() ?? null,
          author: pick(el, '.bili-video-card__info--author'),
          date: pick(el, '.bili-video-card__info--date'),
          duration: pick(el, '.bili-video-card__stats__duration'),
          statText: [...el.querySelectorAll('.bili-video-card__stats--item')].map((x) => x.textContent?.trim() ?? ''),
          img: img?.getAttribute('src') ?? img?.getAttribute('data-src') ?? null,
        };
      });
    })
    .catch(() => [])) as {
    href: string | null;
    title: string | null;
    author: string | null;
    date: string | null;
    duration: string | null;
    statText: string[];
    img: string | null;
  }[];
  const out: ScrapedItem[] = [];
  for (const c of cards) {
    const m = (c.href ?? '').match(/\/video\/(BV[0-9A-Za-z]+)/);
    if (!m || !c.title) continue;
    out.push({
      platform: 'bilibili',
      contentId: m[1],
      kind: 'video',
      title: stripHtml(c.title).slice(0, 200),
      coverUrl: normalizeUrl(c.img),
      durationSec: parseDuration(c.duration),
      authorId: '',
      authorName: c.author ?? '',
      viewCount: parseCount(c.statText[0]),
      // 搜索卡第二个 stat 是弹幕数不是评论数，存 raw 备查
      commentCount: 0,
      publishTime: parseBiliDate(c.date),
      raw: { keyword, statText: c.statText },
    });
  }
  return out;
}

/** UP 主投稿列表（竞品/达人内容同步） */
export async function scrapeBiliAuthor(page: Page, mid: string, limit = 30): Promise<ScrapedItem[]> {
  await page.goto(`https://space.bilibili.com/${mid}/video`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3500);
  const rows = (await page
    .evaluate(async (m) => {
      const res = await fetch(
        `https://api.bilibili.com/x/space/wbi/arc/search?mid=${m}&pn=1&ps=30&order=pubdate`,
        { credentials: 'include' },
      );
      return res.json();
    }, mid)
    .catch(() => null)) as {
    code?: number;
    data?: {
      list?: {
        vlist?: {
          bvid?: string;
          aid?: number;
          title?: string;
          description?: string;
          pic?: string;
          created?: number;
          length?: string;
          author?: string;
        }[];
      };
    };
  } | null;
  const vlist = rows?.data?.list?.vlist ?? [];
  return vlist
    .slice(0, limit)
    .map((a) =>
      toItem(
        {
          bvid: a.bvid,
          aid: a.aid,
          title: a.title,
          description: a.description ?? '',
          pic: a.pic,
          duration: parseDuration(a.length) ?? undefined,
          pubdate: a.created,
          owner: { mid: Number(mid), name: a.author ?? '' },
        },
        `UP主${mid}`,
      )!,
    )
    .filter(Boolean);
}

/** 拆解时取视频直链：优先老版 playurl durl（自带音轨的 mp4），playinfo dash 作兜底 */
export async function fetchBiliVideoDetail(
  page: Page,
  bvid: string,
): Promise<{ desc?: string; videoUrl?: string | null; audioUrl?: string | null; topics?: string[] }> {
  let desc: string | undefined;
  let topics: string[] | undefined;
  let videoUrl: string | null = null;
  let audioUrl: string | null = null;

  // B站会做客户端跳转，evaluate 可能被打断，重试几次直到拿到 INITIAL_STATE
  for (let i = 0; i < 3; i++) {
    await page.goto(`https://www.bilibili.com/video/${bvid}`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    await sleep(6000);
    const state = (await page
      .evaluate(() => {
        const vd = (window as unknown as { __INITIAL_STATE__?: { videoData?: { aid?: number; cid?: number; bvid?: string; desc?: string; tname?: string } } })
          .__INITIAL_STATE__?.videoData;
        if (!vd?.aid || !vd?.cid) return null;
        return { aid: vd.aid, cid: vd.cid, bvid: vd.bvid, desc: vd.desc, tname: vd.tname };
      })
      .catch(() => null)) as { aid: number; cid: number; bvid?: string; desc?: string; tname?: string } | null;
    if (!state) continue;
    desc = state.desc;
    topics = state.tname ? [state.tname] : undefined;

    // 老版 playurl（platform=html5）：单文件 durl mp4，自带音轨，最适合拆解下载
    const play = (await page
      .evaluate(async (s) => {
        const r = await fetch(
          `https://api.bilibili.com/x/player/playurl?avid=${s.aid}&cid=${s.cid}&qn=64&type=oss&platform=html5&fnval=0&bvid=${s.bvid ?? ''}`,
          { credentials: 'include' },
        );
        return r.json();
      }, state)
      .catch(() => null)) as { code?: number; data?: { durl?: { url?: string; backup_url?: string[] }[] } } | null;
    const durl = play?.data?.durl?.[0];
    if (play?.code === 0 && durl) {
      videoUrl = normalizeUrl(durl.url ?? durl.backup_url?.[0] ?? null);
      break;
    }

    // 兜底：__playinfo__ dash（音视频分离）
    const info = (await page
      .evaluate(() => {
        const pi = (window as unknown as {
          __playinfo__?: { data?: { durl?: { url?: string }[]; dash?: { video?: { id?: number; baseUrl?: string }[]; audio?: { baseUrl?: string; bandwidth?: number }[] } } };
        }).__playinfo__;
        return pi ? JSON.stringify(pi) : null;
      })
      .catch(() => null)) as string | null;
    if (info) {
      try {
        const data = (JSON.parse(info) as {
          data?: { durl?: { url?: string }[]; dash?: { video?: { id?: number; baseUrl?: string }[]; audio?: { baseUrl?: string; bandwidth?: number }[] } };
        })?.data;
        if (Array.isArray(data?.durl) && data.durl[0]?.url) {
          videoUrl = data.durl[0].url ?? null;
        } else if (Array.isArray(data?.dash?.video) && data.dash.video.length) {
          const ok = data.dash.video.filter((v) => (v.id ?? 999) <= 64 && v.baseUrl);
          videoUrl = ((ok.length ? ok : data.dash.video).sort((a, b) => (b.id ?? 0) - (a.id ?? 0))[0]?.baseUrl) ?? null;
          audioUrl = [...(data.dash.audio ?? [])].sort((a, b) => (b.bandwidth ?? 0) - (a.bandwidth ?? 0))[0]?.baseUrl ?? null;
        }
      } catch {
        /* ignore */
      }
    }
    break;
  }
  return {
    desc,
    videoUrl: videoUrl ? normalizeUrl(videoUrl) : null,
    audioUrl: audioUrl ? normalizeUrl(audioUrl) : null,
    topics,
  };
}
