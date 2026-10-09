<template>
  <PageWrapper title="投流周期报表">
    <FilterTopbar>
      <a-radio-group v-model:value="preset" button-style="solid" @change="applyPreset">
        <a-radio-button value="yesterday">昨天</a-radio-button>
        <a-radio-button value="7">近7天</a-radio-button>
        <a-radio-button value="30">近30天</a-radio-button>
        <a-radio-button value="90">近90天</a-radio-button>
        <a-radio-button value="custom">自定义</a-radio-button>
      </a-radio-group>
      <a-range-picker v-model:value="range" :disabled="preset !== 'custom'" @change="load" />
      <a-button type="primary" @click="load">查询</a-button>
      <a-button @click="doExport">导出周期数据表</a-button>
    </FilterTopbar>

    <a-spin :spinning="loading">
      <div class="report-hero">
        <div class="hero-title">所选周期内数据总览</div>
        <div class="hero-row">
          <div v-for="c in mainCards" :key="c.label" class="hero-cell">
            <div class="hero-label">{{ c.label }}</div>
            <div class="hero-value" :class="c.tone">{{ c.value }}</div>
          </div>
        </div>
        <div class="hero-row second">
          <div v-for="c in costCards" :key="c.label" class="hero-cell">
            <div class="hero-label">{{ c.label }}</div>
            <div class="hero-value cost">{{ c.value }}</div>
          </div>
        </div>
      </div>

      <div class="detail-card">
        <div class="detail-head">
          <span class="detail-title">数据明细</span>
          <a-radio-group v-model:value="tab" button-style="solid" @change="load">
            <a-radio-button value="base">{{ isTesla ? '全部投流' : '基础投流' }}</a-radio-button>
            <template v-if="isTesla">
              <a-radio-button value="投喂账号">投喂账号</a-radio-button>
              <a-radio-button value="全托管">全托管</a-radio-button>
              <a-radio-button value="CE运营">CE运营</a-radio-button>
              <a-radio-button value="陪跑KOS">陪跑KOS</a-radio-button>
            </template>
          </a-radio-group>
          <span v-if="isTesla && tab !== 'base'" class="muted small">口径：聚光笔记报表逐笔记×账号标签（{{ tab }}）</span>
        </div>
        <a-table
          :columns="detailColumns"
          :data-source="rows"
          :pagination="false"
          row-key="date"
          size="middle"
          :scroll="{ x: 1080 }"
        >
          <template #emptyText>
            <a-empty description="所选周期内暂无投放数据（聚光 T+1 回流后自动出数）" />
          </template>
        </a-table>
      </div>
    </a-spin>
  </PageWrapper>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { message } from 'ant-design-vue';
import dayjs from 'dayjs';
import PageWrapper from '../../components/PageWrapper.vue';
import FilterTopbar from '../../components/FilterTopbar.vue';
import { getSparkCampaignSummary } from '../../api/spark';
import { useAuthStore } from '../../stores/auth';
import { exportExcel } from '../../utils/excel';

const auth = useAuthStore();
const brandParam = () => ({ brandId: auth.currentBrandId ?? undefined });
// 特斯拉：周期报表支持按账号类型分类（投喂账号/全托管/CE运营/陪跑KOS）
const isTesla = computed(() => (auth.currentBrandId ?? 0) === 6);

const loading = ref(false);
const preset = ref('7');
const range = ref([dayjs().subtract(6, 'day'), dayjs()]);
const tab = ref('base');

const summary = ref({});
const trend = ref([]);

