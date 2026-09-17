<template>
  <PageWrapper title="新增项目" subtitle="创建聚光投放项目并关联投流账号">
    <NoticeBar>当前为演示流程，提交不会入库；聚光平台授权接入后将对接真实项目创建。</NoticeBar>

    <div class="add-layout">
      <a-card :bordered="false" size="small" title="项目信息" class="form-card">
        <a-form layout="vertical" :model="form">
          <a-form-item label="项目名称" required>
            <a-input v-model:value="form.name" placeholder="请输入项目名称" :maxlength="30" />
          </a-form-item>
          <a-form-item label="项目周期" required>
            <a-range-picker
              v-model:value="form.period"
              style="width: 100%"
              :allow-clear="false"
            />
          </a-form-item>
          <a-form-item label="项目预算（元）" required>
            <a-input-number
              v-model:value="form.budget"
              style="width: 100%"
              :min="1000"
              :step="1000"
              placeholder="请输入预算金额（元）"
            />
          </a-form-item>
          <a-form-item label="投流策略">
            <a-textarea
              v-model:value="form.strategy"
              :rows="3"
              :maxlength="200"
              placeholder="请填写项目投流策略"
              show-count
            />
          </a-form-item>
          <a-form-item label="关联计划">
            <a-select
              v-model:value="form.plan"
              :options="planOptions"
              placeholder="请选择需要绑定的计划"
            />
          </a-form-item>
          <a-button type="primary" block :loading="submitting" @click="submit">
            创建项目
          </a-button>
        </a-form>
      </a-card>

      <a-card :bordered="false" size="small" title="关联账号" class="account-card">
        <template #extra>
          <a-input
            v-model:value="accountKeyword"
            size="small"
            style="width: 180px"
            placeholder="搜索账号 / 大区"
            allow-clear
          />
        </template>
        <a-table
          :columns="accountColumns"
          :data-source="filteredAccounts"
          :row-selection="{
            selectedRowKeys: selectedKeys,
            onChange: onSelectChange,
          }"
          :pagination="{ pageSize: 8, size: 'small', showSizeChanger: false }"
          row-key="id"
          size="small"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'type'">
              <a-tag :color="record.type === 'KOS' ? 'blue' : 'purple'">{{ record.type }}</a-tag>
            </template>
          </template>
        </a-table>
        <div class="selected-tip muted">
          已选 {{ selectedKeys.length }} / {{ accounts.length }} 个账号
        </div>
      </a-card>
    </div>
  </PageWrapper>
</template>

<script setup>
import { computed, reactive, ref } from 'vue';
import { message } from 'ant-design-vue';
import PageWrapper from '../../components/PageWrapper.vue';
import NoticeBar from '../../components/NoticeBar.vue';
import dayjs from 'dayjs';

const rand = (seed) => {
  const x = Math.sin(seed * 89.3) * 43758.5453;
  return x - Math.floor(x);
};

const REGIONS = ['1华北', '2西南', '3华东', '4华南', '5华中', '上海6'];
const NAMES = [
  '荣威北京中心', '上海安吉荣威', '成都宏达荣威', '广州广物荣威',
  '杭州康桥荣威', '武汉黄浦荣威', '南京朗驰荣威', '深圳都灵荣威',
  '北京页川荣威', '上海东昌荣威', '重庆商社荣威', '佛山顺特荣威',
];

const accounts = ref(
  NAMES.map((name, i) => ({
    id: i + 1,
    name,
    region: REGIONS[Math.floor(rand(i + 2) * REGIONS.length)],
    type: rand(i + 5) > 0.3 ? 'KOS' : 'KOB',
    fans: Math.round(2000 + rand(i + 9) * 48000),
  })),
);

const form = reactive({
  name: '',
  period: [dayjs(), dayjs().add(29, 'day')],
  budget: undefined,
  strategy: '',
  plan: undefined,
});

const planOptions = [
  { value: 'search', label: '搜索抢量计划' },
  { value: 'feed', label: '信息流放量计划' },
  { value: 'video', label: '视频流优先计划' },
  { value: 'mixed', label: '搜索+信息流组合' },
];

const accountKeyword = ref('');
const selectedKeys = ref([]);
const submitting = ref(false);

const filteredAccounts = computed(() => {
  const kw = accountKeyword.value.trim();
  if (!kw) return accounts.value;
  return accounts.value.filter(
    (a) => a.name.includes(kw) || a.region.includes(kw),
  );
});

const accountColumns = [
  { title: '账号', dataIndex: 'name' },
  { key: 'type', title: '类型', width: 80 },
  { title: '大区', dataIndex: 'region', width: 90 },
  { title: '粉丝数', dataIndex: 'fans', width: 100, sorter: (a, b) => a.fans - b.fans },
];

function onSelectChange(keys) {
  selectedKeys.value = keys;
}

function submit() {
  if (!form.name.trim()) {
    message.warning('请输入项目名称');
    return;
  }
  if (!form.budget || form.budget < 1000) {
    message.warning('请输入项目预算（不低于 1000 元）');
    return;
  }
  submitting.value = true;
  setTimeout(() => {
    submitting.value = false;
    message.success(
      `项目「${form.name}」创建成功（演示），已关联 ${selectedKeys.length} 个账号`,
    );
    form.name = '';
    form.budget = undefined;
    form.strategy = '';
    form.plan = undefined;
    selectedKeys.value = [];
  }, 600);
}
</script>

<style scoped>
.add-layout {
  display: grid;
  grid-template-columns: 360px 1fr;
  gap: 12px;
  align-items: start;
}

@media (max-width: 960px) {
  .add-layout { grid-template-columns: 1fr; }
}

.selected-tip { margin-top: 8px; font-size: 12px; }
.muted { color: var(--color-text-secondary, #64748b); }
</style>
