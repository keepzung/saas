<template>
  <PageWrapper title="运营总览" subtitle="Morgandada KOS 运营数据">
    <div class="mdd-ov">
      <a-card size="small" class="filter-card">
        <div class="filter-row">
          <a-radio-group v-model:value="quick" size="small" @change="onQuickChange">
            <a-radio-button value="7">近7天</a-radio-button>
            <a-radio-button value="30">近30天</a-radio-button>
          </a-radio-group>
          <a-range-picker v-model:value="range" size="small" @change="onRangeChange" />
          <span class="f-label">口径：</span>
          <a-radio-group v-model:value="caliber" size="small" @change="reload">
            <a-radio-button value="total">汇总</a-radio-button>
            <a-radio-button value="natural">自然流</a-radio-button>
            <a-radio-button value="juguang">聚光投放</a-radio-button>
          </a-radio-group>
          <span class="f-label">账号标签：</span>
          <a-select
            v-model:value="accountTag"
            mode="multiple"
            size="small"
            style="min-width: 150px"
            allow-clear
            placeholder="全部"
            :max-tag-count="1"
            :options="tagOptions"
            @change="reload"
          />
          <a-button size="small" type="text" :loading="loading" @click="reload">
            <template #icon><ReloadOutlined /></template>
          </a-button>
        </div>
      </a-card>

      <a-card :bordered="false" class="hero-card">
        <div class="sec-title">
          <span class="bar"></span>运营大盘数据与核心漏斗
          <a-popover placement="rightTop" trigger="click">
            <template #content>
              <div class="scope-pop">{{ ov.scope_note || '口径说明加载中…' }}</div>
            </template>
            <a class="scope-link"><QuestionCircleOutlined class="q-icon" /> 数据统计口径</a>
          </a-popover>
        </div>
        <div class="hero-banner">
          <div class="hero-item">
            <div class="hero-label">运营账号数</div>
            <div class="hero-value">{{ fmt(ov.summary?.kos_num) }}</div>
            <div class="hero-sub">门店/代理商: {{ fmt(ov.global?.store_num) }}</div>
          </div>
          <div class="hero-divider"></div>
          <div class="hero-item">
            <div class="hero-label">产出内容数</div>
            <div class="hero-value">{{ fmt(ov.summary?.item_cnt) }}</div>
            <div class="hero-sub">爆文数: {{ fmt(ov.summary?.hit_notes) }}</div>
          </div>
          <div class="hero-divider"></div>
          <div class="hero-item">
            <div class="hero-label">总阅读/播放量</div>
            <div class="hero-value primary">{{ fmt(ov.summary?.view_sum) }}</div>
            <div class="hero-sub">总互动量: {{ fmt(engageSum) }}</div>
          </div>
          <div class="hero-divider"></div>
          <div class="hero-item">
            <div class="hero-label">总费用消耗(元)</div>
            <div class="hero-value violet">¥{{ fmt(ov.ad?.cost) }}</div>
            <div class="hero-sub">投流消耗: ¥{{ fmt(ov.ad?.cost) }}</div>
          </div>
          <div class="hero-divider"></div>
          <div class="hero-item">
            <div class="hero-label">全部线索/留资数</div>
            <div class="hero-value green">{{ fmt(ov.lead_funnel?.total_leads ?? ov.lead_funnel?.pm_leads) }}</div>
            <div class="hero-sub">转化成本: ¥{{ ov.ad?.leads_cost ?? 0 }}</div>
          </div>
        </div>
      </a-card>

      <a-card size="small" :bordered="false">
        <a-tabs v-model:activeKey="blockTab" size="small">
          <a-tab-pane key="publish">
            <template #tab><span class="tab-ic"><EditOutlined /></span>内容发布&互动</template>
            <div class="metric-blocks">
              <div v-for="m in publishBlocks" :key="m.label" class="mblock">
                <div class="mb-label">
                  <a-tooltip v-if="m.tip" :title="m.tip"><span class="mb-label-tip">{{ m.label }}</span></a-tooltip>
                  <template v-else>{{ m.label }}</template>
                </div>
                <div class="mb-value">{{ typeof m.value === 'number' ? fmt(m.value) : m.value }}</div>
                <div v-if="m.d" class="mb-delta" :class="m.d.up ? 'up' : 'down'">
                  {{ m.d.up ? '↑' : '↓' }}{{ Math.abs(m.d.pct) }}%
                </div>
              </div>
            </div>
          </a-tab-pane>
          <a-tab-pane key="lead">
            <template #tab><span class="tab-ic"><SendOutlined /></span>线索转化</template>
            <div class="metric-blocks">
              <div v-for="m in leadBlocks" :key="m.label" class="mblock">
                <div class="mb-label">
                  <a-tooltip v-if="m.tip" :title="m.tip"><span class="mb-label-tip">{{ m.label }}</span></a-tooltip>
                  <template v-else>{{ m.label }}</template>
                </div>
                <div class="mb-value">{{ typeof m.value === 'number' ? fmt(m.value) : m.value }}</div>
                <div v-if="m.d" class="mb-delta" :class="m.d.up ? 'up' : 'down'">
                  {{ m.d.up ? '↑' : '↓' }}{{ Math.abs(m.d.pct) }}%
                </div>
              </div>
            </div>
          </a-tab-pane>
          <a-tab-pane key="ad">
            <template #tab><span class="tab-ic"><FundOutlined /></span>投放效率</template>
            <div class="metric-blocks">
              <div v-for="m in adBlocks" :key="m.label" class="mblock">
                <div class="mb-label">{{ m.label }}</div>
                <div class="mb-value">{{ typeof m.value === 'number' ? fmt(m.value) : m.value }}</div>
                <div v-if="m.d" class="mb-delta" :class="m.d.up ? 'up' : 'down'">
                  {{ m.d.up ? '↑' : '↓' }}{{ Math.abs(m.d.pct) }}%
                </div>
              </div>
            </div>
          </a-tab-pane>
        </a-tabs>
      </a-card>

      <a-row :gutter="12">
        <a-col :span="12">
          <a-card size="small" :bordered="false">
            <div class="rank-head">
              <div class="rank-tabs"><span class="bar"></span><b>运营趋势</b></div>
              <a-radio-group v-model:value="opsMetric" size="small" @change="renderOpsChart">
                <a-radio-button v-for="m in OPS_PILLS" :key="m.key" :value="m.key">{{ m.label }}</a-radio-button>
              </a-radio-group>
            </div>
            <div ref="opsChartEl" style="height: 300px" />
          </a-card>
        </a-col>
        <a-col :span="12">
          <a-card size="small" :bordered="false">
            <div class="rank-head">
              <div class="rank-tabs"><span class="bar"></span><b>投放趋势</b></div>
              <a-radio-group v-model:value="adMetric" size="small" @change="renderAdChart">
                <a-radio-button v-for="m in AD_PILLS" :key="m.key" :value="m.key">{{ m.label }}</a-radio-button>
              </a-radio-group>
            </div>
            <div ref="adChartEl" style="height: 300px" />
          </a-card>
        </a-col>
      </a-row>

      <a-row :gutter="12" align="stretch" class="bottom-row">
        <a-col :span="14">
          <a-card size="small" class="fill-card">
            <div class="rank-head">
              <div class="rank-tabs">
                <span class="bar"></span><b>账号排行</b>
                <a-radio-group v-model:value="rankMetric" size="small" @change="loadRank">
                  <a-radio-button v-for="m in RANK_METRICS" :key="m.key" :value="m.key">{{ m.label }}</a-radio-button>
                </a-radio-group>
              </div>
              <div class="rank-filters">
                <a class="rank-more" @click="goAccount">查看全部</a>
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
        <a-col :span="10">
          <a-card size="small" class="fill-card">
            <div class="rank-head">
              <div class="rank-tabs">
                <span class="bar"></span><b>热门内容</b>
                <a class="rank-more" @click="goHot">更多</a>
              </div>
            </div>
            <div class="hot-list">
              <div v-for="n in hotList" :key="n.id" class="hot-row" @click="openNote(n)">
                <div class="hot-thumb">
                  <img
                    v-if="n.cover_url"
                    :src="n.cover_url"
                    loading="lazy"
                    referrerpolicy="no-referrer"
                    @error="onCoverErr(n)"
                  />
                  <span v-else class="hot-cover-ph">暂无封面</span>
                </div>
                <div class="hot-main">
                  <div class="hot-title" :title="n.title">{{ n.title }}</div>
                  <div class="hot-meta">@{{ n.author_name }} · {{ fmtTime(n.publish_time) }} · 来自:小红书</div>
                </div>
                <div class="hot-heat">🔥 {{ fmt(n.views) }}</div>
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
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { message } from 'ant-design-vue';
import { Empty } from 'ant-design-vue';
import dayjs from 'dayjs';
import * as echarts from 'echarts';
import { useRouter } from 'vue-router';
import { QuestionCircleOutlined, EditOutlined, SendOutlined, FundOutlined, ReloadOutlined } from '@ant-design/icons-vue';
import PageWrapper from '../../../components/PageWrapper.vue';
import {
  getKoxAccountRanking,
  getKoxNotes,
  getMddOverview,
} from '../../../api/kox';
import { useAuthStore } from '../../../stores/auth';

