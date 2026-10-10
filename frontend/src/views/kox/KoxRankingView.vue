<template>
  <KoxRegionAnalysisView
    v-if="(isTesla || isDf) && fixedDimension === 'region'"
    :embedded-title="isDf ? '区域排行' : '区域排行'"
  />
  <KoxAccountRankingView
    v-else-if="(isTesla || isDf || isMdd) && fixedDimension === 'account'"
  />
  <PageWrapper v-else :title="pageTitle" :subtitle="pageSubtitle">
    <template #filters>
      <FilterTopbar>
        <a-radio-group
          v-if="!fixedDimension"
          v-model:value="dimension"
          size="small"
          button-style="solid"
          @change="() => reload(true)"
        >
          <a-radio-button value="region">大区</a-radio-button>
          <a-radio-button value="saleArea">销售区域</a-radio-button>
          <a-radio-button value="store">店铺</a-radio-button>
          <a-radio-button value="tag">账号标签</a-radio-button>
          <a-radio-button value="account">账号</a-radio-button>
        </a-radio-group>
        <a-select
          v-model:value="accountType"
          style="width: 110px"
          allow-clear
          placeholder="账号类型"
          :options="[
            { value: 'KOS', label: 'KOS' },
            { value: 'KOB', label: 'KOB' },
            { value: 'KOC', label: 'KOC' },
          ]"
          @change="() => reload(true)"
        />
        <a-select
          v-model:value="metric"
          style="width: 120px"
          :options="metricOptions"
          @change="() => reload(true)"
        />
        <a-range-picker
          v-model:value="range"
          size="small"
          :allow-clear="false"
          @change="() => reload(true)"
        />
      </FilterTopbar>
    </template>

    <NoticeBar v-if="metricSource === 'notes_cumulative'">
      数据说明：该工作区暂无日粒度统计，当前榜单按笔记累计口径实时聚合（历史累计值，无环比）。
    </NoticeBar>
    <NoticeBar v-else>榜单说明：统计周期内账号发布内容的曝光 / 阅读 / 互动 / 线索等指标汇总排行，环比对比等长上一周期。</NoticeBar>

    <a-card :bordered="false" size="small" class="sum-card">
      <a-row :gutter="[16, 12]">
        <a-col :xs="8" :md="4">
          <a-statistic title="参与账号" :value="summary.account_num" />
        </a-col>
        <a-col :xs="8" :md="4">
          <a-statistic title="内容数" :value="summary.item_cnt" />
        </a-col>
        <a-col :xs="8" :md="5">
          <a-statistic
            title="总曝光"
            :value="summary.exposure_sum"
            :value-style="{ color: '#3456E6' }"
          />
        </a-col>
        <a-col :xs="8" :md="5">
          <a-statistic
            title="总阅读"
            :value="summary.view_sum"
            :value-style="{ color: '#0d9488' }"
          />
        </a-col>
        <a-col :xs="8" :md="3">
          <a-statistic title="总互动" :value="summary.interaction_sum" />
        </a-col>
        <a-col :xs="8" :md="3">
          <a-statistic
            title="总线索"
            :value="summary.pm_leads"
            :value-style="{ color: '#16a34a' }"
          />
        </a-col>
      </a-row>
    </a-card>

    <a-row v-if="top3.length" :gutter="[12, 12]" class="podium-row">
      <a-col v-for="(item, i) in top3" :key="item.name" :xs="24" :sm="8">
        <a-card :bordered="false" size="small" :class="['podium', `podium-${i + 1}`]">
          <div class="podium-head">
            <span :class="['rank-badge', `rank-${i + 1}`]">{{ i + 1 }}</span>
            <div class="podium-name">
              <div class="p-title">{{ item.name }}</div>
              <div class="muted mini">
                {{ dimension === 'account'
                  ? item.store_name || '未关联门店'
                  : `${item.account_num} 账号 · ${item.store_num || item.account_num} 门店` }}
              </div>
            </div>
          </div>
          <div class="podium-metric">
            <span class="muted mini">{{ metricLabel }}</span>
            <b>{{ fmt(item[metric]) }}</b>
          </div>
        </a-card>
      </a-col>
    </a-row>

    <!-- 桌面：榜单表格 -->
    <a-card v-if="!isMobile" :bordered="false">
      <a-table
        :columns="columns"
        :data-source="list"
        :loading="loading"
        :pagination="{
          total,
          current: page,
          pageSize: PAGE_SIZE,
          showSizeChanger: false,
          size: 'small',
        }"
        row-key="rank"
        @change="onTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'rank'">
            <span :class="['rank-badge', `rank-${record.rank}`]">{{ record.rank }}</span>
          </template>
          <template v-else-if="column.key === 'name'">
            <div v-if="dimension === 'account'" class="acc-cell">
              <a-avatar :size="30">{{ record.name.slice(0, 1) }}</a-avatar>
              <div>
                <div class="acc-name">
                  {{ record.name }}
                  <a-tag
                    v-if="record.account_type"
                    :color="typeColor[record.account_type] || 'blue'"
                    class="mini"
                  >
                    {{ record.account_type }}
                  </a-tag>
                </div>
                <div class="muted mini">{{ record.store_name || '未关联门店' }}</div>
              </div>
            </div>
            <div v-else>
              <div>{{ record.name }}</div>
              <div class="muted mini">{{ record.account_num }} 个账号</div>
            </div>
          </template>
          <template v-else-if="column.key === 'region'">
            {{ record.region_name || record.sale_area || '-' }}
          </template>
          <template v-else-if="column.key === 'metric'">
            <div class="bar-cell">
              <span class="bar-num">{{ fmt(record[metric]) }}</span>
              <div class="bar-track">
                <div
                  class="bar-fill"
                  :style="{ width: `${(record[metric] / maxMetric) * 100}%` }"
                />
              </div>
            </div>
          </template>
          <template v-else-if="column.key === 'growth'">
            <span v-if="record.growth == null" class="muted">-</span>
            <span v-else :class="record.growth >= 0 ? 'up' : 'down'">
              {{ record.growth >= 0 ? '↑' : '↓' }} {{ Math.abs(record.growth) }}%
            </span>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 手机：榜单卡片列表 -->
    <div v-else class="rank-mobile-list">
      <a-spin :spinning="loading">
        <div v-for="record in list" :key="record.rank" class="rank-card">
          <div class="rank-card-head">
            <span :class="['rank-badge', `rank-${record.rank}`]">{{ record.rank }}</span>
            <div class="rank-card-name">
              <template v-if="dimension === 'account'">
                <div class="rc-title">
                  {{ record.name }}
                  <a-tag
                    v-if="record.account_type"
                    :color="typeColor[record.account_type] || 'blue'"
                    class="mini"
                  >
                    {{ record.account_type }}
                  </a-tag>
                </div>
                <div class="muted mini">{{ record.store_name || '未关联门店' }}</div>
              </template>
              <template v-else>
                <div class="rc-title">{{ record.name }}</div>
                <div class="muted mini">{{ record.account_num }} 个账号 · {{ record.store_num || record.account_num }} 门店</div>
              </template>
            </div>
            <span v-if="record.growth != null" :class="['growth', record.growth >= 0 ? 'up' : 'down']">
              {{ record.growth >= 0 ? '↑' : '↓' }} {{ Math.abs(record.growth) }}%
            </span>
          </div>
          <div class="rank-card-metrics">
            <div class="rc-metric">
              <span class="muted mini">{{ metricLabel }}</span>
              <b>{{ fmt(record[metric]) }}</b>
            </div>
            <div class="rc-metric">
              <span class="muted mini">内容数</span>
              <b>{{ fmt(record.item_cnt) }}</b>
            </div>
            <div class="rc-metric">
              <span class="muted mini">曝光量</span>
              <b>{{ fmt(record.exposure_sum) }}</b>
            </div>
            <div class="rc-metric">
              <span class="muted mini">互动量</span>
              <b>{{ fmt(record.interaction_sum) }}</b>
            </div>
          </div>
          <div class="bar-cell mobile-bar">
            <div class="bar-track">
              <div
                class="bar-fill"
                :style="{ width: `${(record[metric] / maxMetric) * 100}%` }"
              />
            </div>
          </div>
        </div>
        <a-empty v-if="!loading && !list.length" />
      </a-spin>
      <div class="mobile-pager">
        <a-pagination
          :current="page"
          :total="total"
          :page-size="PAGE_SIZE"
          :show-size-changer="false"
          simple
          @change="onMobilePageChange"
        />
      </div>
    </div>
  </PageWrapper>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { message } from 'ant-design-vue';
