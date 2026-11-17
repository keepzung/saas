<template>
  <PageWrapper title="运营报表">
    <template #extra>
      <a-button size="small" @click="load"><ReloadOutlined /> 刷新</a-button>
    </template>
    <a-tabs v-model:activeKey="type" @change="load">
      <a-tab-pane key="all" tab="全部" />
      <a-tab-pane key="daily" tab="日报" />
      <a-tab-pane key="weekly" tab="周报" />
      <a-tab-pane key="monthly" tab="月报" />
    </a-tabs>
    <a-table
      :columns="columns"
      :data-source="list"
      row-key="id"
      size="small"
      :pagination="{ pageSize: 12, showSizeChanger: false }"
      :loading="loading"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'type'">
          <a-tag :color="{ daily: 'blue', weekly: 'green', monthly: 'purple' }[record.type] ?? 'default'">
            {{ { daily: '日报', weekly: '周报', monthly: '月报' }[record.type] ?? record.type }}
          </a-tag>
        </template>
        <template v-else-if="column.key === 'ops'">
          <a-button size="small" type="text" @click="openDetail(record)">查看</a-button>
        </template>
      </template>
    </a-table>

    <a-modal v-model:open="detailOpen" :title="detail?.title" :footer="null" width="720px">
      <pre class="rp-md">{{ detail?.contentMd }}</pre>
    </a-modal>
  </PageWrapper>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { ReloadOutlined } from '@ant-design/icons-vue';
import PageWrapper from '../../components/PageWrapper.vue';
import { useAuthStore } from '../../stores/auth';
import { getReports, getReportDetail } from '../../api/contentpro';

const auth = useAuthStore();
const brandId = computed(() => auth.currentBrandId ?? 1);

const columns = [
  { key: 'type', title: '类型', width: 90 },
  { key: 'period', title: '周期', width: 140 },
  { key: 'title', title: '标题' },
  { key: 'createdAt', title: '生成时间', width: 180 },
  { key: 'ops', title: '操作', width: 80 },
];

const list = ref([]);
const loading = ref(false);
const type = ref('all');
const detailOpen = ref(false);
const detail = ref(null);

const load = async () => {
  loading.value = true;
  try {
    const params = { brandId: brandId.value };
    if (type.value !== 'all') params.type = type.value;
    const data = await getReports(params);
    list.value = (data?.list ?? []).map((r) => ({
      ...r,
      createdAt: (r.createdAt ?? '').replace('T', ' ').slice(0, 19),
    }));
  } finally {
    loading.value = false;
  }
};

const openDetail = async (row) => {
  detail.value = await getReportDetail(row.id, { brandId: brandId.value });
  detailOpen.value = true;
};

onMounted(load);
</script>

<style scoped>
.rp-md {
  white-space: pre-wrap;
  font-size: 13px;
  max-height: 65vh;
  overflow: auto;
}
</style>
