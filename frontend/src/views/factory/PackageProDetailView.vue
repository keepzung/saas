<template>
  <PageWrapper :title="pkg.name || '内容包'" :subtitle="`内容包Pro · ${route.params.id}`">
    <div class="pd-body">
      <div class="pd-toolbar">
        <a-button size="small" @click="$router.push('/content-pro/package')"><LeftOutlined /> 返回内容包列表</a-button>
        <a-tag class="pd-pro">PRO</a-tag>
        <span class="pd-name">{{ pkg.name }}</span>
        <span class="pd-uid">{{ pkg.uid }}</span>
        <div class="pd-spacer" />
        <a-button size="small" @click="load"><ReloadOutlined /> 刷新</a-button>
        <a-button size="small" @click="exportCsv"><DownloadOutlined /> 导出内容</a-button>
        <a-button size="small" @click="$router.push({ path: '/content-pro/audit', query: { packageId: String(route.params.id) } })">
          <AuditOutlined /> 内容审核
        </a-button>
      </div>

      <div class="pd-filter">
        <a-radio-group v-model:value="tab" button-style="solid" size="small" @change="load">
          <a-radio-button value="all">全部 ({{ pkg.stats?.total ?? 0 }})</a-radio-button>
          <a-radio-button value="draft">草稿 ({{ pkg.stats?.draft ?? 0 }})</a-radio-button>
          <a-radio-button value="pending">待审核 ({{ pkg.stats?.pending ?? 0 }})</a-radio-button>
          <a-radio-button value="approved">已通过 ({{ pkg.stats?.approved ?? 0 }})</a-radio-button>
          <a-radio-button value="rejected">已驳回 ({{ pkg.stats?.rejected ?? 0 }})</a-radio-button>
        </a-radio-group>
        <a-input-search v-model:value="keyword" placeholder="搜索内容标题" style="width: 220px" size="small" allow-clear @search="load" />
        <div class="pd-spacer" />
        <a-button size="small" type="primary" :disabled="!approvedSelected.length" @click="openDispatch">
          <SendOutlined /> 分发所选
        </a-button>
      </div>

      <div class="pd-table-card">
        <div class="pd-thead">
          <span style="width: 36px"><a-checkbox :checked="allChecked" @change="toggleAll" /></span>
          <span style="flex: 1">内容</span>
          <span style="width: 110px">状态</span>
          <span style="width: 130px">当前指派达人</span>
          <span style="width: 110px">领用情况</span>
          <span style="width: 150px">最后更新</span>
          <span style="width: 190px">操作</span>
        </div>
        <a-spin :spinning="loading">
          <div v-for="item in items" :key="item.id" class="pd-row">
            <span style="width: 36px"><a-checkbox :checked="selected.includes(item.id)" @change="toggleSelect(item.id)" /></span>
            <span style="flex: 1" class="pd-content">
              <img :src="item.img_list?.[0] ?? item.cover_url" class="pd-thumb" @error="$event.target.style.visibility = 'hidden'" />
              <div class="pd-ct">
                <div class="pd-title">{{ item.title }}</div>
                <a-tag class="pd-form-tag" color="blue">{{ item.content_form === 'video' ? '视频' : '图文' }}</a-tag>
                <span v-if="item.reject_reason && item.review_status === 'rejected'" class="pd-reject">{{ item.reject_reason }}</span>
              </div>
            </span>
            <span style="width: 110px"><span class="pd-status" :class="statusClass(item)">{{ statusText(item) }}</span></span>
            <span style="width: 130px" class="pd-muted">{{ item.dispatched_to_name ?? '未指派' }}</span>
            <span style="width: 110px" class="pd-muted">{{ item.claimed_by_id ? `已被领用` : '待领用' }}</span>
            <span style="width: 150px" class="pd-muted">{{ fmtTime(item.upload_time) }}</span>
            <span style="width: 190px" class="pd-ops">
              <a @click="openEdit(item)">编辑</a>
              <a-popconfirm v-if="['draft', 'rejected'].includes(item.review_status)" title="确定提交审核？" @confirm="doSubmit([item.id])">
                <a>提交审核</a>
              </a-popconfirm>
              <a v-if="item.review_status === 'pending'" @click="doApprove([item.id])">通过</a>
              <a v-if="item.review_status === 'pending'" class="danger" @click="openReject([item.id])">驳回</a>
              <a v-if="item.review_status === 'approved'" @click="openDispatch([item.id])">分发</a>
              <a-popconfirm v-if="item.review_status === 'draft'" title="移出内容包？" @confirm="doMoveOut([item.id])">
                <a class="danger">移出</a>
              </a-popconfirm>
            </span>
          </div>
          <a-empty v-if="!items.length && !loading" :image="Empty.PRESENTED_IMAGE_SIMPLE" description="包内暂无内容，去「批量任务结果」移入" />
        </a-spin>
        <div class="pd-page" v-if="total > pageSize">
          <a-pagination v-model:current="page" size="small" :total="total" :page-size="pageSize" :show-size-changer="false" @change="load" />
        </div>
      </div>
    </div>

    <!-- 编辑 -->
    <a-modal v-model:open="editOpen" title="编辑内容" width="640px" :confirm-loading="saving" @ok="saveEdit">
      <div class="edit-form">
        <div class="ef-item"><label>标题</label><a-input v-model:value="editForm.title" :maxlength="30" show-count /></div>
        <div class="ef-item"><label>正文</label><a-textarea v-model:value="editForm.content" :rows="8" :maxlength="1000" show-count /></div>
      </div>
    </a-modal>

    <!-- 驳回 -->
    <a-modal v-model:open="rejectOpen" title="驳回内容" width="480px" @ok="confirmReject">
      <div class="ef-item" style="margin-top: 6px">
        <label>驳回原因（对方可在包内看到并修改后重新提交）</label>
        <a-textarea v-model:value="rejectReason" :rows="3" :maxlength="200" placeholder="例如：卖点不突出 / 标题党 / 与产品无关" />
      </div>
    </a-modal>

    <!-- 分发 -->
    <a-modal v-model:open="dispatchOpen" title="分发内容" width="480px" :confirm-loading="dispatching" @ok="confirmDispatch">
      <div class="move-tip">将 {{ dispatchIds.length }} 篇过审内容指派给指定 KOS 用户，对方在手机端「领用」中可见。</div>
      <a-select
        v-model:value="dispatchUser"
        style="width: 100%; margin-top: 12px"
        show-search
        option-filter-prop="label"
        :options="userOptions"
        placeholder="选择用户"
      />
    </a-modal>
  </PageWrapper>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import { message, Empty } from 'ant-design-vue';
