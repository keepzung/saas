<template>
  <PageWrapper title="运营总览" :subtitle="`${brandShort} KOS 运营数据`">
    <div class="df-ov">
      <a-card size="small" class="filter-card">
        <div class="filter-row">
          <a-select
            v-model:value="regionName"
            size="small"
            style="width: 140px"
            allow-clear
            placeholder="大区"
            :options="regionOptions"
            @change="reload"
          />
          <a-select
            v-model:value="accountType"
            size="small"
            style="width: 120px"
            allow-clear
            placeholder="账号类型"
            :options="[
              { label: '全部类型', value: '' },
              { label: 'KOS', value: 'KOS' },
              { label: 'KOB', value: 'KOB' },
            ]"
            @change="reload"
          />
          <a-radio-group v-model:value="quick" size="small" @change="onQuickChange">
            <a-radio-button value="7">近7天</a-radio-button>
            <a-radio-button value="30">近30天</a-radio-button>
          </a-radio-group>
          <a-range-picker v-model:value="range" size="small" @change="reload" />
        </div>
      </a-card>

      <a-card :bordered="false" class="hero-card">
        <div class="sec-title">
          <span class="bar"></span>运营总览
          <a-tooltip title="账号/内容指标随筛选联动；留资=笔记私信口径，投流=旧系统导出投放快照">
            <question-circle-outlined class="q-icon" />
          </a-tooltip>
        </div>
        <div class="hero6">
          <div class="h6-item">
            <div class="h6-label">运营账号数</div>
            <div class="h6-value">{{ fmt(ov.summary?.kos_num) }}</div>
            <div class="h6-sub">经销商门店: {{ fmt(ov.summary?.store_num) }}</div>
          </div>
          <div class="h6-item">
            <div class="h6-label">内容发布数</div>
            <div class="h6-value">{{ fmt(ov.summary?.item_cnt) }}</div>
            <div class="h6-sub">爆文数: {{ fmt(ov.publish?.crazy_item_cnt) }}</div>
          </div>
          <div class="h6-item">
            <div class="h6-label">总曝光量</div>
            <div class="h6-value">{{ fmt(ov.summary?.exposure_sum) }}</div>
            <div class="h6-sub">总互动量: {{ fmt(ov.summary?.interaction_sum) }}</div>
          </div>
          <div class="h6-item">
            <div class="h6-label green">私信留资数(自然)</div>
            <div class="h6-value green">{{ fmt(ov.lead_funnel?.organic?.leads) }}</div>
            <div class="h6-sub">进线数: {{ fmt(ov.lead_funnel?.organic?.inquiries) }} ｜ 开口数: {{ fmt(ov.lead_funnel?.organic?.openings) }}</div>
          </div>
          <div class="h6-item">
            <div class="h6-label primary">私信留资数(投流)</div>
            <div class="h6-value primary">{{ fmt(ov.lead_funnel?.campaign?.leads) }}</div>
            <div class="h6-sub">进线数: {{ fmt(ov.lead_funnel?.campaign?.enter) }} ｜ 开口数: {{ fmt(ov.lead_funnel?.campaign?.open) }}</div>
          </div>
          <div class="h6-item">
            <div class="h6-label">私信留资数(全部)</div>
            <div class="h6-value">{{ fmt(ov.lead_funnel?.pm_leads) }}</div>
            <div class="h6-sub">进线数: {{ fmt(ov.lead_funnel?.pm_inquiries) }} ｜ 开口数: {{ fmt(ov.lead_funnel?.pm_openings) }}</div>
          </div>
        </div>
      </a-card>

      <a-card size="small">
        <a-tabs v-model:activeKey="blockTab" size="small">
          <a-tab-pane key="asset" tab="账号资产">
            <div class="asset-grid">
              <div class="asset-item"><span>经销商门店数</span><b>{{ fmt(ov.summary?.store_num) }}</b></div>
              <div class="asset-item"><span>KOS账号数</span><b class="c-primary">{{ fmt(ov.summary?.kos_num) }}</b></div>
              <div class="asset-item"><span>优质账号</span><b class="c-green">{{ fmt(ov.global?.quality_num) }}</b></div>
              <div class="asset-item"><span>矩阵总粉丝数</span><b class="c-violet">{{ fmt(ov.summary?.fans_sum) }}</b></div>
            </div>
          </a-tab-pane>
          <a-tab-pane key="publish" tab="内容发布&互动">
            <div class="metric-grid">
              <div class="kv"><span>发帖账号</span><b>{{ fmt(ov.publish?.author_num) }}</b></div>
              <div class="kv"><span>内容数</span><b>{{ fmt(ov.publish?.item_cnt) }}</b></div>
              <div class="kv"><span>账均发布</span><b>{{ ov.publish?.item_author_ratio ?? 0 }}</b></div>
              <div class="kv"><span>新增粉丝数</span><b>{{ fmt(ov.publish?.follow_count_sum) }}</b></div>
              <div class="kv"><span>总曝光量</span><b>{{ fmt(ov.publish?.exposure_sum) }}</b></div>
              <div class="kv"><span>总阅读量</span><b>{{ fmt(ov.publish?.view_sum) }}</b></div>
              <div class="kv"><span>总互动量</span><b>{{ fmt(ov.publish?.interaction_sum) }}</b></div>
              <div class="kv"><span>互动率</span><b>{{ ov.publish?.interaction_rate ?? 0 }}%</b></div>
            </div>
          </a-tab-pane>
          <a-tab-pane key="lead" tab="线索获取">
            <div class="metric-grid">
              <div class="kv"><span>私信进线</span><b>{{ fmt(ov.lead_funnel?.pm_inquiries) }}</b></div>
              <div class="kv"><span>私信开口</span><b>{{ fmt(ov.lead_funnel?.pm_openings) }}</b></div>
              <div class="kv"><span>私信留资</span><b class="c-green">{{ fmt(ov.lead_funnel?.pm_leads) }}</b></div>
              <div class="kv"><span>开口率（开口/进线）</span><b class="c-violet">{{ ov.lead_funnel?.open_rate ?? 0 }}%</b></div>
              <div class="kv"><span>留资率（留资/进线）</span><b class="c-green">{{ ov.lead_funnel?.lead_rate ?? 0 }}%</b></div>
            </div>
            <div class="funnel-break">
              投流：进线 {{ fmt(ov.lead_funnel?.campaign?.enter) }} / 开口 {{ fmt(ov.lead_funnel?.campaign?.open) }} / 留资 {{ fmt(ov.lead_funnel?.campaign?.leads) }}
              <a-divider type="vertical" />
              自然：进线 {{ fmt(ov.lead_funnel?.organic?.inquiries) }} / 开口 {{ fmt(ov.lead_funnel?.organic?.openings) }} / 留资 {{ fmt(ov.lead_funnel?.organic?.leads) }}
            </div>
          </a-tab-pane>
        </a-tabs>
      </a-card>

      <a-row :gutter="12">
        <a-col :span="13">
          <a-card size="small" title="内容发布趋势">
            <a-radio-group v-model:value="opsSeries" size="small" class="pill-row" @change="renderOps">
              <a-radio-button value="item_cnt">内容发布数</a-radio-button>
              <a-radio-button value="exposure_sum">内容曝光数</a-radio-button>
              <a-radio-button value="view_sum">内容阅读数</a-radio-button>
              <a-radio-button value="interaction_sum">内容互动数</a-radio-button>
              <a-radio-button value="ces_sum">CES</a-radio-button>
            </a-radio-group>
            <div ref="opsEl" style="height: 280px" />
          </a-card>
        </a-col>
        <a-col :span="11">
          <a-card size="small" title="投放趋势">
            <a-radio-group v-model:value="adSeries" size="small" class="pill-row" @change="renderAd">
              <a-radio-button value="ad_cost">投流消耗</a-radio-button>
              <a-radio-button value="ad_msg_leads">私信留资数</a-radio-button>
              <a-radio-button value="ad_msg_enter">私信进线数</a-radio-button>
              <a-radio-button value="ad_msg_open">私信开口数</a-radio-button>
            </a-radio-group>
            <div ref="adEl" style="height: 280px" />
          </a-card>
        </a-col>
      </a-row>

      <a-card size="small" title="热门内容">
        <div class="hot-scroll">
          <div v-for="(n, i) in hotList" :key="n.id" class="hot-card" @click="openNote(n)">
            <div class="hot-cover">
              <img v-if="n.cover_url" :src="n.cover_url" loading="lazy" />
              <div v-else class="hot-cover-ph">{{ (n.title || '#').slice(0, 1) }}</div>
              <span :class="['rank-tag', i < 3 ? `top${i + 1}` : '']">{{ i + 1 }}</span>
            </div>
            <div class="hot-title" :title="n.title">{{ n.title }}</div>
          </div>
          <a-empty v-if="!hotList.length" :image="Empty.PRESENTED_IMAGE_SIMPLE" />
        </div>
      </a-card>
    </div>
  </PageWrapper>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { message } from 'ant-design-vue';
