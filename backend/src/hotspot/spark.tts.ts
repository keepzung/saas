// 星火社区大模型资源管理平台（spark-hub）任务接口封装：豆包TTS 2.0 / 复刻音色合成 / 音色列表
// 文档: https://operation.spark-hub.cn/api-doc  鉴权: X-API-Key
// 2026-11-18 实测：create_task 的 prompt 在顶层（kwargs 里传会被判「prompt 不能为空」）；
// 任务轮询 status=completed 后 result.audios[0] 为 mp3 直链（一般 3 秒内完成）。
import { randomUUID } from 'crypto';

const BASE = (process.env.SPARKHUB_BASE_URL ?? 'https://operation.spark-hub.cn/task-api').replace(/\/+$/, '');
const TASK_TIMEOUT_MS = Number(process.env.SPARKHUB_TASK_TIMEOUT_MS ?? 120000);
const TASK_POLL_MS = Number(process.env.SPARKHUB_TASK_POLL_MS ?? 2000);

export const sparkApiKey = () => (process.env.SPARKHUB_API_KEY ?? '').trim();
export const sparkConfigured = () => Boolean(sparkApiKey());

function headers(extra: Record<string, string> = {}) {
  return { 'X-API-Key': sparkApiKey(), ...extra };
}

async function getJson(path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}${path}`, { headers: headers() });
  const text = await res.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`spark接口 http ${res.status}: ${text.slice(0, 160)}`);
  }
}

/** 创建任务，返回 task_id */
async function createTask(apiName: string, prompt: string, kwargs: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${BASE}/task/create_task`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ api_name: apiName, prompt, kwargs }),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`创建任务 http ${res.status}: ${text.slice(0, 160)}`);
  }
  const data = (json.data ?? {}) as Record<string, unknown>;
  const taskId = String(data.task_id ?? '');
  if (!taskId) throw new Error(`创建任务失败: ${json.error ?? text.slice(0, 160)}`);
  return taskId;
}

/** 轮询任务直到 completed / 失败，返回 result 对象（audios / videos） */
async function waitTaskResult(taskId: string, timeoutMs = TASK_TIMEOUT_MS): Promise<Record<string, unknown>> {
  const deadline = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, TASK_POLL_MS));
    const json = await getJson(`/task/query_task/${taskId}`);
    const data = (json.data ?? {}) as Record<string, unknown>;
    const status = String(data.status ?? '').toLowerCase();
    if (status === 'completed') {
      const result = (data.result ?? {}) as { audios?: string[]; videos?: string[] };
      if (!result.audios?.length && !result.videos?.length) throw new Error('任务完成但未返回媒体文件');
      return result;
    }
    if (status.includes('fail') || status === 'error') {
      throw new Error(`任务失败: ${JSON.stringify(data.error ?? data).slice(0, 200)}`);
    }
    last = status;
  }
  throw new Error(`任务超时（最后状态: ${last}）`);
}

