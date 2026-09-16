<template>
  <PageWrapper title="批量任务" subtitle="AI 批量生成文案任务管理">
    <div class="batch-workspace-page">
      <div class="workspace-nav">
        <div class="workspace-nav-left">
          <div class="title-mark"><ThunderboltFilled /></div>
          <a-tabs v-model:active-key="activeTab" class="workspace-tabs">
            <a-tab-pane key="create" tab="批量图文创作" />
            <a-tab-pane key="result" tab="批量任务结果" />
          </a-tabs>
        </div>
        <div class="workspace-nav-right">
          <a-button size="small" class="ghost-dark" @click="reload">
            <RedoOutlined /> 刷新
          </a-button>
        </div>
      </div>

      <div class="workspace-content">
        <!-- 页签 1：批量图文创作 -->
        <div v-if="activeTab === 'create'" class="create-panel">
          <div class="create-guide-card">
            <div class="guide-kicker">AIGC 工作台</div>
            <h2>小红书图文 · 批量生成</h2>
            <p>
              选择目标产品与内容包，设定生成数量后由 AI 逐条产出小红书风格文案；
              运行中的任务可随时取消，生成结果以草稿状态自动落入所选内容包。
            </p>
            <div class="create-form-hint">
              <div class="hint-item"><FileTextOutlined class="hint-icon" /><span>产品知识库取材</span></div>
              <div class="hint-item"><ProfileOutlined class="hint-icon" /><span>策略卡约束角度</span></div>
              <div class="hint-item"><SendOutlined class="hint-icon" /><span>草稿进入内容包待审</span></div>
            </div>
            <button class="aigc-step-primary-btn" @click="createOpen = true">
              <ThunderboltFilled /> 开始批量生成
            </button>
          </div>
        </div>

        <!-- 页签 2：批量任务结果 -->
        <div v-else class="task-list-pane">
          <div class="list-toolbar">
            <div class="toolbar-left">
              <a-select
                v-model:value="statusFilter"
                size="small"
                style="width: 140px"
                allow-clear
                placeholder="按状态筛选"
                :options="statusOptions"
                @change="onFilterChange"
              />
              <span class="count-text">共 {{ total }} 个任务</span>
            </div>
            <div class="toolbar-right">
              <a-button size="small" class="primary-action-btn" type="primary" @click="createOpen = true">
                <PlusOutlined /> 创建任务
              </a-button>
              <a-button size="small" @click="reload"><RedoOutlined /> 刷新列表</a-button>
            </div>
          </div>

          <div class="list-content" :class="{ 'is-loading': loading }">
            <div class="grid-row list-head">
              <span>任务名称</span>
              <span>产品或服务</span>
              <span>状态</span>
              <span>生成进度</span>
              <span class="num-col">草稿数</span>
              <span class="num-col">失败数</span>
              <span>创建时间</span>
              <span class="op-col">操作</span>
            </div>

            <div
              v-for="task in list"
              :key="task.id"
              class="grid-row task-row"
              :class="{ 'is-processing': ['pending', 'running'].includes(task.status) }"
            >
              <div class="task-cell">
                <div class="task-icon" :class="`icon-${task.status}`">
                  <ThunderboltFilled v-if="['pending', 'running'].includes(task.status)" />
                  <CheckOutlined v-else-if="task.status === 'completed'" />
                  <ExclamationOutlined v-else-if="['partial_failed', 'failed'].includes(task.status)" />
                  <MinusOutlined v-else />
                </div>
                <div class="task-text">
                  <div class="task-name">{{ task.task_name }}</div>
                  <div class="task-id">#{{ task.id }} · {{ modelLabel[task.model] || task.model }}</div>
                </div>
              </div>
              <div class="cell-ellipsis" :title="task.product_display_name || '-'">
                {{ task.product_display_name || '-' }}
              </div>
              <div>
                <span class="status-pill" :class="`pill-${task.status}`">
                  {{ statusLabel[task.status] || task.status }}
                </span>
              </div>
              <div class="progress-cell">
                <span class="progress-text">{{ task.success_count + task.failed_count }}/{{ task.target_quantity }}</span>
                <div class="progress-track">
                  <div
                    class="progress-fill"
                    :class="{ 'is-done': !['pending', 'running'].includes(task.status) }"
                    :style="{ width: pct(task) + '%' }"
                  ></div>
                </div>
              </div>
              <div class="num-col col-count">
                <span class="strong">{{ task.success_count }}</span>
              </div>
              <div class="num-col col-count">
                <span :class="task.failed_count ? 'danger' : 'strong'">{{ task.failed_count }}</span>
              </div>
              <div class="time-cell">{{ fmtTime(task.created_at) }}</div>
              <div class="op-col">
                <a-button
                  v-if="['pending', 'running'].includes(task.status)"
                  type="link"
                  size="small"
                  class="enter-btn danger-link"
                  @click="cancel(task)"
                >取消</a-button>
                <a-button
                  v-else
                  type="link"
                  size="small"
                  class="enter-btn"
                  @click="$router.push('/content-center-pro/campaign/content-package')"
                >查看草稿</a-button>
              </div>
            </div>

            <div v-if="!loading && !list.length" class="empty-state">
              <InboxOutlined class="empty-icon" />
              <p>暂无批量任务</p>
              <button class="aigc-step-primary-btn generate-btn" @click="createOpen = true">
                <ThunderboltFilled /> 创建第一个任务
              </button>
            </div>
          </div>

          <div class="list-footer">
            <a-pagination
              size="small"
              :current="page"
              :page-size="pageSize"
              :total="total"
              :show-size-changer="false"
              @change="onPageChange"
            />
          </div>
        </div>
      </div>
    </div>

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
import {
  CheckOutlined,
  ExclamationOutlined,
  FileTextOutlined,
  InboxOutlined,
  MinusOutlined,
  PlusOutlined,
  ProfileOutlined,
  RedoOutlined,
  SendOutlined,
  ThunderboltFilled,
} from '@ant-design/icons-vue';
import dayjs from 'dayjs';
import PageWrapper from '../../components/PageWrapper.vue';
import { useAuthStore } from '../../stores/auth';
import {
  cancelBatchTask,
  createBatchTask,
  getBatchTasks,
  getPackages,
  getProducts,
} from '../../api/content';

