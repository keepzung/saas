<template>
  <PageWrapper title="员工矩阵分析" subtitle="星火 MCC 主账户 / 员工号日明细（T+1）">
    <template #extra>
      <a-radio-group v-model:value="dim" size="small" @change="reloadTable">
        <a-radio-button value="brand">主账户维度</a-radio-button>
        <a-radio-button value="staff">员工号维度</a-radio-button>
      </a-radio-group>
      <a-range-picker v-model:value="range" size="small" @change="reloadAll" />
    </template>

    <a-card :bordered="false" class="hero-card">
      <div class="hero-banner">
        <div class="hero-item">
          <div class="hero-label">绑定主账户</div>
          <div class="hero-value">{{ fmt(summary.bind_brand_num) }}</div>
        </div>
        <div class="hero-divider"></div>
        <div class="hero-item">
          <div class="hero-label">开通员工号权限</div>
          <div class="hero-value primary">{{ fmt(summary.open_kos_brand_num) }}</div>
        </div>
        <div class="hero-divider"></div>
        <div class="hero-item">
          <div class="hero-label">绑定员工号</div>
          <div class="hero-value violet">{{ fmt(summary.kos_account_num) }}</div>
        </div>
        <div class="hero-divider"></div>
        <div class="hero-item">
          <div class="hero-label">员工笔记数</div>
          <div class="hero-value green">{{ fmt(summary.create_note_num) }}</div>
        </div>
        <div class="hero-divider"></div>
        <div class="hero-item">
          <div class="hero-label">笔记曝光</div>
          <div class="hero-value">{{ fmt(summary.soc_read_cnt) }}</div>
        </div>
        <div class="hero-divider"></div>
        <div class="hero-item">
          <div class="hero-label">私信进线</div>
          <div class="hero-value">{{ fmt(summary.message_open_cnt) }}</div>
        </div>
        <div class="hero-divider"></div>
        <div class="hero-item">
          <div class="hero-label">私信留资</div>
          <div class="hero-value green">{{ fmt(summary.msg_leads_num) }}</div>
        </div>
        <div class="hero-divider"></div>
        <div class="hero-item">
          <div class="hero-label">投广消耗</div>
          <div class="hero-value">¥{{ fmt(summary.rtb_income_amt) }}</div>
        </div>
      </div>
      <div class="hero-tip">口径：流量型指标=窗口内逐日求和；粉丝/累计曝光=窗口末最新值。数据更新至 {{ summary.date || '—' }}</div>
    </a-card>

    <a-card size="small" title="组织趋势" style="margin-top: 12px">
      <div ref="chartEl" style="height: 260px" />
    </a-card>

    <a-card size="small" style="margin-top: 12px">
      <template #title>{{ dim === 'brand' ? '主账户维度' : '员工号维度' }}</template>
      <template #extra>
        <a-input-search
          v-model:value="keyword"
          :placeholder="dim === 'brand' ? '搜索主账户名称' : '搜索员工昵称 / 姓名 / 主账户'"
          size="small"
          style="width: 240px"
          allow-clear
          @search="onSearch"
        />
        <a-select
          v-if="dim === 'brand'"
          v-model:value="permFilter"
          size="small"
          style="width: 150px; margin-left: 8px"
          @change="reloadTable"
        >
          <a-select-option value="">全部权限状态</a-select-option>
          <a-select-option value="true">已开通员工号权限</a-select-option>
          <a-select-option value="false">未开通</a-select-option>
        </a-select>
        <a-button size="small" style="margin-left: 8px" @click="doExport">导出 Excel</a-button>
      </template>
      <a-table
        :columns="columns"
        :data-source="list"
        :loading="loading"
        :pagination="pagination"
        size="small"
        row-key="rank"
        @change="onTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'brandUserName'">
            <div class="name-cell">
              <div class="name-main">{{ record.brandUserName }}</div>
              <div v-if="dim === 'staff' && (record.staffName || record.nickname)" class="name-sub">
                {{ record.nickname }}{{ record.staffName ? `（${record.staffName}）` : '' }}
              </div>
            </div>
          </template>
          <template v-else-if="column.key === 'hasOpenKos'">
            <a-tag v-if="record.hasOpenKos === true" color="green">已开通</a-tag>
            <a-tag v-else>未开通</a-tag>
          </template>
          <template v-else-if="column.key === 'hasAdsBrand'">
            <a-tag v-if="record.hasAdsBrand === true" color="blue">投广</a-tag>
            <a-tag v-else>—</a-tag>
          </template>
          <template v-else-if="column.key === 'ctr'">
            {{ record.socImpCnt ? ((record.socClickCnt / record.socImpCnt) * 100).toFixed(2) : '0.00' }}%
          </template>
          <template v-else-if="column.key === 'rtbIncomeAmt'">
            ¥{{ fmt(record.rtbIncomeAmt) }}
          </template>
        </template>
      </a-table>
    </a-card>
  </PageWrapper>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { message } from 'ant-design-vue';