const auth = useAuthStore();
const router = useRouter();

const CROWNS = ['👑', '🥈', '🥉'];
const RANK_METRICS = [
  // Morgandada 2026-10-23：留资数→私信线索（=商业+自然，线索分析合计，三数合一）
  { key: 'pm_leads_total', label: '私信线索', field: 'pm_leads_total' },
  { key: 'exposure_sum', label: '曝光数', field: 'exposure_sum' },
  { key: 'view_sum', label: '阅读数', field: 'view_sum' },
  { key: 'interaction_sum', label: '互动数', field: 'interaction_sum' },
  { key: 'ces', label: 'CES', field: 'ces' },
  { key: 'item_cnt', label: '内容发布数', field: 'item_cnt' },
];
const OPS_PILLS = [
  { key: 'item_cnt', label: '内容数' },
  { key: 'lead_leads', label: '私信线索' },
  { key: 'lead_enter', label: '私信进线' },
];
const AD_PILLS = [
  { key: 'ad_cost', label: '消耗' },
  { key: 'lead_leads', label: '私信线索' },
  { key: 'lead_enter', label: '进线数' },
];

const quick = ref('30');
const range = ref([dayjs().subtract(29, 'day'), dayjs()]);
const caliber = ref('total');
const accountTag = ref([]);
const tagOptions = ref([]);
const blockTab = ref('publish');
const rankMetric = ref('pm_leads_total');
const opsMetric = ref('item_cnt');
const adMetric = ref('ad_cost');

