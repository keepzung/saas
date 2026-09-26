<template>
  <PageWrapper title="运营总览" subtitle="特斯拉 KOS 运营数据">
    <div class="tesla-ov">
    <a-card size="small" class="filter-card">
      <div class="filter-row">
        <a-radio-group v-model:value="quick" size="small" @change="onQuickChange">
          <a-radio-button value="7">近7天</a-radio-button>
          <a-radio-button value="30">近30天</a-radio-button>
        </a-radio-group>
        <a-range-picker v-model:value="range" size="small" @change="onRangeChange" />
        <span class="f-label">账号标签：</span>
        <a-select
          v-model:value="accountTag"
          size="small"
          style="width: 150px"
          allow-clear
          placeholder="全部"
          :options="tagOptions"
          @change="reload"
        />
        <span class="f-label">大区：</span>
        <a-radio-group v-model:value="regionName" size="small" @change="reload">
          <a-radio-button value="">全部</a-radio-button>
          <a-radio-button v-for="r in regionOptions" :key="r" :value="r">{{ r }}</a-radio-button>
        </a-radio-group>
      </div>
    </a-card>

    <a-card :bordered="false" class="hero-card">
      <div class="sec-title">
        <span class="bar"></span>运营大盘数据与核心漏斗
        <a-tooltip title="账号与内容指标随标签/大区筛选联动；线索为投放+自然口径">
          <question-circle-outlined class="q-icon" />
        </a-tooltip>
      </div>
      <div class="hero-banner">
        <div class="hero-item">
          <div class="hero-label">运营账号数</div>
          <div class="hero-value">{{ fmt(ov.summary?.kos_num) }}</div>
          <div class="hero-sub">门店/中心: {{ fmt(ov.summary?.store_num) }}</div>
        </div>
        <div class="hero-divider"></div>
        <div class="hero-item">
          <div class="hero-label">产出内容数</div>
          <div class="hero-value">{{ fmt(ov.summary?.item_cnt) }}</div>
          <div class="hero-sub">账均发布: {{ ov.summary?.avg_publish ?? 0 }}</div>
        </div>
        <div class="hero-divider"></div>
        <div class="hero-item">
          <div class="hero-label">总阅读/播放量</div>
          <div class="hero-value primary">{{ fmt(ov.summary?.view_sum) }}</div>
          <div class="hero-sub">总互动量: {{ fmt(ov.summary?.interaction_sum) }}</div>
        </div>
        <div class="hero-divider"></div>
        <div class="hero-item">
          <div class="hero-label">全部线索/留资数</div>
          <div class="hero-value green">{{ fmt(ov.lead_funnel?.pm_leads) }}</div>
          <div class="hero-sub">粉丝覆盖: {{ fmt(ov.summary?.fans_sum) }}</div>
        </div>
      </div>
    </a-card>

    <a-card size="small">
      <a-tabs v-model:activeKey="blockTab" size="small">
        <a-tab-pane key="publish" tab="内容发布 & 互动">
          <div class="metric-grid">
            <div class="kv"><span>门店中心数</span><b>{{ fmt(ov.summary?.store_num) }}</b></div>
            <div class="kv"><span>KOS 账号数</span><b class="c-primary">{{ fmt(ov.summary?.kos_num) }}</b></div>
            <div class="kv"><span>内容发布数</span><b>{{ fmt(ov.summary?.item_cnt) }}</b></div>
            <div class="kv"><span>账均发布</span><b>{{ ov.summary?.avg_publish ?? 0 }}</b></div>
            <div class="kv"><span>新增粉丝数</span><b>{{ fmt(ov.publish?.follow_count_sum) }}</b></div>
            <div class="kv"><span>总曝光量</span><b>{{ fmt(ov.summary?.exposure_sum) }}</b></div>
            <div class="kv"><span>总阅读量</span><b>{{ fmt(ov.summary?.view_sum) }}</b></div>
            <div class="kv"><span>总互动量</span><b>{{ fmt(ov.summary?.interaction_sum) }}</b></div>
            <div class="kv"><span>互动率</span><b>{{ ov.publish?.interaction_rate ?? 0 }}%</b></div>
          </div>
        </a-tab-pane>
        <a-tab-pane key="lead" tab="线索转化">
          <div class="metric-grid">
            <div class="kv"><span>私信进线</span><b>{{ fmt(ov.lead_funnel?.pm_inquiries) }}</b></div>
            <div class="kv">
              <span>
                私信开口
                <a-tooltip :title="ov.lead_funnel?.scope_note || '开口含投放+自然口径'">
                  <question-circle-outlined class="q-icon" />
                </a-tooltip>
              </span>
              <b class="c-primary">{{ fmt(ov.lead_funnel?.pm_openings) }}</b>
            </div>
            <div class="kv"><span>私信留资</span><b>{{ fmt(ov.lead_funnel?.pm_leads) }}</b></div>
            <div class="kv">
              <span>开口率（开口/进线）</span>
              <b class="c-violet">{{ ov.lead_funnel?.open_rate ?? 0 }}%</b>
            </div>
            <div class="kv">
              <span>留资率（留资/进线）</span>
              <b class="c-green">{{ ov.lead_funnel?.lead_rate ?? 0 }}%</b>
            </div>
          </div>
          <div class="funnel-break">
            投放：进线 {{ fmt(ov.lead_funnel?.campaign?.enter) }} / 开口 {{ fmt(ov.lead_funnel?.campaign?.open) }} / 留资 {{ fmt(ov.lead_funnel?.campaign?.leads) }}
            <a-divider type="vertical" />
            自然：进线 {{ fmt(ov.lead_funnel?.organic?.inquiries) }} / 开口 {{ fmt(ov.lead_funnel?.organic?.openings) }} / 留资 {{ fmt(ov.lead_funnel?.organic?.leads) }}
          </div>
        </a-tab-pane>
      </a-tabs>
    </a-card>

    <a-row :gutter="12">
      <a-col :span="14">
        <a-card size="small" title="运营趋势">
          <div ref="opsChartEl" style="height: 300px" />
        </a-card>
      </a-col>
      <a-col :span="10">
        <a-card size="small" title="投放趋势">
          <a-radio-group v-model:value="adSeries" size="small" class="ad-pills" @change="renderAdChart">
            <a-radio-button value="enter">进线数</a-radio-button>
            <a-radio-button value="open">开口数</a-radio-button>
            <a-radio-button value="leads">留资数</a-radio-button>
          </a-radio-group>
          <div ref="adChartEl" style="height: 272px" />
        </a-card>
      </a-col>
    </a-row>

    <a-row :gutter="12">
      <a-col :span="13">
        <a-card size="small">
          <div class="rank-head">
            <div class="rank-tabs">
              <span class="bar"></span><b>账号排行</b>
              <a-radio-group v-model:value="rankMetric" size="small" @change="loadRank">
                <a-radio-button v-for="m in RANK_METRICS" :key="m.key" :value="m.key">{{ m.label }}</a-radio-button>
              </a-radio-group>
            </div>
          </div>
          <div class="rank-list">
            <div v-for="(r, i) in rankList" :key="r.account_id" class="rank-row" @click="goAccount(r)">
              <span class="rank-no">
                <template v-if="i < 3">
                  <span :class="['crown', `crown-${i + 1}`]">{{ CROWNS[i] }}</span>
                </template>
                <template v-else>{{ i + 1 }}</template>
              </span>
              <span class="rank-name" :title="r.nickname">{{ r.nickname }}</span>
              <span class="rank-value">{{ fmt(rankValue(r)) }}</span>
            </div>
            <a-empty v-if="!rankList.length" :image="Empty.PRESENTED_IMAGE_SIMPLE" />
          </div>
        </a-card>
      </a-col>
      <a-col :span="11">
        <a-card size="small">
          <div class="rank-head">
            <div class="rank-tabs">
              <span class="bar"></span><b>热门内容</b>
              <a-tooltip title="按阅读量 TOP8，点击卡片查看原笔记">
                <question-circle-outlined class="q-icon" />
              </a-tooltip>
            </div>
          </div>
          <div class="hot-grid">
            <div v-for="n in hotList" :key="n.id" class="hot-card" @click="openNote(n)">
              <div class="hot-cover">
                <img v-if="n.cover_url" :src="n.cover_url" loading="lazy" />
                <div v-else class="hot-cover-ph">{{ (n.title || '#').slice(0, 1) }}</div>
              </div>
              <div class="hot-title" :title="n.title">{{ n.title }}</div>
              <div class="hot-author">@{{ n.author_name }}</div>
              <div class="hot-stats">
                <span>♡ {{ fmt(n.likes) }}</span>
                <span>💬 {{ fmt(n.comments) }}</span>
                <span>⭐ {{ fmt(n.collects) }}</span>
                <span>🔗 {{ fmt(n.shares) }}</span>
              </div>
            </div>
            <a-empty v-if="!hotList.length" :image="Empty.PRESENTED_IMAGE_SIMPLE" />
          </div>
        </a-card>
      </a-col>
    </a-row>
  </div>
  </PageWrapper>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { message } from 'ant-design-vue';
