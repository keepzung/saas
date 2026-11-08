// 无头浏览器工具：chromium 解析（与 pro.service 同策略）+ 反检测启动参数
import * as fs from 'fs';
import * as path from 'path';

export const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function resolveChromium(): string | null {
  if (process.env.CHROME_BIN && fs.existsSync(process.env.CHROME_BIN)) return process.env.CHROME_BIN;
  try {
    const pw = require('playwright-core') as typeof import('playwright-core');
    const p = pw.chromium.executablePath();
    if (p && fs.existsSync(p)) return p;
  } catch {
    /* fallthrough */
  }
  const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
  const bases = [
    ...(process.env.LOCALAPPDATA ? [path.join(process.env.LOCALAPPDATA, 'ms-playwright')] : []),
    ...(home ? [path.join(home, '.cache', 'ms-playwright')] : []),
  ];
  for (const base of bases) {
    try {
      const dirs = fs.readdirSync(base).filter((d) => d.startsWith('chromium-'));
      for (const d of dirs) {
        // 新版布局 chrome-linux64/chrome（1208+），旧版 chrome-linux/chrome，Windows chrome-win/chrome.exe
        const candidates = [
          path.join(base, d, 'chrome-linux64', 'chrome'),
          path.join(base, d, 'chrome-linux', 'chrome'),
          path.join(base, d, 'chrome-win', 'chrome.exe'),
        ];
        for (const c of candidates) if (fs.existsSync(c)) return c;
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

export async function launchBrowser() {
  const { chromium } = require('playwright-core') as typeof import('playwright-core');
  const exe = resolveChromium();
  return chromium.launch({
    executablePath: exe ?? undefined,
    headless: true,
    args: ['--no-proxy-server', '--disable-blink-features=AutomationControlled'],
  });
}

/** 用已保存的登录态创建上下文 */
export async function newAuthedContext(browser: import('playwright-core').Browser, storageStateJson: string) {
  return browser.newContext({
    storageState: JSON.parse(storageStateJson),
    userAgent: DESKTOP_UA,
    locale: 'zh-CN',
    viewport: { width: 1440, height: 900 },
  });
}
