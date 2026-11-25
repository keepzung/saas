<template>
  <PageWrapper :title="route.meta.title">
    <template #extra>
      <span class="pro-badge">PRO</span>
    </template>
    <a-tabs v-model:activeKey="activeTab" @change="onTabChange">
      <a-tab-pane key="persona" tab="人设管理">
        <div class="pool-head">
          <span class="pool-tip">AI 写作时扮演的角色身份。写作页从池里选 1 个，填入策略提示词的【人设】占位符。</span>
          <a-button type="primary" @click="openPersonaForm()"><PlusOutlined /> 新建人设</a-button>
        </div>
        <a-table
          :columns="personaCols"
          :data-source="personas"
          row-key="id"
          :pagination="false"
          :loading="loading"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'content'">
              <span class="cell-pre">{{ record.content || '—' }}</span>
            </template>
            <template v-else-if="column.key === 'enabled'">
              <a-switch size="small" :checked="record.enabled" @change="(v) => togglePersona(record, v)" />
            </template>
            <template v-else-if="column.key === 'ops'">
              <a-space>
                <a-button size="small" @click="openPersonaForm(record)">编辑</a-button>
                <a-popconfirm title="确定删除该人设？" @confirm="removePersona(record)">
                  <a-button size="small" danger>删除</a-button>
                </a-popconfirm>
              </a-space>
            </template>
          </template>
        </a-table>
      </a-tab-pane>
      <a-tab-pane key="hook" tab="钩子管理">
        <div class="pool-head">
          <span class="pool-tip">文章首尾用于引导互动的短句。写作页勾选 N 个，填入策略提示词的【钩子】占位符。</span>
          <a-button type="primary" @click="openHookForm()"><PlusOutlined /> 新建钩子</a-button>
        </div>
        <a-table
          :columns="hookCols"
          :data-source="hooks"
          row-key="id"
          :pagination="false"
          :loading="loading"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'position'">
              <a-tag v-if="record.position === 'opening'" color="blue">开头</a-tag>
              <a-tag v-else-if="record.position === 'closing'" color="green">结尾</a-tag>
              <a-tag v-else>不限</a-tag>
            </template>
            <template v-else-if="column.key === 'enabled'">
              <a-switch size="small" :checked="record.enabled" @change="(v) => toggleHook(record, v)" />
            </template>
            <template v-else-if="column.key === 'ops'">
              <a-space>
                <a-button size="small" @click="openHookForm(record)">编辑</a-button>
                <a-popconfirm title="确定删除该钩子？" @confirm="removeHook(record)">
                  <a-button size="small" danger>删除</a-button>
                </a-popconfirm>
              </a-space>
            </template>
          </template>
        </a-table>
      </a-tab-pane>
    </a-tabs>

    <a-modal
      v-model:open="personaOpen"
      :title="personaForm.id ? '编辑人设' : '新建人设'"
      :confirm-loading="saving"
      @ok="savePersonaForm"
    >
      <a-form layout="vertical">
        <a-form-item label="人设名称" required>
          <a-input v-model:value="personaForm.name" :maxlength="60" placeholder="如：从业十年的空调老师傅" />
        </a-form-item>
        <a-form-item label="人设内容（写作时作为角色身份注入）">
          <a-textarea
            v-model:value="personaForm.content"
            :rows="4"
            placeholder="如：45 岁家电门店老销售，装了 20 年空调，说话实在、爱举真实案例，不夸大不忽悠"
          />
        </a-form-item>
      </a-form>
    </a-modal>

    <a-modal
      v-model:open="hookOpen"
      :title="hookForm.id ? '编辑钩子' : '新建钩子'"
      :confirm-loading="saving"
      @ok="saveHookForm"
    >
      <a-form layout="vertical">
        <a-form-item label="钩子文案" required>
          <a-textarea
            v-model:value="hookForm.text"
            :rows="3"
            placeholder="如：你家空调也在偷偷吃电吗？看到最后教你一招省一半。"
          />
        </a-form-item>
        <a-form-item label="建议位置">
          <a-radio-group v-model:value="hookForm.position">
            <a-radio value="any">不限</a-radio>
            <a-radio value="opening">开头</a-radio>
            <a-radio value="closing">结尾</a-radio>
          </a-radio-group>
        </a-form-item>
      </a-form>
    </a-modal>
  </PageWrapper>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import { PlusOutlined } from '@ant-design/icons-vue';
