<template>
  <PageWrapper title="经销商运营" subtitle="代理商运营健康度与转化漏斗">
    <template #extra>
      <a-radio-group v-model:value="days" size="small" @change="reload">
        <a-radio-button :value="7">近7天</a-radio-button>
        <a-radio-button :value="30">近30天</a-radio-button>
      </a-radio-group>
    </template>

    <NoticeBar>该页面为功能示意，不代表企业真实数据，所有数据的计算逻辑均会按照项目实际需求调整</NoticeBar>

    <a-card :bordered="false" class="unified-funnel-card" :body-style="{ padding: 0 }">
      <div class="unified-funnel-steps">
        <div class="step-item">
          <div class="step-icon-wrap"><FileTextOutlined class="step-icon" style="color: #2563eb" /></div>
          <div class="step-title-wrap">
            <span class="step-title">内容发布</span>
            <span class="step-value">{{ fmt(total.item_cnt) }} 篇</span>
          </div>
        </div>
        <div class="step-item">
          <div class="step-icon-wrap"><SendOutlined class="step-icon" style="color: #d97706" /></div>
          <div class="step-title-wrap">
            <span class="step-title">留资获取</span>
            <span class="step-value">{{ fmt(total.pm_leads) }} 条</span>
          </div>
        </div>
        <div class="step-item">
          <div class="step-icon-wrap"><CarOutlined class="step-icon" style="color: #059669" /></div>
          <div class="step-title-wrap">
            <span class="step-title">成交转化</span>
            <span class="step-value">{{ fmt(total.deals) }} 台</span>
          </div>
        </div>
      </div>
      <div class="funnel-cols">
        <div class="funnel-step-col">
          <div class="funnel-metric">
            <span class="fm-label">内容完成度</span>
            <b class="fm-value">{{ total.item_pct }}%</b>
          </div>
          <a-progress
            :percent="total.item_pct"
            :show-info="false"
            :stroke-color="{ from: '#5087ec', to: '#8cc8ff' }"
          />
          <div class="funnel-sub">目标 {{ fmt(total.item_target) }} 篇 / 实际 {{ fmt(total.item_cnt) }} 篇</div>
        </div>
        <div class="funnel-step-col">
          <div class="funnel-metric">
            <span class="fm-label">留资完成度</span>
            <b class="fm-value">{{ total.leads_pct }}%</b>
          </div>
          <a-progress
            :percent="total.leads_pct"
            :show-info="false"
            :stroke-color="{ from: '#f59e0b', to: '#fbbf24' }"
          />
          <div class="funnel-sub">线索率 {{ total.lead_rate }}% · 人均 {{ total.per_store_leads }} 条</div>
        </div>
        <div class="funnel-step-col">
          <div class="funnel-metric">
            <span class="fm-label">成交完成度</span>
            <b class="fm-value">{{ total.deal_pct }}%</b>
          </div>
          <a-progress
            :percent="total.deal_pct"
            :show-info="false"
            :stroke-color="{ from: '#36b37e', to: '#73d13d' }"
          />
          <div class="funnel-sub">留资→成交转化率 {{ total.deal_rate }}%</div>
        </div>
      </div>
    </a-card>

    <div class="insight-row">
      <a-card :bordered="false" size="small" class="insight-card">
        <div class="insight-line">
          <ThunderboltFilled style="color: #2563eb" />
          <span class="insight-text">
            头部代理商 {{ tierCount.头部 }} 家、腰部 {{ tierCount.腰部 }} 家、尾部 {{ tierCount.尾部 }} 家、
            沉默 {{ tierCount.沉默 }} 家<template v-if="tierCount.沉默 > 0">，建议对 {{ tierCount.沉默 }} 家沉默代理商重点激活</template>。
          </span>
        </div>
        <div class="insight-line">
          <AlertOutlined style="color: #d97706" />
          <span class="insight-text">
            留资完成度 {{ total.leads_pct }}%<template v-if="total.leads_pct < 50">，线索获取滞后于月度节奏，建议加强私信承接话术</template>。
          </span>
        </div>
      </a-card>
      <a-card :bordered="false" size="small" title="代理商分层分布" class="tier-card">
        <div ref="tierEl" class="tier-chart" />
      </a-card>
    </div>

    <a-card :bordered="false" size="small">
      <template #title>
        <div class="card-header">
          <span class="bar"></span>
          <span class="title">代理商运营明细</span>
          <span class="muted mini" style="margin-left: 8px">共 {{ rows.length }} 家</span>
        </div>
      </template>
      <a-table
        :columns="columns"
        :data-source="rows"
        :loading="loading"
        :pagination="{ total: rows.length, pageSize: 15, size: 'small', showSizeChanger: false }"
        row-key="rank"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'rank'">
            <span :class="['rank-badge', `rank-${record.rank}`]">{{ record.rank }}</span>
          </template>
          <template v-else-if="column.key === 'dealer_name'">
            <div class="dealer-cell">
              <div class="dealer-name">{{ record.name }}</div>
              <div class="muted mini">{{ record.region_name || '-' }}</div>
            </div>
          </template>
          <template v-else-if="column.key === 'tier'">
            <span class="tier-pill" :class="`tier-${record.tier}`">{{ record.tier }}</span>
          </template>
          <template v-else-if="column.key === 'item_cnt'">
            <div class="cell-progress">
              <span>{{ record.item_cnt }}</span>
              <a-progress
                :percent="record.item_pct"
                :show-info="false"
                size="small"
                :stroke-color="{ from: '#5087ec', to: '#8cc8ff' }"
              />
            </div>
          </template>
          <template v-else-if="column.key === 'pm_leads'">
            <div class="cell-progress">
              <span>{{ record.pm_leads }}</span>
              <a-progress
                :percent="record.leads_pct"
                :show-info="false"
                size="small"
                :stroke-color="{ from: '#f59e0b', to: '#fbbf24' }"
              />
            </div>
          </template>
          <template v-else-if="column.key === 'score'">
            <b class="score-num">{{ record.score }}</b>
          </template>
        </template>
      </a-table>
    </a-card>
  </PageWrapper>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { message } from 'ant-design-vue';
