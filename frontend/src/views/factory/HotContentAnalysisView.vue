<template>
  <PageWrapper title="热门内容分析" subtitle="基于小红书笔记真实数据 · 爆文榜 / 词云 / 类型效率">
    <div class="hc-page">
      <div class="hc-toolbar">
        <a-radio-group v-model:value="range" button-style="solid" size="small" @change="load">
          <a-radio-button value="7">近7天</a-radio-button>
          <a-radio-button value="30">近30天</a-radio-button>
          <a-radio-button value="all">全部</a-radio-button>
        </a-radio-group>
        <a-select
          v-model:value="metric"
          size="small"
          style="width: 130px"
          :options="METRIC_OPTIONS"
          @change="load"
        />
        <a-input-search v-model:value="keyword" placeholder="搜索标题" style="width: 220px" size="small" allow-clear @search="load" />
        <div class="hc-spacer" />
        <span class="hc-total">共 {{ total }} 篇笔记</span>
      </div>

      <!-- 汇总 -->
      <div class="hc-stats">
        <div v-for="s in statCards" :key="s.label" class="hc-stat">
          <b>{{ s.value }}</b><span>{{ s.label }}</span>
        </div>
      </div>

      <div class="hc-two-col">
        <!-- 词云 -->
        <div class="hc-card">
          <div class="hcc-title">关键词词云</div>
          <div class="word-cloud">
            <span
              v-for="w in keywords"
              :key="w.text"
              class="wc-item"
              :class="wcClass(w.count)"
              :style="{ fontSize: wcSize(w.count) + 'px' }"
              @click="searchWord(w.text)"
            >{{ w.text }}</span>
            <div v-if="!keywords.length" class="hc-empty-mini">暂无关键词</div>
          </div>
        </div>
        <!-- 类型效率 -->
        <div class="hc-card">
          <div class="hcc-title">内容类型效率（互动量）</div>
          <div class="cat-bars">
            <div v-for="c in typeEfficiency" :key="c.category" class="cat-row">
              <span class="cat-name">{{ c.category }}</span>
              <div class="cat-bar-bg">
                <div class="cat-bar" :style="{ width: catPct(c.inter) }" />
              </div>
              <span class="cat-val">{{ fmtNum(c.inter) }}</span>
            </div>
            <div v-if="!typeEfficiency.length" class="hc-empty-mini">暂无分类数据</div>
          </div>
        </div>
      </div>

      <!-- 爆文榜 -->
      <div class="hc-card">
        <div class="hcc-title">爆文榜 <span class="hcc-sub">按{{ metricLabel }}排序</span></div>
        <div class="hot-grid">
          <a
            v-for="(n, i) in notes"
            :key="n.id"
            class="hot-card"
            :href="n.note_url"
            target="_blank"
            rel="noopener"
            @click="!n.note_url && $event.preventDefault()"
          >
            <div class="hot-cover-wrap">
              <img
                v-if="n.cover_url && !coverFailed[n.id]"
                :src="n.cover_url"
                referrerpolicy="no-referrer"
                @error="coverFailed[n.id] = true"
              />
              <div v-else class="hot-tile">{{ (n.title ?? '内').charAt(0) }}</div>
              <span class="hot-rank" :class="{ top: i < 3 }">{{ i + 1 }}</span>
            </div>
            <div class="hot-title">{{ n.title }}</div>
            <div class="hot-author">@{{ n.author_name }}</div>
            <div class="hot-metrics">
              <span>👁 {{ fmtNum(n.exposure) }}</span>
              <span>📖 {{ fmtNum(n.views) }}</span>
              <span>❤️ {{ fmtNum(n.likes) }}</span>
              <span>💬 {{ fmtNum(n.comments) }}</span>
            </div>
          </a>
        </div>
        <div class="hc-more" v-if="notes.length < total">
          <a-button size="small" :loading="loading" @click="loadMore">加载更多</a-button>
        </div>
        <a-empty v-if="!notes.length && !loading" :image="Empty.PRESENTED_IMAGE_SIMPLE" description="暂无笔记数据" />
      </div>
    </div>
  </PageWrapper>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { Empty } from 'ant-design-vue';
