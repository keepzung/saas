<template>
  <PageWrapper title="内容中心总览" subtitle="产品知识 · AI 批量创作 · 审核分发">
    <template #extra>
      <a-button size="small" class="manual-entry" @click="guideOpen = true">
        <BookOutlined /> 查看使用说明
      </a-button>
      <a-button size="small" type="primary" @click="$router.push('/content-center-pro/campaign/content-package')">
        进入内容包
      </a-button>
    </template>

    <div class="overview-container">
      <section class="resource-library-section">
        <div class="header-top">
          <div class="title-section">
            <h2>智能内容工厂 Pro</h2>
            <span class="header-accent-bar"></span>
            <p class="header-desc">营销内容智能生产分发工作台</p>
          </div>
        </div>

        <h3 class="section-heading"><AppstoreOutlined class="sh-icon" /> 创作资源</h3>
        <div class="resource-cards">
          <div
            v-for="card in resourceCards"
            :key="card.title"
            class="resource-card"
            :class="{ 'no-path': !card.path }"
            :style="{ backgroundImage: cardBg(card.image) }"
            @click="card.path && $router.push(card.path)"
          >
            <h4 class="card-title">
              {{ card.title }}
              <RightOutlined class="card-arrow" />
            </h4>
            <div v-if="card.number !== null" class="card-number">
              <span class="card-number-value">{{ card.number }}</span>
              <span v-if="card.unit" class="card-number-unit">{{ card.unit }}</span>
            </div>
            <p class="card-desc">{{ card.desc }}</p>
          </div>
        </div>
      </section>

      <section class="content-flow-section">
        <div class="campaign-head">
          <h3 class="section-heading"><SafetyCertificateOutlined class="sh-icon" /> 内容流转</h3>
          <a class="view-all" @click="$router.push('/content-center-pro/campaign/content-package')">全部内容包 &gt;</a>
        </div>

        <div class="campaign-stats">
          <div v-for="s in flowStats" :key="s.label" class="cstat">
            <div class="cstat-value" :style="{ color: s.accent }">{{ fmt(s.value) }}</div>
            <div class="cstat-label">{{ s.label }}</div>
          </div>
        </div>

        <div class="package-flow-cards">
          <div
            v-for="p in recentPackages"
            :key="p.package_id"
            class="package-flow-card"
            @click="$router.push('/content-center-pro/campaign/content-package')"
          >
            <div class="pf-head">
              <div class="pf-name">
                <a-tag class="pf-mark" :color="p.review_mode === 2 ? 'purple' : 'blue'">
                  {{ p.review_mode === 2 ? '双阶段' : '单阶段' }}
                </a-tag>
                <span class="pf-name-text">{{ p.name }}</span>
              </div>
              <div class="pf-meta">
                <span>{{ p.review_mode === 2 ? '双阶段审核' : '运营审核' }}</span>
                <span v-if="p.product_name">{{ p.product_name }}</span>
              </div>
              <RightOutlined class="pf-arrow" />
            </div>
            <div class="pf-breakdown">
              <span class="pf-chip">图文 · {{ p.stats.content_total }} 篇</span>
            </div>
            <div class="pf-status-grid">
              <div class="pf-status">
                <span class="pf-status-value">{{ p.stats.draft }}</span>
                <span class="pf-status-label">草稿</span>
              </div>
              <div class="pf-status">
                <span class="pf-status-value">{{ p.stats.pending_review }}</span>
                <span class="pf-status-label">待审</span>
              </div>
              <div class="pf-status">
                <span class="pf-status-value">{{ (p.stats.approved ?? 0) + (p.stats.brand_approved ?? 0) }}</span>
                <span class="pf-status-label">可分发</span>
              </div>
              <div class="pf-status">
                <span class="pf-status-value">{{ p.stats.rejected }}</span>
                <span class="pf-status-label">驳回</span>
              </div>
              <div class="pf-status">
                <span class="pf-status-value">{{ ov.content_breakdown?.used ?? 0 }}</span>
                <span class="pf-status-label">已领</span>
              </div>
            </div>
          </div>
          <div v-if="!loadingPackages && !recentPackages.length" class="campaign-empty">
            暂无内容包，<a @click.stop="$router.push('/content-center-pro/campaign/content-package')">去新建一个 &gt;</a>
          </div>
        </div>
      </section>

      <section class="scenario-map-section">
        <h3 class="section-heading"><MonitorOutlined class="sh-icon" /> 功能导览</h3>
        <div class="scenario-container">
          <div class="scenario-layout">
            <div class="scenario-tabs">
              <div
                v-for="(s, i) in scenarios"
                :key="s.label"
                class="scenario-tab"
                :class="{ active: activeScenario === i }"
                @click="activeScenario = i"
              >
                <div class="tab-icon-wrap">
                  <component :is="s.icon" />
                </div>
                <div class="tab-label-wrap">
                  <div class="tab-label">{{ s.label }}</div>
                  <div class="tab-sub-label">{{ s.sub }}</div>
                </div>
                <span v-if="s.badge" class="tab-customized-badge">{{ s.badge }}</span>
              </div>
            </div>

            <div class="scenario-content">
              <div class="scenario-header-bar">
                <span class="scenario-badge">场景说明</span>
                <h3>{{ currentScenario.title }}</h3>
                <p>{{ currentScenario.desc }}</p>
              </div>

              <div class="logic-timeline">
                <div
                  v-for="(step, si) in currentScenario.steps"
                  :key="step.name"
                  class="logic-step-item"
                  :class="{ 'is-static': !step.path }"
                >
                  <div class="step-progress">
                    <div class="step-circle">{{ si + 1 }}</div>
                    <div v-if="si < currentScenario.steps.length - 1" class="step-connector"></div>
                  </div>
                  <div class="step-detail-card" @click="step.path && $router.push(step.path)">
                    <div class="step-tag">STEP {{ si + 1 }}</div>
                    <div class="step-name">{{ step.name }}</div>
                    <ul class="step-bullets">
                      <li v-for="b in step.bullets" :key="b">{{ b }}</li>
                    </ul>
                    <span v-if="step.path" class="step-jump-hint">去使用 &gt;</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>

    <UsageGuideDrawer v-model:open="guideOpen" />
  </PageWrapper>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { message } from 'ant-design-vue';
