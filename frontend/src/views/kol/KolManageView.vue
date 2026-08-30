<template>
  <PageWrapper title="达人库管理" subtitle="入库达人的建联跟进与信息维护">
    <template #filters>
      <FilterTopbar>
        <a-input-search
          v-model:value="keyword"
          placeholder="搜索昵称 / 机构"
          style="width: 220px"
          allow-clear
          @search="reload"
        />
        <a-select
          v-model:value="ownerId"
          :options="ownerOptions"
          style="width: 140px"
          allow-clear
          placeholder="负责人"
          @change="reload"
        />
        <template #actions>
          <a-button @click="exportCsv">
            <DownloadOutlined /> 导出
          </a-button>
        </template>
      </FilterTopbar>
    </template>

    <a-card :bordered="false">
      <a-tabs v-model:active-key="contactStatus" @change="reload">
        <a-tab-pane key="" tab="全部" />
        <a-tab-pane key="pending" tab="待建联" />
        <a-tab-pane key="contacting" tab="建联中" />
        <a-tab-pane key="contacted" tab="已建联" />
        <a-tab-pane key="failed" tab="建联失败" />
      </a-tabs>

      <a-table
        :columns="columns"
        :data-source="rows"
        :loading="loading"
        :pagination="pagination"
        row-key="id"
        :scroll="{ x: 1180 }"
        @change="onTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'nickname'">
            <div class="creator-cell">
              <a-avatar :size="36" :src="record.avatar">
                {{ record.nickname.slice(0, 1) }}
              </a-avatar>
              <div>
                <div class="c-name">{{ record.nickname }}</div>
                <div class="muted small">
                  {{ record.note_sign || '小红书' }} · {{ record.location || '-' }}
                </div>
              </div>
            </div>
          </template>
          <template v-else-if="column.key === 'fans'">
            {{ fmtCount(record.fans_count) }}
          </template>
          <template v-else-if="column.key === 'category'">
            <div>{{ record.category || '未分类' }}</div>
            <div v-if="record.tags?.length" class="muted small">
              <a-tag v-for="t in record.tags.slice(0, 2)" :key="t" class="mini-tag">
                {{ t }}
              </a-tag>
            </div>
          </template>
          <template v-else-if="column.key === 'mcn'">
            {{ record.mcn || '独立达人' }}
          </template>
          <template v-else-if="column.key === 'price'">
            <div class="small">图文 ¥{{ fmtPrice(record.pgy_image_price) }}</div>
            <div class="small">视频 ¥{{ fmtPrice(record.pgy_video_price) }}</div>
          </template>
          <template v-else-if="column.key === 'contact'">
            <div class="small">{{ record.contact_phone || '-' }}</div>
            <div class="muted small">{{ record.contact_wechat || '' }}</div>
          </template>
          <template v-else-if="column.key === 'contact_status'">
            <a-badge
              :status="contactStatusMeta[record.contact_status]?.badge"
              :text="contactStatusMeta[record.contact_status]?.text"
            />
          </template>
          <template v-else-if="column.key === 'owner'">
            {{ record.owner_nickname || '未分配' }}
          </template>
          <template v-else-if="column.key === 'resource_status'">
            <a-tag :color="record.resource_status === 1 ? 'green' : 'red'">
              {{ record.resource_status === 1 ? '正常' : '暂停合作' }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'updated'">
            {{ fmtDateTime(record.updated_at) }}
          </template>
          <template v-else-if="column.key === 'actions'">
            <a-button type="link" size="small" @click="openEdit(record)">
              编辑
            </a-button>
            <a-button
              type="link"
              size="small"
              @click="toggleStatus(record)"
            >
              {{ record.resource_status === 1 ? '暂停' : '恢复' }}
            </a-button>
            <a-popconfirm
              title="移出后可从达人广场重新收藏，确认？"
              @confirm="removeOne(record)"
            >
              <a-button type="link" size="small" danger>移除</a-button>
            </a-popconfirm>
          </template>
        </template>
      </a-table>
    </a-card>

    <a-drawer
      v-model:open="editOpen"
      :title="`编辑达人 · ${editing?.nickname ?? ''}`"
      width="480"
    >
      <a-form layout="vertical" v-if="editing">
        <a-form-item label="内容分类">
          <a-input v-model:value="editForm.category" :maxlength="50" />
        </a-form-item>
        <a-form-item label="人设定位">
          <a-input v-model:value="editForm.persona" :maxlength="200" />
        </a-form-item>
        <a-form-item label="标签（逗号分隔）">
          <a-select
            v-model:value="editForm.tags"
            mode="tags"
            :open="false"
            placeholder="输入后回车"
          />
        </a-form-item>
        <a-form-item label="建联状态">
          <a-select
            v-model:value="editForm.contactStatus"
            :options="contactStatusOptions"
          />
        </a-form-item>
        <a-form-item label="联系电话">
          <a-input v-model:value="editForm.contactPhone" :maxlength="20" />
        </a-form-item>
        <a-form-item label="微信号">
          <a-input v-model:value="editForm.contactWechat" :maxlength="50" />
        </a-form-item>
        <a-form-item label="邮箱">
          <a-input v-model:value="editForm.contactMail" :maxlength="100" />
        </a-form-item>
        <a-form-item label="负责人">
          <a-select
            v-model:value="editForm.ownerId"
            :options="ownerOptions"
            allow-clear
            placeholder="选择负责人"
          />
        </a-form-item>
        <a-form-item label="备注">
          <a-textarea v-model:value="editForm.remark" :rows="3" :maxlength="2000" />
        </a-form-item>
        <a-alert
          message="保存后将提交变更审核，由管理员审核后生效"
          type="info"
          show-icon
          style="margin-bottom: 16px"
        />
        <a-button type="primary" block :loading="saving" @click="saveEdit">
          提交变更
        </a-button>
      </a-form>
    </a-drawer>
  </PageWrapper>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { message } from 'ant-design-vue';
import { DownloadOutlined } from '@ant-design/icons-vue';
import dayjs from 'dayjs';
import PageWrapper from '../../components/PageWrapper.vue';
import FilterTopbar from '../../components/FilterTopbar.vue';
import {
  getKolUsers,
  getLibrary,
  toggleCreatorStatus,
  uncollectCreator,
  updateCreator,
} from '../../api/kol';

const contactStatus = ref('');
const keyword = ref('');
const ownerId = ref(null);
const rows = ref([]);
const loading = ref(false);
const users = ref([]);
const pagination = reactive({
  current: 1,
  pageSize: 20,
  total: 0,
  showSizeChanger: true,
  showTotal: (t) => `共 ${t} 位`,
});

const editOpen = ref(false);
const editing = ref(null);
const saving = ref(false);
const editForm = reactive({
  category: '',
  persona: '',
  tags: [],
  contactStatus: 'pending',
  contactPhone: '',
  contactWechat: '',
  contactMail: '',
  ownerId: null,
  remark: '',
});

const contactStatusMeta = {
  pending: { badge: 'default', text: '待建联' },
  contacting: { badge: 'processing', text: '建联中' },
  contacted: { badge: 'success', text: '已建联' },
  failed: { badge: 'error', text: '建联失败' },
};

const contactStatusOptions = [
  { label: '待建联', value: 'pending' },
  { label: '建联中', value: 'contacting' },
  { label: '已建联', value: 'contacted' },
  { label: '建联失败', value: 'failed' },
];

const ownerOptions = computed(() =>
  users.value.map((u) => ({ label: u.nickname, value: u.id })),
);

const columns = [
  { title: '达人', key: 'nickname', width: 190, fixed: 'left' },
  { title: '粉丝', key: 'fans', width: 90 },
  { title: '分类/标签', key: 'category', width: 150 },
  { title: '机构', key: 'mcn', width: 120 },
  { title: '报价', key: 'price', width: 140 },
  { title: '联系方式', key: 'contact', width: 130 },
  { title: '建联状态', key: 'contact_status', width: 100 },
  { title: '负责人', key: 'owner', width: 90 },
  { title: '状态', key: 'resource_status', width: 95 },
  { title: '更新时间', key: 'updated', width: 140 },
  { title: '操作', key: 'actions', width: 170, fixed: 'right' },
];

const fmtCount = (n) =>
  n == null ? '-' : n >= 10000 ? `${(n / 10000).toFixed(1)}w` : String(n);
const fmtPrice = (p) => (p == null ? '-' : Number(p).toLocaleString('zh-CN'));
const fmtDateTime = (d) => (d ? dayjs(d).format('YYYY-MM-DD HH:mm') : '');

async function load() {
  loading.value = true;
  try {
    const params = {
      page: pagination.current,
      page_size: pagination.pageSize,
    };
    if (keyword.value) params.keyword = keyword.value;
    if (ownerId.value) params.owner_id = ownerId.value;
    if (contactStatus.value) params.contact_status = contactStatus.value;
    const data = await getLibrary(params);
    rows.value = data.list ?? [];
    pagination.total = data.total ?? 0;
  } catch (e) {
    message.error(e.message || '加载达人库失败');
  } finally {
    loading.value = false;
  }
}

function reload() {
  pagination.current = 1;
  load();
}

function onTableChange(pag) {
  pagination.current = pag.current;
  pagination.pageSize = pag.pageSize;
  load();
}

function openEdit(record) {
  editing.value = record;
  editForm.category = record.category ?? '';
  editForm.persona = record.persona ?? '';
  editForm.tags = record.tags ? [...record.tags] : [];
  editForm.contactStatus = record.contact_status ?? 'pending';
  editForm.contactPhone = record.contact_phone ?? '';
  editForm.contactWechat = record.contact_wechat ?? '';
  editForm.contactMail = record.contact_mail ?? '';
  editForm.ownerId = record.owner_id ?? null;
  editForm.remark = record.remark ?? '';
  editOpen.value = true;
}

async function saveEdit() {
  saving.value = true;
  try {
    const payload = {
      category: editForm.category || undefined,
      persona: editForm.persona || undefined,
      tags: editForm.tags,
      contactStatus: editForm.contactStatus,
      contactPhone: editForm.contactPhone || null,
      contactWechat: editForm.contactWechat || null,
      contactMail: editForm.contactMail || null,
      ownerId: editForm.ownerId,
      remark: editForm.remark || null,
    };
    const res = await updateCreator(editing.value.id, payload);
    message.success(`变更已提交审核（${res.fields.join('、')}）`);
    editOpen.value = false;
    load();
  } catch (e) {
    message.error(e.message || '提交失败');
  } finally {
    saving.value = false;
  }
}

async function toggleStatus(record) {
  try {
    const res = await toggleCreatorStatus(record.id);
    record.resource_status = res.resource_status;
    message.success(res.resource_status === 1 ? '已恢复合作' : '已暂停合作');
  } catch (e) {
    message.error(e.message || '操作失败');
  }
}

async function removeOne(record) {
  try {
    await uncollectCreator(record.id);
    message.success(`「${record.nickname}」已移出达人库`);
    load();
  } catch (e) {
    message.error(e.message || '移除失败');
  }
}

function exportCsv() {
  const header = '昵称,粉丝数,分类,机构,联系电话,微信,建联状态,负责人,状态';
  const statusText = { pending: '待建联', contacting: '建联中', contacted: '已建联', failed: '建联失败' };
  const lines = rows.value.map((r) =>
    [
      r.nickname,
      r.fans_count,
      r.category ?? '',
      r.mcn ?? '',
      r.contact_phone ?? '',
      r.contact_wechat ?? '',
      statusText[r.contact_status] ?? r.contact_status,
      r.owner_nickname ?? '',
      r.resource_status === 1 ? '正常' : '暂停',
    ]
      .map((v) => `"${String(v ?? '')}"`)
      .join(','),
  );
  const blob = new Blob(['\ufeff' + [header, ...lines].join('\n')], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `达人库_${dayjs().format('YYYYMMDD_HHmm')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

onMounted(async () => {
  const data = await getKolUsers();
  users.value = data.list ?? [];
  load();
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

.mini-tag {
  font-size: 11px;
  line-height: 16px;
  padding: 0 4px;
}
</style>
