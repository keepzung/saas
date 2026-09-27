<template>
  <PageWrapper title="任务列表" subtitle="管理各种类型的内容创作任务，以可视化的方式帮助运营管理者追踪执行过程和完成情况。">
    <FilterTopbar>
      <a-input v-model:value="keyword" style="width: 180px" placeholder="任务名称" allow-clear @pressEnter="load" />
      <a-select v-model:value="statusFilter" style="width: 140px" placeholder="任务状态" allow-clear>
        <a-select-option value="active">进行中</a-select-option>
        <a-select-option value="expired">已截止</a-select-option>
        <a-select-option value="voided">已作废</a-select-option>
      </a-select>
      <a-range-picker v-model:value="dateRange" value-format="YYYY-MM-DD" />
      <a-switch v-model:checked="hideVoided" size="small" />
      <span class="switch-label">不显示已作废的任务</span>
      <a-button type="text" @click="load"><ReloadOutlined /></a-button>
    </FilterTopbar>

    <div class="tl-body">
      <div class="tl-head">
        <span class="tl-title">任务列表</span>
        <a-radio-group v-model:value="viewMode" size="small" button-style="solid">
          <a-radio-button value="card">卡片</a-radio-button>
          <a-radio-button value="list">列表</a-radio-button>
        </a-radio-group>
      </div>

      <a-spin :spinning="loading">
        <!-- 卡片视图 -->
        <div v-if="viewMode === 'card'" class="card-grid">
          <div v-for="t in list" :key="t.id" class="task-card">
            <div class="tcard-head">
              <span class="tcard-name">{{ t.name }}</span>
              <span class="tcard-status" :class="t.effective_status">{{ statusLabel(t.effective_status) }}</span>
            </div>
            <div class="tcard-field"><span>任务平台：</span>{{ platformLabel(t.platform) }}</div>
            <div class="tcard-field"><span>参与任务的团队：</span>{{ teamLabel(t) }}</div>
            <div class="tcard-field"><span>参与账号类型：</span>{{ typeLabel(t.account_types) }}</div>
            <div class="tcard-field"><span>任务时间：</span>{{ fmtDate(t.start_time) }} 至 {{ fmtDate(t.end_time) }}</div>
            <div class="tcard-field"><span>创建时间：</span>{{ fmtDate(t.created_at) }}</div>
            <div class="tcard-progress">
              <div class="tp-labels">
                <span class="tp-done">已完成 {{ t.completion_rate }}%</span>
                <span class="tp-undone">{{ (100 - t.completion_rate).toFixed(2) }}% 未完成</span>
              </div>
              <div class="tp-bar"><div class="tp-in" :style="{ width: `${t.completion_rate}%` }" /></div>
              <div class="tp-sub">{{ t.account_finished }}/{{ t.account_total }} 账号有产出 · 笔记 {{ t.note_total }} 篇</div>
            </div>
            <div class="tcard-ops">
              <a-button size="small" type="primary" @click="goDetail(t)">查看详情</a-button>
              <a-button v-if="t.effective_status !== 'voided'" size="small" danger @click="voidTask(t)">任务作废</a-button>
              <a-button size="small" @click="exportTask(t)">导出数据</a-button>
            </div>
          </div>
        </div>

        <!-- 列表视图 -->
        <a-table
          v-else
          :data-source="list"
          :columns="columns"
          row-key="id"
          :pagination="{ total, current: page, pageSize, showTotal: (n) => `共 ${n} 条` }"
          @change="onTableChange"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'name'">
              <a @click="goDetail(record)">{{ record.name }}</a>
            </template>
            <template v-else-if="column.key === 'status'">
              <span class="tcard-status" :class="record.effective_status">{{ statusLabel(record.effective_status) }}</span>
            </template>
            <template v-else-if="column.key === 'rate'">
              {{ record.completion_rate }}%
            </template>
          </template>
        </a-table>
        <div v-if="viewMode === 'card' && list.length" class="tl-footer">
          <a-pagination v-model:current="page" :total="total" :page-size="pageSize" @change="load" />
        </div>
        <a-empty v-if="!list.length && !loading" description="暂无任务，点击「派发新任务」创建" />
      </a-spin>
    </div>
  </PageWrapper>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { message, Modal } from 'ant-design-vue';
import { ReloadOutlined } from '@ant-design/icons-vue';
import PageWrapper from '../../components/PageWrapper.vue';
import FilterTopbar from '../../components/FilterTopbar.vue';
import { useAuthStore } from '../../stores/auth';
import { getContentTasks, getContentTaskDetail, voidContentTask } from '../../api/contentpro';
import { exportExcel } from '../../utils/excel';

const router = useRouter();
const auth = useAuthStore();
const brandId = computed(() => auth.currentBrandId ?? 1);

const list = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const loading = ref(false);
const keyword = ref('');
const statusFilter = ref(null);
const dateRange = ref(null);
const hideVoided = ref(true);
const viewMode = ref('card');

