<template>
  <PageWrapper title="投放计划" subtitle="投流情况总览与账户投放明细">
    <template #filters>
      <FilterTopbar>
        <a-radio-group v-model:value="days" size="small" @change="onDaysChange">
          <a-radio-button :value="7">近7天</a-radio-button>
          <a-radio-button :value="30">近30天</a-radio-button>
        </a-radio-group>
        <a-range-picker v-model:value="range" size="small" @change="onRangeChange" />
        <a-button size="small" @click="reload">
          <ReloadOutlined />
        </a-button>
      </FilterTopbar>
    </template>

    <NoticeBar v-if="mode === 'demo'">数据说明：当前为演示数据，聚光平台授权接入后将替换为真实投放数据。</NoticeBar>
    <NoticeBar v-else-if="mode === 'real'">数据来源：小红书星火平台（聚光投放），每日 T+1 更新。</NoticeBar>

    <a-card :bordered="false" class="overview-card" :body-style="{ padding: '16px' }">
      <div class="section-title"><span class="bar"></span>投流情况总览</div>

      <div class="hero-row">
        <div class="hero-item">
          <div class="hero-label">总消耗（元）</div>
          <div class="hero-value hl-blue">{{ fmtNum(summary.fee) }}</div>
        </div>
        <div class="hero-divider"></div>
        <div class="hero-item">
          <div class="hero-label">总私信留资数</div>
          <div class="hero-value hl-green">{{ fmtNum(summary.msg_leads) }}</div>
        </div>
        <div class="hero-divider"></div>
        <div class="hero-item">
          <div class="hero-label">私信留资成本（元）</div>
          <div class="hero-value hl-violet">{{ summary.msg_leads ? fmtNum(summary.msg_lead_cost) : '—' }}</div>
        </div>
      </div>

      <div class="metric-grid">
        <div class="metric-card">
          <div class="metric-label">
            投流内容数
            <a-tooltip title="星火账户级报表暂无内容维度数据，接入内容级投放报表后自动填充">
              <InfoCircleOutlined class="metric-tip" />
            </a-tooltip>
          </div>
          <div class="metric-value">—</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">投流账号数</div>
          <div class="metric-value">{{ fmtNum(summary.account_num) }}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">总曝光</div>
          <div class="metric-value">{{ fmtWan(summary.impression) }}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">总点击</div>
          <div class="metric-value">{{ fmtWan(summary.click) }}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">总点击率</div>
          <div class="metric-value">{{ summary.ctr }}%</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">私信进线数</div>
          <div class="metric-value">{{ fmtNum(summary.msg_inquiries) }}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">私信开口数</div>
          <div class="metric-value">{{ fmtNum(summary.msg_openings) }}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">私信留资数</div>
          <div class="metric-value">{{ fmtNum(summary.msg_leads) }}</div>
        </div>
      </div>

      <div class="metric-grid metric-grid-5">
        <div class="metric-card">
          <div class="metric-label">点击成本</div>
          <div class="metric-value">{{ summary.click ? fmtNum(summary.cpc) : '—' }}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">千次展示成本</div>
          <div class="metric-value">{{ summary.impression ? fmtNum(summary.cpm) : '—' }}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">私信进线成本</div>
          <div class="metric-value">{{ summary.msg_inquiries ? fmtNum(summary.msg_inquiry_cost) : '—' }}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">私信开口成本</div>
          <div class="metric-value">{{ summary.msg_openings ? fmtNum(summary.msg_open_cost) : '—' }}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">私信留资成本</div>
          <div class="metric-value">{{ summary.msg_leads ? fmtNum(summary.msg_lead_cost) : '—' }}</div>
        </div>
      </div>

      <div class="charts-row">
        <a-card :bordered="false" size="small" class="chart-card">
          <template #title><div class="chart-title"><span class="bar"></span>消费趋势</div></template>
          <div :ref="(el) => (consumeEl = el)" class="chart-area" />
        </a-card>
        <a-card :bordered="false" size="small" class="chart-card">
          <template #title>
            <div class="chart-title-wrap">
              <div class="chart-title"><span class="bar"></span>私信留资数趋势</div>
              <a-radio-group v-model:value="leadTab" size="small" @change="renderCharts">
                <a-radio-button value="inquiries">私信进线数</a-radio-button>
                <a-radio-button value="openings">私信开口数</a-radio-button>
                <a-radio-button value="leads">私信留资数</a-radio-button>
              </a-radio-group>
            </div>
          </template>
          <div :ref="(el) => (leadsEl = el)" class="chart-area" />
        </a-card>
      </div>
    </a-card>

    <a-card :bordered="false" size="small" class="detail-card">
      <template #title>
        <div class="chart-title-wrap">
          <div class="chart-title"><span class="bar"></span>计划详情</div>
          <a-tabs v-model:activeKey="detailTab" size="small" class="detail-tabs">
            <a-tab-pane key="account" tab="按账号汇总" />
          </a-tabs>
        </div>
      </template>
      <template #extra>
        <a-button size="small" type="primary" :loading="exporting" @click="exportAll">
          <DownloadOutlined /> 数据导出
        </a-button>
      </template>
      <a-table
        :columns="accountColumns"
        :data-source="accountRows"
        :loading="loading"
        :pagination="{ total: accountTotal, current: page, pageSize: PAGE_SIZE, size: 'small', showSizeChanger: false }"
        row-key="virtual_seller_id"
        @change="onTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <div class="c-name">{{ record.name }}</div>
            <div class="muted small">
              {{ record.account_kind === 'agent_sub' ? '代理商子账户' : '品牌主账户' }}
              <template v-if="record.agent_name"> · {{ record.agent_name }}</template>
            </div>
          </template>
          <template v-else-if="column.key === 'fee'">
            <div class="bar-cell">
              <span class="bar-num">¥{{ fmtNum(record.fee) }}</span>
              <div class="bar-track">
                <div class="bar-fill" :style="{ width: `${(record.fee / maxFee) * 100}%` }" />
              </div>
            </div>
          </template>
        </template>
      </a-table>
    </a-card>
  </PageWrapper>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { message } from 'ant-design-vue';
