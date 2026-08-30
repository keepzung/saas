<template>
  <PageWrapper title="机构管理" subtitle="MCN 机构聚合与达人归属">
    <template #filters>
      <FilterTopbar>
        <a-checkbox v-model:checked="includeUnassigned" @change="reload">
          显示未分配
        </a-checkbox>
        <a-input-search
          v-model:value="keyword"
          placeholder="搜索机构名"
          style="width: 200px"
          allow-clear
          @search="reload"
        />
      </FilterTopbar>
    </template>

    <a-card :bordered="false">
      <div class="summary-row">
        <a-statistic title="机构数" :value="summary.institution_count" />
        <a-statistic title="机构达人" :value="summary.creator_count" />
        <a-statistic
          title="正常合作"
          :value="summary.normal_creator_count"
          :value-style="{ color: '#16a34a' }"
        />
        <a-statistic
          title="未分配机构"
          :value="summary.unassigned_count"
          :value-style="{ color: '#d97706' }"
        />
      </div>
    </a-card>

    <a-card :bordered="false">
      <a-table
        :columns="columns"
        :data-source="rows"
        :loading="loading"
        :pagination="pagination"
        row-key="key"
        @change="onTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <a class="mcn-name" @click="openCreators(record)">
              {{ record.name }}
              <a-tag v-if="record.is_unassigned" color="orange">未分配</a-tag>
            </a>
          </template>
          <template v-else-if="column.key === 'normal'">
            <a-progress
              :percent="pct(record.normal_count, record.creator_count)"
              size="small"
              style="width: 100px"
            />
            <span class="muted small">
              {{ record.normal_count }}/{{ record.creator_count }}
            </span>
          </template>
          <template v-else-if="column.key === 'owners'">
            <template v-if="record.owners.length">
              <a-tag v-for="o in record.owners" :key="o">{{ o }}</a-tag>
            </template>
            <span v-else class="muted">暂无负责人</span>
          </template>
          <template v-else-if="column.key === 'updated'">
            {{ fmtDateTime(record.latest_updated_at) }}
          </template>
          <template v-else-if="column.key === 'actions'">
            <a-button type="link" size="small" @click="openCreators(record)">
              查看达人
            </a-button>
          </template>
        </template>
      </a-table>
    </a-card>

    <a-drawer
      v-model:open="drawerOpen"
      :title="`「${activeInstitution}」旗下达人`"
      width="880"
    >
      <a-table
        :columns="creatorColumns"
        :data-source="creatorRows"
        :loading="creatorLoading"
        :pagination="creatorPagination"
        row-key="id"
        size="small"
        @change="onCreatorTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'nickname'">
            <div class="creator-cell">
              <a-avatar :size="32" :src="record.avatar">
                {{ record.nickname.slice(0, 1) }}
              </a-avatar>
              <div>
                <div class="c-name">{{ record.nickname }}</div>
                <div class="muted small">{{ record.category || '未分类' }}</div>
              </div>
            </div>
          </template>
          <template v-else-if="column.key === 'fans'">
            {{ fmtCount(record.fans_count) }}
          </template>
          <template v-else-if="column.key === 'data'">
            <div class="small">
              曝光 {{ fmtCount(record.daily_exposure_median) }} · 阅读
              {{ fmtCount(record.daily_read_median) }}
            </div>
            <div class="muted small">
              互动 {{ fmtCount(record.daily_interaction_median) }}
            </div>
          </template>
          <template v-else-if="column.key === 'price'">
            <div class="small">图文 ¥{{ fmtPrice(record.pgy_image_price) }}</div>
            <div class="small">视频 ¥{{ fmtPrice(record.pgy_video_price) }}</div>
          </template>
          <template v-else-if="column.key === 'resource_status'">
            <a-tag :color="record.resource_status === 1 ? 'green' : 'red'">
              {{ record.resource_status === 1 ? '正常' : '暂停' }}
            </a-tag>
          </template>
        </template>
      </a-table>
    </a-drawer>
  </PageWrapper>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { message } from 'ant-design-vue';
import dayjs from 'dayjs';
import PageWrapper from '../../components/PageWrapper.vue';
import FilterTopbar from '../../components/FilterTopbar.vue';
import {
  getInstitutionCreators,
  getInstitutions,
} from '../../api/kol';

