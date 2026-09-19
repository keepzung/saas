<template>
  <PageWrapper title="私信线索" subtitle="来鼓小红书私信会话线索">
    <template #filters>
      <FilterTopbar>
        <a-input-search
          v-model:value="keyword"
          placeholder="昵称 / 手机号 / 内容"
          style="width: 220px"
          allow-clear
          @search="reload"
        />
        <a-select
          v-model:value="isResource"
          style="width: 100px"
          allow-clear
          placeholder="留资"
          :options="boolOptions"
          @change="reload"
        />
        <a-select
          v-model:value="hasPhone"
          style="width: 110px"
          allow-clear
          placeholder="联系方式"
          :options="boolOptions"
          @change="reload"
        />
        <a-range-picker
          v-model:value="dateRange"
          style="width: 240px"
          value-format="YYYY-MM-DD"
          @change="reload"
        />
        <template #actions>
          <a-button :loading="syncing" @click="doSync">
            <SyncOutlined /> 手动同步
          </a-button>
        </template>
      </FilterTopbar>
    </template>

    <div class="stat-row">
      <div class="stat-card">
        <div class="stat-value">{{ stats.total }}</div>
        <div class="stat-label">总会话</div>
      </div>
      <div class="stat-card accent-blue">
        <div class="stat-value">{{ stats.today }}</div>
        <div class="stat-label">今日活跃</div>
      </div>
      <div class="stat-card accent-green">
        <div class="stat-value">{{ stats.resourced }}</div>
        <div class="stat-label">留资会话</div>
      </div>
      <div class="stat-card accent-purple">
        <div class="stat-value">{{ stats.with_phone }}</div>
        <div class="stat-label">有联系方式</div>
      </div>
    </div>

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
          <template v-if="column.key === 'client_name'">
            <a @click="openDetail(record)">{{ record.client_name || '匿名用户' }}</a>
          </template>
          <template v-else-if="column.key === 'phone'">
            <span v-if="record.phone" class="phone-text">{{ record.phone }}</span>
            <span v-else class="muted">-</span>
          </template>
          <template v-else-if="column.key === 'is_resource'">
            <a-tag :color="record.is_resource ? 'green' : 'default'">
              {{ record.is_resource ? '已留资' : '未留资' }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'messages'">
            {{ record.client_message_count }} / {{ record.message_count }}
          </template>
          <template v-else-if="column.key === 'ad'">
            <a-tooltip v-if="adName(record)" :title="adName(record)">
              <a-tag color="blue">{{ adShort(record) }}</a-tag>
            </a-tooltip>
            <span v-else class="muted">-</span>
          </template>
          <template v-else-if="column.key === 'action'">
            <a @click="openDetail(record)">详情</a>
          </template>
        </template>
      </a-table>
    </a-card>

    <a-drawer
      v-model:open="detailOpen"
      :title="detailTitle"
      placement="right"
      :width="620"
      :body-style="{ padding: '0', overflow: 'hidden' }"
    >
      <div class="detail-shell">
        <a-spin v-if="detailLoading" class="detail-loading" tip="加载中..." />
        <template v-else-if="detail">
          <div class="detail-section">
            <div class="section-title">客户信息</div>
            <a-descriptions :column="2" size="small" bordered>
              <a-descriptions-item label="昵称" :span="1">
                {{ detail.client_name || '匿名用户' }}
              </a-descriptions-item>
              <a-descriptions-item label="联系电话" :span="1">
                {{ detail.phone || '-' }}
              </a-descriptions-item>
              <a-descriptions-item label="会话ID" :span="1">
                {{ detail.session_id }}
              </a-descriptions-item>
              <a-descriptions-item label="留资状态" :span="1">
                <a-tag :color="detail.is_resource ? 'green' : 'default'">
                  {{ detail.is_resource ? '已留资' : '未留资' }}
                </a-tag>
              </a-descriptions-item>
              <a-descriptions-item label="来源" :span="1">
                {{ sourceLabel(detail.source) }}
              </a-descriptions-item>
              <a-descriptions-item label="归属地" :span="1">
                {{ detail.ip_location || '-' }}
              </a-descriptions-item>
              <a-descriptions-item label="会话开始" :span="1">
                {{ fmtTime(detail.first_message_at) }}
              </a-descriptions-item>
              <a-descriptions-item label="最近活跃" :span="1">
                {{ fmtTime(detail.last_message_at) }}
              </a-descriptions-item>
            </a-descriptions>
          </div>

          <div v-if="detail.ad_info && Object.keys(detail.ad_info).length" class="detail-section">
            <div class="section-title">投放信息</div>
            <a-descriptions :column="1" size="small" bordered>
              <a-descriptions-item label="广告主">
                {{ detail.ad_info.advertiser_name || '-' }}
              </a-descriptions-item>
              <a-descriptions-item label="广告计划">
                {{ detail.ad_info.campaign_name || '-' }}
              </a-descriptions-item>
              <a-descriptions-item label="创意">
                {{ detail.ad_info.creativity_name || '-' }}
              </a-descriptions-item>
            </a-descriptions>
          </div>

          <div class="detail-section">
            <div class="section-title">
              聊天记录
              <span class="muted">（{{ messages.length }} 条）</span>
            </div>
            <div class="chat-list">
              <div
                v-for="msg in messages"
                :key="msg.id"
                class="chat-row"
                :class="{ client: msg.role === 'client' }"
              >
                <div class="chat-meta">
                  <span class="chat-name">{{ roleLabel(msg) }}</span>
                  <span class="chat-time">{{ fmtTime(msg.created_at) }}</span>
                </div>
                <div class="chat-bubble">
                  <template v-if="isNoteCard(msg)">
                    <div class="note-card">
                      <div class="note-title">{{ noteCardTitle(msg) }}</div>
                      <a
                        v-if="noteCardLink(msg)"
                        :href="noteCardLink(msg)"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        查看笔记
                      </a>
                    </div>
                  </template>
                  <template v-else>{{ msg.content }}</template>
                </div>
              </div>
              <a-empty v-if="!messages.length" description="暂无消息" />
            </div>
          </div>

          <div class="detail-section">
            <a-collapse :bordered="false">
              <a-collapse-panel key="raw" header="原始报文">
                <pre class="raw-json">{{ JSON.stringify(detail.raw_json, null, 2) }}</pre>
              </a-collapse-panel>
            </a-collapse>
          </div>
        </template>
      </div>
    </a-drawer>
  </PageWrapper>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { message } from 'ant-design-vue';
import { SyncOutlined } from '@ant-design/icons-vue';
import dayjs from 'dayjs';
import {
  getLaiguLeadDetail,
  getLaiguLeads,
  getLaiguLeadStats,
  syncLaigu,
} from '../../api/laigu';
import { useAuthStore } from '../../stores/auth';
import PageWrapper from '../../components/PageWrapper.vue';
import FilterTopbar from '../../components/FilterTopbar.vue';

const auth = useAuthStore();

const boolOptions = [
  { value: 'true', label: '是' },
  { value: 'false', label: '否' },
];

const columns = [
  { key: 'client_name', title: '客户昵称', width: 160, ellipsis: true },
  { key: 'phone', title: '联系电话', width: 130 },
  { key: 'is_resource', title: '留资', width: 90 },
  { key: 'messages', title: '客户/总消息', width: 110 },
  { key: 'last_client_content', title: '最后客户消息', dataIndex: 'last_client_content', ellipsis: true },
  { key: 'ad', title: '投放', width: 150, ellipsis: true },
  { key: 'last_message_at', title: '最近活跃', width: 160 },
  { key: 'action', title: '操作', width: 80 },
];

const list = ref([]);
const stats = ref({ total: 0, today: 0, resourced: 0, with_phone: 0 });
const loading = ref(false);
const page = ref(1);
const pageSize = ref(10);
const total = ref(0);
const keyword = ref('');
const isResource = ref(undefined);
const hasPhone = ref(undefined);
const dateRange = ref(null);
const syncing = ref(false);

const detailOpen = ref(false);
const detailLoading = ref(false);
const detail = ref(null);

const pager = computed(() => ({
  current: page.value,
  pageSize: pageSize.value,
  total: total.value,
  showSizeChanger: false,
}));

const detailTitle = computed(
  () => `私信详情 - ${detail.value?.client_name || '匿名用户'}`,
);

const messages = computed(() => detail.value?.raw_json?.messages ?? []);

const brandParam = () => ({ brandId: auth.currentBrandId ?? undefined });

async function reload() {
  loading.value = true;
  try {
    const params = {
      page: page.value,
      page_size: pageSize.value,
      ...brandParam(),
    };
    if (keyword.value) params.keyword = keyword.value;
    if (isResource.value !== undefined && isResource.value !== null)
      params.isResource = isResource.value;
    if (hasPhone.value !== undefined && hasPhone.value !== null)
      params.hasPhone = hasPhone.value;
    if (dateRange.value?.length === 2) {
      params.from = dateRange.value[0];
      params.to = dateRange.value[1];
    }
    const res = await getLaiguLeads(params);
    list.value = res.list.map((r) => ({
      ...r,
      last_message_at: fmtTime(r.last_message_at),
    }));
    total.value = res.total;
  } catch (e) {
    message.error(e.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

async function loadStats() {
  try {
    stats.value = await getLaiguLeadStats(brandParam());
  } catch {
    /* 静默 */
  }
}

function onTableChange(p) {
  page.value = p.current;
  reload();
}

async function doSync() {
  syncing.value = true;
  try {
    const res = await syncLaigu();
    message.success(`同步完成：拉取 ${res.fetched} 条会话`);
    await Promise.all([reload(), loadStats()]);
  } catch (e) {
    message.error(e.message || '同步失败');
  } finally {
    syncing.value = false;
  }
}

async function openDetail(record) {
  detailOpen.value = true;
  detailLoading.value = true;
  detail.value = null;
  try {
    detail.value = await getLaiguLeadDetail(record.id);
  } catch (e) {
    message.error(e.message || '加载详情失败');
    detailOpen.value = false;
  } finally {
    detailLoading.value = false;
  }
}

function adName(record) {
  return record.ad_info?.campaign_name || record.ad_info?.advertiser_name || '';
}

function adShort(record) {
  return record.ad_info?.advertiser_name || '投放会话';
}

function sourceLabel(source) {
  const map = { redbook: '小红书' };
  return map[source] || source || '-';
}

function roleLabel(msg) {
  if (msg.role === 'client') return msg.name || '客户';
  if (msg.role === 'ai_employee') return msg.name || 'AI客服';
  return msg.name || '客服';
}

function isNoteCard(msg) {
  return msg.type === 'redbook_note_card';
}

function parseCardContent(msg) {
  try {
    return JSON.parse(msg.content);
  } catch {
    return null;
  }
}

function noteCardTitle(msg) {
  return parseCardContent(msg)?.title || '笔记卡片';
}

function noteCardLink(msg) {
  return parseCardContent(msg)?.link || '';
}

function fmtTime(value) {
  if (!value) return '-';
  if (typeof value === 'number') {
    const ms = value > 1e12 ? value : value * 1000;
    return dayjs(ms).format('YYYY-MM-DD HH:mm');
  }
  return dayjs(value).format('YYYY-MM-DD HH:mm');
}

onMounted(() => {
  reload();
  loadStats();
});
</script>

<style scoped>
.stat-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 12px;
}

.stat-card {
  background: #fff;
  border-radius: var(--radius-card, 12px);
  padding: 16px 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.stat-value {
  font-size: 26px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: #1e293b;
}

.stat-label {
  margin-top: 2px;
  font-size: 13px;
  color: #64748b;
}

.accent-blue .stat-value {
  color: #3456e6;
}

.accent-green .stat-value {
  color: #16a34a;
}

.accent-purple .stat-value {
  color: #9333ea;
}

.muted {
  color: #94a3b8;
}

.phone-text {
  font-variant-numeric: tabular-nums;
}

.detail-shell {
  height: 100%;
  overflow-y: auto;
  padding: 16px 20px 24px;
}

.detail-loading {
  margin-top: 120px;
}

.detail-section {
  margin-bottom: 18px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 10px;
}

.chat-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.chat-row {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.chat-row.client {
  align-items: flex-end;
}

.chat-meta {
  display: flex;
  gap: 8px;
  font-size: 12px;
  color: #94a3b8;
  margin-bottom: 3px;
}

.chat-bubble {
  max-width: 78%;
  padding: 8px 12px;
  border-radius: 10px;
  background: #f1f5f9;
  color: #1e293b;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.chat-row.client .chat-bubble {
  background: #eaf1ff;
  color: #1d4ed8;
}

.note-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.note-title {
  font-weight: 600;
}

.raw-json {
  max-height: 320px;
  overflow: auto;
  font-size: 12px;
  background: #f8fafc;
  border-radius: 8px;
  padding: 10px;
  margin: 0;
}
</style>
