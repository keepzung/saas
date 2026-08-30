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

    <a-card :bordered="false">
      <a-table
        :columns="columns"
        :data-source="tree"
        :loading="loading"
        :pagination="false"
        row-key="id"
        :expand-column-width="40"
        default-expand-all
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <span class="node-name">
              {{ record.display_name || record.name }}
              <a-tag :color="typeColor[record.type]" class="type-tag">
                {{ typeLabel[record.type] }}
              </a-tag>
            </span>
          </template>
          <template v-else-if="column.key === 'description'">
            <span class="muted desc">{{ record.description || '-' }}</span>
          </template>
          <template v-else-if="column.key === 'action'">
            <a v-if="depthOf(record) < 2" @click="openCreate(record)">添加子级</a>
            <a-divider v-if="depthOf(record) < 2" type="vertical" />
            <a @click="openEdit(record)">编辑</a>
            <a-divider type="vertical" />
            <a @click="move(record, 'up')">上移</a>
            <a-divider type="vertical" />
            <a @click="move(record, 'down')">下移</a>
            <a-divider type="vertical" />
            <a-popconfirm title="确认删除该节点？" @confirm="remove(record)">
              <a class="danger">删除</a>
            </a-popconfirm>
          </template>
        </template>
      </a-table>
    </a-card>

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
  </PageWrapper>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { message } from 'ant-design-vue';
import { PlusOutlined } from '@ant-design/icons-vue';
import PageWrapper from '../../components/PageWrapper.vue';
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

const columns = [
  { key: 'name', title: '名称' },
  { key: 'description', title: '简介' },
  { key: 'action', title: '操作', width: 320 },
];

const tree = ref([]);
const loading = ref(false);
const idMap = ref({});

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
  configType: 'product',
});

const modalTitle = computed(() => {
  if (editing.value) return '编辑节点';
  if (parentOf.value) return `添加子级（${parentOf.value.name}）`;
  return '新建产品';
});

const depthOf = (record) => {
  let d = 0;
  let cur = record;
  while (cur?.parent_id) {
    d += 1;
    cur = idMap.value[cur.parent_id];
  }
  return d;
};

function flatten(nodes, map) {
  for (const n of nodes) {
    map[n.id] = n;
    if (n.children?.length) flatten(n.children, map);
  }
}

async function reload() {
  loading.value = true;
  try {
    const data = await getProducts();
    tree.value = data;
    const map = {};
    flatten(data, map);
    idMap.value = map;
  } catch (e) {
    message.error(e.message || '加载失败');
  } finally {
    loading.value = false;
  }
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
      });
      message.success('已更新');
    } else {
      await createProduct({
        parentId: parentOf.value?.id ?? null,
        name: form.name,
        displayName: form.displayName,
        configType: form.configType,
        description: form.description,
        knowledge: form.knowledge,
        salesPolicy: form.salesPolicy,
        faq: form.faq,
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

async function move(record, direction) {
  try {
    await moveProduct(record.id, direction);
    reload();
  } catch (e) {
    message.warning(e.message || '无法移动');
  }
}

async function remove(record) {
  try {
    await deleteProduct(record.id);
    message.success('已删除');
    reload();
  } catch (e) {
    message.error(e.message || '删除失败');
  }
}

onMounted(reload);
</script>

<style scoped>
.node-name {
  font-weight: 500;
}

.type-tag {
  margin-left: 8px;
  font-size: 11px;
}

.muted {
  color: var(--color-text-secondary);
}

.desc {
  font-size: 12px;
}

.danger {
  color: var(--color-error);
}
</style>
