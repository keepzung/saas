<template>
  <PageWrapper title="用户管理" subtitle="账号创建与模块权限分配">
    <template #extra>
      <a-button type="primary" @click="openCreate">
        <PlusOutlined /> 新建用户
      </a-button>
    </template>

    <a-card :bordered="false">
      <a-table
        :columns="columns"
        :data-source="rows"
        :loading="loading"
        :pagination="false"
        row-key="id"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'nickname'">
            <div class="c-name">{{ record.nickname || record.phone }}</div>
            <div class="muted small">{{ record.phone }}</div>
          </template>
          <template v-else-if="column.key === 'role'">
            <a-tag :color="record.role === 'ADMIN' ? 'purple' : 'blue'">
              {{ record.role === 'ADMIN' ? '管理员' : '销售' }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'modules'">
            <a-tag v-if="isAllModules(record)" color="green">全部模块</a-tag>
            <a-tooltip v-else :title="moduleNames(record)">
              <a-tag color="orange">{{ record.moduleIds.length }} 个模块</a-tag>
            </a-tooltip>
          </template>
          <template v-else-if="column.key === 'created'">
            {{ fmtDateTime(record.createdAt) }}
          </template>
          <template v-else-if="column.key === 'actions'">
            <a-button type="link" size="small" @click="openEdit(record)">
              编辑
            </a-button>
            <a-button
              type="link"
              size="small"
              @click="openResetPassword(record)"
            >
              重置密码
            </a-button>
          </template>
        </template>
      </a-table>
    </a-card>

    <a-drawer
      v-model:open="drawerOpen"
      :title="editing ? `编辑用户 · ${editing.nickname || editing.phone}` : '新建用户'"
      width="460"
    >
      <a-form layout="vertical">
        <a-form-item label="手机号（登录账号）">
          <a-input
            v-model:value="form.phone"
            :disabled="!!editing"
            :maxlength="11"
            placeholder="11 位手机号"
          />
        </a-form-item>
        <a-form-item v-if="!editing" label="初始密码">
          <a-input-password
            v-model:value="form.password"
            placeholder="至少 8 位"
          />
        </a-form-item>
        <a-form-item label="昵称">
          <a-input v-model:value="form.nickname" :maxlength="50" />
        </a-form-item>
        <a-form-item label="角色">
          <a-select v-model:value="form.role" :options="roleOptions" />
        </a-form-item>
        <a-form-item>
          <template #label>
            可见模块
            <span class="muted small">（不勾选 = 全部可见；管理员始终全部）</span>
          </template>
          <div class="module-tree">
            <a-tree
              v-model:checkedKeys="checkedKeys"
              :tree-data="moduleTreeData"
              checkable
              :selectable="false"
              default-expand-all
            />
          </div>
        </a-form-item>
        <a-button type="primary" block :loading="saving" @click="save">
          {{ editing ? '保存修改' : '创建用户' }}
        </a-button>
      </a-form>
    </a-drawer>

    <a-modal
      v-model:open="resetOpen"
      :title="`重置密码 · ${resetting?.nickname || resetting?.phone || ''}`"
      ok-text="确认重置"
      cancel-text="取消"
      :confirm-loading="resettingBusy"
      @ok="doResetPassword"
    >
      <a-input-password
        v-model:value="resetPassword"
        placeholder="新密码（至少 8 位）"
        style="margin-top: 12px"
      />
    </a-modal>
  </PageWrapper>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { message } from 'ant-design-vue';
import { PlusOutlined } from '@ant-design/icons-vue';
import dayjs from 'dayjs';
import PageWrapper from '../../components/PageWrapper.vue';
import {
  createUser,
  getUsers,
  resetUserPassword,
  updateUser,
} from '../../api/user';
import { useAuthStore } from '../../stores/auth';

const auth = useAuthStore();
const rows = ref([]);
const loading = ref(false);

const drawerOpen = ref(false);
const editing = ref(null);
const saving = ref(false);
const checkedKeys = ref([]);
const form = reactive({
  phone: '',
  password: '',
  nickname: '',
  role: 'SALES',
});

const resetOpen = ref(false);
const resetting = ref(null);
const resettingBusy = ref(false);
const resetPassword = ref('');

const roleOptions = [
  { label: '管理员（全部权限）', value: 'ADMIN' },
  { label: '销售（按模块分配）', value: 'SALES' },
];

const columns = [
  { title: '用户', key: 'nickname', width: 200 },
  { title: '角色', key: 'role', width: 100 },
  { title: '模块权限', key: 'modules', width: 140 },
  { title: '创建时间', key: 'created', width: 170 },
  { title: '操作', key: 'actions', width: 160 },
];

const featureNameMap = computed(() => {
  const map = new Map();
  const walk = (nodes) => {
    for (const n of nodes ?? []) {
      if (n.children) walk(n.children);
      else if (n.path) map.set(n.id, n.name);
    }
  };
  walk(auth.moduleTree);
  return map;
});

const moduleTreeData = computed(() => {
  const build = (nodes) => {
    const result = [];
    for (const n of nodes ?? []) {
      if (n.children) {
        const kids = build(n.children);
        if (kids.length) {
          result.push({ key: `g_${n.id}`, title: n.name, children: kids });
        }
      } else if (n.path) {
        result.push({ key: String(n.id), title: n.name, isLeaf: true });
      }
    }
    return result;
  };
  return build(auth.moduleTree);
});

const isAllModules = (record) =>
  record.role === 'ADMIN' || (record.moduleIds ?? []).length === 0;

const moduleNames = (record) =>
  (record.moduleIds ?? [])
    .map((id) => featureNameMap.value.get(id) ?? `#${id}`)
    .join('、') || '（无）';

const fmtDateTime = (d) => (d ? dayjs(d).format('YYYY-MM-DD HH:mm') : '-');

async function load() {
  loading.value = true;
  try {
    const data = await getUsers();
    rows.value = data.list ?? [];
  } catch (e) {
    message.error(e.message || '加载用户列表失败');
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  editing.value = null;
  form.phone = '';
  form.password = '';
  form.nickname = '';
  form.role = 'SALES';
  checkedKeys.value = [];
  drawerOpen.value = true;
}

function openEdit(record) {
  editing.value = record;
  form.phone = record.phone;
  form.password = '';
  form.nickname = record.nickname || '';
  form.role = record.role;
  checkedKeys.value = (record.moduleIds ?? []).map(String);
  drawerOpen.value = true;
}

async function save() {
  if (!editing.value) {
    if (!/^1\d{10}$/.test(form.phone)) {
      message.warning('请输入正确的 11 位手机号');
      return;
    }
    if ((form.password || '').length < 8) {
      message.warning('初始密码至少 8 位');
      return;
    }
  }
  saving.value = true;
  try {
    const moduleIds = checkedKeys.value
      .filter((k) => !String(k).startsWith('g_'))
      .map(Number);
    if (editing.value) {
      await updateUser(editing.value.id, {
        nickname: form.nickname || undefined,
        role: form.role,
        moduleIds,
      });
      message.success('已保存');
    } else {
      await createUser({
        phone: form.phone,
        password: form.password,
        nickname: form.nickname || undefined,
        role: form.role,
        moduleIds,
      });
      message.success('用户已创建');
    }
    drawerOpen.value = false;
    load();
  } catch (e) {
    message.error(e.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

function openResetPassword(record) {
  resetting.value = record;
  resetPassword.value = '';
  resetOpen.value = true;
}

async function doResetPassword() {
  if ((resetPassword.value || '').length < 8) {
    message.warning('新密码至少 8 位');
    return;
  }
  resettingBusy.value = true;
  try {
    await resetUserPassword(resetting.value.id, resetPassword.value);
    message.success('密码已重置');
    resetOpen.value = false;
  } catch (e) {
    message.error(e.message || '重置失败');
  } finally {
    resettingBusy.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.c-name {
  font-weight: 500;
}

.muted {
  color: var(--color-text-secondary);
}

.small {
  font-size: 12px;
}

.module-tree {
  border: 1px solid var(--color-border-secondary);
  border-radius: 6px;
  padding: 8px 12px;
  max-height: 320px;
  overflow: auto;
}
</style>
