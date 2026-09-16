<template>
  <PageWrapper
    title="产品配置"
    subtitle="三级结构：产品 → 策略卡 → 场景。AI 生成时按所选产品读取知识与话术。"
  >
    <template #extra>
      <a-button type="primary" size="small" @click="openCreate(null)">
        <PlusOutlined /> 新建产品
      </a-button>
    </template>

    <div class="product-config">
      <div class="operations-bar">
        <div class="batch-operations">
          <div class="batch-info">
            <a-checkbox
              :checked="allSelected"
              :indeterminate="indeterminate"
              @change="toggleAll"
            />
            <span class="selected-count">已选择 {{ selectedIds.size }} 个产品</span>
          </div>
          <div class="batch-actions">
            <a-button size="small" @click="reload"><RedoOutlined /> 刷新</a-button>
            <a-popconfirm
              title="删除后不可恢复，确认批量删除所选产品及其子级？"
              ok-type="danger"
              :disabled="!selectedIds.size"
              @confirm="batchRemove"
            >
              <a-button size="small" danger :disabled="!selectedIds.size">
                <DeleteOutlined /> 批量删除
              </a-button>
            </a-popconfirm>
          </div>
        </div>
        <div class="filter-area">
          <a-input-search
            v-model:value="keyword"
            size="small"
            placeholder="搜索产品名称"
            style="width: 200px"
            allow-clear
          />
        </div>
      </div>

      <div class="material-grid-content">
        <div v-if="loading" class="grid-loading"><a-spin /></div>
        <div v-else-if="!filteredCards.length" class="empty-state">
          <InboxOutlined class="empty-icon" />
          <p>{{ keyword ? '没有匹配的产品' : '暂无产品，点击右上角「新建产品」开始' }}</p>
        </div>
        <div v-else class="grid-container">
          <div
            v-for="card in filteredCards"
            :key="card.id"
            class="material-item"
            :class="{ selected: selectedIds.has(card.id) }"
            @click="openDetail(card)"
          >
            <span class="item-checkbox" @click.stop>
              <a-checkbox
                :checked="selectedIds.has(card.id)"
                @change="toggleSelect(card.id)"
              />
            </span>
            <div class="item-image">
              <img v-if="card.cover_url" :src="card.cover_url" :alt="card.display_name" loading="lazy" />
              <span v-else class="image-fallback">{{ firstChar(card) }}</span>
            </div>
            <div class="item-name" :title="card.display_name">{{ card.display_name }}</div>
            <div class="material-badge-row">
              <span class="image-set-tag">{{ typeLabel[card.type] || card.type }}</span>
              <span v-if="childCount(card)" class="type-tag">子级 {{ childCount(card) }}</span>
            </div>
          </div>
        </div>
      </div>

      <a-drawer
        v-model:open="detailOpen"
        width="900px"
        title="产品详情"
        :footer="null"
      >
        <div v-if="detail" class="material-detail">
          <div class="detail-left">
            <div class="image-container">
              <img v-if="detail.cover_url" :src="detail.cover_url" :alt="detail.display_name" />
              <span v-else class="image-fallback big">{{ firstChar(detail) }}</span>
            </div>
          </div>
          <div class="detail-right">
            <div class="info-section">
              <h4>基本信息</h4>
              <a-descriptions layout="vertical" :column="2" size="small">
                <a-descriptions-item label="名称">{{ detail.name }}</a-descriptions-item>
                <a-descriptions-item label="显示名称">{{ detail.display_name }}</a-descriptions-item>
                <a-descriptions-item label="类型">
                  <a-tag :color="typeColor[detail.type]">{{ typeLabel[detail.type] }}</a-tag>
                </a-descriptions-item>
                <a-descriptions-item label="简介">{{ detail.description || '-' }}</a-descriptions-item>
              </a-descriptions>
            </div>

            <template v-if="detail.type === 'product'">
              <div class="info-section">
                <h4>产品知识（AI 生成依据）</h4>
                <p class="long-text">{{ detail.basic_info?.knowledge || '未填写' }}</p>
              </div>
              <div class="info-section">
                <h4>销售政策</h4>
                <p class="long-text">{{ detail.basic_info?.sales_policy || '未填写' }}</p>
              </div>
              <div class="info-section">
                <h4>常见问答 FAQ</h4>
                <p class="long-text">{{ detail.basic_info?.faq || '未填写' }}</p>
              </div>
            </template>

            <div v-if="detail.children?.length" class="info-section">
              <h4>子级（{{ detail.children.length }}）</h4>
              <div class="children-list">
                <template v-for="child in detail.children" :key="child.id">
                  <div class="child-row">
                    <a-tag :color="typeColor[child.type]" class="child-type">
                      {{ typeLabel[child.type] }}
                    </a-tag>
                    <span class="child-name" :title="child.display_name">{{ child.display_name }}</span>
                    <span class="child-desc">{{ child.description || '' }}</span>
                    <span class="child-actions" @click.stop>
                      <a @click="openEdit(child)">编辑</a>
                      <a-divider type="vertical" />
                      <a-popconfirm title="确认删除该子级？" @confirm="removeChild(child)">
                        <a class="danger">删除</a>
                      </a-popconfirm>
                    </span>
                  </div>
                  <div v-for="sub in child.children" :key="sub.id" class="child-row is-sub">
                    <a-tag :color="typeColor[sub.type]" class="child-type">
                      {{ typeLabel[sub.type] }}
                    </a-tag>
                    <span class="child-name" :title="sub.display_name">{{ sub.display_name }}</span>
                    <span class="child-actions" @click.stop>
                      <a @click="openEdit(sub)">编辑</a>
                      <a-divider type="vertical" />
                      <a-popconfirm title="确认删除该子级？" @confirm="removeChild(sub)">
                        <a class="danger">删除</a>
                      </a-popconfirm>
                    </span>
                  </div>
                </template>
              </div>
            </div>

            <div class="detail-actions">
              <a-button type="primary" @click="openEdit(detail)">
                <EditOutlined /> 编辑
              </a-button>
              <a-button v-if="detail.type !== 'scene'" @click="openCreate(detail)">
                <PlusOutlined /> 添加子级
              </a-button>
              <a-button @click="move(detail, 'up')">上移</a-button>
              <a-button @click="move(detail, 'down')">下移</a-button>
              <a-popconfirm title="确认删除该产品及其子级？" @confirm="removeDetail">
                <a-button danger><DeleteOutlined /> 删除</a-button>
              </a-popconfirm>
            </div>
          </div>
        </div>
      </a-drawer>

      <a-modal
        v-model:open="formOpen"
        :title="modalTitle"
        :confirm-loading="saving"
        width="640px"
        @ok="save"
      >
        <a-form layout="vertical" style="margin-top: 12px">
          <a-form-item label="名称" required>
            <a-input v-model:value="form.name" />
          </a-form-item>
          <a-form-item label="显示名称">
            <a-input v-model:value="form.displayName" placeholder="默认同名称" />
          </a-form-item>
          <a-form-item label="简介">
            <a-textarea v-model:value="form.description" :rows="2" />
          </a-form-item>
          <a-form-item v-if="form.configType === 'product'" label="封面图 URL">
            <a-input v-model:value="form.coverUrl" placeholder="如 /images/products/product-1.webp" />
          </a-form-item>
          <a-form-item v-if="form.configType === 'product'" label="产品知识（AI 生成依据）">
            <a-textarea v-model:value="form.knowledge" :rows="4" placeholder="卖点、人群、差异化…" />
          </a-form-item>
          <a-form-item v-if="form.configType === 'product'" label="销售政策">
            <a-textarea v-model:value="form.salesPolicy" :rows="3" />
          </a-form-item>
          <a-form-item v-if="form.configType === 'product'" label="常见问答 FAQ">
            <a-textarea v-model:value="form.faq" :rows="3" />
          </a-form-item>
          <a-form-item v-if="form.configType === 'strategy_card'" label="策略卡话术要点">
            <a-textarea v-model:value="form.knowledge" :rows="4" />
          </a-form-item>
          <a-form-item v-if="form.configType === 'scene'" label="场景描述">
            <a-textarea v-model:value="form.knowledge" :rows="4" />
          </a-form-item>
        </a-form>
      </a-modal>
    </div>
  </PageWrapper>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { message } from 'ant-design-vue';