import {
  AppstoreOutlined,
  AuditOutlined,
  BookOutlined,
  FileTextOutlined,
  LineChartOutlined,
  MonitorOutlined,
  RightOutlined,
  SafetyCertificateOutlined,
  SendOutlined,
} from '@ant-design/icons-vue';
import { getOverview, getPackages } from '../../api/content';
import PageWrapper from '../../components/PageWrapper.vue';
import UsageGuideDrawer from './UsageGuideDrawer.vue';

const ROUTES = {
  products: '/content-center-pro/config/products',
  batch: '/content-center-pro/campaign/batch-tasks',
  package: '/content-center-pro/campaign/content-package',
  hotContent: '/kox_df/operation-analysis/note-ranking',
};

const ov = ref({});
const packages = ref([]);
const loadingPackages = ref(true);
const guideOpen = ref(false);
const activeScenario = ref(0);

const fmt = (v) => (v ?? 0).toLocaleString();

const resourceCards = computed(() => [
  {
    title: '产品/服务知识库',
    number: ov.value.product_count ?? 0,
    unit: '款产品',
    desc: `策略卡 ${ov.value.strategy_card_count ?? 0} · 场景 ${ov.value.scene_count ?? 0}`,
    image: '/images/content/chanpin.jpg',
    path: ROUTES.products,
  },
  {
    title: '素材库',
    number: null,
    unit: '',
    desc: '产品配图与场景素材集中管理',
    image: '/images/content/sucaiku.jpg',
    path: '',
  },
  {
    title: '创作策略库',
    number: (ov.value.strategy_card_count ?? 0) + (ov.value.scene_count ?? 0),
    unit: '个策略',
    desc: '策略卡与场景约束文案角度',
    image: '/images/content/celue.png',
    path: ROUTES.products,
  },
  {
    title: '热门内容库',
    number: null,
    unit: '',
    desc: '高表现内容参考与借鉴',
    image: '/images/content/cy.jpg',
    path: ROUTES.hotContent,
  },
]);

const cardBg = (image) =>
  `linear-gradient(rgba(255,255,255,.12), rgba(255,255,255,.12)), url(${image})`;

