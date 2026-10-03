<template>
  <PageWrapper title="内容审核" subtitle="跨内容包的待审核内容统一处理">
    <div class="au-body">
      <div class="au-toolbar">
        <a-select
          v-model:value="packageFilter"
          size="small"
          style="width: 220px"
          :options="packageOptions"
          placeholder="全部内容包"
          allow-clear
          @change="load"
        />
        <a-input-search v-model:value="keyword" placeholder="搜索标题" style="width: 220px" size="small" allow-clear @search="load" />
        <div class="au-spacer" />
        <a-button size="small" type="primary" :disabled="!selected.length" :loading="acting" @click="doApprove">
          <CheckOutlined /> 批量通过 ({{ selected.length }})
        </a-button>
        <a-button size="small" danger :disabled="!selected.length" @click="openReject(selected)">
          <CloseOutlined /> 批量驳回
        </a-button>
      </div>

      <div class="au-card">
        <div class="au-thead">
          <span style="width: 36px"><a-checkbox :checked="allChecked" @change="toggleAll" /></span>
          <span style="flex: 1">内容</span>
          <span style="width: 180px">所属内容包</span>
          <span style="width: 150px">提交时间</span>
          <span style="width: 120px">操作</span>
        </div>
        <a-spin :spinning="loading">
          <div v-for="item in list" :key="item.id" class="au-row">
            <span style="width: 36px"><a-checkbox :checked="selected.includes(item.id)" @change="toggleSelect(item.id)" /></span>
            <span style="flex: 1" class="au-content">
              <img :src="item.img_list?.[0] ?? item.cover_url" class="au-thumb" @error="$event.target.style.visibility = 'hidden'" />
              <div class="au-ct">
                <div class="au-title">{{ item.title }}</div>
                <div class="au-brief">{{ item.content?.slice(0, 60) }}…</div>
              </div>
            </span>
            <span style="width: 180px" class="au-pkg"><FolderOutlined /> {{ item.package_name ?? '-' }}</span>
            <span style="width: 150px" class="au-muted">{{ fmtTime(item.upload_time) }}</span>
            <span style="width: 120px" class="au-ops">
              <a @click="preview = item">查看</a>
              <a class="ok" @click="doApprove([item.id])">通过</a>
              <a class="danger" @click="openReject([item.id])">驳回</a>
            </span>
          </div>
          <a-empty v-if="!list.length && !loading" :image="Empty.PRESENTED_IMAGE_SIMPLE" description="暂无待审核内容" />
        </a-spin>
        <div class="au-page" v-if="total > pageSize">
          <a-pagination v-model:current="page" size="small" :total="total" :page-size="pageSize" :show-size-changer="false" @change="load" />
        </div>
      </div>
    </div>

    <!-- 预览 -->
    <a-modal :open="!!preview" title="内容预览" width="680px" :footer="null" @cancel="preview = null">
      <template v-if="preview">
        <div class="pv-title">{{ preview.title }}</div>
        <div class="pv-imgs"><img v-for="(img, i) in preview.img_list ?? []" :key="i" :src="img" /></div>
        <div class="pv-content">{{ preview.content }}</div>
        <div class="pv-tags"><span v-for="t in preview.tags ?? []" :key="t">#{{ t }}</span></div>
      </template>
    </a-modal>

    <!-- 驳回 -->
    <a-modal v-model:open="rejectOpen" title="驳回内容" width="480px" @ok="confirmReject">
      <div class="ef-item" style="margin-top: 6px">
        <label>驳回原因</label>
        <a-textarea v-model:value="rejectReason" :rows="3" :maxlength="200" placeholder="例如：卖点不突出 / 标题党 / 与产品无关" />
      </div>
    </a-modal>
  </PageWrapper>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { message, Empty } from 'ant-design-vue';
import { CheckOutlined, CloseOutlined, FolderOutlined } from '@ant-design/icons-vue';
import PageWrapper from '../../components/PageWrapper.vue';
import { useAuthStore } from '../../stores/auth';
import { getAuditList, approveHistory, rejectHistory, getPackagesPro } from '../../api/contentpro';

const route = useRoute();
const auth = useAuthStore();
const brandId = computed(() => auth.currentBrandId ?? 1);

