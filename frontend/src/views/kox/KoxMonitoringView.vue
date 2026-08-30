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
          @change="reload"
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
          @change="reload"
        />
        <a-input-search
          v-model:value="keyword"
          placeholder="账号 / 代理商 / 运营人"
          style="width: 220px"
          allow-clear
          @search="reload"
        />
        <template #actions>
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
        :pagination="{ total, pageSize: 20, showSizeChanger: false, size: 'small' }"
        row-key="id"
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
                <a class="muted mini" @click="copyUrl(record)">复制主页链接</a>
              </div>
            </div>
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
        <a-form-item label="所属大区">
          <a-select
            v-model:value="addForm.areaName"
            :options="areaOptions"
            placeholder="选择大区"
            allow-clear
          />
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
  </PageWrapper>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { message } from 'ant-design-vue';
import { PlusOutlined } from '@ant-design/icons-vue';
import dayjs from 'dayjs';
import PageWrapper from '../../components/PageWrapper.vue';
import FilterTopbar from '../../components/FilterTopbar.vue';
import {
  createKoxAccount,
  deleteKoxAccount,
  getKoxAccounts,
  updateKoxAccount,
} from '../../api/kox';

const typeColor = { KOS: 'blue', KOB: 'purple', KOC: 'cyan' };

const columns = [
  { key: 'account', title: '账号' },
  { key: 'platform', title: '平台', width: 90 },
  { key: 'account_type', title: '账号类型', dataIndex: 'account_type', width: 100 },
  { key: 'fans', title: '粉丝数', width: 110 },
  { key: 'area_name', title: '大区', dataIndex: 'area_name', width: 100 },
  { key: 'store_name', title: '代理商', dataIndex: 'store_name' },
  { key: 'account_tag', title: '账号标签', dataIndex: 'account_tag', width: 110 },
  { key: 'operator_name', title: '运营人', dataIndex: 'operator_name', width: 90 },
  { key: 'operator_mobile', title: '运营人手机号', dataIndex: 'operator_mobile', width: 130 },
  { key: 'add_time', title: '添加时间', width: 110 },
  { key: 'operation', title: '运营', width: 90 },
  { key: 'action', title: '操作', width: 130 },
];

const list = ref([]);
const total = ref(0);
const loading = ref(false);
const platform = ref(undefined);
const accountType = ref(undefined);
const keyword = ref('');

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

const areaOptions = computed(() => {
  const set = new Set(list.value.map((a) => a.area_name).filter(Boolean));
  return [...set].map((v) => ({ value: v, label: v }));
});

async function reload() {
  loading.value = true;
  try {
    const res = await getKoxAccounts({
      platform: platform.value || undefined,
      accountType: accountType.value || undefined,
      keyword: keyword.value || undefined,
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
    reload();
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
