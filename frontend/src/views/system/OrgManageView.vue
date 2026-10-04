<template>
  <PageWrapper title="组织管理" subtitle="工作区 → 大区 / 经销商 / 门店 → KOS 员工（4级账号体系）">
    <template #extra>
      <a-select
        :value="brandId"
        :options="brandOptions"
        style="width: 220px"
        @change="(v) => (brandId = v)"
      />
      <a-button type="primary" @click="openCreate(null, 1)">
        <PlusOutlined /> 新建组织
      </a-button>
    </template>

    <a-card :bordered="false">
      <a-spin :spinning="loading">
        <a-empty v-if="!tree.length && !loading" description="暂无组织，点击右上角「新建组织」创建" />
        <a-tree
          v-else
          :tree-data="treeData"
          block-node
          default-expand-all
        >
          <template #title="node">
            <div class="org-node">
              <span class="org-name">
                <a-tag :color="LEVEL_COLOR[node.level]" class="org-level">
                  {{ LEVEL_LABEL[node.level] ?? `L${node.level}` }}
                </a-tag>
                {{ node.name }}
                <span class="muted small org-counts">
                  账号 {{ node.userCount }} · 绑定矩阵号 {{ node.kosCount }}
                </span>
              </span>
              <span class="org-actions" @click.stop>
                <a-button type="link" size="small" @click="openCreate(node, node.level + 1)">
                  新增子级
                </a-button>
                <a-button type="link" size="small" @click="openEdit(node)">编辑</a-button>
                <a-button type="link" size="small" danger @click="remove(node)">删除</a-button>
              </span>
            </div>
          </template>
        </a-tree>
      </a-spin>
    </a-card>

    <a-modal
      v-model:open="editorOpen"
      :title="editing ? `编辑组织 · ${editing.name}` : '新建组织'"
      ok-text="保存"
      cancel-text="取消"
      :confirm-loading="saving"
      @ok="save"
    >
      <a-form layout="vertical">
        <a-form-item label="名称" required>
          <a-input v-model:value="form.name" :maxlength="50" placeholder="如：北京SKP / 华东大区" />
        </a-form-item>
        <a-form-item label="层级" required>
          <a-select
            v-model:value="form.level"
            :options="[
              { label: 'L1 大区', value: 1 },
              { label: 'L2 经销商 / 品牌总部', value: 2 },
              { label: 'L3 门店', value: 3 },
            ]"
          />
        </a-form-item>
        <a-form-item label="父组织">
          <a-tree-select
            v-model:value="form.parentId"
            :tree-data="parentOptions"
            placeholder="不选 = 顶级"
            allow-clear
            tree-default-expand-all
          />
        </a-form-item>
        <a-row :gutter="12">
          <a-col :span="12">
            <a-form-item label="大区">
              <a-input v-model:value="form.regionName" placeholder="可选" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="城市">
              <a-input v-model:value="form.cityName" placeholder="可选" />
            </a-form-item>
          </a-col>
        </a-row>
      </a-form>
    </a-modal>
  </PageWrapper>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { message } from 'ant-design-vue';
import { Modal } from 'ant-design-vue';
import { PlusOutlined } from '@ant-design/icons-vue';
import { createOrg, deleteOrg, getOrgTree, updateOrg } from '../../api/org';
import { useAuthStore } from '../../stores/auth';
import PageWrapper from '../../components/PageWrapper.vue';

const auth = useAuthStore();
const brandId = ref(auth.currentBrandId ?? 1);
const tree = ref([]);
const loading = ref(false);

const LEVEL_LABEL = { 1: '大区', 2: '经销商', 3: '门店' };
const LEVEL_COLOR = { 1: 'purple', 2: 'geekblue', 3: 'cyan' };

const brandOptions = computed(() =>
  (auth.brands ?? []).map((b) => ({ label: b.name, value: b.id })),
);

const treeData = computed(() => {
  const build = (nodes) =>
    (nodes ?? []).map((n) => ({
      key: n.id,
      title: n.name,
      isLeaf: !(n.children ?? []).length,
      children: build(n.children),
      ...n,
    }));
  return build(tree.value);
});

const parentOptions = computed(() => {
  const build = (nodes) =>
    (nodes ?? []).map((n) => ({
      value: n.id,
      title: `${LEVEL_LABEL[n.level] ?? n.level} / ${n.name}`,
      children: build(n.children),
    }));
  return build(tree.value);
});

async function load() {
  loading.value = true;
  try {
    const data = await getOrgTree({ brandId: brandId.value });
    tree.value = data.list ?? [];
  } catch (e) {
    message.error(e.message || '加载组织失败');
  } finally {
    loading.value = false;
  }
}

const editorOpen = ref(false);
const saving = ref(false);
const editing = ref(null);
const form = reactive({
  name: '',
  level: 3,
  parentId: null,
  regionName: '',
  cityName: '',
});

function openCreate(parent, level) {
  editing.value = null;
  form.name = '';
  form.level = level ?? 3;
  form.parentId = parent?.id ?? null;
  form.regionName = '';
  form.cityName = '';
  editorOpen.value = true;
}

function openEdit(node) {
  editing.value = node;
  form.name = node.name;
  form.level = node.level;
  form.parentId = node.parentId;
  form.regionName = node.regionName ?? '';
  form.cityName = node.cityName ?? '';
  editorOpen.value = true;
}

async function save() {
  if (!form.name.trim()) {
    message.warning('请输入组织名称');
    return;
  }
  saving.value = true;
  try {
    if (editing.value) {
      await updateOrg(editing.value.id, {
        name: form.name.trim(),
        level: form.level,
        parentId: form.parentId,
        regionName: form.regionName || null,
        cityName: form.cityName || null,
      });
      message.success('已保存');
    } else {
      await createOrg({
        brandId: brandId.value,
        name: form.name.trim(),
        level: form.level,
        parentId: form.parentId ?? undefined,
        regionName: form.regionName || undefined,
        cityName: form.cityName || undefined,
      });
      message.success('组织已创建');
    }
    editorOpen.value = false;
    load();
  } catch (e) {
    message.error(e.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

function remove(node) {
  Modal.confirm({
    title: `删除组织「${node.name}」？`,
    content: '存在子组织或账号时不可删除',
    okText: '删除',
    okType: 'danger',
    onOk: async () => {
      try {
        await deleteOrg(node.id);
        message.success('已删除');
        load();
      } catch (e) {
        message.error(e.message || '删除失败');
      }
    },
  });
}

onMounted(load);
</script>

<style scoped>
.org-node {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.org-name {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
}

.org-level {
  flex-shrink: 0;
}

.org-counts {
  margin-left: 6px;
}

.org-actions {
  flex-shrink: 0;
}

.muted {
  color: var(--color-text-secondary);
}

.small {
  font-size: 12px;
}
</style>
