<template>
  <PageWrapper title="项目列表" subtitle="项目工作区与执行管理">
    <template #extra>
      <span class="ws-label">工作区</span>
      <a-select
        :value="brandId"
        :options="brandOptions"
        size="small"
        style="width: 150px"
        @change="switchBrand"
      />
      <a-button type="primary" size="small" @click="openCreate">
        <PlusOutlined /> 新建项目
      </a-button>
    </template>

    <a-card class="stat-card" :bordered="false">
      <div class="stat-row">
        <a-statistic title="项目总数" :value="workspace?.project_count ?? 0" />
        <a-statistic
          title="进行中"
          :value="workspace?.status_counts?.active ?? 0"
          :value-style="{ color: '#3456E6' }"
        />
        <a-statistic
          title="草稿"
          :value="workspace?.status_counts?.draft ?? 0"
          :value-style="{ color: '#94a3b8' }"
        />
        <a-statistic
          title="已归档"
          :value="workspace?.status_counts?.archived ?? 0"
          :value-style="{ color: '#cbd5e1' }"
        />
      </div>
    </a-card>

    <div class="main-area">
      <a-card class="folder-card" :bordered="false" title="项目文件夹">
        <template #extra>
          <a-button size="small" type="link" @click="openFolderModal(null)">
            <PlusOutlined /> 新建
          </a-button>
        </template>
        <a-tree
          :selected-keys="[selectedNode]"
          :tree-data="treeData"
          block-node
          @select="onTreeSelect"
        >
          <template #title="{ key, title, isLeaf: leaf }">
            <span class="tree-title">
              <span class="tree-name">{{ title }}</span>
              <span
                v-if="leaf && key !== 'all' && key !== 'none'"
                class="tree-actions"
              >
                <EditOutlined
                  class="op-icon"
                  @click.stop="openFolderModal({ id: key, name: title })"
                />
                <DeleteOutlined
                  class="op-icon danger"
                  @click.stop="removeFolder(key)"
                />
              </span>
            </span>
          </template>
        </a-tree>
      </a-card>

      <a-card class="table-card" :bordered="false">
        <div class="toolbar">
          <a-input-search
            v-model:value="keyword"
            placeholder="搜索项目名称/编号/客户"
            style="width: 240px"
            allow-clear
            @search="reload"
          />
          <a-select
            v-model:value="statusFilter"
            :options="statusFilterOptions"
            style="width: 120px"
            allow-clear
            placeholder="状态"
            @change="reload"
          />
        </div>

        <a-table
          :columns="columns"
          :data-source="rows"
          :loading="loading"
          :pagination="pagination"
          row-key="id"
          :scroll="{ x: 1280 }"
          @change="onTableChange"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'name'">
              <div class="proj-name">
                <a @click="openEdit(record)">{{ record.name }}</a>
                <span class="proj-code">{{ record.project_code }}</span>
              </div>
            </template>
            <template v-else-if="column.key === 'client'">
              {{ record.client_name || '-' }}
            </template>
            <template v-else-if="column.key === 'owner'">
              {{ record.owner_name || '-' }}
            </template>
            <template v-else-if="column.key === 'period'">
              <div v-if="record.start_date" class="period">
                <div>{{ fmtDate(record.start_date) }}</div>
                <div class="muted">~ {{ fmtDate(record.end_date) || '未定' }}</div>
              </div>
              <span v-else class="muted">未设定</span>
            </template>
            <template v-else-if="column.key === 'budget'">
              {{ fmtMoney(record.budget_total) }}
            </template>
            <template v-else-if="column.key === 'progress'">
              <a-progress
                :percent="record.progress.completion_rate"
                :status="
                  record.progress.risk_count > 0 ? 'exception' : 'active'
                "
                size="small"
                style="width: 110px"
              />
              <div class="muted small">
                {{ record.progress.completed_quantity }}/{{
                  record.progress.planned_quantity
                }}
                交付物 {{ record.progress.deliverable_count }}
              </div>
            </template>
            <template v-else-if="column.key === 'quote'">
              <div>{{ fmtMoney(record.quote.draft_amount) }}</div>
              <div class="muted small">
                成本 {{ record.quote.cost_completed_count }}/{{
                  record.quote.cost_expected_count
                }}
                {{ record.quote.cost_complete ? '· 已齐' : '' }}
              </div>
            </template>
            <template v-else-if="column.key === 'talent'">
              <div>
                {{ record.talent.total_count }} 位
                <a-tag v-if="record.talent.pending_count" color="orange">
                  待审 {{ record.talent.pending_count }}
                </a-tag>
              </div>
              <div class="muted small">
                正式 {{ record.talent.formal_count }} · 备选
                {{ record.talent.backup_count }}
              </div>
            </template>
            <template v-else-if="column.key === 'execution'">
              <div>
                已发布 {{ record.execution.published_count }}/{{
                  record.execution.total_count
                }}
              </div>
              <div
                class="small"
                :class="`att-${record.execution.attention_level}`"
              >
                {{ record.execution.attention_label }}
              </div>
            </template>
            <template v-else-if="column.key === 'status'">
              <a-tag :color="statusColor[record.status]">
                {{ statusText[record.status] }}
              </a-tag>
              <div class="muted small">{{ phaseText[record.phase] }}</div>
            </template>
            <template v-else-if="column.key === 'updated'">
              {{ fmtDateTime(record.updated_at) }}
            </template>
            <template v-else-if="column.key === 'actions'">
              <a-button type="link" size="small" @click="openEdit(record)">
                编辑
              </a-button>
              <a-button
                v-if="record.status !== 'archived'"
                type="link"
                size="small"
                @click="archiveOne(record)"
              >
                归档
              </a-button>
              <a-button
                v-else
                type="link"
                size="small"
                @click="unarchiveOne(record)"
              >
                恢复
              </a-button>
              <a-popconfirm
                title="删除后不可恢复，确认删除？"
                @confirm="removeOne(record)"
              >
                <a-button type="link" size="small" danger>删除</a-button>
              </a-popconfirm>
            </template>
          </template>
        </a-table>
      </a-card>
    </div>

    <ProjectFormModal
      v-model:open="formOpen"
      :project="editing"
      :folders="store.folders"
      :members="store.members"
      :default-owner-id="auth.user?.user_id ?? null"
      @saved="reload"
    />

    <a-modal
      v-model:open="folderModalOpen"
      :title="editingFolder ? '重命名文件夹' : '新建文件夹'"
      ok-text="保存"
      cancel-text="取消"
      :confirm-loading="folderSubmitting"
      @ok="submitFolder"
    >
      <a-input
        v-model:value="folderName"
        placeholder="文件夹名称"
        :maxlength="50"
        style="margin-top: 16px"
        @pressEnter="submitFolder"
      />
    </a-modal>
  </PageWrapper>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { message } from 'ant-design-vue';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
} from '@ant-design/icons-vue';
import PageWrapper from '../../components/PageWrapper.vue';
import dayjs from 'dayjs';
import { useAuthStore } from '../../stores/auth';
import { useProjectStore } from '../../stores/project';
import {
  getProjects,
  getWorkspaces,
  createFolder,
  updateFolder,
  deleteFolder,
  archiveProject,
  unarchiveProject,
  deleteProject,
} from '../../api/project';
import ProjectFormModal from '../../components/project/ProjectFormModal.vue';