async function download(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`媒体下载失败 http ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function firstOf(result: Record<string, unknown>, key: 'audios' | 'videos'): Promise<string> {
  const list = (result[key] ?? []) as string[];
  if (!list.length) throw new Error(`任务结果缺少 ${key}`);
  return list[0];
}

/** 豆包 TTS 2.0：公共大模型音色合成（voice_type 如 zh_female_vv_uranus_bigtts），返回 mp3 */
export async function sparkTts(text: string, voiceType: string): Promise<Buffer> {
  const taskId = await createTask('doubao_tts_2_0', text, { speaker: voiceType });
  return download(await firstOf(await waitTaskResult(taskId), 'audios'));
}

/** 复刻音色合成（speaker_id 如 S_xxx，须为平台 clone-speakers 中 Success/Active 状态），返回 mp3 */
export async function sparkCloneTts(text: string, speakerId: string): Promise<Buffer> {
  const taskId = await createTask('doubao_voice_clone', text, { speaker_id: speakerId });
  return download(await firstOf(await waitTaskResult(taskId), 'audios'));
}

// ───────────────────────── Seedance 视频生成 ─────────────────────────

export interface SeedanceOpts {
  /** 首帧图公网 URL（必须是 spark-hub 服务器可访问的地址；不传则纯文生视频） */
  firstImageUrl?: string | null;
  durationSec?: number;
  aspectRatio?: string;
  resolution?: string;
}

/** Seedance 2.0 视频生成（模型 SPARKHUB_VIDEO_MODEL，默认 doubao_seedance_2），返回 mp4。
 *  实测：prompt/resolution/aspect_ratio/duration 均为顶层字段，kwargs.generate_audio=false 关闭同步音频（后续自行配音），约 1.5 分钟/段 */
export async function sparkSeedanceGenerate(prompt: string, opts?: SeedanceOpts): Promise<Buffer> {
  const body: Record<string, unknown> = {
    api_name: (process.env.SPARKHUB_VIDEO_MODEL ?? 'doubao_seedance_2').trim(),
    prompt,
    resolution: opts?.resolution ?? '720p',
    // Seedance 2.5 首帧/首尾帧任务仅接受 aspect_ratio=adaptive（跟随首帧图比例），固定比例会被拒单
    aspect_ratio: opts?.firstImageUrl ? 'adaptive' : (opts?.aspectRatio ?? '9:16'),
    duration: opts?.durationSec ?? 5,
    kwargs: { generate_audio: false },
  };
  if (opts?.firstImageUrl) body.first_image_url = opts.firstImageUrl;
  const res = await fetch(`${BASE}/task/create_task`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`Seedance 提交 http ${res.status}: ${text.slice(0, 160)}`);
  }
  const data = (json.data ?? {}) as Record<string, unknown>;
  const taskId = String(data.task_id ?? '');
  if (!taskId) throw new Error(`Seedance 提交失败: ${json.error ?? text.slice(0, 160)}`);
  return download(await firstOf(await waitTaskResult(taskId, SEEDANCE_TIMEOUT_MS), 'videos'));
}

/** Seedance 视频生成超时上限比音频长（视模型与分辨率可能 2-5 分钟/段） */
const SEEDANCE_TIMEOUT_MS = Number(process.env.SPARKHUB_VIDEO_TIMEOUT_MS ?? 600000);

// ───────────────────────── 音色列表（带内存缓存） ─────────────────────────

export interface SparkSpeaker {
  voice_type: string;
  name: string;
  gender: string;
  categories: string[];
}

export interface SparkCloneSpeaker {
  speaker_id: string;
  name: string;
  state: string;
  preview_url: string | null;
}

let speakersCache: { at: number; list: SparkSpeaker[] } | null = null;
let cloneCache: { at: number; list: SparkCloneSpeaker[] } | null = null;
const LIST_CACHE_MS = Number(process.env.SPARKHUB_LIST_CACHE_MS ?? 300000);

/** 公共音色列表（分页拉全，缓存 5 分钟） */
export async function sparkSpeakers(): Promise<SparkSpeaker[]> {
  if (speakersCache && Date.now() - speakersCache.at < LIST_CACHE_MS) return speakersCache.list;
  const all: SparkSpeaker[] = [];
  for (let page = 1; page <= 10; page++) {
    const json = await getJson(`/task/speakers?page=${page}&page_size=100`);
    const data = (json.data ?? {}) as Record<string, unknown>;
    const list = (data.list ?? []) as SparkSpeaker[];
    all.push(...list);
    if (list.length < 100) break;
  }
  if (!all.length) throw new Error('公共音色列表为空');
  speakersCache = { at: Date.now(), list: all };
  return all;
}

/** 已购复刻音色列表（state: Success/Active 可用），缓存 5 分钟 */
export async function sparkCloneSpeakers(): Promise<SparkCloneSpeaker[]> {
  if (cloneCache && Date.now() - cloneCache.at < LIST_CACHE_MS) return cloneCache.list;
  const all: SparkCloneSpeaker[] = [];
  for (let page = 1; page <= 10; page++) {
    const json = await getJson(`/task/clone-speakers?page=${page}&page_size=100`);
    const data = (json.data ?? {}) as Record<string, unknown>;
    const list = (data.list ?? []) as SparkCloneSpeaker[];
    all.push(...list);
    if (list.length < 100) break;
  }
  cloneCache = { at: Date.now(), list: all };
  return all;
}

/** 使缓存失效（手动同步按钮用） */
export function sparkInvalidateCache(): void {
  speakersCache = null;
  cloneCache = null;
}

/** 未被任何音色下拉收录的音色 id 是否为豆包系（bigtts/ICL 等），供合成路由判断 */
export const isDoubaoVoice = (voice: string) => !voice.startsWith('S_');

/** 校验豆包公共音色 id 是否存在于平台列表（走缓存） */
export async function sparkSpeakerExists(voiceType: string): Promise<boolean> {
  const list = await sparkSpeakers();
  return list.some((s) => s.voice_type === voiceType);
}

