<template>
  <PageWrapper title="历史记录">
    <FilterTopbar>
      <a-input-search
        v-model:value="keyword"
        style="width: 240px"
        placeholder="搜索笔记标题"
        allow-clear
        @search="load"
      />
    </FilterTopbar>
    <div class="his-body">
      <a-spin :spinning="loading">
        <div v-for="h in list" :key="h.id" class="his-card">
          <img v-if="h.img_list?.length" :src="h.img_list[0]" class="his-cover" />
          <div v-else class="his-cover placeholder">无图</div>
          <div class="his-main">
            <div class="his-title">{{ h.title }}</div>
            <div class="his-content">{{ h.content }}</div>
            <div class="his-meta">
              <a-tag v-for="t in (h.tags ?? []).slice(0, 4)" :key="t" class="his-tag">#{{ t }}</a-tag>
              <span class="his-time">{{ fmtTime(h.upload_time) }}</span>
              <span class="his-src">{{ h.source === 'ai' ? 'AI 生成' : '模板生成' }}</span>
            </div>
          </div>
          <div class="his-ops">
            <a-button size="small" @click="view(h)">全文</a-button>
            <a-button size="small" @click="copy(h)"><CopyOutlined /> 复制</a-button>
            <a-button size="small" danger @click="remove(h)"><DeleteOutlined /> 删除</a-button>
          </div>
        </div>
        <a-empty v-if="!list.length && !loading" description="暂无历史记录，去「小红书图文」生成第一篇吧" />
      </a-spin>
      <div class="his-footer">
        <a-pagination
          v-model:current="page"
          :total="total"
          :page-size="pageSize"
          @change="load"
        />
      </div>
    </div>

    <a-modal v-model:open="viewOpen" :title="viewing?.title" :footer="null" width="640px">
      <div class="view-tags">
        <a-tag v-for="t in viewing?.tags ?? []" :key="t" class="his-tag">#{{ t }}</a-tag>
      </div>
      <div class="view-content">{{ viewing?.content }}</div>
      <div class="view-imgs">
        <img v-for="(u, i) in viewing?.img_list ?? []" :key="i" :src="u" />
      </div>
    </a-modal>
  </PageWrapper>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { message, Modal } from 'ant-design-vue';
import { CopyOutlined, DeleteOutlined } from '@ant-design/icons-vue';
import PageWrapper from '../../components/PageWrapper.vue';
import FilterTopbar from '../../components/FilterTopbar.vue';
import { useAuthStore } from '../../stores/auth';
import { getXhsHistory, deleteXhsHistory } from '../../api/contentpro';

const auth = useAuthStore();
const brandId = computed(() => auth.currentBrandId ?? 1);

const list = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const loading = ref(false);
const keyword = ref('');
const viewOpen = ref(false);
const viewing = ref(null);

const load = async () => {
  loading.value = true;
  try {
    const res = await getXhsHistory({
      brandId: brandId.value,
      page: page.value,
      pageSize: pageSize.value,
      keyword: keyword.value || undefined,
    });
    list.value = res?.list ?? [];
    total.value = res?.total ?? 0;
  } finally {
    loading.value = false;
  }
};

const view = (h) => {
  viewing.value = h;
  viewOpen.value = true;
};

const copy = async (h) => {
  await navigator.clipboard.writeText(`${h.title}\n\n${h.content}\n\n${(h.tags ?? []).map((t) => `#${t}`).join(' ')}`);
  message.success('已复制');
};

const remove = (h) => {
  Modal.confirm({
    title: `删除「${h.title}」？`,
    okType: 'danger',
    onOk: async () => {
      await deleteXhsHistory(h.id);
      message.success('已删除');
      await load();
    },
  });
};

const fmtTime = (s) => (s ? new Date(s).toLocaleString('zh-CN', { hour12: false }).slice(0, 16) : '-');

onMounted(load);
</script>

<style scoped>
.his-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 14px 20px;
  background: #fff;
  margin: 0 20px 16px;
  border-radius: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.his-card {
  display: flex;
  gap: 14px;
  padding: 14px 0;
  border-bottom: 1px solid #f1f5f9;
}

.his-cover {
  width: 88px;
  height: 88px;
  border-radius: 10px;
  object-fit: cover;
  flex: 0 0 auto;
}

.his-cover.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f1f5f9;
  color: #94a3b8;
  font-size: 12px;
}

.his-main {
  flex: 1;
  min-width: 0;
}

.his-title {
  font-weight: 600;
  color: #1e293b;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.his-content {
  margin-top: 4px;
  color: #64748b;
  font-size: 12.5px;
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.his-meta {
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.his-tag {
  background: #eef4ff;
  border: none;
  color: #3456e6;
  font-size: 11.5px;
}

.his-time,
.his-src {
  color: #94a3b8;
  font-size: 12px;
}

.his-ops {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 0 0 auto;
}

.his-footer {
  display: flex;
  justify-content: center;
  padding: 14px 0 6px;
}

.view-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
}

.view-content {
  white-space: pre-wrap;
  color: #334155;
  line-height: 1.8;
  font-size: 13.5px;
  max-height: 50vh;
  overflow: auto;
}

.view-imgs {
  margin-top: 14px;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.view-imgs img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 8px;
}
</style>
