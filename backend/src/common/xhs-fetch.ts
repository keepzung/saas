// 小红书域名出口代理(P0 事故修复,2026-11-27):
// 服务器(机房 IP)被小红书风控标记后,MCC/专业号会话在机房 IP 上数小时内必失效,
// 而同一会话在家宽 IP 上持续有效。因此小红书域名的出站请求统一走「家宽代理」
// (本机代理经 ssh 反向隧道映射为服务器 127.0.0.1:13128,env: MCC_PROXY_URL),
// 出口 IP 与登录 IP 一致后风控不再标记;代理不可达(本机关机/隧道断)时自动回退直连。
// 仅 XHS 系域名走代理,其余出站流量不依赖本机。
import { ProxyAgent, type Dispatcher } from 'undici';

let agent: ProxyAgent | null = null;
let inited = false;

function getAgent(): ProxyAgent | null {
  if (inited) return agent;
  inited = true;
  const url = process.env.MCC_PROXY_URL?.trim();
  if (url) {
    try {
      agent = new ProxyAgent(url);
    } catch {
      agent = null;
    }
  }
  return agent;
}

const XHS_HOST_RE = /xiaohongshu\.com/i;

/** 是否启用家宽代理(env 开关 + 域名匹配) */
export function xhsProxyEnabled(url: string): boolean {
  return Boolean(process.env.MCC_PROXY_URL?.trim()) && XHS_HOST_RE.test(url);
}

/**
 * 组装 fetch 的 init:XHS 域名时附加家宽代理 dispatcher(代理请求失败由调用方回退直连)。
 * 用法: fetch(url, withXhsProxy(url, { method: 'POST', headers, body }))
 */
export function withXhsProxy(url: string, init: Record<string, unknown> = {}): Record<string, unknown> {
  if (!xhsProxyEnabled(url)) return init;
  const agent = getAgent();
  if (!agent) return init;
  return { ...init, dispatcher: agent } as Record<string, unknown>;
}

/** 调试: 当前代理配置说明 */
export function xhsProxyInfo(): string {
  const url = process.env.MCC_PROXY_URL?.trim();
  return url ? `proxy=${url} (XHS 域名家宽出口)` : 'proxy=off (直连)';
}
