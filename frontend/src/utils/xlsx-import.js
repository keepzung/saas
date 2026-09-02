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
 * 解析「格力账号导入表」：表头含 账号UID / 账号类型 / 省份 / 城市 / 门店名称 / 主页地址
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
    accounts.push({
      authorId,
      accountType: clean(pick(r, '账号类型')) || 'KOS',
      region: clean(pick(r, '大区')),
      province: clean(pick(r, '省份')),
      city: clean(pick(r, '城市')),
      storeName: clean(pick(r, '门店')),
      authorUrl: clean(pick(r, '主页')),
    });
  });

  if (!accounts.length && !errors.length) {
    errors.push('未解析到数据行，请确认表头包含「账号UID」等列');
  }
  return { accounts, errors };
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