import * as echarts from 'echarts';
import dayjs from 'dayjs';
import {
  FileTextOutlined,
  SendOutlined,
  CarOutlined,
  ThunderboltFilled,
  AlertOutlined,
} from '@ant-design/icons-vue';
import PageWrapper from '../../components/PageWrapper.vue';
import NoticeBar from '../../components/NoticeBar.vue';
import { getKoxRanking } from '../../api/kox';
import { useAuthStore } from '../../stores/auth';

const auth = useAuthStore();
const loading = ref(false);
const rows = ref([]);
const days = ref(30);
const tierEl = ref(null);
let tierChart = null;

const fmt = (v) => Number(v ?? 0).toLocaleString();

const columns = [
  { key: 'rank', title: '排名', width: 70 },
  { key: 'dealer_name', title: '代理商', width: 180, ellipsis: true },
  { key: 'tier', title: '分层', width: 80 },
  { title: '账号数', dataIndex: 'account_num', width: 80 },
  { key: 'item_cnt', title: '发布数 / 完成度', width: 200 },
  { title: '曝光量', dataIndex: 'exposure_sum', width: 110, sorter: (a, b) => a.exposure_sum - b.exposure_sum },
  { key: 'pm_leads', title: '留资数 / 完成度', width: 180 },
  { title: '成交数', dataIndex: 'deals', width: 80 },
  { key: 'score', title: '综合得分', width: 90, sorter: (a, b) => a.score - b.score },
];

const tierCount = computed(() => {
  const map = { 头部: 0, 腰部: 0, 尾部: 0, 沉默: 0 };
  for (const r of rows.value) map[r.tier] += 1;
  return map;
});

