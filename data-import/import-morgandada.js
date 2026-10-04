#!/usr/bin/env node
// Morgandada（brandId=5）小红书矩阵账号导入
// 来源：morgandada/DaDa kos 21账号信息.xlsx（21 个专业号：昵称/小红书号/主页链接/注册手机号）
// 口径：
//   - authorId 用 mdd_<md5(昵称)> 兜底（Excel 无 UID）
//   - storeName = 昵称去掉 MorganDaDa 前缀与 "-人名" 后缀；operatorName = 人名后缀
//   - accountTag：无后缀主账号=店铺号，带 "-人名" 后缀=员工号（sheet2 店铺号/个人号分组）
// 用法: node import-morgandada.js [--dry-run]
const path = require('path');
const fs = require('fs');
const { createRequire } = require('module');

const ROOT = path.resolve(__dirname, '..');
const backendRequire = createRequire(path.join(ROOT, 'backend', 'noop.js'));
const { PrismaClient } = backendRequire('@prisma/client');

const DRY_RUN = process.argv.includes('--dry-run');
const MDD_BRAND = 5;

const md5 = (s) => require('crypto').createHash('md5').update(s).digest('hex');

// morgandada/DaDa kos 21账号信息.xlsx sheet1（认证—小红书昵称/小红书号/链接/注册手机号）
const ACCOUNTS = [
  { nickname: 'MorganDaDa北京SKP', xhsId: 'V17799861580', url: 'https://www.xiaohongshu.com/user/profile/66883061000000000303387d', mobile: '17799861580' },
  { nickname: 'MorganDaDa北京SKP-小云', xhsId: '95629730176', url: 'https://www.xiaohongshu.com/user/profile/674c101a000000001c01a91d', mobile: '19157604717' },
  { nickname: 'MorganDaDa北京SKP-小静', xhsId: 'V18333976016', url: 'https://www.xiaohongshu.com/user/profile/694bad26000000002b00a8d8', mobile: '19357690992' },
  { nickname: 'MorganDaDa成都SKP', xhsId: 'SKP15928750990', url: 'https://www.xiaohongshu.com/user/profile/69428486000000000300f132', mobile: '19357087934' },
  { nickname: 'MorganDaDa成都skp-燕燕', xhsId: 'Wei18281820377', url: 'https://www.xiaohongshu.com/user/profile/694b7c89000000003201f8c5', mobile: '19357126256' },
  { nickname: 'MorganDaDa成都SKP-静静', xhsId: 'wei13778461196', url: 'https://www.xiaohongshu.com/user/profile/694babb6000000000300e7d2', mobile: '19357219799' },
  { nickname: 'MorganDaDa南京德基店', xhsId: 'wei17751792742', url: 'https://www.xiaohongshu.com/user/profile/66b9ae13000000001d03229d', mobile: '17799807107', remark: '原杭州万象城门店号，现换给南京德基店使用；原号违规注销中' },
  { nickname: 'MorganDaDa南京德基店- Eileen', xhsId: '9565735352', url: 'https://www.xiaohongshu.com/user/profile/60bc64840000000001001a32', mobile: '17714384191' },
  { nickname: 'MorganDaDa南京德基-胡胡', xhsId: 'wei13912977810', url: 'https://www.xiaohongshu.com/user/profile/694bb0dd000000003202ba6a', mobile: '19357512668' },
  { nickname: 'MorganDaDa西安SKP', xhsId: 'WeiMgdd2510', url: 'https://www.xiaohongshu.com/user/profile/693f9968000000000300f57d', mobile: '19975377903' },
  { nickname: 'MorganDaDa西安SKP-闪闪', xhsId: 'Mgdd2510', url: 'https://www.xiaohongshu.com/user/profile/68f5b33d0000000037031efa', mobile: '19157636648' },
  { nickname: 'MorganDaDa深圳罗湖万象城', xhsId: 'MGDD20250329', url: 'https://www.xiaohongshu.com/user/profile/636a4ead000000001f014073', mobile: '18129931582' },
  { nickname: 'MorganDaDa深圳罗湖万象城-小青', xhsId: 'XQ516693', url: 'https://www.xiaohongshu.com/user/profile/646781390000000012037429', mobile: '17724635578' },
  { nickname: 'MorganDaDa深圳罗湖万象城-雯雯', xhsId: 'wen_470', url: 'https://www.xiaohongshu.com/user/profile/694cd3f5000000002b0083f4', mobile: '19357562399' },
  { nickname: 'MorganDaDa杭州大厦', xhsId: '49313172886', url: 'https://www.xiaohongshu.com/user/profile/6a28d9320000000008009000', mobile: '19357594002' },
  { nickname: 'MorganDaDa杭州大厦-七月', xhsId: '63046560829', url: 'https://www.xiaohongshu.com/user/profile/6a3f8d11000000000c001c01', mobile: '19357637817' },
  { nickname: 'MorganDaDa杭州大厦-朱朱', xhsId: '27769132888', url: 'https://www.xiaohongshu.com/user/profile/67e6b066000000000d0089a1', mobile: '15355494362' },
  { nickname: 'MorganDaDa武商MALL', xhsId: '6751312561', url: 'https://www.xiaohongshu.com/user/profile/63313b29000000002303d757', mobile: '19357209033' },
  { nickname: 'MorganDaDa武商MALL-李李', xhsId: '95297247306', url: 'https://www.xiaohongshu.com/user/profile/663ba3a800000000030330b8', mobile: '15872421228' },
  { nickname: 'MorganDaDa武商MALL-莎莎', xhsId: '63517264466', url: 'https://www.xiaohongshu.com/user/profile/69aeef450000000032036506', mobile: '13638699980' },
  { nickname: 'MorganDaDa上海久光百货', xhsId: '1383355788', url: 'https://www.xiaohongshu.com/user/profile/61ef4032000000001000e6dd', mobile: '15001945846' },
];

