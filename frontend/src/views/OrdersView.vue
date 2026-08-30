<template>
  <PageWrapper title="订单列表" subtitle="订单记录与支付状态管理">
    <template #filters>
      <FilterTopbar>
        <a-input-search
          v-model:value="keyword"
          placeholder="订单号 / 客户名称"
          style="width: 240px"
          allow-clear
          @search="reload"
        />
        <a-select
          v-model:value="payStatus"
          style="width: 120px"
          allow-clear
          placeholder="支付状态"
          :options="statusOptions"
          @change="reload"
        />
        <template #actions>
          <a-button type="primary" @click="openCreate">
            <PlusOutlined /> 新建订单
          </a-button>
        </template>
      </FilterTopbar>
    </template>

    <a-card :bordered="false">
      <a-alert
        v-if="totalAmount"
        :message="`当前筛选共 ${total} 单，合计金额 ¥${totalAmount.toLocaleString()}`"
        type="info"
        class="sum-bar"
      />

      <a-table
        :columns="columns"
        :data-source="list"
        :loading="loading"
        :pagination="pager"
        row-key="id"
        @change="onTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'order_no'">
            <span class="mono">{{ record.order_no }}</span>
          </template>
          <template v-else-if="column.key === 'amount'">
            ¥{{ record.amount.toLocaleString() }}
          </template>
          <template v-else-if="column.key === 'pay_status'">
            <a-select
              :value="record.pay_status"
              size="small"
              style="width: 110px"
              :options="statusOptions"
              @change="(v) => changePay(record, v)"
            />
          </template>
          <template v-else-if="column.key === 'action'">
            <a-popconfirm title="确认删除该订单？" @confirm="removeOrd(record)">
              <a class="danger">删除</a>
            </a-popconfirm>
          </template>
        </template>
      </a-table>
    </a-card>

    <a-modal
      v-model:open="formOpen"
      title="新建订单"
      :confirm-loading="saving"
      @ok="save"
    >
      <a-form layout="vertical" style="margin-top: 12px">
        <a-form-item label="客户" required>
          <a-select
            v-model:value="form.customerId"
            :options="customerOptions"
            placeholder="选择客户"
            show-search
            :filter-option="filterCustomer"
          />
        </a-form-item>
        <a-form-item label="订单金额（元）" required>
          <a-input-number
            v-model:value="form.amount"
            :min="0.01"
            :precision="2"
            style="width: 100%"
          />
        </a-form-item>
        <a-form-item label="支付状态">
          <a-radio-group v-model:value="form.payStatus">
            <a-radio value="PENDING">待支付</a-radio>
            <a-radio value="PAID">已支付</a-radio>
            <a-radio value="REFUNDED">已退款</a-radio>
          </a-radio-group>
        </a-form-item>
        <a-form-item label="下单时间">
          <a-date-picker
            v-model:value="form.orderedAt"
            show-time
            style="width: 100%"
          />
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
  createOrder,
  deleteOrder,
  getCustomers,
  getOrders,
  updateOrderPayStatus,
} from '../api/crm';
import PageWrapper from '../components/PageWrapper.vue';
import FilterTopbar from '../components/FilterTopbar.vue';

const statusOptions = [
  { value: 'PENDING', label: '待支付' },
  { value: 'PAID', label: '已支付' },
  { value: 'REFUNDED', label: '已退款' },
];

const columns = [
  { key: 'order_no', title: '订单号', width: 220 },
  { key: 'customer_name', title: '客户', dataIndex: 'customer_name' },
  { key: 'customer_phone', title: '联系电话', dataIndex: 'customer_phone', width: 140 },
  { key: 'amount', title: '金额', width: 120, sorter: (a, b) => a.amount - b.amount },
  { key: 'pay_status', title: '支付状态', width: 140 },
  { key: 'ordered_at', title: '下单时间', width: 160 },
  { key: 'created_by', title: '创建人', dataIndex: 'created_by', width: 100 },
  { key: 'action', title: '操作', width: 90 },
];

const list = ref([]);
const loading = ref(false);
const page = ref(1);
const pageSize = ref(10);
const total = ref(0);
const totalAmount = ref(0);
const keyword = ref('');
const payStatus = ref(undefined);

const customers = ref([]);
const customerOptions = computed(() =>
  customers.value.map((c) => ({
    value: c.id,
    label: `${c.name}（${c.phone}）`,
    name: c.name,
    phone: c.phone,
  })),
);

const formOpen = ref(false);
const saving = ref(false);
const form = reactive({
  customerId: undefined,
  amount: 1000,
  payStatus: 'PENDING',
  orderedAt: null,
});

const pager = computed(() => ({
  current: page.value,
  pageSize: pageSize.value,
  total: total.value,
  showSizeChanger: false,
}));

const filterCustomer = (input, option) =>
  (option.name ?? '').includes(input) || (option.phone ?? '').includes(input);

async function reload() {
  loading.value = true;
  try {
    const res = await getOrders({
      page: page.value,
      page_size: pageSize.value,
      keyword: keyword.value || undefined,
      payStatus: payStatus.value || undefined,
    });
    list.value = res.list.map((r) => ({
      ...r,
      ordered_at: dayjs(r.ordered_at).format('YYYY-MM-DD HH:mm'),
    }));
    total.value = res.total;
    totalAmount.value = res.total_amount;
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

async function openCreate() {
  Object.assign(form, {
    customerId: undefined,
    amount: 1000,
    payStatus: 'PENDING',
    orderedAt: dayjs(),
  });
  formOpen.value = true;
  try {
    const res = await getCustomers({ page: 1, page_size: 100 });
    customers.value = res.list;
  } catch {
    customers.value = [];
  }
}

async function save() {
  if (!form.customerId || !(form.amount > 0)) {
    message.warning('请选择客户并填写金额');
    return;
  }
  saving.value = true;
  try {
    const res = await createOrder({
      customerId: form.customerId,
      amount: form.amount,
      payStatus: form.payStatus,
      orderedAt: form.orderedAt?.toISOString(),
    });
    message.success(`订单已创建：${res.order_no}`);
    formOpen.value = false;
    reload();
  } catch (e) {
    message.error(e.message || '创建失败');
  } finally {
    saving.value = false;
  }
}

async function changePay(record, v) {
  try {
    await updateOrderPayStatus(record.id, v);
    record.pay_status = v;
    message.success('支付状态已更新');
    reload();
  } catch (e) {
    message.error(e.message || '更新失败');
  }
}

async function removeOrd(record) {
  try {
    await deleteOrder(record.id);
    message.success('已删除');
    reload();
  } catch (e) {
    message.error(e.message || '删除失败');
  }
}

onMounted(reload);
</script>

<style scoped>
.sum-bar {
  margin-bottom: 12px;
}

.mono {
  font-family: monospace;
  font-size: 12px;
}

.danger {
  color: var(--color-error);
}
</style>
