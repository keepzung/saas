<template>
  <PageWrapper title="投放计划" subtitle="投放内容效果汇总（按内容维度）">
    <template #filters>
      <FilterTopbar>
        <a-select
          v-if="mode === 'demo'"
          v-model:value="model"
          style="width: 140px"
          allow-clear
          placeholder="全部车型"
          :options="modelOptions"
          @change="applyFilter"
        />
        <a-input-search
          v-model:value="keyword"
          style="width: 220px"
          :placeholder="mode === 'real' ? '搜索账户 / 代理商 / 投放ID' : '搜索视频 / 账号名称'"
          allow-clear
          @search="onSearch"
        />
        <a-range-picker
          v-model:value="range"
          size="small"
          :allow-clear="false"
          @change="onRangeChange"
        />
      </FilterTopbar>
    </template>

    <NoticeBar v-if="mode === 'demo'">数据说明：当前为演示数据，聚光平台授权接入后将替换为真实投放数据。</NoticeBar>
    <NoticeBar v-else-if="mode === 'real'">数据来源：小红书星火平台（聚光投放），每日 T+1 更新，统计口径为账户维度消耗汇总。</NoticeBar>

    <div class="stat-grid">
      <div v-for="s in statCards" :key="s.label" class="stat-card">
        <div class="stat-label">{{ s.label }}</div>
        <div class="stat-value" :class="s.cls">{{ s.value }}</div>
      </div>
    </div>

    <a-card :bordered="false" size="small" title="消耗 & 留资趋势" class="chart-card">
      <div ref="trendEl" class="echart-area" />
    </a-card>

    <a-card :bordered="false" size="small">
      <a-table
        :columns="mode === 'real' ? realColumns : demoColumns"
        :data-source="tableRows"
        :loading="loading"
        :pagination="{
          total: tableTotal,
          current: page,
          pageSize: 10,
          size: 'small',
          showSizeChanger: false,
        }"
        row-key="virtual_seller_id"
        @change="onTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'title'">
            <div class="c-title">{{ record.title }}</div>
            <div class="muted small">{{ record.account }} · {{ record.type }}</div>
          </template>
          <template v-else-if="column.key === 'model'">
            <a-tag color="blue">{{ record.model }}</a-tag>
          </template>
          <template v-else-if="column.key === 'name'">
            <div class="c-title">{{ record.name }}</div>
            <div class="muted small">
              {{ record.account_kind === 'agent_sub' ? '代理商子账户' : '品牌主账户' }}
              <template v-if="record.agent_name"> · {{ record.agent_name }}</template>
              <template v-if="record.advertiser_id"> · 投放ID {{ record.advertiser_id }}</template>
            </div>
          </template>
          <template v-else-if="column.key === 'cost'">
            <div class="bar-cell">
              <span class="bar-num">¥{{ fmt(record.cost) }}</span>
              <div class="bar-track">
                <div class="bar-fill" :style="{ width: `${(record.cost / maxCost) * 100}%` }" />
              </div>
            </div>
          </template>
          <template v-else-if="column.key === 'fee'">
            <div class="bar-cell">
              <span class="bar-num">¥{{ fmt(record.fee) }}</span>
              <div class="bar-track">
                <div class="bar-fill" :style="{ width: `${(record.fee / maxCost) * 100}%` }" />
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
import dayjs from 'dayjs';
import * as echarts from 'echarts';
import PageWrapper from '../../components/PageWrapper.vue';
import FilterTopbar from '../../components/FilterTopbar.vue';
import NoticeBar from '../../components/NoticeBar.vue';
import { getSparkCampaignSummary, getSparkCampaignAccounts } from '../../api/spark';
import { useAuthStore } from '../../stores/auth';

const auth = useAuthStore();

const rand = (seed) => {
  const x = Math.sin(seed * 127.1) * 43758.5453;
  return x - Math.floor(x);
};

