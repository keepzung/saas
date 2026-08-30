<template>
  <PageWrapper title="品牌监测" subtitle="华帝全平台社媒声量监测：内容、互动与情感倾向">
    <template #extra>
      <a-radio-group v-model:value="platform" size="small" @change="reloadAll">
        <a-radio-button value="">全部平台</a-radio-button>
        <a-radio-button value="douyin">抖音</a-radio-button>
        <a-radio-button value="xhs">小红书</a-radio-button>
      </a-radio-group>
      <a-range-picker v-model:value="range" size="small" @change="reloadAll" />
      <a-button size="small" @click="exportCsv">
        <DownloadOutlined /> 导出
      </a-button>
    </template>

    <template #filters>
      <FilterTopbar>
        <a-input-search
          v-model:value="keyword"
          placeholder="标题 / 作者"
          style="width: 220px"
          allow-clear
          @search="reloadContents"
        />
        <a-select
          v-model:value="sentiment"
          style="width: 120px"
          allow-clear
          placeholder="情感倾向"
          :options="[
            { value: 'positive', label: '正面' },
            { value: 'neutral', label: '中性' },
            { value: 'negative', label: '负面' },
          ]"
          @change="reloadContents"
        />
        <template #actions>
          <span class="muted">共 {{ total }} 条监测内容</span>
        </template>
      </FilterTopbar>
    </template>

    <a-card :bordered="false" class="stat-card">
      <a-row :gutter="16">
        <a-col :span="5">
          <a-statistic title="监测内容量" :value="ov.content_cnt" />
        </a-col>
        <a-col :span="5">
          <a-statistic
            title="总曝光"
            :value="ov.view_sum"
            :value-style="{ color: '#3456E6' }"
          />
        </a-col>
        <a-col :span="5">
          <a-statistic
            title="总互动"
            :value="ov.interaction_sum"
            :value-style="{ color: '#16a34a' }"
          />
        </a-col>
        <a-col :span="5">
          <a-statistic
            title="负面内容"
            :value="ov.negative_cnt"
            :value-style="{ color: '#dc2626' }"
          />
        </a-col>
        <a-col :span="4">
          <a-statistic
            title="负面占比"
            :value="ov.negative_rate"
            suffix="%"
            :value-style="{ color: ov.negative_rate > 10 ? '#dc2626' : '#d97706' }"
          />
        </a-col>
      </a-row>
    </a-card>

    <a-card :bordered="false" size="small" title="声量趋势">
      <div ref="chartEl" style="height: 280px" />
    </a-card>

    <a-card :bordered="false">
      <a-table
        :columns="columns"
        :data-source="list"
        :loading="loading"
        :pagination="pager"
        row-key="id"
        size="small"
        @change="onTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'title'">
            <a @click="openDetail(record)">{{ record.title }}</a>
          </template>
          <template v-else-if="column.key === 'platform'">
            <a-tag :color="record.platform === 'douyin' ? 'blue' : 'red'">
              {{ record.platform === 'douyin' ? '抖音' : '小红书' }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'content_type'">
            {{ typeLabel[record.content_type] ?? record.content_type }}
          </template>
          <template v-else-if="column.key === 'author'">
            <div>{{ record.author_name }}</div>
            <a-tag class="mini" :color="authorColor[record.author_type]">
              {{ record.author_type }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'sentiment'">
            <a-tag :color="sentimentColor[record.sentiment]">
              {{ sentimentLabel[record.sentiment] }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'action'">
            <a @click="openDetail(record)">详情</a>
            <a-divider type="vertical" />
            <a-popconfirm
              title="确定该内容与本监测项目无关?"
              @confirm="mark(record)"
            >
              <a class="danger">无关</a>
            </a-popconfirm>
          </template>
        </template>
      </a-table>
    </a-card>

    <a-drawer v-model:open="detailOpen" width="520" title="内容详情">
      <template v-if="detailRow">
        <a-descriptions :column="1" size="small" bordered>
          <a-descriptions-item label="标题">{{ detailRow.title }}</a-descriptions-item>
          <a-descriptions-item label="平台">
            {{ detailRow.platform === 'douyin' ? '抖音' : '小红书' }}
            · {{ typeLabel[detailRow.content_type] }}
          </a-descriptions-item>
          <a-descriptions-item label="作者">
            {{ detailRow.author_name }}（{{ detailRow.author_type }}）
          </a-descriptions-item>
          <a-descriptions-item label="发布时间">
            {{ fmtTime(detailRow.publish_at) }}
          </a-descriptions-item>
          <a-descriptions-item label="情感倾向">
            <a-tag :color="sentimentColor[detailRow.sentiment]">
              {{ sentimentLabel[detailRow.sentiment] }}
            </a-tag>
          </a-descriptions-item>
        </a-descriptions>
        <div class="metric-grid">
          <div class="metric"><b>{{ fmt(detailRow.views) }}</b><span>阅读</span></div>
          <div class="metric"><b>{{ fmt(detailRow.likes) }}</b><span>点赞</span></div>
          <div class="metric"><b>{{ fmt(detailRow.comments) }}</b><span>评论</span></div>
          <div class="metric"><b>{{ fmt(detailRow.shares) }}</b><span>分享</span></div>
          <div class="metric"><b>{{ fmt(detailRow.collects) }}</b><span>收藏</span></div>
        </div>
      </template>
    </a-drawer>
  </PageWrapper>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { message } from 'ant-design-vue';
import { DownloadOutlined } from '@ant-design/icons-vue';
import dayjs from 'dayjs';
import * as echarts from 'echarts';
import PageWrapper from '../../components/PageWrapper.vue';
import FilterTopbar from '../../components/FilterTopbar.vue';
import {
  getInsightContents,
  getInsightOverview,
  markIrrelevant,
} from '../../api/insight';

const typeLabel = { note: '图文', video: '视频', live: '直播' };
const sentimentLabel = { positive: '正面', neutral: '中性', negative: '负面' };
const sentimentColor = { positive: 'success', neutral: 'default', negative: 'error' };
const authorColor = { KOC: 'cyan', KOS: 'blue', OFFICIAL: 'gold' };

const columns = [
  { key: 'title', title: '内容标题' },
  { key: 'platform', title: '平台', width: 90 },
  { key: 'content_type', title: '形式', width: 70 },
  { key: 'author', title: '作者', width: 150 },
  { key: 'views', title: '阅读', dataIndex: 'views', width: 100, sorter: (a, b) => a.views - b.views },
  { key: 'likes', title: '点赞', dataIndex: 'likes', width: 90, sorter: (a, b) => a.likes - b.likes },
  { key: 'comments', title: '评论', dataIndex: 'comments', width: 90 },
  { key: 'shares', title: '分享', dataIndex: 'shares', width: 90 },
  { key: 'sentiment', title: '情感', width: 80 },
  { key: 'publish_at', title: '发布时间', width: 110 },
  { key: 'action', title: '操作', width: 130 },
];

const ov = ref({});
const platform = ref('');
const range = ref([dayjs().subtract(29, 'day'), dayjs()]);

const list = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(15);
const loading = ref(false);
const keyword = ref('');
const sentiment = ref(undefined);

const detailOpen = ref(false);
const detailRow = ref(null);

const chartEl = ref(null);
let chart = null;

const pager = computed(() => ({
  current: page.value,
  pageSize: pageSize.value,
  total: total.value,
  showSizeChanger: false,
}));

const fmt = (n) => (n ?? 0).toLocaleString();
const fmtTime = (t) => (t ? dayjs(t).format('YYYY-MM-DD HH:mm') : '-');

async function reloadOverview() {
  try {
    const params = { platform: platform.value || undefined };
    if (range.value?.[0]) {
      params.start = range.value[0].format('YYYY-MM-DD');
      params.end = range.value[1].format('YYYY-MM-DD');
    }
    ov.value = await getInsightOverview(params);
    nextTick(renderChart);
  } catch (e) {
    message.error(e.message || '加载总览失败');
  }
}

async function reloadContents() {
  loading.value = true;
  try {
    const res = await getInsightContents({
      page: page.value,
      page_size: pageSize.value,
      platform: platform.value || undefined,
      sentiment: sentiment.value || undefined,
      keyword: keyword.value || undefined,
    });
    list.value = res.list.map((r) => ({
      ...r,
      publish_at: dayjs(r.publish_at).format('YYYY-MM-DD'),
    }));
    total.value = res.total;
  } catch (e) {
    message.error(e.message || '加载内容失败');
  } finally {
    loading.value = false;
  }
}

function reloadAll() {
  reloadOverview();
  reloadContents();
}

function onTableChange(p) {
  page.value = p.current;
  reloadContents();
}

function renderChart() {
  if (!chartEl.value) return;
  if (!chart) chart = echarts.init(chartEl.value);
  const trend = ov.value.trend ?? [];
  chart.setOption({
    tooltip: { trigger: 'axis' },
    legend: { data: ['内容量', '曝光量', '互动量', '负面内容'] },
    grid: { left: 60, right: 60, top: 40, bottom: 30 },
    xAxis: { type: 'category', data: trend.map((t) => t.date.slice(5)) },
    yAxis: [
      { type: 'value', name: '内容量' },
      { type: 'value', name: '曝光/互动', axisLabel: { formatter: (v) => `${Math.round(v / 10000)}w` } },
    ],
    series: [
      { name: '内容量', type: 'bar', data: trend.map((t) => t.content_cnt), itemStyle: { color: '#3456E6' } },
      { name: '曝光量', type: 'line', smooth: true, yAxisIndex: 1, data: trend.map((t) => t.view_sum), itemStyle: { color: '#16a34a' } },
      { name: '互动量', type: 'line', smooth: true, yAxisIndex: 1, data: trend.map((t) => t.interaction_sum), itemStyle: { color: '#d97706' } },
      { name: '负面内容', type: 'line', data: trend.map((t) => t.negative_cnt), itemStyle: { color: '#dc2626' } },
    ],
  });
}

function openDetail(record) {
  detailRow.value = record;
  detailOpen.value = true;
}

async function mark(record) {
  try {
    await markIrrelevant(record.id);
    message.success('已标记为无关内容');
    reloadContents();
    reloadOverview();
  } catch (e) {
    message.error(e.message || '操作失败');
  }
}

function exportCsv() {
  const header = ['平台', '形式', '标题', '作者', '阅读', '点赞', '评论', '分享', '情感', '发布时间'];
  const rows = list.value.map((r) => [
    r.platform,
    typeLabel[r.content_type] ?? r.content_type,
    r.title,
    r.author_name,
    r.views,
    r.likes,
    r.comments,
    r.shares,
    sentimentLabel[r.sentiment],
    r.publish_at,
  ]);
  const csv = [header, ...rows]
    .map((line) => line.map((c) => `"${String(c ?? '')}"`).join(','))
    .join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `品牌监测_${dayjs().format('YYYYMMDD')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function onResize() {
  chart?.resize();
}

onMounted(() => {
  reloadAll();
  window.addEventListener('resize', onResize);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
  chart?.dispose();
});
</script>

<style scoped>
.metric-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 12px;
  margin-top: 16px;
}

.metric {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 0;
  background: var(--color-border-secondary);
  border-radius: 8px;
}

.metric b {
  font-size: 16px;
}

.metric span {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-top: 4px;
}

.muted {
  color: var(--color-text-secondary);
}

.mini {
  font-size: 11px;
}

.danger {
  color: var(--color-error);
}
</style>
