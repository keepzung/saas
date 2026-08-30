<template>
  <PageWrapper title="车型销量排行" subtitle="代理商维度销量与线索数排行（月度）">
    <template #extra>
      <a-select
        v-model:value="month"
        size="small"
        style="width: 140px"
        :options="monthOptions"
        @change="reload"
      />
    </template>

    <a-row :gutter="12">
      <a-col :span="8">
        <a-card :bordered="false" size="small">
          <a-statistic
            title="本月总销量"
            :value="monthSummary.total_sales"
            :value-style="{ color: '#3456E6' }"
          />
        </a-card>
      </a-col>
      <a-col :span="8">
        <a-card :bordered="false" size="small">
          <a-statistic
            title="本月线索数"
            :value="monthSummary.leads_count"
            :value-style="{ color: '#16a34a' }"
          />
        </a-card>
      </a-col>
      <a-col :span="8">
        <a-card :bordered="false" size="small">
          <a-statistic title="上榜代理商" :value="list.length" />
        </a-card>
      </a-col>
    </a-row>

    <a-card :bordered="false">
      <a-table
        :columns="columns"
        :data-source="list"
        :loading="loading"
        :pagination="false"
        row-key="rank"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'rank'">
            <span :class="['rank-badge', `rank-${record.rank}`]">{{ record.rank }}</span>
          </template>
          <template v-else-if="column.key === 'total_sales'">
            <div class="bar-cell">
              <span class="bar-num">{{ record.total_sales.toLocaleString() }}</span>
              <div class="bar-track">
                <div
                  class="bar-fill"
                  :style="{ width: `${(record.total_sales / maxSales) * 100}%` }"
                />
              </div>
            </div>
          </template>
        </template>
      </a-table>
    </a-card>
  </PageWrapper>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { message } from 'ant-design-vue';
import PageWrapper from '../../components/PageWrapper.vue';
import { getModelSales } from '../../api/kox';

const columns = [
  { key: 'rank', title: '排名', width: 80 },
  { title: '代理商', dataIndex: 'dealer_name' },
  { title: '车型', dataIndex: 'model_name' },
  { key: 'total_sales', title: '总销量' },
  { title: '线索数', dataIndex: 'leads_count', width: 120, sorter: (a, b) => a.leads_count - b.leads_count },
];

const list = ref([]);
const months = ref([]);
const month = ref(undefined);
const loading = ref(false);

const monthOptions = computed(() =>
  months.value.map((m) => ({
    value: m.month,
    label: `${m.month}（销 ${m.total_sales} / 线索 ${m.leads_count}）`,
  })),
);
const monthSummary = computed(
  () => months.value.find((m) => m.month === month.value) ?? { total_sales: 0, leads_count: 0 },
);
const maxSales = computed(() =>
  list.value.reduce((mx, r) => Math.max(mx, r.total_sales), 1),
);

async function reload() {
  loading.value = true;
  try {
    const res = await getModelSales({ month: month.value || undefined });
    list.value = res.list;
    months.value = res.months;
    month.value = res.month;
  } catch (e) {
    message.error(e.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

onMounted(reload);
</script>

<style scoped>
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
}

.sum-row {
  margin-bottom: 16px;
}

.rank-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  font-weight: 600;
  font-size: 12px;
  background: rgba(0, 0, 0, 0.06);
}

.rank-1 { background: #ffd700; color: #fff; }
.rank-2 { background: #bfbfbf; color: #fff; }
.rank-3 { background: #d48806; color: #fff; }

.bar-cell {
  display: flex;
  align-items: center;
  gap: 12px;
}

.bar-num {
  width: 70px;
  text-align: right;
  font-weight: 500;
}

.bar-track {
  flex: 1;
  height: 8px;
  background: rgba(0, 0, 0, 0.06);
  border-radius: 4px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #3456e6, #69b1ff);
  border-radius: 4px;
}

.muted {
  color: var(--color-text-secondary);
}
</style>
