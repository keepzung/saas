<template>
  <PageWrapper title="项目报表" subtitle="投放项目效果汇总">
    <template #extra>
      <a-button type="primary" size="small" @click="goAdd">
        <PlusOutlined /> 新增项目
      </a-button>
    </template>

    <NoticeBar>数据说明：当前为演示数据，聚光平台授权接入后将替换为真实项目数据。</NoticeBar>

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
        :pagination="false"
        row-key="id"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <div class="c-name">{{ record.name }}</div>
            <div class="muted small">{{ record.strategy }}</div>
          </template>
          <template v-else-if="column.key === 'budget'">
            <div class="budget-cell">
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
          </template>
          <template v-else-if="column.key === 'actions'">
            <a-popconfirm title="确认删除该项目？" @confirm="removeItem(record)">
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
import { PlusOutlined } from '@ant-design/icons-vue';
import { useRouter } from 'vue-router';
import dayjs from 'dayjs';
import PageWrapper from '../../components/PageWrapper.vue';
import NoticeBar from '../../components/NoticeBar.vue';

const router = useRouter();

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
    cpc: (cost / clicks).toFixed(1),
    cpm: (cost / (impressions / 1000)).toFixed(1),
    pm_leads: pmLeads,
    lead_cost: pmLeads ? (cost / pmLeads).toFixed(1) : '-',
  };
};

const list = ref(Array.from({ length: 6 }, (_, i) => genItem(i)));

const totalBudget = computed(() => list.value.reduce((a, r) => a + r.budget, 0));
const totalCost = computed(() => list.value.reduce((a, r) => a + r.cost, 0));
const budgetRate = computed(() =>
  totalBudget.value ? ((totalCost.value / totalBudget.value) * 100).toFixed(1) : 0,
);

const fmt = (v) => Number(v ?? 0).toLocaleString();

const columns = [
  { key: 'name', title: '项目名称 / 投流策略' },
  { title: '项目周期', dataIndex: 'period', width: 200 },
  { key: 'budget', title: '预算 / 消耗', width: 180 },
  { title: '展现量', dataIndex: 'impressions', width: 100, sorter: (a, b) => a.impressions - b.impressions },
  { title: '点击量', dataIndex: 'clicks', width: 90 },
  { title: '点击率', dataIndex: 'ctr', width: 85 },
  { title: '互动量', dataIndex: 'interactions', width: 90 },
  { title: '私信留资', dataIndex: 'pm_leads', width: 95 },
  { title: '留资成本', dataIndex: 'lead_cost', width: 95 },
  { key: 'actions', title: '操作', width: 80 },
];

function removeItem(record) {
  list.value = list.value.filter((r) => r.id !== record.id);
  message.success(`项目「${record.name}」已删除（演示）`);
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

.c-name { font-weight: 500; }
.muted { color: var(--color-text-secondary, #64748b); }
.small { font-size: 12px; }

.budget-cell { display: flex; flex-direction: column; gap: 3px; }
.bar-track { height: 5px; border-radius: 3px; background: #eef2f7; overflow: hidden; }
.bar-fill { height: 100%; border-radius: 3px; background: #3456e6; }
.bar-fill.warn { background: #d97706; }
</style>
