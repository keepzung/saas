<template>
  <PageWrapper title="KOX 运营总览" subtitle="Morgandada 账号 · 内容 · 私信 · 投放全景">
    <template #extra>
      <a-radio-group v-model:value="days" size="small" @change="onQuickChange">
        <a-radio-button :value="7">近7天</a-radio-button>
        <a-radio-button :value="30">近30天</a-radio-button>
        <a-radio-button :value="90">近90天</a-radio-button>
      </a-radio-group>
      <a-range-picker v-model:value="range" size="small" :allow-clear="false" @change="reload" />
    </template>

    <a-card :bordered="false" class="hero-card">
      <div class="hero-banner">
        <div class="hero-item">
          <div class="hero-label">总运营账号数</div>
          <div class="hero-value">{{ fmt(ov.hero?.kos_num) }}</div>
        </div>
        <div class="hero-divider"></div>
        <div class="hero-item">
          <div class="hero-label">产出内容数</div>
          <div class="hero-value primary">{{ fmt(ov.hero?.note_cnt) }}</div>
        </div>
        <div class="hero-divider"></div>
        <div class="hero-item">
          <div class="hero-label">总阅读量</div>
          <div class="hero-value">{{ fmt(ov.hero?.view_sum) }}</div>
        </div>
        <div class="hero-divider"></div>
        <div class="hero-item">
          <div class="hero-label">总费用消耗</div>
          <div class="hero-value violet">¥{{ fmt(ov.hero?.ad_cost) }}</div>
        </div>
        <div class="hero-divider"></div>
        <div class="hero-item">
          <div class="hero-label">全链路留资数</div>
          <div class="hero-value green">{{ fmt(ov.hero?.total_leads) }}</div>
        </div>
      </div>
    </a-card>

    <a-row :gutter="[12, 12]">
      <a-col :xs="24" :md="12">
        <a-card size="small" title="内容发布 & 互动">
          <div class="kv-grid">
            <div class="kv"><span>发帖账号</span><b>{{ fmt(ov.content?.author_num) }}</b></div>
            <div class="kv"><span>内容数</span><b>{{ fmt(ov.content?.note_cnt) }}</b></div>
            <div class="kv"><span>曝光量</span><b>{{ fmt(ov.content?.exposure_sum) }}</b></div>
            <div class="kv"><span>阅读量</span><b>{{ fmt(ov.content?.view_sum) }}</b></div>
            <div class="kv"><span>阅读率</span><b>{{ ov.content?.read_rate ?? 0 }}%</b></div>
            <div class="kv"><span>互动量</span><b>{{ fmt(ov.content?.interaction_sum) }}</b></div>
            <div class="kv"><span>互动率</span><b>{{ ov.content?.interaction_rate ?? 0 }}%</b></div>
            <div class="kv"><span>涨粉数</span><b>{{ fmt(ov.content?.follow_sum) }}</b></div>
          </div>
        </a-card>
      </a-col>
      <a-col :xs="24" :md="12">
        <a-card size="small" title="线索转化（私信会话口径）">
          <div class="kv-grid">
            <div class="kv"><span>私信咨询数</span><b>{{ fmt(ov.lead?.inquiry_cnt) }}</b></div>
            <div class="kv"><span>私信开口数</span><b>{{ fmt(ov.lead?.open_cnt) }}</b></div>
            <div class="kv"><span>开口率</span><b>{{ ov.lead?.open_rate ?? 0 }}%</b></div>
            <div class="kv"><span>私信留资</span><b class="c-green">{{ fmt(ov.lead?.resource_cnt) }}</b></div>
            <div class="kv"><span>私信电话</span><b>{{ fmt(ov.lead?.phone_cnt) }}</b></div>
            <div class="kv"><span>消息总数</span><b>{{ fmt(ov.lead?.msg_cnt) }}</b></div>
          </div>
        </a-card>
      </a-col>
      <a-col :xs="24" :md="12">
        <a-card size="small" title="投放效率">
          <div class="kv-grid">
            <div class="kv"><span>投放消耗</span><b>¥{{ fmt(ov.ad?.cost) }}</b></div>
            <div class="kv"><span>曝光量</span><b>{{ fmt(ov.ad?.impression) }}</b></div>
            <div class="kv"><span>点击量</span><b>{{ fmt(ov.ad?.click) }}</b></div>
            <div class="kv"><span>CTR</span><b>{{ ov.ad?.ctr ?? 0 }}%</b></div>
            <div class="kv"><span>CPC</span><b>¥{{ ov.ad?.cpc ?? 0 }}</b></div>
            <div class="kv"><span>CPM</span><b>¥{{ ov.ad?.cpm ?? 0 }}</b></div>
            <div class="kv"><span>投流私信留资</span><b>{{ fmt(ov.ad?.msg_leads) }}</b></div>
            <div class="kv"><span>私信留资成本</span><b>¥{{ ov.ad?.leads_cost ?? 0 }}</b></div>
          </div>
        </a-card>
      </a-col>
      <a-col :xs="24" :md="12">
        <a-card size="small" title="统计口径">
          <div class="scope-list">
            <div>· 账号 = 小红书 KOS 专业号（对照表内启用账号）</div>
            <div>· 内容/阅读/互动 = 笔记累计口径（发布时间在筛选区间内）</div>
            <div>· 线索 = 来鼓私信会话（仅 Morgandada 投放账户/门店账号），留资 = 留资卡 ∪ 电话</div>
            <div>· 投放 = 聚光投放日报（消耗/曝光/点击）</div>
          </div>
        </a-card>
      </a-col>
    </a-row>

    <a-card size="small">
      <a-tabs v-model:activeKey="trendTab" size="small" @change="renderChart">
        <a-tab-pane key="mix" tab="内容 & 留资趋势" />
        <a-tab-pane key="ad" tab="投放消耗趋势" />
      </a-tabs>
      <div ref="chartEl" style="height: 320px" />
    </a-card>
  </PageWrapper>
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { message } from 'ant-design-vue';
import dayjs from 'dayjs';
import * as echarts from 'echarts';
import PageWrapper from '../../../components/PageWrapper.vue';
import { getMddOverview } from '../../../api/kox';

