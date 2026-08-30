<template>
  <PageWrapper title="数据总览" :subtitle="`欢迎回来，${auth.user?.nickname || '用户'}`">
    <a-card :bordered="false">
      <a-row :gutter="16">
        <a-col :span="6">
          <a-statistic title="客户总数" :value="stats.customers" />
        </a-col>
        <a-col :span="6">
          <a-statistic
            title="VIP 客户"
            :value="stats.vipCustomers"
            :value-style="{ color: '#d97706' }"
          />
        </a-col>
        <a-col :span="6">
          <a-statistic
            title="订单总数"
            :value="stats.orders"
            :value-style="{ color: '#3456E6' }"
          />
        </a-col>
        <a-col :span="6">
          <a-statistic
            title="待支付订单"
            :value="stats.pendingPayments"
            :value-style="{ color: '#dc2626' }"
          />
        </a-col>
      </a-row>
    </a-card>

    <a-card :bordered="false" title="快捷入口">
      <a-space wrap :size="12">
        <a-button @click="$router.push('/customers')">
          <UserOutlined /> 客户管理
        </a-button>
        <a-button @click="$router.push('/orders')">
          <OrderedListOutlined /> 订单管理
        </a-button>
        <a-button @click="$router.push('/project/manage/list')">
          <ProjectOutlined /> 项目管理
        </a-button>
        <a-button @click="$router.push('/content-center-pro/workbench/overview')">
          <AppstoreOutlined /> 内容中心
        </a-button>
        <a-button @click="$router.push('/kox_df/operation-analysis/overview')">
          <BarChartOutlined /> KOX 运营
        </a-button>
        <a-button @click="$router.push('/brandcosinsight/monitor/brand')">
          <GlobalOutlined /> 品牌洞察
        </a-button>
      </a-space>
    </a-card>
  </PageWrapper>
</template>

<script setup>
import { onMounted, reactive } from 'vue';
import {
  AppstoreOutlined,
  BarChartOutlined,
  GlobalOutlined,
  OrderedListOutlined,
  ProjectOutlined,
  UserOutlined,
} from '@ant-design/icons-vue';
import request from '../api/request';
import { useAuthStore } from '../stores/auth';
import PageWrapper from '../components/PageWrapper.vue';

const auth = useAuthStore();
const stats = reactive({
  customers: 0,
  vipCustomers: 0,
  orders: 0,
  todayOrders: 0,
  pendingPayments: 0,
});

onMounted(async () => {
  try {
    const data = await request.get('/stats/overview');
    Object.assign(stats, data);
  } catch {
    /* 静默失败，保持 0 */
  }
});
</script>
