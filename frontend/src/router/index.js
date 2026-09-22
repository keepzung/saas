import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import DefaultLayout from '../layouts/DefaultLayout.vue';

const routes = [
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/LoginView.vue'),
    meta: { public: true, title: '登录' },
  },
  {
    path: '/welcome',
    name: 'welcome',
    component: () => import('../views/WelcomeView.vue'),
    meta: { public: false, title: '欢迎' },
  },
  {
    path: '/',
    component: DefaultLayout,
    redirect: '/dashboard',
    children: [
      {
        path: 'dashboard',
        name: 'dashboard',
        component: () => import('../views/DashboardView.vue'),
        meta: { title: '数据总览' },
      },
      {
        path: 'customers',
        name: 'customers',
        component: () => import('../views/CustomersView.vue'),
        meta: { title: '客户列表' },
      },
      {
        path: 'orders',
        name: 'orders',
        component: () => import('../views/OrdersView.vue'),
        meta: { title: '订单列表' },
      },
      {
        path: '/users/manage',
        component: () => import('../views/system/UserManageView.vue'),
        meta: { title: '用户管理' },
      },
      {
        path: '/project/manage/list',
        component: () => import('../views/project/ProjectListView.vue'),
        meta: { title: '项目列表' },
      },
      {
        path: '/kol/kol-source/list',
        component: () => import('../views/kol/KolSourceView.vue'),
        meta: { title: '达人广场' },
      },
      {
        path: '/kol/kol-source/mcn',
        component: () => import('../views/kol/KolMcnView.vue'),
        meta: { title: '机构管理' },
      },
      {
        path: '/kol/kol-manage/list',
        component: () => import('../views/kol/KolManageView.vue'),
        meta: { title: '达人库' },
      },
      {
        path: '/kol/review/list',
        component: () => import('../views/kol/KolReviewView.vue'),
        meta: { title: '变更审核' },
      },
      {
        path: '/kol/log',
        component: () => import('../views/kol/KolLogView.vue'),
        meta: { title: '操作日志' },
      },
      {
        path: '/content-center-pro/workbench/overview',
        component: () => import('../views/content/ContentOverviewView.vue'),
        meta: { title: '内容中心总览' },
      },
      {
        path: '/content-center-pro/campaign/content-package',
        component: () => import('../views/content/ContentPackageView.vue'),
        meta: { title: '内容包列表' },
      },
      {
        path: '/content-center-pro/campaign/batch-tasks',
        component: () => import('../views/content/BatchTaskView.vue'),
        meta: { title: '批量任务' },
      },
      {
        path: '/content-center-pro/config/products',
        component: () => import('../views/content/ProductConfigView.vue'),
        meta: { title: '产品配置' },
      },
      {
        path: '/kox_df/operation-analysis/overview',
        component: () => import('../views/kox/KoxOverviewView.vue'),
        meta: { title: 'KOX运营总览' },
      },
      {
        path: '/kox_df/operation-analysis/ranking',
        component: () => import('../views/kox/KoxRankingView.vue'),
        meta: { title: '排行榜单' },
      },
      {
        path: '/kox_df/operation-analysis/region-ranking',
        component: () => import('../views/kox/KoxRankingView.vue'),
        meta: { title: '区域排行', fixedDimension: 'region' },
      },
      {
        path: '/kox_df/operation-analysis/author-ranking',
        component: () => import('../views/kox/KoxRankingView.vue'),
        meta: { title: '账号排行', fixedDimension: 'account' },
      },
      {
        path: '/kox_df/operation-analysis/note-ranking',
        component: () => import('../views/kox/KoxNoteRankingView.vue'),
        meta: { title: '笔记排行' },
      },
      {
        path: '/kox_df/operation-analysis/dealer-ranking',
        component: () => import('../views/kox/KoxDealerOperationView.vue'),
        meta: { title: '经销商排行' },
      },
      {
        path: '/kox_df/operation-analysis/dealer',
        component: () => import('../views/kox/KoxDealerOperationView.vue'),
        meta: { title: '经销商运营' },
      },
      {
        path: '/kox_df/campaign-analysis/dealer-overview',
        component: () => import('../views/kox/KoxCampaignPlansView.vue'),
        meta: { title: '经销商投放总览', scope: 'dealer' },
      },
      {
        path: '/kox_df/campaign-analysis/hq-overview',
        component: () => import('../views/kox/KoxCampaignPlansView.vue'),
        meta: { title: '总部投放总览', scope: 'hq' },
      },
      {
        path: '/kox_df/campaign-analysis/plans',
        redirect: '/kox_df/campaign-analysis/dealer-overview',
      },
      {
        path: '/kox_df/campaign-analysis/project-reports',
        component: () => import('../views/kox/KoxProjectReportsView.vue'),
        meta: { title: '项目报表' },
      },
      {
        path: '/kox_df/campaign-analysis/add',
        component: () => import('../views/kox/KoxCampaignAddView.vue'),
        meta: { title: '新增项目' },
      },
      {
        path: '/kox_df/operation-analysis/feedback',
        component: () => import('../views/kox/KoxFeedbackAnalysisView.vue'),
        meta: { title: '反馈分析' },
      },
      {
        path: '/kox_df/operation-analysis/ai-briefing',
        component: () => import('../views/kox/KoxAiBriefingView.vue'),
        meta: { title: 'AI简报' },
      },
      {
        path: '/kox_df/operation-analysis/model-sales',
        component: () => import('../views/kox/KoxModelSalesView.vue'),
        meta: { title: '车型销量' },
      },
      {
        path: '/kox_df/monitoring/list',
        component: () => import('../views/kox/KoxMonitoringView.vue'),
        meta: { title: '监测列表' },
      },
      {
        path: '/kox_df/content-task/task-list',
        component: () => import('../views/kox/KoxTaskListView.vue'),
        meta: { title: '任务列表' },
      },
      {
        path: '/brandcosinsight/monitor/brand',
        component: () => import('../views/insight/InsightBrandView.vue'),
        meta: { title: '品牌监测' },
      },
      {
        path: '/brandcosinsight/report/center',
        component: () => import('../views/insight/InsightReportView.vue'),
        meta: { title: '报告中心' },
      },
      {
        path: '/laigu/leads',
        component: () => import('../views/laigu/LaiguLeadView.vue'),
        meta: { title: '私信线索' },
      },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/welcome',
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to) => {
  const auth = useAuthStore();
  if (!to.meta.public && !auth.isLoggedIn) {
    return { path: '/login', query: { redirect: to.fullPath } };
  }
  if (to.path === '/login' && auth.isLoggedIn) {
    return { path: '/welcome' };
  }
  if (to.path !== '/welcome' && to.meta.public === undefined) {
    if (auth.moduleTree.length > 0) {
      const allowed = new Set(['/welcome']);
      const walk = (nodes) => {
        for (const n of nodes ?? []) {
          if (n.children) walk(n.children);
          else if (n.path) allowed.add(n.path);
        }
      };
      walk(auth.moduleTree);
      if (!allowed.has(to.path)) {
        return { path: '/welcome' };
      }
    }
  }
  return true;
});

router.afterEach((to) => {
  const auth = useAuthStore();
  document.title = to.meta.title
    ? `${to.meta.title} - ${auth.systemName}`
    : auth.systemName;
});

export default router;