const auth = useAuthStore();
const store = useProjectStore();

const brandId = ref(1);
const brands = ref([]);
const keyword = ref('');
const statusFilter = ref(null);
const selectedNode = ref('all');
const loading = ref(false);
const rows = ref([]);
const pagination = reactive({
  current: 1,
  pageSize: 20,
  total: 0,
  showSizeChanger: true,
  showTotal: (t) => `共 ${t} 条`,
});

const formOpen = ref(false);
const editing = ref(null);
const folderModalOpen = ref(false);
const folderName = ref('');
const editingFolder = ref(null);
const folderSubmitting = ref(false);

const statusText = { draft: '草稿', active: '进行中', archived: '已归档' };
const statusColor = { draft: 'default', active: 'processing', archived: 'default' };
const phaseText = {
  planning: '筹备中',
  executing: '执行中',
  accepting: '验收中',
  closed: '已结项',
};

const statusFilterOptions = [
  { label: '草稿', value: 'draft' },
  { label: '进行中', value: 'active' },
  { label: '已归档', value: 'archived' },
];

const brandOptions = computed(() =>
  brands.value.map((b) => ({ label: b.name, value: b.id })),
);

const treeData = computed(() => [
  { key: 'all', title: '全部项目' },
  ...(store.folders ?? []).map((f) => ({
    key: f.id,
    title: f.name,
    children: (f.children ?? []).map((c) => ({
      key: c.id,
      title: c.name,
      isLeaf: true,
    })),
    isLeaf: false,
  })),
  { key: 'none', title: '未分组' },
]);

const columns = [
  { title: '项目', key: 'name', width: 200, fixed: 'left' },
  { title: '客户', key: 'client', width: 110 },
  { title: '负责人', key: 'owner', width: 90 },
  { title: '周期', key: 'period', width: 130 },
  { title: '预算', key: 'budget', width: 110, align: 'right' },
  { title: '进度', key: 'progress', width: 160 },
  { title: '报价', key: 'quote', width: 130 },
  { title: '达人', key: 'talent', width: 140 },
  { title: '执行', key: 'execution', width: 150 },
  { title: '状态', key: 'status', width: 100 },
  { title: '更新时间', key: 'updated', width: 130 },
  { title: '操作', key: 'actions', width: 170, fixed: 'right' },
];

const fmtDate = (d) => (d ? dayjs(d).format('YYYY-MM-DD') : '');
const fmtDateTime = (d) => (d ? dayjs(d).format('MM-DD HH:mm') : '');
const fmtMoney = (v) =>
  v == null
    ? '-'
    : `¥${Number(v).toLocaleString('zh-CN', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      })}`;

