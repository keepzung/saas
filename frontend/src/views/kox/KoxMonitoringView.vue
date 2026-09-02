<template>
  <PageWrapper title="监测列表" subtitle="KOS/KOB/KOC 账号监测管理">
    <template #filters>
      <FilterTopbar>
        <a-select
          v-model:value="platform"
          style="width: 110px"
          allow-clear
          placeholder="平台"
          :options="[
            { value: 'douyin', label: '抖音' },
            { value: 'xhs', label: '小红书' },
          ]"
          @change="() => reload(true)"
        />
        <a-select
          v-model:value="accountType"
          style="width: 110px"
          allow-clear
          placeholder="账号类型"
          :options="[
            { value: 'KOS', label: 'KOS' },
            { value: 'KOB', label: 'KOB' },
            { value: 'KOC', label: 'KOC' },
          ]"
          @change="() => reload(true)"
        />
        <a-input-search
          v-model:value="keyword"
          placeholder="账号 / UID / 代理商 / 运营人"
          style="width: 240px"
          allow-clear
          @search="() => reload(true)"
        />
        <template #actions>
          <a-button @click="importOpen = true">
            <FileExcelOutlined /> Excel 导入
          </a-button>
          <a-button type="primary" @click="addOpen = true">
            <PlusOutlined /> 添加监测账号
          </a-button>
        </template>
      </FilterTopbar>
    </template>

    <a-card :bordered="false">
      <a-table
        :columns="columns"
        :data-source="list"
        :loading="loading"
        :pagination="{
          total,
          current: page,
          pageSize: PAGE_SIZE,
          showSizeChanger: false,
          size: 'small',
        }"
        row-key="id"
        @change="onTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'account'">
            <div class="acc-cell">
              <a-avatar :size="32">{{ record.nickname.slice(0, 1) }}</a-avatar>
              <div>
                <div class="acc-name">
                  {{ record.nickname }}
                  <a-tag :color="typeColor[record.account_type]" class="mini">
                    {{ record.account_type }}
                  </a-tag>
                </div>
                <div class="muted mini">
                  <a
                    v-if="record.author_url"
                    :href="record.author_url"
                    target="_blank"
                    rel="noopener"
                  >跳转主页</a>
                  <template v-if="record.author_url">
                    <a-divider type="vertical" />
                    <a @click="copyUrl(record)">复制链接</a>
                  </template>
                </div>
              </div>
            </div>
          </template>
          <template v-else-if="column.key === 'author_id'">
            <a-tooltip v-if="record.author_id" :title="record.author_id">
              <span class="mono">{{ record.author_id }}</span>
            </a-tooltip>
            <span v-else>-</span>
          </template>
          <template v-else-if="column.key === 'platform'">
            <a-tag :color="record.platform === 'douyin' ? 'blue' : 'red'">
              {{ record.platform === 'douyin' ? '抖音' : '小红书' }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'fans'">
            {{ record.fans.toLocaleString() }}
          </template>
          <template v-else-if="column.key === 'operation'">
            <a-switch
              :checked="record.status === 'enabled'"
              checked-children="启用"
              un-checked-children="停用"
              size="small"
              @change="(v) => toggleStatus(record, v)"
            />
          </template>
          <template v-else-if="column.key === 'action'">
            <a @click="openManage(record)">管理</a>
            <a-divider type="vertical" />
            <a-popconfirm title="确认移除该监测账号？" @confirm="removeAcc(record)">
              <a class="danger">移除</a>
            </a-popconfirm>
          </template>
        </template>
      </a-table>
    </a-card>

    <a-modal
      v-model:open="addOpen"
      title="添加监测账号"
      :confirm-loading="saving"
      @ok="saveAdd"
    >
      <a-form layout="vertical" style="margin-top: 12px">
        <a-form-item label="账号昵称" required>
          <a-input v-model:value="addForm.nickname" placeholder="平台账号昵称" />
        </a-form-item>
        <a-form-item label="平台">
          <a-radio-group v-model:value="addForm.platform">
            <a-radio value="douyin">抖音</a-radio>
            <a-radio value="xhs">小红书</a-radio>
          </a-radio-group>
        </a-form-item>
        <a-form-item label="账号类型">
          <a-radio-group v-model:value="addForm.accountType">
            <a-radio value="KOS">KOS（导购）</a-radio>
            <a-radio value="KOB">KOB（门店官号）</a-radio>
            <a-radio value="KOC">KOC（达人）</a-radio>
          </a-radio-group>
        </a-form-item>
        <a-form-item label="粉丝数">
          <a-input-number v-model:value="addForm.fans" :min="0" style="width: 100%" />
        </a-form-item>
        <a-form-item label="所属地域">
          <a-input v-model:value="addForm.areaName" placeholder="如：华南·广东·广州" />
        </a-form-item>
        <a-form-item label="代理商名称">
          <a-input v-model:value="addForm.storeName" />
        </a-form-item>
        <a-form-item label="主页链接">
          <a-input v-model:value="addForm.authorUrl" placeholder="https://..." />
        </a-form-item>
      </a-form>
    </a-modal>

    <a-modal
      v-model:open="manageOpen"
      title="监测账号管理"
      width="700px"
      :confirm-loading="managing"
      @ok="saveManage"
    >
      <a-descriptions size="small" :column="2" class="mg-sec" bordered>
        <a-descriptions-item label="账号">{{ manageRow?.nickname }}</a-descriptions-item>
        <a-descriptions-item label="粉丝数">{{ manageRow?.fans?.toLocaleString() }}</a-descriptions-item>
        <a-descriptions-item label="大区">{{ manageRow?.area_name || '-' }}</a-descriptions-item>
        <a-descriptions-item label="主页">
          <a :href="manageRow?.author_url" target="_blank" class="mini">打开主页</a>
        </a-descriptions-item>
      </a-descriptions>
      <a-form layout="vertical" class="mg-sec">
        <a-row :gutter="12">
          <a-col :span="12">
            <a-form-item label="账号类型" required>
              <a-select
                v-model:value="manageForm.account_type"
                :options="[
                  { value: 'KOS', label: 'KOS' },
                  { value: 'KOB', label: 'KOB' },
                  { value: 'KOC', label: 'KOC' },
                ]"
              />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="账号标签">
              <a-input v-model:value="manageForm.account_tag" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="代理商名称" required>
              <a-input v-model:value="manageForm.store_name" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="实操人员姓名" required>
              <a-input v-model:value="manageForm.operator_name" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="实操人手机号" required>
              <a-input v-model:value="manageForm.operator_mobile" />
            </a-form-item>
          </a-col>
        </a-row>
      </a-form>
    </a-modal>

    <a-modal
      v-model:open="importOpen"
      title="Excel 批量导入账号"
      width="720px"
      :confirm-loading="importing"
      ok-text="确认导入"
      cancel-text="取消"
      @ok="doImport"
    >
      <a-upload-dragger
        :file-list="importFileList"
        :before-upload="onImportFile"
        :max-count="1"
        accept=".xlsx,.xls"
        @remove="clearImportFile"
      >
        <p class="ant-upload-drag-icon"><FileExcelOutlined /></p>
        <p class="ant-upload-text">点击或拖入 Excel 文件</p>
        <p class="ant-upload-hint">
          表头需含：账号UID / 账号类型 / 大区（可选）/ 省份 / 城市 / 门店名称 / 主页地址
        </p>
      </a-upload-dragger>

      <template v-if="importRows.length">
        <a-alert
          type="success"
          show-icon
          :message="`已解析 ${importRows.length} 条账号（展示前 10 条）`"
          style="margin-top: 12px"
        />
        <a-table
          size="small"
          :columns="importPreviewColumns"
          :data-source="importRows.slice(0, 10)"
          :pagination="false"
          row-key="authorId"
          style="margin-top: 8px"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'area'">
              {{ [record.region, record.province, record.city].filter(Boolean).join('·') || '-' }}
            </template>
          </template>
        </a-table>
      </template>
      <a-alert
        v-if="importErrors.length"
        type="warning"
        show-icon
        :message="importErrors.join('；')"
        style="margin-top: 12px"
      />
    </a-modal>
  </PageWrapper>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { message } from 'ant-design-vue';