const ov = ref({});
const rankList = ref([]);
const hotList = ref([]);
const loading = ref(false);

// 点击率 = 阅读/曝光
const ctrPct = computed(() => {
  const s = ov.value?.summary ?? {};
  if (s.ctr != null) return Number(s.ctr);
  const exp = Number(s.exposure_sum ?? 0);
  const view = Number(s.view_sum ?? 0);
  if (!exp) return 0;
  return Math.round((view / exp) * 10000) / 100;
});

let opsChart = null;
let adChart = null;
const opsChartEl = ref(null);
const adChartEl = ref(null);

const fmt = (n) => (n ?? 0).toLocaleString();
const fmtTime = (t) => (t ? dayjs(t).format('YYYY-MM-DD HH:mm') : '-');
const rankField = computed(
  () => RANK_METRICS.find((m) => m.key === rankMetric.value)?.field ?? 'pm_leads_total',
);
const rankValue = (r) => r[rankField.value];

/** 环比：上一等长周期对比；prev 缺失/为 0 时返回 null（不显示） */
function delta(cur, prev) {
  const c = Number(cur ?? 0);
  const p = Number(prev ?? 0);
  if (!p) return null;
  return { pct: Math.round(((c - p) / p) * 1000) / 10, up: c >= p };
}

// 总互动量（含涨粉口径，2026-10-22 客户确认）：= 赞+藏+评+享+涨粉，与星火笔记分析「互动量」一致
const engageSum = computed(
  () => Number(ov.value?.summary?.interaction_sum ?? 0) + Number(ov.value?.summary?.follow_sum ?? 0),
);

