<template>
  <PageWrapper title="添加记录">
    <FilterTopbar>
      <a-range-picker v-model:value="range" @change="reload" />
      <a-input-search
        v-model:value="keyword"
        placeholder="账号名称 / 门店"
        style="width: 220px"
        allow-clear
        @search="reload"
      />
      <a-button @click="doExport">导出数据</a-button>
    </FilterTopbar>

    <a-table
      :columns="columns"
      :data-source="list"
      :loading="loading"
      :pagination="pagination"
      row-key="id"
      size="middle"
      @change="onTableChange"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'account'">
          <div class="acct-cell">
            <a-avatar :size="28" style="background: #eaf1ff; color: #3456e6; font-size: 13px">
              {{ (record.nickname || '?').slice(0, 1) }}
            </a-avatar>
            <span class="acct-name">{{ record.nickname }}</span>
          </div>
        </template>
        <template v-else-if="column.key === 'add_time'">
          {{ formatTime(record.add_time) }}
        </template>
      </template>
    </a-table>
  </PageWrapper>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { message } from 'ant-design-vue';
import dayjs from 'dayjs';
import PageWrapper from '../../components/PageWrapper.vue';
import FilterTopbar from '../../components/FilterTopbar.vue';
import { getKoxAccounts } from '../../api/kox';
import { useAuthStore } from '../../stores/auth';
import { exportExcel } from '../../utils/excel';

const auth = useAuthStore();
const loading = ref(false);
const list = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const range = ref([]);
const keyword = ref('');

const columns = [
  { title: '提交时间', key: 'add_time', width: 150 },
  { title: '账号', key: 'account', ellipsis: true },
  { title: 'UID', dataIndex: 'author_id', width: 180, ellipsis: true },
  { title: '类型', dataIndex: 'account_type', width: 80 },
  { title: '账号标签', dataIndex: 'account_tag', width: 100 },
  { title: '大区', dataIndex: 'region_name', width: 100, ellipsis: true },
  { title: '门店名称', dataIndex: 'store_name', ellipsis: true },
  { title: '运营人', dataIndex: 'operator_name', width: 90 },
];

const pagination = ref({
  current: 1,
  pageSize: 20,
  total: 0,
  showSizeChanger: true,
  showTotal: (t) => `共 ${t} 条`,
});

const formatTime = (v) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-');

async function load() {
  loading.value = true;
  try {
    const params = {
      brandId: auth.currentBrandId ?? undefined,
      page: page.value,
      page_size: pageSize.value,
      sort: 'createdAt',
      order: 'desc',
      keyword: keyword.value || undefined,
    };
    if (range.value?.[0]) params.createdAtStart = range.value[0].format('YYYY-MM-DD');
    if (range.value?.[1]) params.createdAtEnd = range.value[1].format('YYYY-MM-DD 23:59:59');
    const data = await getKoxAccounts(params);
    const rows = data.list ?? [];
    total.value = data.total ?? rows.length;
    list.value = rows;
    pagination.value.current = page.value;
    pagination.value.pageSize = pageSize.value;
    pagination.value.total = total.value;
  } catch (e) {
    message.error(e.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

function reload() {
  page.value = 1;
  load();
}

function onTableChange(p) {
  page.value = p.current;
  pageSize.value = p.pageSize;
  load();
}

function doExport() {
  exportExcel(
    [
      {
        name: '添加记录',
        rows: list.value.map((r) => ({
          提交时间: formatTime(r.add_time),
          账号: r.nickname,
          UID: r.author_id,
          类型: r.account_type,
          账号标签: r.account_tag ?? '',
          大区: r.region_name ?? '',
          门店名称: r.store_name ?? '',
          运营人: r.operator_name ?? '',
        })),
      },
    ],
    '监测添加记录.xlsx',
  );
  message.success('已导出当前页');
}

onMounted(load);
</script>

<style scoped>
.acct-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}
.acct-name {
  font-weight: 500;
  color: #1e293b;
}
</style>