import { FileExcelOutlined, PlusOutlined } from '@ant-design/icons-vue';
import dayjs from 'dayjs';
import PageWrapper from '../../components/PageWrapper.vue';
import FilterTopbar from '../../components/FilterTopbar.vue';
import {
  createKoxAccount,
  deleteKoxAccount,
  getKoxAccounts,
  importKoxAccounts,
  updateKoxAccount,
} from '../../api/kox';
import { parseAccountWorkbook } from '../../utils/xlsx-import';

const importOpen = ref(false);
const importing = ref(false);
const importFileList = ref([]);
const importRows = ref([]);
const importErrors = ref([]);
const importPreviewColumns = [
  { title: 'UID', dataIndex: 'authorId', width: 210, ellipsis: true },
  { title: '类型', dataIndex: 'accountType', width: 70 },
  { title: '地区', key: 'area', width: 130 },
  { title: '门店', dataIndex: 'storeName', ellipsis: true },
];

function clearImportFile() {
  importFileList.value = [];
  importRows.value = [];
  importErrors.value = [];
}

async function onImportFile(file) {
  try {
    const { accounts, errors } = await parseAccountWorkbook(file);
    importRows.value = accounts;
    importErrors.value = errors;
    importFileList.value = [{ uid: '-1', name: file.name, status: 'done' }];
    if (!accounts.length) message.warning('未解析到有效账号行');
  } catch (e) {
    message.error(e.message || '文件解析失败');
    importFileList.value = [];
  }
  return false;
}

