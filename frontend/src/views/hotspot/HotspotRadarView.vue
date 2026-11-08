<template>
  <PageWrapper title="热点雷达">
    <FilterTopbar>
      <a-radio-group v-model:value="platform" button-style="solid" @change="load">
        <a-radio-button value="">全部</a-radio-button>
        <a-radio-button value="xhs">小红书</a-radio-button>
        <a-radio-button value="bilibili">B站</a-radio-button>
        <a-radio-button value="douyin" disabled>抖音（二期）</a-radio-button>
        <a-radio-button value="zhihu" disabled>知乎（二期）</a-radio-button>
      </a-radio-group>
      <a-select v-model:value="sourceType" style="width: 130px" @change="load">
        <a-select-option value="">全部来源</a-select-option>
        <a-select-option value="search">关键词</a-select-option>
        <a-select-option value="hot_list">热门feed</a-select-option>
        <a-select-option value="competitor">竞品内容</a-select-option>
      </a-select>
      <a-select v-model:value="sort" style="width: 120px" @change="load">
        <a-select-option value="new">最新入库</a-select-option>
        <a-select-option value="hot">点赞最高</a-select-option>
        <a-select-option value="views">播放最高</a-select-option>
      </a-select>
      <a-input-search
        v-model:value="keyword"
        style="width: 200px"
        placeholder="搜标题"
        allow-clear
        @search="load"
      />
      <a-button type="primary" :loading="scraping" @click="manualRound">
        <ThunderboltOutlined /> 立即抓一轮
      </a-button>
    </FilterTopbar>

    <a-card size="small" class="kw-card" title="抓取关键词">
      <div class="kw-row">
        <a-tag
          v-for="k in keywords"
          :key="k.id"
          :color="k.enabled ? 'blue' : 'default'"
          closable
          @close.prevent="removeKeyword(k)"
          @click="toggleKeyword(k)"
          class="kw-tag"
        >
          {{ k.keyword }}
          <span class="kw-plt">{{ (k.platforms ?? []).join('/') }}</span>
        </a-tag>
        <a-input
          v-model:value="newKeyword"
          size="small"
          style="width: 160px"
          placeholder="新关键词"
          @press-enter="submitNewKeyword"
        />
        <a-button size="small" type="link" @click="submitNewKeyword">添加</a-button>
      </div>
    </a-card>

    <a-spin :spinning="loading">
      <div class="grid">
        <div v-for="c in list" :key="c.id" class="card" @click="openDetail(c)">
          <div class="cover-wrap">
            <img v-if="c.cover_url" :src="c.cover_url" loading="lazy" />
            <div v-else class="cover-ph">无封面</div>
            <span class="plt-badge" :class="c.platform">{{ platformName(c.platform) }}</span>
            <span v-if="c.source_type === 'competitor'" class="comp-badge">竞品</span>
            <span v-if="c.kind === 'video'" class="kind-badge">视频</span>
          </div>
          <div class="card-body">
            <div class="title">{{ c.title || '（无标题）' }}</div>
            <div class="meta">
              <span class="author">{{ c.author_name || '未知作者' }}</span>
              <span class="stat">♥ {{ fmtNum(c.like_count) }}</span>
              <span v-if="c.view_count" class="stat">▶ {{ fmtNum(c.view_count) }}</span>
            </div>
            <div class="foot">
              <a-tag v-if="c.breakdown_status === 'done'" color="green">已拆解</a-tag>
              <a-tag v-else-if="c.breakdown_status === 'processing' || c.breakdown_status === 'pending'" color="orange">拆解中</a-tag>
              <span class="kw-src" v-if="c.source_keyword">{{ c.source_keyword }}</span>
              <span class="date">{{ fmtDate(c.first_seen_at) }}</span>
            </div>
            <div class="ops" @click.stop>
              <a-button size="small" type="primary" ghost :loading="breakingId === c.id" @click="breakdown(c)">
                {{ c.breakdown_status === 'done' ? '重新拆解' : 'AI 拆解' }}
              </a-button>
              <a-button size="small" @click="goMatchCreate(c)">复刻文案</a-button>
            </div>
          </div>
        </div>
      </div>
      <a-empty v-if="!list.length && !loading" description="暂无内容：先在上方添加关键词，再点「立即抓一轮」" />
      <div class="pager">
        <a-pagination v-model:current="page" :total="total" :page-size="pageSize" @change="load" />
      </div>
    </a-spin>

    <a-drawer v-model:open="detailOpen" :title="detail?.title || '内容详情'" width="520">
      <template v-if="detail">
        <div class="d-meta">
          <a-tag color="blue">{{ platformName(detail.platform) }}</a-tag>
          <a-tag>{{ detail.kind === 'video' ? '视频' : '图文' }}</a-tag>
          <a-tag v-if="detail.source_type === 'competitor'" color="red">竞品</a-tag>
          <span class="d-author">{{ detail.author_name }}</span>
        </div>
        <div class="d-stats">
          <div class="s"><b>{{ fmtNum(detail.like_count) }}</b><span>点赞</span></div>
          <div class="s"><b>{{ fmtNum(detail.view_count) }}</b><span>播放</span></div>
          <div class="s"><b>{{ fmtNum(detail.collect_count) }}</b><span>收藏</span></div>
          <div class="s"><b>{{ fmtNum(detail.comment_count) }}</b><span>评论</span></div>
          <div class="s"><b>{{ fmtNum(detail.share_count) }}</b><span>分享</span></div>
        </div>
        <template v-if="detail.breakdown">
          <a-divider>AI 拆解</a-divider>
          <template v-if="detail.breakdown.status === 'done'">
            <a-alert v-if="detail.breakdown.partial" type="warning" show-icon message="视频源不可得，本次为文本降级拆解" class="d-alert" />
            <div class="d-sec"><span class="lab">开头钩子</span><p>{{ detail.breakdown.hook }}</p></div>
            <div class="d-sec">
              <span class="lab">结构节奏</span>
              <a-steps direction="vertical" size="small" :current="99" class="d-structure">
                <a-step v-for="(s, i) in detail.breakdown.structure ?? []" :key="i" :title="s.stage" :description="s.summary + (s.voiceover ? `｜口播：${s.voiceover}` : '')" />
              </a-steps>
            </div>
            <div class="d-sec">
              <span class="lab">卖点提炼</span>
              <a-tag v-for="p in detail.breakdown.selling_points ?? []" :key="p" color="blue" class="d-tag">{{ p }}</a-tag>
            </div>
            <div class="d-sec"><span class="lab">行动号召</span><p>{{ detail.breakdown.cta }}</p></div>
            <div class="d-sec">
              <span class="lab">风格标签</span>
              <a-tag v-for="t in detail.breakdown.style_tags ?? []" :key="t" class="d-tag">{{ t }}</a-tag>
            </div>
            <div class="d-sec"><span class="lab">原文案</span><pre class="d-script">{{ detail.breakdown.script_text }}</pre></div>
            <div class="d-sec"><span class="lab">复刻建议</span><p>{{ detail.breakdown.replicate_tips }}</p></div>
          </template>
          <a-alert v-else type="info" :message="`拆解状态：${detail.breakdown.status}`" />
        </template>
        <a-empty v-else description="尚未拆解，点击「AI 拆解」开始" style="margin-top: 24px" />
        <div class="d-ops">
          <a-button type="primary" @click="createArticle(detail)">生成复刻文案</a-button>
          <a-button @click="createVideo(detail)">生成同款视频</a-button>
        </div>
      </template>
    </a-drawer>

    <ProductPickModal v-model:open="pickOpen" :title="pickTitle" :with-strategy="pickMode === 'article'" @picked="onPicked" />
  </PageWrapper>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { message } from 'ant-design-vue';