const statusLabel = {
  pending: '已收到任务，等待生成',
  running: '生成中',
  completed: '已完成',
  partial_failed: '部分失败',
  failed: '生成失败',
  cancelled: '已取消',
};
const modelLabel = { random: '随机', deepseek: 'DeepSeek', qwen: '通义千问' };

const statusOptions = Object.entries(statusLabel).map(([value, label]) => ({
  value,
  label,
}));

const activeTab = ref('create');
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

const pct = (r) =>
  r.target_quantity
    ? Math.min(100, Math.round(((r.success_count + r.failed_count) / r.target_quantity) * 100))
    : 0;

const fmtTime = (t) => (t ? dayjs(t).format('YYYY-MM-DD HH:mm') : '-');

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

function onFilterChange() {
  page.value = 1;
  reload();
}

function onPageChange(p) {
  page.value = p;
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
    activeTab.value = 'result';
    page.value = 1;
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
    const auth = useAuthStore();
    const brandParam = { brandId: auth.currentBrandId ?? undefined };
    const [ps, pks] = await Promise.all([
      getProducts(brandParam),
      getPackages({ page: 1, pageSize: 100, ...brandParam }),
    ]);
    products.value = ps;
    packages.value = pks.list ?? [];
  } catch {
    /* ignore */
  }
});

onBeforeUnmount(() => clearTimeout(pollTimer));
</script>

<style scoped>
.batch-workspace-page {
  --bw-nav-bg: #02152f;
  --bw-blue: #5087ec;
  --bw-blue-hover: #426fe4;
  --bw-magic: linear-gradient(135deg, #5c6ec8 0%, #a7aef8 100%);
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* ---------- 深色导航 ---------- */
.workspace-nav {
  flex: none;
  height: 54px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 20px;
  background: var(--bw-nav-bg);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  z-index: 20;
  border-radius: 10px 10px 0 0;
  margin: 0 calc(-1 * var(--page-content-spacing, 12px));
  margin-top: calc(-1 * var(--page-content-spacing, 12px));
}

.workspace-nav-left {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
}

.title-mark {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.16);
  color: #fff2de;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.workspace-tabs {
  min-width: 0;
}

.workspace-tabs :deep(.ant-tabs-nav) {
  margin: 0;
}

.workspace-tabs :deep(.ant-tabs-nav::before) {
  border-bottom: none;
}

.workspace-tabs :deep(.ant-tabs-tab) {
  padding: 16px 4px;
  font-size: 15px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.65);
}