async function doImport() {
  if (!importRows.value.length) {
    message.warning('请先选择文件');
    return;
  }
  importing.value = true;
  try {
    const res = await importKoxAccounts(importRows.value);
    message.success(
      `导入完成：新增 ${res.added}，更新 ${res.updated}` +
        (res.errors.length ? `，失败 ${res.errors.length} 行` : ''),
    );
    importOpen.value = false;
    clearImportFile();
    reload(true);
  } catch (e) {
    message.error(e.message || '导入失败');
  } finally {
    importing.value = false;
  }
}

const typeColor = { KOS: 'blue', KOB: 'purple', KOC: 'cyan' };

const SORT_MAP = { fans: 'fans', add_time: 'createdAt' };

const columns = [
  { key: 'account', title: '账号' },
  { key: 'author_id', title: 'UID', dataIndex: 'author_id', width: 160, ellipsis: true },
  { key: 'platform', title: '平台', width: 90 },
  { key: 'account_type', title: '账号类型', dataIndex: 'account_type', width: 100 },
  { key: 'fans', title: '粉丝数', dataIndex: 'fans', width: 110, sorter: true },
  { key: 'area_name', title: '地域', dataIndex: 'area_name', width: 130, ellipsis: true },
  { key: 'store_name', title: '代理商/门店', dataIndex: 'store_name', ellipsis: true },
  { key: 'account_tag', title: '账号标签', dataIndex: 'account_tag', width: 110 },
  { key: 'operator_name', title: '运营人', dataIndex: 'operator_name', width: 90 },
  { key: 'operator_mobile', title: '运营人手机号', dataIndex: 'operator_mobile', width: 130 },
  { key: 'add_time', title: '添加时间', dataIndex: 'add_time', width: 120, sorter: true },
  { key: 'operation', title: '运营', width: 90 },
  { key: 'action', title: '操作', width: 130 },
];

const list = ref([]);
const total = ref(0);
const loading = ref(false);
const platform = ref(undefined);
const accountType = ref(undefined);
const keyword = ref('');
const page = ref(1);
const PAGE_SIZE = 20;
const sortField = ref(undefined);
const sortOrder = ref(undefined);