const MODELS = ['荣威i5', '荣威D7', '荣威RX5', '荣威IMAX8'];
const ACCOUNTS = [
  '荣威北京中心', '上海安吉荣威', '成都宏达荣威', '广州广物荣威',
  '杭州康桥荣威', '武汉黄浦荣威', '南京朗驰荣威', '深圳都灵荣威',
];
const TITLE_TPL = [
  '提车分享：{m}三个月真实感受', '{m}首付方案详解，月供低至两千',
  '带你看{m}内饰全貌', '{m}和同价位车型怎么选？试驾对比',
  '({m}提车作业)落地价全公开', '{m}城市通勤续航实测',
];

const model = ref(undefined);
const keyword = ref('');
const range = ref([dayjs().subtract(29, 'day'), dayjs()]);
const loading = ref(false);
const mode = ref('loading'); // 'loading' | 'real' | 'demo'
const page = ref(1);
const metric = ref('fee');
const realTotal = ref(0);
const summaryData = ref(null);

const modelOptions = MODELS.map((m) => ({ value: m, label: m }));

const demoList = ref(
  Array.from({ length: 14 }, (_, i) => {
    const acc = ACCOUNTS[i % ACCOUNTS.length];
    const mdl = MODELS[Math.floor(rand(i + 1) * MODELS.length)];
    const title = TITLE_TPL[i % TITLE_TPL.length].replace('{m}', mdl);
    const cost = Math.round(1200 + rand(i + 7) * 8800);
    const impressions = Math.round(cost * (18 + rand(i + 11) * 26));
    const clicks = Math.round(impressions * (0.012 + rand(i + 13) * 0.026));
    const interactions = Math.round(clicks * (0.3 + rand(i + 17) * 0.5));
    const pmInquiries = Math.round(clicks * (0.04 + rand(i + 19) * 0.06));
    const pmOpenings = Math.round(pmInquiries * (0.5 + rand(i + 23) * 0.3));
    const pmLeads = Math.round(pmOpenings * (0.4 + rand(i + 29) * 0.35));
    return {
      id: i + 1,
      title,
      account: acc,
      type: rand(i + 31) > 0.4 ? '视频' : '图文',
      model: mdl,
      cost,
      impressions,
      clicks,
      ctr: ((clicks / impressions) * 100).toFixed(2),
      interactions,
      cpm: (cost / (impressions / 1000)).toFixed(1),
      pm_inquiries: pmInquiries,
      pm_openings: pmOpenings,
      pm_leads: pmLeads,
      lead_cost: pmLeads ? (cost / pmLeads).toFixed(1) : '-',
    };
  }),
);

const realList = ref([]);

const filteredList = computed(() =>
  demoList.value.filter((r) => {
    if (model.value && r.model !== model.value) return false;
    if (keyword.value) {
      const kw = keyword.value.trim();
      if (!r.title.includes(kw) && !r.account.includes(kw)) return false;
    }
    return true;
  }),
);

const tableRows = computed(() =>
  mode.value === 'real' ? realList.value : filteredList.value.slice((page.value - 1) * 10, page.value * 10),
);
const tableTotal = computed(() =>
  mode.value === 'real' ? realTotal.value : filteredList.value.length,
);

const maxCost = computed(() =>
  tableRows.value.reduce((mx, r) => Math.max(mx, Number(r.cost ?? r.fee ?? 0)), 1),
);

const sum = (f) => filteredList.value.reduce((acc, r) => acc + f(r), 0);
const fmt = (v) => Number(v ?? 0).toLocaleString();