import PageWrapper from '../../components/PageWrapper.vue';
import { useAuthStore } from '../../stores/auth';
import { getKoxNotes, getKoxNotesSummary } from '../../api/kox';

const METRIC_OPTIONS = [
  { value: 'views', label: '按阅读量' },
  { value: 'exposure', label: '按曝光量' },
  { value: 'likes', label: '按点赞' },
  { value: 'comments', label: '按评论' },
  { value: 'collects', label: '按收藏' },
  { value: 'pmLeads', label: '按私信留资' },
];

const auth = useAuthStore();
const brandId = computed(() => auth.currentBrandId ?? 7);

const range = ref('30');
const metric = ref('views');
const keyword = ref('');
const loading = ref(false);
const notes = ref([]);
const total = ref(0);
const page = ref(1);
const summary = ref(null);
const coverFailed = reactive({});

const dateRange = () => {
  if (range.value === 'all') return {};
  const days = Number(range.value);
  const fmt = (d) => d.toISOString().slice(0, 10);
  const end = new Date();
  const start = new Date(end.getTime() - (days - 1) * 86400000);
  return { start: fmt(start), end: fmt(end) };
};

const statCards = computed(() => {
  const t = summary.value?.totals;
  if (!t) return [];
  return [
    { label: '笔记数', value: fmtNum(t.note_cnt) },
    { label: '总曝光', value: fmtNum(t.exposure_sum) },
    { label: '总阅读', value: fmtNum(t.view_sum) },
    { label: '总互动', value: fmtNum(t.interaction_sum) },
    { label: '涨粉', value: fmtNum(t.follow_sum) },
    { label: '私信进线', value: fmtNum(t.pm_inquiries_sum) },
    { label: '私信留资', value: fmtNum(t.pm_leads_sum) },
  ];
});

const keywords = computed(() => summary.value?.keywords ?? []);
const typeEfficiency = computed(() => summary.value?.type_efficiency ?? []);
const maxCat = computed(() => Math.max(1, ...typeEfficiency.value.map((c) => c.inter)));
const metricLabel = computed(() => METRIC_OPTIONS.find((m) => m.value === metric.value)?.label?.replace('按', '') ?? '阅读');

const wcSize = (count) => {
  const max = Math.max(1, ...keywords.value.map((w) => w.count));
  return Math.max(12, Math.round(12 + (count / max) * 16));
};
const wcClass = (count) => {
  const max = Math.max(1, ...keywords.value.map((w) => w.count));
  if (count >= max * 0.66) return 'w1';
  if (count >= max * 0.33) return 'w2';
  return 'w3';
};
const catPct = (v) => `${Math.round((v / maxCat.value) * 100)}%`;
const searchWord = (w) => {
  keyword.value = w;
  load();
};

const fmtNum = (n) => {
  const v = Number(n ?? 0);
  if (v >= 10000) return `${(v / 10000).toFixed(1)}万`;
  return v.toLocaleString();
};

const query = (extra = {}) => ({
  brandId: brandId.value,
  metric: metric.value,
  keyword: keyword.value || undefined,
  ...dateRange(),
  ...extra,
});

const load = async () => {
  loading.value = true;
  page.value = 1;
  try {
    const [list, sum] = await Promise.all([
      getKoxNotes(query({ page: 1, page_size: 24 })),
      getKoxNotesSummary(query()).catch(() => null),
    ]);
    notes.value = list?.list ?? [];
    total.value = list?.total ?? 0;
    summary.value = sum?.data ?? sum ?? null;
  } finally {
    loading.value = false;
  }
};

