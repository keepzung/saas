<template>
  <PageWrapper title="代理商总览" subtitle="KOS 账号留资分层 · 代理商综合排行">
    <template #extra>
      <a-radio-group v-model:value="quick" size="small" @change="onQuickChange">
        <a-radio-button value="7">近7天</a-radio-button>
        <a-radio-button value="30">近30天</a-radio-button>
      </a-radio-group>
      <a-range-picker v-model:value="range" size="small" @change="reload" />
      <a-select
        v-model:value="tag"
        size="small"
        style="width: 140px"
        allow-clear
        placeholder="账号标签"
        :options="tagOptions"
        @change="reload"
      />
      <a-button size="small" type="primary" @click="exportDetail">导出数据</a-button>
    </template>

    <NoticeBar>
      分层规则（周度留资）：S级头部 ≥50 ｜ 头部 ≥25 ｜ 高潜 12.5–25 ｜ 腰部 6.25–12.5 ｜ 尾部 <6；长周期按天数折算周度。留资=笔记私信留资（含投流笔记）。内容完成度=周度 ≥3 篇。
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
        <div class="sec-head"><span class="bar"></span>代理商综合排行</div>
      </template>
      <a-table
        :columns="columns"
        :data-source="storeRows"
        :loading="loading"
        :pagination="{ pageSize: 20, showSizeChanger: true }"
        :scroll="{ x: 1360 }"
        size="small"
        row-key="store"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'rank'">
            <span :class="['rank-badge', index < 3 ? `top${index + 1}` : '']">
              {{ index < 3 ? CROWNS[index] : index + 1 }}
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
import { getKoxAccountRanking, getKoxAccounts } from '../../api/kox';
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
const loading = ref(false);
const accounts = ref([]);
const days = ref(7);
const tierEl = ref(null);
let tierChart = null;

const fmt = (v) => Number(v ?? 0).toLocaleString();

function dateParams() {
  const p = { brandId: auth.currentBrandId ?? undefined, page_size: 200 };
  if (range.value?.[0]) {
    p.start = range.value[0].format('YYYY-MM-DD');
    p.end = range.value[1].format('YYYY-MM-DD');
  }
  if (tag.value) p.tag = tag.value;
  return p;
}

function tierOf(weeklyLeads) {
  for (const t of TIERS) {
    if (weeklyLeads >= t.min) return t;
  }
  return TIERS[TIERS.length - 1];
}

const storeRows = computed(() => {
  const map = new Map();
  for (const a of accounts.value) {
    const key = a.store_name || '未知门店';
    let g = map.get(key);
    if (!g) {
      g = {
        store: key,
        region: a.region_name ?? '-',
        account_num: 0,
        item_cnt: 0,
        exposure_sum: 0,
        pm_inquiries: 0,
        pm_openings: 0,
        pm_leads: 0,
        contentPctSum: 0,
      };
      map.set(key, g);
    }
    g.account_num += 1;
    g.item_cnt += a.item_cnt ?? 0;
    g.exposure_sum += a.exposure_sum ?? 0;
    g.pm_inquiries += a.pm_inquiries ?? 0;
    g.pm_openings += a.pm_openings ?? 0;
    g.pm_leads += a.pm_leads ?? 0;
    const weeklyTarget = (3 * days.value) / 7;
    const pct = weeklyTarget > 0 ? Math.min(100, Math.round(((a.item_cnt ?? 0) / weeklyTarget) * 100)) : 0;
    g.contentPctSum += pct;
  }
  const list = [...map.values()];
  const maxLeads = Math.max(1, ...list.map((g) => g.pm_leads));
  return list
    .map((g) => {
      const weeklyLeads = g.pm_leads / (days.value / 7);
      const tier = tierOf(weeklyLeads);
      const content_pct = g.account_num ? Math.round(g.contentPctSum / g.account_num) : 0;
      const leads_pct = Math.round((g.pm_leads / maxLeads) * 100);
      return {
        ...g,
        content_pct,
        tier_key: tier.key,
        tier_label: tier.label,
        tier_color: tier.color,
        score: Math.min(100, Math.round(content_pct * 0.4 + leads_pct * 0.6)),
      };
    })
    .sort((a, b) => b.pm_leads - a.pm_leads || b.item_cnt - a.item_cnt);
});

