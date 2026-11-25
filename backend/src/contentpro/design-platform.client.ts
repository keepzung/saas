import { Injectable, Logger } from '@nestjs/common';

// 设计平台客户端（小红书通用素材设计平台）：AI 图片生成通道（api.lk888.ai / tt-image-2.6）
// 用于封面 AI 场景（换背景）。登录态自愈：token 7 天过期，过期/401 时用账密重登。
@Injectable()
export class DesignPlatformClient {
  private readonly logger = new Logger('DesignPlatformClient');
  private token: { value: string; fetchedAt: number } | null = null;

  enabled(): boolean {
    return Boolean(
      (process.env.DESIGN_PLATFORM_USERNAME ?? '').trim() &&
        (process.env.DESIGN_PLATFORM_PASSWORD ?? '').trim(),
    );
  }

  private base(): string {
    return (process.env.DESIGN_PLATFORM_BASE_URL ?? 'http://47.109.16.107:4000').replace(/\/+$/, '');
  }

  private async login(): Promise<void> {
    const r = await fetch(`${this.base()}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: (process.env.DESIGN_PLATFORM_USERNAME ?? '').trim(),
        password: (process.env.DESIGN_PLATFORM_PASSWORD ?? '').trim(),
      }),
    });
    const j = (await r.json().catch(() => null)) as { token?: string } | null;
    if (!r.ok || !j?.token) throw new Error(`设计平台登录失败(HTTP ${r.status})`);
    this.token = { value: j.token, fetchedAt: Date.now() };
  }

  private async authedFetch(path: string, init: RequestInit): Promise<Response> {
    if (!this.token || Date.now() - this.token.fetchedAt > 6 * 24 * 3600 * 1000) await this.login();
    const call = () =>
      fetch(`${this.base()}${path}`, {
        ...init,
        headers: { ...(init.headers ?? {}), Authorization: `Bearer ${this.token!.value}` },
      });
    let r = await call();
    if (r.status === 401 || r.status === 403) {
      // 登录态失效自愈：重登一次再试
      this.token = null;
      await this.login();
      r = await call();
    }
    return r;
  }

  /** 场景生成（换背景）：产品参考图 + 场景提示词 → 生成图（平台相对 url） */
  async generateScene(input: {
    prompt: string;
    referenceImageUrl: string;
    width?: number;
    height?: number;
  }): Promise<{ url: string; cost?: number }> {
    const r = await this.authedFetch('/api/ai/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'scene',
        prompt: input.prompt,
        canvas_width: input.width ?? 1080,
        canvas_height: input.height ?? 1440,
        referenceImages: [input.referenceImageUrl],
      }),
    });
    const j = (await r.json().catch(() => null)) as { url?: string; cost?: number; error?: string } | null;
    if (!r.ok || !j?.url) throw new Error(String(j?.error ?? `生成失败(HTTP ${r.status})`));
    return { url: j.url, cost: j.cost };
  }

  /** 下载平台生成图到本地上传目录，返回本地 /uploads 相对路径 */
  async downloadToUploads(remotePath: string, brandId: number): Promise<string> {
    const abs = /^https?:\/\//.test(remotePath) ? remotePath : `${this.base()}${remotePath}`;
    const r = await fetch(abs);
    if (!r.ok) throw new Error(`生成图下载失败(HTTP ${r.status})`);
    const buf = Buffer.from(await r.arrayBuffer());
    const path = await import('path');
    const fs = await import('fs');
    const root = process.env.UPLOAD_ROOT ?? path.resolve(__dirname, '..', '..', 'uploads');
    const dir = path.join(root, 'ai-cover', String(brandId));
    fs.mkdirSync(dir, { recursive: true });
    const filename = `gen_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`;
    fs.writeFileSync(path.join(dir, filename), buf);
    return `/uploads/ai-cover/${brandId}/${filename}`;
  }
}
