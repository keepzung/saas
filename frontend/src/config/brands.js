// 工作区品牌化配置（数据驱动，替代散落在组件里的 brandId === N 硬编码）
// 新增品牌：public/images/login/ 放 logo → 在 BRAND_THEMES 加一条即可（侧栏/欢迎页/切换抽屉三处自动生效）
// 默认品牌(1)与未配置品牌回退系统默认样式（蓝方块 + 系统名/首字）
export const BRAND_THEMES = {
  2: { name: '荣威项目工作区', logo: '/images/login/roewe-logo.png', short: '荣威' },
  6: {
    name: '特斯拉项目工作区',
    logo: '/images/login/leyun-logo.jpg',
    short: '特斯拉',
    logoH: 68, // 欢迎页头部 logo 高度（乐允横版 726×364，两轮放大 36→50→68）
    logoW: 300,
    sidebarLogoH: 38, // 侧栏品牌 logo 高度（默认 24 太小）
  },
  7: { name: '东风奕境项目工作区', logo: '/images/login/dongfeng-logo.png', short: '东风奕境' },
  8: { name: '格力项目工作区', logo: '/images/login/gree-logo.png', short: '格力' },
  5: {
    name: 'Morgandada项目工作区',
    logo: '/images/login/morgandada-logo-wide.png',
    short: 'Morgandada',
    logoH: 64, // 欢迎页头部 logo 高度（MorganDaDa 横版 1080×240）
    logoW: 288,
    sidebarLogoH: 34, // 侧栏品牌 logo 高度（默认 24 太小）
  },
};

export function brandTheme(brandId) {
  return BRAND_THEMES[Number(brandId)] ?? null;
}

// 东风奕境(7)/格力(8) 顶部三工作区 Tab（复刻旧系统：智能内容工厂Pro | KOX运营管理中心 | 内容创作任务）
// key 对应 DefaultLayout 的侧栏菜单切换；prefix 用于从路由推导当前 Tab
const DF_TASK_TABS = [
  { key: 'factory', name: '智能内容工厂Pro', prefix: '/content-pro', path: '/content-pro/workbench' },
  { key: 'kox', name: 'KOX运营管理中心', prefix: '/kox_df', path: '/kox_df/operation-analysis/overview' },
  { key: 'task', name: '内容创作任务', prefix: '/kox_task', path: '/kox_task/content-task/task-list' },
];

export const BRAND_WORKSPACE_TABS = {
  7: DF_TASK_TABS,
  8: DF_TASK_TABS,
};

// 各工作区隐藏的菜单组名/叶子项名；未列出的工作区显示全量菜单
// 菜单基线（update-kox-menu.js 同步）：运营分析=运营总览/代理商总览/账号表现分析/内容表现分析/用户反馈分析/区域数据分析/热门内容；
// 投放分析=投流总览/投流项目管理/周期报表；监测管理=监测列表/添加监测/添加记录
// 线索中心（来鼓私信）仅 Morgandada(5) 可见；周期报表/监测两页/热门内容为特斯拉(6)专属；
// 6 另隐藏 投流项目管理（客户 1008 批注「可以删除不要了」）；
// 7/8 用 内容工厂Pro(顶部Tab) 替代 内容中心Pro，内容创作任务 替代 KOX 任务管理
// 5（Morgandada）：内容生产模块放开（4级账号体系——KOS 员工登录内容生产模块），仅保留报表/监测类隐藏
export const BRAND_HIDDEN_MENUS = {
  1: ['线索中心', '周期报表', '添加监测', '添加记录', '热门内容', '内容工厂Pro', '内容创作任务'],
  2: ['任务管理', '线索中心', '周期报表', '添加监测', '添加记录', '热门内容', '用户反馈分析', '内容工厂Pro', '内容创作任务'],
  4: ['线索中心', '周期报表', '添加监测', '添加记录', '热门内容', '内容工厂Pro', '内容创作任务'],
  5: ['周期报表', '添加监测', '添加记录', '热门内容'],
  6: ['线索中心', '任务管理', '内容工厂Pro', '内容创作任务', '投流项目管理'],
  7: ['线索中心', '任务管理', '用户反馈分析', '热门内容', '内容中心Pro'],
  8: ['线索中心', '任务管理', '用户反馈分析', '热门内容', '内容中心Pro'],
};

// 各工作区菜单项改名（仅改显示名，不改路由/权限）
// 东风奕境(7)/格力(8) 按旧系统菜单命名（saas.marketine.cn 截图复刻）
// 特斯拉(6)：代理商总览页已按账号拆分为 KOS 运营进度，菜单名对齐
export const BRAND_MENU_NAME_OVERRIDES = {
  6: {
    代理商总览: 'KOS数据进度',
  },
  7: {
    代理商总览: '经销商排行',
    账号表现分析: '账号排行',
    内容表现分析: '笔记排行',
    区域数据分析: '区域排行',
    投流总览: '投放计划',
    投流项目管理: '项目报表',
  },
  8: {
    代理商总览: '经销商排行',
    账号表现分析: '账号排行',
    内容表现分析: '笔记排行',
    区域数据分析: '区域排行',
    投流总览: '投放计划',
    投流项目管理: '项目报表',
  },
};