import { Empty } from 'ant-design-vue';
import dayjs from 'dayjs';
import * as echarts from 'echarts';
import { QuestionCircleOutlined } from '@ant-design/icons-vue';
import PageWrapper from '../../../components/PageWrapper.vue';
import {
  getKoxAccountRanking,
  getKoxAccounts,
  getKoxNotes,
  getKoxOverview,
} from '../../../api/kox';
import { useAuthStore } from '../../../stores/auth';
import { useRouter } from 'vue-router';

const auth = useAuthStore();
const router = useRouter();

const CROWNS = ['👑', '🥈', '🥉'];
const RANK_METRICS = [
  { key: 'pm_leads', label: '留资数', field: 'pm_leads' },
  { key: 'exposure_sum', label: '曝光数', field: 'exposure_sum' },
  { key: 'view_sum', label: '阅读数', field: 'view_sum' },
  { key: 'interaction_sum', label: '互动数', field: 'interaction_sum' },
  { key: 'ces', label: 'CES', field: 'ces' },
  { key: 'item_cnt', label: '内容发布数', field: 'item_cnt' },
];

const quick = ref('30');
const range = ref([dayjs().subtract(29, 'day'), dayjs()]);
const accountTag = ref(undefined);
const regionName = ref('');
const tagOptions = ref([]);
const regionOptions = ref([]);
const blockTab = ref('publish');
const adSeries = ref('enter');
const rankMetric = ref('pm_leads');

