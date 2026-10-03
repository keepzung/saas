<template>
  <PageWrapper title="领用记录" subtitle="KOS 领用/分发内容的完整流水">
    <div class="cl-body">
      <div class="cl-toolbar">
        <a-select
          v-model:value="packageFilter"
          size="small"
          style="width: 220px"
          :options="packageOptions"
          placeholder="全部内容包"
          allow-clear
          @change="load"
        />
        <div class="cl-spacer" />
        <a-button size="small" @click="exportCsv"><DownloadOutlined /> 导出</a-button>
      </div>

      <div class="cl-card">
        <div class="cl-thead">
          <span style="flex: 1">内容</span>
          <span style="width: 200px">内容包</span>
          <span style="width: 140px">领用人</span>
          <span style="width: 90px">来源</span>
          <span style="width: 90px">发布</span>
          <span style="width: 150px">领用时间</span>
        </div>
        <a-spin :spinning="loading">
          <div v-for="row in list" :key="row.id" class="cl-row">
            <span style="flex: 1" class="cl-content">
              <img :src="row.cover_url" class="cl-thumb" @error="$event.target.style.visibility = 'hidden'" />
              <span class="cl-title">{{ row.title }}</span>
            </span>
            <span style="width: 200px" class="cl-pkg"><FolderOutlined /> {{ row.package_name }}</span>
            <span style="width: 140px">{{ row.user_name }}</span>
            <span style="width: 90px">
              <a-tag :color="row.source === 'dispatch' ? 'purple' : row.source === 'h5' ? 'blue' : 'default'" class="cl-src">
                {{ { h5: '手机领用', dispatch: '分发', pc: 'PC领用' }[row.source] ?? row.source }}
              </a-tag>
            </span>
            <span style="width: 90px">
              <a-tag :color="row.published ? 'green' : 'default'">{{ row.published ? '已发布' : '未发布' }}</a-tag>
            </span>
            <span style="width: 150px" class="cl-muted">{{ fmtTime(row.claimed_at) }}</span>
          </div>
          <a-empty v-if="!list.length && !loading" :image="Empty.PRESENTED_IMAGE_SIMPLE" description="暂无领用记录" />
        </a-spin>
        <div class="cl-page" v-if="total > pageSize">
          <a-pagination v-model:current="page" size="small" :total="total" :page-size="pageSize" :show-size-changer="false" @change="load" />
        </div>
      </div>
    </div>
  </PageWrapper>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { message, Empty } from 'ant-design-vue';
import { DownloadOutlined, FolderOutlined } from '@ant-design/icons-vue';
import PageWrapper from '../../components/PageWrapper.vue';
import { useAuthStore } from '../../stores/auth';
import { getClaimLog, getPackagesPro } from '../../api/contentpro';

const auth = useAuthStore();
const brandId = computed(() => auth.currentBrandId ?? 1);

const list = ref([]);
const loading = ref(false);
const packageFilter = ref(null);
const packageOptions = ref([]);
const page = ref(1);
const pageSize = 20;
const total = ref(0);

const load = async () => {
  loading.value = true;
  try {
    const res = await getClaimLog({
      brandId: brandId.value,
      packageId: packageFilter.value || undefined,
      page: String(page.value),
      pageSize: String(pageSize),
    });
    list.value = res?.list ?? [];
    total.value = res?.total ?? 0;
  } finally {
    loading.value = false;
  }
};

const fmtTime = (t) => (t ? new Date(t).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');

const exportCsv = () => {
  const rows = [['内容标题', '内容包', '领用人', '来源', '是否发布', '领用时间']];
  list.value.forEach((r) =>
    rows.push([r.title, r.package_name, r.user_name, r.source, r.published ? '已发布' : '未发布', fmtTime(r.claimed_at)]),
  );
  const csv = '\ufeff' + rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '领用记录.csv';
  a.click();
  URL.revokeObjectURL(a.href);
  message.success('已导出当前页');
};

onMounted(async () => {
  load();
  const res = await getPackagesPro({ brandId: brandId.value });
  packageOptions.value = (res?.list ?? []).map((p) => ({ value: String(p.id), label: p.name }));
});
</script>

<style scoped>
.cl-body { display: flex; flex-direction: column; gap: 10px; }
.cl-toolbar { display: flex; align-items: center; gap: 10px; }
.cl-spacer { flex: 1; }
.cl-card { background: #fff; border-radius: 12px; padding: 6px 14px 12px; }
.cl-thead, .cl-row {
  display: grid;
  grid-template-columns: minmax(240px, 1fr) 200px 140px 90px 90px 150px;
  gap: 8px;
  align-items: center;
  padding: 9px 4px;
}
.cl-thead { font-size: 12px; color: #94a3b8; background: #f8fafc; border-radius: 6px; padding: 8px 4px; }
.cl-row { border-bottom: 1px solid #f8fafc; font-size: 13px; }
.cl-row:hover { background: #fafcff; }
.cl-content { display: flex; align-items: center; gap: 10px; min-width: 0; }
.cl-thumb { width: 40px; height: 40px; border-radius: 6px; object-fit: cover; background: #f1f5f9; flex-shrink: 0; }
.cl-title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #1e293b; }
.cl-pkg { font-size: 12px; color: #475569; display: flex; align-items: center; gap: 6px; }
.cl-src { margin: 0; }
.cl-muted { color: #94a3b8; font-size: 12px; }
.cl-page { padding-top: 10px; display: flex; justify-content: center; }

@media (max-width: 991px) {
  .cl-thead, .cl-row { grid-template-columns: 1fr 140px 90px; }
  .cl-thead span:nth-child(4), .cl-row span:nth-child(4),
  .cl-thead span:nth-child(5), .cl-row span:nth-child(5),
  .cl-thead span:nth-child(6), .cl-row span:nth-child(6) { display: none; }
}
</style>