const publishBlocks = computed(() => {
  const s = ov.value?.summary ?? {};
  const pv = ov.value?.prev?.summary ?? {};
  const pvOrg = ov.value?.prev?.organic ?? {};
  const d = (label, cur, prev) => ({ label, value: cur ?? 0, d: delta(cur, prev) });
  const showOrganic = ov.value?.caliber ? ov.value.caliber === 'total' : caliber.value === 'total';
  const organic = [
    { label: '自然曝光', tip: '自然曝光 = 星火笔记明细分析「自然曝光量」列求和（媒体级拆分，含投流笔记的自然流量部分）', value: s.organic_exposure, d: delta(s.organic_exposure, pvOrg.exposure) },
    { label: '自然点击（阅读）', tip: '自然点击（阅读）= 星火笔记明细分析「自然阅读量」列求和（媒体级拆分）', value: s.organic_view, d: delta(s.organic_view, pvOrg.view) },
    { label: '自然互动', tip: '自然互动 = 总互动量（赞+藏+评+享+涨粉）− 星火笔记明细分析「竞价推广互动量」列（视图无自然互动列，MDD 推广均为竞价）', value: s.organic_interaction, d: delta(s.organic_interaction, pvOrg.interaction) },
  ];
  return [
    { label: '门店数', value: s.store_num ?? 0 },
    { label: 'KOS 账号数', value: s.kos_num ?? 0 },
    d('内容发布数', s.item_cnt, pv.item_cnt),
    { label: '账均发布', value: s.avg_publish ?? 0, d: delta(s.avg_publish, pv.avg_publish) },
    { label: '总曝光', tip: '员工笔记曝光求和（笔记明细分析快照，含投流笔记）', value: s.exposure_sum ?? 0, d: delta(s.exposure_sum, pv.exposure_sum) },
    d('新增粉丝数', s.follow_sum, pv.follow_sum),
    d('总阅读量', s.view_sum, pv.view_sum),
    {
      label: '总互动量',
      tip: '总互动量 = 赞+藏+评+享+涨粉（与星火笔记分析·互动量口径一致，2026-10-22 客户确认）',
      value: Number(s.interaction_sum ?? 0) + Number(s.follow_sum ?? 0),
      d: delta(Number(s.interaction_sum ?? 0) + Number(s.follow_sum ?? 0), Number(pv.interaction_sum ?? 0) + Number(pv.follow_sum ?? 0)),
    },
    ...(showOrganic ? organic : []),
    { label: '互动率', tip: '互动率 = 四项互动（赞+藏+评+享）÷ 总阅读量', value: `${s.interaction_rate ?? 0}%` },
  ];
});

const leadBlocks = computed(() => {
  const f = ov.value?.lead_funnel ?? {};
  const pv = ov.value?.prev?.lead_funnel ?? {};
  return [
    { label: '私信进线', tip: '线索管理→线索分析·获客工具统计「私信进线人数」窗口逐日求和（总口径，含商流+自然流）', value: f.pm_inquiries ?? 0, d: delta(f.pm_inquiries, pv.pm_inquiries) },
    { label: '私信开口', tip: '获客工具统计「私信开口人数」窗口逐日求和（总口径）；自然流口径=总数−聚光日报私信开口', value: f.pm_openings ?? 0, d: delta(f.pm_openings, pv.pm_openings) },
    // Morgandada 2026-10-23 三数合一：私信留资/总留资→私信线索（=商业+自然，线索分析新增线索合计）
    { label: '私信线索', tip: '私信线索=商业线索+自然线索=线索管理→线索分析「新增线索」窗口求和（原私信留资/总留资合并，2026-10-23 客户拍板）', value: f.pm_leads ?? 0, d: delta(f.pm_leads, pv.pm_leads) },
    { label: '开口率', value: f.open_rate != null ? `${f.open_rate}%` : '—' },
    { label: '留资率', value: `${f.lead_rate ?? 0}%` },
  ];
});

const adBlocks = computed(() => {
  const a = ov.value?.ad ?? {};
  const pv = ov.value?.prev?.ad ?? {};
  const f = ov.value?.lead_funnel ?? {};
  const pf = ov.value?.prev?.lead_funnel ?? {};
  const d = (label, cur, prev) => ({ label, value: cur ?? 0, d: delta(cur, prev) });
  const ctr = a.impression ? Math.round(((a.click ?? 0) / a.impression) * 10000) / 100 : 0;
  const cpm = a.impression ? Math.round(((a.cost ?? 0) / a.impression) * 100000) / 100 : 0;
  const cpc = a.click ? Math.round(((a.cost ?? 0) / a.click) * 100) / 100 : 0;
  // 投流私信线索=线索分析「新增广告线索」（2026-10-23 客户指正须与 hero 全部线索/转化成本同源，
  // 不再用聚光日报 msgLeadsNum；汇总口径取广告部分 pm_leads_ad，自然流口径无投放归 0）
  const adLeads =
    caliber.value === 'juguang' ? f.pm_leads ?? 0 : caliber.value === 'total' ? f.pm_leads_ad ?? 0 : 0;
  const adLeadsPrev =
    caliber.value === 'juguang' ? pf.pm_leads ?? 0 : caliber.value === 'total' ? pf.pm_leads_ad ?? 0 : 0;
  return [
    d('投放消耗(元)', a.cost, pv.cost),
    d('曝光量', a.impression, pv.impression),
    d('点击量', a.click, pv.click),
    d('投流私信线索', adLeads, adLeadsPrev),
    { label: 'CTR', value: `${ctr}%` },
    { label: 'CPM', value: `¥${cpm}` },
    { label: 'CPC', value: `¥${cpc}` },
    { label: '私信线索成本', value: `¥${a.leads_cost ?? 0}` },
  ];
});

