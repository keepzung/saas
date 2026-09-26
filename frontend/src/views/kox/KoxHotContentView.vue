<template>
  <PageWrapper title="热门内容" subtitle="高热度笔记卡片墙">
    <template #extra>
      <a-radio-group v-model:value="quick" size="small" @change="onQuickChange">
        <a-radio-button value="7">近7天</a-radio-button>
        <a-radio-button value="30">近30天</a-radio-button>
      </a-radio-group>
      <a-range-picker v-model:value="range" size="small" @change="reload" />
      <a-select
        v-model:value="regionName"
        size="small"
        style="width: 120px"
        allow-clear
        placeholder="大区"
        :options="regionOptions"
        @change="reload"
      />
      <a-select
        v-model:value="accountTag"
        size="small"
        style="width: 130px"
        allow-clear
        placeholder="账号标签"
        :options="tagOptions"
        @change="reload"
      />
      <a-select
        v-model:value="metric"
        size="small"
        style="width: 110px"
        :options="[
          { label: '按阅读', value: 'views' },
          { label: '按点赞', value: 'likes' },
          { label: '按互动', value: 'comments' },
        ]"
        @change="reload"
      />
      <a-input-search
        v-model:value="keyword"
        size="small"
        style="width: 170px"
        placeholder="标题关键字"
        allow-clear
        @search="reload"
      />
    </template>

    <a-spin :spinning="loading">
      <div class="wall">
        <div v-for="n in list" :key="n.id" class="card" @click="openNote(n)">
          <div class="cover">
            <img v-if="n.cover_url" :src="n.cover_url" loading="lazy" />
            <div v-else class="cover-ph">{{ (n.title || '#').slice(0, 1) }}</div>
            <span v-if="n.is_rtb_adver === true" class="promo-tag">投流</span>
          </div>
          <div class="title" :title="n.title">{{ n.title }}</div>
          <div class="author">@{{ n.author_name }}</div>
          <div class="stats">
            <span>♡ {{ fmt(n.likes) }}</span>
            <span>💬 {{ fmt(n.comments) }}</span>
            <span>⭐ {{ fmt(n.collects) }}</span>
            <span>🔗 {{ fmt(n.shares) }}</span>
          </div>
        </div>
      </div>
      <a-empty v-if="!list.length && !loading" description="暂无内容" />
      <div class="more" v-if="list.length < total">
        <a-button :loading="loading" @click="loadMore">加载更多（已加载 {{ list.length }}/{{ total }}）</a-button>
      </div>
    </a-spin>
  </PageWrapper>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { message } from 'ant-design-vue';
import dayjs from 'dayjs';
import PageWrapper from '../../components/PageWrapper.vue';
import { getKoxAccounts, getKoxNotes } from '../../api/kox';
import { useAuthStore } from '../../stores/auth';

const auth = useAuthStore();
const PAGE_SIZE = 30;

const quick = ref('30');
const range = ref([dayjs().subtract(29, 'day'), dayjs()]);
const regionName = ref(undefined);
const accountTag = ref(undefined);
const metric = ref('views');
const keyword = ref('');
const regionOptions = ref([]);
const tagOptions = ref([]);
const loading = ref(false);
const list = ref([]);
const total = ref(0);
const page = ref(1);

const fmt = (n) => (n ?? 0).toLocaleString();

function params() {
  const p = { brandId: auth.currentBrandId ?? undefined, metric: metric.value, page_size: PAGE_SIZE };
  if (range.value?.[0]) {
    p.start = range.value[0].format('YYYY-MM-DD');
    p.end = range.value[1].format('YYYY-MM-DD');
  }
  if (regionName.value) p.regionName = regionName.value;
  if (accountTag.value) p.accountTag = accountTag.value;
  if (keyword.value.trim()) p.keyword = keyword.value.trim();
  return p;
}

async function reload() {
  page.value = 1;
  loading.value = true;
  try {
    const res = await getKoxNotes({ ...params(), page: 1 });
    list.value = res.list ?? [];
    total.value = res.total ?? 0;
  } catch (e) {
    message.error(e.message || '加载热门内容失败');
  } finally {
    loading.value = false;
  }
}

async function loadMore() {
  loading.value = true;
  try {
    page.value += 1;
    const res = await getKoxNotes({ ...params(), page: page.value });
    list.value = [...list.value, ...(res.list ?? [])];
  } catch (e) {
    page.value -= 1;
    message.error(e.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

async function loadFacets() {
  try {
    const res = await getKoxAccounts({ brandId: auth.currentBrandId, page_size: 1 });
    regionOptions.value = (res.region_facets ?? []).map((r) => ({ label: r, value: r }));
    tagOptions.value = (res.tag_facets ?? []).map((t) => ({ label: t, value: t }));
  } catch {
    /* 忽略 */
  }
}

function onQuickChange() {
  const days = Number(quick.value);
  range.value = [dayjs().subtract(days - 1, 'day'), dayjs()];
  reload();
}

function openNote(n) {
  if (n.note_url) window.open(n.note_url, '_blank');
  else message.info('该笔记无链接');
}

onMounted(() => {
  loadFacets();
  reload();
});
</script>

<style scoped>
.wall {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 14px;
}

@media (max-width: 1500px) {
  .wall {
    grid-template-columns: repeat(4, 1fr);
  }
}

.card {
  border: 1px solid #f1f5f9;
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  background: #fff;
  transition: transform 0.15s, box-shadow 0.2s;
}

.card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.12);
}

.cover {
  position: relative;
  aspect-ratio: 3 / 4;
  background: #f1f5f9;
}

.cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.cover-ph {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 40px;
  color: #cbd5e1;
  font-weight: 700;
}

.promo-tag {
  position: absolute;
  top: 8px;
  right: 8px;
  background: rgba(220, 38, 38, 0.9);
  color: #fff;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
}

.title {
  padding: 8px 10px 2px;
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 36px;
}

.author {
  padding: 0 10px;
  font-size: 12px;
  color: #94a3b8;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stats {
  display: flex;
  gap: 8px;
  padding: 6px 10px 10px;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.more {
  text-align: center;
  padding: 16px 0 4px;
}
</style>
