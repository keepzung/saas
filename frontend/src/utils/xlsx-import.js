import * as XLSX from 'xlsx';

const clean = (v) => {
  if (v == null) return '';
  const s = String(v).trim();
  return s === '无' ? '' : s;
};

const pick = (row, keyword) => {
  for (const key of Object.keys(row)) {
    if (key.includes(keyword)) return row[key];
  }
  return '';
};

/**
 * 解析「KOS 账号导入表」：表头含 账号UID / 账号类型 / 大区（或汇总区域）/ 销售区域 / 省份 / 城市 / 门店名称 / 主页地址
 */
export async function parseAccountWorkbook(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  const accounts = [];
  const errors = [];
  rows.forEach((r, idx) => {
    const authorId = clean(pick(r, 'UID'));
    if (!authorId) {
      const store = clean(pick(r, '门店'));
      if (!store) return;
      errors.push(`第 ${idx + 2} 行：缺少账号UID`);
      return;
    }
    const region = clean(pick(r, '大区'));
    const summaryRegion = clean(pick(r, '汇总区域'));
    const fansRaw = Number(clean(pick(r, '粉丝')));
    accounts.push({
      authorId,
      nickname: clean(pick(r, '昵称')),
      accountType: clean(pick(r, '账号类型')) || 'KOS',
      regionName: region || summaryRegion,
      saleArea: clean(pick(r, '销售区域')),
      region,
      province: clean(pick(r, '省份')),
      city: clean(pick(r, '城市')),
      storeName: clean(pick(r, '门店')),
      authorUrl: clean(pick(r, '主页')),
      fans: Number.isFinite(fansRaw) && fansRaw >= 0 ? fansRaw : undefined,
      operatorName: clean(pick(r, '运营人')) || clean(pick(r, '实操')),
      operatorMobile: clean(pick(r, '手机')),
      accountTag: clean(pick(r, '标签')),
    });
  });

  if (!accounts.length && !errors.length) {
    errors.push('未解析到数据行，请确认表头包含「账号UID」等列');
  }
  return { accounts, errors };
}

/**
 * 解析「批量开通账号导入表」：
 * 表头含 手机号 / 昵称 / 初始密码（可留空=自动生成）/ 品牌角色（kos_operator 等 key 或中文标签）/ 组织（门店名）/ 绑定小红书昵称
 */
export async function parseUserWorkbook(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  const ROLE_LABELS = {
    运营主管: 'agency_manager',
    运营执行: 'agency_executive',
    品牌方: 'brand_owner',
    品牌管理员: 'brand_admin',
    工作区管理员: 'brand_admin',
    组织管理员: 'org_manager',
    门店管理员: 'org_manager',
    'kos': 'kos_operator',
    kos运营: 'kos_operator',
    kos员工: 'kos_operator',
    员工: 'kos_operator',
    内容供应商: 'content_supplier',
    媒介服务商: 'media_partner',
  };
  const normalizeRole = (raw) => {
    const s = clean(raw).toLowerCase();
    if (!s) return '';
    if (/^(agency_manager|agency_executive|brand_owner|brand_admin|org_manager|kos_operator|content_supplier|media_partner)$/.test(s)) return s;
    return ROLE_LABELS[s] || ROLE_LABELS[clean(raw)] || '';
  };

  const users = [];
  const errors = [];
  rows.forEach((r, idx) => {
    const phone = clean(pick(r, '手机号')).replace(/\s|-/g, '');
    if (!phone) return;
    if (!/^1\d{10}$/.test(phone)) {
      errors.push(`第 ${idx + 2} 行：手机号「${phone}」格式不正确`);
      return;
    }
    const password = clean(pick(r, '密码'));
    if (password && password.length < 8) {
      errors.push(`第 ${idx + 2} 行：初始密码至少 8 位`);
      return;
    }
    users.push({
      phone,
      nickname: clean(pick(r, '昵称')),
      password: password || undefined,
      roleKey: normalizeRole(pick(r, '角色')),
      orgName: clean(pick(r, '组织')) || clean(pick(r, '门店')),
      kosNickname: clean(pick(r, '绑定小红书')) || clean(pick(r, '小红书昵称')),
    });
  });

  if (!users.length && !errors.length) {
    errors.push('未解析到数据行，请确认表头包含「手机号」列');
  }
  return { users, errors };
}

/**
 * 解析「SKU 产品信息收集表」：一个工作簿 = 一个产品
 * 主表为 分类/标签/具体信息 三列键值结构，其余 sheet 作为附表并入知识库
 */
export async function parseSkuWorkbook(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf);

  const main = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
    header: 1,
    defval: null,
  });

  const sections = [];
  let current = null;
  for (let i = 1; i < main.length; i += 1) {
    const [cat, label, value] = main[i];
    if (cat != null && clean(cat)) {
      current = { category: clean(cat), items: [] };
      sections.push(current);
    }
    if (label == null && value == null) continue;
    if (current) {
      current.items.push({ label: clean(label), value: clean(value) });
    }
  }

  const flat = sections.flatMap((s) => s.items);
  const findVal = (kw) => {
    const item = flat.find((x) => x.label.includes(kw));
    return item ? item.value : '';
  };

  const fullName = findVal('产品名称');
  const shortName = findVal('别称');
  if (!fullName && !shortName) {
    throw new Error(`【${file.name}】未找到「产品名称」行，请确认是 SKU 收集表格式`);
  }

  const positioning = findVal('定位');
  const description = [
    fullName && `全称：${fullName}`,
    positioning && `定位：${positioning}`,
    shortName && `常用称呼：${shortName}`,
  ]
    .filter(Boolean)
    .join('｜');

  const knowledge = sections
    .filter((s) => s.items.length)
    .map(
      (s) =>
        `【${s.category}】\n` +
        s.items
          .map((it) =>
            it.value
              ? `${it.label}：${it.value}`
              : /局限|边界|FAQ|常见疑问/.test(it.label)
                ? `${it.label}：暂无`
                : '',
          )
          .filter(Boolean)
          .join('\n'),
    )
    .join('\n\n');

  const extras = [];
  for (let s = 1; s < wb.SheetNames.length; s += 1) {
    const name = wb.SheetNames[s];
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], {
      header: 1,
      defval: null,
    }).filter((r) => r.some((c) => c != null && clean(c)));
    if (rows.length < 2) continue;
    const text = rows
      .map((r) =>
        r
          .filter((c) => c != null)
          .map((c) => clean(c))
          .filter(Boolean)
          .join(' | '),
      )
      .join('\n');
    extras.push(`【附表：${name}】\n${text}`);
  }

  const faq = findVal('FAQ') || findVal('常见疑问');

  return {
    name: shortName || fullName,
    displayName: fullName || shortName,
    description,
    knowledge: [knowledge, ...extras].filter(Boolean).join('\n\n'),
    faq: faq || '',
    sourceFile: file.name,
  };
}
