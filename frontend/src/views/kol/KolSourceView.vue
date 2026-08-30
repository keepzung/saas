<template>
  <PageWrapper title="达人广场" :subtitle="`共 ${total} 位达人可筛选收藏`">
    <template #filters>
      <FilterTopbar>
        <a-input-search
          v-model:value="filters.keyword"
          placeholder="搜索昵称 / 机构 / 分类"
          style="width: 220px"
          allow-clear
          @search="reload"
        />
        <a-select
          v-model:value="filters.fansRange"
          :options="fansRangeOptions"
          style="width: 130px"
          allow-clear
          placeholder="粉丝量级"
          @change="reload"
        />
        <a-select
          v-model:value="filters.province"
          :options="provinceOptions"
          style="width: 120px"
          allow-clear
          placeholder="地区"
          show-search
          @change="reload"
        />
        <a-select
          v-model:value="sortBy"
          style="width: 180px"
          @change="reload"
        >
          <a-select-option value="fans">粉丝数 · 从高到低</a-select-option>
          <a-select-option value="daily_exposure_median">曝光中位数 · 从高到低</a-select-option>
          <a-select-option value="daily_read_median">阅读中位数 · 从高到低</a-select-option>
          <a-select-option value="picture_price">图文报价 · 从低到高</a-select-option>
          <a-select-option value="video_price">视频报价 · 从低到高</a-select-option>
        </a-select>
        <template #actions>
          <span class="total-text">共 {{ total }} 位达人</span>
        </template>
      </FilterTopbar>
    </template>

    <a-spin :spinning="loading">
      <div class="card-grid">
        <div v-for="a in authors" :key="a.author_id" class="author-card">
          <div class="card-header">
            <a-avatar :size="52" :src="a.avatar">
              {{ a.nickname.slice(0, 1) }}
            </a-avatar>
            <div class="author-base">
              <div class="author-name">
                {{ a.nickname }}
                <a-tag v-if="a.in_library" color="blue" class="lib-tag">已入库</a-tag>
              </div>
              <div class="author-meta">
                {{ a.location || '未知地区' }} · {{ a.gender || '-' }} ·
                {{ a.mcn || '独立达人' }}
              </div>
            </div>
          </div>

          <div class="stat-line">
            <div class="stat">
              <div class="stat-value">{{ fmtCount(a.fans) }}</div>
              <div class="stat-label">粉丝</div>
            </div>
            <div class="stat">
              <div class="stat-value">{{ fmtCount(a.exposure_median) }}</div>
              <div class="stat-label">曝光中位</div>
            </div>
            <div class="stat">
              <div class="stat-value">{{ fmtCount(a.interaction_median) }}</div>
              <div class="stat-label">互动中位</div>
            </div>
            <div class="stat">
              <div class="stat-value">{{ a.engagement_rate }}%</div>
              <div class="stat-label">互动率</div>
            </div>
          </div>

          <div class="price-line">
            <a-tag color="green">图文 ¥{{ fmtPrice(a.picturePrice) }}</a-tag>
            <a-tag color="geekblue">视频 ¥{{ fmtPrice(a.videoPrice) }}</a-tag>
            <a-tag>{{ a.category || '未分类' }}</a-tag>
          </div>

          <div class="card-footer">
            <span class="note-count">{{ a.note_count }} 篇笔记 · {{ a.note_sign || '-' }}</span>
            <a-button
              v-if="!a.in_library"
              type="primary"
              size="small"
              @click="collectOne(a)"
            >
              收藏入库
            </a-button>
            <a-button v-else size="small" disabled>已收藏</a-button>
          </div>
        </div>

        <a-empty
          v-if="!loading && authors.length === 0"
          description="没有符合条件的达人"
          style="grid-column: 1 / -1; margin: 60px auto"
        />
      </div>
    </a-spin>

    <div class="pager">
      <a-pagination
        v-model:current="page"
        :page-size="pageSize"
        :total="total"
        :show-total="(t) => `共 ${t} 位`"
        show-size-changer
        :page-size-options="['12', '24', '48']"
        @change="load"
      />
    </div>
  </PageWrapper>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { message } from 'ant-design-vue';