const keyword = ref('');
const includeUnassigned = ref(false);
const rows = ref([]);
const loading = ref(false);
const summary = reactive({
  institution_count: 0,
  creator_count: 0,
  normal_creator_count: 0,
  unassigned_count: 0,
});
const pagination = reactive({
  current: 1,
  pageSize: 20,
  total: 0,
  showTotal: (t) => `共 ${t} 家机构`,
});

const drawerOpen = ref(false);
const activeInstitution = ref('');
const creatorRows = ref([]);
const creatorLoading = ref(false);
const creatorPagination = reactive({ current: 1, pageSize: 20, total: 0 });

const columns = [
  { title: '机构名称', key: 'name', width: 220 },
  { title: '达人数', dataIndex: 'creator_count', key: 'count', width: 100, sorter: true },
  { title: '正常合作', key: 'normal', width: 160 },
  { title: '负责人', key: 'owners' },
  { title: '最近更新', key: 'updated', width: 150 },
  { title: '操作', key: 'actions', width: 110 },
];

const creatorColumns = [
  { title: '达人', key: 'nickname', width: 180 },
  { title: '粉丝', key: 'fans', width: 90 },
  { title: '地域', dataIndex: 'location', width: 130 },
  { title: '数据中位数', key: 'data', width: 190 },
  { title: '报价', key: 'price', width: 140 },
  { title: '状态', key: 'resource_status', width: 80 },
  { title: '负责人', dataIndex: 'owner_nickname', width: 90 },
];

const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);
const fmtCount = (n) =>
  n == null ? '-' : n >= 10000 ? `${(n / 10000).toFixed(1)}w` : String(n);
const fmtPrice = (p) => (p == null ? '-' : Number(p).toLocaleString('zh-CN'));
const fmtDateTime = (d) => (d ? dayjs(d).format('YYYY-MM-DD HH:mm') : '');

async function load() {
  loading.value = true;
  try {
    const data = await getInstitutions({
      page: pagination.current,
      page_size: pagination.pageSize,
      include_unassigned: includeUnassigned.value ? 'true' : 'false',
      institution_keyword: keyword.value || undefined,
    });
    rows.value = data.list ?? [];
    pagination.total = data.total ?? 0;
    Object.assign(summary, data.summary ?? {});
  } catch (e) {
    message.error(e.message || '加载机构列表失败');
  } finally {
    loading.value = false;
  }
}

function reload() {
  pagination.current = 1;
  load();
}

function onTableChange(pag, _filters, sorter) {
  pagination.current = pag.current;
  pagination.pageSize = pag.pageSize;
  loadInstitutionsSorted(sorter);
}

async function loadInstitutionsSorted(sorter) {
  loading.value = true;
  try {
    const data = await getInstitutions({
      page: pagination.current,
      page_size: pagination.pageSize,
      include_unassigned: includeUnassigned.value ? 'true' : 'false',
      institution_keyword: keyword.value || undefined,
      sort_field: sorter?.field === 'count' ? 'creator_count' : sorter?.field,
      sort_order: sorter?.order === 'ascend' ? 'asc' : 'desc',
    });
    rows.value = data.list ?? [];
    pagination.total = data.total ?? 0;
  } finally {
    loading.value = false;
  }
}

function openCreators(record) {
  activeInstitution.value = record.name;
  creatorPagination.current = 1;
  drawerOpen.value = true;
  loadCreators();
}

async function loadCreators() {
  creatorLoading.value = true;
  try {
    const data = await getInstitutionCreators({
      institution_name: activeInstitution.value,
      page: creatorPagination.current,
      page_size: creatorPagination.pageSize,
    });
    creatorRows.value = data.list ?? [];
    creatorPagination.total = data.total ?? 0;
  } catch (e) {
    message.error(e.message || '加载机构达人失败');
  } finally {
    creatorLoading.value = false;
  }
}

function onCreatorTableChange(pag) {
  creatorPagination.current = pag.current;
  creatorPagination.pageSize = pag.pageSize;
  loadCreators();
}

onMounted(load);
</script>

<style scoped>
.summary-row {
  display: flex;
  align-items: center;
  gap: 64px;
}

.mcn-name {
  font-weight: 500;
}

.creator-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.c-name {
  font-weight: 500;
}

.muted {
  color: var(--color-text-secondary);
}

.small {
  font-size: 12px;
}
</style>
