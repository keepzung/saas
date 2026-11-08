<template>
  <PageWrapper title="达人匹配">
    <FilterTopbar>
      <a-select
        v-model:value="productId"
        show-search
        option-filter-prop="label"
        :options="productOptions"
        style="width: 240px"
        placeholder="选择产品查看匹配结果"
        @change="load"
      />
      <a-button type="primary" :loading="running" :disabled="!productId" @click="run">
        <RocketOutlined /> 跑一轮匹配
      </a-button>
      <span class="tip">AI 从达人池中按品类契合度评分排序，热点抓取会持续扩充达人池</span>
    </FilterTopbar>

    <a-spin :spinning="loading">
      <div class="list">
        <div v-for="m in list" :key="m.id" class="row">
          <div class="score" :class="scoreClass(m.score)">{{ m.score ?? '—' }}</div>
          <a-avatar :src="m.creator?.avatar" :size="48">{{ (m.creator?.nickname || '?').slice(0, 1) }}</a-avatar>
          <div class="main">
            <div class="line1">
              <span class="name">{{ m.creator?.nickname }}</span>
              <a-tag color="blue" class="plt">{{ platformName(m.creator?.platform) }}</a-tag>
              <span class="fans">{{ fmtNum(m.creator?.fans) }} 粉丝</span>
              <a-tag v-if="m.creator?.picture_price || m.creator?.video_price" color="gold">
                报价 {{ m.creator?.picture_price ? `图文${m.creator.picture_price}` : '' }}{{ m.creator?.video_price ? ` 视频${m.creator.video_price}` : '' }}
              </a-tag>
            </div>
            <div class="rationale">{{ m.rationale }}</div>
            <div class="meta">
              <a-tag v-if="m.creator?.category" color="cyan">{{ m.creator.category }}</a-tag>
              <a-tag v-for="t in (m.creator?.tags ?? []).slice(0, 4)" :key="t">{{ t }}</a-tag>
              <span v-if="m.creator?.engagement_rate" class="er">互动率 {{ m.creator.engagement_rate }}%</span>
            </div>
          </div>
          <div class="ops">
            <a-select :value="m.status" size="small" style="width: 110px" @change="(v) => changeStatus(m, v)">
              <a-select-option value="candidate">候选</a-select-option>
              <a-select-option value="contacted">已建联</a-select-option>
              <a-select-option value="cooperating">已合作</a-select-option>
              <a-select-option value="rejected">否决</a-select-option>
            </a-select>
            <a-button v-if="m.creator?.home_page" size="small" :href="m.creator.home_page" target="_blank">主页</a-button>
          </div>
        </div>
      </div>
      <a-empty v-if="!list.length && !loading" description="暂无匹配结果：选择产品后点「跑一轮匹配」" />
      <div class="pager">
        <a-pagination v-model:current="page" :total="total" :page-size="pageSize" @change="load" />
      </div>
    </a-spin>
  </PageWrapper>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { message } from 'ant-design-vue';
import { RocketOutlined } from '@ant-design/icons-vue';
import PageWrapper from '../../components/PageWrapper.vue';
import FilterTopbar from '../../components/FilterTopbar.vue';
import { useAuthStore } from '../../stores/auth';
import { getProducts } from '../../api/content';
import { getMatches, runMatch, updateMatchStatus } from '../../api/hotspot';

const auth = useAuthStore();
const brandId = computed(() => auth.currentBrandId ?? 1);

const productId = ref(null);
const productOptions = ref([]);
const list = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(30);
const loading = ref(false);
const running = ref(false);

const platformName = (p) => ({ xhs: '小红书', bilibili: 'B站', douyin: '抖音', zhihu: '知乎' }[p] ?? p ?? '');
const fmtNum = (n) => {
  const v = Number(n ?? 0);
  if (v >= 10000) return `${(v / 10000).toFixed(1)}万`;
  return String(v);
};
const scoreClass = (s) => (s >= 85 ? 'high' : s >= 70 ? 'mid' : s >= 40 ? 'low' : 'poor');

const flattenProducts = (nodes, out = []) => {
  for (const n of nodes ?? []) {
    if (n.type === 'product') out.push({ value: n.id, label: n.display_name ?? n.name });
    flattenProducts(n.children, out);
  }
  return out;
};

const loadProducts = async () => {
  const res = await getProducts({ brandId: brandId.value }).catch(() => []);
  productOptions.value = flattenProducts(res ?? []);
};

const load = async () => {
  loading.value = true;
  try {
    const res = await getMatches({
      brandId: brandId.value,
      productId: productId.value ?? undefined,
      page: page.value,
      pageSize: pageSize.value,
    });
    list.value = res?.items ?? [];
    total.value = res?.total ?? 0;
  } finally {
    loading.value = false;
  }
};

const run = async () => {
  if (!productId.value) return;
  running.value = true;
  try {
    const r = await runMatch({ brandId: brandId.value, productId: productId.value }, { brandId: brandId.value });
    message.success(`匹配完成：从 ${r?.total_candidates ?? 0} 位达人中选出 Top${r?.matched ?? 0}`);
    page.value = 1;
    load();
  } catch (e) {
    message.error(e?.message ?? '匹配失败');
  } finally {
    running.value = false;
  }
};

const changeStatus = async (m, v) => {
  await updateMatchStatus(m.id, { brandId: brandId.value, status: v });
  m.status = v;
};

onMounted(async () => {
  await loadProducts();
  load();
});
</script>

<style scoped>
.tip { color: #999; font-size: 12px; }
.list { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; }
.row { display: flex; align-items: center; gap: 12px; background: #fff; border: 1px solid #f0f0f0; border-radius: 10px; padding: 12px 14px; }
.score { width: 52px; height: 52px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 18px; color: #fff; flex-shrink: 0; }
.score.high { background: #52c41a; }
.score.mid { background: #1890ff; }
.score.low { background: #faad14; }
.score.poor { background: #bfbfbf; }
.main { flex: 1; min-width: 0; }
.line1 { display: flex; align-items: center; gap: 8px; }
.name { font-weight: 600; }
.plt { font-size: 11px; }
.fans { color: #888; font-size: 12px; }
.rationale { margin-top: 4px; font-size: 13px; color: #333; }
.meta { margin-top: 6px; }
.meta .ant-tag { margin-bottom: 2px; }
.er { color: #999; font-size: 12px; margin-left: 8px; }
.ops { display: flex; flex-direction: column; gap: 6px; align-items: flex-end; }
.pager { display: flex; justify-content: center; margin-top: 16px; }
</style>
