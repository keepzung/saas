<template>
  <PageWrapper title="项目报表" subtitle="投放项目效果汇总">
    <template #extra>
      <a-button size="small" class="export-btn" :loading="exporting" @click="exportExcelData">
        <DownloadOutlined /> 数据导出
      </a-button>
      <a-button type="primary" size="small" @click="goAdd">
        <PlusOutlined /> 新增项目
      </a-button>
    </template>

    <NoticeBar v-if="mode === 'demo'">数据说明：当前为演示数据，聚光平台授权接入后将替换为真实项目数据。</NoticeBar>
    <NoticeBar v-else-if="mode === 'real'">数据来源：小红书星火平台（聚光投放），每日 T+1 更新；项目消耗按「项目周期 × 关联账户」自动聚合。</NoticeBar>

    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-label">项目数</div>
        <div class="stat-value">{{ list.length }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">总预算</div>
        <div class="stat-value">¥{{ fmt(totalBudget) }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">实际消耗</div>
        <div class="stat-value hl-blue">¥{{ fmt(totalCost) }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">预算消耗率</div>
        <div class="stat-value hl-green">{{ budgetRate }}%</div>
      </div>
    </div>

    <a-card :bordered="false">
      <a-table
        :columns="columns"
        :data-source="list"
        :loading="loading"
        :pagination="false"
        row-key="id"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <div class="c-name">{{ record.name }}</div>
            <div class="muted small">{{ record.strategy || record.remark || (record.account_num ? `关联 ${record.account_num} 个投放账户` : '') }}</div>
          </template>
          <template v-else-if="column.key === 'budget'">
            <div v-if="record.budget" class="budget-cell">
              <span>¥{{ fmt(record.budget) }}</span>
              <div class="bar-track">
                <div
                  class="bar-fill"
                  :class="{ warn: record.cost / record.budget > 0.9 }"
                  :style="{ width: `${Math.min(100, (record.cost / record.budget) * 100)}%` }"
                />
              </div>
              <span class="muted small">{{ ((record.cost / record.budget) * 100).toFixed(0) }}%</span>
            </div>
            <div v-else class="budget-cell">
              <span class="muted small">未设预算</span>
              <div class="bar-track">
                <div class="bar-fill" :style="{ width: '0%' }" />
              </div>
              <span class="muted small">¥{{ fmt(record.cost) }} 已消耗</span>
            </div>
          </template>
          <template v-else-if="column.key === 'actions'">
            <a-popconfirm :title="`确认删除项目「${record.name}」？`" @confirm="removeItem(record)">
              <a-button type="link" size="small" danger>删除</a-button>
            </a-popconfirm>
          </template>
        </template>
      </a-table>
    </a-card>
  </PageWrapper>
</template>

<script setup>
import { computed, ref } from 'vue';
import { message } from 'ant-design-vue';
import { PlusOutlined, DownloadOutlined } from '@ant-design/icons-vue';
import { useRouter } from 'vue-router';
import dayjs from 'dayjs';
import PageWrapper from '../../components/PageWrapper.vue';
import NoticeBar from '../../components/NoticeBar.vue';
import { getSparkProjects, deleteSparkProject } from '../../api/spark';
import { exportExcel } from '../../utils/excel';
import { useAuthStore } from '../../stores/auth';

const router = useRouter();
const auth = useAuthStore();
const exporting = ref(false);

async function exportExcelData() {
  exporting.value = true;
  try {
    let rows = [];
    if (mode.value === 'real') {
      const res = await getSparkProjects({ brandId: auth.currentBrandId ?? 2 });
      rows = (res.list ?? []).map((p) => ({
        项目名称: p.name,
        项目周期: p.period,
        关联账户数: p.account_num,
        预算: p.budget ?? '',
        消耗: p.fee,
        预算进度: p.budget_rate != null ? `${p.budget_rate}%` : '未设预算',
        曝光量: p.impression,
        点击量: p.click,
        点击率: `${p.ctr}%`,
        互动量: p.interaction,
        私信留资: p.msg_leads,
        留资成本: p.msg_leads ? p.msg_lead_cost : '-',
        创建人: p.created_by,
        备注: p.remark ?? '',
      }));
    } else {
      rows = list.value.map((r) => ({
        项目名称: r.name,
        项目周期: r.period,
        预算: r.budget,
        消耗: r.cost,
        曝光量: r.impressions,
        点击量: r.clicks,
        点击率: r.ctr,
        互动量: r.interactions,
        私信留资: r.pm_leads,
        留资成本: r.lead_cost,
      }));
      message.warning('当前为演示数据，导出内容为示意数据');
    }
    exportExcel([{ name: '项目报表', rows }], '项目报表数据');
    message.success('Excel 导出成功');
  } catch {
    message.error('导出失败，请稍后重试');
  } finally {
    exporting.value = false;
  }
}

const rand = (seed) => {
  const x = Math.sin(seed * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

const genItem = (i) => {
  const budget = Math.round((3 + rand(i + 1) * 12) * 10000);
  const cost = Math.round(budget * (0.35 + rand(i + 5) * 0.65));
  const impressions = Math.round(cost * (20 + rand(i + 7) * 24));
  const clicks = Math.round(impressions * (0.011 + rand(i + 11) * 0.024));
  const interactions = Math.round(clicks * (0.3 + rand(i + 13) * 0.4));
  const pmLeads = Math.round(clicks * (0.02 + rand(i + 17) * 0.04));
  return {
    id: i + 1,
    name: `荣威${['D7首发', 'RX5金九银十', 'i5年末冲量', 'IMAX8商务季', '品牌周年庆', '区域车展'][i % 6]}投放项目`,
    strategy: ['搜索+信息流组合', '信息流放量', '视频流优先', '搜索抢量'][Math.floor(rand(i + 19) * 4)],
    period: `${dayjs().subtract(30 - i * 4, 'day').format('YYYY-MM-DD')} ~ ${dayjs().subtract(20 - i * 4, 'day').format('YYYY-MM-DD')}`,
    budget,
    cost,
    impressions,
    clicks,
    interactions,
    ctr: ((clicks / impressions) * 100).toFixed(2),
    pm_leads: pmLeads,
    lead_cost: pmLeads ? (cost / pmLeads).toFixed(1) : '-',
  };
};

const mode = ref('loading'); // 'loading' | 'real' | 'demo'
const loading = ref(false);
const list = ref([]);

const demoList = ref(Array.from({ length: 6 }, (_, i) => genItem(i)));

const totalBudget = computed(() =>
  list.value.reduce((a, r) => a + (r.budget ?? 0), 0),
);
const totalCost = computed(() =>
  list.value.reduce((a, r) => a + (r.cost ?? r.fee ?? 0), 0),
);
const budgetRate = computed(() =>
  totalBudget.value ? ((totalCost.value / totalBudget.value) * 100).toFixed(1) : 0,
);

const fmt = (v) => Number(v ?? 0).toLocaleString();

const isDf = [7, 8].includes(Number(auth.currentBrandId));

const columns = computed(() => {
  const base = [
    { key: 'name', title: '项目名称' },
  ];
  if (isDf) base.push({ title: '大区', dataIndex: 'region', width: 100 });
  base.push(
    { title: '项目周期', dataIndex: 'period', width: 200 },
    { key: 'budget', title: '预算 / 消耗', width: 180 },
    { title: '展现量', dataIndex: 'impressions', width: 100, sorter: (a, b) => a.impressions - b.impressions },
    { title: '点击量', dataIndex: 'clicks', width: 90 },
    { title: '点击率', dataIndex: 'ctr', width: 85 },
    { title: '互动量', dataIndex: 'interactions', width: 90 },
    { title: '私信留资', dataIndex: 'pm_leads', width: 95 },
    { title: '留资成本', dataIndex: 'lead_cost', width: 95 },
    { key: 'actions', title: '操作', width: 80 },
  );
  return base;
});

async function load() {
  loading.value = true;
  try {
    const res = await getSparkProjects({
      brandId: auth.currentBrandId ?? 2,
    });
    if ((res.total ?? 0) > 0) {
      mode.value = 'real';
      list.value = (res.list ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        remark: p.remark,
        account_num: p.account_num,
        period: p.period,
        budget: p.budget,
        cost: p.fee,
        impressions: p.impression,
        clicks: p.click,
        ctr: p.ctr ? `${p.ctr}%` : '0',
        interactions: p.interaction,
        pm_leads: p.msg_leads,
        lead_cost: p.msg_leads ? p.msg_lead_cost : '-',
        created_by: p.created_by,
      }));
    } else {
      mode.value = 'demo';
      list.value = demoList.value;
    }
  } catch {
    mode.value = 'demo';
    list.value = demoList.value;
  } finally {
    loading.value = false;
  }
}
load();

async function removeItem(record) {
  if (mode.value === 'real') {
    try {
      await deleteSparkProject(record.id);
      message.success(`项目「${record.name}」已删除`);
      await load();
    } catch {
      message.error('删除失败，请稍后重试');
    }
  } else {
    demoList.value = demoList.value.filter((r) => r.id !== record.id);
    list.value = demoList.value;
    message.success(`项目「${record.name}」已删除（演示）`);
  }
}

function goAdd() {
  router.push('/kox_df/campaign-analysis/add');
}
</script>

<style scoped>
.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}

.stat-card {
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  padding: 14px 16px;
}

.stat-label {
  font-size: 12px;
  color: var(--color-text-secondary, #64748b);
}

.stat-value {
  margin-top: 6px;
  font-size: 22px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.hl-blue { color: #3456e6; }
.hl-green { color: #16a34a; }

.export-btn { margin-right: 8px; }

.c-name { font-weight: 500; }
.muted { color: var(--color-text-secondary, #64748b); }
.small { font-size: 12px; }

.budget-cell { display: flex; flex-direction: column; gap: 3px; }
.bar-track { height: 5px; border-radius: 3px; background: #eef2f7; overflow: hidden; }
.bar-fill { height: 100%; border-radius: 3px; background: #3456e6; }
.bar-fill.warn { background: #d97706; }
</style>