import {
  ReloadOutlined,
  LeftOutlined,
  DownloadOutlined,
  AuditOutlined,
  SendOutlined,
} from '@ant-design/icons-vue';
import PageWrapper from '../../components/PageWrapper.vue';
import { useAuthStore } from '../../stores/auth';
import {
  getPackageDetail,
  updateHistoryContent,
  submitAudit,
  approveHistory,
  rejectHistory,
  dispatchHistory,
  moveOutOfPackage,
} from '../../api/contentpro';
import { getUsers } from '../../api/user';

const route = useRoute();
const auth = useAuthStore();
const brandId = computed(() => auth.currentBrandId ?? 1);
const pkgId = computed(() => Number(route.params.id));

const pkg = ref({});
const items = ref([]);
const loading = ref(false);
const tab = ref('all');
const keyword = ref('');
const page = ref(1);
const pageSize = 20;
const total = ref(0);
const selected = ref([]);

const approvedSelected = computed(() => {
  const rows = items.value.filter((x) => selected.value.includes(x.id) && x.review_status === 'approved');
  return rows.map((r) => r.id);
});
const allChecked = computed(() => items.value.length > 0 && items.value.every((x) => selected.value.includes(x.id)));

const statusText = (item) => {
  if (item.claimed_by_id) return '已被领用';
  const m = { draft: '草稿', pending: '待审核', approved: '过审待领用', rejected: '被驳回' };
  return m[item.review_status] ?? item.review_status;
};
const statusClass = (item) => {
  if (item.claimed_by_id) return 'st-claimed';
  return { draft: 'st-draft', pending: 'st-pending', approved: 'st-approved', rejected: 'st-rejected' }[item.review_status] ?? 'st-draft';
};

