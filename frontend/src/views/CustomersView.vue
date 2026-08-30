<template>
  <PageWrapper title="客户列表" subtitle="客户信息与跟进状态管理">
    <template #filters>
      <FilterTopbar>
        <a-input-search
          v-model:value="keyword"
          placeholder="名称 / 手机号 / 公司"
          style="width: 240px"
          allow-clear
          @search="reload"
        />
        <a-select
          v-model:value="level"
          style="width: 100px"
          allow-clear
          placeholder="等级"
          :options="levelOptions"
          @change="reload"
        />
        <a-select
          v-model:value="followStatus"
          style="width: 120px"
          allow-clear
          placeholder="跟进状态"
          :options="statusOptions"
          @change="reload"
        />
        <template #actions>
          <a-button type="primary" @click="openCreate">
            <PlusOutlined /> 新建客户
          </a-button>
        </template>
      </FilterTopbar>
    </template>

    <a-card :bordered="false">
      <a-table
        :columns="columns"
        :data-source="list"
        :loading="loading"
        :pagination="pager"
        row-key="id"
        @change="onTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <a @click="openEdit(record)">{{ record.name }}</a>
          </template>
          <template v-else-if="column.key === 'level'">
            <a-tag :color="record.level === 'VIP' ? 'gold' : 'default'">
              {{ record.level }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'follow_status'">
            <a-select
              :value="record.follow_status"
              size="small"
              style="width: 110px"
              :options="statusOptions"
              @change="(v) => changeStatus(record, v)"
            />
          </template>
          <template v-else-if="column.key === 'total_amount'">
            ¥{{ record.total_amount.toLocaleString() }}
          </template>
          <template v-else-if="column.key === 'action'">
            <a @click="openEdit(record)">编辑</a>
            <a-divider type="vertical" />
            <a-popconfirm
              :title="record.order_count ? '该客户存在订单，无法删除' : '确认删除该客户？'"
              :ok-button-props="{ disabled: !!record.order_count }"
              @confirm="removeCust(record)"
            >
              <a class="danger">删除</a>
            </a-popconfirm>
          </template>
        </template>
      </a-table>
    </a-card>

    <a-modal
      v-model:open="formOpen"
      :title="editing ? '编辑客户' : '新建客户'"
      :confirm-loading="saving"
      @ok="save"
    >
      <a-form layout="vertical" style="margin-top: 12px">
        <a-form-item label="客户名称" required>
          <a-input v-model:value="form.name" />
        </a-form-item>
        <a-form-item label="联系电话" required>
          <a-input v-model:value="form.phone" />
        </a-form-item>
        <a-form-item label="所属公司">
          <a-input v-model:value="form.company" />
        </a-form-item>
        <a-form-item label="客户等级">
          <a-radio-group v-model:value="form.level">
            <a-radio value="NORMAL">普通</a-radio>
            <a-radio value="VIP">VIP</a-radio>
          </a-radio-group>
        </a-form-item>
        <a-form-item label="跟进状态">
          <a-radio-group v-model:value="form.followStatus">
            <a-radio value="UNCONTACTED">未联系</a-radio>
            <a-radio value="FOLLOWING">跟进中</a-radio>
            <a-radio value="CONVERTED">已成交</a-radio>
            <a-radio value="LOST">已流失</a-radio>
          </a-radio-group>
        </a-form-item>
        <a-form-item label="备注">
          <a-textarea v-model:value="form.remark" :rows="3" />
        </a-form-item>
      </a-form>
    </a-modal>
  </PageWrapper>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { message } from 'ant-design-vue';
import { PlusOutlined } from '@ant-design/icons-vue';
import dayjs from 'dayjs';
import {
  createCustomer,
  deleteCustomer,
  getCustomers,
  updateCustomer,
} from '../api/crm';
import PageWrapper from '../components/PageWrapper.vue';
import FilterTopbar from '../components/FilterTopbar.vue';

const statusLabel = {
  UNCONTACTED: '未联系',
  FOLLOWING: '跟进中',
  CONVERTED: '已成交',
  LOST: '已流失',
};

const levelOptions = [
  { value: 'VIP', label: 'VIP' },
  { value: 'NORMAL', label: '普通' },
];
const statusOptions = Object.entries(statusLabel).map(([value, label]) => ({
  value,
  label,
}));

const columns = [
  { key: 'name', title: '客户名称' },
  { key: 'phone', title: '联系电话', dataIndex: 'phone', width: 140 },
  { key: 'company', title: '所属公司', dataIndex: 'company' },
  { key: 'level', title: '等级', width: 90 },
  { key: 'follow_status', title: '跟进状态', width: 140 },
  { key: 'order_count', title: '订单数', dataIndex: 'order_count', width: 90 },
  { key: 'total_amount', title: '累计金额', width: 120 },
  { key: 'created_at', title: '创建时间', width: 110 },
  { key: 'action', title: '操作', width: 130 },
];

const list = ref([]);
const loading = ref(false);
const page = ref(1);
const pageSize = ref(10);
const total = ref(0);
const keyword = ref('');
const level = ref(undefined);
const followStatus = ref(undefined);

const formOpen = ref(false);
const editing = ref(null);
const saving = ref(false);
const form = reactive({
  name: '',
  phone: '',
  company: '',
  level: 'NORMAL',
  followStatus: 'UNCONTACTED',
  remark: '',
});

const pager = computed(() => ({
  current: page.value,
  pageSize: pageSize.value,
  total: total.value,
  showSizeChanger: false,
}));

async function reload() {
  loading.value = true;
  try {
    const res = await getCustomers({
      page: page.value,
      page_size: pageSize.value,
      keyword: keyword.value || undefined,
      level: level.value || undefined,
      followStatus: followStatus.value || undefined,
    });
    list.value = res.list.map((r) => ({
      ...r,
      created_at: dayjs(r.created_at).format('YYYY-MM-DD'),
    }));
    total.value = res.total;
  } catch (e) {
    message.error(e.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

function onTableChange(p) {
  page.value = p.current;
  reload();
}

function openCreate() {
  editing.value = null;
  Object.assign(form, {
    name: '',
    phone: '',
    company: '',
    level: 'NORMAL',
    followStatus: 'UNCONTACTED',
    remark: '',
  });
  formOpen.value = true;
}

function openEdit(record) {
  editing.value = record;
  Object.assign(form, {
    name: record.name,
    phone: record.phone,
    company: record.company ?? '',
    level: record.level,
    followStatus: record.follow_status,
    remark: record.remark ?? '',
  });
  formOpen.value = true;
}

async function save() {
  if (!form.name.trim() || !form.phone.trim()) {
    message.warning('客户名称与联系电话必填');
    return;
  }
  saving.value = true;
  try {
    if (editing.value) {
      await updateCustomer(editing.value.id, { ...form });
      message.success('已更新');
    } else {
      await createCustomer({ ...form });
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

async function changeStatus(record, v) {
  try {
    await updateCustomer(record.id, { followStatus: v });
    record.follow_status = v;
    message.success('状态已更新');
  } catch (e) {
    message.error(e.message || '更新失败');
  }
}

async function removeCust(record) {
  try {
    await deleteCustomer(record.id);
    message.success('已删除');
    reload();
  } catch (e) {
    message.error(e.message || '删除失败');
  }
}

onMounted(reload);
</script>

<style scoped>
.danger {
  color: var(--color-error);
}
</style>