const columns = [
  { title: '任务名称', key: 'name', dataIndex: 'name' },
  { title: '团队', key: 'team', dataIndex: 'team' },
  { title: '账号总数', dataIndex: 'account_total', width: 90 },
  { title: '有产出账号', dataIndex: 'account_finished', width: 100 },
  { title: '笔记数', dataIndex: 'note_total', width: 80 },
  { title: '完成度', key: 'rate', width: 90 },
  { title: '状态', key: 'status', width: 90 },
  { title: '创建时间', dataIndex: 'created_at', width: 120 },
];

const statusLabel = (s) => ({ active: '进行中', expired: '已截止', voided: '已作废' }[s] ?? s);
const platformLabel = (p) => ({ xhs: '小红书', douyin: '抖音' }[p] ?? p ?? '小红书');
const teamLabel = (t) =>
  t.scope_type === 'regions' && t.regions?.length ? t.regions.join('、') : '全部大区';
const typeLabel = (types) => {
  if (!types?.length) return '不限';
  const map = { KOS: '仅KOS', KOB: '仅KOB',素人: '仅素人' };
  return types.map((x) => map[x] ?? x).join(' / ');
};
const fmtDate = (s) => (s ? new Date(s).toLocaleDateString('zh-CN').replaceAll('/', '-') : '-');

const load = async () => {
  loading.value = true;
  try {
    const res = await getContentTasks({
      brandId: brandId.value,
      page: page.value,
      page_size: pageSize.value,
      keyword: keyword.value || undefined,
      status: statusFilter.value === 'voided' ? 'voided' : undefined,
      hideVoided: statusFilter.value === 'voided' || !hideVoided.value ? '0' : '1',
    });
    let rows = res?.list ?? [];
    if (statusFilter.value && statusFilter.value !== 'voided') {
      rows = rows.filter((x) => x.effective_status === statusFilter.value);
    }
    if (dateRange.value?.length === 2) {
      rows = rows.filter((x) => {
        const d = new Date(x.created_at).toISOString().slice(0, 10);
        return d >= dateRange.value[0] && d <= dateRange.value[1];
      });
    }
    list.value = rows;
    total.value = res?.total ?? 0;
  } finally {
    loading.value = false;
  }
};

const onTableChange = (p) => {
  page.value = p.current;
  load();
};

const goDetail = (t) => router.push(`/kox_task/content-task/task-detail?id=${t.id}`);

const voidTask = (t) => {
  Modal.confirm({
    title: `确认作废任务「${t.name}」？作废后不可恢复。`,
    okText: '作废',
    okType: 'danger',
    onOk: async () => {
      await voidContentTask(t.id, { brandId: brandId.value });
      message.success('已作废');
      await load();
    },
  });
};

const exportTask = async (t) => {
  const detail = await getContentTaskDetail(t.id, { brandId: brandId.value });
  const rows = (detail?.accounts ?? []).map((a, i) => ({
    序号: i + 1,
    账号昵称: a.nickname,
    账号类型: a.account_type,
    大区: a.region ?? '',
    门店: a.store ?? '',
    任务期笔记数: a.note_count,
    是否完成: a.finished ? '完成' : '未完成',
  }));
  exportExcel([{ name: '账号进度', rows }], `任务-${t.name}`);
  message.success('已导出');
};

onMounted(load);
</script>

<style scoped>
.switch-label {
  color: #64748b;
  font-size: 13px;
}

.tl-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 14px 20px;
  background: #fff;
  margin: 0 20px 16px;
  border-radius: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.tl-head {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 14px;
}

.tl-title {
  font-weight: 600;
  color: #1e293b;
}

.tl-footer {
  display: flex;
  justify-content: center;
  padding: 16px 0 6px;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(330px, 1fr));
  gap: 14px;
}

.task-card {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 16px;
  background: linear-gradient(180deg, #fbfdff, #fff);
}

.tcard-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.tcard-name {
  font-weight: 700;
  color: #1e293b;
  font-size: 15px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tcard-status {
  flex: 0 0 auto;
  font-size: 12px;
  color: #94a3b8;
}

.tcard-status.active {
  color: #16a34a;
}

.tcard-status.expired {
  color: #d97706;
}

.tcard-status.voided {
  color: #dc2626;
  text-decoration: line-through;
}

.tcard-field {
  color: #475569;
  font-size: 12.5px;
  padding: 3px 0;
}

.tcard-field span {
  color: #94a3b8;
}

.tcard-progress {
  margin-top: 12px;
}

.tp-labels {
  display: flex;
  justify-content: space-between;
  font-size: 12.5px;
}

.tp-done {
  color: #16a34a;
  font-weight: 600;
}

.tp-undone {
  color: #94a3b8;
}

.tp-bar {
  margin-top: 6px;
  height: 8px;
  border-radius: 4px;
  background: #e2e8f0;
  overflow: hidden;
}

.tp-in {
  height: 100%;
  border-radius: 4px;
  background: linear-gradient(90deg, #16a34a, #4ade80);
  transition: width 0.4s;
}

.tp-sub {
  margin-top: 5px;
  color: #94a3b8;
  font-size: 11.5px;
}

.tcard-ops {
  margin-top: 12px;
  display: flex;
  gap: 8px;
}
</style>