const list = ref([]);
const loading = ref(false);
const keyword = ref('');
const packageFilter = ref(route.query.packageId ? String(route.query.packageId) : null);
const packageOptions = ref([]);
const page = ref(1);
const pageSize = 20;
const total = ref(0);
const selected = ref([]);
const acting = ref(false);
const preview = ref(null);

const allChecked = computed(() => list.value.length > 0 && list.value.every((x) => selected.value.includes(x.id)));

const load = async () => {
  loading.value = true;
  try {
    const res = await getAuditList({
      brandId: brandId.value,
      packageId: packageFilter.value || undefined,
      keyword: keyword.value || undefined,
      page: String(page.value),
      pageSize: String(pageSize),
    });
    list.value = res?.list ?? [];
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
  selected.value = allChecked.value ? [] : list.value.map((x) => x.id);
};

const fmtTime = (t) => (t ? new Date(t).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');

const doApprove = async (ids) => {
  acting.value = true;
  try {
    const res = await approveHistory(ids, { brandId: brandId.value });
    message.success(`已通过 ${res?.approved ?? 0} 篇`);
    load();
  } catch (e) {
    message.error(e?.response?.data?.msg ?? '操作失败');
  } finally {
    acting.value = false;
  }
};

const rejectOpen = ref(false);
const rejectReason = ref('');
const rejectIds = ref([]);
const openReject = (ids) => {
  rejectIds.value = ids;
  rejectReason.value = '';
  rejectOpen.value = true;
};
const confirmReject = async () => {
  try {
    const res = await rejectHistory(rejectIds.value, rejectReason.value || undefined, { brandId: brandId.value });
    message.success(`已驳回 ${res?.rejected ?? 0} 篇`);
    rejectOpen.value = false;
    load();
  } catch (e) {
    message.error(e?.response?.data?.msg ?? '操作失败');
  }
};

onMounted(async () => {
  load();
  const res = await getPackagesPro({ brandId: brandId.value });
  packageOptions.value = (res?.list ?? []).map((p) => ({ value: String(p.id), label: p.name }));
});
</script>

<style scoped>
.au-body { display: flex; flex-direction: column; gap: 10px; }
.au-toolbar { display: flex; align-items: center; gap: 10px; }
.au-spacer { flex: 1; }
.au-card { background: #fff; border-radius: 12px; padding: 6px 14px 12px; }
.au-thead, .au-row {
  display: grid;
  grid-template-columns: 36px minmax(240px, 1fr) 180px 150px 120px;
  gap: 8px;
  align-items: center;
  padding: 9px 4px;
}
.au-thead { font-size: 12px; color: #94a3b8; background: #f8fafc; border-radius: 6px; padding: 8px 4px; }
.au-row { border-bottom: 1px solid #f8fafc; }
.au-row:hover { background: #fafcff; }
.au-content { display: flex; align-items: center; gap: 10px; min-width: 0; }
.au-thumb { width: 40px; height: 40px; border-radius: 6px; object-fit: cover; background: #f1f5f9; flex-shrink: 0; }
.au-ct { min-width: 0; }
.au-title { font-size: 13px; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.au-brief { font-size: 12px; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.au-pkg { font-size: 12px; color: #475569; display: flex; align-items: center; gap: 6px; }
.au-muted { color: #94a3b8; font-size: 12px; }
.au-ops { display: flex; gap: 10px; }
.au-ops a { font-size: 12px; }
.au-ops a.ok { color: #16a34a; }
.au-ops a.danger { color: #dc2626; }
.au-page { padding-top: 10px; display: flex; justify-content: center; }
.pv-title { font-size: 16px; font-weight: 700; color: #1e293b; }
.pv-imgs { display: flex; gap: 8px; margin: 12px 0; flex-wrap: wrap; }
.pv-imgs img { width: 100px; height: 133px; object-fit: cover; border-radius: 8px; background: #f1f5f9; }
.pv-content { white-space: pre-wrap; font-size: 13px; color: #334155; line-height: 1.8; }
.pv-tags { margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap; }
.pv-tags span { color: #3456e6; font-size: 13px; }
.ef-item { display: flex; flex-direction: column; gap: 6px; }
.ef-item label { font-size: 13px; color: #64748b; }

@media (max-width: 991px) {
  .au-thead, .au-row { grid-template-columns: 36px 1fr 120px; }
  .au-thead span:nth-child(4), .au-row span:nth-child(4),
  .au-thead span:nth-child(5), .au-row span:nth-child(5) { display: none; }
}
</style>
