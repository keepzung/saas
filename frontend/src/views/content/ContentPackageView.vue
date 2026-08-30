<template>
  <PageWrapper title="内容包列表" subtitle="内容素材聚合与两阶段审核">
    <template #filters>
      <FilterTopbar>
        <a-input-search
          v-model:value="keyword"
          placeholder="搜索内容包名称"
          style="width: 240px"
          allow-clear
          @search="reload"
        />
        <template #actions>
          <a-button type="primary" @click="openCreate">
            <PlusOutlined /> 新建内容包
          </a-button>
        </template>
      </FilterTopbar>
    </template>

    <a-card :bordered="false">
      <a-alert
        v-if="selection.length"
        type="info"
        class="batch-bar"
        :message="`已选 ${selection.length} 条素材`"
        closable
        @close="selection = []"
      >
        <template #action>
          <a-button size="small" type="primary" @click="submitSelected">
            提交审核
          </a-button>
        </template>
      </a-alert>

      <a-table
        :columns="columns"
        :data-source="list"
        :loading="loading"
        :pagination="pager"
        row-key="package_id"
        @change="onTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <a @click="openDetail(record)">{{ record.name }}</a>
          </template>
          <template v-else-if="column.key === 'workflow_type'">
            <a-tag :color="record.workflow_type === 'pro' ? 'purple' : 'cyan'">
              {{ record.workflow_type === 'pro' ? 'Pro 工作流' : '简单工作流' }}
            </a-tag>
            <a-tag v-if="record.review_mode === 2">双阶段审核</a-tag>
          </template>
          <template v-else-if="column.key === 'stats'">
            <span class="stat-chip">
              共 {{ record.stats.content_total }} 条
              <a-divider type="vertical" />
              <span class="s-draft">草稿{{ record.stats.draft }}</span>
              <span class="s-pending">待审{{ record.stats.pending_review }}</span>
              <span class="s-pass">已过{{ record.stats.approved + record.stats.brand_approved }}</span>
              <span class="s-reject">驳回{{ record.stats.rejected }}</span>
            </span>
          </template>
          <template v-else-if="column.key === 'action'">
            <a @click="openDetail(record)">详情</a>
            <a-divider type="vertical" />
            <a @click="openEdit(record)">编辑</a>
            <a-divider type="vertical" />
            <a-popconfirm title="删除后素材一并清除，确认？" @confirm="removePkg(record)">
              <a class="danger">删除</a>
            </a-popconfirm>
          </template>
        </template>
      </a-table>
    </a-card>

    <a-modal
      v-model:open="formOpen"
      :title="editing ? '编辑内容包' : '新建内容包'"
      @ok="savePkg"
      :confirm-loading="saving"
    >
      <a-form layout="vertical" style="margin-top: 12px">
        <a-form-item label="内容包名称" required>
          <a-input v-model:value="form.name" placeholder="如：华帝烟灶 · 双11种草包" />
        </a-form-item>
        <a-form-item label="关联产品">
          <a-select
            v-model:value="form.productId"
            :options="productOptions"
            placeholder="选择产品（可选）"
            allow-clear
          />
        </a-form-item>
        <a-form-item label="工作流类型">
          <a-radio-group v-model:value="form.workflowType">
            <a-radio value="simple">简单工作流</a-radio>
            <a-radio value="pro">Pro 工作流</a-radio>
          </a-radio-group>
        </a-form-item>
        <a-form-item label="审核模式">
          <a-radio-group v-model:value="form.reviewMode">
            <a-radio :value="1">单阶段（运营审核即过）</a-radio>
            <a-radio :value="2">双阶段（运营 + 品牌）</a-radio>
          </a-radio-group>
        </a-form-item>
      </a-form>
    </a-modal>

    <a-drawer
      v-model:open="detailOpen"
      width="720"
      :title="detail?.name ?? '内容包详情'"
    >
      <div class="detail-head">
        <a-tag :color="detail?.workflow_type === 'pro' ? 'purple' : 'cyan'">
          {{ detail?.workflow_type === 'pro' ? 'Pro 工作流' : '简单工作流' }}
        </a-tag>
        <a-tag v-if="detail?.review_mode === 2">双阶段审核</a-tag>
        <span class="muted" v-if="detail?.product_name">
          关联产品：{{ detail.product_name }}
        </span>
      </div>

      <div class="mat-toolbar">
        <a-radio-group
          v-model:value="matStatus"
          size="small"
          @change="loadMaterials"
        >
          <a-radio-button value="">全部</a-radio-button>
          <a-radio-button value="draft">草稿</a-radio-button>
          <a-radio-button value="pending_review">待审核</a-radio-button>
          <a-radio-button value="approved">运营已过</a-radio-button>
          <a-radio-button value="brand_approved">品牌已过</a-radio-button>
          <a-radio-button value="rejected">已驳回</a-radio-button>
        </a-radio-group>
        <a-button size="small" @click="addModalOpen = true">
          <PlusOutlined /> 手动添加
        </a-button>
      </div>

      <a-list
        :loading="matLoading"
        :data-source="materials"
        item-layout="vertical"
        size="small"
      >
        <template #renderItem="{ item }">
          <a-list-item>
            <template #actions>
              <span>
                <a-checkbox
                  :checked="selection.includes(item.id)"
                  @change="(e) => toggleSel(item.id, e.target.checked)"
                />
              </span>
            </template>
            <a-list-item-meta>
              <template #title>
                <span class="mat-title">
                  {{ item.title }}
                  <a-tag :color="statusColor[item.status]">{{ statusLabel[item.status] }}</a-tag>
                </span>
              </template>
              <template #description>
                <div class="mat-content">{{ item.content }}</div>
                <div class="mat-meta">
                  <a-tag v-for="t in item.tags" :key="t" class="tag-item">#{{ t }}</a-tag>
                  <span class="muted">{{ fmtTime(item.updated_time) }}</span>
                </div>
                <a-alert
                  v-if="item.status === 'rejected' && item.review_comment"
                  type="error"
                  :message="`驳回意见：${item.review_comment}`"
                  class="review-comment"
                />
              </template>
            </a-list-item-meta>
            <template #extra>
              <div class="mat-actions">
                <a
                  v-if="['draft', 'rejected'].includes(item.status)"
                  @click="submitOne(item)"
                >提交审核</a>
                <a
                  v-if="item.status === 'pending_review'"
                  @click="review(item, 'approve')"
                >通过</a>
                <a
                  v-if="item.status === 'pending_review'"
                  class="danger"
                  @click="review(item, 'reject')"
                >驳回</a>
                <a
                  v-if="item.status === 'approved' && detail?.review_mode === 2"
                  @click="review(item, 'brand-approve')"
                >品牌通过</a>
                <a
                  v-if="item.status === 'approved' && detail?.review_mode === 2"
                  class="danger"
                  @click="review(item, 'brand-reject')"
                >品牌驳回</a>
                <a-divider type="vertical" />
                <a-popconfirm title="确认删除该素材？" @confirm="removeMat(item)">
                  <a class="danger">删除</a>
                </a-popconfirm>
              </div>
            </template>
          </a-list-item>
        </template>
      </a-list>
    </a-drawer>

    <a-modal
      v-model:open="addModalOpen"
      title="手动添加素材"
      @ok="saveMaterial"
      :confirm-loading="matSaving"
    >
      <a-form layout="vertical" style="margin-top: 12px">
        <a-form-item label="标题" required>
          <a-input v-model:value="matForm.title" />
        </a-form-item>
        <a-form-item label="正文" required>
          <a-textarea v-model:value="matForm.content" :rows="6" />
        </a-form-item>
        <a-form-item label="标签（逗号分隔）">
          <a-input v-model:value="matForm.tagsStr" placeholder="华帝, 新房装修" />
        </a-form-item>
      </a-form>
    </a-modal>
  </PageWrapper>