.workspace-tabs :deep(.ant-tabs-tab:hover) {
  color: rgba(255, 255, 255, 0.9);
}

.workspace-tabs :deep(.ant-tabs-tab-active .ant-tabs-tab-btn) {
  color: #fff;
}

.workspace-tabs :deep(.ant-tabs-ink-bar) {
  height: 3px;
  border-radius: 999px;
  background: var(--bw-magic);
}

.ghost-dark {
  background: transparent;
  border-color: rgba(255, 255, 255, 0.25);
  color: rgba(255, 255, 255, 0.75);
}

.ghost-dark:hover {
  border-color: rgba(255, 255, 255, 0.45);
  color: #fff;
}

/* ---------- 内容区 ---------- */
.workspace-content {
  flex: 1;
  min-width: 0;
  background: #fff;
  border-radius: 0 0 10px 10px;
  margin: 0 calc(-1 * var(--page-content-spacing, 12px));
  margin-bottom: calc(-1 * var(--page-content-spacing, 12px));
  display: flex;
  flex-direction: column;
  min-height: 420px;
}

/* 页签 1 创作引导 */
.create-panel {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 24px;
}

.create-guide-card {
  max-width: 560px;
  width: 100%;
  padding: 36px 40px;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  background:
    radial-gradient(circle at 92% 8%, rgba(167, 174, 248, 0.14), transparent 40%),
    linear-gradient(135deg, #f8faff, #fff 65%);
  text-align: center;
}

.guide-kicker {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 2px;
  color: var(--bw-blue);
  margin-bottom: 10px;
}

.create-guide-card h2 {
  margin: 0 0 12px;
  font-size: 24px;
  font-weight: 800;
  color: #1e293b;
}

.create-guide-card p {
  margin: 0 0 22px;
  font-size: 13.5px;
  line-height: 1.9;
  color: #64748b;
}

.create-form-hint {
  display: flex;
  justify-content: center;
  gap: 24px;
  flex-wrap: wrap;
  margin-bottom: 28px;
}

.hint-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  color: #64748b;
}

.hint-icon {
  color: var(--bw-blue);
  font-size: 15px;
}

.aigc-step-primary-btn {
  min-width: 270px;
  height: 48px;
  font-size: 16px;
  font-weight: 500;
  border-radius: 12px;
  border: none;
  color: #fff;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: var(--bw-magic);
  box-shadow: 0 4px 12px rgba(118, 75, 162, 0.2);
  transition: opacity 0.2s, box-shadow 0.2s;
}

.aigc-step-primary-btn:hover {
  opacity: 0.9;
  box-shadow: 0 6px 16px rgba(118, 75, 162, 0.3);
}

.aigc-step-primary-btn.generate-btn {
  min-width: 176px;
  height: 40px;
  font-size: 14px;
}