import { ReloadOutlined, DownloadOutlined, InfoCircleOutlined } from '@ant-design/icons-vue';
import dayjs from 'dayjs';
import * as echarts from 'echarts';
import PageWrapper from '../../components/PageWrapper.vue';
import FilterTopbar from '../../components/FilterTopbar.vue';
import NoticeBar from '../../components/NoticeBar.vue';
import { getSparkCampaignSummary, getSparkCampaignAccounts } from '../../api/spark';
import { exportExcel } from '../../utils/excel';
import { useAuthStore } from '../../stores/auth';

const auth = useAuthStore();
const PAGE_SIZE = 10;

/* ---------- 演示模式（表空回退） ---------- */
const rand = (seed) => {
  const x = Math.sin(seed * 127.1) * 43758.5453;
  return x - Math.floor(x);
};
const DEMO_ACCOUNTS = [
  '荣威北京中心', '上海安吉荣威', '成都宏达荣威', '广州广物荣威',
  '杭州康桥荣威', '武汉黄浦荣威', '南京朗驰荣威', '深圳都灵荣威',
];

const days = ref(7);
const range = ref([]);
const mode = ref('loading');
const loading = ref(false);
const page = ref(1);
const leadTab = ref('inquiries');
const detailTab = ref('account');
const summary = ref({});
const trend = ref([]);
const accountRows = ref([]);
const accountTotal = ref(0);
const exporting = ref(false);

const consumeEl = ref(null);
const leadsEl = ref(null);
let consumeChart = null;
let leadsChart = null;

function fmtNum(v) {
  return Number(v ?? 0).toLocaleString();
}
function fmtWan(v) {
  const n = Number(v ?? 0);
  return n >= 10000 ? `${(n / 10000).toFixed(2)}w` : fmtNum(n);
}

function realParams(extra = {}) {
  const hasRange = range.value?.[0] && range.value?.[1];
  return {
    brandId: auth.currentBrandId ?? 2,
    start: hasRange ? range.value[0].format('YYYY-MM-DD') : dayjs().subtract(days.value - 1, 'day').format('YYYY-MM-DD'),
    end: hasRange ? range.value[1].format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
    ...extra,
  };
}

function onDaysChange() {
  range.value = [];
  reload();
}
function onRangeChange() {
  if (range.value?.[0] && range.value?.[1]) reload();
}

async function reload() {
  if (mode.value !== 'real') return probeAndLoad();
  loading.value = true;
  try {
    const [sumRes, listRes] = await Promise.all([
      getSparkCampaignSummary(realParams()),
      getSparkCampaignAccounts(realParams({ metric: 'fee', page: page.value, page_size: PAGE_SIZE })),
    ]);
    applyData(sumRes, listRes);
  } finally {
    loading.value = false;
  }
}

function applyData(sumRes, listRes) {
  summary.value = sumRes.summary ?? {};
  trend.value = sumRes.trend ?? [];
  accountTotal.value = listRes.total ?? 0;
  accountRows.value = listRes.list ?? [];
  nextTick(renderCharts);
}