const total = computed(() => {
  const list = rows.value;
  const item_cnt = list.reduce((s, r) => s + r.item_cnt, 0);
  const pm_leads = list.reduce((s, r) => s + r.pm_leads, 0);
  const deals = list.reduce((s, r) => s + r.deals, 0);
  const item_target = list.reduce((s, r) => s + r.item_target, 0) || 1;
  const leads_target = list.reduce((s, r) => s + r.leads_target, 0) || 1;
  const deal_target = list.reduce((s, r) => s + r.deal_target, 0) || 1;
  return {
    item_cnt,
    pm_leads,
    deals,
    item_target,
    item_pct: Math.min(100, Math.round((item_cnt / item_target) * 100)),
    leads_pct: Math.min(100, Math.round((pm_leads / leads_target) * 100)),
    deal_pct: Math.min(100, Math.round((deals / deal_target) * 100)),
    lead_rate: item_cnt ? ((pm_leads / item_cnt) * 100).toFixed(1) : '0.0',
    per_store_leads: list.length ? Math.round((pm_leads / list.length) * 10) / 10 : 0,
    deal_rate: pm_leads ? ((deals / pm_leads) * 100).toFixed(1) : '0.0',
  };
});

function classifyTier(sorted) {
  const n = sorted.length || 1;
  const headCut = Math.max(1, Math.floor(n * 0.2));
  const waistCut = Math.max(headCut + 1, Math.floor(n * 0.5));
  const tailCut = Math.max(waistCut + 1, Math.floor(n * 0.85));
  return (i, item) => {
    if (Number(item.item_cnt ?? 0) === 0) return '沉默';
    if (i < headCut) return '头部';
    if (i < waistCut) return '腰部';
    if (i < tailCut) return '尾部';
    return '沉默';
  };
}

function renderTierChart() {
  if (!tierEl.value) return;
  if (!tierChart) tierChart = echarts.init(tierEl.value);
  const counts = tierCount.value;
  tierChart.setOption({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 90, right: 40, top: 12, bottom: 24 },
    xAxis: { type: 'value' },
    yAxis: {
      type: 'category',
      data: ['沉默代理商', '尾部代理商', '腰部代理商', '头部代理商'],
    },
    series: [
      {
        name: '代理商数',
        type: 'bar',
        data: [
          { value: counts.沉默, itemStyle: { color: '#94a3b8' } },
          { value: counts.尾部, itemStyle: { color: '#8cc8ff' } },
          { value: counts.腰部, itemStyle: { color: '#5087ec' } },
          { value: counts.头部, itemStyle: { color: '#2563eb' } },
        ],
        barMaxWidth: 18,
        label: { show: true, position: 'right', fontSize: 12, color: '#64748b', formatter: '{c} 家' },
      },
    ],
  });
}

