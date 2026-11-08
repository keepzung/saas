<template>
  <PageWrapper title="爆款拆解">
    <FilterTopbar>
      <a-radio-group v-model:value="platform" button-style="solid" @change="load">
        <a-radio-button value="">全部</a-radio-button>
        <a-radio-button value="xhs">小红书</a-radio-button>
        <a-radio-button value="bilibili">B站</a-radio-button>
      </a-radio-group>
      <a-select v-model:value="status" style="width: 130px" @change="load">
        <a-select-option value="done">已完成</a-select-option>
        <a-select-option value="processing">进行中</a-select-option>
        <a-select-option value="pending">排队中</a-select-option>
        <a-select-option value="failed">失败</a-select-option>
      </a-select>
    </FilterTopbar>

    <a-spin :spinning="loading">
      <div class="list">
        <div v-for="b in list" :key="b.id" class="row" @click="open(b)">
          <img v-if="b.hotContent?.coverUrl" :src="b.hotContent.coverUrl" class="cover" loading="lazy" />
          <div v-else class="cover ph">无封面</div>
          <div class="main">
            <div class="title">{{ b.hotContent?.title || '（无标题）' }}</div>
            <div class="meta">
              <a-tag color="blue">{{ platformName(b.hotContent?.platform) }}</a-tag>
              <a-tag>{{ b.hotContent?.kind === 'video' ? '视频' : '图文' }}</a-tag>
              <a-tag v-if="b.partial" color="warning">降级拆解</a-tag>
              <a-tag v-for="t in (b.styleTags ?? []).slice(0, 3)" :key="t" color="purple">{{ t }}</a-tag>
            </div>
            <div class="hook">钩子：{{ b.hook || '—' }}</div>
          </div>
          <div class="right">
            <a-tag :color="statusColor(b.status)">{{ statusText(b.status) }}</a-tag>
            <div class="date">{{ fmtDate(b.updatedAt) }}</div>
          </div>
        </div>
      </div>
      <a-empty v-if="!list.length && !loading" description="暂无拆解：去「热点雷达」对内容点 AI 拆解" />
      <div class="pager">
        <a-pagination v-model:current="page" :total="total" :page-size="pageSize" @change="load" />
      </div>
    </a-spin>

    <a-drawer v-model:open="open_" width="560">
      <template #title>{{ cur?.hotContent?.title || '拆解详情' }}</template>
      <template v-if="cur">
        <template v-if="cur.status === 'done'">
          <a-alert v-if="cur.partial" type="warning" show-icon message="视频源不可得，本次为文本降级拆解" class="sec" />
          <div class="sec"><span class="lab">开头钩子</span><p>{{ cur.hook }}</p></div>
          <div class="sec">
            <span class="lab">结构节奏</span>
            <a-steps direction="vertical" size="small" :current="99" class="steps">
              <a-step v-for="(s, i) in cur.structure ?? []" :key="i" :title="s.stage" :description="s.summary + (s.voiceover ? `｜口播：${s.voiceover}` : '')" />
            </a-steps>
          </div>
          <div class="sec">
            <span class="lab">卖点提炼</span>
            <div><a-tag v-for="p in cur.sellingPoints ?? []" :key="p" color="blue">{{ p }}</a-tag></div>
          </div>
          <div class="sec"><span class="lab">行动号召</span><p>{{ cur.cta }}</p></div>
          <div class="sec">
            <span class="lab">风格标签</span>
            <div><a-tag v-for="t in cur.styleTags ?? []" :key="t">{{ t }}</a-tag></div>
          </div>
          <div class="sec"><span class="lab">原文案</span><pre class="script">{{ cur.scriptText }}</pre></div>
          <div class="sec"><span class="lab">复刻建议</span><p>{{ cur.replicateTips }}</p></div>
        </template>
        <a-alert v-else type="info" :message="`状态：${statusText(cur.status)}${cur.errorMsg ? `，错误：${cur.errorMsg}` : ''}`" />
        <div class="ops">
          <ProductPickModal v-model:open="pickOpen" :title="pickMode === 'video' ? '生成同款视频·选择产品' : '爆款复刻·选择产品'" :with-strategy="pickMode === 'article'" @picked="onPicked" />
          <a-button type="primary" @click="startPick('article')">生成复刻文案</a-button>
          <a-button @click="startPick('video')">生成同款视频</a-button>
        </div>
      </template>
    </a-drawer>
  </PageWrapper>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { message } from 'ant-design-vue';
