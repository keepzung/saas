<template>
  <PageWrapper title="KOS 运营进度总览" subtitle="KOS 账号留资分层 · 按账号拆分">
    <template #extra>
      <a-radio-group v-model:value="quick" size="small" @change="onQuickChange">
        <a-radio-button value="7">近7天</a-radio-button>
        <a-radio-button value="30">近30天</a-radio-button>
      </a-radio-group>
      <a-range-picker v-model:value="range" size="small" @change="reload" />
    </template>

    <NoticeBar>
      分层规则（周度留资）：S级头部 ≥50 ｜ 头部 ≥25 ｜ 高潜 12.5–25 ｜ 腰部 6.25–12.5 ｜ 尾部 &lt;6；长周期按天数折算周度。内容完成度=周度 ≥3 篇；进线完成度=周度 ≥5 条。数据来自专业号员工矩阵（按账号拆分）。
    </NoticeBar>

    <a-row :gutter="12">
      <a-col :span="15">
        <a-card size="small" title="账号留资分层分布">
          <div ref="tierEl" style="height: 240px" />
        </a-card>
      </a-col>
      <a-col :span="9">
        <a-card size="small" title="汇总">
          <div class="stat-grid">
            <div class="stat"><span>KOS 账号</span><b>{{ fmt(stat.accounts) }}</b></div>
            <div class="stat"><span>内容发布数</span><b>{{ fmt(stat.items) }}</b></div>
            <div class="stat"><span>私信进线</span><b class="c-primary">{{ fmt(stat.inquiries) }}</b></div>
            <div class="stat"><span>私信开口</span><b class="c-violet">{{ fmt(stat.openings) }}</b></div>
            <div class="stat"><span>私信留资</span><b class="c-green">{{ fmt(stat.leads) }}</b></div>
            <div class="stat"><span>内容达标账号</span><b>{{ fmt(stat.contentOk) }}</b></div>
          </div>
        </a-card>
      </a-col>
    </a-row>

    <a-card size="small" :bordered="false">
      <template #title>
        <div class="rank-toolbar">
          <div class="sec-head"><span class="bar"></span>KOS 账号进度排行</div>
          <div class="toolbar-right">
            <span class="tb-label">账号标签：</span>
            <a-select
              v-model:value="tag"
              size="small"
              style="width: 130px"
              allow-clear
              placeholder="全部"
              :options="tagOptions"
              @change="reload"
            />
            <span class="tb-label">区域：</span>
            <a-select
              v-model:value="regionFilter"
              size="small"
              style="width: 120px"
              allow-clear
              placeholder="全部"
              :options="regionOptions"
              @change="reload"
            />
            <a-input-search
              v-model:value="keyword"
              size="small"
              style="width: 170px"
              placeholder="账号/门店搜索"
              allow-clear
              @search="reload"
            />
            <a-button size="small" type="primary" @click="exportDetail">导出数据</a-button>
          </div>
        </div>
      </template>
      <a-table
        :columns="columns"
        :data-source="rows"
        :loading="loading"
        :pagination="{ pageSize: 20, showSizeChanger: true }"
        :scroll="{ x: 1760 }"
        size="small"
        row-key="user_id"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'rank'">
            <span :class="['rank-badge', index < 3 ? `top${index + 1}` : '']">
              {{ index < 3 ? CROWNS[index] : index + 1 }}
            </span>
          </template>
          <template v-else-if="column.key === 'nickname'">
            <span class="acc-cell">
              <a-avatar v-if="record.avatar" :src="record.avatar" :size="28" class="acc-avatar" />
              <a-avatar v-else :size="28" class="acc-avatar acc-avatar-ph">{{ (record.nickname || '#').slice(0, 1) }}</a-avatar>
              <span class="acc-name" :title="record.real_name ? `${record.nickname}（${record.real_name}）` : record.nickname">{{ record.nickname }}</span>
            </span>
          </template>
          <template v-else-if="column.key === 'tier'">
            <span class="tier-tag" :style="{ background: record.tier_color }">{{ record.tier_label }}</span>
          </template>
          <template v-else-if="column.key === 'content'">
            <div class="prog-cell">
              <div class="prog"><div class="prog-inner" :style="{ width: `${record.content_pct}%`, background: progColor(record.content_pct) }"></div></div>
              <span class="prog-num">{{ record.content_pct }}%</span>
            </div>
          </template>
          <template v-else-if="column.key === 'ctr'">
            {{ record.ctr }}%
          </template>
          <template v-else-if="column.key === 'enter'">
            <div class="prog-cell">
              <span class="enter-num">{{ record.pm_inquiries }}</span>
              <div class="prog"><div class="prog-inner" :style="{ width: `${record.enter_pct}%`, background: progColor(record.enter_pct) }"></div></div>
              <span class="prog-num">{{ record.enter_pct }}%</span>
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
import * as echarts from 'echarts';
import dayjs from 'dayjs';
import PageWrapper from '../../components/PageWrapper.vue';
import NoticeBar from '../../components/NoticeBar.vue';
import { getKoxAccounts, getKoxProStaffProgress } from '../../api/kox';
import { useAuthStore } from '../../stores/auth';
import { exportExcel } from '../../utils/excel';

