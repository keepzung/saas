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
        <div class="sec-head"><span class="bar"></span>{{ isDf ? '区域数据排行' : '区域排行' }}</div>
      </template>
      <a-table
        :columns="regionColumns"
        :data-source="dfRegionRows"
        :loading="loading"
        :pagination="false"
        :scroll="{ x: isDf ? 1900 : 1720 }"
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

    <a-card v-if="!isDf" size="small" :bordered="false">
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

    <a-card v-else size="small" :bordered="false">
      <template #title>
        <div class="sec-head"><span class="bar"></span>区域投放情况</div>
      </template>
      <a-table
        :columns="adColumns"
        :data-source="adRows"
        :loading="loading"
        :pagination="false"
        :scroll="{ x: 1500 }"
        size="small"
        row-key="region"
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

    <div class="metric-note">{{ isDf ? adMetricNote : rows.metric_note }}</div>
  </PageWrapper>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { message } from 'ant-design-vue';
import dayjs from 'dayjs';
import PageWrapper from '../../components/PageWrapper.vue';
import { getKoxRegionAdSnapshot, getKoxRegionAnalysis } from '../../api/kox';
import { useAuthStore } from '../../stores/auth';
import { exportExcel } from '../../utils/excel';

const props = defineProps({
  embeddedTitle: { type: String, default: '' },
});

const auth = useAuthStore();
const isDf = Number(auth.currentBrandId) === 7;
const CROWNS = ['👑', '🥈', '🥉'];
const pageTitle = computed(() => props.embeddedTitle || '区域数据分析');

const quick = ref('7');
const range = ref([dayjs().subtract(6, 'day'), dayjs()]);
const accountType = ref(undefined);
const loading = ref(false);
const rows = ref({ regions: [], tags: [], metric_note: '' });
const adRows = ref([]);
const adMetricNote = ref('');
const r2 = (v) => Math.round(Number(v ?? 0) * 100) / 100;

const dfRegionRows = computed(() => {
  const feeByRegion = new Map(adRows.value.map((r) => [r.region, r.fee]));
  return (rows.value.regions ?? []).map((r) => ({
    ...r,
    avg_view: r.note_cnt ? r2(r.view_sum / r.note_cnt) : 0,
    avg_interaction: r.note_cnt ? r2(r.interaction_sum / r.note_cnt) : 0,
    ad_fee: feeByRegion.get(r.name) ?? null,
  }));
});

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

const dfRegionColumns = computed(() => [
  { title: '排名', key: 'rank', width: 64, fixed: 'left' },
  col('区域', 'name', 110, true),
  col('KOS数', 'kos_cnt', 84),
  col('有发布', 'published_cnt', 84),
  col('无发布', 'unpublished_cnt', 84),
  col('笔记数量', 'note_cnt', 96),
  col('账号平均笔记', 'avg_notes', 116),
  col('曝光', 'exposure_sum', 104),
  col('笔记平均曝光', 'avg_exposure', 120),
  col('阅读', 'view_sum', 104),
  col('平均阅读', 'avg_view', 100),
  col('互动', 'interaction_sum', 96),
  col('平均互动', 'avg_interaction', 100),
  col('CES', 'ces_sum', 96),
  col('笔记平均CES', 'avg_ces', 116),
  col('私信进线数', 'pm_inquiries', 104),
  col('私信开口数', 'pm_openings', 104),
  col('私信留资数', 'pm_leads', 104),
  col('投流消费', 'ad_fee', 100),
]);

const adColumns = [
  { title: '排名', key: 'rank', width: 64, fixed: 'left' },
  col('区域', 'region', 110, true),
  col('投流消耗', 'fee', 110),
  col('投流账号数量', 'account_cnt', 116),
  col('投流笔记数', 'note_cnt', 108),
  col('一分钟回复率', 'reply_rate', 116),
  col('私信进线数', 'inquiries', 104),
  col('私信开口数', 'openings', 104),
  col('私信留资数', 'leads', 104),
  col('开口率', 'open_rate', 96),
  col('开口留资率', 'open_lead_rate', 110),
  col('进线成本', 'inquiry_cost', 100),
  col('开口成本', 'open_cost', 100),
  col('留资成本', 'lead_cost', 100),
];

const regionColumns = computed(() => (isDf ? dfRegionColumns.value : [
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
]));

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
    if (isDf) {
      const ad = await getKoxRegionAdSnapshot({ brandId: auth.currentBrandId ?? 7 });
      adRows.value = ad.list ?? [];
      adMetricNote.value = ad.metric_note ?? '';
    }
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
  if (isDf) {
    exportExcel(
      [
        {
          name: '区域数据排行',
          rows: dfRegionRows.value.map((r, i) => ({
            排名: i + 1,
            区域: r.name,
            KOS数: r.kos_cnt,
            有发布: r.published_cnt,
            无发布: r.unpublished_cnt,
            笔记数量: r.note_cnt,
            账号平均笔记: r.avg_notes,
            曝光: r.exposure_sum,
            笔记平均曝光: r.avg_exposure,
            阅读: r.view_sum,
            平均阅读: r.avg_view,
            互动: r.interaction_sum,
            平均互动: r.avg_interaction,
            CES: r.ces_sum,
            笔记平均CES: r.avg_ces,
            私信进线数: r.pm_inquiries,
            私信开口数: r.pm_openings,
            私信留资数: r.pm_leads,
            投流消费: r.ad_fee ?? '',
          })),
        },
        {
          name: '区域投放情况',
          rows: adRows.value.map((r, i) => ({
            排名: i + 1,
            区域: r.region,
            投流消耗: r.fee,
            投流账号数量: r.account_cnt,
            投流笔记数: r.note_cnt,
            '一分钟回复率': r.reply_rate ?? '',
            私信进线数: r.inquiries,
            私信开口数: r.openings,
            私信留资数: r.leads,
            开口率: r.open_rate ?? '',
            开口留资率: r.open_lead_rate ?? '',
            进线成本: r.inquiry_cost ?? '',
            开口成本: r.open_cost ?? '',
            留资成本: r.lead_cost ?? '',
          })),
        },
      ],
      '区域数据排行',
    );
    return;
  }
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