/* 页签 2 任务列表 */
.task-list-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.list-toolbar {
  flex: none;
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 16px;
  border-bottom: 1px solid #f0f0f0;
  flex-wrap: wrap;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.count-text {
  font-size: 12px;
  color: var(--bw-blue);
  font-weight: 600;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.primary-action-btn {
  border-radius: 10px;
  background: var(--bw-blue) !important;
  box-shadow: 0 6px 14px rgba(80, 135, 236, 0.18);
}

.primary-action-btn:hover {
  background: var(--bw-blue-hover) !important;
}

.list-content {
  flex: 1;
  overflow: auto;
  padding: 12px;
  min-height: 0;
  min-width: 1040px;
}

.list-content.is-loading {
  opacity: 0.6;
}

.list-content::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.list-content::-webkit-scrollbar-thumb {
  background: #d8e0ea;
  border-radius: 3px;
}

.grid-row {
  display: grid;
  align-items: center;
  gap: 12px;
  padding: 0 18px;
  grid-template-columns:
    minmax(260px, 1.7fr)
    minmax(140px, 0.95fr)
    132px
    minmax(180px, 1.2fr)
    76px
    76px
    172px
    96px;
}

.list-head {
  height: 44px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  color: #64748b;
  font-size: 12px;
  font-weight: 600;
  border-radius: 8px 8px 0 0;
}

.task-row {
  min-height: 70px;
  border-bottom: 1px solid #edf2f7;
  cursor: default;
  transition: background 0.15s;
}

.task-row:hover {
  background: #f0f7ff;
}

.task-row:hover .task-name {
  color: var(--bw-blue);
}

.task-row.is-processing {
  background-image: linear-gradient(90deg, rgba(80, 135, 236, 0.06), transparent);
}

.task-cell {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.task-icon {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: #eff6ff;
  color: var(--bw-blue);
  font-size: 15px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.task-icon.icon-failed,
.task-icon.icon-partial_failed {
  background: #fef2f2;
  color: #ff4d4f;
}

.task-icon.icon-completed {
  background: #f0fdf4;
  color: #16a34a;
}

.task-icon.icon-cancelled {
  background: #f1f5f9;
  color: #94a3b8;
}

.task-text {
  min-width: 0;
}

.task-name {
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color 0.15s;
}

.task-id {
  font-size: 12px;
  color: #94a3b8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cell-ellipsis {
  font-size: 13px;
  color: #475569;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.status-pill {
  display: inline-block;
  padding: 1px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid transparent;
  white-space: nowrap;
}

.pill-pending {
  background: #f1f5f9;
  color: #64748b;
  border-color: #e2e8f0;
}

.pill-running {
  background: #eff6ff;
  color: #2563eb;
  border-color: #bfdbfe;
}

.pill-completed {
  background: #f0fdf4;
  color: #16a34a;
  border-color: #bbf7d0;
}

.pill-partial_failed {
  background: #fff7ed;
  color: #ea580c;
  border-color: #fed7aa;
}

.pill-failed {
  background: #fef2f2;
  color: #ff4d4f;
  border-color: #fecaca;
}

.pill-cancelled {
  background: #f1f5f9;
  color: #94a3b8;
  border-color: #e2e8f0;
}

.progress-cell {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.progress-text {
  width: 52px;
  text-align: right;
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.progress-track {
  flex: 1;
  height: 8px;
  border-radius: 999px;
  background: #edf3fa;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #5087ec, #67a4f5 58%, #8cc8ff);
  box-shadow: 0 0 0 1px rgba(80, 135, 236, 0.08), 0 4px 10px rgba(80, 135, 236, 0.18);
  background-size: 160% 100%;
  animation: progress-flow 1.8s linear infinite;
  transition: width 0.4s ease;
}

.progress-fill.is-done {
  background: linear-gradient(90deg, #426fe4, #5087ec, #73a8f3);
  animation: none;
  background-size: 100% 100%;
}

@keyframes progress-flow {
  0% {
    background-position: 0% 0;
  }
  100% {
    background-position: -160% 0;
  }
}

.num-col {
  text-align: right;
  font-size: 13px;
  color: #64748b;
  font-variant-numeric: tabular-nums;
}

.col-count .strong {
  color: #1e293b;
  font-weight: 600;
}

.col-count .danger {
  color: #ff4d4f;
  font-weight: 600;
}

.time-cell {
  font-size: 12.5px;
  color: #64748b;
  white-space: nowrap;
}

.op-col {
  text-align: center;
}

.enter-btn {
  padding: 0;
  font-size: 13px;
  color: var(--bw-blue);
}

.enter-btn.danger-link {
  color: #ff4d4f;
}

.empty-state {
  padding: 70px 0 60px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.empty-icon {
  font-size: 42px;
  color: #cbd5e1;
}

.empty-state p {
  margin: 0;
  font-size: 13px;
  color: #94a3b8;
}

.list-footer {
  flex: none;
  display: flex;
  justify-content: center;
  padding: 12px 16px;
  border-top: 1px solid #f0f0f0;
}
</style>
