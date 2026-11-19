#!/usr/bin/env node
// 本机运行：把 Nissan N7 图片 / 宠物抖音视频 整理为 ASCII 文件名的暂存目录，供 scp 上传服务器。
// 输出：data-import/staging/nissan-n7/*.jpg + staging/pet-videos/*.mp4 + staging/manifest.json
//   manifest.json: { "nissan-n7/n7_01.jpg": "原始文件名.jpg", ... }（上传后供导入脚本写 MaterialImage.name）
// 排除清单 EXCLUDE_NISSAN：目检发现含其他品牌车辆的图（填原始文件名子串）
const fs = require('fs');
const path = require('path');

const SAAS = path.resolve(__dirname, '..');
const NISSAN_SRC = path.join(SAAS, 'Nissan', '东风日产N7素材1.1');
const PET_SRC = path.join(SAAS, 'pet', '抖音20261021-801190');
const OUT = path.join(__dirname, 'staging');

// 目检排除（2026-11-19 全量 27 张逐张目检结论）：
//   - 「帮你砍价到上头的阿祖」笔记首图实为日产 SUV（非 N7 轿车）→ 剔除
//   - 「爱吃西红柿」笔记存在 (1) 重复文件 → 剔除重复
const EXCLUDE_NISSAN = [
  '帮你砍价到上头的阿祖',
  '爱吃西红柿🍅_来自小红书网页版 (1)',
];
const EXCLUDE_PET = [];

function pad(n) { return String(n).padStart(2, '0'); }

function stageDir(srcDir, outName, prefix, exts, excludeSubs) {
  const outDir = path.join(OUT, outName);
  fs.mkdirSync(outDir, { recursive: true });
  const files = fs.readdirSync(srcDir)
    .filter((f) => exts.some((e) => f.toLowerCase().endsWith(e)))
    .filter((f) => !excludeSubs.some((s) => f.includes(s)))
    .sort();
  const map = {};
  const extCount = {};
  for (const f of files) {
    const ext = path.extname(f).toLowerCase() || '.jpg';
    extCount[ext] = (extCount[ext] ?? 0) + 1;
    const newName = `${prefix}${pad(extCount[ext])}${ext}`;
    fs.copyFileSync(path.join(srcDir, f), path.join(outDir, newName));
    map[`${outName}/${newName}`] = f;
  }
  console.log(`${outName}: ${files.length} 个文件 → ${outDir}`);
  return map;
}

const manifest = {
  ...stageDir(NISSAN_SRC, 'nissan-n7', 'n7_', ['.jpg', '.jpeg', '.png', '.webp'], EXCLUDE_NISSAN),
  ...stageDir(PET_SRC, 'pet-videos', 'pet_', ['.mp4', '.mov', '.webm'], EXCLUDE_PET),
};

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`manifest.json: ${Object.keys(manifest).length} 条 → ${path.join(OUT, 'manifest.json')}`);
console.log('\n下一步：scp -r data-import/staging/* root@marketineok.com:/opt/saas/backend/uploads/materials/');
