<template>
  <PageWrapper title="用户管理" subtitle="账号创建与模块 / 品牌权限分配">
    <template #extra>
      <a-button @click="openBatchAssign" :disabled="!selectedRowKeys.length">
        <TeamOutlined /> 批量分配（{{ selectedRowKeys.length }}）
      </a-button>
      <a-button @click="orgRouterPush">
        <ApartmentOutlined /> 组织管理
      </a-button>
      <a-button v-if="auth.user?.role === 'ADMIN'" @click="openQuotaDrawer">
        <ThunderboltOutlined /> 算力发放
      </a-button>
      <a-button type="primary" @click="openCreate">
        <PlusOutlined /> 新建账号
      </a-button>
      <a-button type="primary" ghost @click="openBatchImport">
        <UploadOutlined /> 批量导入
      </a-button>
    </template>

    <a-card :bordered="false">
      <a-table
        :columns="columns"
        :data-source="rows"
        :loading="loading"
        :pagination="false"
        row-key="id"
        :row-selection="{ selectedRowKeys, onChange: (keys) => (selectedRowKeys = keys), getCheckboxProps: (r) => ({ disabled: r.role === 'ADMIN' }) }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'nickname'">
            <div class="c-name">{{ record.nickname || record.phone }}</div>
            <div class="muted small">{{ record.phone }}</div>
          </template>
          <template v-else-if="column.key === 'role'">
            <a-tag :color="ROLE_META[record.role]?.color">
              {{ ROLE_META[record.role]?.label ?? record.role }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'modules'">
            <a-tag v-if="isAllModules(record)" color="green">全部模块</a-tag>
            <a-tooltip v-else :title="moduleNames(record)">
              <a-tag color="orange">{{ (record.moduleIds ?? []).length }} 个模块</a-tag>
            </a-tooltip>
          </template>
          <template v-else-if="column.key === 'org'">
            <template v-if="record.org">
              <div>{{ record.org.name }}</div>
              <div class="muted small">{{ ORG_LEVEL_LABEL[record.org.level] ?? `L${record.org.level}` }}</div>
            </template>
            <span v-else class="muted small">-</span>
          </template>
          <template v-else-if="column.key === 'kos'">
            <a-tag v-if="record.kosAccount" color="green">{{ record.kosAccount.nickname }}</a-tag>
            <span v-else class="muted small">-</span>
          </template>
          <template v-else-if="column.key === 'brands'">
            <template v-if="record.role === 'ADMIN'">
              <a-tag color="green">全部品牌</a-tag>
            </template>
            <template v-else-if="(record.brandIds ?? []).length">
              <a-tooltip :title="brandNames(record)">
                <a-tag>{{ (record.brandIds ?? []).length }} 个品牌</a-tag>
              </a-tooltip>
            </template>
            <span v-else class="muted small">未分配</span>
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
              :disabled="record.role === 'ADMIN'"
              @click="openPermission(record)"
            >
              分配权限
            </a-button>
            <a-button
              type="link"
              size="small"
              :disabled="record.role === 'ADMIN'"
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
      :title="editing ? `编辑账号 · ${editing.nickname || editing.phone}` : '新建账号'"
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
        <a-alert
          v-if="!editing"
          type="info"
          show-icon
          message="账号创建后，可在列表「分配权限」中随时调整可见模块与所属品牌"
          style="margin-bottom: 16px"
        />
        <a-button type="primary" block :loading="saving" @click="save">
          {{ editing ? '保存修改' : '创建账号' }}
        </a-button>
      </a-form>
    </a-drawer>

    <a-drawer
      v-model:open="permOpen"
      :title="`分配权限 · ${permRow?.nickname || permRow?.phone || ''}`"
      width="480"
    >
      <a-form layout="vertical">
        <a-form-item label="账号角色">
          <a-tag :color="ROLE_META[permRow?.role]?.color">
            {{ ROLE_META[permRow?.role]?.label }}
          </a-tag>
        </a-form-item>
        <a-form-item>
          <template #label>
            可见模块
            <span class="muted small">（不勾选 = 全部可见）</span>
          </template>
          <div class="module-tree">
            <a-tree
              v-model:checkedKeys="permCheckedKeys"
              :tree-data="moduleTreeData"
              checkable
              :selectable="false"
              default-expand-all
            />
          </div>
        </a-form-item>
        <a-form-item>
          <template #label>
            所属品牌（项目）
            <span class="muted small">（登录后仅可见所辖项目）</span>
          </template>
          <a-select
            v-model:value="permBrandIds"
            mode="multiple"
            :options="brandOptions"
            placeholder="选择可见品牌"
            :max-tag-count="6"
            @change="onPermBrandsChange"
          />
        </a-form-item>
        <a-form-item v-if="permBrandIds.length">
          <template #label>
            品牌角色
            <span class="muted small">（该用户在各品牌工作区内的身份）</span>
          </template>
          <div class="brand-role-list">
            <div v-for="bid in permBrandIds" :key="bid" class="brand-role-row">
              <a-tooltip
                :title="BRAND_ROLE_META[permRoleByBrand[bid] || 'agency_executive']?.desc"
              >
                <span class="brand-role-name">
                  {{ brandNameMap.get(bid) ?? `#${bid}` }}
                </span>
              </a-tooltip>
              <a-select
                :value="permRoleByBrand[bid] || 'agency_executive'"
                :options="brandRoleOptions"
                size="small"
                class="brand-role-select"
                @change="(v) => (permRoleByBrand[bid] = v)"
              />
            </div>
          </div>
        </a-form-item>
        <a-button type="primary" block :loading="permSaving" @click="savePermission">
          保存权限
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

    <!-- 批量导入 -->
    <a-drawer v-model:open="batchOpen" title="批量导入账号" width="640">
      <a-alert
        type="info"
        show-icon
        style="margin-bottom: 12px"
        message="Excel 列：手机号 / 昵称 / 初始密码（可留空自动生成）/ 品牌角色 / 组织（门店名）/ 绑定小红书昵称"
      />
      <a-form layout="vertical">
        <a-row :gutter="12">
          <a-col :span="12">
            <a-form-item label="所属品牌（工作区）" required>
              <a-select v-model:value="batchBrandId" :options="brandOptions" placeholder="选择品牌" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="默认品牌角色">
              <a-select v-model:value="batchRoleKey" :options="brandRoleOptions" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="12">
          <a-col :span="12">
            <a-form-item label="密码生成前缀">
              <a-input v-model:value="batchPasswordPrefix" placeholder="Mdd@" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item>
              <template #label>
                KOS 模块模板
                <span class="muted small">（任务列表/图文创作/历史记录）</span>
              </template>
              <a-checkbox v-model:checked="batchKosModules">仅授予内容生产模块</a-checkbox>
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="导入 Excel">
          <a-upload
            :before-upload="onBatchFile"
            :show-upload-list="false"
            accept=".xlsx,.xls"
          >
            <a-button><UploadOutlined /> 选择文件</a-button>
          </a-upload>
          <a-button type="link" size="small" @click="downloadBatchTemplate">
            下载导入模板
          </a-button>
        </a-form-item>
      </a-form>

      <template v-if="batchRows.length">
        <div class="batch-summary">
          共解析 <b>{{ batchRows.length }}</b> 行
          <span v-if="batchErrors.length" class="batch-err">{{ batchErrors.length }} 行异常</span>
        </div>
        <a-table
          :columns="batchColumns"
          :data-source="batchRows"
          size="small"
          :pagination="{ pageSize: 8 }"
          row-key="phone"
          :scroll="{ y: 260 }"
        />
        <a-button
          type="primary"
          block
          style="margin-top: 12px"
          :loading="batchSubmitting"
          :disabled="!batchBrandId"
          @click="submitBatch"
        >
          确认导入 {{ batchRows.length }} 个账号
        </a-button>
      </template>

      <template v-if="batchResult">
        <a-divider>导入结果</a-divider>
        <a-alert
          :type="batchResult.failed ? 'warning' : 'success'"
          show-icon
          :message="`新增 ${batchResult.added} · 更新 ${batchResult.updated} · 失败 ${batchResult.failed}`"
          style="margin-bottom: 12px"
        />
        <div v-for="e in batchResult.errors" :key="e.phone" class="batch-err">
          {{ e.phone }}：{{ e.reason }}
        </div>
        <a-button block style="margin-top: 8px" @click="downloadCredentials">
          <DownloadOutlined /> 导出初始密码清单
        </a-button>
      </template>
    </a-drawer>

    <!-- 批量分配 -->
    <a-modal
      v-model:open="assignOpen"
      title="批量分配品牌 / 角色 / 组织"
      ok-text="确认分配"
      cancel-text="取消"
      :confirm-loading="assignSubmitting"
      @ok="submitBatchAssign"
    >
      <p class="muted small">
        将对已选的 {{ selectedRowKeys.length }} 个账号执行（已存在手机号仅更新所选项）
      </p>
      <a-form layout="vertical">
        <a-form-item label="品牌（工作区）" required>
          <a-select v-model:value="assignBrandId" :options="brandOptions" placeholder="选择品牌" />
        </a-form-item>
        <a-form-item label="品牌角色">
          <a-select v-model:value="assignRoleKey" :options="brandRoleOptions" />
        </a-form-item>
        <a-form-item label="组织（门店名，可选）">
          <a-input v-model:value="assignOrgName" placeholder="如：北京SKP（不存在则自动创建，门店层级）" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 算力发放（仅超管） -->
    <a-drawer v-model:open="quotaOpen" title="算力发放（内容工厂 AI 配额）" width="480" destroy-on-close>
      <a-space direction="vertical" style="width: 100%" :size="14">
        <a-select
          v-model:value="quotaBrandId"
          :options="brandOptions"
          placeholder="选择工作区"
          style="width: 100%"
          @change="loadQuota"
        />
        <template v-if="quotaSummary">
          <div class="quota-stats">
            <div class="qs-item">
              <div class="qs-num">{{ quotaSummary.available.toLocaleString() }}</div>
              <div class="qs-label">可用算力</div>
            </div>
            <div class="qs-item">
              <div class="qs-num">{{ quotaSummary.used.toLocaleString() }}</div>
              <div class="qs-label">已用</div>
            </div>
            <div class="qs-item">
              <div class="qs-num">{{ quotaSummary.total.toLocaleString() }}</div>
              <div class="qs-label">总量</div>
            </div>
          </div>
          <a-input-number
            v-model:value="quotaAmount"
            style="width: 100%"
            :precision="0"
            placeholder="发放填正数 / 调减填负数，如 500 或 -200"
          />
          <a-input v-model:value="quotaRemark" :maxlength="50" placeholder="备注（可选，会记入操作日志）" />
          <a-button type="primary" block :loading="quotaSaving" :disabled="!quotaBrandId || !quotaAmount" @click="submitQuotaGrant">
            确认调整
          </a-button>
          <div v-if="quotaSummary.recent_logs?.length">
            <div class="muted small" style="margin-bottom: 6px">最近变动（{{ quotaSummary.recent_logs.length }} 条）</div>
            <a-table
              size="small"
              :data-source="quotaSummary.recent_logs"
              :pagination="false"
              row-key="id"
              :columns="quotaLogColumns"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'delta'">
                  <span :style="{ color: record.delta > 0 ? '#389e0d' : '#cf1322', fontWeight: 600 }">
                    {{ record.delta > 0 ? `+${record.delta}` : record.delta }}
                  </span>
                </template>
                <template v-else-if="column.key === 'kind'">
                  {{ QUOTA_KIND_LABEL[record.kind] ?? record.kind }}
                </template>
                <template v-else-if="column.key === 'created_at'">
                  {{ dayjs(record.created_at).format('MM-DD HH:mm') }}
                </template>
              </template>
            </a-table>
          </div>
        </template>
        <a-skeleton v-else active />
      </a-space>
    </a-drawer>
  </PageWrapper>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { message } from 'ant-design-vue';
import {
  ApartmentOutlined,
  DownloadOutlined,
  PlusOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  UploadOutlined,
} from '@ant-design/icons-vue';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';
import { useRouter } from 'vue-router';
import PageWrapper from '../../components/PageWrapper.vue';
import {
  batchCreateUsers,
  createUser,
  getUsers,
  resetUserPassword,
  updateUser,
} from '../../api/user';
import { parseUserWorkbook } from '../../utils/xlsx-import';
import { useAuthStore } from '../../stores/auth';
import { getQuota, grantQuota } from '../../api/contentpro';

const router = useRouter();
const auth = useAuthStore();
const rows = ref([]);
const loading = ref(false);

const ROLE_META = {
  ADMIN: { label: '超级管理员', color: 'purple' },
  MANAGER: { label: '项目管理员', color: 'geekblue' },
  SALES: { label: '普通用户', color: 'blue' },
};

const BRAND_ROLE_META = {
  brand_admin: {
    label: '工作区管理员',
    color: 'purple',
    desc: 'L2 工作区管理员：可管理本工作区全部成员、组织与权限',
  },
  org_manager: {
    label: '组织管理员',
    color: 'geekblue',
    desc: 'L3 经销商/门店管理员：管理所属组织下的 KOS 成员',
  },
  kos_operator: {
    label: 'KOS 员工',
    color: 'cyan',
    desc: 'L4 KOS 员工：登录内容生产模块（PC / 手机H5）领任务、做内容',
  },
  agency_manager: {
    label: '运营主管',
    color: 'purple',
    desc: '品牌工作区负责人，可管理协作成员、审核规则与内容流转',
  },
  agency_executive: {
    label: '运营执行',
    color: 'blue',
    desc: '负责内容生产、内容包管理、运营审核与内容领用',
  },
  brand_owner: {
    label: '品牌方',
    color: 'green',
    desc: '品牌侧审核人，负责联合审核通过/驳回与结果查看',
  },
  content_supplier: {
    label: '内容供应商',
    color: 'orange',
    desc: '外部内容供给方，仅可向被授权内容包上传内容',
  },
  media_partner: {
    label: '媒介服务商',
    color: 'cyan',
    desc: '分发执行方，可领用内容并回填发布链接或截图',
  },
};

const brandRoleOptions = Object.entries(BRAND_ROLE_META).map(([value, m]) => ({
  label: m.label,
  value,
}));

const drawerOpen = ref(false);
const editing = ref(null);
const saving = ref(false);
const form = reactive({
  phone: '',
  password: '',
  nickname: '',
  role: 'SALES',
});

const permOpen = ref(false);
const permRow = ref(null);
const permSaving = ref(false);
const permCheckedKeys = ref([]);
const permBrandIds = ref([]);
const permRoleByBrand = reactive({});

const resetOpen = ref(false);
const resetting = ref(null);
const resettingBusy = ref(false);
const resetPassword = ref('');

const isSuperAdmin = computed(() => auth.user?.role === 'ADMIN');

const roleOptions = computed(() => {
  const base = [
    { label: '项目管理员（可分配成员权限）', value: 'MANAGER' },
    { label: '普通用户（按模块分配）', value: 'SALES' },
  ];
  return isSuperAdmin.value
    ? [{ label: '超级管理员（全部权限）', value: 'ADMIN' }, ...base]
    : base;
});

const columns = [
  { title: '用户', key: 'nickname', width: 180 },
  { title: '角色', key: 'role', width: 100 },
  { title: '组织', key: 'org', width: 130 },
  { title: '绑定矩阵号', key: 'kos', width: 180 },
  { title: '模块权限', key: 'modules', width: 100 },
  { title: '所属品牌', key: 'brands', width: 110 },
  { title: '创建时间', key: 'created', width: 140 },
  { title: '操作', key: 'actions', width: 210 },
];

const ORG_LEVEL_LABEL = { 1: '大区', 2: '经销商/总部', 3: '门店' };

// ── 多选批量分配 ──────────────────────────────────────────────
const selectedRowKeys = ref([]);
const assignOpen = ref(false);
const assignSubmitting = ref(false);
const assignBrandId = ref(null);
const assignRoleKey = ref('kos_operator');
const assignOrgName = ref('');

function openBatchAssign() {
  if (!selectedRowKeys.value.length) return;
  assignOpen.value = true;
}

async function submitBatchAssign() {
  if (!assignBrandId.value) {
    message.warning('请选择品牌');
    return;
  }
  assignSubmitting.value = true;
  try {
    const selected = rows.value.filter((r) => selectedRowKeys.value.includes(r.id));
    const rowsPayload = selected.map((r) => ({
      phone: r.phone,
      brandRoles: [{ brandId: assignBrandId.value, roleKey: assignRoleKey.value }],
      ...(assignOrgName.value.trim() ? { orgName: assignOrgName.value.trim() } : {}),
    }));
    const res = await batchCreateUsers({ rows: rowsPayload });
    const d = res ?? { added: 0, updated: 0, failed: 0 };
    message.success(`分配完成：新增 ${d.added} · 更新 ${d.updated} · 失败 ${d.failed}`);
    if (d.failed) {
      message.error((d.errors ?? []).map((e) => `${e.phone}：${e.reason}`).join('；'));
    }
    assignOpen.value = false;
    selectedRowKeys.value = [];
    load();
  } catch (e) {
    message.error(e.message || '批量分配失败');
  } finally {
    assignSubmitting.value = false;
  }
}

// ── 批量导入 ──────────────────────────────────────────────────
const batchOpen = ref(false);
const batchBrandId = ref(null);
const batchRoleKey = ref('kos_operator');
const batchPasswordPrefix = ref('Mdd@');
const batchKosModules = ref(true);
const batchRows = ref([]);
const batchErrors = ref([]);
const batchSubmitting = ref(false);
const batchResult = ref(null);

const batchColumns = [
  { title: '手机号', dataIndex: 'phone', width: 110 },
  { title: '昵称', dataIndex: 'nickname', width: 100 },
  { title: '组织', dataIndex: 'orgName', width: 110 },
  { title: '角色', dataIndex: 'roleKey', width: 100 },
  { title: '绑定矩阵号', dataIndex: 'kosNickname', ellipsis: true },
];

function openBatchImport() {
  batchResult.value = null;
  batchRows.value = [];
  batchErrors.value = [];
  if (!batchBrandId.value && brandOptions.value.length) {
    batchBrandId.value = auth.currentBrandId ?? brandOptions.value[0]?.value ?? null;
  }
  batchOpen.value = true;
}

function orgRouterPush() {
  router.push('/system/orgs');
}

/** KOS 内容生产模块模板：按 path 从菜单树解析稳定 id */
function kosModuleIds() {
  const want = new Set([
    '/kox_task/content-task/task-list',
    '/content-pro/content-factory/xhs-image-text-single',
    '/content-pro/history',
  ]);
  const ids = [];
  const walk = (nodes) => {
    for (const n of nodes ?? []) {
      if (n.children) walk(n.children);
      else if (n.path && want.has(n.path) && n.id != null) ids.push(n.id);
    }
  };
  walk(auth.moduleTree);
  return ids;
}

function onBatchFile(file) {
  batchResult.value = null;
  parseUserWorkbook(file).then(({ users, errors }) => {
    batchRows.value = users.map((u) => ({ ...u, roleKey: u.roleKey || batchRoleKey.value }));
    batchErrors.value = errors;
    if (errors.length) message.warning(`${errors.length} 行异常，请检查后重新上传`);
    if (!users.length) message.warning('未解析到有效数据行');
  });
  return false; // 阻止自动上传
}

function downloadBatchTemplate() {
  const tpl = [
    { 手机号: '', 昵称: '', 初始密码: '', 品牌角色: 'KOS员工', 组织: '', 绑定小红书昵称: '' },
  ];
  const ws = XLSX.utils.json_to_sheet(tpl, { cols: [{ wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 26 }] });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '账号导入');
  XLSX.writeFile(wb, '批量开通账号导入模板.xlsx');
}