function dateParams() {
  const p = { brandId: auth.currentBrandId ?? undefined, caliber: caliber.value };
  if (range.value?.[0]) {
    p.start = range.value[0].format('YYYY-MM-DD');
    p.end = range.value[1].format('YYYY-MM-DD');
  }
  if (accountTag.value.length) p.accountTag = accountTag.value.join(',');
  return p;
}

async function loadFacets() {
  try {
    const res = await getMddOverview({ brandId: auth.currentBrandId ?? 5 });
    tagOptions.value = (res.tag_facets ?? []).map((t) => ({ label: t, value: t }));
  } catch {
    /* 筛选项加载失败不阻塞主数据 */
  }
}

async function reload() {
  loading.value = true;
  try {
    ov.value = await getMddOverview(dateParams());
    await Promise.all([loadRank(), loadHot()]);
    await nextTick();
    renderOpsChart();
    renderAdChart();
  } catch (e) {
    message.error(e.message || '加载总览失败');
  } finally {
    loading.value = false;
  }
}

async function loadRank() {
  try {
    const params = { ...dateParams(), metric: rankMetric.value, page_size: 20 };
    const res = await getKoxAccountRanking(params);
    rankList.value = res.list ?? [];
  } catch {
    rankList.value = [];
  }
}

async function loadHot() {
  try {
    const res = await getKoxNotes({ ...dateParams(), metric: 'views', page_size: 20 });
    hotList.value = (res.list ?? []).slice(0, 20);
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
  const cfg = OPS_PILLS.find((m) => m.key === opsMetric.value) ?? OPS_PILLS[0];
  const data = trend.map((t) => t[cfg.key] ?? 0);
  opsChart.setOption(
    {
      tooltip: { trigger: 'axis' },
      grid: { left: 56, right: 30, top: 30, bottom: 28 },
      xAxis: { type: 'category', data: trend.map((t) => t.date.slice(5)) },
      yAxis: { type: 'value', name: cfg.label },
      series: [
        {
          name: cfg.label,
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          itemStyle: { color: '#3456E6' },
          areaStyle: { color: 'rgba(52,86,230,0.10)' },
          label: { show: true, position: 'top', fontSize: 10, color: '#64748b' },
          labelLayout: { hideOverlap: true },
          data,
        },
      ],
    },
    { notMerge: true },
  );
}

function renderAdChart() {
  if (!adChartEl.value) return;
  if (!adChart) adChart = echarts.init(adChartEl.value);
  const trend = ov.value.trend ?? [];
  const cfg = AD_PILLS.find((m) => m.key === adMetric.value) ?? AD_PILLS[0];
  const isCost = cfg.key === 'ad_cost';
  const data = trend.map((t) => (isCost ? Math.round((t[cfg.key] ?? 0) * 100) / 100 : t[cfg.key] ?? 0));
  adChart.setOption(
    {
      tooltip: { trigger: 'axis' },
      grid: { left: 56, right: 30, top: 30, bottom: 28 },
      xAxis: { type: 'category', data: trend.map((t) => t.date.slice(5)) },
      yAxis: { type: 'value', name: cfg.label },
      series: [
        {
          name: cfg.label,
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          itemStyle: { color: isCost ? '#d97706' : '#16a34a' },
          areaStyle: { color: isCost ? 'rgba(217,119,6,0.10)' : 'rgba(22,163,74,0.10)' },
          label: { show: true, position: 'top', fontSize: 10, color: '#64748b' },
          labelLayout: { hideOverlap: true },
          data,
        },
      ],
    },
    { notMerge: true },
  );
}

watch(opsMetric, () => nextTick(renderOpsChart));
watch(adMetric, () => nextTick(renderAdChart));

function openNote(n) {
  if (n.note_url) window.open(n.note_url, '_blank');
  else message.info('该笔记无链接');
}

// 封面加载失败先重试一次（xhs CDN 偶发超时），仍失败再落占位
function onCoverErr(n) {
  if (!n._coverRetried) {
    n._coverRetried = true;
    n.cover_url = `${n.cover_url}${n.cover_url.includes('?') ? '&' : '?'}t=${Date.now()}`;
  } else {
    n.cover_url = null;
  }
}

function goAccount() {
  const q = new URLSearchParams();
  q.set('start', range.value?.[0]?.format('YYYY-MM-DD') ?? '');
  q.set('end', range.value?.[1]?.format('YYYY-MM-DD') ?? '');
  router.push(`/kox_df/operation-analysis/author-ranking?${q.toString()}`);
}

function goHot() {
  router.push('/kox_df/operation-analysis/note-ranking');
}


function onResize() {
  opsChart?.resize();
  adChart?.resize();
}

let chartObserver = null;
function observeCharts() {
  if (chartObserver || typeof ResizeObserver === 'undefined') return;
  chartObserver = new ResizeObserver(() => onResize());
  for (const el of [opsChartEl.value, adChartEl.value]) {
    if (el) chartObserver.observe(el);
  }
}

onMounted(() => {
  loadFacets();
  reload();
  window.addEventListener('resize', onResize);
  observeCharts();
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
  chartObserver?.disconnect();
  chartObserver = null;
  opsChart?.dispose();
  adChart?.dispose();
});
</script>

<style scoped>
.mdd-ov {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sec-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sec-head .bar,
.sec-title .bar,
.rank-head .bar {
  width: 4px;
  height: 14px;
  border-radius: 2px;
  background: #3456e6;
  display: inline-block;
}

.sec-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 600;
  margin-bottom: 14px;
}

.q-icon {
  color: #94a3b8;
  font-size: 13px;
}

.scope-link {
  font-size: 12px;
  font-weight: 400;
  color: #2563eb;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.scope-pop {
  max-width: 420px;
  font-size: 12px;
  color: #475569;
  line-height: 1.8;
}

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

.hero-card {
  margin-bottom: 0;
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

.hero-value.violet {
  color: #7c3aed;
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

.tab-ic {
  margin-right: 4px;
}

/* 三 Tab 指标块（白块网格，带环比） */
.metric-blocks {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}

.mblock {
  background: #f8fafc;
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.mb-label {
  font-size: 12px;
  color: var(--color-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mb-label-tip {
  cursor: help;
  border-bottom: 1px dashed #cbd5e1;
}

.mb-value {
  font-size: 20px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: #1e293b;
}

.mb-delta {
  font-size: 12px;
  font-weight: 600;
}

.mb-delta.up {
  color: #16a34a;
}

.mb-delta.down {
  color: #ea580c;
}







.rank-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  min-height: 24px;
}

.rank-tabs {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.rank-more {
  font-size: 12px;
}

.rank-filters {
  display: flex;
  align-items: center;
  gap: 8px;
}

.rank-list {
  display: flex;
  flex-direction: column;
  max-height: 640px;
  overflow-y: auto;
}

.rank-row {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 40px;
  padding: 0 8px;
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

.hot-list {
  display: flex;
  flex-direction: column;
  max-height: 640px;
  overflow-y: auto;
}

.hot-row {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 64px;
  padding: 8px 6px;
  border-radius: 8px;
  cursor: pointer;
}

.hot-row:nth-child(odd) {
  background: #f8fafc;
}

.hot-row:hover {
  background: #eef2ff;
}

.hot-thumb {
  width: 36px;
  height: 48px;
  border-radius: 6px;
  overflow: hidden;
  background: #f1f5f9;
  flex-shrink: 0;
}

.hot-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.hot-cover-ph {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 9px;
  color: #94a3b8;
  writing-mode: vertical-rl;
  letter-spacing: 2px;
}

.hot-main {
  flex: 1;
  min-width: 0;
}

.hot-title {
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hot-meta {
  font-size: 12px;
  color: #94a3b8;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-top: 2px;
}

.hot-heat {
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 700;
  color: #f97316;
  font-variant-numeric: tabular-nums;
}

.bottom-row :deep(.ant-col) {
  display: flex;
}

.fill-card {
  width: 100%;
  display: flex;
  flex-direction: column;
}

.fill-card :deep(.ant-card-body) {
  flex: 1;
}

@media (max-width: 991px) {
  .metric-blocks {
    grid-template-columns: repeat(2, 1fr);
  }

  .hero-banner {
    flex-wrap: wrap;
    gap: 10px 0;
  }

  .hero-item {
    flex: 1 1 50%;
  }
}
</style>