const flowStats = computed(() => {
  const b = ov.value.content_breakdown ?? {};
  const sum = (key) =>
    packages.value.reduce((acc, p) => acc + (p.stats?.[key] ?? 0), 0);
  return [
    { label: '内容包', value: ov.value.package_count ?? 0, accent: '#2563eb' },
    { label: '总内容', value: ov.value.content_total ?? 0, accent: '#1e293b' },
    { label: '待审核', value: b.pending_review ?? 0, accent: '#d97706' },
    {
      label: '可分发',
      value: (b.approved ?? 0) + (b.brand_approved ?? 0),
      accent: '#16a34a',
    },
    { label: '已驳回', value: b.rejected ?? 0, accent: '#dc2626' },
    { label: '已领取', value: b.used ?? 0, accent: '#1e293b' },
  ];
});

const recentPackages = computed(() => packages.value.slice(0, 4));

const scenarios = [
  {
    label: '策略配置与生产',
    sub: '精准执行生成要求',
    icon: FileTextOutlined,
    title: '策略配置与生产',
    desc: '围绕产品知识库与创作策略，批量产出符合业务口径的图文内容草稿。',
    steps: [
      {
        name: '配置产品知识',
        bullets: ['录入产品基础信息、销售政策与 FAQ', '知识越完整，生成越贴合'],
        path: ROUTES.products,
      },
      {
        name: '设定创作策略',
        bullets: ['策略卡定义文案框架与角度', '场景约束投放语境与语气'],
        path: ROUTES.products,
      },
      {
        name: '发起批量生成',
        bullets: ['选择产品与目标内容包', '设定生成数量并启动任务'],
        path: ROUTES.batch,
      },
      {
        name: '沉淀内容草稿',
        bullets: ['生成结果自动进入内容包', '失败条目可在任务列表追溯'],
        path: ROUTES.package,
      },
    ],
  },
  {
    label: '内容品控',
    sub: '内容包多维审阅',
    icon: AuditOutlined,
    title: '内容品控',
    desc: '草稿经运营初审与品牌终审两级把关，确保对外内容合规统一。',
    steps: [
      {
        name: '运营初审',
        bullets: ['批量提交审阅', '驳回不合规草稿并留痕'],
        path: ROUTES.package,
      },
      {
        name: '品牌终审',
        bullets: ['双阶段包支持品牌二次确认', '通过后进入可分发状态'],
        path: ROUTES.package,
      },
    ],
  },
  {
    label: '内容分发',
    sub: '货架式自选派发',
    icon: SendOutlined,
    title: '内容分发',
    desc: '审核通过的内容货架化陈列，一线人员按需领取发布。',
    steps: [
      {
        name: '内容上架',
        bullets: ['可分发内容进入货架', '按内容包维度组织'],
        path: ROUTES.package,
      },
      {
        name: 'KOS 领取发布',
        bullets: ['账号按需领取内容', '发布后回流数据表现'],
        path: ROUTES.hotContent,
      },
    ],
  },
  {
    label: '数据监测回流',
    sub: '整体内容表现分析',
    icon: LineChartOutlined,
    badge: '需定制',
    title: '数据监测回流',
    desc: '聚合发布内容的表现数据，形成整体分析与优化建议闭环。',
    steps: [
      {
        name: '表现数据回流',
        bullets: ['阅读、互动、留资等指标回收', '按账号/门店/区域下钻'],
        path: '',
      },
      {
        name: '策略迭代优化',
        bullets: ['高表现内容反哺策略库', '沉淀选题与文案模板'],
        path: '',
      },
    ],
  },
];

const currentScenario = computed(
  () => scenarios[activeScenario.value] ?? scenarios[0],
);

onMounted(async () => {
  try {
    const [overview, pkgRes] = await Promise.all([
      getOverview(),
      getPackages({ page: 1, pageSize: 100 }),
    ]);
    ov.value = overview;
    packages.value = pkgRes.list ?? [];
  } catch (e) {
    message.error(e.message || '加载总览失败');
  } finally {
    loadingPackages.value = false;
  }
});
</script>

<style scoped>
.overview-container {
  display: flex;
  flex-direction: column;
  gap: 48px;
  max-width: 1680px;
  width: 100%;
  margin: 0 auto;
}

/* ---------- 创作资源 ---------- */
.header-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 24px;
}

.title-section {
  position: relative;
  padding-top: 12px;
}

.title-section h2 {
  margin: 0;
  font-size: 28px;
  font-weight: 900;
  font-style: italic;
  color: #1e293b;
  letter-spacing: 0.5px;
}