async function submitBatch() {
  if (!batchBrandId.value) {
    message.warning('请选择所属品牌');
    return;
  }
  batchSubmitting.value = true;
  try {
    const moduleIds = batchKosModules.value ? kosModuleIds() : undefined;
    const payloadRows = batchRows.value.map((u) => ({
      phone: u.phone,
      nickname: u.nickname || undefined,
      password: u.password,
      brandRoles: [{ brandId: batchBrandId.value, roleKey: u.roleKey || batchRoleKey.value }],
      ...(u.orgName ? { orgName: u.orgName } : {}),
      ...(u.kosNickname ? { kosNickname: u.kosNickname } : {}),
      ...(moduleIds && moduleIds.length ? { moduleIds } : {}),
    }));
    const res = await batchCreateUsers({
      rows: payloadRows,
      passwordPrefix: batchPasswordPrefix.value || 'Mdd@',
    });
    batchResult.value = res;
    message.success(`导入完成：新增 ${res.added} · 更新 ${res.updated} · 失败 ${res.failed}`);
    load();
  } catch (e) {
    message.error(e.message || '批量导入失败');
  } finally {
    batchSubmitting.value = false;
  }
}

function downloadCredentials() {
  const list = (batchResult.value?.credentials ?? []).filter((c) => c.password);
  if (!list.length) {
    message.warning('没有新生成的密码可导出');
    return;
  }
  const ws = XLSX.utils.json_to_sheet(
    list.map((c) => ({
      手机号: c.phone,
      初始密码: c.password,
      昵称: c.nickname,
      组织: c.orgName ?? '',
      绑定小红书昵称: c.kosNickname ?? '',
    })),
  );
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '初始密码清单');
  XLSX.writeFile(wb, `账号初始密码清单_${dayjs().format('YYYYMMDD_HHmm')}.xlsx`);
}

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

