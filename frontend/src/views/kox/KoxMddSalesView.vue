<template>
  <PageWrapper title="销售看板" subtitle="小红书渠道销售 × 线索转化">
    <template #extra>
      <a-space>
        <a-button size="small" @click="openStaffModal">
          <TeamOutlined /> 顾问归属
        </a-button>
        <a-button size="small" @click="showImport = true">
          <UploadOutlined /> 导入数据
        </a-button>
      </a-space>
    </template>

    <a-segmented
      v-model:value="tab"
      :options="[
        { label: '汇总看板', value: 'summary' },
        { label: '订单明细', value: 'orders' },
      ]"
      class="tab-seg"
      @change="onTabChange"
    />

    <!-- ─── 汇总看板 ─── -->
    <template v-if="tab === 'summary'">
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
          <span class="f-label">门店：</span>
          <a-select
            v-model:value="storeFilter"
            size="small"
            style="width: 150px"
            allow-clear
            placeholder="全部门店"
            :options="(facets.stores ?? []).map((s) => ({ label: s, value: s }))"
            @change="reload"
          />
          <span class="f-label">品类：</span>
          <a-select
            v-model:value="categoryFilter"
            size="small"
            style="width: 140px"
            allow-clear
            placeholder="全部品类"
            :options="(facets.categories ?? []).map((c) => ({ label: c, value: c }))"
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
          <div v-if="orderSummary.orders" class="stat-sub muted mini">销售额 ¥{{ fmt(orderSummary.amount) }} · {{ orderSummary.orders }} 单</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">总转化率</div>
          <div class="stat-value hl-green">{{ cards.conversion_rate }}%</div>
        </div>
        <div v-if="orderSummary.orders" class="stat-card">
          <div class="stat-label">成交客户 / 复购率</div>
          <div class="stat-value hl-purple">{{ orderSummary.customers }}</div>
          <div class="stat-sub muted mini">复购率 {{ orderSummary.repurchase_rate }}%</div>
        </div>
      </div>

      <a-row :gutter="12">
        <a-col :span="15">
          <a-card size="small" :bordered="false" title="销量趋势（日度）">
            <div ref="trendEl" style="height: 320px" />
          </a-card>
        </a-col>
        <a-col :span="9">
          <a-card size="small" :bordered="false" title="销量排行（按订单品名）">
            <div ref="rankEl" style="height: 320px" />
          </a-card>
        </a-col>
      </a-row>

      <a-row :gutter="12" v-if="(staffRanking || []).length">
        <a-col :span="24">
          <a-card size="small" :bordered="false" class="detail-card">
            <template #title>
              <div class="sec-head"><span class="bar"></span>销售顾问排行（销量 / 金额）</div>
            </template>
            <a-table
              :columns="staffColumns"
              :data-source="staffRanking"
              :pagination="false"
              row-key="staff"
              size="small"
            />
          </a-card>
        </a-col>
      </a-row>

      <a-card size="small" :bordered="false" class="detail-card">
        <template #title>
          <div class="sec-head"><span class="bar"></span>门店品类销量明细（按订单现算，省份按门店名推断）</div>
        </template>
        <a-table
          :columns="detailColumns"
          :data-source="detail"
          :loading="loading"
          :pagination="{ pageSize: 15, showSizeChanger: false, size: 'small' }"
          row-key="store"
          size="small"
          :scroll="{ x: detailColumns.length > 8 ? 1200 : undefined }"
        >
          <template #expandedRowRender="{ record }">
            <div v-if="(storeKos.get(record.store) ?? []).length" class="store-kos-list">
              <div v-for="acc in storeKos.get(record.store)" :key="acc.nickname" class="store-kos-row">
                <span class="kos-nick">{{ acc.nickname }}</span>
                <a-tag class="mini" :color="acc.account_type === 'KOS' ? 'green' : 'purple'">{{ acc.account_type }}</a-tag>
                <span class="muted mini">{{ acc.region_name || '' }}</span>
              </div>
            </div>
            <span v-else class="muted mini">该门店暂无 KOS 账号</span>
          </template>
        </a-table>
      </a-card>
    </template>

    <!-- ─── 订单明细 ─── -->
    <template v-else>
      <a-card size="small" class="filter-card">
        <div class="filter-row">
          <span class="f-label">月份：</span>
          <a-range-picker
            v-model:value="orderMonthRange"
            picker="month"
            size="small"
            format="YYYY-MM"
            :allow-clear="false"
            @change="loadOrders"
          />
          <span class="f-label">门店：</span>
          <a-select
            v-model:value="orderStore"
            size="small"
            style="width: 150px"
            show-search
            allow-clear
            placeholder="全部门店"
            :options="(orderFacets.stores ?? []).map((s) => ({ label: s, value: s }))"
            @change="loadOrders"
          />
          <span class="f-label">顾问：</span>
          <a-select
            v-model:value="orderStaff"
            size="small"
            style="width: 130px"
            show-search
            allow-clear
            placeholder="全部顾问"
            :options="(orderFacets.staff ?? []).map((s) => ({ label: s, value: s }))"
            @change="loadOrders"
          />
          <a-input-search
            v-model:value="orderKeyword"
            size="small"
            style="width: 220px"
            placeholder="客户 / 手机号 / 品名 / 顾问"
            allow-clear
            @search="loadOrders"
            @change="(e) => { if (!e.target.value) loadOrders(); }"
          />
        </div>
        <div class="order-summary-row muted mini" v-if="orderSummary.orders">
          共 {{ orderSummary.orders }} 单 · {{ orderSummary.qty }} 件 · ¥{{ fmt(orderSummary.amount) }} ·
          客户 {{ orderSummary.customers }} 人 · 复购率 {{ orderSummary.repurchase_rate }}%
        </div>
      </a-card>

      <a-card size="small" :bordered="false">
        <a-table
          :columns="orderColumns"
          :data-source="orderList"
          :loading="orderLoading"
          :pagination="orderPager"
          row-key="id"
          size="small"
          :scroll="{ x: 1500 }"
          @change="onOrderTableChange"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'date'">{{ fmtDay(record.date) }}</template>
            <template v-else-if="column.key === 'phone'">
              <span class="phone-text">{{ record.phone || '-' }}</span>
            </template>
            <template v-else-if="column.key === 'store'">
              <a-tag :color="record.storeName === '未分配' ? 'default' : 'blue'">{{ record.storeName || '-' }}</a-tag>
            </template>
            <template v-else-if="column.key === 'repurchase'">
              <a-tag v-if="record.repurchase === '是'" color="green">回购</a-tag>
              <span v-else class="muted mini">-</span>
            </template>
          </template>
        </a-table>
      </a-card>
    </template>

    <a-modal v-model:open="showImport" title="导入小红书渠道销售数据" :footer="null" width="560px">
      <a-alert
        type="info"
        show-icon
        class="import-tip"
        message="自动识别两种格式：① 订单明细（列头含：日期/客户姓名/手机号码/产品型号/品名/数量…，支持同订单多行，客户手机号一并入库）；② 月度汇总（月份/门店/省份/品系/销量）。重复导入按唯一键覆盖更新。"
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
        <div v-if="importResult.unmatched_staff?.length" class="muted mini">
          未匹配门店的顾问：{{ importResult.unmatched_staff.join('、') }}（已归「未分配」，补齐基线归属人后可重导）
        </div>
      </div>
    </a-modal>

    <!-- 顾问归属（人工别名：无矩阵号顾问的门店归属补充） -->
    <a-modal v-model:open="staffModal.open" title="顾问归属（销售顾问 → 门店）" :footer="null" width="680px">
      <a-alert type="info" show-icon class="import-tip"
        message="匹配顺序：人工别名 → 矩阵号昵称后缀 → 账号使用人；保存别名后自动重算全部订单归属。" />
      <a-alert v-if="staffModal.staffBlank" type="warning" show-icon class="import-tip"
        :message="`另有 ${staffModal.staffBlank} 单订单「销售顾问」列为空，无法映射归属，需客户在底表补齐顾问后重新导入`" />

      <div class="sec-head" style="margin: 4px 0 8px"><span class="bar"></span>未分配订单（按销量）</div>
      <a-empty v-if="!staffModal.unassigned.length && !staffModal.loading" description="没有未分配订单" />
      <a-table
        v-else
        :columns="unassignedColumns"
        :data-source="staffModal.unassigned"
        :loading="staffModal.loading"
        :pagination="false"
        row-key="staff"
        size="small"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'store'">
            <a-select
              v-model:value="staffModal.edits[record.staff]"
              size="small"
              style="width: 170px"
              show-search
              allow-clear
              placeholder="选择门店"
              :options="storeOptions"
            />
          </template>
          <template v-else-if="column.key === 'action'">
            <a-button size="small" type="link" :disabled="!staffModal.edits[record.staff]" @click="saveAlias(record.staff)">
              保存并重算
            </a-button>
          </template>
        </template>
      </a-table>

      <div class="sec-head" style="margin: 16px 0 8px"><span class="bar"></span>已配置的别名</div>
      <a-table
        :columns="aliasColumns"
        :data-source="staffModal.aliases"
        :loading="staffModal.loading"
        :pagination="false"
        row-key="id"
        size="small"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'action'">
            <a-popconfirm title="删除后相关订单重算将回到未分配？" @confirm="removeAlias(record)">
              <a-button size="small" type="link" danger>删除</a-button>
            </a-popconfirm>
          </template>
        </template>
      </a-table>
    </a-modal>
  </PageWrapper>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { message } from 'ant-design-vue';
