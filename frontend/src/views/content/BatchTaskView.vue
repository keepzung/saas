<template>
  <PageWrapper title="批量任务" subtitle="AI 批量生成文案任务管理">
    <template #filters>
      <FilterTopbar>
        <a-select
          v-model:value="statusFilter"
          style="width: 140px"
          allow-clear
          placeholder="按状态筛选"
          :options="statusOptions"
          @change="reload"
        />
        <template #actions>
          <a-button type="primary" @click="createOpen = true">
            <PlusOutlined /> 新建批量任务
          </a-button>
        </template>
      </FilterTopbar>
    </template>

    <a-card :bordered="false">
      <a-alert
        message="任务由后端模拟 AI 逐条生成小红书风格文案，运行中可取消；生成结果自动落入所选内容包（草稿状态）。"
        type="info"
        show-icon
        class="tip"
      />

      <a-table
        :columns="columns"
        :data-source="list"
        :loading="loading"
        :pagination="pager"
        row-key="id"
        @change="onTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'status'">
            <a-badge :status="badgeMap[record.status] || 'default'" :text="statusLabel[record.status] || record.status" />
          </template>
          <template v-else-if="column.key === 'progress'">
            <a-progress
              size="small"
              :percent="pct(record)"
              :status="record.status === 'failed' ? 'exception' : undefined"
              style="width: 140px"
            />
            <span class="muted prog-num">
              {{ record.success_count }}/{{ record.target_quantity }}
              <template v-if="record.failed_count">（失败{{ record.failed_count }}）</template>
            </span>
          </template>
          <template v-else-if="column.key === 'model'">
            <a-tag>{{ modelLabel[record.model] || record.model }}</a-tag>
          </template>
          <template v-else-if="column.key === 'action'">
            <a
              v-if="['pending', 'running'].includes(record.status)"
              class="danger"
              @click="cancel(record)"
            >取消</a>
            <span v-else class="muted">-</span>
          </template>
        </template>
      </a-table>
    </a-card>

    <a-modal
      v-model:open="createOpen"
      title="新建批量生成任务"
      :confirm-loading="creating"
      @ok="save"
    >
      <a-form layout="vertical" style="margin-top: 12px">
        <a-form-item label="任务名称" required>
          <a-input v-model:value="form.taskName" placeholder="如：华帝烟灶·周末批量生成" />
        </a-form-item>
        <a-form-item label="目标产品">
          <a-select
            v-model:value="form.productId"
            :options="productOptions"
            placeholder="选择产品（影响文案主题）"
            allow-clear
          />
        </a-form-item>
        <a-form-item label="写入内容包" required>
          <a-select
            v-model:value="form.packageId"
            :options="packageOptions"
            placeholder="生成结果将写入该内容包"
          />
        </a-form-item>
        <a-form-item label="生成数量" required>
          <a-input-number v-model:value="form.targetQuantity" :min="1" :max="20" style="width: 100%" />
        </a-form-item>
        <a-form-item label="模型">
          <a-radio-group v-model:value="form.model">
            <a-radio value="random">随机</a-radio>
            <a-radio value="deepseek">DeepSeek</a-radio>
            <a-radio value="qwen">通义千问</a-radio>
          </a-radio-group>
        </a-form-item>
      </a-form>
    </a-modal>
  </PageWrapper>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { message } from 'ant-design-vue';
import { PlusOutlined } from '@ant-design/icons-vue';
import dayjs from 'dayjs';
import PageWrapper from '../../components/PageWrapper.vue';
import FilterTopbar from '../../components/FilterTopbar.vue';
import {
  cancelBatchTask,
  createBatchTask,
  getBatchTasks,
  getPackages,
  getProducts,
} from '../../api/content';

const statusLabel = {
  pending: '排队中',
  running: '生成中',
  completed: '已完成',
  partial_failed: '部分失败',
  failed: '失败',
  cancelled: '已取消',
};
const badgeMap = {
  pending: 'default',
  running: 'processing',
  completed: 'success',
  partial_failed: 'warning',
  failed: 'error',
  cancelled: 'default',
};
const modelLabel = { random: '随机', deepseek: 'DeepSeek', qwen: '通义千问' };

const statusOptions = Object.entries(statusLabel).map(([value, label]) => ({
  value,
  label,
}));

const columns = [
  { key: 'task_name', title: '任务', dataIndex: 'task_name' },
  { key: 'product_display_name', title: '产品', dataIndex: 'product_display_name' },
  { key: 'progress', title: '进度', width: 240 },
  { key: 'model', title: '模型', width: 110 },
  { key: 'created_at', title: '创建时间', width: 160 },
  { key: 'action', title: '操作', width: 90 },
];

const list = ref([]);
const loading = ref(false);
const page = ref(1);
const pageSize = ref(10);
const total = ref(0);
const statusFilter = ref(undefined);

const products = ref([]);
const packages = ref([]);
const productOptions = computed(() =>
  products.value.map((p) => ({ value: p.id, label: p.display_name || p.name })),
);
const packageOptions = computed(() =>
  packages.value.map((p) => ({ value: p.package_id, label: p.name })),
);

const createOpen = ref(false);
const creating = ref(false);
const form = reactive({
  taskName: '',
  productId: null,
  packageId: null,
  targetQuantity: 5,
  model: 'random',
});

let pollTimer = null;

const pager = computed(() => ({
  current: page.value,
  pageSize: pageSize.value,
  total: total.value,
  showSizeChanger: false,
}));

const pct = (r) =>
  r.target_quantity ? Math.round(((r.success_count + r.failed_count) / r.target_quantity) * 100) : 0;

async function reload() {
  loading.value = true;
  try {
    const res = await getBatchTasks({
      page: page.value,
      page_size: pageSize.value,
      status: statusFilter.value || undefined,
    });
    list.value = res.list;
    total.value = res.total;
    schedulePoll();
  } catch (e) {
    message.error(e.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

function schedulePoll() {
  clearTimeout(pollTimer);
  const hasActive = list.value.some((r) => ['pending', 'running'].includes(r.status));
  if (hasActive) {
    pollTimer = setTimeout(reload, 2000);
  }
}

function onTableChange(p) {
  page.value = p.current;
  reload();
}

async function save() {
  if (!form.taskName.trim() || !form.packageId) {
    message.warning('请填写任务名称并选择内容包');
    return;
  }
  creating.value = true;
  try {
    await createBatchTask({ ...form });
    message.success('任务已创建，后台生成中');
    createOpen.value = false;
    Object.assign(form, {
      taskName: '',
      productId: null,
      packageId: null,
      targetQuantity: 5,
      model: 'random',
    });
    reload();
  } catch (e) {
    message.error(e.message || '创建失败');
  } finally {
    creating.value = false;
  }
}

async function cancel(record) {
  try {
    await cancelBatchTask(record.id);
    message.success('已取消');
    reload();
  } catch (e) {
    message.error(e.message || '取消失败');
  }
}

onMounted(async () => {
  reload();
  try {
    const [ps, pks] = await Promise.all([getProducts(), getPackages({ page: 1, pageSize: 100 })]);
    products.value = ps;
    packages.value = pks.list ?? [];
  } catch {
    /* ignore */
  }
});

onBeforeUnmount(() => clearTimeout(pollTimer));
</script>

<style scoped>
.tip {
  margin-bottom: 16px;
}

.muted {
  color: var(--color-text-secondary);
}

.prog-num {
  font-size: 12px;
}
</style>
