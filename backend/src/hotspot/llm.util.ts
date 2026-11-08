// LLM 调用工具：OpenAI 兼容网关（与 contentpro/ai.service 同一套环境变量）
// LLM_BASE_URL 默认智谱 open.bigmodel.cn；LLM_MODEL 默认 glm-4-flash；
// VISION_MODEL 默认 glm-4v-flash（视觉/视频帧理解，免费）；ASR_MODEL 默认 glm-asr

export const llmBase = () =>
  (process.env.LLM_BASE_URL ?? 'https://open.bigmodel.cn/api/paas/v4').replace(/\/+$/, '');
export const llmKey = () => process.env.LLM_API_KEY ?? '';
export const llmModel = () => process.env.LLM_MODEL ?? 'glm-4-flash';
export const visionModel = () => process.env.VISION_MODEL ?? 'glm-4v-flash';
export const asrModel = () => process.env.ASR_MODEL ?? 'glm-asr';

export const llmEnabled = () => Boolean(llmKey());

type TextPart = { type: 'text'; text: string };
type ImagePart = { type: 'image_url'; image_url: { url: string } };
export type ContentPart = TextPart | ImagePart;

interface ChatMessage {
  role: 'system' | 'user';
  content: string | ContentPart[];
}

async function chat(messages: ChatMessage[], model: string, temperature = 0.6): Promise<string> {
  const res = await fetch(`${llmBase()}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${llmKey()}`,
    },
    body: JSON.stringify({ model, messages, temperature }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`LLM http ${res.status} ${detail.slice(0, 200)}`);
  }
  const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return j.choices?.[0]?.message?.content ?? '';
}

/** 文本对话 */
export function chatText(system: string, user: string, opts?: { model?: string; temperature?: number }) {
  return chat(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    opts?.model ?? llmModel(),
    opts?.temperature,
  );
}

/** 多图/图文混合理解 */
export function chatVision(system: string, parts: ContentPart[], opts?: { model?: string; temperature?: number }) {
  return chat(
    [
      { role: 'system', content: system },
      { role: 'user', content: parts },
    ],
    opts?.model ?? visionModel(),
    opts?.temperature,
  );
}

/** 要求模型输出 JSON 并容错解析；解析失败返回 null */
export async function chatJson<T>(system: string, user: string, opts?: { model?: string; temperature?: number }) {
  const text = await chatText([system, '输出严格 JSON，不要输出任何解释文字。'].join('\n'), user, opts);
  return parseJsonLoose<T>(text);
}

/** 从模型输出里抠 JSON（容忍 ```json 包裹 / 前后缀文字） */
export function parseJsonLoose<T>(text: string): T | null {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidates = [fenced?.[1], text];
  for (const c of candidates) {
    if (!c) continue;
    const m = c.match(/\{[\s\S]*\}/);
    if (!m) continue;
    try {
      return JSON.parse(m[0]) as T;
    } catch {
      /* try next */
    }
  }
  return null;
}

/** ASR：multipart 上传音频文件转写；供应商不支持/失败抛错（调用方决定是否降级） */
export async function transcribeAudio(filePath: string): Promise<string> {
  const { readFileSync } = await import('fs');
  const { basename } = await import('path');
  const buf = readFileSync(filePath);
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(buf)]), basename(filePath));
  form.append('model', asrModel());
  const res = await fetch(`${llmBase()}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${llmKey()}` },
    body: form,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`ASR http ${res.status} ${detail.slice(0, 200)}`);
  }
  const j = (await res.json()) as { text?: string };
  return j.text ?? '';
}