async function loadBrands() {
  const data = await getWorkspaces();
  brands.value = data.list ?? [];
  if (brands.value.length > 0 && !brands.value.find((b) => b.id === brandId.value)) {
    brandId.value = brands.value[0].id;
  }
}

async function loadRows() {
  loading.value = true;
  try {
    const params = {
      page: pagination.current,
      page_size: pagination.pageSize,
      brand_id: brandId.value,
    };
    if (keyword.value) params.keyword = keyword.value;
    if (statusFilter.value) params.status = statusFilter.value;
    if (selectedNode.value === 'none') params.folder_id = '0';
    else if (selectedNode.value !== 'all') params.folder_id = selectedNode.value;

    const data = await getProjects(params);
    rows.value = data.list ?? [];
    pagination.total = data.total ?? 0;
  } catch (e) {
    message.error(e.message || '加载项目列表失败');
  } finally {
    loading.value = false;
  }
}

function reload() {
  pagination.current = 1;
  loadRows();
}

function onTableChange(pag) {
  pagination.current = pag.current;
  pagination.pageSize = pag.pageSize;
  loadRows();
}

function onTreeSelect(keys) {
  selectedNode.value = keys[0] ?? 'all';
  reload();
}

function switchBrand(id) {
  brandId.value = id;
  selectedNode.value = 'all';
  Promise.all([store.loadWorkspace(id), store.loadFolders(id)]).then(reload);
}

function openCreate() {
  editing.value = null;
  formOpen.value = true;
}

function openEdit(record) {
  editing.value = record;
  formOpen.value = true;
}

async function archiveOne(record) {
  try {
    await archiveProject(record.id);
    message.success('已归档');
    await Promise.all([loadRows(), store.loadWorkspace(brandId.value)]);
  } catch (e) {
    message.error(e.message || '操作失败');
  }
}

async function unarchiveOne(record) {
  try {
    await unarchiveProject(record.id);
    message.success('已恢复');
    await Promise.all([loadRows(), store.loadWorkspace(brandId.value)]);
  } catch (e) {
    message.error(e.message || '操作失败');
  }
}

async function removeOne(record) {
  try {
    await deleteProject(record.id);
    message.success('已删除');
    await Promise.all([loadRows(), store.loadWorkspace(brandId.value)]);
  } catch (e) {
    message.error(e.message || '删除失败');
  }
}

function openFolderModal(folder) {
  editingFolder.value = folder;
  folderName.value = folder?.name ?? '';
  folderModalOpen.value = true;
}

async function submitFolder() {
  if (!folderName.value.trim()) {
    message.warning('请输入文件夹名称');
    return;
  }
  folderSubmitting.value = true;
  try {
    if (editingFolder.value) {
      await updateFolder(editingFolder.value.id, { name: folderName.value });
      message.success('已重命名');
    } else {
      const parent =
        typeof selectedNode.value === 'number' ? selectedNode.value : null;
      await createFolder({ name: folderName.value, parentId: parent });
      message.success('文件夹已创建');
    }
    folderModalOpen.value = false;
    await store.loadFolders(brandId.value);
  } catch (e) {
    message.error(e.message || '保存失败');
  } finally {
    folderSubmitting.value = false;
  }
}

async function removeFolder(id) {
  try {
    await deleteFolder(id);
    message.success('文件夹已删除');
    if (selectedNode.value === id) selectedNode.value = 'all';
    await Promise.all([store.loadFolders(brandId.value), loadRows()]);
  } catch (e) {
    message.error(e.message || '删除失败');
  }
}

onMounted(async () => {
  await loadBrands();
  await store.init(brandId.value);
  await loadRows();
});
</script>

<style scoped>
.stat-card :deep(.ant-card-body) {
  padding: 16px 24px;
}

.stat-row {
  display: flex;
  align-items: center;
  gap: 64px;
}

.ws-label {
  color: var(--color-text-secondary);
  font-size: 13px;
}

.main-area {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.folder-card {
  width: 240px;
  flex-shrink: 0;
}

.table-card {
  flex: 1;
  min-width: 0;
}

.toolbar {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.tree-title {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.tree-actions {
  display: none;
  gap: 6px;
}

.tree-title:hover .tree-actions {
  display: inline-flex;
}

.op-icon {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.op-icon:hover {
  color: var(--color-primary);
}

.op-icon.danger:hover {
  color: var(--color-error);
}

.proj-name {
  display: flex;
  flex-direction: column;
}

.proj-name a {
  font-weight: 500;
}

.proj-code {
  font-size: 12px;
  color: var(--color-text-tertiary);
}

.period {
  font-size: 13px;
}

.muted {
  color: var(--color-text-secondary);
}

.small {
  font-size: 12px;
}

.att-high {
  color: var(--color-error);
}

.att-low {
  color: var(--color-warning);
}

.att-none {
  color: var(--color-text-tertiary);
}
</style>
