<template>
  <PageWrapper title="新增项目" subtitle="创建投放项目并关联星火投放账户">
    <NoticeBar>项目创建后，报表页将按「项目周期 × 关联账户」自动聚合星火聚光投放数据（T+1）。</NoticeBar>

    <div class="add-layout">
      <a-card :bordered="false" size="small" title="项目信息" class="form-card">
        <a-form layout="vertical" :model="form">
          <a-form-item label="项目名称" required>
            <a-input v-model:value="form.name" placeholder="请输入项目名称" :maxlength="30" />
          </a-form-item>
          <a-form-item v-if="isDf" label="所属大区" required>
            <a-select
              v-model:value="form.region"
              placeholder="请选择大区"
              :options="DF_REGIONS.map((r) => ({ label: r, value: r }))"
            />
          </a-form-item>
          <a-form-item label="项目周期" required>
            <a-range-picker
              v-model:value="form.period"
              style="width: 100%"
              :allow-clear="false"
            />
          </a-form-item>
          <a-form-item label="项目预算（元，可选）">
            <a-input-number
              v-model:value="form.budget"
              style="width: 100%"
              :min="0"
              :step="1000"
              placeholder="不填则不显示预算进度"
            />
          </a-form-item>
          <a-form-item label="备注（可选）">
            <a-textarea
              v-model:value="form.remark"
              :rows="3"
              :maxlength="200"
              placeholder="投流策略、目标等"
              show-count
            />
          </a-form-item>
          <a-button type="primary" block :loading="submitting" @click="submit">
            创建项目
          </a-button>
        </a-form>
      </a-card>

      <a-card :bordered="false" size="small" class="account-card">
        <template #title>
          关联投放账户
          <span class="muted small" style="font-weight: 400">（来自星火平台，T+1 同步）</span>
        </template>
        <template #extra>
          <a-input-search
            v-model:value="accountKeyword"
            size="small"
            style="width: 220px"
            placeholder="搜索账户 / 代理商 / 投放ID"
            allow-clear
          />
        </template>
        <a-table
          :columns="accountColumns"
          :data-source="filteredAccounts"
          :loading="accountsLoading"
          :row-selection="{
            selectedRowKeys: selectedKeys,
            onChange: onSelectChange,
          }"
          :pagination="{ pageSize: 10, size: 'small', showSizeChanger: false }"
          row-key="virtual_seller_id"
          size="small"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'kind'">
              <a-tag :color="record.account_kind === 'agent_sub' ? 'orange' : 'blue'">
                {{ record.account_kind === 'agent_sub' ? '子账户' : '主账户' }}
              </a-tag>
            </template>
            <template v-else-if="column.key === 'active'">
              <span :style="{ color: record.active ? '#16a34a' : '#94a3b8' }">
                {{ record.active ? '● 在投' : '○ 停投' }}
              </span>
            </template>
          </template>
        </a-table>
        <div class="selected-tip muted">
          已选 {{ selectedKeys.length }} / {{ accounts.length }} 个账户
        </div>
      </a-card>
    </div>
  </PageWrapper>
</template>

<script setup>
import { computed, reactive, ref } from 'vue';
import { message } from 'ant-design-vue';
import { useRouter } from 'vue-router';
import dayjs from 'dayjs';
import PageWrapper from '../../components/PageWrapper.vue';
import NoticeBar from '../../components/NoticeBar.vue';
import { getSparkAccounts, createSparkProject } from '../../api/spark';
import { useAuthStore } from '../../stores/auth';

const router = useRouter();
const auth = useAuthStore();
const isDf = [7, 8].includes(Number(auth.currentBrandId));
const DF_REGIONS = ['全国', '北部大区', '东部大区', '南部大区', '西部大区', '中部大区'];

const accounts = ref([]);
const accountsLoading = ref(false);
const accountKeyword = ref('');
const selectedKeys = ref([]);
const submitting = ref(false);

const form = reactive({
  name: '',
  region: undefined,
  period: [dayjs().subtract(29, 'day'), dayjs()],
  budget: undefined,
  remark: '',
});

const filteredAccounts = computed(() => {
  const kw = accountKeyword.value.trim();
  if (!kw) return accounts.value;
  return accounts.value.filter(
    (a) =>
      a.name.includes(kw) ||
      (a.agent_name ?? '').includes(kw) ||
      (a.advertiser_id ?? '').includes(kw),
  );
});

const accountColumns = [
  { title: '账户名称', dataIndex: 'name', ellipsis: true },
  { key: 'kind', title: '类型', width: 85 },
  { title: '所属代理商', dataIndex: 'agent_name', width: 160, ellipsis: true },
  { title: '投放ID', dataIndex: 'advertiser_id', width: 100 },
  { key: 'active', title: '状态', width: 80 },
];

function onSelectChange(keys) {
  selectedKeys.value = keys;
}

async function loadAccounts() {
  accountsLoading.value = true;
  try {
    const all = [];
    let page = 1;
    for (;;) {
      const res = await getSparkAccounts({
        active: 'true',
        page,
        page_size: 100,
      });
      all.push(...(res.list ?? []));
      if (all.length >= (res.total ?? 0) || !(res.list ?? []).length) break;
      page += 1;
    }
    accounts.value = all;
  } catch {
    accounts.value = [];
    message.error('投放账户列表加载失败');
  } finally {
    accountsLoading.value = false;
  }
}
loadAccounts();

async function submit() {
  if (!form.name.trim()) {
    message.warning('请输入项目名称');
    return;
  }
  if (!form.period?.[0] || !form.period?.[1]) {
    message.warning('请选择项目周期');
    return;
  }
  if (!selectedKeys.value.length) {
    message.warning('请至少关联一个投放账户');
    return;
  }
  submitting.value = true;
  try {
    await createSparkProject(
      {
        name: form.name.trim(),
        region: isDf ? form.region || undefined : undefined,
        startDate: form.period[0].format('YYYY-MM-DD'),
        endDate: form.period[1].format('YYYY-MM-DD'),
        budget: form.budget ?? undefined,
        remark: form.remark || undefined,
        virtualSellerIds: selectedKeys.value,
      },
      auth.currentBrandId ?? 2,
    );
    message.success(`项目「${form.name}」创建成功，已关联 ${selectedKeys.value.length} 个账户`);
    router.push('/kox_df/campaign-analysis/project-reports');
  } catch (e) {
    message.error(e?.response?.data?.msg || '创建失败，请稍后重试');
  } finally {
    submitting.value = false;
  }
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
.small { font-size: 12px; }
</style>
