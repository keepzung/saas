// 工作区品牌化配置（数据驱动，替代散落在组件里的 brandId === N 硬编码）
// 新增品牌：public/images/login/ 放 logo → 在 BRAND_THEMES 加一条即可（侧栏/欢迎页/切换抽屉三处自动生效）
// 默认品牌(1)与未配置品牌回退系统默认样式（蓝方块 + 系统名/首字）
export const BRAND_THEMES = {
  2: { name: '荣威项目工作区', logo: '/images/login/roewe-logo.png', short: '荣威' },
  6: { name: '特斯拉项目工作区', logo: null, short: '特斯拉' },
  7: { name: '东风奕境项目工作区', logo: '/images/login/dongfeng-logo.png', short: '东风奕境' },
  8: { name: '格力项目工作区', logo: '/images/login/gree-logo.png', short: '格力' },
};

export function brandTheme(brandId) {
  return BRAND_THEMES[Number(brandId)] ?? null;
}

// 各工作区隐藏的菜单组名/叶子项名；未列出的工作区显示全量菜单
// 线索中心（来鼓私信）仅 Morgandada(5) 可见；周报表/监测三页拆分为特斯拉(6)专属；
// 任务管理仅荣威(2)隐藏（东风奕境/格力的任务系统随 Phase B 上线）
// 区域数据分析为特斯拉(6)专属；特斯拉区域排行已改为 区域/标签聚合双表
export const BRAND_HIDDEN_MENUS = {
  1: ['线索中心', '周报表', '添加监测', '添加记录', '区域数据分析'],
  2: ['任务管理', '线索中心', '周报表', '添加监测', '添加记录', '区域数据分析'],
  4: ['线索中心', '周报表', '添加监测', '添加记录', '区域数据分析'],
  5: ['周报表', '添加监测', '添加记录', '区域数据分析'],
  6: ['线索中心', '任务管理'],
  7: ['线索中心', '周报表', '添加监测', '添加记录', '区域数据分析'],
  8: ['线索中心', '周报表', '添加监测', '添加记录', '区域数据分析'],
};

// 各工作区菜单项改名（仅改显示名，不改路由/权限）
export const BRAND_MENU_NAME_OVERRIDES = {
  6: { 经销商排行: 'KOS 账号留资分层' },
};
