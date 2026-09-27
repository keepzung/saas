<template>
  <PageWrapper title="资料库">
    <div class="lib-layout">
      <!-- 左侧产品树 -->
      <div class="tree-card">
        <div class="tree-title">产品/服务资料库</div>
        <a-tree
          v-if="treeNodes.length"
          v-model:expandedKeys="expandedKeys"
          v-model:selectedKeys="selectedKeys"
          :tree-data="treeNodes"
          :field-names="{ children: 'children', title: 'title', key: 'key' }"
          block-node
          @select="onSelect"
        />
        <a-empty v-else :image="Empty.PRESENTED_IMAGE_SIMPLE" description="暂无产品树" />
        <div class="tree-footer">
          <span class="tree-hint">在左侧产品树中选择一个产品，开始配置资料</span>
        </div>
      </div>

      <!-- 右侧内容 -->
      <div class="lib-main">
        <template v-if="selectedProduct">
          <div class="product-head">
            <span class="product-name">{{ selectedProduct.display_name ?? selectedProduct.name }}</span>
            <a-tag color="blue">{{ typeLabel(selectedProduct.type) }}</a-tag>
          </div>
          <div class="info-block" v-for="sec in sections" :key="sec.key">
            <div class="info-head">
              <span class="info-title">{{ sec.label }}</span>
              <a-button
                v-if="editing !== sec.key"
                type="link"
                size="small"
                @click="startEdit(sec.key)"
              >编辑</a-button>
            </div>
            <a-textarea
              v-if="editing === sec.key"
              v-model:value="draft"
              :rows="sec.rows"
              placeholder="沉淀 AI 写作所需的知识库，供生成文章时引用"
            />
            <div v-else class="info-body" :class="{ empty: !sec.value }">
              {{ sec.value || '暂未配置，点击「编辑」录入' }}
            </div>
            <div v-if="editing === sec.key" class="info-actions">
              <a-button size="small" @click="editing = null">取消</a-button>
              <a-button type="primary" size="small" :loading="saving" @click="save">保存</a-button>
            </div>
          </div>
        </template>

        <template v-else>
          <div class="empty-hero">
            <FolderOpenOutlined class="hero-icon" />
            <div class="hero-title">产品/服务资料库</div>
            <div class="hero-sub">配置产品基础信息、产品素材，沉淀 AI 写作所需的产品知识</div>
            <div class="hero-cards">
              <div class="hero-card">
                <ProfileOutlined />
                <div>
                  <div class="hc-title">产品基础信息</div>
                  <div class="hc-desc">录入规格参数、销售政策、常见问答，作为 AI 写作的产品知识库</div>
                </div>
              </div>
              <div class="hero-card" @click="goMaterial">
                <PictureOutlined />
                <div>
                  <div class="hc-title">产品素材库</div>
                  <div class="hc-desc">上传和管理产品图片素材，支持标签/套图分类与取用限额</div>
                </div>
              </div>
              <div class="hero-card">
                <ApartmentOutlined />
                <div>
                  <div class="hc-title">三级架构管理</div>
                  <div class="hc-desc">品牌 → 产品线 → 产品，层级清晰，便于多产品统一维护</div>
                </div>
              </div>
            </div>
            <div class="hero-hint">← 在左侧产品树中选择一个产品，开始配置资料</div>
          </div>
        </template>
      </div>
    </div>
  </PageWrapper>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { message, Empty } from 'ant-design-vue';
import {
  FolderOpenOutlined,
  ProfileOutlined,
  PictureOutlined,
  ApartmentOutlined,
} from '@ant-design/icons-vue';
import PageWrapper from '../../components/PageWrapper.vue';
import { useAuthStore } from '../../stores/auth';
import { getProducts, updateProduct } from '../../api/content';

const auth = useAuthStore();
const brandId = computed(() => auth.currentBrandId ?? 1);

const treeNodes = ref([]);
const expandedKeys = ref([]);
const selectedKeys = ref([]);
const selectedProduct = ref(null);
const editing = ref(null);
const draft = ref('');
const saving = ref(false);

const sections = computed(() => {
  const bi = selectedProduct.value?.basic_info ?? {};
  return [
    { key: 'knowledge', label: '产品知识', rows: 8, value: selectedProduct.value?.knowledge ?? bi.knowledge },
    { key: 'salesPolicy', label: '销售政策', rows: 5, value: bi.sales_policy },
    { key: 'faq', label: '常见问答 FAQ', rows: 5, value: bi.faq },
  ];
});