import dayjs from 'dayjs';
import * as echarts from 'echarts';
import PageWrapper from '../../components/PageWrapper.vue';
import { exportExcel } from '../../utils/excel';
import { useAuthStore } from '../../stores/auth';
import { getStaffMatrixSummary, getStaffMatrixBrands, getStaffMatrixUsers } from '../../api/spark';

const auth = useAuthStore();

const dim = ref('brand');
const range = ref([dayjs().subtract(6, 'day'), dayjs().subtract(1, 'day')]);
const keyword = ref('');
const permFilter = ref('');
const summary = ref({});
const summaryDays = ref([]);
const list = ref([]);
const loading = ref(false);
const pagination = ref({ current: 1, pageSize: 20, total: 0, showSizeChanger: true, showTotal: (t) => `共 ${t}` });
const chartEl = ref(null);
let chart = null;

const fmt = (n) => Number(n ?? 0).toLocaleString();

const dateParams = () => ({
  brandId: auth.currentBrandId ?? undefined,
  start: range.value?.[0]?.format('YYYY-MM-DD'),
  end: range.value?.[1]?.format('YYYY-MM-DD'),
});

const brandColumns = [
  { title: '排名', key: 'rank', dataIndex: 'rank', width: 64 },
  { title: '主账户', key: 'brandUserName', dataIndex: 'brandUserName', width: 220 },
  { title: '类型', key: 'accountType', dataIndex: 'accountType', width: 90 },
  { title: '员工号权限', key: 'hasOpenKos', width: 100 },
  { title: '投广', key: 'hasAdsBrand', width: 70 },
  { title: '绑定员工数', key: 'kosAccountNum', dataIndex: 'kosAccountNum', width: 96 },
  { title: '笔记数', key: 'createNoteNum', dataIndex: 'createNoteNum', width: 84 },
  { title: '笔记曝光', key: 'socReadCnt', dataIndex: 'socReadCnt', width: 100 },
  { title: '粉丝数', key: 'fansNum', dataIndex: 'fansNum', width: 90 },
  { title: '私信进线', key: 'messageOpenCnt', dataIndex: 'messageOpenCnt', width: 88 },
  { title: '私信开口', key: 'messageDrivingOpenCnt', dataIndex: 'messageDrivingOpenCnt', width: 88 },
  { title: '私信留资', key: 'msgLeadsNum', dataIndex: 'msgLeadsNum', width: 88 },
  { title: '表单留资', key: 'leadsSuccess', dataIndex: 'leadsSuccess', width: 88 },
  { title: '投广消耗', key: 'rtbIncomeAmt', width: 100 },
];