import { TeamOutlined, UploadOutlined } from '@ant-design/icons-vue';
import * as echarts from 'echarts';
import * as XLSX from 'xlsx';
import dayjs from 'dayjs';
import PageWrapper from '../../components/PageWrapper.vue';
import request from '../../api/request';

const loading = ref(false);
const tab = ref('summary');
const monthRange = ref([dayjs().startOf('year'), dayjs()]);
const storeFilter = ref(undefined);
const categoryFilter = ref(undefined);
const showImport = ref(false);
const importing = ref(false);
const fileList = ref([]);
const importResult = ref(null);

const facets = ref({ stores: [], categories: [], provinces: [], product_lines: [], months: [] });
const cards = ref({ total_leads: 0, total_sales: 0, conversion_rate: 0 });
const orderSummary = ref({ orders: 0, qty: 0, amount: 0, customers: 0, repurchase_rate: 0 });
const staffRanking = ref([]);
const emptyHint = ref(null);
const detail = ref([]);
const trend = ref([]);
const dailyTrend = ref([]);
const orderRanking = ref([]);
const storeKos = ref(new Map());
const COLORS = ['#3456e6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

let trendChart = null;
let rankChart = null;
const trendEl = ref(null);
const rankEl = ref(null);

// 订单明细状态
const orderList = ref([]);
const orderLoading = ref(false);
const orderPage = ref(1);
const orderPageSize = 20;
const orderTotal = ref(0);
const orderMonthRange = ref([dayjs().startOf('year'), dayjs()]);
const orderStore = ref(undefined);
const orderStaff = ref(undefined);
const orderKeyword = ref('');
const orderFacets = ref({ stores: [], staff: [] });

// ── 顾问归属（人工别名） ──
const staffModal = reactive({
  open: false,
  loading: false,
  aliases: [],
  unassigned: [],
  staffBlank: 0,
  edits: {},
  saving: false,
});

const storeOptions = computed(() => [
  ...(facets.value.stores ?? []).map((s) => ({ label: s, value: s })),
  ...(orderFacets.value.stores ?? [])
    .filter((s) => !(facets.value.stores ?? []).includes(s))
    .map((s) => ({ label: s, value: s })),
]);

const unassignedColumns = [
  { title: '销售顾问', dataIndex: 'staff', width: 110 },
  { title: '件数', dataIndex: 'qty', width: 70, align: 'right' },
  { title: '单数', dataIndex: 'orders', width: 70, align: 'right' },
  { title: '归属门店', key: 'store', width: 180 },
  { title: '操作', key: 'action', width: 110 },
];

const aliasColumns = [
  { title: '销售顾问', dataIndex: 'staff', width: 120 },
  { title: '归属门店', dataIndex: 'storeName', width: 150 },
  { title: '备注', dataIndex: 'remark' },
  { title: '操作', key: 'action', width: 80 },
];

async function openStaffModal() {
  staffModal.open = true;
  staffModal.loading = true;
  staffModal.edits = {};
  try {
    if (!facets.value.stores?.length || !orderList.value.length) {
      await Promise.all([reload(), loadOrders()]);
    }
    const res = await request.get('/mdd/sales/staff-aliases');
    staffModal.aliases = res.aliases ?? [];
    staffModal.unassigned = res.unassigned ?? [];
    staffModal.staffBlank = res.staff_blank_orders ?? 0;
  } catch (e) {
    message.error(e.message || '加载顾问归属失败');
  } finally {
    staffModal.loading = false;
  }
}

async function saveAlias(staff) {
  const storeName = staffModal.edits[staff];
  if (!storeName) return;
  staffModal.saving = true;
  try {
    await request.post('/mdd/sales/staff-aliases', { staff, storeName });
    const res = await request.post('/mdd/sales/remap-staff');
    message.success(`已保存映射并重算：更新 ${res.changed} 条订单归属`);
    staffModal.edits = { ...staffModal.edits, [staff]: undefined };
    await Promise.all([openStaffModal(), reload(), loadOrders()]);
  } catch (e) {
    message.error(e.message || '保存失败');
  } finally {
    staffModal.saving = false;
  }
}

async function removeAlias(alias) {
  try {
    await request.delete(`/mdd/sales/staff-aliases/${alias.id}`);
    const res = await request.post('/mdd/sales/remap-staff');
    message.success(`已删除并重算：更新 ${res.changed} 条订单归属`);
    await Promise.all([openStaffModal(), reload(), loadOrders()]);
  } catch (e) {
    message.error(e.message || '删除失败');
  }
}

const fmt = (v) => Number(v ?? 0).toLocaleString();
const fmtDay = (v) => (v ? dayjs(v).format('MM-DD') : '-');

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

const staffColumns = [
  { title: '排名', key: 'rank', width: 60, customRender: ({ index }) => index + 1 },
  { title: '销售顾问', dataIndex: 'staff', width: 140 },
  { title: '销量', dataIndex: 'qty', width: 100, align: 'right', sorter: (a, b) => a.qty - b.qty },
  { title: '销售额（元）', dataIndex: 'amount', width: 120, align: 'right', sorter: (a, b) => a.amount - b.amount, customRender: ({ text }) => fmt(text) },
];

const orderColumns = [
  { key: 'date', title: '日期', width: 80 },
  { title: '序号', dataIndex: 'orderSeq', width: 60 },
  { title: '内部单号', dataIndex: 'internalNo', width: 90 },
  { title: '客户姓名', dataIndex: 'customerName', width: 100 },
  { key: 'phone', title: '手机号码', dataIndex: 'phone', width: 120 },
  { key: 'repurchase', title: '回购', width: 70 },
  { title: '渠道', dataIndex: 'channel', width: 100 },
  { title: '产品型号', dataIndex: 'productModel', width: 150 },
  { title: '品名', dataIndex: 'productName', width: 120 },
  { title: '颜色', dataIndex: 'color', width: 80 },
  { title: '尺码', dataIndex: 'size', width: 60 },
  { title: '数量', dataIndex: 'quantity', width: 60, align: 'right' },
  { title: '单价', dataIndex: 'unitPrice', width: 80, align: 'right' },
  { title: '折后小计', dataIndex: 'discountSub', width: 90, align: 'right' },
  { title: '收款合计', dataIndex: 'amount', width: 90, align: 'right' },
  { title: '销售顾问', dataIndex: 'staff', width: 90 },
  { key: 'store', title: '门店', dataIndex: 'storeName', width: 110 },
];

const orderPager = computed(() => ({
  current: orderPage.value,
  pageSize: orderPageSize,
  total: orderTotal.value,
  showSizeChanger: false,
  size: 'small',
}));

const monthParams = () => ({
  startMonth: monthRange.value?.[0]?.format('YYYY-MM'),
  endMonth: monthRange.value?.[1]?.format('YYYY-MM'),
  ...(storeFilter.value ? { storeName: storeFilter.value } : {}),
  ...(categoryFilter.value ? { category: categoryFilter.value } : {}),
});

const orderParams = () => ({
  startMonth: orderMonthRange.value?.[0]?.format('YYYY-MM'),
  endMonth: orderMonthRange.value?.[1]?.format('YYYY-MM'),
  ...(orderStore.value ? { storeName: orderStore.value } : {}),
  ...(orderStaff.value ? { staff: orderStaff.value } : {}),
  ...(orderKeyword.value?.trim() ? { keyword: orderKeyword.value.trim() } : {}),
});

async function reload() {
  loading.value = true;
  try {
    const res = await request.get('/mdd/sales/dashboard', { params: monthParams() });
    cards.value = res.cards ?? { total_leads: 0, total_sales: 0, conversion_rate: 0 };
    orderSummary.value = res.order_summary ?? { orders: 0, qty: 0, amount: 0, customers: 0, repurchase_rate: 0 };
    staffRanking.value = res.staff_ranking ?? [];
    emptyHint.value = res.empty_hint ?? null;
    detail.value = res.detail ?? [];
    trend.value = res.trend ?? [];
    dailyTrend.value = res.daily_trend ?? [];
    orderRanking.value = res.order_ranking ?? [];
    facets.value = res.facets ?? {};
    await nextTick();
    renderTrend();
    renderRank();
    resolveStoreKos();
  } catch (e) {
    message.error(e.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

async function loadOrders() {
  orderLoading.value = true;
  try {
    const res = await request.get('/mdd/sales/orders', {
      params: { page: orderPage.value, page_size: orderPageSize, ...orderParams() },
    });
    orderList.value = res.list ?? [];
    orderTotal.value = res.total ?? 0;
    orderSummary.value = res.summary ?? orderSummary.value;
    orderFacets.value = res.facets ?? { stores: [], staff: [] };
  } catch (e) {
    message.error(e.message || '加载订单失败');
  } finally {
    orderLoading.value = false;
  }
}

function onTabChange(v) {
  if (v === 'orders' && !orderList.value.length) loadOrders();
}

function onOrderTableChange(p) {
  orderPage.value = p.current;
  loadOrders();
}

function renderTrend() {
  if (!trendEl.value) return;
  if (!trendChart) trendChart = echarts.init(trendEl.value);
  // 日度趋势（订单按日销量+销售额）；无订单日数据时回退月度品系趋势
  const daily = dailyTrend.value;
  if (daily.length) {
    trendChart.setOption(
      {
        tooltip: { trigger: 'axis', valueFormatter: (v) => Number(v ?? 0).toLocaleString() },
        legend: { data: ['销量（件）', '销售额（元）'], bottom: 0 },
        grid: { left: 56, right: 56, top: 24, bottom: 40 },
        xAxis: { type: 'category', data: daily.map((x) => x.date.slice(5)) },
        yAxis: [{ type: 'value', name: '件' }, { type: 'value', name: '元' }],
        series: [
          {
            name: '销量（件）',
            type: 'bar',
            barMaxWidth: 16,
            itemStyle: { color: '#3456e6', borderRadius: [4, 4, 0, 0] },
            data: daily.map((x) => x.qty),
          },
          {
            name: '销售额（元）',
            type: 'line',
            smooth: true,
            symbolSize: 4,
            yAxisIndex: 1,
            itemStyle: { color: '#f59e0b' },
            data: daily.map((x) => x.amount),
          },
        ],
      },
      { notMerge: true },
    );
    return;
  }
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
  // 按订单品名的销量排行（订单明细 productName；无订单数据回退门店品系推导）
  const rows = (orderRanking.value.length ? orderRanking.value : rankFromDetail()).slice(0, 10);
  if (orderRanking.value.length) {
    rankChart.setOption(
      {
        tooltip: { trigger: 'axis', valueFormatter: (v) => Number(v ?? 0).toLocaleString() + ' 件' },
        grid: { left: 44, right: 16, top: 24, bottom: 74 },
        xAxis: {
          type: 'category',
          data: rows.map((r) => r.name),
          axisLabel: { rotate: 40, fontSize: 10, interval: 0, overflow: 'truncate', width: 90 },
        },
        yAxis: { type: 'value', name: '件' },
        series: [
          {
            name: '销量',
            type: 'bar',
            barMaxWidth: 22,
            itemStyle: { color: '#5b7cf0', borderRadius: [4, 4, 0, 0] },
            label: { show: true, position: 'top', fontSize: 10, color: '#475569' },
            data: rows.map((r) => r.qty),
          },
        ],
      },
      { notMerge: true },
    );
    return;
  }
  rankChart.setOption(
    {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 130, right: 40, top: 10, bottom: 20 },
      xAxis: { type: 'value' },
      yAxis: { type: 'category', data: rows.map((r) => r.name).reverse() },
      series: [
        {
          type: 'bar',
          barMaxWidth: 18,
          itemStyle: { borderRadius: [0, 6, 6, 0], color: '#5b7cf0' },
          label: { show: true, position: 'right', fontSize: 11, color: '#475569' },
          data: rows.map((r) => r.qty).reverse(),
        },
      ],
    },
    { notMerge: true },
  );
}

function rankFromDetail() {
  // 从明细行的品系/品名列汇总出排行
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
      const raw = XLSX.utils.sheet_to_json(sheet, { defval: null });
      const isOrderFormat = raw.some((r) => r['手机号码'] != null);
      let res;
      if (isOrderFormat) {
        const rows = parseOrderRows(raw);
        if (!rows.length) {
          message.error('未解析到有效订单行（列头需含：日期/产品型号/品名/数量）');
          importing.value = false;
          fileList.value = [];
          return;
        }
        res = await request.post('/mdd/sales/import-orders', { rows });
      } else {
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
          message.error('未解析到有效行（列头需含：月份/门店/品系/销量 或 订单明细格式）');
          importing.value = false;
          fileList.value = [];
          return;
        }
        res = await request.post('/mdd/sales/import', { rows });
      }
      importResult.value = res;
      message.success(`导入完成：新增 ${res.created} · 更新 ${res.updated}`);
      fileList.value = [];
      await reload();
      orderPage.value = 1;
      await loadOrders();
    } catch (err) {
      message.error(err.message || '解析失败');
    } finally {
      importing.value = false;
    }
  };
  reader.readAsArrayBuffer(file);
  return false;
}