</template>

<script setup>
import { computed, h, onMounted, reactive, ref } from 'vue';
import { message } from 'ant-design-vue';
import { PlusOutlined } from '@ant-design/icons-vue';
import dayjs from 'dayjs';
import PageWrapper from '../../components/PageWrapper.vue';
import FilterTopbar from '../../components/FilterTopbar.vue';
import {
  addMaterial,
  approveMaterial,
  brandApproveMaterial,
  brandRejectMaterial,
  createPackage,
  deleteMaterial,
  deletePackage,
  getPackages,
  getMaterials,
  getProducts,
  rejectMaterial,
  submitMaterials,
  updatePackage,
} from '../../api/content';

const statusLabel = {
  draft: '草稿',
  pending_review: '待审核',
  approved: '运营已过',
  brand_approved: '品牌已过',
  rejected: '已驳回',
  used: '已使用',
};
const statusColor = {
  draft: 'default',
  pending_review: 'warning',
  approved: 'processing',
  brand_approved: 'success',
  rejected: 'error',
  used: 'success',
};

const columns = [
  { key: 'name', title: '内容包', dataIndex: 'name' },
  { key: 'workflow_type', title: '类型 / 审核' },
  { key: 'product_name', title: '关联产品', dataIndex: 'product_name' },
  { key: 'stats', title: '内容统计' },
  { key: 'updated_time', title: '更新时间', dataIndex: 'updated_time', width: 170 },
  { key: 'action', title: '操作', width: 180 },
];