const brandNameMap = computed(() => {
  const map = new Map();
  for (const b of auth.brands ?? []) map.set(b.id, b.name);
  return map;
});

const brandOptions = computed(() =>
  (auth.brands ?? []).map((b) => ({ label: b.name, value: b.id })),
);

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

const brandNames = (record) => {
  const roles =
    record.brandRoles ??
    (record.brandIds ?? []).map((brandId) => ({ brandId }));
  return (
    roles
      .map((r) => {
        const name = brandNameMap.value.get(r.brandId) ?? `#${r.brandId}`;
        const role = BRAND_ROLE_META[r.roleKey];
        return role ? `${name} · ${role.label}` : name;
      })
      .join('、') || '（无）'
  );
};

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
  drawerOpen.value = true;
}

function openEdit(record) {
  editing.value = record;
  form.phone = record.phone;
  form.password = '';
  form.nickname = record.nickname || '';
  form.role = record.role;
  drawerOpen.value = true;
}

function openPermission(record) {
  permRow.value = record;
  permCheckedKeys.value = (record.moduleIds ?? []).map(String);
  permBrandIds.value = [...(record.brandIds ?? [])];
  for (const k of Object.keys(permRoleByBrand)) delete permRoleByBrand[k];
  for (const r of record.brandRoles ?? []) {
    permRoleByBrand[r.brandId] = r.roleKey;
  }
  onPermBrandsChange(permBrandIds.value);
  permOpen.value = true;
}