const ov = ref({});
const rankList = ref([]);
const hotList = ref([]);

let opsChart = null;
let adChart = null;
const opsChartEl = ref(null);
const adChartEl = ref(null);

const fmt = (n) => (n ?? 0).toLocaleString();
const rankField = computed(
  () => RANK_METRICS.find((m) => m.key === rankMetric.value)?.field ?? 'pm_leads',
);
const rankValue = (r) => r[rankField.value];

function dateParams() {
  const p = { brandId: auth.currentBrandId ?? undefined };
  if (range.value?.[0]) {
    p.start = range.value[0].format('YYYY-MM-DD');
    p.end = range.value[1].format('YYYY-MM-DD');
  }
  if (accountTag.value) p.accountTag = accountTag.value;
  if (regionName.value) p.regionName = regionName.value;
  return p;
}

async function loadFacets() {
  try {
    const res = await getKoxAccounts({ brandId: auth.currentBrandId, page_size: 1 });
    regionOptions.value = res.region_facets ?? [];
    tagOptions.value = (res.tag_facets ?? []).map((t) => ({ label: t, value: t }));
  } catch {
    /* 筛选项加载失败不阻塞主数据 */
  }
}

async function reload() {
  try {
    ov.value = await getKoxOverview(dateParams());
    await Promise.all([loadRank(), loadHot()]);
    await nextTick();
    renderOpsChart();
    renderAdChart();
  } catch (e) {
    message.error(e.message || '加载总览失败');
  }
}

async function loadRank() {
  try {
    const res = await getKoxAccountRanking({
      ...dateParams(),
      metric: rankMetric.value,
      page_size: 10,
    });
    rankList.value = res.list ?? [];
  } catch {
    rankList.value = [];
  }
}

async function loadHot() {
  try {
    const res = await getKoxNotes({ ...dateParams(), metric: 'views', page_size: 8 });
    hotList.value = (res.list ?? []).slice(0, 8);
  } catch {
    hotList.value = [];
  }
}

function onQuickChange() {
  const days = Number(quick.value);
  range.value = [dayjs().subtract(days - 1, 'day'), dayjs()];
  reload();
}

function onRangeChange() {
  reload();
}