async function reload() {
  loading.value = true;
  try {
    const res = await getKoxRanking({
      dimension: 'store',
      brandId: auth.currentBrandId ?? undefined,
      metric: 'view_sum',
      start: dayjs().subtract(days.value - 1, 'day').format('YYYY-MM-DD'),
      end: dayjs().format('YYYY-MM-DD'),
      page_size: 100,
    });
    const list = res.list ?? [];
    const maxItems = Math.max(1, ...list.map((r) => Number(r.item_cnt ?? 0)));
    const maxLeads = Math.max(1, ...list.map((r) => Number(r.pm_leads ?? 0)));
    const tierOf = classifyTier(list);
    rows.value = list.map((r, i) => {
      const item_cnt = Number(r.item_cnt ?? 0);
      const pm_leads = Number(r.pm_leads ?? 0);
      const item_target = Math.max(4, Math.round(maxItems * 0.75));
      const leads_target = Math.max(3, Math.round(maxLeads * 0.7));
      const deals = Math.round(pm_leads * (0.08 + ((i * 7) % 9) / 100));
      const deal_target = Math.max(1, Math.round(leads_target * 0.15));
      const item_pct = Math.min(100, Math.round((item_cnt / item_target) * 100));
      const leads_pct = Math.min(100, Math.round((pm_leads / leads_target) * 100));
      const deal_pct = Math.min(100, Math.round((deals / deal_target) * 100));
      return {
        ...r,
        rank: i + 1,
        tier: tierOf(i, r),
        item_target,
        leads_target,
        deal_target,
        deals,
        item_pct,
        leads_pct,
        deal_pct,
        score: Math.min(100, Math.round(item_pct * 0.3 + leads_pct * 0.3 + deal_pct * 0.4)),
      };
    });
    nextTick(renderTierChart);
  } catch (e) {
    message.error(e.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

function onResize() {
  tierChart?.resize();
}

onMounted(() => {
  reload();
  window.addEventListener('resize', onResize);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
  tierChart?.dispose();
});
</script>

<style scoped>
.unified-funnel-card {
  border-radius: 12px;
  box-shadow: 0 4px 20px -4px rgba(0, 0, 0, 0.05);
  border: 1px solid #f1f5f9;
}

.unified-funnel-steps {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  border-bottom: 1px solid #e2e8f0;
  background: #f8fafc;
  border-radius: 12px 12px 0 0;
}

.step-item {
  display: flex;
  align-items: center;
  padding: 16px 24px;
  position: relative;
}

.step-item:not(:last-child)::after {
  content: '';
  position: absolute;
  right: -8px;
  top: 50%;
  transform: translateY(-50%);
  width: 16px;
  height: 16px;
  background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2394A3B8' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M9 5l7 7-7 7'/%3E%3C/svg%3E");
  background-size: cover;
  z-index: 10;
}

.step-icon-wrap {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  margin-right: 12px;
}

.step-icon {
  font-size: 16px;
}

.step-title-wrap {
  display: flex;
  align-items: center;
  flex: 1;
  gap: 10px;
}

.step-title {
  font-size: 15px;
  font-weight: 700;
  color: #1e293b;
}

.step-value {
  font-size: 14px;
  font-weight: 600;
  color: #475569;
  font-variant-numeric: tabular-nums;
}

.funnel-cols {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
}

.funnel-step-col {
  display: flex;
  flex-direction: column;
  padding: 24px;
  border-right: 1px dashed #e2e8f0;
  gap: 8px;
}

.funnel-step-col:last-child {
  border-right: none;
}

.funnel-metric {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.fm-label {
  font-size: 13px;
  color: #64748b;
}

.fm-value {
  font-size: 22px;
  font-weight: 700;
  color: #1e293b;
  font-variant-numeric: tabular-nums;
}

.funnel-sub {
  font-size: 12px;
  color: #94a3b8;
}

.insight-row {
  display: grid;
  grid-template-columns: 1fr 380px;
  gap: 12px;
}

.insight-card {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 10px;
}

.insight-line {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.insight-text {
  font-size: 13px;
  color: #475569;
  line-height: 1.8;
}

.tier-chart {
  height: 180px;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 0;
}

.card-header .bar {
  width: 4px;
  height: 16px;
  background: #2563eb;
  border-radius: 2px;
  margin-right: 8px;
  flex-shrink: 0;
}

.card-header .title {
  font-size: 16px;
  font-weight: 600;
  color: #1e293b;
}

.rank-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  font-weight: 600;
  font-size: 12px;
  background: rgba(0, 0, 0, 0.06);
}

.rank-1 { background: #ffd700; color: #fff; }
.rank-2 { background: #bfbfbf; color: #fff; }
.rank-3 { background: #d48806; color: #fff; }

.dealer-cell .dealer-name {
  font-weight: 600;
  color: #1e293b;
}

.tier-pill {
  display: inline-block;
  font-size: 12px;
  font-weight: 600;
  padding: 1px 10px;
  border-radius: 999px;
}

.tier-头部 { color: #2563eb; background: #dbeafe; }
.tier-腰部 { color: #0e7490; background: #cffafe; }
.tier-尾部 { color: #7c3aed; background: #ede9fe; }
.tier-沉默 { color: #64748b; background: #f1f5f9; }

.cell-progress {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cell-progress > span {
  width: 46px;
  text-align: right;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.cell-progress :deep(.ant-progress) {
  flex: 1;
  min-width: 0;
}

.cell-progress :deep(.ant-progress-line) {
  margin: 0;
}

.score-num {
  color: #1e293b;
  font-variant-numeric: tabular-nums;
}

.muted {
  color: var(--color-text-secondary);
}

.mini {
  font-size: 12px;
}

@media (max-width: 1200px) {
  .insight-row {
    grid-template-columns: 1fr;
  }
}
</style>
