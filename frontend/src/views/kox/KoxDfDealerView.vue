<template>
  <PageWrapper title="经销商排行" subtitle="代理商能力分层 · 综合排行">
    <template #extra>
      <a-select
        v-model:value="regionName"
        size="small"
        style="width: 130px"
        allow-clear
        placeholder="大区"
        :options="regionOptions"
        @change="reload"
      />
      <a-select
        v-model:value="statMonth"
        size="small"
        style="width: 120px"
        placeholder="考核月份"
        :options="monthOptions"
        @change="reload"
      />
    </template>

    <a-card size="small" :bordered="false">
      <template #title>
        <div class="sec-head">
          <span class="bar"></span>代理商能力分层
          <a-tooltip title="分级标准（月度留资）：头部 ≥25 ｜ 腰部 12.5–25 ｜ 尾部 6.25–12.5 ｜ 沉默 <6（数据源=旧系统导出快照）">
            <question-circle-outlined class="q-icon" />
          </a-tooltip>
        </div>
      </template>
      <div ref="tierEl" class="tier-chart" />
    </a-card>

    <a-card size="small" :bordered="false">
      <div class="funnel3">
        <div class="f3-col">
          <div class="f3-head"><edit-outlined /> 内容运营：图文/视频</div>
          <div class="f3-main"><b>{{ fmt(data.summary?.publish_cnt) }}</b><span>/ {{ fmt(data.summary?.account_cnt * 8) }}</span></div>
          <a-progress :percent="pct(data.summary?.content_pct)" :show-info="false" stroke-color="#3456E6" size="small" />
          <div class="f3-pct">{{ pct(data.summary?.content_pct) }}%</div>
          <div class="f3-grid">
            <div class="f3-kv"><span>曝光量</span><b>{{ fmt(data.summary?.exposure) }}</b></div>
            <div class="f3-kv"><span>篇均曝光</span><b>{{ fmt(data.summary?.avg_exposure_per_note) }}</b></div>
            <div class="f3-kv"><span>互动量</span><b>-</b></div>
            <div class="f3-kv"><span>互动率</span><b>-</b></div>
          </div>
        </div>
        <a-divider type="vertical" style="height: auto" />
        <div class="f3-col">
          <div class="f3-head"><message-outlined /> 线索获取</div>
          <div class="f3-main"><b>{{ fmt(data.summary?.leads) }}</b></div>
          <div class="f3-grid wide">
            <div class="f3-kv"><span>进线数</span><b>{{ fmt(data.summary?.inquiries) }}</b></div>
            <div class="f3-kv"><span>开口数</span><b>{{ fmt(data.summary?.openings) }}</b></div>
            <div class="f3-kv"><span>转化率</span><b>{{ leadRate }}%</b></div>
            <div class="f3-kv"><span>CPL</span><b>-</b></div>
          </div>
        </div>
        <a-divider type="vertical" style="height: auto" />
        <div class="f3-col">
          <div class="f3-head"><shopping-outlined /> 销售转化</div>
          <div class="f3-main"><b>{{ fmt(data.summary?.deals) }}</b></div>
          <div class="f3-grid wide">
            <div class="f3-kv"><span>线索转化率</span><b>0.0%</b></div>
            <div class="f3-kv"><span>投流消耗</span><b>-</b></div>
            <div class="f3-kv"><span>CPS</span><b>-</b></div>
          </div>
        </div>
      </div>
    </a-card>

    <a-card size="small" :bordered="false">
      <template #title>
        <div class="rank-toolbar">
          <div class="sec-head"><span class="bar"></span>代理商综合排行</div>
          <div class="toolbar-right">
            <a-input-search
              v-model:value="keyword"
              size="small"
              style="width: 170px"
              placeholder="代理商/城市搜索"
              allow-clear
              @search="reload"
            />
            <a-button size="small" type="primary" @click="exportDetail">导出数据</a-button>
          </div>
        </div>
      </template>
      <a-table
        :columns="columns"
        :data-source="filteredRows"
        :loading="loading"
        :pagination="{ pageSize: 20, showSizeChanger: true }"
        :scroll="{ x: 1900 }"
        size="small"
        row-key="dealer_name"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'rank'">
            <span :class="['rank-badge', index < 3 ? `top${index + 1}` : '']">
              {{ index < 3 ? CROWNS[index] : index + 1 }}
            </span>
          </template>
          <template v-else-if="column.key === 'tier'">
            <span class="tier-tag" :style="{ background: tierColor(record.tier) }">{{ record.tier }}</span>
          </template>
          <template v-else-if="['content_pct', 'exposure_pct', 'leads_pct', 'deals_pct'].includes(column.key)">
            <div class="prog-cell">
              <div class="prog"><div class="prog-inner" :style="{ width: Math.min(100, record[column.key]) + '%', background: progColor(record[column.key]) }"></div></div>
              <span class="prog-num">{{ record[column.key] }}%</span>
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
import {
  QuestionCircleOutlined,
  EditOutlined,
  MessageOutlined,
  ShoppingOutlined,
} from '@ant-design/icons-vue';
import PageWrapper from '../../components/PageWrapper.vue';
import { getKoxDealerSnapshot } from '../../api/kox';
import { useAuthStore } from '../../stores/auth';
import { exportExcel } from '../../utils/excel';