const statCards = computed(() => {
  if (mode.value === 'real' && summaryData.value) {
    const s = summaryData.value.summary;
    return [
      { label: '投放账户数', value: fmt(s.account_num) },
      { label: '有消耗天数', value: s.consume_days },
      { label: '总消耗', value: `¥${fmt(s.fee)}`, cls: 'hl-blue' },
      { label: '总曝光', value: fmt(s.impression) },
      { label: '总点击', value: fmt(s.click) },
      { label: '点击率', value: `${s.ctr}%` },
      { label: '互动量', value: fmt(s.interaction) },
      { label: '私信留资', value: fmt(s.msg_leads), cls: 'hl-green' },
      { label: '留资成本', value: s.msg_leads ? `¥${s.msg_lead_cost}` : '-' },
    ];
  }
  const totalCost = sum((r) => r.cost);
  const totalLeads = sum((r) => r.pm_leads);
  return [
    { label: '投流内容数', value: filteredList.value.length },
    { label: '投流账号数', value: new Set(filteredList.value.map((r) => r.account)).size },
    { label: '总消耗', value: `¥${fmt(totalCost)}`, cls: 'hl-blue' },
    { label: '总曝光', value: fmt(sum((r) => r.impressions)) },
    { label: '总点击', value: fmt(sum((r) => r.clicks)) },
    { label: '私信留资', value: fmt(totalLeads), cls: 'hl-green' },
    { label: '留资成本', value: totalLeads ? `¥${(totalCost / totalLeads).toFixed(1)}` : '-' },
  ];
});

const demoColumns = [
  { key: 'title', title: '视频名称 / 账号' },
  { key: 'model', title: '提及车型', width: 110 },
  { key: 'cost', title: '消耗', width: 170 },
  { title: '展现量', dataIndex: 'impressions', width: 100, sorter: (a, b) => a.impressions - b.impressions },
  { title: '点击率', dataIndex: 'ctr', width: 90, sorter: (a, b) => a.ctr - b.ctr },
  { title: '互动量', dataIndex: 'interactions', width: 95 },
  { title: '千展成本', dataIndex: 'cpm', width: 100 },
  { title: '私信进线', dataIndex: 'pm_inquiries', width: 95 },
  { title: '私信开口', dataIndex: 'pm_openings', width: 95 },
  { title: '私信留资', dataIndex: 'pm_leads', width: 95, sorter: (a, b) => a.pm_leads - b.pm_leads },
  { title: '留资成本', dataIndex: 'lead_cost', width: 100 },
];

const realColumns = [
  { key: 'name', title: '账户名称 / 类型' },
  { key: 'fee', title: '消耗', width: 170 },
  { title: '消耗天数', dataIndex: 'consume_days', width: 90 },
  { title: '展现量', dataIndex: 'impression', width: 100, sorter: (a, b) => a.impression - b.impression },
  { title: '点击量', dataIndex: 'click', width: 90 },
  { title: '点击率', dataIndex: 'ctr', width: 90, sorter: (a, b) => a.ctr - b.ctr },
  { title: '互动量', dataIndex: 'interaction', width: 95, sorter: (a, b) => a.interaction - b.interaction },
  { title: '私信留资', dataIndex: 'msg_leads', width: 95, sorter: (a, b) => a.msg_leads - b.msg_leads },
  { title: '留资成本', dataIndex: 'msg_lead_cost', width: 100 },
];

function realParams(extra = {}) {
  return {
    brandId: auth.currentBrandId ?? 2,
    start: range.value?.[0]?.format('YYYY-MM-DD'),
    end: range.value?.[1]?.format('YYYY-MM-DD'),
    ...(keyword.value ? { keyword: keyword.value.trim() } : {}),
    ...extra,
  };
}

async function loadReal() {
  loading.value = true;
  try {
    const [sumRes, listRes] = await Promise.all([
      getSparkCampaignSummary(realParams()),
      getSparkCampaignAccounts(realParams({ metric: metric.value, page: page.value, page_size: 10 })),
    ]);
    summaryData.value = sumRes;
    realTotal.value = listRes.total ?? 0;
    realList.value = listRes.list ?? [];
    nextTick(renderChart);
  } finally {
    loading.value = false;
  }
}

function applyFilter() {
  page.value = 1;
  if (mode.value === 'real') loadReal();
  else {
    loading.value = true;
    setTimeout(() => {
      loading.value = false;
      renderChart();
    }, 200);
  }
}

const onSearch = () => applyFilter();
const onRangeChange = () => applyFilter();

const SORT_METRIC = { click: 'click', impression: 'impression', interaction: 'interaction', msg_leads: 'msg_leads', ctr: 'fee' };