/** 订单明细解析：同订单多行时表头字段（日期/客户/手机号/收款合计/顾问）向下透传；人工杂格式日期容错 */
function parseOrderRows(raw) {
  const rows = [];
  let head = null;
  let lastGood = null;
  for (const r of raw) {
    if (r['日期'] != null && r['日期'] !== '') {
      const d = normalizeDay(r['日期'], lastGood);
      if (d) {
        lastGood = d;
        head = {
          date: d,
          orderSeq: r['订单序号'] != null ? String(r['订单序号']) : null,
          internalNo: r['内部单号'] != null && r['内部单号'] !== '' ? String(r['内部单号']) : null,
          customerName: r['客户姓名'] ? String(r['客户姓名']).trim() : null,
          phone: r['手机号码'] != null && r['手机号码'] !== '' ? String(r['手机号码']).trim() : null,
          repurchase: r['是否回购'] ? String(r['是否回购']).trim() : null,
          channel: r['渠道'] ? String(r['渠道']).trim() : null,
          amount: r['收款合计'] ?? null,
          staff: r['销售顾问'] ? String(r['销售顾问']).trim() : null,
          remark: r['备注'] ? String(r['备注']).trim() : null,
        };
      }
    }
    if (!head || !head.date) continue;
    const hasProduct = (r['产品型号'] ?? '') !== '' || (r['品名'] ?? '') !== '';
    if (!hasProduct) continue;
    rows.push({
      ...head,
      productModel: r['产品型号'] ? String(r['产品型号']).trim() : null,
      productName: r['品名'] ? String(r['品名']).trim() : null,
      color: r['颜色'] ? String(r['颜色']).trim() : null,
      size: r['尺码'] != null && r['尺码'] !== '' ? String(r['尺码']).trim() : null,
      quantity: Number(r['数量'] ?? 0) || 0,
      unitPrice: r['单价'] ?? null,
      discountSub: r['折后小计'] ?? null,
    });
  }
  return rows;
}