async function probeAndLoad() {
  loading.value = true;
  try {
    const probe = await getSparkCampaignSummary(realParams());
    if ((probe.total ?? 0) > 0) {
      mode.value = 'real';
      const listRes = await getSparkCampaignAccounts(
        realParams({ metric: 'fee', page: page.value, page_size: PAGE_SIZE }),
      );
      applyData(probe, listRes);
    } else {
      mode.value = 'demo';
    }
  } catch {
    mode.value = 'demo';
  } finally {
    loading.value = false;
  }
}

function onTableChange(pag) {
  page.value = pag.current ?? 1;
  if (mode.value === 'real') {
    loading.value = true;
    getSparkCampaignAccounts(realParams({ metric: 'fee', page: page.value, page_size: PAGE_SIZE }))
      .then((listRes) => {
        accountTotal.value = listRes.total ?? 0;
        accountRows.value = listRes.list ?? [];
      })
      .finally(() => (loading.value = false));
  }
}

/* ---------- 图表 ---------- */
function areaOption(dates, values, name, yName) {
  return {
    tooltip: { trigger: 'axis' },
    grid: { left: 60, right: 24, top: 24, bottom: 30 },
    xAxis: { type: 'category', data: dates, boundaryGap: false },
    yAxis: { type: 'value', name: yName, splitLine: { lineStyle: { type: 'dashed' } } },
    series: [
      {
        name,
        type: 'line',
        smooth: true,
        data: values,
        itemStyle: { color: '#3456E6' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(52,86,230,0.25)' },
            { offset: 1, color: 'rgba(52,86,230,0.02)' },
          ]),
        },
      },
    ],
  };
}

function renderCharts() {
  const dates = trend.value.map((t) => t.date);
  if (consumeEl.value) {
    if (!consumeChart) consumeChart = echarts.init(consumeEl.value);
    consumeChart.setOption(areaOption(dates, trend.value.map((t) => t.fee), '总消费', '元'), { notMerge: true });
  }
  if (leadsEl.value) {
    if (!leadsChart) leadsChart = echarts.init(leadsEl.value);
    const key = leadTab.value === 'inquiries' ? 'msg_inquiries' : leadTab.value === 'openings' ? 'msg_openings' : 'msg_leads';
    const name = leadTab.value === 'inquiries' ? '私信进线数' : leadTab.value === 'openings' ? '私信开口数' : '私信留资数';
    leadsChart.setOption(areaOption(dates, trend.value.map((t) => t[key] ?? 0), name, '条'), { notMerge: true });
  }
}

function onResize() {
  consumeChart?.resize();
  leadsChart?.resize();
}

/* ---------- Excel 导出 ---------- */
async function exportAll() {
  exporting.value = true;
  try {
    let sumData = { summary: summary.value, trend: trend.value };
    let rows = accountRows.value;
    if (mode.value === 'real') {
      const [sumRes, listRes] = await Promise.all([
        getSparkCampaignSummary(realParams()),
        getSparkCampaignAccounts(realParams({ metric: 'fee', page: 1, page_size: 500 })),
      ]);
      sumData = sumRes;
      rows = listRes.list ?? [];
    } else {
      message.warning('当前为演示数据，导出内容为示意数据');
    }
    const s = sumData.summary ?? {};
    exportExcel(
      [
        {
          name: '投流情况总览',
          rows: [
            { 指标: '总消耗（元）', 数值: s.fee ?? 0 },
            { 指标: '投流账号数', 数值: s.account_num ?? 0 },
            { 指标: '总曝光', 数值: s.impression ?? 0 },
            { 指标: '总点击', 数值: s.click ?? 0 },
            { 指标: '总点击率(%)', 数值: s.ctr ?? 0 },
            { 指标: '点击成本(元)', 数值: s.cpc ?? 0 },
            { 指标: '千次展示成本(元)', 数值: s.cpm ?? 0 },
            { 指标: '互动量', 数值: s.interaction ?? 0 },
            { 指标: '私信进线数', 数值: s.msg_inquiries ?? 0 },
            { 指标: '私信开口数', 数值: s.msg_openings ?? 0 },
            { 指标: '私信留资数', 数值: s.msg_leads ?? 0 },
            { 指标: '私信进线成本(元)', 数值: s.msg_inquiry_cost ?? 0 },
            { 指标: '私信开口成本(元)', 数值: s.msg_open_cost ?? 0 },
            { 指标: '私信留资成本(元)', 数值: s.msg_lead_cost ?? 0 },
          ],
        },
        {
          name: '账号投放明细',
          rows: rows.map((a) => ({
            账户名称: a.name,
            账户类型: a.account_kind === 'agent_sub' ? '代理商子账户' : '品牌主账户',
            代理商: a.agent_name ?? '',
            投放ID: a.advertiser_id ?? '',
            消耗天数: a.consume_days,
            消耗: a.fee,
            曝光量: a.impression,
            点击量: a.click,
            点击率: `${a.ctr}%`,
            互动量: a.interaction,
            私信进线数: a.msg_inquiries ?? 0,
            私信开口数: a.msg_openings ?? 0,
            私信留资数: a.msg_leads,
            留资成本: a.msg_leads ? a.msg_lead_cost : '-',
          })),
        },
      ],
      '投放计划数据',
    );
    message.success('Excel 导出成功');
  } catch {
    message.error('导出失败，请稍后重试');
  } finally {
    exporting.value = false;
  }
}