.header-accent-bar {
  position: absolute;
  top: 33px;
  left: 0;
  width: 180px;
  height: 5px;
  border-radius: 20px;
  background: linear-gradient(90deg, rgba(216, 180, 254, 0.8), rgba(219, 234, 254, 0.8));
  pointer-events: none;
}

.header-desc {
  margin: 10px 0 0;
  font-size: 13px;
  font-style: italic;
  color: #64748b;
}

.section-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 700;
  color: #1e293b;
  margin: 0 0 16px;
}

.sh-icon {
  color: #2563eb;
  font-size: 18px;
}

.resource-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.resource-card {
  position: relative;
  aspect-ratio: 4 / 3;
  padding: 32px 24px;
  border: 1px solid #e2e7eb;
  border-radius: 12px;
  background-size: cover;
  background-position: center;
  cursor: pointer;
  overflow: hidden;
  transition: transform 0.2s, box-shadow 0.2s;
  display: flex;
  flex-direction: column;
}

.resource-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.1);
}

.resource-card.no-path {
  cursor: default;
}

.card-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: #1e293b;
}

.card-arrow {
  font-size: 14px;
  color: #64748b;
  transition: transform 0.2s, color 0.2s;
}

.resource-card:hover .card-arrow {
  transform: translateX(3px);
  color: #2563eb;
}

.card-number {
  margin-top: auto;
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.card-number-value {
  font-size: 32px;
  font-weight: 800;
  color: #2563eb;
  font-variant-numeric: tabular-nums;
  font-family: 'DIN Alternate', 'Bahnschrift', -apple-system, sans-serif;
  line-height: 1.1;
}

.card-number-unit {
  font-size: 24px;
  font-weight: 700;
  color: #1e293b;
}

.card-desc {
  margin: 6px 0 0;
  font-size: 13px;
  color: #64748b;
}

/* ---------- 内容流转 ---------- */
.campaign-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.view-all {
  font-size: 13px;
  font-weight: 600;
  color: #2563eb;
  cursor: pointer;
}

.view-all:hover {
  color: #1d4ed8;
}

.campaign-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 18px 24px;
  background: #fff;
  border-radius: 16px;
  margin-bottom: 16px;
}

.cstat {
  min-width: 108px;
  padding-right: 12px;
  border-right: 1px solid #f1f5f9;
}

.cstat:last-child {
  border-right: none;
}

.cstat-value {
  font-size: 26px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  font-family: 'DIN Alternate', 'Bahnschrift', -apple-system, sans-serif;
  line-height: 1.2;
}

.cstat-label {
  font-size: 12px;
  color: #94a3b8;
}

.package-flow-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.package-flow-card {
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  background: #fff;
  padding: 16px 18px;
  cursor: pointer;
  transition: border-color 0.2s, transform 0.2s;
}

.package-flow-card:hover {
  border-color: #3b82f6;
  transform: translateY(-2px);
}

.pf-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.pf-name {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.pf-mark {
  flex-shrink: 0;
  margin-right: 0;
}

.pf-name-text {
  font-size: 14px;
  font-weight: 700;
  color: #1e293b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pf-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  font-size: 12px;
  color: #94a3b8;
  flex-shrink: 0;
}

.pf-arrow {
  font-size: 12px;
  color: #cbd5e1;
  margin-top: 2px;
}

.pf-breakdown {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 10px 0 12px;
}

.pf-chip {
  padding: 2px 10px;
  border-radius: 8px;
  background: #eff6ff;
  color: #2563eb;
  font-size: 12px;
  font-weight: 600;
}

.pf-status-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  border-top: 1px solid #f1f5f9;
  padding-top: 10px;
}

.pf-status {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.pf-status-value {
  font-size: 16px;
  font-weight: 800;
  color: #1e293b;
  font-variant-numeric: tabular-nums;
}

.pf-status-label {
  font-size: 11px;
  color: #94a3b8;
}

.campaign-empty {
  grid-column: 1 / -1;
  padding: 40px;
  text-align: center;
  border: 1px dashed #e2e8f0;
  border-radius: 16px;
  background: #fff;
  color: #94a3b8;
  font-size: 13px;
}

.campaign-empty a {
  color: #2563eb;
  font-weight: 600;
}

/* ---------- 场景地图 ---------- */
.scenario-map-section {
  max-width: 1400px;
  width: 100%;
  margin: 0 auto;
}

.scenario-container {
  background: #fff;
  border-radius: 20px;
  border: 1px solid #e2e8f0;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
  overflow: hidden;
}

.scenario-layout {
  display: flex;
  min-height: 500px;
}

.scenario-tabs {
  width: 260px;
  flex-shrink: 0;
  background: #f8fafc;
  border-right: 1px solid #f1f5f9;
  padding: 20px 0;
}

.scenario-tab {
  position: relative;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 24px;
  cursor: pointer;
  transition: background 0.2s;
}

.scenario-tab:hover {
  background: #f1f5f9;
}

.scenario-tab.active {
  background: #fff;
}

.scenario-tab.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 10px;
  bottom: 10px;
  width: 4px;
  border-radius: 0 4px 4px 0;
  background: #2563eb;
}