const CITY_BY_KEYWORD = [
  ['北京', '北京'], ['成都', '成都'], ['南京', '南京'], ['西安', '西安'],
  ['深圳', '深圳'], ['杭州', '杭州'], ['武商', '武汉'], ['上海', '上海'],
];

// MorganDaDa北京SKP-小云 → { store: 北京SKP, staff: 小云 }
function parseNickname(nickname) {
  const body = nickname.replace(/^morgandada/i, '');
  const m = body.match(/^(.+?)\s*[-—]\s*(.+)$/);
  const store = (m ? m[1] : body).trim();
  const staff = m ? m[2].trim() : null;
  const city = (CITY_BY_KEYWORD.find(([k]) => store.includes(k)) ?? [])[1] ?? null;
  return { store, staff, city };
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const brand = await prisma.brand.findUnique({ where: { id: MDD_BRAND } });
    if (!brand) {
      console.error(`brandId=${MDD_BRAND} 不存在`);
      process.exit(1);
    }
    console.log(`导入 ${ACCOUNTS.length} 个矩阵账号 → ${brand.name}（brandId=${MDD_BRAND}）${DRY_RUN ? '（dry-run）' : ''}`);
    let upserted = 0;
    for (const a of ACCOUNTS) {
      const { store, staff, city } = parseNickname(a.nickname);
      const data = {
        authorId: `mdd_${md5(a.nickname).slice(0, 16)}`,
        nickname: a.nickname,
        platform: 'xhs',
        accountType: 'KOS',
        accountTag: staff ? '员工号' : '店铺号',
        storeName: store,
        areaName: city,
        operatorName: staff,
        operatorMobile: a.mobile,
        authorUrl: a.url,
        status: 'enabled',
        brandId: MDD_BRAND,
      };
      if (DRY_RUN) {
        console.log(`  [dry] ${a.nickname} | ${data.accountTag} | 门店=${store} | 城市=${city} | 运营=${staff ?? '-'} | ${a.mobile}`);
      } else {
        await prisma.kosAccount.upsert({
          where: { authorId: data.authorId },
          create: data,
          update: {
            nickname: data.nickname,
            accountTag: data.accountTag,
            storeName: data.storeName,
            areaName: data.areaName,
            operatorName: data.operatorName,
            operatorMobile: data.operatorMobile,
            authorUrl: data.authorUrl,
            brandId: MDD_BRAND,
          },
        });
      }
      upserted += 1;
    }
    console.log(`完成：${upserted} 个账号（店铺号 ${ACCOUNTS.filter((a) => !parseNickname(a.nickname).staff).length} / 员工号 ${ACCOUNTS.filter((a) => parseNickname(a.nickname).staff).length}）`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