const load = async () => {
  loading.value = true;
  try {
    const res = await getPackageDetail(pkgId.value, {
      brandId: brandId.value,
      tab: tab.value,
      keyword: keyword.value || undefined,
      page: String(page.value),
      pageSize: String(pageSize),
    });
    pkg.value = res ?? {};
    items.value = res.data?.items ?? [];
    total.value = res?.total ?? 0;
    selected.value = [];
  } finally {
    loading.value = false;
  }
};

const toggleSelect = (id) => {
  const i = selected.value.indexOf(id);
  if (i >= 0) selected.value.splice(i, 1);
  else selected.value.push(id);
};
const toggleAll = () => {
  selected.value = allChecked.value ? [] : items.value.map((x) => x.id);
};

const fmtTime = (t) => (t ? new Date(t).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');

// 编辑
const editOpen = ref(false);
const saving = ref(false);
const editForm = reactive({ id: null, title: '', content: '' });
const openEdit = (item) => {
  Object.assign(editForm, { id: item.id, title: item.title, content: item.content });
  editOpen.value = true;
};
const saveEdit = async () => {
  saving.value = true;
  try {
    await updateHistoryContent(editForm.id, { title: editForm.title, content: editForm.content }, { brandId: brandId.value });
    message.success('已保存');
    editOpen.value = false;
    load();
  } catch (e) {
    message.error(e?.response?.data?.msg ?? '保存失败');
  } finally {
    saving.value = false;
  }
};

// 审核动作
const act = async (fn, ids, tip) => {
  try {
    await fn;
    message.success(tip);
    load();
  } catch (e) {
    message.error(e?.response?.data?.msg ?? '操作失败');
  }
};
const doSubmit = (ids) => act(submitAudit(ids, { brandId: brandId.value }), ids, '已提交审核');
const doApprove = (ids) => act(approveHistory(ids, { brandId: brandId.value }), ids, '已通过');
const doMoveOut = (ids) => act(moveOutOfPackage(ids, { brandId: brandId.value }), ids, '已移出内容包');

const rejectOpen = ref(false);
const rejectReason = ref('');
const rejectIds = ref([]);
const openReject = (ids) => {
  rejectIds.value = ids;
  rejectReason.value = '';
  rejectOpen.value = true;
};
const confirmReject = () => act(rejectHistory(rejectIds.value, rejectReason.value || undefined, { brandId: brandId.value }), rejectIds.value, '已驳回');

// 分发
const dispatchOpen = ref(false);
const dispatchIds = ref([]);
const dispatchUser = ref(null);
const dispatching = ref(false);
const userOptions = ref([]);
const openDispatch = async (ids) => {
  dispatchIds.value = ids;
  dispatchUser.value = null;
  if (!userOptions.value.length) {
    const res = await getUsers();
    userOptions.value = (res ?? []).map((u) => ({ value: u.id, label: u.nickname ?? u.phone ?? `用户${u.id}` }));
  }
  dispatchOpen.value = true;
};
const confirmDispatch = async () => {
  if (!dispatchUser.value) return message.warning('请选择用户');
  dispatching.value = true;
  try {
    const res = await dispatchHistory(dispatchIds.value, dispatchUser.value, { brandId: brandId.value });
    message.success(`已分发给 ${res?.to ?? '用户'}`);
    dispatchOpen.value = false;
    load();
  } catch (e) {
    message.error(e?.response?.data?.msg ?? '分发失败');
  } finally {
    dispatching.value = false;
  }
};

// 导出
const exportCsv = () => {
  const rows = [['标题', '状态', '指派达人', '领用情况', '更新时间', '正文']];
  items.value.forEach((x) =>
    rows.push([
      x.title,
      statusText(x),
      x.dispatched_to_name ?? '',
      x.claimed_by_id ? '已被领用' : '待领用',
      fmtTime(x.upload_time),
      x.content,
    ]),
  );
  const csv = '\ufeff' + rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `内容包-${pkg.value.name || pkgId.value}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
};

onMounted(load);
</script>

<style scoped>
.pd-body { display: flex; flex-direction: column; gap: 10px; }
.pd-toolbar { display: flex; align-items: center; gap: 10px; }
.pd-spacer { flex: 1; }
.pd-pro {
  background: linear-gradient(90deg, #7c5cf0, #5087ec);
  color: #fff;
  border: none;
  font-size: 11px;
  font-weight: 700;
  border-radius: 4px;
  padding: 0 6px;
  line-height: 18px;
  margin: 0;
}
.pd-name { font-size: 15px; font-weight: 600; color: #1e293b; }
.pd-uid { font-size: 11px; color: #cbd5e1; font-family: monospace; }
.pd-filter { display: flex; align-items: center; gap: 10px; }
.pd-table-card { background: #fff; border-radius: 12px; padding: 6px 14px 12px; }
.pd-thead, .pd-row {
  display: grid;
  grid-template-columns: 36px minmax(220px, 1fr) 110px 130px 110px 150px 190px;
  gap: 8px;
  align-items: center;
  padding: 9px 4px;
}
.pd-thead { font-size: 12px; color: #94a3b8; background: #f8fafc; border-radius: 6px; padding: 8px 4px; }
.pd-row { border-bottom: 1px solid #f8fafc; font-size: 13px; }
.pd-row:hover { background: #fafcff; }
.pd-content { display: flex; align-items: center; gap: 10px; min-width: 0; }
.pd-thumb { width: 40px; height: 40px; border-radius: 6px; object-fit: cover; background: #f1f5f9; flex-shrink: 0; }
.pd-ct { min-width: 0; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.pd-title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #1e293b; max-width: 100%; }
.pd-form-tag { font-size: 11px; line-height: 16px; padding: 0 5px; margin: 0; border-radius: 4px; }
.pd-reject { font-size: 11px; color: #dc2626; }
.pd-muted { color: #94a3b8; font-size: 12px; }
.pd-status { font-size: 12px; padding: 2px 8px; border-radius: 999px; }
.st-draft { background: #f1f5f9; color: #64748b; }
.st-pending { background: #e6f7ff; color: #1677ff; }
.st-approved { background: #f0fdf4; color: #16a34a; }
.st-rejected { background: #fef2f2; color: #dc2626; }
.st-claimed { background: #eef4ff; color: #3456e6; }
.pd-ops { display: flex; gap: 10px; }
.pd-ops a { font-size: 12px; }
.pd-ops a.danger { color: #dc2626; }
.pd-page { padding-top: 10px; display: flex; justify-content: center; }
.edit-form { display: flex; flex-direction: column; gap: 12px; }
.ef-item { display: flex; flex-direction: column; gap: 6px; }
.ef-item label { font-size: 13px; color: #64748b; }
.move-tip { font-size: 13px; color: #334155; }

@media (max-width: 991px) {
  .pd-thead, .pd-row { grid-template-columns: 36px 1fr 90px 150px; }
  .pd-thead span:nth-child(4), .pd-row span:nth-child(4),
  .pd-thead span:nth-child(5), .pd-row span:nth-child(5),
  .pd-thead span:nth-child(6), .pd-row span:nth-child(6) { display: none; }
}
</style>
