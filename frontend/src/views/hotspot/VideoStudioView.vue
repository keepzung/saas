<template>
  <PageWrapper title="视频工坊">
    <FilterTopbar>
      <a-button type="primary" @click="pickOpen = true"><PlusOutlined /> 新建混剪视频</a-button>
      <span class="tip">15-30 秒竖版视频：AI 分镜 → 品牌素材智能匹配 → AI 配音 → 字幕合成；每条消耗 {{ 10 }} 算力，失败自动退回</span>
    </FilterTopbar>

    <a-spin :spinning="loading">
      <div class="list">
        <div v-for="t in list" :key="t.id" class="row">
          <div class="video-wrap">
            <video
              v-if="t.status === 'done' && t.video_url"
              :src="t.video_url"
              :poster="t.cover_url ?? undefined"
              controls
              preload="metadata"
            ></video>
            <div v-else class="ph">
              <a-spin v-if="t.status === 'scripting' || t.status === 'rendering' || t.status === 'queued'" />
              <span v-else-if="t.status === 'failed'" class="fail">✕</span>
              <span v-else>—</span>
            </div>
          </div>
          <div class="main">
            <div class="title">{{ t.title || `视频任务 #${t.id}` }}</div>
            <div class="meta">
              <a-tag color="blue">{{ t.product || '未关联产品' }}</a-tag>
              <a-tag :color="statusColor(t.status)">{{ statusText(t.status) }}</a-tag>
              <a-tag v-if="t.duration_sec">{{ t.duration_sec }}s</a-tag>
              <a-tag v-if="t.breakdown?.style_tags?.length" color="purple">{{ t.breakdown.style_tags[0] }}</a-tag>
            </div>
            <div v-if="t.error_msg" class="err">{{ t.error_msg }}</div>
            <div v-if="t.script?.length" class="shots">
              <a-collapse ghost size="small">
                <a-collapse-panel header="分镜脚本">
                  <div v-for="(s, i) in t.script" :key="i" class="shot">
                    <b>{{ i + 1 }}. {{ s.subtitle }}</b>
                    <span class="vo">{{ s.voiceover }}</span>
                    <span class="mq">素材：{{ s.media_query || '自动' }} · {{ s.media_type === 'video' ? '视频片段' : '图片动效' }} · {{ s.durSec }}s</span>
                  </div>
                </a-collapse-panel>
              </a-collapse>
            </div>
          </div>
          <div class="ops">
            <a-button v-if="t.video_url" size="small" :href="t.video_url" download>下载</a-button>
            <a-button v-if="t.status === 'failed'" size="small" @click="retry(t)">重试</a-button>
          </div>
        </div>
      </div>
      <a-empty v-if="!list.length && !loading" description="还没有视频任务：去「热点雷达」选一条爆款生成同款，或点上方新建" />
      <div class="pager">
        <a-pagination v-model:current="page" :total="total" :page-size="pageSize" @change="load" />
      </div>
    </a-spin>

    <ProductPickModal v-model:open="pickOpen" title="新建混剪视频·选择产品" @picked="create" />
  </PageWrapper>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { message } from 'ant-design-vue';
import { PlusOutlined } from '@ant-design/icons-vue';
import PageWrapper from '../../components/PageWrapper.vue';
import FilterTopbar from '../../components/FilterTopbar.vue';
import ProductPickModal from './ProductPickModal.vue';
import { useAuthStore } from '../../stores/auth';
import { getVideoTasks, generateVideo, retryVideo } from '../../api/hotspot';

const auth = useAuthStore();
const brandId = computed(() => auth.currentBrandId ?? 1);

const list = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(12);
const loading = ref(false);
const pickOpen = ref(false);
let timer = null;

const statusColor = (s) => ({ done: 'green', rendering: 'orange', scripting: 'orange', queued: 'orange', failed: 'red' }[s] ?? 'default');
const statusText = (s) => ({ done: '已完成', rendering: '合成中', scripting: '生成分镜', queued: '排队中', failed: '失败' }[s] ?? s);

const load = async () => {
  loading.value = true;
  try {
    const res = await getVideoTasks({ brandId: brandId.value, page: page.value, pageSize: pageSize.value });
    list.value = res?.items ?? [];
    total.value = res?.total ?? 0;
    // 有进行中任务时 5s 轮询
    clearTimeout(timer);
    if ((res?.items ?? []).some((t) => ['queued', 'scripting', 'rendering'].includes(t.status))) {
      timer = setTimeout(load, 5000);
    }
  } finally {
    loading.value = false;
  }
};

const create = async ({ productId }) => {
  pickOpen.value = false;
  try {
    await generateVideo({ brandId: brandId.value, productId }, { brandId: brandId.value });
    message.success('任务已创建，正在生成分镜与合成');
    load();
  } catch (e) {
    message.error(e?.message ?? '创建失败');
  }
};

const retry = async (t) => {
  try {
    await retryVideo(t.id, { brandId: brandId.value });
    message.success('已重新排队');
    load();
  } catch (e) {
    message.error(e?.message ?? '重试失败');
  }
};

onMounted(load);
onUnmounted(() => clearTimeout(timer));
</script>

<style scoped>
.tip { color: #999; font-size: 12px; }
.list { display: flex; flex-direction: column; gap: 12px; margin-top: 12px; }
.row { display: flex; gap: 14px; background: #fff; border: 1px solid #f0f0f0; border-radius: 12px; padding: 14px; }
.video-wrap { width: 135px; }
.video-wrap video { width: 135px; height: 240px; border-radius: 10px; background: #000; object-fit: contain; }
.ph { display: flex; align-items: center; justify-content: center; width: 135px; height: 240px; border-radius: 10px; background: #fafafa; }
.fail { color: #ff4d4f; font-size: 28px; }
.main { flex: 1; min-width: 0; }
.title { font-weight: 600; }
.meta { margin-top: 8px; }
.meta .ant-tag { margin-bottom: 4px; }
.err { margin-top: 8px; color: #ff4d4f; font-size: 12px; word-break: break-all; }
.shots { margin-top: 4px; }
.shot { display: flex; flex-direction: column; padding: 6px 0; border-bottom: 1px dashed #f5f5f5; font-size: 12px; }
.shot .vo { color: #555; margin-top: 2px; }
.shot .mq { color: #aaa; margin-top: 2px; }
.ops { display: flex; flex-direction: column; gap: 8px; }
.pager { display: flex; justify-content: center; margin-top: 16px; }
</style>