import {
  DeleteOutlined,
  EditOutlined,
  InboxOutlined,
  PlusOutlined,
  RedoOutlined,
} from '@ant-design/icons-vue';
import PageWrapper from '../../components/PageWrapper.vue';
import { useAuthStore } from '../../stores/auth';
import {
  createProduct,
  deleteProduct,
  getProducts,
  moveProduct,
  updateProduct,
} from '../../api/content';

const typeLabel = {
  product: '产品',
  strategy_card: '策略卡',
  scene: '场景',
};
const typeColor = {
  product: 'blue',
  strategy_card: 'purple',
  scene: 'green',
};

const tree = ref([]);
const loading = ref(false);
const keyword = ref('');
const selectedIds = ref(new Set());
const auth = useAuthStore();

const brandParam = () => ({ brandId: auth.currentBrandId ?? undefined });

const detailOpen = ref(false);
const detail = ref(null);

const formOpen = ref(false);
const editing = ref(null);
const parentOf = ref(null);
const saving = ref(false);
const form = reactive({
  name: '',
  displayName: '',
  description: '',
  knowledge: '',
  salesPolicy: '',
  faq: '',
  coverUrl: '',
  configType: 'product',
});

const modalTitle = computed(() => {
  if (editing.value) return '编辑节点';
  if (parentOf.value) return `添加子级（${parentOf.value.display_name || parentOf.value.name}）`;
  return '新建产品';
});