function onPermBrandsChange(vals) {
  const keep = new Set(vals);
  for (const k of Object.keys(permRoleByBrand)) {
    if (!keep.has(Number(k))) delete permRoleByBrand[k];
  }
  for (const v of vals) {
    if (!permRoleByBrand[v]) permRoleByBrand[v] = 'agency_executive';
  }
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
    if (editing.value) {
      await updateUser(editing.value.id, {
        nickname: form.nickname || undefined,
        role: form.role,
      });
      message.success('已保存');
    } else {
      await createUser({
        phone: form.phone,
        password: form.password,
        nickname: form.nickname || undefined,
        role: form.role,
      });
      message.success('账号已创建，可继续分配权限');
    }
    drawerOpen.value = false;
    load();
  } catch (e) {
    message.error(e.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

async function savePermission() {
  permSaving.value = true;
  try {
    const moduleIds = permCheckedKeys.value
      .filter((k) => !String(k).startsWith('g_'))
      .map(Number);
    await updateUser(permRow.value.id, {
      moduleIds,
      brandRoles: permBrandIds.value.map((id) => ({
        brandId: id,
        roleKey: permRoleByBrand[id] || 'agency_executive',
      })),
    });
    message.success('权限已更新');
    permOpen.value = false;
    load();
  } catch (e) {
    message.error(e.message || '保存失败');
  } finally {
    permSaving.value = false;
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

// ── 算力发放（仅超管） ────────────────────────────────────────
const QUOTA_KIND_LABEL = { consume: '生成', refund: '退回', grant: '调整' };
const quotaLogColumns = [
  { title: '变动', key: 'delta', width: 70 },
  { title: '类型', key: 'kind', width: 70 },
  { title: '备注', dataIndex: 'remark', ellipsis: true },
  { title: '时间', key: 'created_at', width: 100 },
];
const quotaOpen = ref(false);
const quotaBrandId = ref(null);
const quotaSummary = ref(null);
const quotaAmount = ref(null);
const quotaRemark = ref('');
const quotaSaving = ref(false);

const openQuotaDrawer = () => {
  quotaOpen.value = true;
  if (!quotaBrandId.value && brandOptions.value.length) {
    quotaBrandId.value = auth.currentBrandId ?? brandOptions.value[0]?.value ?? null;
  }
  loadQuota();
};

const loadQuota = async () => {
  if (!quotaBrandId.value) return;
  quotaSummary.value = null;
  quotaSummary.value = await getQuota({ brandId: quotaBrandId.value }).catch(() => null);
};

const submitQuotaGrant = async () => {
  const amount = Number(quotaAmount.value);
  if (!amount) {
    message.warning('请输入非 0 的调整额度（发放正数 / 调减负数）');
    return;
  }
  quotaSaving.value = true;
  try {
    await grantQuota({ amount, remark: quotaRemark.value || undefined }, { brandId: quotaBrandId.value });
    message.success(`已${amount > 0 ? '发放' : '调减'} ${Math.abs(amount)} 算力`);
    quotaAmount.value = null;
    quotaRemark.value = '';
    await loadQuota();
  } catch (e) {
    message.error(e.message || '操作失败');
  } finally {
    quotaSaving.value = false;
  }
};

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

.brand-role-list {
  border: 1px solid var(--color-border-secondary);
  border-radius: 6px;
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.brand-role-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.brand-role-name {
  font-size: 13px;
  color: var(--color-text-primary, #1e293b);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.brand-role-select {
  width: 140px;
  flex-shrink: 0;
}

.quota-stats {
  display: flex;
  gap: 10px;
}

.qs-item {
  flex: 1;
  background: #f8fafc;
  border: 1px solid #eef2f7;
  border-radius: 8px;
  padding: 12px 8px;
  text-align: center;
}

.qs-num {
  font-size: 20px;
  font-weight: 700;
  color: #1e293b;
}

.qs-label {
  font-size: 12px;
  color: #94a3b8;
  margin-top: 2px;
}
</style>