import PageWrapper from '../../components/PageWrapper.vue';
import FilterTopbar from '../../components/FilterTopbar.vue';
import { collectAuthors, getAuthors, getRegionTree } from '../../api/kol';

const filters = reactive({
  keyword: '',
  fansRange: null,
  province: null,
});
const sortBy = ref('fans');
const page = ref(1);
const pageSize = ref(12);
const total = ref(0);
const authors = ref([]);
const loading = ref(false);
const provinces = ref([]);

const fansRangeOptions = [
  { label: '10万以下', value: '0-100000' },
  { label: '10-50万', value: '100000-500000' },
  { label: '50-100万', value: '500000-1000000' },
  { label: '100万以上', value: '1000000-' },
];

const provinceOptions = computed(() =>
  provinces.value.map((p) => ({ label: p.provinceName, value: p.provinceName })),
);

const fmtCount = (n) => {
  if (n == null) return '-';
  if (n >= 10000) return `${(n / 10000).toFixed(1)}w`;
  return String(n);
};
const fmtPrice = (p) =>
  p == null ? '-' : Number(p).toLocaleString('zh-CN');

async function load() {
  loading.value = true;
  try {
    const body = {
      currentPage: page.value,
      pageSize: pageSize.value,
      sortBy: sortBy.value,
    };
    if (filters.keyword) body.keyword = filters.keyword;
    if (filters.fansRange) {
      const [min, max] = filters.fansRange.split('-');
      body.fansMin = Number(min);
      if (max) body.fansMax = Number(max);
    }
    if (filters.province) body.province = filters.province;
    if (sortBy.value === 'picture_price' || sortBy.value === 'video_price') {
      body.sortOrder = 'asc';
    }
    const data = await getAuthors(body);
    authors.value = data.list ?? [];
    total.value = data.total ?? 0;
  } catch (e) {
    message.error(e.message || '加载达人广场失败');
  } finally {
    loading.value = false;
  }
}

function reload() {
  page.value = 1;
  load();
}

async function collectOne(a) {
  try {
    const res = await collectAuthors([a.author_id]);
    if (res.added > 0) {
      message.success(`「${a.nickname}」已收藏入库`);
      a.in_library = true;
    } else {
      message.info('该达人已在库中');
    }
  } catch (e) {
    message.error(e.message || '收藏失败');
  }
}

onMounted(async () => {
  const tree = await getRegionTree();
  provinces.value = tree ?? [];
  load();
});
</script>

<style scoped>
.total-text {
  color: var(--color-text-secondary);
  font-size: 13px;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
  gap: 16px;
}

.author-card {
  background: var(--color-bg-container);
  border-radius: 16px;
  padding: 18px;
  border: 1px solid var(--color-border-secondary);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  transition: box-shadow 0.2s;
}

.author-card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
}

.card-header {
  display: flex;
  gap: 12px;
  margin-bottom: 14px;
}

.author-base {
  min-width: 0;
}

.author-name {
  font-weight: 600;
  font-size: 15px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.lib-tag {
  font-size: 11px;
  line-height: 16px;
  padding: 0 4px;
}

.author-meta {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-top: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stat-line {
  display: flex;
  justify-content: space-between;
  background: var(--color-bg-layout);
  border-radius: 6px;
  padding: 10px 14px;
  margin-bottom: 12px;
}

.stat {
  text-align: center;
}

.stat-value {
  font-weight: 600;
  font-size: 14px;
}

.stat-label {
  font-size: 11px;
  color: var(--color-text-tertiary);
}

.price-line {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.note-count {
  font-size: 12px;
  color: var(--color-text-tertiary);
}

.pager {
  display: flex;
  justify-content: flex-end;
}
</style>
