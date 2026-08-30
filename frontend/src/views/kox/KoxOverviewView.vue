<template>
  <PageWrapper title="KOX 运营总览" subtitle="KOS/KOB/KOC 账号运营数据">
    <template #extra>
      <a-radio-group v-model:value="platform" size="small" @change="reload">
        <a-radio-button value="all">全部平台</a-radio-button>
        <a-radio-button value="douyin">抖音</a-radio-button>
        <a-radio-button value="xhs">小红书</a-radio-button>
      </a-radio-group>
      <a-range-picker v-model:value="range" size="small" @change="reload" />
    </template>

    <a-card :bordered="false" class="num-card">
      <a-row :gutter="16">
        <a-col :span="6">
          <a-statistic title="覆盖门店数" :value="ov.store_num" />
        </a-col>
        <a-col :span="6">
          <a-statistic title="KOS 账号" :value="ov.kos_num" :value-style="{ color: '#3456E6' }" />
        </a-col>
        <a-col :span="6">
          <a-statistic title="KOB 账号" :value="ov.kob_num" :value-style="{ color: '#7c3aed' }" />
        </a-col>
        <a-col :span="6">
          <a-statistic title="KOC 账号" :value="ov.koc_num" :value-style="{ color: '#0d9488' }" />
        </a-col>
      </a-row>
    </a-card>

    <a-row :gutter="12">
      <a-col :span="12">
        <a-card size="small" title="内容发布 & 互动">
          <div class="kv-grid">
            <div class="kv"><span>发帖账号</span><b>{{ fmt(ov.publish?.author_num) }}</b></div>
            <div class="kv"><span>内容数</span><b>{{ fmt(ov.publish?.item_cnt) }}</b></div>
            <div class="kv"><span>爆款内容</span><b>{{ fmt(ov.publish?.crazy_item_cnt) }}</b></div>
            <div class="kv"><span>人均内容</span><b>{{ ov.publish?.item_author_ratio ?? 0 }}</b></div>
            <div class="kv"><span>曝光量</span><b>{{ fmt(ov.publish?.exposure_sum) }}</b></div>
            <div class="kv"><span>阅读量</span><b>{{ fmt(ov.publish?.view_sum) }}</b></div>
            <div class="kv"><span>互动量</span><b>{{ fmt(ov.publish?.interaction_sum) }}</b></div>
            <div class="kv"><span>互动率</span><b>{{ ov.publish?.interaction_rate ?? 0 }}%</b></div>
            <div class="kv"><span>涨粉数</span><b>{{ fmt(ov.publish?.follow_count_sum) }}</b></div>
            <div class="kv"><span>挂载内容</span><b>{{ fmt(ov.publish?.tool_item_cnt_sum) }}</b></div>
          </div>
        </a-card>
      </a-col>
      <a-col :span="12">
        <a-card size="small" title="线索转化">
          <div class="kv-grid">
            <div class="kv"><span>私信咨询数</span><b>{{ fmt(ov.lead?.total_pm_inquiries_sum) }}</b></div>
            <div class="kv"><span>私信开口数</span><b>{{ fmt(ov.lead?.total_pm_openings_sum) }}</b></div>
            <div class="kv"><span>私信留资</span><b>{{ fmt(ov.lead?.total_pm_leads_sum) }}</b></div>
            <div class="kv"><span>线索率</span><b>{{ ov.lead?.lead_rate ?? 0 }}%</b></div>
            <div class="kv"><span>组件点击</span><b>{{ fmt(ov.lead?.tool_click_cnt_sum) }}</b></div>
            <div class="kv"><span>表单线索</span><b>{{ fmt(ov.lead?.form_leads_sum) }}</b></div>
          </div>
        </a-card>
      </a-col>
      <a-col :span="12">
        <a-card size="small" title="投放效率">
          <div class="kv-grid">
            <div class="kv"><span>投放消耗</span><b>¥{{ fmt(ov.ad?.ad_cost) }}</b></div>
            <div class="kv"><span>曝光量</span><b>{{ fmt(ov.ad?.ad_view_sum) }}</b></div>
            <div class="kv"><span>CTR</span><b>{{ ov.ad?.ad_ctr ?? 0 }}%</b></div>
            <div class="kv"><span>CPC</span><b>¥{{ ov.ad?.ad_cpc ?? 0 }}</b></div>
            <div class="kv"><span>CPM</span><b>¥{{ ov.ad?.ad_cpm ?? 0 }}</b></div>
            <div class="kv"><span>转化数</span><b>{{ fmt(ov.ad?.ad_conversions) }}</b></div>
            <div class="kv"><span>转化成本</span><b>¥{{ ov.ad?.ad_conversion_cost ?? 0 }}</b></div>
            <div class="kv"><span>转化率</span><b>{{ ov.ad?.ad_conversion_rate ?? 0 }}%</b></div>
          </div>
        </a-card>
      </a-col>
      <a-col :span="12">
        <a-card size="small" title="直播运营">
          <div class="kv-grid">
            <div class="kv"><span>开播账号</span><b>{{ fmt(ov.live?.live_account_num) }}</b></div>
            <div class="kv"><span>直播场次</span><b>{{ fmt(ov.live?.live_count) }}</b></div>
            <div class="kv"><span>有效时长(h)</span><b>{{ Math.round((ov.live?.live_valid_duration ?? 0) / 36) / 100 }}</b></div>
            <div class="kv"><span>场观人次</span><b>{{ fmt(ov.live?.live_watch_uv) }}</b></div>
            <div class="kv"><span>组件点击</span><b>{{ fmt(ov.live?.live_tool_click_cnt) }}</b></div>
            <div class="kv"><span>直播线索</span><b>{{ fmt(ov.live?.live_total_leads) }}</b></div>
            <div class="kv"><span>线索率</span><b>{{ ov.live?.live_lead_rate ?? 0 }}%</b></div>
            <div class="kv"><span>直播消耗</span><b>¥{{ fmt(ov.live?.live_cost) }}</b></div>
            <div class="kv"><span>线索成本</span><b>¥{{ ov.live?.live_conversion_cost ?? 0 }}</b></div>
          </div>
        </a-card>
      </a-col>
    </a-row>

    <a-card size="small" title="发布 & 互动趋势">
      <div ref="chartEl" style="height: 320px" />
    </a-card>
  </PageWrapper>
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { message } from 'ant-design-vue';
import dayjs from 'dayjs';
import * as echarts from 'echarts';
import PageWrapper from '../../components/PageWrapper.vue';
import { getKoxOverview } from '../../api/kox';

