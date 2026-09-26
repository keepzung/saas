<template>
  <PageWrapper title="账号排行" subtitle="按 KOS 留资分层排序">
    <template #extra>
      <a-radio-group v-model:value="quick" size="small" @change="onQuickChange">
        <a-radio-button value="7">近7天</a-radio-button>
        <a-radio-button value="30">近30天</a-radio-button>
      </a-radio-group>
      <a-range-picker v-model:value="range" size="small" @change="reload" />
      <a-select
        v-model:value="regionName"
        size="small"
        style="width: 130px"
        allow-clear
        placeholder="大区"
        :options="regionOptions"
        @change="reload"
      />
      <a-select
        v-model:value="accountType"
        size="small"
        style="width: 110px"
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
      <a-select
        v-model:value="tag"
        size="small"
        style="width: 130px"
        allow-clear
        placeholder="账号标签"
        :options="tagOptions"
        @change="reload"
      />
      <a-input-search
        v-model:value="keyword"
        size="small"
        style="width: 180px"
        placeholder="账号名称搜索"
        allow-clear
        @search="reload"
      />
      <a-button size="small" type="primary" @click="exportDetail">导出数据明细</a-button>
    </template>

    <div class="tier-strip">
      <div
        v-for="t in tierStat"
        :key="t.key"
        class="tier-pill"
        :style="{ borderColor: t.color, background: `${t.color}14` }"
      >
        <span class="tier-dot" :style="{ background: t.color }"></span>
        <b>{{ t.label }}</b>
        <span class="tier-count">{{ t.count }}</span>
      </div>
      <span class="tier-hint">{{ data.metric_note }}</span>
    </div>

    <a-card size="small" :bordered="false">
      <a-table
        :columns="columns"
        :data-source="list"
        :loading="loading"
        :pagination="pagination"
        :scroll="{ x: 2300 }"
        size="small"
        row-key="account_id"
        @change="onTableChange"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'rank'">
            <span :class="['rank-badge', pagination.current === 1 && index < 3 ? `top${index + 1}` : '']">
              {{ pagination.current === 1 && index < 3 ? CROWNS[index] : (pagination.current - 1) * pagination.pageSize + index + 1 }}
            </span>
          </template>
          <template v-else-if="column.key === 'nickname'">
            <a class="acc-name" :href="record.author_url || 'javascript:;'" target="_blank" rel="noreferrer">{{ record.nickname }}</a>
          </template>
          <template v-else-if="column.key === 'tier'">
            <span class="tier-tag" :style="{ background: record.tier_color }">{{ record.tier_label }}</span>
          </template>
          <template v-else-if="column.key === 'store'">
            <span class="store-cell">{{ record.region_name ?? '-' }} · {{ record.store_name ?? '-' }}</span>
          </template>
          <template v-else-if="column.key === 'action'">
            <a @click="viewContent(record)">查看内容</a>
          </template>
        </template>
      </a-table>
    </a-card>
  </PageWrapper>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { message } from 'ant-design-vue';
import { useRouter } from 'vue-router';
import dayjs from 'dayjs';
import PageWrapper from '../../components/PageWrapper.vue';
import { getKoxAccountRanking, getKoxAccounts } from '../../api/kox';
import { useAuthStore } from '../../stores/auth';
import { exportExcel } from '../../utils/excel';

const auth = useAuthStore();
const router = useRouter();
const CROWNS = ['👑', '🥈', '🥉'];

const quick = ref('7');
const range = ref([dayjs().subtract(6, 'day'), dayjs()]);
const regionName = ref(undefined);
const accountType = ref(undefined);
const tag = ref(undefined);
const keyword = ref('');
const regionOptions = ref([]);
const tagOptions = ref([]);
const loading = ref(false);
const list = ref([]);
const tierStat = ref([]);
const data = ref({ metric_note: '' });
const pagination = ref({ current: 1, pageSize: 20, total: 0, showSizeChanger: true, pageSizeOptions: ['20', '50', '100'] });

const numSorter = (field) => (a, b) => (a[field] ?? 0) - (b[field] ?? 0);
const ncol = (title, key, width = 96) => ({
  title,
  key,
  dataIndex: key,
  width,
  sorter: numSorter(key),
  align: 'right',
});

