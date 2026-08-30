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
  return true;
});

router.afterEach((to) => {
  const auth = useAuthStore();
  document.title = to.meta.title
    ? `${to.meta.title} - ${auth.systemName}`
    : auth.systemName;
});

export default router;
