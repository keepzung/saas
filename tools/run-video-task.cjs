#!/usr/bin/env node
// 一次性引导：脱离主进程重跑 AI 成片任务（孤儿任务恢复用）
// 用法: node run-video-task.cjs <taskId>   在 /opt/saas/tools 下运行（root）
// 原理: 用编译产物起 Nest 独立应用上下文（HotspotModule），调 VideoService.enqueue 把任务塞回
//       aigc 队列由本进程串行执行；进度照常写 VideoGenTask 行，前端轮询即可见。算力已在创建时扣除不重复扣。
const path = require('path');
const fs = require('fs');

const BACKEND = '/opt/saas/backend';
for (const line of fs.readFileSync(path.join(BACKEND, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([\w.]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}
process.chdir(BACKEND);

const { NestFactory } = require(path.join(BACKEND, 'node_modules/@nestjs/core'));
const { HotspotModule } = require(path.join(BACKEND, 'dist/hotspot/hotspot.module.js'));
const { VideoService } = require(path.join(BACKEND, 'dist/hotspot/video.service.js'));
const { PrismaClient } = require(path.join(BACKEND, 'node_modules/@prisma/client'));
const prisma = new PrismaClient();

const ts = () => new Date().toISOString().slice(11, 19);
(async () => {
  const id = Number(process.argv[2]);
  if (!id) throw new Error('usage: node run-video-task.cjs <taskId>');
  const app = await NestFactory.createApplicationContext(HotspotModule, { logger: false });
  const video = app.get(VideoService);
  console.log(ts(), `enqueue task #${id} (aigc)`);
  video.enqueue(id, 'aigc');
  let last = '';
  for (;;) {
    await new Promise((r) => setTimeout(r, 15000));
    const t = await prisma.videoGenTask.findUnique({
      where: { id },
      select: { status: true, errorMsg: true, videoUrl: true },
    });
    if (!t) { console.log(ts(), 'task not found'); break; }
    const line = `${t.status} | ${(t.errorMsg ?? '').slice(0, 90)}`;
    if (line !== last) { console.log(ts(), line); last = line; }
    if (t.status === 'done' || t.status === 'failed') {
      console.log(ts(), 'FINAL:', t.status, t.videoUrl ?? '', (t.errorMsg ?? '').slice(0, 200));
      break;
    }
  }
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
})().catch((e) => { console.error('ERR', e?.message ?? e); process.exit(1); });