const days = ref(30);
const range = ref([dayjs().subtract(29, 'day'), dayjs()]);
const ov = ref({});
const chartEl = ref(null);
let chart = null;
const trendTab = ref('mix');

const fmt = (v) => (v ?? 0).toLocaleString();

function onQuickChange() {
  range.value = [dayjs().subtract(days.value - 1, 'day'), dayjs()];
  reload();
}

async function reload() {
  try {
    const params = {};
    if (range.value?.[0]) {
      params.start = range.value[0].format('YYYY-MM-DD');
      params.end = range.value[1].format('YYYY-MM-DD');
    }
    ov.value = await getMddOverview(params);
    nextTick(renderChart);
  } catch (e) {
    message.error(e.message || '加载总览失败');
  }
}

function renderChart() {
  if (!chartEl.value) return;
  if (!chart) chart = echarts.init(chartEl.value);
  const trend = ov.value.trend ?? [];
  const dates = trend.map((t) => t.date.slice(5));

  if (trendTab.value === 'ad') {
    chart.setOption(
      {
        tooltip: { trigger: 'axis' },
        legend: { data: ['投放消耗', '投流私信留资'] },
        grid: { left: 60, right: 60, top: 40, bottom: 30 },
        xAxis: { type: 'category', data: dates },
        yAxis: [
          { type: 'value', name: '消耗(元)' },
          { type: 'value', name: '留资' },
        ],
        series: [
          { name: '投放消耗', type: 'line', smooth: true, data: trend.map((t) => Math.round((t.ad_cost ?? 0) * 100) / 100), itemStyle: { color: '#3456E6' }, areaStyle: { color: 'rgba(52,86,230,0.08)' } },
          { name: '投流私信留资', type: 'line', smooth: true, yAxisIndex: 1, data: trend.map((t) => t.ad_leads ?? 0), itemStyle: { color: '#7c3aed' } },
        ],
      },
      { notMerge: true },
    );
    return;
  }

  chart.setOption(
    {
      tooltip: { trigger: 'axis' },
      legend: { data: ['发布内容', '阅读量', '互动量', '留资'] },
      grid: { left: 60, right: 60, top: 40, bottom: 30 },
      xAxis: { type: 'category', data: dates },
      yAxis: [
        { type: 'value', name: '内容/留资' },
        { type: 'value', name: '阅读/互动', axisLabel: { formatter: (v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v) } },
      ],
      series: [
        { name: '发布内容', type: 'line', smooth: true, data: trend.map((t) => t.note_cnt ?? 0), itemStyle: { color: '#3456E6' }, areaStyle: { color: 'rgba(52,86,230,0.08)' } },
        { name: '阅读量', type: 'line', smooth: true, yAxisIndex: 1, data: trend.map((t) => t.view_sum ?? 0), itemStyle: { color: '#16a34a' } },
        { name: '互动量', type: 'line', smooth: true, yAxisIndex: 1, data: trend.map((t) => t.interaction_sum ?? 0), itemStyle: { color: '#d97706' } },
        { name: '留资', type: 'line', smooth: true, data: trend.map((t) => t.lead_cnt ?? 0), itemStyle: { color: '#7c3aed' } },
      ],
    },
    { notMerge: true },
  );
}

function onResize() {
  chart?.resize();
}

onMounted(() => {
  reload();
  window.addEventListener('resize', onResize);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
  chart?.dispose();
});
</script>

<style scoped>
.hero-banner {
  display: flex;
  align-items: center;
  gap: 28px;
  padding: 4px 8px;
  flex-wrap: wrap;
}

.hero-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.hero-label {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.hero-value {
  font-size: 28px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  line-height: 1.15;
  color: #1e293b;
  font-family: 'DIN Alternate', 'Bahnschrift', -apple-system, sans-serif;
}

.hero-value.primary { color: #2563eb; }
.hero-value.violet { color: #7c3aed; }
.hero-value.green { color: #16a34a; }
.c-green { color: #16a34a; }

.hero-divider {
  width: 1px;
  height: 36px;
  background: #e2e8f0;
  flex-shrink: 0;
}

.kv-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 24px;
}

.kv {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  padding: 4px 0;
  border-bottom: 1px dashed var(--color-border-secondary);
}

.kv span { color: var(--color-text-secondary); }

.scope-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: var(--color-text-secondary);
}

@media (max-width: 767px) {
  .hero-banner {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px 8px;
    padding: 0;
  }

  .hero-divider { display: none; }

  .hero-value { font-size: 20px; }
}
</style>