import dayjs from 'dayjs';
import PageWrapper from '../../components/PageWrapper.vue';
import FilterTopbar from '../../components/FilterTopbar.vue';
import NoticeBar from '../../components/NoticeBar.vue';
import KoxRegionAnalysisView from './KoxRegionAnalysisView.vue';
import KoxAccountRankingView from './KoxAccountRankingView.vue';
import { getKoxRanking } from '../../api/kox';
import { useAuthStore } from '../../stores/auth';
import { useBreakpoint } from '../../composables/useBreakpoint';

const authStore = useAuthStore();
const { isMobile } = useBreakpoint();
const isTesla = computed(() => Number(authStore.currentBrandId) === 6);
const isDf = computed(() => [7, 8].includes(Number(authStore.currentBrandId)));
const isMdd = computed(() => Number(authStore.currentBrandId) === 5);

const METRIC_MAP = {
  view_sum: '阅读量',
  exposure_sum: '曝光量',
  interaction_sum: '互动量',
  digg_sum: '点赞数',
  follow_sum: '涨粉数',
  pm_leads: '线索数',
  item_cnt: '内容数',
};

const metricOptions = Object.entries(METRIC_MAP).map(([value, label]) => ({
  value,
  label: `按${label}`,
}));

const route = useRoute();
const fixedDimension = route.meta.fixedDimension || null;
const DIMENSION_TITLE = {
  region: '区域排行',
  saleArea: '销售区域排行',
  store: '店铺排行',
  account: '账号排行',
};
const pageTitle = computed(() =>
  fixedDimension ? DIMENSION_TITLE[fixedDimension] ?? '排行榜单' : '排行榜单',
);
const pageSubtitle = computed(() =>
  fixedDimension
    ? `${({ region: '大区', account: '账号' })[fixedDimension] ?? ''}维度运营指标排行`
    : '大区 / 销售区域 / 店铺 / 账号 多维度运营排行',
);