const addOpen = ref(false);
const saving = ref(false);
const addForm = reactive({
  nickname: '',
  platform: 'douyin',
  accountType: 'KOS',
  fans: 0,
  areaName: undefined,
  storeName: '',
  authorUrl: '',
});

const manageOpen = ref(false);
const managing = ref(false);
const manageRow = ref(null);
const manageForm = reactive({
  account_type: 'KOS',
  store_name: '',
  operator_name: '',
  operator_mobile: '',
  account_tag: '',
});

async function reload(resetPage = false) {
  if (resetPage) page.value = 1;
  loading.value = true;
  try {
    const res = await getKoxAccounts({
      platform: platform.value || undefined,
      accountType: accountType.value || undefined,
      keyword: keyword.value || undefined,
      page: page.value,
      page_size: PAGE_SIZE,
      sort: sortField.value,
      order: sortOrder.value,
    });
    list.value = res.list.map((r) => ({
      ...r,
      add_time: dayjs(r.add_time).format('YYYY-MM-DD'),
    }));
    total.value = res.total;
  } catch (e) {
    message.error(e.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

function onTableChange(pag, _filters, sorter) {
  page.value = pag.current ?? 1;
  sortField.value = sorter?.field && SORT_MAP[sorter.field] ? SORT_MAP[sorter.field] : undefined;
  sortOrder.value =
    sorter?.order === 'descend' ? 'desc' : sorter?.order === 'ascend' ? 'asc' : undefined;
  reload();
}

function copyUrl(record) {
  navigator.clipboard
    ?.writeText(record.author_url ?? '')
    .then(() => message.success('链接已复制'))
    .catch(() => message.error('复制失败'));
}

async function saveAdd() {
  if (!addForm.nickname.trim()) {
    message.warning('请输入账号昵称');
    return;
  }
  saving.value = true;
  try {
    await createKoxAccount({ ...addForm });
    message.success('已添加监测');
    addOpen.value = false;
    Object.assign(addForm, {
      nickname: '',
      platform: 'douyin',
      accountType: 'KOS',
      fans: 0,
      areaName: undefined,
      storeName: '',
      authorUrl: '',
    });
    reload(true);
  } catch (e) {
    message.error(e.message || '添加失败');
  } finally {
    saving.value = false;
  }
}

function openManage(record) {
  manageRow.value = record;
  Object.assign(manageForm, {
    account_type: record.account_type,
    store_name: record.store_name ?? '',
    operator_name: record.operator_name ?? '',
    operator_mobile: record.operator_mobile ?? '',
    account_tag: record.account_tag ?? '',
  });
  manageOpen.value = true;
}

async function saveManage() {
  managing.value = true;
  try {
    await updateKoxAccount(manageRow.value.id, { ...manageForm });
    message.success('修改成功');
    manageOpen.value = false;
    reload();
  } catch (e) {
    message.error(e.message || '修改失败');
  } finally {
    managing.value = false;
  }
}

async function toggleStatus(record, checked) {
  try {
    await updateKoxAccount(record.id, {
      status: checked ? 'enabled' : 'disabled',
    });
    record.status = checked ? 'enabled' : 'disabled';
    message.success(checked ? '已启用' : '已停用');
  } catch (e) {
    message.error(e.message || '操作失败');
  }
}

async function removeAcc(record) {
  try {
    await deleteKoxAccount(record.id);
    message.success('已移除');
    reload();
  } catch (e) {
    message.error(e.message || '移除失败');
  }
}

onMounted(reload);
</script>

<style scoped>
.acc-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.acc-name {
  font-weight: 500;
}

.mini {
  font-size: 12px;
}

.mono {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
}

.muted {
  color: var(--color-text-secondary);
}

.mg-sec {
  margin-top: 12px;
}

.danger {
  color: var(--color-error);
}
</style>