const fmtInt = (v) => Number(v ?? 0).toLocaleString('zh-CN');
const fmtMoney = (v) =>
  `¥${Number(v ?? 0)
    .toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const mainCards = computed(() => [
  { label: '总消耗', value: fmtMoney(summary.value.fee), tone: 'blue' },
  { label: '总曝光', value: fmtInt(summary.value.impression) },
  { label: '总点击', value: fmtInt(summary.value.click) },
  { label: '总点击率', value: `${Number(summary.value.ctr ?? 0).toFixed(2)}%` },
  { label: '私信进线', value: fmtInt(summary.value.msg_inquiries), tone: 'green' },
  { label: '私信开口', value: fmtInt(summary.value.msg_openings), tone: 'green' },
  { label: '私信留资', value: fmtInt(summary.value.msg_leads), tone: 'green' },
]);

const costCards = computed(() => [
  { label: '点击成本', value: fmtMoney(summary.value.cpc) },
  { label: '千次展现成本', value: fmtMoney(summary.value.cpm) },
  { label: '私信进线成本', value: fmtMoney(summary.value.msg_inquiry_cost) },
  { label: '私信开口成本', value: fmtMoney(summary.value.msg_open_cost) },
  { label: '私信留资成本', value: fmtMoney(summary.value.msg_lead_cost) },
]);

const columns = [
  { title: '日期', dataIndex: 'date', width: 120, fixed: 'left' },
  { title: '消耗', dataIndex: 'fee', width: 110 },
  { title: '展现量', dataIndex: 'impression', width: 110 },
  { title: '点击量', dataIndex: 'click', width: 100 },
  { title: '点击率', key: 'ctr', width: 90 },
  { title: '消耗账户数', dataIndex: 'active_accounts', width: 110 },
  { title: '私信进线', dataIndex: 'msg_inquiries', width: 100 },
  { title: '私信开口', dataIndex: 'msg_openings', width: 100 },
  { title: '私信留资', dataIndex: 'msg_leads', width: 100 },
];

const rows = computed(() =>
  trend.value.map((t) => ({
    ...t,
    ctr: t.impression ? `${((t.click / t.impression) * 100).toFixed(2)}%` : '0.00%',
    feeText: fmtMoney(t.fee),
  })),
);

function applyPreset() {
  if (preset.value === 'custom') return;
  const end = dayjs();
  const start =
    preset.value === 'yesterday' ? dayjs().subtract(1, 'day') : end.subtract(Number(preset.value) - 1, 'day');
  range.value = [start, end];
  load();
}

async function load() {
  const [s, e] = range.value ?? [];
  if (!s || !e) return;
  loading.value = true;
  try {
    const data = await getSparkCampaignSummary({
      start: s.format('YYYY-MM-DD'),
      end: e.format('YYYY-MM-DD'),
      ...brandParam(),
      // 特斯拉：账号类型页签切换聚光笔记报表×账号标签口径
      ...(isTesla.value && tab.value !== 'base' ? { accountType: tab.value } : {}),
    });
    summary.value = data.summary ?? {};
    trend.value = data.trend ?? [];
  } catch (e2) {
    message.error(e2.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

// 账号类型页签下：消耗账户数列替换为投放笔记数（笔记报表口径）
const detailColumns = computed(() => {
  if (!(isTesla.value && tab.value !== 'base')) return columns;
  return columns.map((c) =>
    c.dataIndex === 'active_accounts'
      ? { ...c, title: '投放笔记数', dataIndex: 'note_num' }
      : c,
  );
});

function doExport() {
  const byType = isTesla.value && tab.value !== 'base';
  exportExcel(
    [
      {
        name: byType ? `周期总览-${tab.value}` : '周期总览',
        rows: [
          ...mainCards.value.map((c) => ({ 指标: c.label, 数值: c.value.replace(/,/g, '') })),
          ...costCards.value.map((c) => ({ 指标: c.label, 数值: c.value })),
        ],
      },
      {
        name: '逐日明细',
        rows: rows.value.map((r) => ({
          日期: r.date,
          消耗: r.fee,
          展现量: r.impression,
          点击量: r.click,
          点击率: r.ctr,
          [byType ? '投放笔记数' : '消耗账户数']: byType ? r.note_num : r.active_accounts,
          私信进线: r.msg_inquiries,
          私信开口: r.msg_openings,
          私信留资: r.msg_leads,
        })),
      },
    ],
    `投流周期报表${byType ? `_${tab.value}` : ''}_${range.value?.[0]?.format('YYYYMMDD')}-${range.value?.[1]?.format('YYYYMMDD')}.xlsx`,
  );
  message.success('已导出');
}

onMounted(load);
</script>

<style scoped>
.report-hero {
  background: #fff;
  border-radius: 16px;
  padding: 18px 22px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}
.hero-title {
  font-size: 15px;
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 14px;
  padding-left: 10px;
  border-left: 4px solid #3456e6;
  line-height: 1.2;
}
.hero-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 12px;
}
.hero-row.second {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed #e2e8f0;
}
.hero-cell {
  background: #f8fafc;
  border-radius: 10px;
  padding: 10px 12px;
}
.hero-label {
  font-size: 12px;
  color: #64748b;
}
.hero-value {
  margin-top: 4px;
  font-size: 20px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: #1e293b;
}
.hero-value.blue {
  color: #2563eb;
}
.hero-value.green {
  color: #16a34a;
}
.hero-value.cost {
  font-size: 16px;
  color: #d97706;
}
.detail-card {
  margin-top: 12px;
  background: #fff;
  border-radius: 16px;
  padding: 16px 22px 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}
.detail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  gap: 10px;
  flex-wrap: wrap;
}
.muted { color: var(--color-text-secondary, #64748b); }
.small { font-size: 12px; }
.detail-title {
  font-size: 15px;
  font-weight: 600;
  color: #1e293b;
  padding-left: 10px;
  border-left: 4px solid #3456e6;
  line-height: 1.2;
}
</style>
