<template>
  <PageWrapper title="操作日志" subtitle="KOL 模块操作审计记录">
    <template #filters>
      <FilterTopbar>
        <a-select
          v-model:value="actionType"
          :options="actionOptions"
          style="width: 130px"
          allow-clear
          placeholder="动作类型"
          @change="reload"
        />
        <template #actions>
          <a-button @click="exportCsv">
            <DownloadOutlined /> 导出
          </a-button>
        </template>
      </FilterTopbar>
    </template>

    <a-card :bordered="false">
      <a-table
        :columns="columns"
        :data-source="rows"
        :loading="loading"
        :pagination="pagination"
        row-key="id"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'action_type'">
            <a-tag :color="actionMeta[record.action_type]?.color">
              {{ actionMeta[record.action_type]?.text ?? record.action_type }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'target'">
            {{ record.target_name }}
            <span v-if="record.target_count > 1" class="muted small">
              （{{ record.target_count }} 项）
            </span>
          </template>
          <template v-else-if="column.key === 'operated_at'">
            {{ fmtDateTime(record.operated_at) }}
          </template>
        </template>
      </a-table>
    </a-card>
  </PageWrapper>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { message } from 'ant-design-vue';
import { DownloadOutlined } from '@ant-design/icons-vue';
import dayjs from 'dayjs';
import PageWrapper from '../../components/PageWrapper.vue';
import FilterTopbar from '../../components/FilterTopbar.vue';
import { getKolLogs } from '../../api/kol';

const actionType = ref(null);
const rows = ref([]);
const loading = ref(false);
const pagination = reactive({
  current: 1,
  pageSize: 20,
  total: 0,
  showTotal: (t) => `共 ${t} 条`,
});

const columns = [
  { title: '动作', key: 'action_type', width: 110 },
  { title: '操作人', dataIndex: 'operator_name', width: 110 },
  { title: '对象', key: 'target', width: 200 },
  { title: '摘要', dataIndex: 'summary' },
  { title: '时间', key: 'operated_at', width: 160 },
];

const actionMeta = {
  collect: { text: '收藏', color: 'blue' },
  edit: { text: '编辑', color: 'orange' },
  delete: { text: '移除', color: 'red' },
  import: { text: '导入', color: 'purple' },
  export: { text: '导出', color: 'cyan' },
  review: { text: '审核', color: 'green' },
  toggle_status: { text: '状态切换', color: 'geekblue' },
};

const actionOptions = Object.entries(actionMeta).map(([value, m]) => ({
  label: m.text,
  value,
}));

const fmtDateTime = (d) => (d ? dayjs(d).format('YYYY-MM-DD HH:mm:ss') : '');

async function load() {
  loading.value = true;
  try {
    const params = {
      page: pagination.current,
      page_size: pagination.pageSize,
    };
    if (actionType.value) params.action_type = actionType.value;
    const data = await getKolLogs(params);
    rows.value = data.list ?? [];
    pagination.total = data.total ?? 0;
  } catch (e) {
    message.error(e.message || '加载日志失败');
  } finally {
    loading.value = false;
  }
}

function reload() {
  pagination.current = 1;
  load();
}

function exportCsv() {
  const header = '动作,操作人,对象,数量,摘要,时间';
  const lines = rows.value.map((r) =>
    [
      actionMeta[r.action_type]?.text ?? r.action_type,
      r.operator_name,
      r.target_name,
      r.target_count,
      r.summary,
      fmtDateTime(r.operated_at),
    ]
      .map((v) => `"${String(v ?? '')}"`)
      .join(','),
  );
  const blob = new Blob(['\ufeff' + [header, ...lines].join('\n')], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `KOL操作日志_${dayjs().format('YYYYMMDD_HHmm')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

onMounted(load);
</script>

<style scoped>
.muted {
  color: var(--color-text-secondary);
}

.small {
  font-size: 12px;
}
</style>