import { Empty } from 'ant-design-vue';
import dayjs from 'dayjs';
import * as echarts from 'echarts';
import { QuestionCircleOutlined } from '@ant-design/icons-vue';
import PageWrapper from '../../../components/PageWrapper.vue';
import { brandTheme } from '../../../config/brands';
import { getKoxAccounts, getKoxNotes, getKoxOverview } from '../../../api/kox';
import { useAuthStore } from '../../../stores/auth';

const auth = useAuthStore();
const brandShort = computed(
  () => brandTheme(auth.currentBrandId)?.short ?? (Number(auth.currentBrandId) === 7 ? '东风奕境' : '格力'),
);

const quick = ref('7');
const range = ref([dayjs().subtract(6, 'day'), dayjs()]);
const regionName = ref(undefined);
const accountType = ref(undefined);
const regionOptions = ref([]);
const blockTab = ref('asset');
const opsSeries = ref('item_cnt');
const adSeries = ref('ad_cost');

const ov = ref({});
const hotList = ref([]);

let opsChart = null;
let adChart = null;
const opsEl = ref(null);
const adEl = ref(null);

const OPS_LABELS = {
  item_cnt: '内容发布数',
  exposure_sum: '内容曝光数',
  view_sum: '内容阅读数',
  interaction_sum: '内容互动数',
  ces_sum: 'CES',
};
const AD_LABELS = {
  ad_cost: '投流消耗',
  ad_msg_leads: '私信留资数',
  ad_msg_enter: '私信进线数',
  ad_msg_open: '私信开口数',
};