function onTableChange(pag, _filters, sorter) {
  page.value = pag.current ?? 1;
  if (mode.value === 'real') {
    if (sorter?.order) metric.value = SORT_METRIC[sorter.field] ?? 'fee';
    loadReal();
  }
}

const trendEl = ref(null);
let chart = null;

function renderChart() {
  if (!trendEl.value) return;
  if (!chart) chart = echarts.init(trendEl.value);
  let days = [];
  let feeData = [];
  let leadsData = [];
  if (mode.value === 'real' && summaryData.value) {
    const trend = summaryData.value.trend ?? [];
    days = trend.map((t) => dayjs(t.date).format('MM/DD'));
    feeData = trend.map((t) => t.fee);
    leadsData = trend.map((t) => t.msg_leads);
  } else {
    days = Array.from({ length: 14 }, (_, i) => dayjs().subtract(13 - i, 'day').format('MM/DD'));
    const base = sum((r) => r.cost) / 14;
    const baseLeads = Math.max(1, Math.round(sum((r) => r.pm_leads) / 14));
    feeData = days.map((_, i) => Math.round(base * (0.6 + rand(i + 3) * 0.9)));
    leadsData = days.map((_, i) => Math.max(1, Math.round(baseLeads * (0.5 + rand(i + 41) * 1.1))));
  }
  chart.setOption({
    grid: { left: 48, right: 48, top: 32, bottom: 28 },
    tooltip: { trigger: 'axis' },
    legend: { data: ['消耗', '私信留资'], top: 0 },
    xAxis: { type: 'category', data: days },
    yAxis: [
      { type: 'value', name: '消耗(元)', splitLine: { lineStyle: { type: 'dashed' } } },
      { type: 'value', name: '留资', splitLine: { show: false } },
    ],
    series: [
      {
        name: '消耗',
        type: 'line',
        smooth: true,
        data: feeData,
        itemStyle: { color: '#3456E6' },
        areaStyle: { color: 'rgba(52,86,230,0.08)' },
      },
      {
        name: '私信留资',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        data: leadsData,
        itemStyle: { color: '#16a34a' },
      },
    ],
  });
}

const onResize = () => chart?.resize();

onMounted(async () => {
  loading.value = true;
  try {
    const probe = await getSparkCampaignSummary({
      brandId: auth.currentBrandId ?? 2,
      start: range.value[0].format('YYYY-MM-DD'),
      end: range.value[1].format('YYYY-MM-DD'),
    });
    if ((probe.total ?? 0) > 0) {
      mode.value = 'real';
      summaryData.value = probe;
      const listRes = await getSparkCampaignAccounts(
        realParams({ metric: 'fee', page: 1, page_size: 10 }),
      );
      realTotal.value = listRes.total ?? 0;
      realList.value = listRes.list ?? [];
    } else {
      mode.value = 'demo';
    }
  } catch {
    mode.value = 'demo';
  } finally {
    loading.value = false;
    nextTick(renderChart);
    window.addEventListener('resize', onResize);
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
  chart?.dispose();
});
</script>

<style scoped>
.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}

.stat-card {
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  padding: 14px 16px;
}

.stat-label {
  font-size: 12px;
  color: var(--color-text-secondary, #64748b);
}

.stat-value {
  margin-top: 6px;
  font-size: 22px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.hl-blue { color: #3456e6; }
.hl-green { color: #16a34a; }

.chart-card { margin-bottom: 12px; }

.echart-area { height: 280px; }

.c-title { font-weight: 500; }

.muted { color: var(--color-text-secondary, #64748b); }
.small { font-size: 12px; }

.bar-cell { display: flex; flex-direction: column; gap: 3px; }
.bar-num { font-variant-numeric: tabular-nums; font-size: 13px; }
.bar-track { height: 5px; border-radius: 3px; background: #eef2f7; overflow: hidden; }
.bar-fill { height: 100%; border-radius: 3px; background: linear-gradient(90deg, #3456e6, #7c3aed); }
</style>
