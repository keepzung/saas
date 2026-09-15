#!/usr/bin/env node
// extract-har-assets.js — 从 docs/har/**/*.har 提取原站静态资源到 docs/har-extracted/
// 用法：node tools/extract-har-assets.js

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HAR_DIR = path.join(ROOT, 'docs', 'har');
const OUT_DIR = path.join(ROOT, 'docs', 'har-extracted');

const ASSET_RE = /^https:\/\/saas\.marketine\.cn\/assets\/(css|js)\/([^/?]+)/;
const IMG_RE = /^https:\/\/(saas\.marketine\.cn|img\.gartech\.cc)\/(.+\.(?:png|jpg|jpeg|webp|svg|gif))(?:\?|$)/i;

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name.endsWith('.har')) out.push(p);
  }
  return out;
}

function main() {
  if (!fs.existsSync(HAR_DIR)) {
    console.error('docs/har not found');
    process.exit(1);
  }
  fs.rmSync(OUT_DIR, { recursive: true, force: true });

  const saved = new Map();
  const skipped = [];

  for (const harFile of walk(HAR_DIR)) {
    const module = path.basename(path.dirname(harFile));
    let har;
    try {
      har = JSON.parse(fs.readFileSync(harFile, 'utf8'));
    } catch (e) {
      skipped.push(`${module}: parse failed ${e.message}`);
      continue;
    }
    for (const entry of har.log.entries || []) {
      const url = entry.request.url;
      const content = entry.response && entry.response.content;
      if (!content || !content.text) continue;

      let typeDir = null;
      let filename = null;

      const am = url.match(ASSET_RE);
      if (am) {
        typeDir = am[1];
        filename = decodeURIComponent(am[2]);
      } else {
        const im = url.match(IMG_RE);
        if (im) {
          typeDir = 'images';
          filename = decodeURIComponent(im[2].replace(/\//g, '__'));
        }
      }
      if (!typeDir) continue;

      const key = `${typeDir}/${filename}`;
      if (saved.has(key)) {
        saved.get(key).sources.push(module);
        continue;
      }

      const buf =
        content.encoding === 'base64'
          ? Buffer.from(content.text, 'base64')
          : Buffer.from(content.text, 'utf8');

      const destDir = path.join(OUT_DIR, module, typeDir);
      fs.mkdirSync(destDir, { recursive: true });
      fs.writeFileSync(path.join(destDir, filename), buf);
      saved.set(key, { dest: path.join(module, typeDir, filename), size: buf.length, sources: [module] });
    }
  }

  const rows = [...saved.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [key, meta] of rows) {
    console.log(String(meta.size).padStart(8), key, '<-', [...new Set(meta.sources)].join(','));
  }
  console.log(`\ntotal ${rows.length} assets -> ${path.relative(ROOT, OUT_DIR)}`);
  if (skipped.length) {
    console.log('skipped:');
    for (const s of skipped) console.log(' ', s);
  }
}

main();
