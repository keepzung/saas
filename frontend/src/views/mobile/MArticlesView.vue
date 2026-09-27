<template>
  <div>
    <div v-for="h in list" :key="h.id" class="h-card">
      <div class="h-main">
        <div class="h-title">{{ h.title }}</div>
        <div class="h-content">{{ h.content }}</div>
        <div class="h-meta">{{ fmt(h.upload_time) }} · {{ (h.img_list ?? []).length }} 图</div>
      </div>
      <img v-if="h.img_list?.[0]" :src="h.img_list[0]" class="h-cover" />
    </div>
    <a-empty v-if="!list.length" description="暂无生成记录" style="margin-top: 80px" />
    <a-button type="primary" block style="margin-top: 16px" @click="$router.push('/m/aigc/create')">
      去创作
    </a-button>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useAuthStore } from '../../stores/auth';
import { getXhsHistory } from '../../api/contentpro';

const auth = useAuthStore();
const brandId = computed(() => auth.currentBrandId ?? 1);
const list = ref([]);

const fmt = (s) => (s ? new Date(s).toLocaleString('zh-CN', { hour12: false }).slice(0, 16) : '-');

onMounted(async () => {
  const res = await getXhsHistory({ brandId: brandId.value, page: 1, pageSize: 30 });
  list.value = res?.list ?? [];
});
</script>

<style scoped>
.h-card {
  display: flex;
  gap: 10px;
  background: #fff;
  border-radius: 12px;
  padding: 12px;
  margin-bottom: 10px;
}

.h-main {
  flex: 1;
  min-width: 0;
}

.h-title {
  font-weight: 600;
  color: #1e293b;
  font-size: 13.5px;
}

.h-content {
  margin-top: 4px;
  color: #94a3b8;
  font-size: 12px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.h-meta {
  margin-top: 6px;
  color: #cbd5e1;
  font-size: 11px;
}

.h-cover {
  width: 64px;
  height: 64px;
  border-radius: 8px;
  object-fit: cover;
  flex: 0 0 auto;
}
</style>