const auth = useAuthStore();
const CROWNS = ['👑', '🥈', '🥉'];
const TIERS = [
  { label: '头部', color: '#dc2626' },
  { label: '腰部', color: '#f97316' },
  { label: '尾部', color: '#5eead4' },
  { label: '沉默', color: '#cbd5e1' },
];

const regionName = ref(undefined);
const statMonth = ref(undefined);
const keyword = ref('');
const monthOptions = ref([]);
const regionOptions = ref([]);
const loading = ref(false);
const data = ref({ list: [], summary: {}, tier_stat: {} });
const tierEl = ref(null);
let tierChart = null;

const fmt = (n) => (n ?? 0).toLocaleString();
const pct = (v) => Math.min(100, Math.round(Number(v ?? 0)));

function tierColor(tier) {
  return TIERS.find((t) => t.label === tier)?.color ?? '#94a3b8';
}

function progColor(v) {
  if (v >= 85) return '#16a34a';
  if (v >= 60) return '#3456E6';
  if (v >= 30) return '#d97706';
  return '#dc2626';
}

function renderTierChart() {
  if (!tierEl.value) return;
  if (!tierChart) tierChart = echarts.init(tierEl.value);
  const counts = TIERS.map((t) => data.value.tier_stat?.[t.label] ?? 0);
  tierChart.setOption(
    {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v) => `${v} 家` },
      grid: { left: 64, right: 56, top: 12, bottom: 16 },
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

const tierStat = computed(() => data.value.tier_stat ?? {});
const leadRate = computed(() => {
  const s = data.value.summary;
  return s?.inquiries ? Math.round((s.leads / s.inquiries) * 10000) / 100 : 0;
});

const filteredRows = computed(() => {
  let rows = data.value.list ?? [];
  if (regionName.value) rows = rows.filter((r) => r.region_name === regionName.value);
  if (keyword.value.trim()) {
    const kw = keyword.value.trim().toLowerCase();
    rows = rows.filter(
      (r) => r.dealer_name.toLowerCase().includes(kw) || (r.city_name ?? '').toLowerCase().includes(kw),
    );
  }
  return rows;
});

const columns = [
  { key: 'rank', title: '排名', width: 64 },
  { title: '代理商', dataIndex: 'dealer_name', key: 'dealer_name', width: 220, ellipsis: true },
  { title: '区域', dataIndex: 'region_name', width: 100 },
  { title: '城市', dataIndex: 'city_name', width: 90 },
  { key: 'tier', title: '分层', dataIndex: 'tier', width: 84 },
  { title: '账号数', dataIndex: 'account_cnt', width: 80, sorter: (a, b) => a.account_cnt - b.account_cnt },
  { title: '发布数', dataIndex: 'publish_cnt', width: 80, sorter: (a, b) => a.publish_cnt - b.publish_cnt },
  { key: 'content_pct', title: '内容完成度', width: 150, sorter: (a, b) => a.content_pct - b.content_pct },
  { title: '曝光量', dataIndex: 'exposure', width: 100, sorter: (a, b) => a.exposure - b.exposure },
  { key: 'exposure_pct', title: '曝光完成度', width: 150, sorter: (a, b) => a.exposure_pct - b.exposure_pct },
  { title: '进线数', dataIndex: 'inquiries', width: 84, sorter: (a, b) => a.inquiries - b.inquiries },
  { title: '开口数', dataIndex: 'openings', width: 84, sorter: (a, b) => a.openings - b.openings },
  { title: '留资数', dataIndex: 'leads', width: 84, sorter: (a, b) => a.leads - b.leads },
  { key: 'leads_pct', title: '留资完成度', width: 150, sorter: (a, b) => a.leads_pct - b.leads_pct },
  { title: '成交数', dataIndex: 'deals', width: 80, sorter: (a, b) => a.deals - b.deals },
  { key: 'deals_pct', title: '成交完成度', width: 150, sorter: (a, b) => a.deals_pct - b.deals_pct },
  { title: '综合得分', dataIndex: 'score', width: 90, sorter: (a, b) => a.score - b.score },
];

async function reload() {
  loading.value = true;
  try {
    const res = await getKoxDealerSnapshot({
      brandId: auth.currentBrandId ?? 7,
      statMonth: statMonth.value ?? undefined,
    });
    data.value = res;
    monthOptions.value = (res.stat_months ?? []).map((m) => ({ label: m, value: m }));
    if (!regionOptions.value.length) {
      regionOptions.value = [
        ...new Set((res.list ?? []).map((r) => r.region_name).filter(Boolean)),
      ].map((r) => ({ label: r, value: r }));
    }
    await nextTick();
    renderTierChart();
  } catch (e) {
    message.error(e.message || '加载经销商排行失败');
  } finally {
    loading.value = false;
  }
}

function onResize() {
  tierChart?.resize();
}

function exportDetail() {
  const rows = filteredRows.value.map((r) => ({
    排名: r.rank,
    代理商: r.dealer_name,
    区域: r.region_name ?? '',
    城市: r.city_name ?? '',
    分层: r.tier ?? '',
    账号数: r.account_cnt,
    发布数: r.publish_cnt,
    '内容完成度%': r.content_pct,
    曝光量: r.exposure,
    '曝光完成度%': r.exposure_pct,
    进线数: r.inquiries,
    开口数: r.openings,
    留资数: r.leads,
    '留资完成度%': r.leads_pct,
    成交数: r.deals,
    '成交完成度%': r.deals_pct,
    综合得分: r.score,
  }));
  exportExcel([{ name: '代理商综合排行', rows }], '经销商排行');
}

onMounted(() => {
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

.q-icon {
  color: #94a3b8;
  font-size: 13px;
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

.tier-chart {
  width: 100%;
  height: 240px;
}

.funnel3 {
  display: grid;
  grid-template-columns: 1fr auto 1fr auto 1fr;
  gap: 16px;
  align-items: stretch;
}

.f3-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
  padding-bottom: 10px;
  border-bottom: 1px solid #f1f5f9;
  margin-bottom: 12px;
}

.f3-main {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 8px;
}

.f3-main b {
  font-size: 30px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: #1e293b;
}

.f3-main span {
  color: #94a3b8;
  font-size: 14px;
}

.f3-pct {
  text-align: right;
  font-size: 13px;
  color: #3456e6;
  font-weight: 700;
  margin: 4px 0 10px;
}

.f3-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.f3-grid.wide {
  grid-template-columns: 1fr 1fr;
  margin-top: 12px;
}

.f3-kv {
  background: #f8fafc;
  border-radius: 8px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.f3-kv span {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.f3-kv b {
  font-size: 16px;
  font-variant-numeric: tabular-nums;
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
}

.prog-num {
  width: 42px;
  text-align: right;
  font-size: 12px;
  color: var(--color-text-secondary);
  font-variant-numeric: tabular-nums;
}
</style>