import PageWrapper from '../../components/PageWrapper.vue';
import { useAuthStore } from '../../stores/auth';
import {
  getPersonas,
  createPersona,
  updatePersona,
  deletePersona,
  getHooks,
  createHook,
  updateHook,
  deleteHook,
} from '../../api/contentpro';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const brandId = computed(() => auth.currentBrandId ?? 1);

const activeTab = ref(route.meta.poolTab === 'hook' ? 'hook' : 'persona');
const onTabChange = (key) => {
  const path = key === 'hook' ? '/content-pro/config/hooks' : '/content-pro/config/personas';
  if (route.path !== path) router.replace(path);
};
watch(
  () => route.meta.poolTab,
  (t) => {
    activeTab.value = t === 'hook' ? 'hook' : 'persona';
  },
);

const loading = ref(false);
const saving = ref(false);
const personas = ref([]);
const hooks = ref([]);

const personaCols = [
  { title: '人设名称', dataIndex: 'name', key: 'name', width: 220 },
  { title: '人设内容', key: 'content' },
  { title: '启用', key: 'enabled', width: 90 },
  { title: '操作', key: 'ops', width: 150 },
];
const hookCols = [
  { title: '钩子文案', key: 'text' },
  { title: '建议位置', key: 'position', width: 110 },
  { title: '启用', key: 'enabled', width: 90 },
  { title: '操作', key: 'ops', width: 150 },
];

const personaOpen = ref(false);
const hookOpen = ref(false);
const personaForm = reactive({ id: null, name: '', content: '' });
const hookForm = reactive({ id: null, text: '', position: 'any' });

const openPersonaForm = (row) => {
  personaForm.id = row?.id ?? null;
  personaForm.name = row?.name ?? '';
  personaForm.content = row?.content ?? '';
  personaOpen.value = true;
};
const openHookForm = (row) => {
  hookForm.id = row?.id ?? null;
  hookForm.text = row?.text ?? '';
  hookForm.position = row?.position ?? 'any';
  hookOpen.value = true;
};

const load = async () => {
  loading.value = true;
  try {
    const [p, h] = await Promise.all([
      getPersonas({ brandId: brandId.value }),
      getHooks({ brandId: brandId.value }),
    ]);
    personas.value = p?.list ?? [];
    hooks.value = h?.list ?? [];
  } finally {
    loading.value = false;
  }
};

const savePersonaForm = async () => {
  if (!personaForm.name.trim()) {
    message.warning('请填写人设名称');
    return;
  }
  saving.value = true;
  try {
    if (personaForm.id) {
      await updatePersona(personaForm.id, { ...personaForm });
    } else {
      await createPersona({ ...personaForm }, { brandId: brandId.value });
    }
    message.success('已保存');
    personaOpen.value = false;
    load();
  } finally {
    saving.value = false;
  }
};

const togglePersona = async (row, enabled) => {
  await updatePersona(row.id, { enabled });
  row.enabled = enabled;
};

const removePersona = async (row) => {
  await deletePersona(row.id);
  message.success('已删除');
  load();
};

const saveHookForm = async () => {
  if (!hookForm.text.trim()) {
    message.warning('请填写钩子文案');
    return;
  }
  saving.value = true;
  try {
    if (hookForm.id) {
      await updateHook(hookForm.id, { ...hookForm });
    } else {
      await createHook({ ...hookForm }, { brandId: brandId.value });
    }
    message.success('已保存');
    hookOpen.value = false;
    load();
  } finally {
    saving.value = false;
  }
};

const toggleHook = async (row, enabled) => {
  await updateHook(row.id, { enabled });
  row.enabled = enabled;
};

const removeHook = async (row) => {
  await deleteHook(row.id);
  message.success('已删除');
  load();
};

load();
</script>

<style scoped>
.pool-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.pool-tip {
  color: #64748b;
  font-size: 13px;
}
.cell-pre {
  white-space: pre-wrap;
  word-break: break-all;
}
.pro-badge {
  background: linear-gradient(135deg, #f59e0b, #d97706);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 4px;
}
</style>