import { useRouter } from 'vue-router';
import { ThunderboltOutlined } from '@ant-design/icons-vue';
import PageWrapper from '../../components/PageWrapper.vue';
import FilterTopbar from '../../components/FilterTopbar.vue';
import ProductPickModal from './ProductPickModal.vue';
import { useAuthStore } from '../../stores/auth';
import {
  getHotContents,
  getHotContentDetail,
  runScrapeRound,
  getKeywords,
  addKeyword as addKeywordApi,
  updateKeyword,
  deleteKeyword,
  requestBreakdown,
} from '../../api/hotspot';

const router = useRouter();
const auth = useAuthStore();
const brandId = computed(() => auth.currentBrandId ?? 1);

const list = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(24);
const loading = ref(false);
const scraping = ref(false);
const platform = ref('');
const sourceType = ref('');
const sort = ref('new');
const keyword = ref('');

const keywords = ref([]);
const newKeyword = ref('');

const detailOpen = ref(false);
const detail = ref(null);
const breakingId = ref(null);

const pickOpen = ref(false);
const pickMode = ref('article');
const pickTitle = ref('选择产品');
const pickContent = ref(null);

const platformName = (p) => ({ xhs: '小红书', bilibili: 'B站', douyin: '抖音', zhihu: '知乎', channels: '视频号' }[p] ?? p);
const fmtNum = (n) => {
  const v = Number(n ?? 0);
  if (v >= 100000000) return `${(v / 100000000).toFixed(1)}亿`;
  if (v >= 10000) return `${(v / 10000).toFixed(1)}万`;
  return String(v);
};
const fmtDate = (d) => (d ? String(d).slice(5, 10) : '');