.tab-icon-wrap {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 2px 6px rgba(15, 23, 42, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  color: #475569;
  flex-shrink: 0;
  transition: background 0.2s, color 0.2s;
}

.scenario-tab.active .tab-icon-wrap {
  background: #2563eb;
  color: #fff;
}

.tab-label-wrap {
  min-width: 0;
}

.tab-label {
  font-size: 15px;
  font-weight: 700;
  color: #475569;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.scenario-tab.active .tab-label {
  color: #1e293b;
}

.tab-sub-label {
  font-size: 12px;
  color: #94a3b8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tab-customized-badge {
  position: absolute;
  top: 8px;
  right: 10px;
  padding: 1px 8px;
  border-radius: 999px;
  background: rgba(155, 93, 229, 0.1);
  color: #9b5de5;
  font-size: 10px;
  font-weight: 600;
}

.scenario-content {
  flex: 1;
  padding: 32px 48px;
  min-width: 0;
}

.scenario-header-bar {
  margin-bottom: 48px;
}

.scenario-badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 6px;
  background: #fef3c7;
  color: #d97706;
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 10px;
}

.scenario-header-bar h3 {
  margin: 0 0 6px;
  font-size: 22px;
  font-weight: 800;
  color: #1e293b;
}

.scenario-header-bar p {
  margin: 0;
  max-width: 600px;
  font-size: 15px;
  line-height: 1.7;
  color: #64748b;
}

.logic-timeline {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
}

.logic-step-item {
  flex: 1;
  min-width: 220px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.step-progress {
  display: flex;
  align-items: center;
}

.step-circle {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #2563eb;
  color: #fff;
  font-size: 14px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.step-connector {
  flex: 1;
  height: 2px;
  background: #e2e8f0;
}

.step-detail-card {
  position: relative;
  flex: 1;
  background: #f8fafc;
  border-radius: 16px;
  padding: 20px;
  min-height: 200px;
  transition: background 0.2s, border-color 0.2s, transform 0.2s;
  border: 1px solid transparent;
}

.logic-step-item:not(.is-static) .step-detail-card {
  cursor: pointer;
}

.logic-step-item:not(.is-static) .step-detail-card:hover {
  background: #fff;
  border-color: #2563eb;
  transform: translateY(-4px);
}

.step-tag {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 1px;
  color: #2563eb;
  margin-bottom: 6px;
}

.step-name {
  font-size: 16px;
  font-weight: 700;
  color: #1e293b;
  margin-bottom: 10px;
}

.step-bullets {
  margin: 0;
  padding: 0;
  list-style: none;
}

.step-bullets li {
  position: relative;
  padding-left: 14px;
  font-size: 13px;
  line-height: 1.9;
  color: #64748b;
}

.step-bullets li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 10px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #2563eb;
}

.step-jump-hint {
  position: absolute;
  bottom: 16px;
  right: 20px;
  font-size: 12px;
  font-weight: 600;
  color: #2563eb;
  opacity: 0;
  transition: opacity 0.2s;
}

.step-detail-card:hover .step-jump-hint {
  opacity: 1;
}

.manual-entry {
  border-color: #dbeafe;
  color: #2563eb;
  font-weight: 600;
}

.manual-entry:hover {
  border-color: #93c5fd;
  color: #1d4ed8;
}

@media (max-width: 1200px) {
  .resource-cards {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 900px) {
  .scenario-layout {
    flex-direction: column;
  }

  .scenario-tabs {
    width: 100%;
    border-right: none;
    border-bottom: 1px solid #f1f5f9;
  }

  .scenario-content {
    padding: 24px;
  }
}
</style>
