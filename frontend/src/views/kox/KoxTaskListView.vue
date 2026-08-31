<template>
  <PageWrapper title="任务列表" subtitle="KOX 内容任务创建与考核">
    <template #filters>
      <FilterTopbar>
        <a-select
          v-model:value="statusFilter"
          style="width: 130px"
          allow-clear
          placeholder="任务状态"
          :options="statusOptions"
          @change="reload"
        />
        <template #actions>
          <a-button type="primary" @click="createOpen = true">
            <PlusOutlined /> 创建任务
          </a-button>
        </template>
      </FilterTopbar>
    </template>

    <a-card :bordered="false">
      <a-table
        :columns="columns"
        :data-source="list"
        :loading="loading"
        :pagination="pager"
        row-key="id"
        @change="onTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'task_title'">
            <a @click="openDetail(record)">{{ record.task_title }}</a>
          </template>
          <template v-else-if="column.key === 'platform'">
            <a-tag :color="record.platform === 'douyin' ? 'blue' : 'red'">
              {{ record.platform === 'douyin' ? '抖音' : '小红书' }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'task_account_type'">
            <a-tag>{{ record.task_account_type }}</a-tag>
          </template>
          <template v-else-if="column.key === 'status'">
            <a-badge
              :status="badgeMap[record.status] ?? 'default'"
              :text="statusLabel[record.status] ?? record.status"
            />
          </template>
          <template v-else-if="column.key === 'progress'">
            {{ record.finished_count }}/{{ record.author_count }} 账号完成
          </template>
          <template v-else-if="column.key === 'action'">
            <a @click="openDetail(record)">详情</a>
            <template v-if="record.status === 'ongoing'">
              <a-divider type="vertical" />
              <a-popconfirm title="确认终止该任务？" @confirm="stop(record)">
                <a class="danger">终止</a>
              </a-popconfirm>
            </template>
          </template>
        </template>
      </a-table>
    </a-card>

    <a-modal
      v-model:open="createOpen"
      title="创建任务"
      :confirm-loading="creating"
      @ok="saveCreate"
    >
      <a-form layout="vertical" style="margin-top: 12px">
        <a-form-item label="任务名称" required>
          <a-input v-model:value="form.taskTitle" placeholder="示例任务名称" />
        </a-form-item>
        <a-form-item label="任务平台">
          <a-radio-group v-model:value="form.platform">
            <a-radio value="douyin">抖音</a-radio>
            <a-radio value="xhs">小红书</a-radio>
          </a-radio-group>
        </a-form-item>
        <a-form-item label="参与账号类型">
          <a-radio-group v-model:value="form.taskAccountType">
            <a-radio value="KOS">KOS</a-radio>
            <a-radio value="KOB">KOB</a-radio>
            <a-radio value="KOC">KOC</a-radio>
          </a-radio-group>
        </a-form-item>
        <a-form-item label="起止时间" required>
          <a-range-picker
            v-model:value="form.range"
            show-time
            style="width: 100%"
          />
        </a-form-item>
        <a-form-item label="参与账号">
          <a-select
            v-model:value="form.accountIds"
            mode="multiple"
            :options="accountOptions"
            placeholder="选择参与账号（可多选）"
            allow-clear
          />
        </a-form-item>
      </a-form>
    </a-modal>

    <a-drawer
      v-model:open="detailOpen"
      width="860"
      :title="detail?.task_title ?? '任务详情'"
    >
      <a-descriptions :column="3" size="small" bordered class="d-sec">
        <a-descriptions-item label="状态">
          <a-badge
            :status="badgeMap[detail?.status] ?? 'default'"
            :text="statusLabel[detail?.status] ?? detail?.status"
          />
        </a-descriptions-item>
        <a-descriptions-item label="周期">
          {{ fmtDate(detail?.start_time) }} ~ {{ fmtDate(detail?.end_time) }}
        </a-descriptions-item>
        <a-descriptions-item label="参与账号">
          {{ detail?.author_count ?? 0 }}
        </a-descriptions-item>
      </a-descriptions>

      <a-alert
        message="考核说明：内容数据符合任务考核要求，且不违规，计入有效内容。"
        type="info"
        show-icon
        class="d-sec"
      />

      <h4>大区排行</h4>
      <a-table
        :columns="regionColumns"
        :data-source="detail?.region_ranking ?? []"
        :pagination="false"
        size="small"
        row-key="region"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'task_finish_rate'">
            <a-progress
              :percent="record.task_finish_rate"
              size="small"
              style="width: 100px"
            />
          </template>
        </template>
      </a-table>

      <h4 class="mt">账号排行</h4>
      <a-table
        :columns="authorColumns"
        :data-source="detail?.author_ranking ?? []"
        :pagination="{ pageSize: 10, size: 'small' }"
        size="small"
        row-key="rank"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'rank'">
            <a-tag v-if="record.rank <= 3" color="gold">TOP{{ record.rank }}</a-tag>
            <span v-else>{{ record.rank }}</span>
          </template>
          <template v-else-if="column.key === 'progress'">
            <a-progress
              :percent="record.progress"
              size="small"
              :status="record.finished ? 'success' : 'active'"
              style="width: 100px"
            />
          </template>
        </template>
      </a-table>
    </a-drawer>
  </PageWrapper>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { message } from 'ant-design-vue';
import { PlusOutlined } from '@ant-design/icons-vue';
import dayjs from 'dayjs';
import PageWrapper from '../../components/PageWrapper.vue';
import FilterTopbar from '../../components/FilterTopbar.vue';
import {
  createKoxTask,
  getKoxAccounts,
  getKoxTaskDetail,
  getKoxTasks,
  stopKoxTask,
} from '../../api/kox';

const statusLabel = {
  ongoing: '进行中',
  completed: '已完成',
  stopped: '已终止',
};
const badgeMap = {
  ongoing: 'processing',
  completed: 'success',
  stopped: 'default',
};
const statusOptions = Object.entries(statusLabel).map(([value, label]) => ({
  value,
  label,
}));

const columns = [
  { key: 'task_title', title: '任务名称' },
  { key: 'platform', title: '任务平台', width: 90 },
  { key: 'task_account_type', title: '参与账号类型', width: 120 },
  { key: 'time_range', title: '开始和结束时间', dataIndex: 'time_range', width: 200 },
  { key: 'status', title: '任务状态', width: 100 },
  { key: 'progress', title: '完成进度', width: 140 },
  { key: 'created_user', title: '任务创建人', dataIndex: 'created_user', width: 120 },
  { key: 'action', title: '操作', width: 140 },
];

const regionColumns = [
  { key: 'rank', title: '排行', width: 70 },
  { title: '大区', dataIndex: 'region' },
  { title: '代理商数', dataIndex: 'saas_company_num', width: 90 },
  { title: '社媒账号数', dataIndex: 'task_author_num', width: 100 },
  { title: '完成任务账号数', dataIndex: 'task_finish_author_num', width: 130 },
  { key: 'task_finish_rate', title: '完成率', width: 140 },
  { title: '有效内容数', dataIndex: 'task_valid_item_num', width: 100 },
  { title: 'CES', dataIndex: 'task_ces', width: 90, sorter: (a, b) => a.task_ces - b.task_ces },
  { title: '阅读量', dataIndex: 'task_view_all', width: 100 },
  { title: '曝光量', dataIndex: 'task_display_all', width: 100 },
  { title: '违规内容数', dataIndex: 'task_violation_item_num', width: 100 },
];

const authorColumns = [
  { key: 'rank', title: '排行', width: 80 },
  { title: '账号名称', dataIndex: 'nickname' },
  { title: '账号类型', dataIndex: 'account_type', width: 90 },
  { title: '代理商', dataIndex: 'store_name' },
  { key: 'progress', title: '完成进度', width: 150 },
  { title: '有效内容数', dataIndex: 'valid_item_count', width: 100 },
  { title: '互动量', dataIndex: 'task_interaction', width: 100 },
  { title: '阅读量', dataIndex: 'task_view', width: 100 },
  { title: 'CES', dataIndex: 'task_ces', width: 90 },
];

const list = ref([]);
const loading = ref(false);
const page = ref(1);
const pageSize = ref(10);
const total = ref(0);
const statusFilter = ref(undefined);

const accounts = ref([]);
const accountOptions = computed(() =>
  accounts.value.map((a) => ({
    value: a.id,
    label: `${a.nickname}（${a.account_type}）`,
  })),
);

const createOpen = ref(false);
const creating = ref(false);
const form = reactive({
  taskTitle: '',
  platform: 'douyin',
  taskAccountType: 'KOS',
  range: [dayjs(), dayjs().add(30, 'day')],
  accountIds: [],
});

const detailOpen = ref(false);
const detail = ref(null);

const pager = computed(() => ({
  current: page.value,
  pageSize: pageSize.value,
  total: total.value,
  showSizeChanger: false,
}));

const fmtDate = (t) => (t ? dayjs(t).format('YYYY-MM-DD') : '-');

async function reload() {
  loading.value = true;
  try {
    const res = await getKoxTasks({
      page: page.value,
      page_size: pageSize.value,
      status: statusFilter.value || undefined,
    });
    list.value = res.list;
    total.value = res.total;
  } catch (e) {
    message.error(e.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

function onTableChange(p) {
  page.value = p.current;
  reload();
}

async function saveCreate() {
  if (!form.taskTitle.trim() || !form.range?.[0]) {
    message.warning('请填写任务名称并选择起止时间');
    return;
  }
  creating.value = true;
  try {
    await createKoxTask({
      taskTitle: form.taskTitle,
      platform: form.platform,
      taskAccountType: form.taskAccountType,
      startTime: form.range[0].toISOString(),
      endTime: form.range[1].toISOString(),
      accountIds: form.accountIds,
    });
    message.success('任务已创建');
    createOpen.value = false;
    Object.assign(form, {
      taskTitle: '',
      platform: 'douyin',
      taskAccountType: 'KOS',
      range: [dayjs(), dayjs().add(30, 'day')],
      accountIds: [],
    });
    reload();
  } catch (e) {
    message.error(e.message || '创建失败');
  } finally {
    creating.value = false;
  }
}

async function openDetail(record) {
  try {
    detail.value = await getKoxTaskDetail(record.id);
    detailOpen.value = true;
  } catch (e) {
    message.error(e.message || '加载详情失败');
  }
}

async function stop(record) {
  try {
    await stopKoxTask(record.id);
    message.success('已终止');
    reload();
  } catch (e) {
    message.error(e.message || '终止失败');
  }
}

onMounted(async () => {
  reload();
  try {
    const res = await getKoxAccounts({});
    accounts.value = res.list;
  } catch {
    /* ignore */
  }
});
</script>

<style scoped>
.d-sec {
  margin-bottom: 16px;
}

.mt {
  margin-top: 20px;
}

.danger {
  color: var(--color-error);
}
</style>
