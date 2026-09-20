// 服务器端直连测试：node test-server-fetch.cjs <authJsonPath>
const fs = require('fs');

const state = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const cookies = state.cookies.map((c) => `${c.name}=${c.value}`).join('; ');

(async () => {
  const res = await fetch('https://mcc.xiaohongshu.com/api/mcc/board/rtb_metrics', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookies,
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      Origin: 'https://mcc.xiaohongshu.com',
      Referer: 'https://mcc.xiaohongshu.com/micro/aurora-data',
    },
    body: JSON.stringify({
      timeEnd: '2026-09-20',
      timeStart: '2026-09-14',
      showStar: false,
      accountOrgCode: '1942550061000474624',
      accountCode: '',
      pageIndex: 1,
      pageSize: 20,
      tagIds: [],
      launchStatus: '',
    }),
  });
  console.log('STATUS:', res.status);
  const text = await res.text();
  try {
    const j = JSON.parse(text);
    console.log('code:', j.code, 'total:', j.data && j.data.total);
    console.log('summary:', JSON.stringify(j.data && j.data.rtbSummaryMetricsVo));
  } catch {
    console.log('BODY:', text.slice(0, 300));
  }
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