function renderOpsChart() {
  if (!opsChartEl.value) return;
  if (!opsChart) opsChart = echarts.init(opsChartEl.value);
  const trend = ov.value.trend ?? [];
  opsChart.setOption(
    {
      tooltip: { trigger: 'axis' },
      legend: { data: ['内容数', '曝光数', '互动数'], top: 0 },
      grid: { left: 56, right: 56, top: 36, bottom: 28 },
      xAxis: { type: 'category', data: trend.map((t) => t.date.slice(5)) },
      yAxis: [
        { type: 'value', name: '内容数' },
        { type: 'value', name: '曝光/互动', axisLabel: { formatter: (v) => (v >= 10000 ? `${Math.round(v / 10000)}w` : v >= 1000 ? `${Math.round(v / 1000)}k` : v) } },
      ],
      series: [
        { name: '内容数', type: 'line', smooth: true, data: trend.map((t) => t.item_cnt ?? 0), itemStyle: { color: '#3456E6' }, areaStyle: { color: 'rgba(52,86,230,0.08)' } },
        { name: '曝光数', type: 'line', smooth: true, yAxisIndex: 1, data: trend.map((t) => t.exposure_sum ?? 0), itemStyle: { color: '#16a34a' } },
        { name: '互动数', type: 'line', smooth: true, yAxisIndex: 1, data: trend.map((t) => t.interaction_sum ?? 0), itemStyle: { color: '#d97706' } },
      ],
    },
    { notMerge: true },
  );
}

function renderAdChart() {
  if (!adChartEl.value) return;
  if (!adChart) adChart = echarts.init(adChartEl.value);
  const trend = ov.value.trend ?? [];
  const field = adSeries.value === 'enter' ? 'ad_msg_enter' : adSeries.value === 'open' ? 'ad_msg_open' : 'ad_msg_leads';
  const label = adSeries.value === 'enter' ? '进线数' : adSeries.value === 'open' ? '开口数' : '留资数';
  adChart.setOption(
    {
      tooltip: { trigger: 'axis' },
      grid: { left: 48, right: 24, top: 24, bottom: 28 },
      xAxis: { type: 'category', data: trend.map((t) => t.date.slice(5)) },
      yAxis: { type: 'value' },
      series: [
        { name: label, type: 'line', smooth: true, data: trend.map((t) => t[field] ?? 0), itemStyle: { color: '#f97316' }, areaStyle: { color: 'rgba(249,115,22,0.10)' } },
      ],
    },
    { notMerge: true },
  );
}

function openNote(n) {
  if (n.note_url) window.open(n.note_url, '_blank');
  else message.info('该笔记无链接');
}

function goAccount() {
  router.push('/kox_df/operation-analysis/author-ranking');
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

.f-label {
  color: var(--color-text-secondary);
  font-size: 13px;
}

.sec-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  margin-bottom: 14px;
}

.sec-title .bar,
.rank-head .bar {
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

.hero-banner {
  display: flex;
  align-items: stretch;
  padding: 8px 0;
}

.hero-item {
  flex: 1 1 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 2px;
  min-width: 0;
  padding: 4px 12px;
}

.hero-label {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.hero-value {
  font-size: 30px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  line-height: 1.15;
  color: #1e293b;
  font-family: 'DIN Alternate', 'Bahnschrift', -apple-system, sans-serif;
}

.hero-value.primary {
  color: #2563eb;
}

.hero-value.green {
  color: #16a34a;
}

.hero-sub {
  font-size: 12px;
  color: #94a3b8;
}

.hero-divider {
  width: 1px;
  height: 44px;
  background: #e2e8f0;
  align-self: center;
  flex-shrink: 0;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px 28px;
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

.kv b {
  font-variant-numeric: tabular-nums;
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

.ad-pills {
  margin-bottom: 8px;
}

.rank-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.rank-tabs {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.rank-list {
  display: flex;
  flex-direction: column;
}

.rank-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 8px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
}

.rank-row:nth-child(odd) {
  background: #f8fafc;
}

.rank-row:hover {
  background: #eef2ff;
}

.rank-no {
  width: 26px;
  text-align: center;
  color: var(--color-text-secondary);
  flex-shrink: 0;
}

.crown-1 {
  font-size: 16px;
}

.crown-2,
.crown-3 {
  font-size: 13px;
  opacity: 0.85;
}

.rank-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rank-value {
  font-weight: 700;
  color: #2563eb;
  font-variant-numeric: tabular-nums;
}

.hot-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.hot-card {
  border: 1px solid #f1f5f9;
  border-radius: 10px;
  overflow: hidden;
  cursor: pointer;
  transition: box-shadow 0.2s;
}

.hot-card:hover {
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.12);
}

.hot-cover {
  aspect-ratio: 1.2 / 1;
  background: #f1f5f9;
  overflow: hidden;
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
  font-size: 26px;
  color: #cbd5e1;
  font-weight: 700;
}

.hot-title {
  padding: 8px 10px 2px;
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hot-author {
  padding: 0 10px;
  font-size: 12px;
  color: #94a3b8;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hot-stats {
  display: flex;
  gap: 10px;
  padding: 6px 10px 8px;
  font-size: 12px;
  color: var(--color-text-secondary);
}
</style>
