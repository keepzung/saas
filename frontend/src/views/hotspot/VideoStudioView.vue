<template>
  <PageWrapper title="视频工坊">
    <FilterTopbar>
      <a-button type="primary" @click="pickOpen = true"><PlusOutlined /> 新建混剪视频</a-button>
      <a-button @click="openMaterials"><FolderOutlined /> 品牌素材库</a-button>
      <a-button @click="router.push('/hotspot/voices')"><AudioOutlined /> 我的音色</a-button>
      <a-button @click="helpOpen = true"><QuestionCircleOutlined /> 使用说明</a-button>
      <span class="tip">15-30 秒竖版视频：AI 分镜 → 品牌素材智能匹配 / AI 生成画面 → AI 配音（豆包音色 / 系统音色 / 我的音色）→ 字幕合成；混剪每条 10 算力，AI成片 50 算力，失败自动退回</span>
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
              <a-tag v-if="t.engine === 'aigc'" color="volcano">AI成片</a-tag>
              <a-tag v-if="t.duration_sec">{{ t.duration_sec }}s</a-tag>
              <a-tag v-if="t.voice" color="geekblue">🎙 {{ voiceNames[t.voice] ?? t.voice }}</a-tag>
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
            <a-button v-if="!['queued', 'scripting', 'rendering'].includes(t.status)" size="small" danger @click="remove(t)">删除</a-button>
          </div>
        </div>
      </div>
      <a-empty v-if="!list.length && !loading" description="还没有视频任务：点上方「新建混剪视频」，选产品一键生成" />
      <div class="pager">
        <a-pagination v-model:current="page" :total="total" :page-size="pageSize" @change="load" />
      </div>
    </a-spin>

    <ProductPickModal v-model:open="pickOpen" title="新建混剪视频·选择产品" show-voice @picked="create" />

    <!-- 品牌素材库（混剪/AI成片的素材源） -->
    <a-drawer v-model:open="matOpen" title="品牌素材库" width="680px">
      <div class="mat-toolbar-row">
        <a-upload
          :show-upload-list="false"
          accept=".mp4,.mov,.webm,.m4v"
          :before-upload="onMaterialUpload"
        >
          <a-button type="primary" :loading="matUploading"><UploadOutlined /> 上传视频素材</a-button>
        </a-upload>
        <span class="mat-hint">支持 mp4/mov/webm，单个 ≤ 500MB；上传后自动用于混剪画面匹配（标签可提升命中）</span>
      </div>
      <a-spin :spinning="matLoading">
        <div v-if="materials.length" class="mat-grid">
          <div v-for="m in materials" :key="m.id" class="mat-cell">
            <video :src="m.url" :poster="m.thumbUrl ?? undefined" controls preload="metadata"></video>
            <div class="mat-meta">
              <a-tag v-for="t in m.tags ?? []" :key="t" color="blue" class="mat-tag">{{ t }}</a-tag>
              <span v-if="m.durationSec" class="mat-dur">{{ m.durationSec }}s</span>
              <a-popconfirm title="删除该视频素材？" ok-text="删除" cancel-text="取消" @confirm="removeMaterial(m)">
                <a-button size="small" type="link" danger class="mat-del">删除</a-button>
              </a-popconfirm>
            </div>
          </div>
        </div>
        <a-empty v-else-if="!matLoading" description="素材库为空：上传品牌视频素材后，混剪会自动从这里匹配画面" />
        <div v-if="matTotal > matPageSize" class="pager">
          <a-pagination v-model:current="matPage" :total="matTotal" :page-size="matPageSize" @change="loadMaterials" />
        </div>
      </a-spin>
    </a-drawer>
    <!-- 使用说明 -->
    <a-drawer v-model:open="helpOpen" title="视频工坊 · 使用说明" width="560px">
      <a-typography>
        <a-typography-title :level="5">三步出片</a-typography-title>
        <a-timeline>
          <a-timeline-item>点<b>「新建混剪视频」</b>，选择产品——AI 会读取产品的名称、卖点、产品知识，自动生成分镜脚本和口播文案。</a-timeline-item>
          <a-timeline-item>选<b>生成引擎</b>和<b>配音音色</b>（豆包音色 / 系统音色 / 我的音色，均可先试听）。</a-timeline-item>
          <a-timeline-item>点确定后任务进入队列：分镜 → 画面 → 配音 → 字幕逐段推进，完成后在本页直接<b>播放 / 下载</b>。</a-timeline-item>
        </a-timeline>

        <a-typography-title :level="5">两种生成引擎怎么选</a-typography-title>
        <ul class="help-list">
          <li><b>智能混剪（10 算力/条）</b>：画面来自品牌素材库的视频和素材库图片（智能匹配 + 动效合成），速度最快约 2-4 分钟，画面全部来自真实素材。</li>
          <li><b>AI成片（50 算力/条）</b>：AI 视频大模型逐段生成全新画面（Seedance / CogVideoX 双通道），素材库图片自动作为画面首帧——产品展示真实、AI 只生成氛围与运镜，约 5-10 分钟。</li>
        </ul>

        <a-typography-title :level="5">画面素材从哪来</a-typography-title>
        <ul class="help-list">
          <li>优先使用<b>「品牌素材库」</b>里上传的品牌视频（按每段分镜的关键词智能匹配，标签越全命中率越高）。</li>
          <li>没有视频素材时，自动回落内容工厂「素材库」的图片（动效合成），所以先去素材库上传产品图/实拍图，出片效果更好。</li>
        </ul>

        <a-typography-title :level="5">配音</a-typography-title>
        <ul class="help-list">
          <li>豆包音色（大模型自然度）/ 系统音色，创建时直接选、可试听。</li>
          <li>想要专属声线：去<b>「我的音色」</b>录 10 秒左右样本训练复刻音色，训练完成后创建视频时即可选用。</li>
        </ul>

        <a-typography-title :level="5">算力与失败保护</a-typography-title>
        <ul class="help-list">
          <li>每条视频按引擎扣算力（混剪 10 / AI成片 50），顶部实时显示<b>可用算力</b>。</li>
          <li>任务失败自动<b>全额退回算力</b>，可在列表点「重试」。</li>
        </ul>

        <a-typography-paragraph type="secondary" class="help-faq">
          常见问题：视频时长 15-30 秒竖版（1080×1920）；AI成片逐段生成约需 5-10 分钟属正常；生成期间可离开本页，任务在服务器排队继续。
        </a-typography-paragraph>
      </a-typography>
    </a-drawer>
  </PageWrapper>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Modal, message } from 'ant-design-vue';
