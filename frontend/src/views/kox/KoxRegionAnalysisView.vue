<template>
  <PageWrapper :title="pageTitle" subtitle="区域 / 账号标签聚合双表">
    <template #extra>
      <a-radio-group v-model:value="quick" size="small" @change="onQuickChange">
        <a-radio-button value="7">近7天</a-radio-button>
        <a-radio-button value="30">近30天</a-radio-button>
      </a-radio-group>
      <a-range-picker v-model:value="range" size="small" @change="reload" />
      <a-select
        v-model:value="accountType"
        size="small"
        style="width: 120px"
        allow-clear
        placeholder="账号类型"
        :options="[
          { label: '全部类型', value: '' },
          { label: 'KOS', value: 'KOS' },
          { label: 'KOB', value: 'KOB' },
          { label: 'KOC', value: 'KOC' },
        ]"
        @change="reload"
      />
      <a-button size="small" type="primary" @click="exportAll">导出数据</a-button>
    </template>

    <a-card size="small" :bordered="false">
      <template #title>
        <div class="sec-head"><span class="bar"></span>区域排行</div>
      </template>
      <a-table
        :columns="regionColumns"
        :data-source="rows.regions"
        :loading="loading"
        :pagination="false"
        :scroll="{ x: 1720 }"
        size="small"
        row-key="name"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'rank'">
            <span :class="['rank-badge', index < 3 ? `top${index + 1}` : '']">
              {{ index < 3 ? CROWNS[index] : index + 1 }}
            </span>
          </template>
        </template>
      </a-table>
    </a-card>

    <a-card size="small" :bordered="false">
      <template #title>
        <div class="sec-head"><span class="bar"></span>按账号标签排行</div>
      </template>
      <a-table
        :columns="tagColumns"
        :data-source="rows.tags"
        :loading="loading"
        :pagination="false"
        :scroll="{ x: 1560 }"
        size="small"
        row-key="name"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'rank'">
            <span :class="['rank-badge', index < 3 ? `top${index + 1}` : '']">
              {{ index < 3 ? CROWNS[index] : index + 1 }}
            </span>
          </template>
        </template>
      </a-table>
    </a-card>

    <div class="metric-note">{{ rows.metric_note }}</div>
  </PageWrapper>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { message } from 'ant-design-vue';
import dayjs from 'dayjs';
import PageWrapper from '../../components/PageWrapper.vue';
import { getKoxRegionAnalysis } from '../../api/kox';
import { useAuthStore } from '../../stores/auth';
import { exportExcel } from '../../utils/excel';

const props = defineProps({
  embeddedTitle: { type: String, default: '' },
});

const auth = useAuthStore();
const CROWNS = ['👑', '🥈', '🥉'];
const pageTitle = computed(() => props.embeddedTitle || '区域数据分析');

const quick = ref('7');
const range = ref([dayjs().subtract(6, 'day'), dayjs()]);
const accountType = ref(undefined);
const loading = ref(false);
const rows = ref({ regions: [], tags: [], metric_note: '' });

const numSorter = (field) => (a, b) => (a[field] ?? 0) - (b[field] ?? 0);
const col = (title, key, width = 92, fixed = false) => ({
  title,
  key,
  dataIndex: key,
  width,
  sorter: numSorter(key),
  fixed: fixed || undefined,
  align: key === 'name' ? 'left' : 'right',
});

const regionColumns = computed(() => [
  { title: '排名', key: 'rank', width: 64, fixed: 'left' },
  col('区域', 'name', 110, true),
  col('KOS数', 'kos_cnt', 84),
  col('有发布', 'published_cnt', 84),
  col('无发布', 'unpublished_cnt', 84),
  col('笔记数量', 'note_cnt', 96),
  col('曝光', 'exposure_sum', 104),
  col('阅读', 'view_sum', 104),
  col('互动', 'interaction_sum', 96),
  col('CES', 'ces_sum', 96),
  col('账号平均笔记', 'avg_notes', 116),
  col('笔记平均曝光', 'avg_exposure', 120),
  col('笔记平均CES', 'avg_ces', 112),
  col('私信进线', 'pm_inquiries', 96),
  col('私信开口', 'pm_openings', 96),
  col('自然留资', 'organic_leads', 96),
  col('私信留资', 'pm_leads', 96),
]);

const tagColumns = computed(() => [
  { title: '排名', key: 'rank', width: 64, fixed: 'left' },
  col('账号标签', 'name', 120, true),
  col('KOS数', 'kos_cnt', 84),
  col('有发布', 'published_cnt', 84),
  col('无发布', 'unpublished_cnt', 84),
  col('笔记数量', 'note_cnt', 96),
  col('曝光', 'exposure_sum', 104),
  col('阅读', 'view_sum', 104),
  col('互动', 'interaction_sum', 96),
  col('CES', 'ces_sum', 96),
  col('账号平均笔记', 'avg_notes', 116),
  col('笔记平均曝光', 'avg_exposure', 120),
  col('笔记平均CES', 'avg_ces', 112),
  col('私信进线', 'pm_inquiries', 96),
  col('私信开口', 'pm_openings', 96),
  col('私信留资', 'pm_leads', 96),
]);

function dateParams() {
  const p = { brandId: auth.currentBrandId ?? undefined };
  if (range.value?.[0]) {
    p.start = range.value[0].format('YYYY-MM-DD');
    p.end = range.value[1].format('YYYY-MM-DD');
  }
  if (accountType.value) p.accountType = accountType.value;
  return p;
}

async function reload() {
  loading.value = true;
  try {
    rows.value = await getKoxRegionAnalysis(dateParams());
  } catch (e) {
    message.error(e.message || '加载区域数据失败');
  } finally {
    loading.value = false;
  }
}

function onQuickChange() {
  const days = Number(quick.value);
  range.value = [dayjs().subtract(days - 1, 'day'), dayjs()];
  reload();
}

const toRows = (list, nameKey) =>
  (list ?? []).map((r, i) => ({
    排名: i + 1,
    [nameKey]: r.name,
    KOS数: r.kos_cnt,
    有发布: r.published_cnt,
    无发布: r.unpublished_cnt,
    笔记数量: r.note_cnt,
    曝光: r.exposure_sum,
    阅读: r.view_sum,
    互动: r.interaction_sum,
    CES: r.ces_sum,
    账号平均笔记: r.avg_notes,
    笔记平均曝光: r.avg_exposure,
    笔记平均CES: r.avg_ces,
    私信进线: r.pm_inquiries,
    私信开口: r.pm_openings,
    ...(nameKey === '区域' ? { 自然留资: r.organic_leads } : {}),
    私信留资: r.pm_leads,
  }));

function exportAll() {
  exportExcel(
    [
      { name: '区域排行', rows: toRows(rows.value.regions, '区域') },
      { name: '账号标签排行', rows: toRows(rows.value.tags, '账号标签') },
    ],
    '区域数据分析',
  );
}

onMounted(reload);
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

.metric-note {
  padding: 8px 4px;
  color: #94a3b8;
  font-size: 12px;
}
</style>