const staffColumns = [
  { title: '排名', key: 'rank', dataIndex: 'rank', width: 64 },
  { title: '员工号', key: 'brandUserName', width: 240 },
  { title: '所属主账户', key: 'brandUserNameSub', dataIndex: 'brandUserName', width: 200, ellipsis: true },
  { title: '笔记数', key: 'createNoteNum', dataIndex: 'createNoteNum', width: 84 },
  { title: '曝光', key: 'socImpCnt', dataIndex: 'socImpCnt', width: 92 },
  { title: '阅读', key: 'socClickCnt', dataIndex: 'socClickCnt', width: 92 },
  { title: '互动', key: 'socEnageCnt', dataIndex: 'socEnageCnt', width: 92 },
  { title: 'CTR', key: 'ctr', width: 80 },
  { title: '粉丝数', key: 'fansNum', dataIndex: 'fansNum', width: 90 },
  { title: '新增粉丝', key: 'addFansNum', dataIndex: 'addFansNum', width: 88 },
  { title: '私信进线', key: 'messageOpenCnt', dataIndex: 'messageOpenCnt', width: 88 },
  { title: '私信开口', key: 'messageDrivingOpenCnt', dataIndex: 'messageDrivingOpenCnt', width: 88 },
  { title: '私信留资', key: 'msgLeadsNum', dataIndex: 'msgLeadsNum', width: 88 },
  { title: '表单留资', key: 'leadsSuccess', dataIndex: 'leadsSuccess', width: 88 },
  { title: '投广消耗', key: 'rtbIncomeAmt', width: 100 },
];

const columns = computed(() => (dim.value === 'brand' ? brandColumns : staffColumns));

async function reloadSummary() {
  const res = await getStaffMatrixSummary(dateParams());
  summary.value = res.latest ?? {};
  summaryDays.value = res.days ?? [];
  nextTick(renderChart);
}

async function reloadTable() {
  loading.value = true;
  try {
    const params = {
      ...dateParams(),
      keyword: keyword.value || undefined,
      page: pagination.value.current,
      page_size: pagination.value.pageSize,
    };
    if (dim.value === 'brand') {
      params.hasOpenKos = permFilter.value || undefined;
      params.sortField = 'createNoteNum';
      const res = await getStaffMatrixBrands(params);
      list.value = res.list ?? [];
      pagination.value.total = res.total ?? 0;
    } else {
      params.sortField = 'socImpCnt';
      const res = await getStaffMatrixUsers(params);
      list.value = res.list ?? [];
      pagination.value.total = res.total ?? 0;
    }
  } catch (e) {
    message.error(e.message || '加载员工矩阵失败');
  } finally {
    loading.value = false;
  }
}

function reloadAll() {
  pagination.value.current = 1;
  reloadSummary();
  reloadTable();
}

function onSearch() {
  pagination.value.current = 1;
  reloadTable();
}

function onTableChange(p) {
  pagination.value.current = p.current;
  pagination.value.pageSize = p.pageSize;
  reloadTable();
}

function renderChart() {
  if (!chartEl.value) return;
  if (!chart) chart = echarts.init(chartEl.value);
  const days = summaryDays.value;
  chart.setOption(
    {
      tooltip: { trigger: 'axis' },
      legend: { data: ['员工笔记数', '笔记曝光', '私信进线', '私信留资'] },
      grid: { left: 60, right: 70, top: 40, bottom: 30 },
      xAxis: { type: 'category', data: days.map((d) => d.date.slice(5)) },
      yAxis: [
        { type: 'value', name: '笔记/私信' },
        { type: 'value', name: '曝光', axisLabel: { formatter: (v) => (v >= 10000 ? `${Math.round(v / 1000)}k` : v) } },
      ],
      series: [
        { name: '员工笔记数', type: 'line', smooth: true, data: days.map((d) => d.create_note_num ?? 0), itemStyle: { color: '#3456E6' } },
        { name: '笔记曝光', type: 'line', smooth: true, yAxisIndex: 1, data: days.map((d) => d.soc_read_cnt ?? 0), itemStyle: { color: '#16a34a' } },
        { name: '私信进线', type: 'line', smooth: true, data: days.map((d) => d.message_open_cnt ?? 0), itemStyle: { color: '#d97706' } },
        { name: '私信留资', type: 'line', smooth: true, data: days.map((d) => d.msg_leads_num ?? 0), itemStyle: { color: '#7c3aed' } },
      ],
    },
    { notMerge: true },
  );
}

