// 测试：纯 fetch + Cookie 直连星火 API（无浏览器指纹）
const fs = require('fs');
const path = require('path');

const state = JSON.parse(fs.readFileSync(path.join(__dirname, 'state/auth.json'), 'utf8'));
const cookies = state.cookies
  .map((c) => `${c.name}=${c.value}`)
  .join('; ');
const ua =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const reqBody = JSON.parse(fs.readFileSync(path.join(__dirname, 'state/req-rtb.json'), 'utf8'));

(async () => {
  const res = await fetch('https://mcc.xiaohongshu.com/api/mcc/board/rtb_metrics', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookies,
      'User-Agent': ua,
      Origin: 'https://mcc.xiaohongshu.com',
      Referer: 'https://mcc.xiaohongshu.com/micro/aurora-data',
      'Accept-Language': 'zh-CN,zh;q=0.9',
    },
    body: JSON.stringify(reqBody),
  });
  console.log('STATUS:', res.status);
  const text = await res.text();
  try {
    const j = JSON.parse(text);
    console.log('code:', j.code, 'total:', j.data && j.data.total);
    console.log('summary:', JSON.stringify(j.data && j.data.rtbSummaryMetricsVo));
  } catch {
    console.log('BODY:', text.slice(0, 400));
  }
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