import PageWrapper from '../../components/PageWrapper.vue';
import FilterTopbar from '../../components/FilterTopbar.vue';
import ProductPickModal from './ProductPickModal.vue';
import { useAuthStore } from '../../stores/auth';
import { getBreakdowns, generateFromBreakdown, generateVideo } from '../../api/hotspot';

const auth = useAuthStore();
const brandId = computed(() => auth.currentBrandId ?? 1);

const list = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const loading = ref(false);
const platform = ref('');
const status = ref('done');

const open_ = ref(false);
const cur = ref(null);
const pickOpen = ref(false);
const pickMode = ref('article');

const platformName = (p) => ({ xhs: '小红书', bilibili: 'B站' }[p] ?? p ?? '');
const statusColor = (s) => ({ done: 'green', processing: 'orange', pending: 'orange', failed: 'red' }[s] ?? 'default');
const statusText = (s) => ({ done: '已完成', processing: '拆解中', pending: '排队中', failed: '失败' }[s] ?? s);
const fmtDate = (d) => (d ? String(d).slice(0, 16).replace('T', ' ') : '');

const load = async () => {
  loading.value = true;
  try {
    const res = await getBreakdowns({
      brandId: brandId.value,
      platform: platform.value || undefined,
      status: status.value || undefined,
      page: page.value,
      pageSize: pageSize.value,
    });
    list.value = res?.items ?? [];
    total.value = res?.total ?? 0;
  } finally {
    loading.value = false;
  }
};

const open = async (b) => {
  cur.value = b;
  open_.value = true;
};

const startPick = (mode) => {
  pickMode.value = mode;
  pickOpen.value = true;
};

const onPicked = async ({ productId, strategyId }) => {
  pickOpen.value = false;
  if (pickMode.value === 'article') {
    try {
      await generateFromBreakdown(
        { brandId: brandId.value, breakdownId: cur.value.id, productId, strategyId },
        { brandId: brandId.value },
      );
      message.success('文案已生成，可在「内容工厂-历史记录」查看并走审核发布');
    } catch (e) {
      message.error(e?.message ?? '生成失败');
    }
  } else {
    try {
      await generateVideo(
        { brandId: brandId.value, productId, breakdownId: cur.value.id },
        { brandId: brandId.value },
      );
      message.success('视频任务已创建，可到「视频工坊」查看进度');
    } catch (e) {
      message.error(e?.message ?? '任务创建失败');
    }
  }
};

onMounted(load);
</script>

<style scoped>
.list { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; }
.row { display: flex; gap: 12px; background: #fff; border: 1px solid #f0f0f0; border-radius: 10px; padding: 12px; cursor: pointer; }
.row:hover { box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06); }
.cover { width: 84px; height: 84px; border-radius: 8px; object-fit: cover; }
.cover.ph { display: flex; align-items: center; justify-content: center; color: #ccc; background: #fafafa; font-size: 12px; }
.main { flex: 1; min-width: 0; }
.title { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.meta { margin-top: 6px; }
.meta .ant-tag { margin-bottom: 4px; }
.hook { margin-top: 6px; font-size: 12px; color: #888; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.right { text-align: right; }
.date { margin-top: 8px; font-size: 12px; color: #bbb; }
.pager { display: flex; justify-content: center; margin-top: 16px; }
.sec { margin-top: 16px; }
.sec .lab { font-weight: 600; color: #555; }
.sec p { margin: 6px 0 0; line-height: 1.7; white-space: pre-wrap; }
.steps { margin-top: 8px; }
.script { white-space: pre-wrap; background: #fafafa; padding: 10px; border-radius: 8px; font-size: 12px; margin-top: 6px; }
.ops { display: flex; gap: 10px; margin-top: 24px; }
</style>