const auth = useAuthStore();
const CROWNS = ['👑', '🥈', '🥉'];
const TIERS = [
  { key: 's_head', label: 'S级头部', min: 50, color: '#dc2626' },
  { key: 'head', label: '头部', min: 25, color: '#f97316' },
  { key: 'potential', label: '高潜', min: 12.5, color: '#d97706' },
  { key: 'waist', label: '腰部', min: 6.25, color: '#3456E6' },
  { key: 'tail', label: '尾部', min: 0, color: '#94a3b8' },
];

const quick = ref('7');
const range = ref([dayjs().subtract(6, 'day'), dayjs()]);
const tag = ref(undefined);
const tagOptions = ref([]);
const regionFilter = ref(undefined);
const regionOptions = ref([]);
const keyword = ref('');
const loading = ref(false);
const rows = ref([]);
const days = ref(7);
const tierEl = ref(null);
let tierChart = null;

const fmt = (v) => Number(v ?? 0).toLocaleString();

function dateParams() {
  const p = { brandId: auth.currentBrandId ?? undefined };
  if (range.value?.[0]) {
    p.start = range.value[0].format('YYYY-MM-DD');
    p.end = range.value[1].format('YYYY-MM-DD');
  }
  if (tag.value) p.tag = tag.value;
  if (regionFilter.value) p.regionName = regionFilter.value;
  if (keyword.value) p.keyword = keyword.value;
  return p;
}

const stat = computed(() => {
  const list = rows.value;
  const contentOkTarget = (3 * days.value) / 7;
  return {
    accounts: list.length,
    items: list.reduce((s, r) => s + (r.item_cnt ?? 0), 0),
    inquiries: list.reduce((s, r) => s + (r.pm_inquiries ?? 0), 0),
    openings: list.reduce((s, r) => s + (r.pm_openings ?? 0), 0),
    leads: list.reduce((s, r) => s + (r.pm_leads ?? 0), 0),
    contentOk: list.filter((r) => (r.item_cnt ?? 0) >= contentOkTarget).length,
  };
});

const columns = [
  { key: 'rank', title: '排名', width: 64 },
  { title: '代理商', dataIndex: 'store_name', width: 190, ellipsis: true },
  { key: 'nickname', title: 'KOS 账号', dataIndex: 'nickname', width: 200, ellipsis: true },
  { title: '区域', dataIndex: 'region', width: 92 },
  { key: 'tier', title: '分层', dataIndex: 'tier_label', width: 92 },
  { title: '发布数', dataIndex: 'item_cnt', width: 80, sorter: (a, b) => a.item_cnt - b.item_cnt },
  { key: 'content', title: '内容完成度（周度≥3篇）', width: 180, sorter: (a, b) => a.content_pct - b.content_pct },
  { title: '阅读(点击)', dataIndex: 'click_sum', width: 100, sorter: (a, b) => a.click_sum - b.click_sum },
  { key: 'ctr', title: '点击率（阅读/曝光）', dataIndex: 'ctr', width: 130, sorter: (a, b) => a.ctr - b.ctr },
  { title: '互动', dataIndex: 'interaction_sum', width: 84, sorter: (a, b) => a.interaction_sum - b.interaction_sum },
  { title: '曝光量', dataIndex: 'exposure_sum', width: 100, sorter: (a, b) => a.exposure_sum - b.exposure_sum },
  { title: '留资数', dataIndex: 'pm_leads', width: 84, sorter: (a, b) => a.pm_leads - b.pm_leads },
  { key: 'enter', title: '进线数（周度≥5）', dataIndex: 'pm_inquiries', width: 170, sorter: (a, b) => a.pm_inquiries - b.pm_inquiries },
  { title: '开口数', dataIndex: 'pm_openings', width: 84, sorter: (a, b) => a.pm_openings - b.pm_openings },
  { title: '综合得分', dataIndex: 'score', width: 90, sorter: (a, b) => a.score - b.score },
];

