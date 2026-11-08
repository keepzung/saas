// ffmpeg 工具：ffmpeg-static 免安装二进制（可用 FFMPEG_PATH 覆盖），字幕中文字体走 backend/assets/fonts
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export function ffmpegBin(): string {
  const env = process.env.FFMPEG_PATH;
  if (env && fs.existsSync(env)) return env;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const p = require('ffmpeg-static') as string;
  return p;
}

export function uploadRoot(): string {
  return process.env.UPLOAD_ROOT ? process.env.UPLOAD_ROOT : path.resolve(__dirname, '..', '..', 'uploads');
}

export function fontsDir(): string {
  return path.resolve(__dirname, '..', '..', 'assets', 'fonts');
}

/** 中文字幕字体：assets/fonts 优先，其次系统字体（服务器 fonts-noto-cjk / Windows 雅黑） */
export function subtitleFont(): { file: string; family: string } | null {
  const candidates: { file: string; family: string }[] = [];
  try {
    const dir = fontsDir();
    for (const f of fs.readdirSync(dir)) {
      if (/\.(otf|ttf|ttc)$/i.test(f)) candidates.push({ file: path.join(dir, f), family: 'Noto Sans CJK SC' });
    }
  } catch {
    /* ignore */
  }
  candidates.push(
    { file: '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', family: 'Noto Sans CJK SC' },
    { file: '/usr/share/fonts/truetype/wqy/wqy-microhei.ttc', family: 'WenQuanYi Micro Hei' },
  );
  if (process.env.SystemRoot) {
    candidates.push({ file: path.join(process.env.SystemRoot, 'Fonts', 'msyh.ttc'), family: 'Microsoft YaHei' });
  }
  return candidates.find((c) => c.file && fs.existsSync(c.file)) ?? null;
}

/** 执行 ffmpeg，失败抛错（带 stderr 尾部） */
export function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegBin(), args, { windowsHide: true });
    let stderr = '';
    proc.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });
    proc.on('error', (e) => reject(new Error(`ffmpeg 启动失败（${e.message}）`)));
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg 退出码 ${code}：${stderr.slice(-400)}`));
    });
  });
}

/** 探测媒体时长（秒）；失败返回 null */
export async function probeDurationSec(file: string): Promise<number | null> {
  return new Promise((resolve) => {
    const proc = spawn(ffmpegBin(), ['-i', file], { windowsHide: true });
    let stderr = '';
    proc.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
    });
    proc.on('error', () => resolve(null));
    proc.on('close', () => {
      const m = stderr.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
      if (!m) return resolve(null);
      resolve(Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]));
    });
  });
}

/** ASS 字幕：每条字幕带起止时间（秒） */
export function buildAss(
  lines: { start: number; end: number; text: string }[],
  opts?: { fontName?: string; fontSize?: number },
): string {
  const font = opts?.fontName ?? 'Noto Sans CJK SC';
  const size = opts?.fontSize ?? 52;
  const fmt = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h}:${String(m).padStart(2, '0')}:${sec.toFixed(2).padStart(5, '0')}`;
  };
  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    'PlayResX: 720',
    'PlayResY: 1280',
    'WrapStyle: 0',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Sub,${font},${size},&H00FFFFFF,&H00FFFFFF,&H00202020,&H80000000,0,0,0,0,100,100,0,0,1,3,1,2,40,40,180,1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ].join('\n');
  const events = lines.map(
    (l) => `Dialogue: 0,${fmt(l.start)},${fmt(l.end)},Sub,,0,0,0,,${l.text.replace(/\n/g, '\\N')}`,
  );
  return `${header}\n${events.join('\n')}\n`;
}
