<template>
  <PageWrapper title="销售看板" subtitle="小红书渠道销售 × 线索转化">
    <template #extra>
      <a-button size="small" @click="showImport = true">
        <UploadOutlined /> 导入数据
      </a-button>
    </template>

    <a-card size="small" class="filter-card">
      <div class="filter-row">
        <span class="f-label">月份：</span>
        <a-range-picker
          v-model:value="monthRange"
          picker="month"
          size="small"
          format="YYYY-MM"
          :allow-clear="false"
          @change="reload"
        />
        <span class="f-label">省份：</span>
        <a-select
          v-model:value="province"
          size="small"
          style="width: 130px"
          allow-clear
          placeholder="全部省份"
          :options="(facets.provinces ?? []).map((p) => ({ label: p, value: p }))"
          @change="reload"
        />
        <span class="f-label">品系：</span>
        <a-select
          v-model:value="productLine"
          size="small"
          style="width: 150px"
          allow-clear
          placeholder="全部品系"
          :options="(facets.product_lines ?? []).map((p) => ({ label: p, value: p }))"
          @change="reload"
        />
      </div>
    </a-card>

    <a-alert v-if="emptyHint" type="info" show-icon :message="emptyHint" class="hint-bar" />

    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-label">总线索数</div>
        <div class="stat-value hl-blue">{{ fmt(cards.total_leads) }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">总销量</div>
        <div class="stat-value">{{ fmt(cards.total_sales) }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">总转化率</div>
        <div class="stat-value hl-green">{{ cards.conversion_rate }}%</div>
      </div>
    </div>

    <a-row :gutter="12">
      <a-col :span="15">
        <a-card size="small" :bordered="false" title="月度销量趋势">
          <div ref="trendEl" style="height: 320px" />
        </a-card>
      </a-col>
      <a-col :span="9">
        <a-card size="small" :bordered="false" title="品系销量排行">
          <div ref="rankEl" style="height: 320px" />
        </a-card>
      </a-col>
    </a-row>

    <a-card size="small" :bordered="false" class="detail-card">
      <template #title>
        <div class="sec-head"><span class="bar"></span>门店品系销量明细</div>
      </template>
      <a-table
        :columns="detailColumns"
        :data-source="detail"
        :loading="loading"
        :pagination="{ pageSize: 15, showSizeChanger: false, size: 'small' }"
        row-key="store"
        size="small"
        :scroll="{ x: detailColumns.length > 8 ? 1200 : undefined }"
      />
    </a-card>

    <a-modal v-model:open="showImport" title="导入小红书渠道销售清单" :footer="null" width="560px">
      <a-alert
        type="info"
        show-icon
        class="import-tip"
        message="Excel 列头要求：月份(YYYY-MM)、门店、省份、品系、销量、销售额(可选)。同月+同门店+同品系重复导入将覆盖更新。"
      />
      <a-upload
        :before-upload="beforeUpload"
        accept=".xlsx,.xls"
        :max-count="1"
        :file-list="fileList"
      >
        <a-button type="primary" :loading="importing">
          <UploadOutlined /> 选择 Excel 文件
        </a-button>
      </a-upload>
      <div v-if="importResult" class="import-result">
        <div>新增 {{ importResult.created }} 条 · 更新 {{ importResult.updated }} 条</div>
        <div v-if="importResult.skipped" class="muted mini">
          跳过 {{ importResult.skipped }} 行：{{ (importResult.errors || []).join('；') }}
        </div>
      </div>
    </a-modal>
  </PageWrapper>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { message } from 'ant-design-vue';
import { UploadOutlined } from '@ant-design/icons-vue';
import * as echarts from 'echarts';
import * as XLSX from 'xlsx';
import dayjs from 'dayjs';
import PageWrapper from '../../components/PageWrapper.vue';
import request from '../../api/request';

const loading = ref(false);
const monthRange = ref([dayjs().startOf('year'), dayjs()]);
const province = ref(undefined);
const productLine = ref(undefined);
const showImport = ref(false);
const importing = ref(false);
const fileList = ref([]);
const importResult = ref(null);

const facets = ref({ provinces: [], product_lines: [], months: [] });
const cards = ref({ total_leads: 0, total_sales: 0, conversion_rate: 0 });
const emptyHint = ref(null);
const detail = ref([]);
const trend = ref([]);
const COLORS = ['#3456e6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

let trendChart = null;
let rankChart = null;
const trendEl = ref(null);
const rankEl = ref(null);

const fmt = (v) => Number(v ?? 0).toLocaleString();

const detailColumns = computed(() => {
  const products = [...new Set(detail.value.flatMap((d) => Object.keys(d).filter((k) => !['store', 'province', 'total'].includes(k))))];
  return [
    { title: '排名', key: 'rank', width: 60, customRender: ({ index }) => index + 1 },
    { title: '门店', dataIndex: 'store', width: 180 },
    { title: '省份', dataIndex: 'province', width: 90 },
    { title: '总销量', dataIndex: 'total', width: 90, sorter: (a, b) => a.total - b.total, align: 'right' },
    ...products.map((p) => ({ title: p, dataIndex: p, width: 90, align: 'right' })),
  ];
});

const monthParams = () => ({
  startMonth: monthRange.value?.[0]?.format('YYYY-MM'),
  endMonth: monthRange.value?.[1]?.format('YYYY-MM'),
  ...(province.value ? { province: province.value } : {}),
  ...(productLine.value ? { productLine: productLine.value } : {}),
});

async function reload() {
  loading.value = true;
  try {
    const res = await request.get('/mdd/sales/dashboard', { params: monthParams() });
    cards.value = res.cards ?? { total_leads: 0, total_sales: 0, conversion_rate: 0 };
    emptyHint.value = res.empty_hint ?? null;
    detail.value = res.detail ?? [];
    trend.value = res.trend ?? [];
    facets.value = res.facets ?? {};
    await nextTick();
    renderTrend();
    renderRank();
  } catch (e) {
    message.error(e.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

function renderTrend() {
  if (!trendEl.value) return;
  if (!trendChart) trendChart = echarts.init(trendEl.value);
  const products = [...new Set(trend.value.flatMap((p) => Object.keys(p).filter((k) => k !== 'month')))];
  trendChart.setOption(
    {
      tooltip: { trigger: 'axis' },
      legend: { type: 'scroll', bottom: 0, data: products },
      grid: { left: 44, right: 20, top: 20, bottom: 46 },
      xAxis: { type: 'category', data: trend.value.map((p) => p.month), boundaryGap: false },
      yAxis: { type: 'value' },
      series: products.map((p, i) => ({
        name: p,
        type: 'line',
        smooth: true,
        symbolSize: 5,
        itemStyle: { color: COLORS[i % COLORS.length] },
        data: trend.value.map((row) => row[p] ?? 0),
      })),
    },
    { notMerge: true },
  );
}

function renderRank() {
  if (!rankEl.value) return;
  if (!rankChart) rankChart = echarts.init(rankEl.value);
  const rows = (detail.value.length
    ? rankFromDetail()
    : []
  ).slice(0, 12);
  rankChart.setOption(
    {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 110, right: 40, top: 10, bottom: 20 },
      xAxis: { type: 'value' },
      yAxis: { type: 'category', data: rows.map((r) => r.name).reverse() },
      series: [
        {
          type: 'bar',
          barMaxWidth: 18,
          itemStyle: { borderRadius: [0, 6, 6, 0], color: '#5b7cf0' },
          label: { show: true, position: 'right', fontSize: 11, color: '#475569' },
          data: rows.map((r) => r.qty),
        },
      ],
    },
    { notMerge: true },
  );
}

function rankFromDetail() {
  // 从明细行的品系列汇总出排行
  const agg = new Map();
  for (const row of detail.value) {
    for (const [k, v] of Object.entries(row)) {
      if (['store', 'province', 'total'].includes(k)) continue;
      agg.set(k, (agg.get(k) ?? 0) + Number(v ?? 0));
    }
  }
  return [...agg.entries()]
    .filter(([, v]) => v > 0)
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => b.qty - a.qty);
}

function beforeUpload(file) {
  importing.value = true;
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      const rows = raw
        .map((r) => ({
          month: normalizeMonth(r['月份'] ?? r.month),
          storeName: String(r['门店'] ?? r.storeName ?? '').trim(),
          province: String(r['省份'] ?? r.province ?? '').trim(),
          productLine: String(r['品系'] ?? r['车型'] ?? r.productLine ?? '').trim(),
          quantity: Number(r['销量'] ?? r.quantity ?? 0) || 0,
          amount: r['销售额'] ?? r.amount ?? null,
        }))
        .filter((r) => r.month && r.storeName && r.productLine);
      if (!rows.length) {
        message.error('未解析到有效行（列头需含：月份/门店/品系/销量）');
        importing.value = false;
        fileList.value = [];
        return;
      }
      const res = await request.post('/mdd/sales/import', { rows });
      importResult.value = res;
      message.success(`导入完成：新增 ${res.created} · 更新 ${res.updated}`);
      fileList.value = [];
      await reload();
    } catch (err) {
      message.error(err.message || '解析失败');
    } finally {
      importing.value = false;
    }
  };
  reader.readAsArrayBuffer(file);
  return false;
}

function normalizeMonth(v) {
  if (!v) return '';
  if (/^\d{4}-\d{2}/.test(String(v))) return String(v).slice(0, 7);
  if (v instanceof Date) return dayjs(v).format('YYYY-MM');
  const num = Number(v);
  if (Number.isFinite(num) && num > 200000 && num < 300000) {
    // Excel 日期序列号
    return dayjs('1899-12-30').add(num, 'day').format('YYYY-MM');
  }
  const d = dayjs(String(v));
  return d.isValid() ? d.format('YYYY-MM') : '';
}

function onResize() {
  trendChart?.resize();
  rankChart?.resize();
}

onMounted(() => {
  reload();
  window.addEventListener('resize', onResize);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
  trendChart?.dispose();
  rankChart?.dispose();
});
</script>

<style scoped>
.filter-card {
  margin-bottom: 12px;
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

.hint-bar {
  margin-bottom: 12px;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 12px;
}

.stat-card {
  background: #fff;
  border-radius: 12px;
  padding: 18px 22px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  text-align: center;
}

.stat-label {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.stat-value {
  font-size: 30px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: #1e293b;
  font-family: 'DIN Alternate', 'Bahnschrift', -apple-system, sans-serif;
  margin-top: 4px;
}

.hl-blue {
  color: #2563eb;
}

.hl-green {
  color: #16a34a;
}

.detail-card {
  margin-top: 12px;
}

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

.import-tip {
  margin-bottom: 14px;
}

.import-result {
  margin-top: 12px;
  font-size: 13px;
  color: #16a34a;
}
</style>