const list = ref([]);
const loading = ref(false);
const keyword = ref('');
const page = ref(1);
const pageSize = ref(12);
const total = ref(0);

const products = ref([]);
const productOptions = computed(() =>
  products.value.map((p) => ({ value: p.id, label: p.display_name || p.name })),
);

const formOpen = ref(false);
const editing = ref(null);
const saving = ref(false);
const form = reactive({ name: '', productId: null, workflowType: 'simple', reviewMode: 1 });

const detailOpen = ref(false);
const detail = ref(null);
const matStatus = ref('');
const materials = ref([]);
const matLoading = ref(false);
const selection = ref([]);

const addModalOpen = ref(false);
const matSaving = ref(false);
const matForm = reactive({ title: '', content: '', tagsStr: '' });

const pager = computed(() => ({
  current: page.value,
  pageSize: pageSize.value,
  total: total.value,
  showSizeChanger: false,
  size: 'small',
}));

const fmtTime = (t) => (t ? dayjs(t).format('YYYY-MM-DD HH:mm') : '-');

async function reload() {
  loading.value = true;
  try {
    const res = await getPackages({
      page: page.value,
      pageSize: pageSize.value,
      keyword: keyword.value || undefined,
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

function openCreate() {
  editing.value = null;
  Object.assign(form, { name: '', productId: null, workflowType: 'simple', reviewMode: 1 });
  formOpen.value = true;
}

function openEdit(record) {
  editing.value = record;
  Object.assign(form, {
    name: record.name,
    productId: record.product_id,
    workflowType: record.workflow_type,
    reviewMode: record.review_mode,
  });
  formOpen.value = true;
}

async function savePkg() {
  if (!form.name.trim()) {
    message.warning('请输入内容包名称');
    return;
  }
  saving.value = true;
  try {
    if (editing.value) {
      await updatePackage(editing.value.package_id, {
        name: form.name,
        productId: form.productId,
        workflowType: form.workflowType,
        reviewMode: form.reviewMode,
      });
      message.success('已更新');
    } else {
      await createPackage({
        name: form.name,
        productId: form.productId,
        workflowType: form.workflowType,
        reviewMode: form.reviewMode,
      });
      message.success('已创建');
    }
    formOpen.value = false;
    reload();
  } catch (e) {
    message.error(e.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

async function removePkg(record) {
  try {
    await deletePackage(record.package_id);
    message.success('已删除');
    reload();
  } catch (e) {
    message.error(e.message || '删除失败');
  }
}

async function openDetail(record) {
  detail.value = record;
  matStatus.value = '';
  selection.value = [];
  detailOpen.value = true;
  loadMaterials();
}

async function loadMaterials() {
  if (!detail.value) return;
  matLoading.value = true;
  try {
    const res = await getMaterials(detail.value.package_id, {
      status: matStatus.value || undefined,
    });
    materials.value = res.list;
  } catch (e) {
    message.error(e.message || '加载素材失败');
  } finally {
    matLoading.value = false;
  }
}

function toggleSel(id, checked) {
  selection.value = checked
    ? [...selection.value, id]
    : selection.value.filter((i) => i !== id);
}

async function submitOne(item) {
  try {
    await submitMaterials([item.id]);
    message.success('已提交审核');
    refreshAfterChange();
  } catch (e) {
    message.error(e.message || '提交失败');
  }
}

async function submitSelected() {
  try {
    const res = await submitMaterials(selection.value);
    message.success(`已提交 ${res.submitted} 条`);
    selection.value = [];
    refreshAfterChange();
  } catch (e) {
    message.error(e.message || '提交失败');
  }
}

async function review(item, action) {
  let comment = null;
  if (action.includes('reject')) {
    const { Modal } = await import('ant-design-vue');
    const input = ref('');
    const done = await new Promise((resolve) => {
      Modal.confirm({
        title: '驳回原因（可选）',
        content: {
          setup() {
            return () =>
              h('input', {
                style: 'width:100%;padding:4px 8px;border:1px solid #d9d9d9;border-radius:4px',
                onInput: (e) => (input.value = e.target.value),
              });
          },
        },
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });
    if (!done) return;
    comment = input.value || null;
  }
  try {
    const fn =
      action === 'approve'
        ? approveMaterial
        : action === 'reject'
          ? rejectMaterial
          : action === 'brand-approve'
            ? brandApproveMaterial
            : brandRejectMaterial;
    await fn(item.id, comment);
    message.success('操作成功');
    refreshAfterChange();
  } catch (e) {
    message.error(e.message || '操作失败');
  }
}

function refreshAfterChange() {
  loadMaterials();
  reload();
}

async function removeMat(item) {
  try {
    await deleteMaterial(item.id);
    message.success('已删除');
    refreshAfterChange();
  } catch (e) {
    message.error(e.message || '删除失败');
  }
}

async function saveMaterial() {
  if (!matForm.title.trim() || !matForm.content.trim()) {
    message.warning('标题和正文必填');
    return;
  }
  matSaving.value = true;
  try {
    await addMaterial(detail.value.package_id, {
      title: matForm.title,
      content: matForm.content,
      tags: matForm.tagsStr
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean),
    });
    message.success('已添加');
    addModalOpen.value = false;
    Object.assign(matForm, { title: '', content: '', tagsStr: '' });
    refreshAfterChange();
  } catch (e) {
    message.error(e.message || '添加失败');
  } finally {
    matSaving.value = false;
  }
}

onMounted(async () => {
  reload();
  try {
    products.value = await getProducts();
  } catch {
    products.value = [];
  }
});
</script>

<style scoped>
.batch-bar {
  margin-bottom: 12px;
}

.stat-chip {
  font-size: 12px;
}

.stat-chip span {
  margin-right: 8px;
}

.s-draft { color: var(--color-text-tertiary); }
.s-pending { color: var(--color-warning); }
.s-pass { color: #16a34a; }
.s-reject { color: var(--color-error); }

.danger { color: var(--color-error); }

.detail-head {
  margin-bottom: 16px;
}

.mat-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.mat-title {
  font-weight: 600;
}

.mat-content {
  white-space: pre-wrap;
  color: var(--color-text-secondary);
  font-size: 13px;
  margin-top: 4px;
}

.mat-meta {
  margin-top: 6px;
  display: flex;
  gap: 4px;
  align-items: center;
  flex-wrap: wrap;
}

.tag-item {
  font-size: 11px;
}

.review-comment {
  margin-top: 8px;
}

.mat-actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-end;
}

.muted {
  color: var(--color-text-secondary);
}
</style>