const filteredCards = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  if (!kw) return tree.value;
  return tree.value.filter((n) =>
    (n.display_name || n.name).toLowerCase().includes(kw),
  );
});

const allSelected = computed(
  () => filteredCards.value.length > 0
    && filteredCards.value.every((c) => selectedIds.value.has(c.id)),
);

const indeterminate = computed(() => {
  const hits = filteredCards.value.filter((c) => selectedIds.value.has(c.id)).length;
  return hits > 0 && hits < filteredCards.value.length;
});

const firstChar = (card) => (card.display_name || card.name || '?').charAt(0);

const childCount = (card) => {
  let n = (card.children ?? []).length;
  for (const c of card.children ?? []) n += (c.children ?? []).length;
  return n;
};

function toggleSelect(id) {
  const next = new Set(selectedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selectedIds.value = next;
}

function toggleAll() {
  const next = new Set(selectedIds.value);
  if (allSelected.value) {
    for (const c of filteredCards.value) next.delete(c.id);
  } else {
    for (const c of filteredCards.value) next.add(c.id);
  }
  selectedIds.value = next;
}

async function reload() {
  loading.value = true;
  try {
    const data = await getProducts(brandParam());
    tree.value = data;
    const next = new Set(selectedIds.value);
    for (const id of [...next]) {
      if (!findNode(data, id)) next.delete(id);
    }
    selectedIds.value = next;
    if (detail.value) {
      detail.value = findNode(data, detail.value.id) ?? null;
      if (!detail.value) detailOpen.value = false;
    }
  } catch (e) {
    message.error(e.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

function findNode(nodes, id) {
  for (const n of nodes) {
    if (n.id === id) return n;
    const hit = findNode(n.children ?? [], id);
    if (hit) return hit;
  }
  return null;
}

function openDetail(card) {
  detail.value = card;
  detailOpen.value = true;
}

function openCreate(parent) {
  editing.value = null;
  parentOf.value = parent;
  const childType = parent
    ? parent.type === 'product'
      ? 'strategy_card'
      : 'scene'
    : 'product';
  Object.assign(form, {
    name: '',
    displayName: '',
    description: '',
    knowledge: '',
    salesPolicy: '',
    faq: '',
    coverUrl: '',
    configType: childType,
  });
  formOpen.value = true;
}

function openEdit(record) {
  editing.value = record;
  parentOf.value = null;
  Object.assign(form, {
    name: record.name,
    displayName: record.display_name,
    description: record.description,
    knowledge: record.basic_info?.knowledge ?? '',
    salesPolicy: record.basic_info?.sales_policy ?? '',
    faq: record.basic_info?.faq ?? '',
    coverUrl: record.cover_url ?? '',
    configType: record.type,
  });
  formOpen.value = true;
}

async function save() {
  if (!form.name.trim()) {
    message.warning('请输入名称');
    return;
  }
  saving.value = true;
  try {
    if (editing.value) {
      await updateProduct(editing.value.id, {
        name: form.name,
        displayName: form.displayName,
        description: form.description,
        knowledge: form.knowledge,
        salesPolicy: form.salesPolicy,
        faq: form.faq,
        coverUrl: form.coverUrl,
      });
      message.success('已更新');
    } else {
      await createProduct(
        {
          parentId: parentOf.value?.id ?? null,
          name: form.name,
          displayName: form.displayName,
          configType: form.configType,
          description: form.description,
          knowledge: form.knowledge,
          salesPolicy: form.salesPolicy,
          faq: form.faq,
          coverUrl: form.coverUrl,
        },
        brandParam(),
      );
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

async function move(record, direction) {
  try {
    await moveProduct(record.id, direction);
    reload();
  } catch (e) {
    message.warning(e.message || '无法移动');
  }
}

function collectSubtreeIds(node, acc) {
  for (const child of node.children ?? []) collectSubtreeIds(child, acc);
  acc.push(node.id);
  return acc;
}

async function batchRemove() {
  const ids = [];
  for (const card of filteredCards.value) {
    if (selectedIds.value.has(card.id)) collectSubtreeIds(card, ids);
  }
  let ok = 0;
  let fail = 0;
  for (const id of ids) {
    try {
      await deleteProduct(id);
      ok += 1;
    } catch {
      fail += 1;
    }
  }
  if (fail) {
    message.warning(`删除完成：成功 ${ok}，失败 ${fail}（子级或内容包关联）`);
  } else {
    message.success(`已删除 ${ok} 个节点`);
  }
  selectedIds.value = new Set();
  reload();
}

async function removeChild(child) {
  try {
    await deleteProduct(child.id);
    message.success('已删除');
    reload();
  } catch (e) {
    message.error(e.message || '删除失败');
  }
}

async function removeDetail() {
  if (!detail.value) return;
  try {
    await deleteProduct(detail.value.id);
    message.success('已删除');
    detailOpen.value = false;
    reload();
  } catch (e) {
    message.error(e.message || '删除失败');
  }
}

onMounted(reload);
</script>

<style scoped>
.product-config {
  --pc-blue: #5087ec;
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: 10px;
  min-height: 0;
}

.operations-bar {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  border-bottom: 1px solid #f0f0f0;
  flex-wrap: wrap;
}

.batch-operations {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.batch-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.selected-count {
  font-size: 13px;
  color: #64748b;
}

.batch-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.material-grid-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  min-height: 320px;
}

.grid-loading {
  padding: 60px;
  text-align: center;
}

.empty-state {
  padding: 70px 0;
  text-align: center;
}

.empty-icon {
  font-size: 42px;
  color: #cbd5e1;
}

.empty-state p {
  margin: 12px 0 0;
  font-size: 13px;
  color: #94a3b8;
}

.grid-container {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 14px;
}

.material-item {
  position: relative;
  border: 1px solid #e8eef5;
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  background: #fff;
  transition: border-color 0.18s, box-shadow 0.18s, transform 0.18s;
}

.material-item:hover {
  border-color: rgba(80, 135, 236, 0.5);
  box-shadow: 0 6px 18px rgba(80, 135, 236, 0.12);
  transform: translateY(-2px);
}

.material-item.selected {
  border-color: var(--pc-blue);
  box-shadow: 0 0 0 2px rgba(80, 135, 236, 0.25);
}

.item-checkbox {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 2;
  background: rgba(255, 255, 255, 0.85);
  border-radius: 4px;
  padding: 1px 3px;
}

.item-image {
  width: 100%;
  aspect-ratio: 3 / 4;
  background: #f8fafc;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.item-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.image-fallback {
  font-size: 34px;
  font-weight: 700;
  color: #cbd5e1;
}

.image-fallback.big {
  font-size: 72px;
}

.item-name {
  padding: 8px 10px 2px;
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.material-badge-row {
  position: absolute;
  bottom: 6px;
  left: 6px;
  right: 6px;
  display: flex;
  gap: 4px;
  overflow: hidden;
}

.image-set-tag,
.type-tag {
  max-width: 48%;
  padding: 0 6px;
  height: 18px;
  line-height: 17px;
  border-radius: 4px;
  font-size: 10px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.image-set-tag {
  background: rgba(15, 23, 42, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.46);
  color: #fff;
}

.type-tag {
  background: rgba(239, 246, 255, 0.9);
  color: var(--pc-blue);
  border: 1px solid rgba(191, 219, 254, 0.9);
}

.material-detail {
  display: flex;
  gap: 20px;
}

.detail-left {
  flex: 0 0 380px;
}

.image-container {
  border: 1px solid #eef2f7;
  border-radius: 12px;
  background: #f8fafc;
  aspect-ratio: 3 / 4;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.image-container img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.detail-right {
  flex: 1;
  min-width: 0;
}

.info-section {
  margin-bottom: 20px;
}

.info-section h4 {
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
  margin: 0 0 10px;
}

.long-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.8;
  color: #475569;
  white-space: pre-wrap;
  word-break: break-word;
  background: #f8fafc;
  border-radius: 8px;
  padding: 10px 12px;
}

.children-list {
  border: 1px solid #eef2f7;
  border-radius: 10px;
  overflow: hidden;
}

.child-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-bottom: 1px solid #f1f5f9;
}

.child-row:last-child {
  border-bottom: none;
}

.child-row.is-sub {
  background: #f8fafc;
  padding-left: 32px;
}

.child-type {
  flex-shrink: 0;
  margin-right: 0;
}

.child-name {
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
  white-space: nowrap;
}

.child-desc {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: #94a3b8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.child-actions {
  flex-shrink: 0;
  font-size: 12px;
  display: flex;
  align-items: center;
}

.detail-actions {
  margin-top: 8px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.danger {
  color: var(--color-error, #dc2626);
}
</style>