const typeLabel = (t) =>
  ({ brand: '品牌', series: '产品线', product: '产品', category: '品类' }[t] ?? t);

const toNodes = (nodes) =>
  (nodes ?? []).map((n) => ({
    key: n.id,
    title: n.display_name ?? n.name,
    raw: n,
    children: toNodes(n.children),
  }));

const loadTree = async () => {
  const data = await getProducts({ brandId: brandId.value });
  treeNodes.value = toNodes(data ?? []);
  expandedKeys.value = treeNodes.value.flatMap((n) => [n.key, ...(n.children ?? []).map((c) => c.key)]);
};

const onSelect = (keys, { node }) => {
  if (!keys.length) return;
  selectedProduct.value = node.raw;
  editing.value = null;
};

const startEdit = (key) => {
  editing.value = key;
  const bi = selectedProduct.value?.basic_info ?? {};
  draft.value =
    key === 'knowledge'
      ? selectedProduct.value?.knowledge ?? bi.knowledge ?? ''
      : key === 'salesPolicy'
        ? bi.sales_policy ?? ''
        : bi.faq ?? '';
};

const save = async () => {
  saving.value = true;
  try {
    const payload = { name: selectedProduct.value.name };
    payload[editing.value] = draft.value;
    await updateProduct(selectedProduct.value.id, payload);
    if (editing.value === 'knowledge') selectedProduct.value.knowledge = draft.value;
    if (editing.value === 'salesPolicy') {
      selectedProduct.value.basic_info = { ...(selectedProduct.value.basic_info ?? {}), sales_policy: draft.value };
    }
    if (editing.value === 'faq') {
      selectedProduct.value.basic_info = { ...(selectedProduct.value.basic_info ?? {}), faq: draft.value };
    }
    editing.value = null;
    message.success('已保存');
  } catch (e) {
    message.error(e?.response?.data?.msg ?? '保存失败');
  } finally {
    saving.value = false;
  }
};

const goMaterial = () => {}; // 入口由侧栏切换，保留卡位

onMounted(loadTree);
</script>

<style scoped>
.lib-layout {
  display: flex;
  gap: 16px;
  padding: 16px 20px;
  align-items: stretch;
  min-height: 0;
  flex: 1;
}

.tree-card {
  width: 300px;
  flex: 0 0 300px;
  background: #fff;
  border-radius: 16px;
  padding: 18px 14px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 200px);
  overflow: auto;
}

.tree-title {
  font-size: 17px;
  font-style: italic;
  font-weight: 700;
  color: #1e293b;
  margin-bottom: 12px;
}

.tree-footer {
  margin-top: auto;
  padding-top: 12px;
}

.tree-hint {
  color: #94a3b8;
  font-size: 12px;
}

.lib-main {
  flex: 1;
  min-width: 0;
  background: #fff;
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  overflow: auto;
  max-height: calc(100vh - 200px);
}

.product-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}

.product-name {
  font-size: 18px;
  font-weight: 700;
  color: #1e293b;
}

.info-block {
  margin-bottom: 18px;
}

.info-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.info-title {
  font-weight: 600;
  color: #334155;
  font-size: 14px;
}

.info-body {
  margin-top: 8px;
  padding: 12px 14px;
  background: #f8fafc;
  border-radius: 10px;
  color: #475569;
  font-size: 13px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

.info-body.empty {
  color: #94a3b8;
}

.info-actions {
  margin-top: 8px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.empty-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 20px;
  text-align: center;
}

.hero-icon {
  font-size: 44px;
  color: #3456e6;
}

.hero-title {
  margin-top: 14px;
  font-size: 20px;
  font-weight: 700;
  color: #1e293b;
}

.hero-sub {
  margin-top: 6px;
  color: #64748b;
  font-size: 13px;
}

.hero-cards {
  margin-top: 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: min(560px, 100%);
}

.hero-card {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 14px 16px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
  text-align: left;
  color: #3456e6;
  font-size: 18px;
}

.hc-title {
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
}

.hc-desc {
  margin-top: 2px;
  font-size: 12.5px;
  color: #94a3b8;
}

.hero-hint {
  margin-top: 24px;
  padding: 8px 18px;
  border-radius: 999px;
  background: #eef4ff;
  color: #3456e6;
  font-size: 13px;
}
</style>