const maxFee = computed(() =>
  accountRows.value.reduce((mx, r) => Math.max(mx, Number(r.fee ?? 0)), 1),
);

const accountColumns = [
  { key: 'name', title: '账户名称 / 类型' },
  { title: '消耗天数', dataIndex: 'consume_days', width: 90 },
  { key: 'fee', title: '消耗', width: 170 },
  { title: '曝光量', dataIndex: 'impression', width: 100, sorter: (a, b) => a.impression - b.impression },
  { title: '点击量', dataIndex: 'click', width: 90 },
  { title: '点击率', dataIndex: 'ctr', width: 90, sorter: (a, b) => a.ctr - b.ctr },
  { title: '互动量', dataIndex: 'interaction', width: 95 },
  { title: '私信进线', dataIndex: 'msg_inquiries', width: 95 },
  { title: '私信开口', dataIndex: 'msg_openings', width: 95 },
  { title: '私信留资', dataIndex: 'msg_leads', width: 95, sorter: (a, b) => a.msg_leads - b.msg_leads },
  { title: '留资成本', dataIndex: 'msg_lead_cost', width: 95 },
];

onMounted(() => {
  probeAndLoad();
  window.addEventListener('resize', onResize);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
  consumeChart?.dispose();
  leadsChart?.dispose();
});
</script>

<style scoped>
.overview-card,
.detail-card { margin-bottom: 12px; }

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 14px;
}

.bar {
  width: 4px;
  height: 14px;
  background: #2563eb;
  border-radius: 2px;
}

.hero-row {
  display: flex;
  align-items: center;
  gap: 32px;
  padding: 14px 20px;
  background: linear-gradient(135deg, #f5f8ff, #fdfdff);
  border-radius: 12px;
  margin-bottom: 14px;
}

.hero-item { min-width: 160px; }

.hero-label {
  font-size: 13px;
  color: #64748b;
}

.hero-value {
  margin-top: 4px;
  font-size: 30px;
  font-weight: 800;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}

.hero-divider {
  width: 1px;
  height: 44px;
  background: #e2e8f0;
}

.hl-blue { color: #3456e6; }
.hl-green { color: #16a34a; }
.hl-violet { color: #7c3aed; }

.metric-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 10px;
  margin-bottom: 10px;
}

.metric-grid-5 {
  grid-template-columns: repeat(5, 1fr);
}

.metric-card {
  background: #f8fafc;
  border-radius: 8px;
  padding: 12px 14px;
}

.metric-label {
  font-size: 12px;
  color: #64748b;
  display: flex;
  align-items: center;
  gap: 4px;
}

.metric-tip { color: #cbd5e1; cursor: help; }

.metric-value {
  margin-top: 6px;
  font-size: 20px;
  font-weight: 700;
  color: #1e293b;
  font-variant-numeric: tabular-nums;
}

.charts-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 6px;
}

.chart-card {
  border: 1px solid #eef2f7;
  border-radius: 10px;
}

.chart-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
}

.chart-title-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.chart-area { height: 260px; }

.detail-tabs { margin-left: 8px; }

.c-name { font-weight: 500; }
.muted { color: var(--color-text-secondary, #64748b); }
.small { font-size: 12px; }

.bar-cell { display: flex; flex-direction: column; gap: 3px; }
.bar-num { font-variant-numeric: tabular-nums; font-size: 13px; }
.bar-track { height: 5px; border-radius: 3px; background: #eef2f7; overflow: hidden; }
.bar-fill { height: 100%; border-radius: 3px; background: linear-gradient(90deg, #3456e6, #7c3aed); }

@media (max-width: 1200px) {
  .metric-grid { grid-template-columns: repeat(4, 1fr); }
  .charts-row { grid-template-columns: 1fr; }
}
</style>