const fmt = (n) => (n ?? 0).toLocaleString();

function dateParams() {
  const p = { brandId: auth.currentBrandId ?? undefined };
  if (range.value?.[0]) {
    p.start = range.value[0].format('YYYY-MM-DD');
    p.end = range.value[1].format('YYYY-MM-DD');
  }
  if (regionName.value) p.regionName = regionName.value;
  if (accountType.value) p.accountType = accountType.value;
  return p;
}

async function loadFacets() {
  try {
    const res = await getKoxAccounts({ brandId: auth.currentBrandId, page_size: 1 });
    regionOptions.value = (res.region_facets ?? []).map((r) => ({ label: r, value: r }));
  } catch {
    /* 忽略 */
  }
}

async function reload() {
  try {
    ov.value = await getKoxOverview(dateParams());
    const res = await getKoxNotes({ ...dateParams(), metric: 'views', page_size: 10 });
    hotList.value = res.list ?? [];
    await nextTick();
    renderOps();
    renderAd();
  } catch (e) {
    message.error(e.message || '加载总览失败');
  }
}

function onQuickChange() {
  const days = Number(quick.value);
  range.value = [dayjs().subtract(days - 1, 'day'), dayjs()];
  reload();
}

function renderOps() {
  if (!opsEl.value) return;
  if (!opsChart) opsChart = echarts.init(opsEl.value);
  const trend = ov.value.trend ?? [];
  const key = opsSeries.value;
  opsChart.setOption(
    {
      tooltip: { trigger: 'axis' },
      grid: { left: 52, right: 24, top: 24, bottom: 28 },
      xAxis: { type: 'category', data: trend.map((t) => t.date.slice(5)) },
      yAxis: { type: 'value' },
      series: [
        {
          name: OPS_LABELS[key],
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          itemStyle: { color: '#3456E6' },
          areaStyle: { color: 'rgba(52,86,230,0.10)' },
          data: trend.map((t) => t[key] ?? 0),
        },
      ],
    },
    { notMerge: true },
  );
}