const ov = ref({});
const platform = ref('all');
const range = ref([
  dayjs().subtract(29, 'day'),
  dayjs(),
]);
const chartEl = ref(null);
let chart = null;

const fmt = (n) => (n ?? 0).toLocaleString();

async function reload() {
  try {
    const params = { platform: platform.value };
    if (range.value?.[0]) {
      params.start = range.value[0].format('YYYY-MM-DD');
      params.end = range.value[1].format('YYYY-MM-DD');
    }
    ov.value = await getKoxOverview(params);
    nextTick(renderChart);
  } catch (e) {
    message.error(e.message || '加载总览失败');
  }
}

function renderChart() {
  if (!chartEl.value) return;
  if (!chart) chart = echarts.init(chartEl.value);
  const trend = ov.value.trend ?? [];
  chart.setOption({
    tooltip: { trigger: 'axis' },
    legend: { data: ['内容数', '阅读量', '互动量', '私信留资'] },
    grid: { left: 60, right: 60, top: 40, bottom: 30 },
    xAxis: { type: 'category', data: trend.map((t) => t.date.slice(5)) },
    yAxis: [
      { type: 'value', name: '内容/留资' },
      { type: 'value', name: '阅读/互动', axisLabel: { formatter: (v) => `${Math.round(v / 1000)}k` } },
    ],
    series: [
      { name: '内容数', type: 'bar', data: trend.map((t) => t.item_cnt), itemStyle: { color: '#3456E6' } },
      { name: '阅读量', type: 'line', smooth: true, yAxisIndex: 1, data: trend.map((t) => t.view_sum), itemStyle: { color: '#16a34a' } },
      { name: '互动量', type: 'line', smooth: true, yAxisIndex: 1, data: trend.map((t) => t.interaction_sum), itemStyle: { color: '#d97706' } },
      { name: '私信留资', type: 'line', smooth: true, data: trend.map((t) => t.total_pm_leads), itemStyle: { color: '#7c3aed' } },
    ],
  });
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

.kv span {
  color: var(--color-text-secondary);
}
</style>