function doExport() {
  const rows = list.value.map((r, i) =>
    dim.value === 'brand'
      ? {
          排名: (pagination.value.current - 1) * pagination.value.pageSize + i + 1,
          主账户: r.brandUserName,
          类型: r.accountType ?? '',
          员工号权限: r.hasOpenKos === true ? '已开通' : '未开通',
          投广: r.hasAdsBrand === true ? '是' : '否',
          绑定员工数: r.kosAccountNum ?? 0,
          笔记数: r.createNoteNum ?? 0,
          笔记曝光: r.socReadCnt ?? 0,
          粉丝数: r.fansNum ?? 0,
          私信进线: r.messageOpenCnt ?? 0,
          私信开口: r.messageDrivingOpenCnt ?? 0,
          私信留资: r.msgLeadsNum ?? 0,
          表单留资: r.leadsSuccess ?? 0,
          投广消耗: r.rtbIncomeAmt ?? 0,
        }
      : {
          排名: (pagination.value.current - 1) * pagination.value.pageSize + i + 1,
          员工昵称: r.nickname ?? '',
          员工姓名: r.staffName ?? '',
          所属主账户: r.brandUserName ?? '',
          笔记数: r.createNoteNum ?? 0,
          曝光: r.socImpCnt ?? 0,
          阅读: r.socClickCnt ?? 0,
          互动: r.socEnageCnt ?? 0,
          CTR: r.socImpCnt ? `${((r.socClickCnt / r.socImpCnt) * 100).toFixed(2)}%` : '0.00%',
          粉丝数: r.fansNum ?? 0,
          新增粉丝: r.addFansNum ?? 0,
          私信进线: r.messageOpenCnt ?? 0,
          私信开口: r.messageDrivingOpenCnt ?? 0,
          私信留资: r.msgLeadsNum ?? 0,
          表单留资: r.leadsSuccess ?? 0,
          投广消耗: r.rtbIncomeAmt ?? 0,
        },
  );
  exportExcel(
    [{ name: dim.value === 'brand' ? '主账户维度' : '员工号维度', rows }],
    `员工矩阵分析_${dim.value === 'brand' ? '主账户' : '员工号'}`,
  );
}

function onResize() {
  chart?.resize();
}

onMounted(async () => {
  try {
    await reloadSummary();
  } catch (e) {
    message.error(e.message || '加载员工矩阵汇总失败');
  }
  reloadTable();
  window.addEventListener('resize', onResize);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
  chart?.dispose();
});
</script>

<style scoped>
.hero-card :deep(.ant-card-body) {
  padding: 16px 20px;
}
.hero-banner {
  display: flex;
  align-items: center;
  gap: 18px;
  flex-wrap: wrap;
}
.hero-item {
  min-width: 96px;
}
.hero-label {
  font-size: 12px;
  color: #64748b;
}
.hero-value {
  font-size: 24px;
  font-weight: 700;
  margin-top: 2px;
}
.hero-value.primary {
  color: #3456e6;
}
.hero-value.violet {
  color: #7c3aed;
}
.hero-value.green {
  color: #16a34a;
}
.hero-divider {
  width: 1px;
  height: 34px;
  background: #e2e8f0;
}
.hero-tip {
  margin-top: 10px;
  font-size: 12px;
  color: #94a3b8;
}
.name-main {
  font-weight: 600;
}
.name-sub {
  font-size: 12px;
  color: #94a3b8;
}
</style>
