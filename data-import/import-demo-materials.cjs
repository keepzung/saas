#!/usr/bin/env node
// 服务器运行：把已上传的演示素材写入 DB（幂等，可重跑）
//   1. brand 10 Nissan：MaterialTypeTag「N7」（车型筛选标签）+ MaterialImageSet「东风日产N7素材1.1」
//      + uploads/materials/nissan-n7/*.jpg → MaterialImage（name 用 staging/manifest.json 的原始文件名）
//   2. brand 11 宠物：uploads/materials/pet-videos/*.mp4 → MaterialVideo（宽标签组，供混剪 mediaQuery 命中）
//   3. 宠物封面池：若 uploads/materials/pet-covers 为空且有 ffmpeg，从视频抽 6 帧生成
//      （copy-df-to-demo.cjs --to=11 用该目录做笔记封面池，需先于它执行）
// 用法: node import-demo-materials.cjs [--skip-covers]
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const ROOT = path.resolve(__dirname, '..');
const backendRequire = createRequire(path.join(ROOT, 'backend', 'noop.js'));
const { PrismaClient } = backendRequire('@prisma/client');

const envPath = path.join(ROOT, 'backend', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const UPLOADS = path.join(ROOT, 'backend', 'uploads');
const SKIP_COVERS = process.argv.includes('--skip-covers');
// 宠物视频宽标签：混剪按 shot.mediaQuery 与 tags 求交命中，标签过窄会命中不到视频
const PET_TAGS = ['宠物', '狗狗', '猫咪', '萌宠', '日常', '特写', '零食', '喂养', '玩耍', '可爱', '宠物食品', '宠物用品', '居家', '好物'];

const prisma = new PrismaClient();

function listFiles(relDir, exts) {
  const abs = path.join(UPLOADS, relDir);
  try {
    return fs.readdirSync(abs).filter((f) => exts.some((e) => f.toLowerCase().endsWith(e))).sort();
  } catch {
    return [];
  }
}

function loadManifest() {
  const p = path.join(UPLOADS, 'manifest.json');
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return {};
  }
}

function ffprobePath() {
  try {
    // eslint-disable-next-line import/no-dynamic-require
    return backendRequire('ffprobe-static').path;
  } catch {
    return null;
  }
}

function probeDuration(file) {
  const bin = ffprobePath();
  if (!bin) return null;
  try {
    const { execFileSync } = require('child_process');
    const out = execFileSync(bin, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { timeout: 20000 });
    const sec = Math.round(parseFloat(String(out).trim()));
    return Number.isFinite(sec) && sec > 0 ? sec : null;
  } catch {
    return null;
  }
}

function ffmpegBin() {
  try {
    // eslint-disable-next-line import/no-dynamic-require
    return backendRequire('ffmpeg-static');
  } catch {
    return null;
  }
}

function extractPetCovers(videos) {
  const outDir = path.join(UPLOADS, 'materials', 'pet-covers');
  const existing = listFiles('materials/pet-covers', ['.jpg', '.jpeg', '.png']).length;
  if (existing > 0) {
    console.log(`pet-covers: 已有 ${existing} 张，跳过抽帧`);
    return;
  }
  const bin = ffmpegBin();
  if (!bin) {
    console.log('pet-covers: 未找到 ffmpeg-static，跳过抽帧（copy-df-to-demo --to=11 将置空宠物封面）');
    return;
  }
  fs.mkdirSync(outDir, { recursive: true });
  const { execFileSync } = require('child_process');
  let made = 0;
  for (let i = 0; i < Math.min(6, videos.length); i += 1) {
    const out = path.join(outDir, `pet_cover_${String(i + 1).padStart(2, '0')}.jpg`);
    try {
      execFileSync(bin, ['-y', '-ss', '2', '-i', videos[i], '-frames:v', '1', '-q:v', '3', out], { timeout: 30000 });
      made += 1;
    } catch (e) {
      console.log(`  抽帧失败 ${path.basename(videos[i])}: ${e.message.split('\n')[0]}`);
    }
  }
  console.log(`pet-covers: 抽帧生成 ${made} 张 → materials/pet-covers/`);
}

async function importNissan(manifest) {
  const files = listFiles('materials/nissan-n7', ['.jpg', '.jpeg', '.png', '.webp']);
  if (!files.length) {
    console.log('nissan-n7: 目录为空，跳过（先 scp staging/nissan-n7 上传）');
    return;
  }
  const tag = await prisma.materialTypeTag.findFirst({ where: { brandId: 10, name: 'N7' } });
  const tagId = tag
    ? tag.id
    : (await prisma.materialTypeTag.create({ data: { brandId: 10, name: 'N7' } })).id;
  const set = await prisma.materialImageSet.findFirst({ where: { brandId: 10, name: '东风日产N7素材1.1' } });
  const setId = set
    ? set.id
    : (await prisma.materialImageSet.create({ data: { brandId: 10, name: '东风日产N7素材1.1' } })).id;
  console.log(`nissan-n7: 车型标签「N7」#${tagId}，套图「东风日产N7素材1.1」#${setId}`);

  let added = 0;
  for (const f of files) {
    const url = `/uploads/materials/nissan-n7/${f}`;
    const dup = await prisma.materialImage.findFirst({ where: { brandId: 10, url } });
    if (dup) continue;
    await prisma.materialImage.create({
      data: {
        brandId: 10, url, name: manifest[`nissan-n7/${f}`] ?? f, typeId: tagId, setId, status: 1,
      },
    });
    added += 1;
  }
  const total = await prisma.materialImage.count({ where: { brandId: 10 } });
  console.log(`nissan-n7: 新增 MaterialImage ${added}，brand10 现有 ${total} 张`);
}

async function importPetVideos() {
  const files = listFiles('materials/pet-videos', ['.mp4', '.mov', '.webm']);
  if (!files.length) {
    console.log('pet-videos: 目录为空，跳过（先 scp staging/pet-videos 上传）');
    return;
  }
  let added = 0;
  for (const f of files) {
    const url = `/uploads/materials/pet-videos/${f}`;
    const dup = await prisma.materialVideo.findFirst({ where: { brandId: 11, url } });
    if (dup) continue;
    await prisma.materialVideo.create({
      data: {
        brandId: 11, url, tags: PET_TAGS, durationSec: probeDuration(path.join(UPLOADS, 'materials', 'pet-videos', f)),
      },
    });
    added += 1;
  }
  const total = await prisma.materialVideo.count({ where: { brandId: 11 } });
  console.log(`pet-videos: 新增 MaterialVideo ${added}，brand11 现有 ${total} 条`);
}

async function main() {
  if (!/\/saas_prod(\?|$)/.test(process.env.DATABASE_URL || '')) {
    throw new Error('DATABASE_URL 未指向 saas_prod——本脚本仅应在服务器上对 saas_prod 执行');
  }
  const manifest = loadManifest();
  await importNissan(manifest);
  const petFiles = listFiles('materials/pet-videos', ['.mp4', '.mov', '.webm']).map((f) => path.join(UPLOADS, 'materials', 'pet-videos', f));
  if (!SKIP_COVERS) extractPetCovers(petFiles);
  await importPetVideos();
  console.log('\n完成：演示素材入库');
}

main()
  .catch((e) => { console.error('failed:', e.message ?? e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