const stat = computed(() => {
  const list = accounts.value;
  const contentOkTarget = (3 * days.value) / 7;
  return {
    accounts: list.length,
    items: list.reduce((s, a) => s + (a.item_cnt ?? 0), 0),
    inquiries: list.reduce((s, a) => s + (a.pm_inquiries ?? 0), 0),
    openings: list.reduce((s, a) => s + (a.pm_openings ?? 0), 0),
    leads: list.reduce((s, a) => s + (a.pm_leads ?? 0), 0),
    contentOk: list.filter((a) => (a.item_cnt ?? 0) >= contentOkTarget).length,
  };
});

const columns = [
  { key: 'rank', title: '排名', width: 64 },
  { key: 'store', title: '代理商', dataIndex: 'store', width: 200, ellipsis: true },
  { title: '区域', dataIndex: 'region', width: 100 },
  { key: 'tier', title: '分层', dataIndex: 'tier_label', width: 96 },
  { title: '账号数', dataIndex: 'account_num', width: 80, sorter: (a, b) => a.account_num - b.account_num },
  { title: '发布数', dataIndex: 'item_cnt', width: 84, sorter: (a, b) => a.item_cnt - b.item_cnt },
  { key: 'content', title: '内容完成度（周度≥3篇）', width: 190, sorter: (a, b) => a.content_pct - b.content_pct },
  { title: '曝光量', dataIndex: 'exposure_sum', width: 104, sorter: (a, b) => a.exposure_sum - b.exposure_sum },
  { title: '留资数', dataIndex: 'pm_leads', width: 84, sorter: (a, b) => a.pm_leads - b.pm_leads },
  { title: '进线数', dataIndex: 'pm_inquiries', width: 84, sorter: (a, b) => a.pm_inquiries - b.pm_inquiries },
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
    const res = await getKoxAccountRanking(dateParams());
    accounts.value = res.list ?? [];
    await nextTick();
    renderTierChart();
  } catch (e) {
    message.error(e.message || '加载留资分层失败');
  } finally {
    loading.value = false;
  }
}

async function loadFacets() {
  try {
    const res = await getKoxAccounts({ brandId: auth.currentBrandId, page_size: 1 });
    tagOptions.value = (res.tag_facets ?? []).map((t) => ({ label: t, value: t }));
  } catch {
    /* 忽略 */
  }
}

function renderTierChart() {
  if (!tierEl.value) return;
  if (!tierChart) tierChart = echarts.init(tierEl.value);
  const counts = TIERS.map((t) => storeRows.value.filter((r) => r.tier_key === t.key).length);
  tierChart.setOption(
    {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v) => `${v} 家` },
      grid: { left: 80, right: 60, top: 10, bottom: 24 },
      xAxis: { type: 'value', max: 'dataMax' },
      yAxis: {
        type: 'category',
        inverse: true,
        data: TIERS.map((t) => `${t.label}代理商`),
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
            formatter: (p) => `${p.value} 家`,
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
  const rows = storeRows.value.map((r, i) => ({
    排名: i + 1,
    代理商: r.store,
    区域: r.region,
    分层: r.tier_label,
    账号数: r.account_num,
    发布数: r.item_cnt,
    '内容完成度(%)': r.content_pct,
    曝光量: r.exposure_sum,
    留资数: r.pm_leads,
    进线数: r.pm_inquiries,
    开口数: r.pm_openings,
    综合得分: r.score,
  }));
  exportExcel([{ name: 'KOS账号留资分层', rows }], 'KOS账号留资分层');
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

.prog-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.prog {
  flex: 1;
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