function normalizeDay(v, lastGood) {
  if (v == null || v === '') return '';
  if (v instanceof Date && !Number.isNaN(v.getTime())) return dayjs(v).format('YYYY-MM-DD');
  const num = Number(v);
  if (Number.isFinite(num) && String(v).trim() !== '' && num > 20000 && num < 80000) {
    return dayjs('1899-12-30').add(num, 'day').format('YYYY-MM-DD');
  }
  if (Number.isFinite(num) && num >= 1 && num <= 32 && lastGood) {
    // 纯数字：整数=日号；小数=月.日 写法（9.6 = 9月6日）
    if (!Number.isInteger(num)) {
      const parts = String(v).trim().split('.');
      const mm = Number(parts[0]);
      const dd = Number(parts[1] || '0');
      if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
        return `${lastGood.slice(0, 4)}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
      }
    }
    return `${lastGood.slice(0, 7)}-${String(num).padStart(2, '0')}`;
  }
  let s = String(v).trim().replace(/\s+/g, '');
  if (/^\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}$/.test(s)) {
    const [y, m, d] = s.split(/[.\-/]/);
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const md = s.replace(/[年月]/g, '-').replace(/日/, '').replace(/\./g, '-').match(/^(\d{1,2})-(\d{1,2})$/);
  if (md && lastGood) {
    return `${lastGood.slice(0, 7)}-${md[1].padStart(2, '0')}-${md[2].padStart(2, '0')}`;
  }
  const d2 = dayjs(s);
  return d2.isValid() ? d2.format('YYYY-MM-DD') : '';
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

// 门店 → KOS 账号映射（账号基线 storeName 与订单门店名模糊匹配）
const kosAccounts = ref([]);
async function loadStoreKos() {
  try {
    const res = await request.get('/kox/account-ranking', { params: { brandId: 5, page_size: 100, metric: 'pm_leads' } });
    kosAccounts.value = res.list ?? [];
  } catch {
    /* 账号基线加载失败不影响主表 */
  }
}
function resolveStoreKos() {
  const map = new Map();
  for (const row of detail.value) {
    const store = String(row.store ?? '').trim();
    const matched = kosAccounts.value
      .filter((a) => {
        const s = String(a.store_name ?? '').trim();
        return s && (s === store || store.includes(s) || s.includes(store));
      })
      .map((a) => ({ nickname: a.nickname, account_type: a.account_type, region_name: a.region_name }));
    map.set(store, matched);
  }
  storeKos.value = map;
}

onMounted(() => {
  reload();
  loadStoreKos().then(resolveStoreKos);
  window.addEventListener('resize', onResize);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
  trendChart?.dispose();
  rankChart?.dispose();
});
</script>

<style scoped>
.tab-seg {
  margin-bottom: 12px;
}

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

.order-summary-row {
  margin-top: 8px;
}

.hint-bar {
  margin-bottom: 12px;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
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

.stat-sub {
  margin-top: 2px;
}

.hl-blue {
  color: #2563eb;
}

.hl-green {
  color: #16a34a;
}

.hl-purple {
  color: #7c3aed;
}

.phone-text {
  font-variant-numeric: tabular-nums;
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