const dimension = ref(fixedDimension || 'region');
// 工作区恒定为当前品牌（页面内不提供跨工作区切换）
const brandId = computed(() => authStore.currentBrandId ?? authStore.brands?.[0]?.id);
const accountType = ref(undefined);
const metric = ref('view_sum');
const range = ref([dayjs().subtract(29, 'day'), dayjs()]);
const page = ref(1);
const PAGE_SIZE = 20;

const list = ref([]);
const total = ref(0);
const summary = ref({});
const loading = ref(false);
const metricSource = ref('daily');

const metricLabel = computed(() => METRIC_MAP[metric.value] ?? '');
const typeColor = { KOS: 'blue', KOB: 'purple', KOC: 'cyan' };

const top3 = computed(() => list.value.filter((r) => r.rank <= 3));
const maxMetric = computed(() =>
  list.value.reduce((mx, r) => Math.max(mx, Number(r[metric.value] ?? 0)), 1),
);

const columns = computed(() => {
  const cols = [
    { key: 'rank', title: '排名', width: 80 },
    { key: 'name', title: nameTitle.value },
  ];
  if (dimension.value === 'account') {
    cols.push({ key: 'region', title: '大区/区域', width: 140, ellipsis: true });
  } else {
    cols.push(
      { title: '账号数', dataIndex: 'account_num', width: 90 },
      { title: '门店数', dataIndex: 'store_num', width: 90 },
    );
  }
  cols.push(
    { title: '内容数', dataIndex: 'item_cnt', width: 90 },
    { title: '曝光量', dataIndex: 'exposure_sum', width: 110 },
    { title: '互动量', dataIndex: 'interaction_sum', width: 110 },
    { key: 'metric', title: metricLabel.value },
    { key: 'growth', title: '环比', width: 110 },
  );
  return cols;
});

const nameTitle = computed(
  () =>
    ({
      region: '大区',
      saleArea: '销售区域',
      store: '店铺',
      tag: '账号标签',
      account: '账号',
    })[dimension.value] ?? '名称',
);

const fmt = (v) => Number(v ?? 0).toLocaleString();

async function reload(resetPage = false) {
  if (resetPage) page.value = 1;
  loading.value = true;
  try {
    const res = await getKoxRanking({
      dimension: dimension.value,
      brandId: brandId.value ?? undefined,
      accountType: accountType.value || undefined,
      metric: metric.value,
      start: range.value?.[0]?.format('YYYY-MM-DD'),
      end: range.value?.[1]?.format('YYYY-MM-DD'),
      page: page.value,
      page_size: PAGE_SIZE,
    });
    list.value = res.list;
    total.value = res.total;
    summary.value = res.summary ?? {};
    metricSource.value = res.metric_source ?? 'daily';
  } catch (e) {
    message.error(e.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

function onTableChange(pag) {
  page.value = pag.current ?? 1;
  reload();
}

function onMobilePageChange(p) {
  page.value = p;
  reload();
}

onMounted(reload);
</script>

<style scoped>
.sum-card :deep(.ant-statistic-title) {
  font-size: 12px;
}

.podium-row {
  margin-top: 0;
}

.podium-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.podium-name {
  min-width: 0;
}

.p-title {
  font-weight: 600;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.podium-metric {
  margin-top: 10px;
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.podium-metric b {
  font-size: 20px;
  color: var(--color-primary);
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
  flex-shrink: 0;
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
  width: 80px;
  text-align: right;
  font-weight: 500;
}

.bar-track {
  flex: 1;
  min-width: 80px;
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

.acc-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.acc-name {
  font-weight: 500;
}

.mini {
  font-size: 12px;
}

.muted {
  color: var(--color-text-secondary);
}

.up {
  color: #ff4d4f;
}

.down {
  color: #52c41a;
}

/* ==================== 手机榜单卡片 ==================== */

.rank-mobile-list {
  background: var(--color-bg-container);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-card);
  padding: 8px 12px;
}

.rank-card {
  padding: 12px 0;
  border-bottom: 1px solid var(--color-border-secondary);
}

.rank-card:last-of-type {
  border-bottom: none;
}

.rank-card-head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.rank-card-name {
  flex: 1;
  min-width: 0;
}

.rc-title {
  font-weight: 600;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.growth {
  font-size: 12px;
  flex-shrink: 0;
}

.rank-card-metrics {
  margin-top: 10px;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.rc-metric {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.rc-metric b {
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.rc-metric:first-child b {
  color: var(--color-primary);
  font-size: 15px;
}

.mobile-bar {
  margin-top: 8px;
}

.mobile-bar .bar-track {
  min-width: 0;
}

.mobile-pager {
  display: flex;
  justify-content: center;
  padding: 12px 0 8px;
}
</style>
