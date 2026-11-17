<template>
  <PageWrapper title="知识库规则">
    <template #extra>
      <a-button size="small" @click="load"><ReloadOutlined /> 刷新</a-button>
    </template>
    <a-tabs v-model:activeKey="category" @change="load">
      <a-tab-pane v-for="c in CATEGORIES" :key="c.value" :tab="c.label" />
    </a-tabs>
    <div class="rl-toolbar">
      <a-button type="primary" size="small" @click="openForm()">
        <PlusOutlined /> 新建规则
      </a-button>
      <span class="rl-hint">
        {{ categoryLabel }}规则{{ category === 'compliance' ? '：内容出厂前自动扫描，block 拦截 / flag 强制重写' : '：私信与评论自动化执行' }}
      </span>
    </div>
    <a-table
      :columns="columns"
      :data-source="list"
      row-key="id"
      size="small"
      :pagination="{ pageSize: 10, showSizeChanger: false }"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'name'">
          <span class="rl-name">{{ record.name }}</span>
          <div class="rl-pattern">{{ record.pattern }}</div>
        </template>
        <template v-else-if="column.key === 'action'">
          <a-tag :color="actionColor(record.action)">{{ actionLabel(record.action) }}</a-tag>
        </template>
        <template v-else-if="column.key === 'enabled'">
          <a-switch size="small" :checked="record.enabled" @change="(v) => onToggle(record, v)" />
        </template>
        <template v-else-if="column.key === 'ops'">
          <a-space>
            <a-button size="small" type="text" @click="openForm(record)">编辑</a-button>
            <a-button size="small" type="text" danger @click="onDelete(record)">删除</a-button>
          </a-space>
        </template>
      </template>
    </a-table>

    <a-drawer
      v-model:open="formOpen"
      :title="form.id ? '编辑规则' : '新建规则'"
      :width="480"
      destroy-on-close
    >
      <a-form layout="vertical">
        <a-form-item label="规则名称" required>
          <a-input v-model:value="form.name" :maxlength="40" placeholder="如：广告法绝对化用语" />
        </a-form-item>
        <a-form-item label="规则类别">
          <a-select v-model:value="form.category">
            <a-select-option v-for="c in CATEGORIES" :key="c.value" :value="c.value">{{ c.label }}</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="匹配词（逗号/换行分隔，或 /正则/）" required>
          <a-textarea v-model:value="form.pattern" :rows="4" placeholder="如：最好,第一,绝对 / 或正则：/( lowest|cheapest )/i" />
        </a-form-item>
        <a-form-item label="命中动作">
          <a-select v-model:value="form.action">
            <a-select-option value="flag">标记（计入质检问题，强制重写）</a-select-option>
            <a-select-option value="block">拦截（内容不允许出厂）</a-select-option>
            <a-select-option value="route_human">转人工（私信命中后不再自动回复）</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="命中后的引导话术建议">
          <a-textarea v-model:value="form.replyHint" :rows="2" placeholder="可选：命中后机器人使用的合规引导话术" />
        </a-form-item>
        <a-form-item label="启用">
          <a-switch v-model:checked="form.enabled" />
        </a-form-item>
      </a-form>
      <template #footer>
        <a-space>
          <a-button @click="formOpen = false">取消</a-button>
          <a-button type="primary" :loading="saving" @click="save">保存</a-button>
        </a-space>
      </template>
    </a-drawer>
  </PageWrapper>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { message } from 'ant-design-vue';
import { ReloadOutlined, PlusOutlined } from '@ant-design/icons-vue';
import PageWrapper from '../../components/PageWrapper.vue';
import { useAuthStore } from '../../stores/auth';
import {
  getKnowledgeRules,
  createKnowledgeRule,
  updateKnowledgeRule,
  deleteKnowledgeRules,
} from '../../api/contentpro';

const auth = useAuthStore();
const brandId = computed(() => auth.currentBrandId ?? 1);

const CATEGORIES = [
  { value: 'compliance', label: '合规红线' },
  { value: 'dm', label: '私信接待' },
  { value: 'comment', label: '评论运营' },
  { value: 'routing', label: '分流转接' },
];
const category = ref('compliance');
const categoryLabel = computed(
  () => CATEGORIES.find((c) => c.value === category.value)?.label ?? '',
);

const columns = [
  { key: 'name', title: '规则', width: '48%' },
  { key: 'action', title: '命中动作', width: 110 },
  { key: 'replyHint', title: '引导话术', ellipsis: true },
  { key: 'enabled', title: '启用', width: 70 },
  { key: 'ops', title: '操作', width: 120 },
];

const list = ref([]);
const formOpen = ref(false);
const saving = ref(false);
const emptyForm = () => ({
  id: null,
  category: category.value,
  name: '',
  pattern: '',
  action: 'flag',
  replyHint: '',
  enabled: true,
});
const form = ref(emptyForm());

const actionLabel = (a) => ({ flag: '标记', block: '拦截', route_human: '转人工' }[a] ?? a);
const actionColor = (a) => ({ flag: 'orange', block: 'red', route_human: 'blue' }[a] ?? 'default');

const load = async () => {
  const data = await getKnowledgeRules({ brandId: brandId.value, category: category.value });
  list.value = data?.list ?? [];
};

const openForm = (row) => {
  form.value = row ? { ...emptyForm(), ...row } : emptyForm();
  formOpen.value = true;
};

const save = async () => {
  if (!form.value.name.trim() || !form.value.pattern.trim()) {
    message.warning('请填写规则名称和匹配词');
    return;
  }
  saving.value = true;
  try {
    if (form.value.id) {
      await updateKnowledgeRule(form.value.id, form.value);
    } else {
      await createKnowledgeRule(form.value, { brandId: brandId.value });
    }
    message.success('已保存');
    formOpen.value = false;
    await load();
  } finally {
    saving.value = false;
  }
};

const onToggle = (row, v) => {
  updateKnowledgeRule(row.id, { enabled: v }).then(() => {
    row.enabled = v;
  });
};

const onDelete = (row) => {
  deleteKnowledgeRules([row.id]).then(() => {
    message.success('已删除');
    load();
  });
};

onMounted(load);
</script>

<style scoped>
.rl-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.rl-hint {
  color: #999;
  font-size: 12px;
}
.rl-name {
  font-weight: 600;
}
.rl-pattern {
  color: #999;
  font-size: 12px;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 360px;
}
</style>
