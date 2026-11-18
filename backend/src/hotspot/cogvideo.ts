// 智谱 CogVideoX 图生视频客户端：提交任务（429 退避重试）→ 轮询 async-result → 下载 mp4
// 2026-11-18 实测：cogvideox-3 付费模型提交即返 task id，约 1-2 分钟出结果（带水印 mp4 直链）
// cogvideox-flash 免费版并发=1 且常年 429 拥挤，演示/生产建议 cogvideox-3（约 1 元/段）

const BASE = (process.env.ZHIPU_VIDEO_BASE_URL ?? 'https://open.bigmodel.cn/api/paas/v4').replace(/\/+$/, '');
const SUBMIT_RETRIES = Number(process.env.COGVIDEO_SUBMIT_RETRIES ?? 8);
const POLL_INTERVAL_MS = Number(process.env.COGVIDEO_POLL_MS ?? 5000);
const POLL_TIMEOUT_MS = Number(process.env.COGVIDEO_TIMEOUT_MS ?? 600000);

export const cogApiKey = () => (process.env.COGVIDEO_API_KEY ?? '').trim();
export const cogModel = () => (process.env.COGVIDEO_MODEL ?? 'cogvideox-3').trim();
export const cogConfigured = () => Boolean(cogApiKey());

function headers() {
  return { Authorization: `Bearer ${cogApiKey()}`, 'Content-Type': 'application/json' };
}

/** 图片转 data URL（作为生成画面的首帧，保证产品真实展示） */
export function imageToDataUrl(imagePath: string): string | null {
  try {
    const { readFileSync } = require('fs') as { readFileSync: (p: string) => Buffer };
    const ext = (imagePath.split('.').pop() ?? 'jpg').toLowerCase();
    const mime = ext === 'png' ? 'png' : 'jpeg';
    return `data:image/${mime};base64,${readFileSync(imagePath).toString('base64')}`;
  } catch {
    return null;
  }
}

/** 生成一段 5 秒视频（prompt + 可选首帧图），返回 mp4 Buffer */
export async function cogVideoGenerate(
  prompt: string,
  imagePath?: string | null,
): Promise<Buffer> {
  const payload: Record<string, unknown> = { model: cogModel(), prompt };
  if (imagePath) {
    const dataUrl = imageToDataUrl(imagePath);
    if (dataUrl) payload.image_url = dataUrl;
  }

  // 提交：429 指数退避重试
  let taskId = '';
  let last = '';
  for (let attempt = 1; attempt <= SUBMIT_RETRIES; attempt++) {
    const res = await fetch(`${BASE}/videos/generations`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    let json: Record<string, unknown> = {};
    try {
      json = JSON.parse(text) as Record<string, unknown>;
    } catch {
      /* fallthrough */
    }
    if (res.status === 429) {
      const wait = Math.min(30 * attempt, 120);
      last = `429 ${String((json.error as Record<string, unknown>)?.message ?? '')}`;
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    if (res.ok && json.id) {
      taskId = String(json.id);
      break;
    }
    throw new Error(`CogVideoX 提交失败 http ${res.status}: ${text.slice(0, 160)}`);
  }
  if (!taskId) throw new Error(`CogVideoX 持续限流，提交失败: ${last.slice(0, 120)}`);

  // 轮询结果
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const q = await fetch(`${BASE}/async-result/${taskId}`, { headers: headers() });
    if (q.status === 429) {
      await new Promise((r) => setTimeout(r, 10000));
      continue;
    }
    const d = (await q.json()) as {
      task_status?: string;
      video_result?: { url?: string; cover_image_url?: string }[];
    };
    if (d.task_status === 'SUCCESS') {
      const url = d.video_result?.[0]?.url;
      if (!url) throw new Error('CogVideoX 成功但未返回视频地址');
      const dl = await fetch(url);
      if (!dl.ok) throw new Error(`视频下载失败 http ${dl.status}`);
      return Buffer.from(await dl.arrayBuffer());
    }
    if (d.task_status === 'FAIL') {
      throw new Error(`CogVideoX 生成失败: ${JSON.stringify(d).slice(0, 160)}`);
    }
  }
  throw new Error('CogVideoX 生成超时（10 分钟）');
}