const load = async () => {
  loading.value = true;
  try {
    const res = await getHotContents({
      brandId: brandId.value,
      platform: platform.value || undefined,
      sourceType: sourceType.value || undefined,
      keyword: keyword.value || undefined,
      sort: sort.value,
      page: page.value,
      pageSize: pageSize.value,
    });
    list.value = res?.items ?? [];
    total.value = res?.total ?? 0;
  } finally {
    loading.value = false;
  }
};

const loadKeywords = async () => {
  keywords.value = (await getKeywords({ brandId: brandId.value })) ?? [];
};

const submitNewKeyword = async () => {
  const kw = (newKeyword.value ?? '').trim();
  if (!kw) return;
  try {
    await addKeywordApi({ keyword: kw }, { brandId: brandId.value });
    newKeyword.value = '';
    message.success('已添加');
    loadKeywords();
  } catch (e) {
    message.error(e?.message ?? '添加失败');
  }
};

const toggleKeyword = async (k) => {
  await updateKeyword(k.id, { enabled: !k.enabled });
  loadKeywords();
};

const removeKeyword = async (k) => {
  await deleteKeyword(k.id, { brandId: brandId.value });
  loadKeywords();
};

const manualRound = async () => {
  scraping.value = true;
  try {
    const r = await runScrapeRound();
    message.success(`抓取完成：${r?.tasks ?? 0} 个关键词任务，新增 ${r?.inserted ?? 0} 条`);
    load();
  } catch (e) {
    message.error(e?.message ?? '抓取失败');
  } finally {
    scraping.value = false;
  }
};

const openDetail = async (c) => {
  detail.value = null;
  detailOpen.value = true;
  detail.value = await getHotContentDetail(c.id, { brandId: brandId.value });
};

const breakdown = async (c) => {
  breakingId.value = c.id;
  try {
    await requestBreakdown({ contentId: c.id }, { brandId: brandId.value });
    message.success('已加入拆解队列，完成后状态会更新');
    setTimeout(load, 2000);
  } catch (e) {
    message.error(e?.message ?? '拆解请求失败');
  } finally {
    breakingId.value = null;
  }
};

const goMatchCreate = (c) => {
  pickMode.value = 'article';
  pickTitle.value = '爆款复刻·选择产品';
  pickContent.value = c;
  pickOpen.value = true;
};

const createArticle = (detailRow) => {
  pickMode.value = 'article';
  pickTitle.value = '爆款复刻·选择产品';
  pickContent.value = detailRow;
  pickOpen.value = true;
};

const createVideo = (detailRow) => {
  pickMode.value = 'video';
  pickTitle.value = '生成同款视频·选择产品';
  pickContent.value = detailRow;
  pickOpen.value = true;
};

const onPicked = async ({ productId, strategyId }) => {
  const c = pickContent.value;
  pickOpen.value = false;
  if (!c || !productId) return;
  if (pickMode.value === 'article') {
    const res = await generateFromBreakdownSafe(c.breakdown?.id, productId, strategyId);
    if (res) message.success('文案已生成并进入「历史记录」，可去审核发布');
  } else {
    await createVideoSafe(c.breakdown?.id ?? null, c.id, productId);
    message.success('视频任务已创建，可到「视频工坊」查看进度');
  }
};