import { AudioOutlined, FolderOutlined, PlusOutlined, QuestionCircleOutlined, UploadOutlined } from '@ant-design/icons-vue';
import PageWrapper from '../../components/PageWrapper.vue';
import FilterTopbar from '../../components/FilterTopbar.vue';
import ProductPickModal from './ProductPickModal.vue';
import { useAuthStore } from '../../stores/auth';
import { getVideoTasks, generateVideo, retryVideo, deleteVideoTask, getVoices, getMaterialVideos, uploadMaterialVideo, deleteMaterialVideo } from '../../api/hotspot';

const auth = useAuthStore();
const router = useRouter();
const brandId = computed(() => auth.currentBrandId ?? 1);

const list = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(12);
const loading = ref(false);
const pickOpen = ref(false);
const voiceNames = ref({});
let timer = null;

const matOpen = ref(false);
const helpOpen = ref(false);
const matUploading = ref(false);
const materials = ref([]);
const matTotal = ref(0);
const matPage = ref(1);
const matPageSize = 24;
const matLoading = ref(false);

const loadMaterials = async () => {
  matLoading.value = true;
  try {
    const res = await getMaterialVideos({ brandId: brandId.value, page: matPage.value, pageSize: matPageSize });
    materials.value = res?.items ?? [];
    matTotal.value = res?.total ?? 0;
  } finally {
    matLoading.value = false;
  }
};

const openMaterials = () => {
  matOpen.value = true;
  loadMaterials();
};

const onMaterialUpload = async (file) => {
  matUploading.value = true;
  try {
    await uploadMaterialVideo(file, brandId.value);
    message.success(`已上传 ${file.name}`);
    matPage.value = 1;
    await loadMaterials();
  } catch (e) {
    message.error(e?.message ?? '上传失败');
  } finally {
    matUploading.value = false;
  }
  return false;
};

const removeMaterial = async (m) => {
  try {
    await deleteMaterialVideo(m.id, { brandId: brandId.value });
    message.success('已删除');
    await loadMaterials();
  } catch (e) {
    message.error(e?.message ?? '删除失败');
  }
};

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

const create = async ({ productId, voice, engine }) => {
  pickOpen.value = false;
  try {
    await generateVideo(
      { brandId: brandId.value, productId, voice: voice ?? undefined, engine: engine ?? 'mixcut' },
      { brandId: brandId.value },
    );
    message.success(engine === 'aigc' ? 'AI成片任务已创建，逐段生成画面约 5-10 分钟' : '任务已创建，正在生成分镜与合成');
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

const remove = (t) => {
  Modal.confirm({
    title: `删除视频任务「${t.title || `#${t.id}`}」？`,
    content: '仅删除任务记录；已生成的视频文件保留在服务器上。',
    okType: 'danger',
    okText: '删除',
    onOk: async () => {
      try {
        await deleteVideoTask(t.id, { brandId: brandId.value });
        message.success('已删除');
        load();
      } catch (e) {
        message.error(e?.message ?? '删除失败');
      }
    },
  });
};

onMounted(async () => {
  load();
  const vs = await getVoices({ brandId: brandId.value }).catch(() => null);
  if (vs) voiceNames.value = Object.fromEntries((vs.items ?? []).map((v) => [v.id, v.name]));
});
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
.mat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
.mat-cell video { width: 100%; height: 200px; border-radius: 10px; background: #000; object-fit: contain; }
.mat-meta { display: flex; align-items: center; gap: 4px; margin-top: 6px; flex-wrap: wrap; }
.mat-tag { margin: 0; }
.mat-dur { color: #94a3b8; font-size: 12px; }
.mat-del { margin-left: auto; padding: 0 4px; }
.mat-toolbar-row { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.mat-hint { color: #94a3b8; font-size: 12px; }
.help-list { padding-left: 18px; margin: 4px 0 12px; }
.help-list li { margin-bottom: 6px; }
.help-faq { margin-top: 8px; background: #f8fafc; border-radius: 8px; padding: 10px 12px; }
</style>
