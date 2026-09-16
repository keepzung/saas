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

    <NoticeBar>数据说明：销量与线索数据为代理商月度上报口径，排行按当月总销量降序。</NoticeBar>

    <div class="overview-blocks">
      <div class="ob-card">
        <div class="ob-label">本月总销量</div>
        <div class="ob-value">{{ monthSummary.total_sales.toLocaleString() }}</div>
      </div>
      <div class="ob-card">
        <div class="ob-label">本月线索数</div>
        <div class="ob-value green">{{ monthSummary.leads_count.toLocaleString() }}</div>
      </div>
      <div class="ob-card">
        <div class="ob-label">上榜代理商</div>
        <div class="ob-value">{{ list.length }}</div>
      </div>
    </div>

    <div class="charts-row">
      <a-card :bordered="false" size="small" title="月度销量 & 线索趋势" class="chart-card">
        <div ref="trendEl" class="echart-area" />
      </a-card>
      <a-card :bordered="false" size="small" title="代理商销量 TOP10" class="chart-card chart-card-rank">
        <div ref="rankEl" class="echart-area" />
      </a-card>
    </div>

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
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { message } from 'ant-design-vue';
import * as echarts from 'echarts';
import PageWrapper from '../../components/PageWrapper.vue';
import NoticeBar from '../../components/NoticeBar.vue';
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
    nextTick(renderCharts);
  } catch (e) {
    message.error(e.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

const trendEl = ref(null);
const rankEl = ref(null);
let trendChart = null;
let rankChart = null;

function renderCharts() {
  if (trendEl.value) {
    if (!trendChart) trendChart = echarts.init(trendEl.value);
    const ms = [...months.value].reverse();
    trendChart.setOption({
      tooltip: { trigger: 'axis' },
      legend: { data: ['总销量', '线索数'] },
      grid: { left: 60, right: 40, top: 40, bottom: 30 },
      xAxis: { type: 'category', data: ms.map((m) => m.month) },
      yAxis: [
        { type: 'value', name: '销量' },
        { type: 'value', name: '线索' },
      ],
      series: [
        {
          name: '总销量',
          type: 'bar',
          data: ms.map((m) => m.total_sales),
          itemStyle: { color: '#5087ec', borderRadius: [4, 4, 0, 0] },
          barMaxWidth: 28,
        },
        {
          name: '线索数',
          type: 'line',
          smooth: true,
          yAxisIndex: 1,
          data: ms.map((m) => m.leads_count),
          itemStyle: { color: '#36b37e' },
        },
      ],
    });
  }
  if (rankEl.value) {
    if (!rankChart) rankChart = echarts.init(rankEl.value);
    const top10 = [...list.value]
      .sort((a, b) => b.total_sales - a.total_sales)
      .slice(0, 10)
      .reverse();
    rankChart.setOption({
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 120, right: 40, top: 16, bottom: 30 },
      xAxis: { type: 'value' },
      yAxis: {
        type: 'category',
        data: top10.map((r) => r.dealer_name),
        axisLabel: { width: 110, overflow: 'truncate' },
      },
      series: [
        {
          name: '总销量',
          type: 'bar',
          data: top10.map((r) => r.total_sales),
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
              { offset: 0, color: '#5087ec' },
              { offset: 1, color: '#8cc8ff' },
            ]),
            borderRadius: [0, 4, 4, 0],
          },
          barMaxWidth: 16,
          label: { show: true, position: 'right', fontSize: 11, color: '#64748b' },
        },
      ],
    });
  }
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
.overview-blocks {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
}

.ob-card {
  min-height: 100px;
  background: linear-gradient(135deg, #f0f8ff, #fff);
  border-radius: 12px;
  border: 1px solid rgba(80, 135, 236, 0.1);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 12px;
}

.ob-card:first-child {
  background: linear-gradient(135deg, #eff6ff, #fff);
}

.ob-label {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.ob-value {
  font-size: 20px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: #1e293b;
}

.ob-value.green {
  color: #16a34a;
}

.charts-row {
  display: flex;
  gap: 12px;
  align-items: stretch;
}

.chart-card {
  flex: 1;
  min-width: 0;
}

.chart-card-rank {
  flex: 0 0 380px;
}

.echart-area {
  height: 320px;
}

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