function renderAd() {
  if (!adEl.value) return;
  if (!adChart) adChart = echarts.init(adEl.value);
  const trend = ov.value.trend ?? [];
  const key = adSeries.value;
  adChart.setOption(
    {
      tooltip: { trigger: 'axis' },
      grid: { left: 60, right: 24, top: 24, bottom: 28 },
      xAxis: { type: 'category', data: trend.map((t) => t.date.slice(5)) },
      yAxis: { type: 'value', axisLabel: { formatter: (v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v) } },
      series: [
        {
          name: AD_LABELS[key],
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          itemStyle: { color: '#f97316' },
          areaStyle: { color: 'rgba(249,115,22,0.10)' },
          data: trend.map((t) => t[key] ?? 0),
        },
      ],
    },
    { notMerge: true },
  );
}

watch([opsSeries, adSeries], () => {
  nextTick(() => {
    renderOps();
    renderAd();
  });
});

function openNote(n) {
  if (n.note_url) window.open(n.note_url, '_blank');
}

function onResize() {
  opsChart?.resize();
  adChart?.resize();
}

onMounted(() => {
  loadFacets();
  reload();
  window.addEventListener('resize', onResize);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
  opsChart?.dispose();
  adChart?.dispose();
});
</script>

<style scoped>
.filter-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.sec-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  margin-bottom: 16px;
}

.sec-title .bar,
.rank-toolbar .bar {
  width: 4px;
  height: 16px;
  border-radius: 2px;
  background: #3456e6;
  display: inline-block;
}

.q-icon {
  color: #94a3b8;
  font-size: 13px;
}

.hero-card {
  margin-bottom: 12px;
}

.hero6 {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 12px;
}

.h6-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
  background: #f8fafc;
  border-radius: 10px;
  padding: 14px 12px;
  min-width: 0;
}

.h6-label {
  font-size: 12px;
  color: var(--color-text-secondary);
  white-space: nowrap;
}

.h6-label.green {
  color: #16a34a;
}

.h6-label.primary {
  color: #2563eb;
}

.h6-value {
  font-size: 26px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: #1e293b;
  font-family: 'DIN Alternate', 'Bahnschrift', -apple-system, sans-serif;
}

.h6-value.green {
  color: #16a34a;
}

.h6-value.primary {
  color: #2563eb;
}

.h6-sub {
  font-size: 11px;
  color: #94a3b8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.asset-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.asset-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: #f8fafc;
  border-radius: 10px;
  padding: 16px 14px;
}

.asset-item span {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.asset-item b {
  font-size: 26px;
  font-variant-numeric: tabular-nums;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px 24px;
}

.kv {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  padding: 8px 10px;
  background: #f8fafc;
  border-radius: 8px;
}

.kv span {
  color: var(--color-text-secondary);
}

.c-primary {
  color: #2563eb;
}

.c-violet {
  color: #7c3aed;
}

.c-green {
  color: #16a34a;
}

.funnel-break {
  margin-top: 12px;
  padding: 8px 12px;
  background: #f8fafc;
  border-radius: 8px;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.pill-row {
  margin-bottom: 8px;
}

.hot-scroll {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding-bottom: 6px;
}

.hot-card {
  width: 128px;
  flex-shrink: 0;
  cursor: pointer;
}

.hot-cover {
  position: relative;
  aspect-ratio: 3 / 4;
  border-radius: 10px;
  overflow: hidden;
  background: #f1f5f9;
}

.hot-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.hot-cover-ph {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  color: #cbd5e1;
  font-weight: 700;
}

.rank-tag {
  position: absolute;
  left: 6px;
  top: 6px;
  width: 20px;
  height: 20px;
  border-radius: 6px;
  background: rgba(15, 23, 42, 0.65);
  color: #fff;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.rank-tag.top1 {
  background: #dc2626;
}

.rank-tag.top2 {
  background: #ea580c;
}

.rank-tag.top3 {
  background: #d97706;
}

.hot-title {
  margin-top: 6px;
  font-size: 12px;
  color: #1e293b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
