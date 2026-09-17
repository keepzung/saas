<template>
  <PageWrapper :title="pageTitle" :subtitle="pageSubtitle">
    <template #filters>
      <FilterTopbar>
        <a-select
          v-model:value="brandId"
          style="width: 130px"
          placeholder="品牌"
          :options="brandOptions"
          @change="() => reload(true)"
        />
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

    <NoticeBar>榜单说明：统计周期内账号发布内容的曝光 / 阅读 / 互动 / 线索等指标汇总排行，环比对比等长上一周期。</NoticeBar>

    <a-card :bordered="false" size="small" class="sum-card">
      <a-row :gutter="16">
        <a-col :span="4">
          <a-statistic title="参与账号" :value="summary.account_num" />
        </a-col>
        <a-col :span="4">
          <a-statistic title="内容数" :value="summary.item_cnt" />
        </a-col>
        <a-col :span="5">
          <a-statistic
            title="总曝光"
            :value="summary.exposure_sum"
            :value-style="{ color: '#3456E6' }"
          />
        </a-col>
        <a-col :span="5">
          <a-statistic
            title="总阅读"
            :value="summary.view_sum"
            :value-style="{ color: '#0d9488' }"
          />
        </a-col>
        <a-col :span="3">
          <a-statistic title="总互动" :value="summary.interaction_sum" />
        </a-col>
        <a-col :span="3">
          <a-statistic
            title="总线索"
            :value="summary.pm_leads"
            :value-style="{ color: '#16a34a' }"
          />
        </a-col>
      </a-row>
    </a-card>

    <a-row v-if="top3.length" :gutter="12" class="podium-row">
      <a-col v-for="(item, i) in top3" :key="item.name" :span="8">
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

    <a-card :bordered="false">
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
import { getKoxRanking } from '../../api/kox';
import { useAuthStore } from '../../stores/auth';

const authStore = useAuthStore();
const brandOptions = (authStore.brands ?? []).map((b) => ({
  value: b.id,
  label: b.name,
}));

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
const brandId = ref(authStore.currentBrandId ?? authStore.brands?.[0]?.id);
const accountType = ref(undefined);
const metric = ref('view_sum');
const range = ref([dayjs().subtract(29, 'day'), dayjs()]);
const page = ref(1);
const PAGE_SIZE = 20;

const list = ref([]);
const total = ref(0);
const summary = ref({});
const loading = ref(false);

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
</style>