const loadMore = async () => {
  loading.value = true;
  try {
    page.value += 1;
    const list = await getKoxNotes(query({ page: page.value, page_size: 24 }));
    notes.value = [...notes.value, ...(list?.list ?? [])];
  } finally {
    loading.value = false;
  }
};

onMounted(load);
</script>

<style scoped>
.hc-page { display: flex; flex-direction: column; gap: 12px; }
.hc-toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.hc-spacer { flex: 1; }
.hc-total { font-size: 12px; color: #94a3b8; }

.hc-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 10px;
}
.hc-stat {
  background: #fff;
  border-radius: 12px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  border-bottom: 3px solid #5087ec;
}
.hc-stat b { font-size: 22px; color: #1e293b; font-variant-numeric: tabular-nums; }
.hc-stat span { font-size: 12px; color: #94a3b8; }

.hc-two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.hc-card { background: #fff; border-radius: 12px; padding: 14px 16px; }
.hcc-title { font-size: 14px; font-weight: 700; color: #1e293b; margin-bottom: 12px; }
.hcc-sub { font-size: 12px; color: #94a3b8; font-weight: 400; margin-left: 8px; }

.word-cloud { display: flex; flex-wrap: wrap; gap: 10px 14px; align-items: center; min-height: 120px; }
.wc-item { cursor: pointer; line-height: 1.4; }
.wc-item.w1 { color: #3456e6; font-weight: 700; }
.wc-item.w2 { color: #7c5cf0; font-weight: 600; }
.wc-item.w3 { color: #64748b; }
.wc-item:hover { text-decoration: underline; }

.cat-bars { display: flex; flex-direction: column; gap: 10px; min-height: 120px; justify-content: center; }
.cat-row { display: flex; align-items: center; gap: 10px; }
.cat-name { width: 64px; font-size: 12px; color: #475569; text-align: right; flex-shrink: 0; }
.cat-bar-bg { flex: 1; height: 14px; background: #f1f5f9; border-radius: 7px; overflow: hidden; }
.cat-bar { height: 100%; border-radius: 7px; background: linear-gradient(90deg, #5087ec, #9b5de5); }
.cat-val { width: 60px; font-size: 12px; color: #64748b; font-variant-numeric: tabular-nums; }

.hot-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
  gap: 12px;
}
.hot-card {
  border-radius: 10px;
  overflow: hidden;
  background: #f8fafc;
  text-decoration: none;
  transition: transform 0.15s, box-shadow 0.15s;
}
.hot-card:hover { transform: translateY(-2px); box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08); }
.hot-cover-wrap { position: relative; aspect-ratio: 3/4; background: #e2e8f0; }
.hot-cover-wrap img { width: 100%; height: 100%; object-fit: cover; display: block; }
.hot-tile {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 40px;
  font-weight: 700;
  color: #94a3b8;
  background: linear-gradient(160deg, #f1f5f9, #e2e8f0);
}
.hot-rank {
  position: absolute;
  top: 6px;
  left: 6px;
  min-width: 20px;
  height: 20px;
  border-radius: 6px;
  background: rgba(15, 23, 42, 0.55);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 5px;
}
.hot-rank.top { background: linear-gradient(135deg, #f97316, #dc2626); }
.hot-title {
  padding: 8px 10px 2px;
  font-size: 12.5px;
  color: #1e293b;
  font-weight: 500;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.5;
}
.hot-author { padding: 0 10px; font-size: 11px; color: #94a3b8; }
.hot-metrics {
  padding: 6px 10px 10px;
  display: flex;
  gap: 8px;
  font-size: 10.5px;
  color: #64748b;
  flex-wrap: wrap;
}
.hc-more { text-align: center; padding: 12px 0 2px; }
.hc-empty-mini { color: #cbd5e1; font-size: 12px; text-align: center; padding: 30px 0; width: 100%; }

@media (max-width: 991px) {
  .hc-two-col { grid-template-columns: 1fr; }
}
</style>