const generateFromBreakdownSafe = async (breakdownId, productId, strategyId) => {
  if (!breakdownId) {
    message.warning('该内容尚未拆解完成，请先 AI 拆解');
    return null;
  }
  try {
    const { generateFromBreakdown } = await import('../../api/hotspot');
    return await generateFromBreakdown(
      { brandId: brandId.value, breakdownId, productId, strategyId: strategyId ?? null },
      { brandId: brandId.value },
    );
  } catch (e) {
    message.error(e?.message ?? '生成失败');
    return null;
  }
};

const createVideoSafe = async (breakdownId, hotContentId, productId) => {
  try {
    const { generateVideo } = await import('../../api/hotspot');
    await generateVideo(
      { brandId: brandId.value, productId, breakdownId: breakdownId ?? undefined, hotContentId },
      { brandId: brandId.value },
    );
  } catch (e) {
    message.error(e?.message ?? '任务创建失败');
  }
};

onMounted(() => {
  load();
  loadKeywords();
});
</script>

<style scoped>
.kw-card { margin-bottom: 12px; }
.kw-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.kw-tag { cursor: pointer; user-select: none; }
.kw-plt { font-size: 11px; opacity: 0.7; margin-left: 4px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; margin-top: 12px; }
.card { background: #fff; border: 1px solid #f0f0f0; border-radius: 10px; overflow: hidden; cursor: pointer; transition: box-shadow 0.2s; }
.card:hover { box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08); }
.cover-wrap { position: relative; height: 150px; background: #fafafa; }
.cover-wrap img { width: 100%; height: 100%; object-fit: cover; }
.cover-ph { display: flex; align-items: center; justify-content: center; height: 100%; color: #bbb; }
.plt-badge { position: absolute; left: 8px; top: 8px; background: rgba(255, 32, 85, 0.9); color: #fff; font-size: 12px; padding: 1px 8px; border-radius: 10px; }
.plt-badge.bilibili { background: rgba(0, 161, 214, 0.9); }
.comp-badge { position: absolute; right: 8px; top: 8px; background: rgba(250, 173, 20, 0.95); color: #fff; font-size: 12px; padding: 1px 8px; border-radius: 10px; }
.kind-badge { position: absolute; right: 8px; bottom: 8px; background: rgba(0, 0, 0, 0.55); color: #fff; font-size: 12px; padding: 1px 8px; border-radius: 10px; }
.card-body { padding: 10px 12px; }
.title { font-size: 13px; font-weight: 600; line-height: 1.4; height: 36px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.meta { display: flex; gap: 10px; margin-top: 6px; font-size: 12px; color: #888; }
.author { max-width: 45%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.foot { display: flex; align-items: center; gap: 8px; margin-top: 8px; font-size: 12px; color: #999; }
.kw-src { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 90px; }
.date { margin-left: auto; }
.ops { display: flex; gap: 8px; margin-top: 8px; }
.pager { display: flex; justify-content: center; margin-top: 16px; }
.d-meta { display: flex; align-items: center; gap: 6px; }
.d-author { color: #888; margin-left: auto; font-size: 13px; }
.d-stats { display: flex; gap: 12px; margin-top: 12px; }
.d-stats .s { flex: 1; text-align: center; background: #fafafa; border-radius: 8px; padding: 8px 0; }
.d-stats b { display: block; font-size: 16px; }
.d-stats span { font-size: 12px; color: #999; }
.d-alert { margin-bottom: 12px; }
.d-sec { margin-top: 14px; }
.d-sec .lab { font-weight: 600; color: #555; }
.d-sec p { margin: 6px 0 0; color: #333; line-height: 1.7; white-space: pre-wrap; }
.d-tag { margin: 6px 6px 0 0; }
.d-script { white-space: pre-wrap; background: #fafafa; padding: 10px; border-radius: 8px; font-size: 12px; margin-top: 6px; }
.d-structure { margin-top: 8px; }
.d-ops { display: flex; gap: 10px; margin-top: 20px; }
</style>
