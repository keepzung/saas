import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'crypto';

export interface LaiguSessionMessage {
  id: number;
  name?: string;
  avatar?: string;
  content?: string;
  type?: string;
  role?: string;
  source?: string;
  sub_source?: string;
  created_at?: number;
}

export interface LaiguSession {
  session_id: number;
  client_id?: string;
  client_name?: string;
  client_attrs?: Record<string, unknown>;
  is_resource?: boolean;
  customer_impression?: Record<string, unknown>;
  ad_info?: Record<string, unknown>;
  chat_entry?: string;
  ip_location?: string;
  ended_at?: number;
  created_at?: number;
  source?: string;
  sub_source?: string;
  messages?: LaiguSessionMessage[];
}

export interface LaiguChatMessagesData {
  sessions: LaiguSession[];
  total: number;
  page: number;
  page_size: number;
}

interface LaiguEnvelope<T> {
  success: boolean;
  code: number;
  message: string;
  data: T;
}

/** body key 按 ASCII 排序后的紧凑 JSON（与来鼓签名文档示例值校准一致） */
function sortedCompactJson(obj: Record<string, unknown>): string {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) sorted[key] = obj[key];
  return JSON.stringify(sorted);
}

@Injectable()
export class LaiguApiClient {
  private readonly logger = new Logger(LaiguApiClient.name);
  private readonly baseUrl: string;
  private readonly appKey: string;
  private readonly secret: string;

  constructor(configService: ConfigService) {
    this.baseUrl = (configService.get<string>('LAIGU_BASE_URL') ?? '').replace(/\/$/, '');
    this.appKey = configService.get<string>('LAIGU_APP_KEY') ?? '';
    this.secret = configService.get<string>('LAIGU_SECRET') ?? '';
  }

  /** 签名：MD5(app_key + timestamp + nonce + body_hash + secret_key) */
  private buildHeaders(bodyStr: string) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = randomUUID();
    const md5 = (value: string) => createHash('md5').update(value, 'utf8').digest('hex');
    const bodyHash = bodyStr ? md5(bodyStr) : '';
    const signature = md5(this.appKey + timestamp + nonce + bodyHash + this.secret);
    return {
      'Content-Type': 'application/json',
      'X-App-Key': this.appKey,
      'X-Timestamp': timestamp,
      'X-Nonce': nonce,
      'X-Signature': signature,
    };
  }

  async post<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
    if (!this.baseUrl || !this.appKey || !this.secret) {
      throw new Error('来鼓连接已关闭（测试账号已断开，如需恢复请在 .env 配置 LAIGU_* 凭证）');
    }
    const bodyStr = sortedCompactJson(body);
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: this.buildHeaders(bodyStr),
        body: bodyStr,
      });
    } catch (error) {
      throw new Error(`来鼓 API 网络错误: ${(error as Error).message}`);
    }
    let json: LaiguEnvelope<T>;
    try {
      json = (await res.json()) as LaiguEnvelope<T>;
    } catch {
      throw new Error(`来鼓 API 响应非 JSON（HTTP ${res.status}）`);
    }
    if (!json.success || json.code !== 0) {
      throw new Error(`来鼓 API 错误 code=${json.code} message=${json.message}（HTTP ${res.status}）`);
    }
    return json.data;
  }

  async chatMessages(params: {
    from_tm: number;
    to_tm: number;
    page: number;
    page_size: number;
  }): Promise<LaiguChatMessagesData> {
    return this.post<LaiguChatMessagesData>('/chat/messages', params);
  }
}