const columns = [
  { title: '排名', key: 'rank', width: 64, fixed: 'left' },
  { title: '账号', key: 'nickname', dataIndex: 'nickname', width: 200, fixed: 'left' },
  { title: '分层', key: 'tier', dataIndex: 'tier_label', width: 92, fixed: 'left' },
  ncol('粉丝数', 'fans', 90),
  { title: '账号标签', key: 'account_tag', dataIndex: 'account_tag', width: 100 },
  { title: '账号类型', key: 'account_type', dataIndex: 'account_type', width: 90 },
  ncol('私信进线', 'pm_inquiries'),
  ncol('私信开口', 'pm_openings'),
  ncol('私信留资', 'pm_leads'),
  ncol('内容发布数', 'item_cnt'),
  ncol('内容曝光数', 'exposure_sum', 110),
  ncol('内容阅读数', 'view_sum', 110),
  ncol('内容点赞数', 'likes_sum', 110),
  ncol('内容收藏数', 'collects_sum', 110),
  ncol('内容评论数', 'comments_sum', 110),
  { title: '所属门店/团队', key: 'store', width: 220 },
  { title: '操作', key: 'action', width: 90, fixed: 'right' },
];

function dateParams() {
  const p = { brandId: auth.currentBrandId ?? undefined };
  if (range.value?.[0]) {
    p.start = range.value[0].format('YYYY-MM-DD');
    p.end = range.value[1].format('YYYY-MM-DD');
  }
  if (regionName.value) p.regionName = regionName.value;
  if (accountType.value) p.accountType = accountType.value;
  if (tag.value) p.tag = tag.value;
  if (keyword.value.trim()) p.keyword = keyword.value.trim();
  return p;
}

async function reload() {
  loading.value = true;
  try {
    const res = await getKoxAccountRanking({
      ...dateParams(),
      page: pagination.value.current,
      page_size: pagination.value.pageSize,
    });
    data.value = res;
    list.value = res.list ?? [];
    tierStat.value = res.tier_stat ?? [];
    pagination.value.total = res.total ?? 0;
  } catch (e) {
    message.error(e.message || '加载账号排行失败');
  } finally {
    loading.value = false;
  }
}

async function loadFacets() {
  try {
    const res = await getKoxAccounts({ brandId: auth.currentBrandId, page_size: 1 });
    regionOptions.value = (res.region_facets ?? []).map((r) => ({ label: r, value: r }));
    tagOptions.value = (res.tag_facets ?? []).map((t) => ({ label: t, value: t }));
  } catch {
    /* 忽略筛选项错误 */
  }
}

function onTableChange(pag) {
  pagination.value.current = pag.current;
  pagination.value.pageSize = pag.pageSize;
  reload();
}

function onQuickChange() {
  const days = Number(quick.value);
  range.value = [dayjs().subtract(days - 1, 'day'), dayjs()];
  pagination.value.current = 1;
  reload();
}

function viewContent(record) {
  router.push({
    path: '/kox_df/operation-analysis/note-ranking',
    query: { author: record.nickname },
  });
}

function exportDetail() {
  const rows = list.value.map((r, i) => ({
    排名: (pagination.value.current - 1) * pagination.value.pageSize + i + 1,
    账号: r.nickname,
    分层: r.tier_label,
    粉丝数: r.fans,
    账号标签: r.account_tag ?? '',
    账号类型: r.account_type,
    私信进线: r.pm_inquiries,
    私信开口: r.pm_openings,
    私信留资: r.pm_leads,
    内容发布数: r.item_cnt,
    内容曝光数: r.exposure_sum,
    内容阅读数: r.view_sum,
    内容点赞数: r.likes_sum,
    内容收藏数: r.collects_sum,
    内容评论数: r.comments_sum,
    所属门店: r.store_name ?? '',
    大区: r.region_name ?? '',
  }));
  exportExcel([{ name: '账号排行', rows }], '账号排行明细');
}

onMounted(() => {
  loadFacets();
  reload();
});
</script>

<style scoped>
.tier-strip {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.tier-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border: 1px solid;
  border-radius: 16px;
  font-size: 13px;
  background: #fff;
}

.tier-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}

.tier-count {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.tier-hint {
  color: #94a3b8;
  font-size: 12px;
  margin-left: 4px;
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

.acc-name {
  color: #1e293b;
}

.acc-name:hover {
  color: #3456e6;
}

.tier-tag {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 10px;
  color: #fff;
  font-size: 12px;
}

.store-cell {
  color: var(--color-text-secondary);
  font-size: 12px;
}
</style>
