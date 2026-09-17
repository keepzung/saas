<template>
  <PageWrapper title="投放计划" subtitle="投放内容效果汇总（按内容维度）">
    <template #filters>
      <FilterTopbar>
        <a-select
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
          placeholder="搜索视频 / 账号名称"
          allow-clear
          @search="applyFilter"
        />
        <a-range-picker
          v-model:value="range"
          size="small"
          :allow-clear="false"
          @change="applyFilter"
        />
      </FilterTopbar>
    </template>

    <NoticeBar>数据说明：当前为演示数据，聚光平台授权接入后将替换为真实投放数据。</NoticeBar>

    <div class="stat-grid">
      <div v-for="s in statCards" :key="s.label" class="stat-card">
        <div class="stat-label">{{ s.label }}</div>
        <div class="stat-value" :class="s.cls">{{ s.value }}</div>
      </div>
    </div>

    <a-card :bordered="false" size="small" title="消耗 & 留资趋势（近 14 天）" class="chart-card">
      <div ref="trendEl" class="echart-area" />
    </a-card>

    <a-card :bordered="false">
      <a-table
        :columns="columns"
        :data-source="filteredList"
        :loading="loading"
        :pagination="{ total: filteredList.length, pageSize: 10, size: 'small', showSizeChanger: false }"
        row-key="id"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'title'">
            <div class="c-title">{{ record.title }}</div>
            <div class="muted small">{{ record.account }} · {{ record.type }}</div>
          </template>
          <template v-else-if="column.key === 'model'">
            <a-tag color="blue">{{ record.model }}</a-tag>
          </template>
          <template v-else-if="column.key === 'cost'">
            <div class="bar-cell">
              <span class="bar-num">¥{{ fmt(record.cost) }}</span>
              <div class="bar-track">
                <div class="bar-fill" :style="{ width: `${(record.cost / maxCost) * 100}%` }" />
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

const modelOptions = MODELS.map((m) => ({ value: m, label: m }));

const list = ref(
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

const filteredList = computed(() =>
  list.value.filter((r) => {
    if (model.value && r.model !== model.value) return false;
    if (keyword.value) {
      const kw = keyword.value.trim();
      if (!r.title.includes(kw) && !r.account.includes(kw)) return false;
    }
    return true;
  }),
);

const maxCost = computed(() =>
  filteredList.value.reduce((mx, r) => Math.max(mx, r.cost), 1),
);

const sum = (f) => filteredList.value.reduce((acc, r) => acc + f(r), 0);
const fmt = (v) => Number(v ?? 0).toLocaleString();

const statCards = computed(() => {
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

const columns = [
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

function applyFilter() {
  loading.value = true;
  setTimeout(() => {
    loading.value = false;
    renderChart();
  }, 200);
}

const trendEl = ref(null);
let chart = null;

function renderChart() {
  if (!trendEl.value) return;
  if (!chart) chart = echarts.init(trendEl.value);
  const days = Array.from({ length: 14 }, (_, i) =>
    dayjs().subtract(13 - i, 'day').format('MM/DD'),
  );
  const base = sum((r) => r.cost) / 14;
  const baseLeads = Math.max(1, Math.round(sum((r) => r.pm_leads) / 14));
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
        data: days.map((_, i) => Math.round(base * (0.6 + rand(i + 3) * 0.9))),
        itemStyle: { color: '#3456E6' },
        areaStyle: { color: 'rgba(52,86,230,0.08)' },
      },
      {
        name: '私信留资',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        data: days.map((_, i) => Math.max(1, Math.round(baseLeads * (0.5 + rand(i + 41) * 1.1)))),
        itemStyle: { color: '#16a34a' },
      },
    ],
  });
}

const onResize = () => chart?.resize();

onMounted(() => {
  nextTick(renderChart);
  window.addEventListener('resize', onResize);
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