async function reload() {
  loading.value = true;
  try {
    if (range.value?.[0]) {
      days.value = Math.max(
        1,
        Math.round((range.value[1].toDate() - range.value[0].toDate()) / 86400000) + 1,
      );
    }
    const res = await getKoxProStaffProgress(dateParams());
    rows.value = res.rows ?? [];
    await nextTick();
    renderTierChart();
  } catch (e) {
    message.error(e.message || '加载 KOS 进度失败');
  } finally {
    loading.value = false;
  }
}

async function loadFacets() {
  try {
    const res = await getKoxAccounts({ brandId: auth.currentBrandId, page_size: 1 });
    tagOptions.value = (res.tag_facets ?? []).map((t) => ({ label: t, value: t }));
    regionOptions.value = (res.region_facets ?? []).map((r) => ({ label: r, value: r }));
  } catch {
    /* 忽略 */
  }
}

function renderTierChart() {
  if (!tierEl.value) return;
  if (!tierChart) tierChart = echarts.init(tierEl.value);
  const counts = TIERS.map((t) => rows.value.filter((r) => r.tier_key === t.key).length);
  tierChart.setOption(
    {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v) => `${v} 人` },
      grid: { left: 80, right: 60, top: 10, bottom: 24 },
      xAxis: { type: 'value', max: 'dataMax' },
      yAxis: {
        type: 'category',
        inverse: true,
        data: TIERS.map((t) => `${t.label}KOS`),
        axisLabel: { color: '#475569' },
      },
      series: [
        {
          type: 'bar',
          data: TIERS.map((t, i) => ({
            value: counts[i],
            itemStyle: { color: t.color, borderRadius: [0, 6, 6, 0] },
          })),
          barWidth: 26,
          label: {
            show: true,
            position: 'right',
            formatter: (p) => `${p.value} 人`,
            color: '#475569',
          },
        },
      ],
    },
    { notMerge: true },
  );
}

function progColor(pct) {
  if (pct >= 85) return '#16a34a';
  if (pct >= 60) return '#3456E6';
  if (pct >= 30) return '#d97706';
  return '#dc2626';
}

function onQuickChange() {
  const d = Number(quick.value);
  range.value = [dayjs().subtract(d - 1, 'day'), dayjs()];
  reload();
}

function exportDetail() {
  const list = rows.value.map((r, i) => ({
    排名: i + 1,
    代理商: r.store_name,
    'KOS账号': r.nickname,
    区域: r.region,
    分层: r.tier_label,
    发布数: r.item_cnt,
    '内容完成度(%)': r.content_pct,
    '阅读(点击)': r.click_sum,
    '点击率(%)': r.ctr,
    互动: r.interaction_sum,
    曝光量: r.exposure_sum,
    留资数: r.pm_leads,
    进线数: r.pm_inquiries,
    '进线完成度(%)': r.enter_pct,
    开口数: r.pm_openings,
    综合得分: r.score,
  }));
  exportExcel([{ name: 'KOS运营进度', rows: list }], 'KOS运营进度总览');
}

function onResize() {
  tierChart?.resize();
}

onMounted(async () => {
  loadFacets();
  reload();
  window.addEventListener('resize', onResize);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
  tierChart?.dispose();
});
</script>

<style scoped>
.sec-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.rank-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tb-label {
  font-size: 13px;
  color: var(--color-text-secondary);
  white-space: nowrap;
}

.sec-head .bar {
  width: 4px;
  height: 14px;
  border-radius: 2px;
  background: #3456e6;
  display: inline-block;
}

.stat-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: #f8fafc;
  border-radius: 8px;
  padding: 10px 12px;
}

.stat span {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.stat b {
  font-size: 20px;
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

.rank-badge {
  font-variant-numeric: tabular-nums;
}

.rank-badge.top1 {
  font-size: 15px;
}

.rank-badge.top2,
.rank-badge.top3 {
  font-size: 13px;
}

.tier-tag {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 10px;
  color: #fff;
  font-size: 12px;
  white-space: nowrap;
}

.acc-cell {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.acc-avatar {
  flex: 0 0 auto;
}

.acc-avatar-ph {
  background: #eef4ff;
  color: #3456e6;
  font-size: 12px;
}

.acc-name {
  color: #1e293b;
}

.prog-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.enter-num {
  min-width: 34px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.prog {
  flex: 1;
  min-width: 48px;
  height: 8px;
  background: #f1f5f9;
  border-radius: 4px;
  overflow: hidden;
}

.prog-inner {
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s;
}

.prog-num {
  width: 42px;
  text-align: right;
  font-size: 12px;
  color: var(--color-text-secondary);
  font-variant-numeric: tabular-nums;
}
</style>
