<template>
  <PageWrapper title="变更审核" subtitle="达人资料变更审核流">
    <template #extra>
      <a-badge v-if="pendingCount > 0" :count="pendingCount" />
    </template>

    <a-card :bordered="false">
      <a-tabs v-model:active-key="status" @change="reload">
        <a-tab-pane key="pending" tab="待审核" />
        <a-tab-pane key="approved" tab="已通过" />
        <a-tab-pane key="rejected" tab="已驳回" />
      </a-tabs>

    <a-table
      :columns="columns"
      :data-source="rows"
      :loading="loading"
      :pagination="pagination"
      row-key="id"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'creator'">
          <div class="creator-cell">
            <a-avatar :size="32" :src="record.creator_avatar">
              {{ (record.creator_name || '?').slice(0, 1) }}
            </a-avatar>
            <div>
              <div class="c-name">{{ record.creator_name }}</div>
              <div class="muted small">{{ record.mcn || '独立达人' }}</div>
            </div>
          </div>
        </template>
        <template v-else-if="column.key === 'summary'">
          <div>{{ record.summary }}</div>
          <div v-if="record.changes && status === 'pending'" class="changes">
            <div
              v-for="(v, field) in record.changes"
              :key="field"
              class="change-line"
            >
              <span class="field">{{ fieldLabel(field) }}：</span>
              <span class="old">{{ fmtVal(v.old) }}</span>
              <ArrowRightOutlined class="arrow" />
              <span class="new">{{ fmtVal(v.new) }}</span>
            </div>
          </div>
        </template>
        <template v-else-if="column.key === 'status'">
          <a-tag :color="statusColor[record.status]">{{ statusText[record.status] }}</a-tag>
        </template>
        <template v-else-if="column.key === 'created'">
          {{ fmtDateTime(record.created_at) }}
        </template>
        <template v-else-if="column.key === 'actions'">
          <template v-if="record.status === 'pending'">
            <a-popconfirm
              title="确认通过该变更？通过后立即生效"
              @confirm="doApprove(record)"
            >
              <a-button type="link" size="small">通过</a-button>
            </a-popconfirm>
            <a-button
              type="link"
              size="small"
              danger
              @click="openReject(record)"
            >
              驳回
            </a-button>
          </template>
          <span v-else class="muted small">
            {{ record.reviewed_at ? fmtDateTime(record.reviewed_at) : '' }}
          </span>
        </template>
      </template>
    </a-table>

    <a-modal
      v-model:open="rejectOpen"
      title="驳回变更"
      ok-text="确认驳回"
      cancel-text="取消"
      :confirm-loading="rejecting"
      @ok="doReject"
    >
      <a-textarea
        v-model:value="rejectReason"
        :rows="3"
        placeholder="驳回原因（将记录到操作日志）"
        style="margin-top: 12px"
      />
    </a-modal>
    </a-card>
  </PageWrapper>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { message } from 'ant-design-vue';
import { ArrowRightOutlined } from '@ant-design/icons-vue';
import dayjs from 'dayjs';
import PageWrapper from '../../components/PageWrapper.vue';
import {
  approveReview,
  getPendingCount,
  getReviews,
  rejectReview,
} from '../../api/kol';

const status = ref('pending');
const rows = ref([]);
const loading = ref(false);
const pendingCount = ref(0);
const pagination = reactive({
  current: 1,
  pageSize: 20,
  total: 0,
  showTotal: (t) => `共 ${t} 条`,
});

const rejectOpen = ref(false);
const rejecting = ref(false);
const rejectReason = ref('');
const rejectingRecord = ref(null);

const columns = [
  { title: '达人', key: 'creator', width: 180 },
  { title: '变更内容', key: 'summary' },
  { title: '提交人', dataIndex: 'operator_name', width: 100 },
  { title: '状态', key: 'status', width: 90 },
  { title: '提交时间', key: 'created', width: 150 },
  { title: '操作', key: 'actions', width: 150 },
];

const statusText = { pending: '待审核', approved: '已通过', rejected: '已驳回' };
const statusColor = { pending: 'processing', approved: 'success', rejected: 'error' };

const FIELD_LABELS = {
  category: '内容分类',
  persona: '人设定位',
  tags: '标签',
  contactPhone: '联系电话',
  contactWechat: '微信号',
  contactMail: '邮箱',
  contactStatus: '建联状态',
  ownerId: '负责人',
  remark: '备注',
};

const fieldLabel = (f) => FIELD_LABELS[f] ?? f;
const fmtVal = (v) => (Array.isArray(v) ? v.join('/') : v == null ? '空' : String(v));
const fmtDateTime = (d) => (d ? dayjs(d).format('YYYY-MM-DD HH:mm') : '');

async function load() {
  loading.value = true;
  try {
    const data = await getReviews({
      status: status.value,
      page: pagination.current,
      page_size: pagination.pageSize,
    });
    rows.value = data.list ?? [];
    pagination.total = data.total ?? 0;
  } catch (e) {
    message.error(e.message || '加载审核列表失败');
  } finally {
    loading.value = false;
  }
}

function reload() {
  pagination.current = 1;
  load();
}

async function loadPending() {
  try {
    const data = await getPendingCount();
    pendingCount.value = data.count ?? 0;
  } catch {
    pendingCount.value = 0;
  }
}

async function doApprove(record) {
  try {
    await approveReview(record.id, '');
    message.success('已通过，变更已生效');
    await Promise.all([load(), loadPending()]);
  } catch (e) {
    message.error(e.message || '操作失败');
  }
}

function openReject(record) {
  rejectingRecord.value = record;
  rejectReason.value = '';
  rejectOpen.value = true;
}

async function doReject() {
  if (!rejectReason.value.trim()) {
    message.warning('请填写驳回原因');
    return;
  }
  rejecting.value = true;
  try {
    await rejectReview(rejectingRecord.value.id, rejectReason.value);
    message.success('已驳回');
    rejectOpen.value = false;
    await Promise.all([load(), loadPending()]);
  } catch (e) {
    message.error(e.message || '操作失败');
  } finally {
    rejecting.value = false;
  }
}

onMounted(() => {
  load();
  loadPending();
});
</script>

<style scoped>
.creator-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.c-name {
  font-weight: 500;
}

.muted {
  color: var(--color-text-secondary);
}

.small {
  font-size: 12px;
}

.changes {
  background: var(--color-bg-layout);
  border-radius: 6px;
  padding: 8px 12px;
  margin-top: 6px;
}

.change-line {
  font-size: 12px;
  line-height: 22px;
}

.field {
  color: var(--color-text-secondary);
}

.old {
  color: var(--color-error);
  text-decoration: line-through;
}

.new {
  color: #16a34a;
}

.arrow {
  font-size: 11px;
  margin: 0 6px;
  color: var(--color-text-tertiary);
}
</style>
