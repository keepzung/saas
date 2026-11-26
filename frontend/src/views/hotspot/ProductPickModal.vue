<template>
  <a-modal :open="open" :title="title" @cancel="close" :footer="null" width="680px">
    <a-steps :current="step" size="small" class="steps">
      <a-step title="产品" />
      <a-step v-if="isVideo" title="素材" />
      <a-step title="卖点/政策" />
      <a-step :title="showVoice ? '引擎音色' : '确认'" />
    </a-steps>

    <a-spin :spinning="stepLoading">
      <!-- 第1步：产品（复刻文案模式带创作策略） -->
      <div v-show="step === 0" class="step-body">
        <a-form layout="vertical">
          <a-form-item label="产品" required>
            <a-select
              v-model:value="productId"
              show-search
              option-filter-prop="label"
              :options="productOptions"
              placeholder="选择要带货/推广的产品"
              @change="onProductChange"
            />
          </a-form-item>
          <a-form-item v-if="withStrategy" label="创作策略（可选，取启用中的第一条为默认）">
            <a-select
              v-model:value="strategyId"
              allow-clear
              :options="strategyOptions"
              placeholder="不选则自动取启用中的策略"
            />
          </a-form-item>
        </a-form>
      </div>

      <!-- 第2步：素材（仅视频模式；可跳过=AI 自动匹配） -->
      <div v-show="step === 1 && isVideo" class="step-body">
        <div class="step-hint">
          从素材库勾选本产品的素材（可多选）。<b>不选则 AI 自动匹配</b>。视频按镜头顺序优先使用；图片在「AI成片」中优先作为画面首帧（AI 参考图片生成背景与运镜）。
        </div>
        <template v-if="materialVideos.length">
          <div class="group-lab">视频素材（{{ materialVideos.length }}，按勾选顺序分配到镜头）</div>
          <div class="mat-grid">
            <div v-for="m in materialVideos" :key="m.id" class="mat-cell" :class="{ picked: pickedVideos.includes(m.id) }" @click="toggleVid(m.id)">
              <video :src="m.url" :poster="m.thumbUrl ?? undefined" preload="metadata"></video>
              <div class="mat-meta">
                <a-checkbox :checked="pickedVideos.includes(m.id)" @click.stop @change="toggleVid(m.id)" />
                <span class="mat-name">{{ m.durationSec }}s</span>
              </div>
            </div>
          </div>
        </template>
        <a-empty v-else description="该产品暂无视频素材，可去「素材库」上传，或直接下一步让 AI 自动匹配" :image-style="{ height: '40px' }" />
        <template v-if="materialImages.length">
          <div class="group-lab">图片素材（{{ materialImages.length }}，AI成片画面首帧优先）</div>
          <div class="img-grid">
            <div v-for="m in materialImages" :key="m.id" class="img-cell" :class="{ picked: pickedImages.includes(m.id) }" @click="toggleImg(m.id)">
              <img :src="m.url" loading="lazy" />
              <div class="mat-meta">
                <a-checkbox :checked="pickedImages.includes(m.id)" @click.stop @change="toggleImg(m.id)" />
              </div>
            </div>
          </div>
        </template>
        <div v-if="!materialVideos.length && !materialImages.length" style="height: 8px"></div>
        <div class="skip-row">
          <a-button size="small" @click="clearMaterials">清空勾选（AI 自动匹配）</a-button>
        </div>
      </div>

      <!-- 第3步：卖点/销售政策（可跳过） -->
      <div v-show="(isVideo && step === 2) || (!isVideo && step === 1)" class="step-body">
        <div class="step-hint">
          勾选本次要重点突出的卖点/销售政策（来自素材库该产品的「产品卖点/销售政策」，可去素材库维护）。<b>不勾选则按产品全部信息自动创作</b>。
        </div>
        <template v-if="pointOptions.length">
          <a-checkbox-group v-model:value="pickedPoints" class="point-group">
            <div v-for="p in pointOptions" :key="p.value" class="point-row">
              <a-checkbox :value="p.value"><span class="point-text">{{ p.value }}</span></a-checkbox>
              <a-tag class="point-src">{{ p.source }}</a-tag>
            </div>
          </a-checkbox-group>
        </template>
        <a-empty v-else description="该产品暂无卖点/销售政策，可去「素材库」维护，或直接下一步" :image-style="{ height: '40px' }" />
      </div>

      <!-- 第4步：引擎音色 / 确认 -->
      <div v-show="(isVideo && step === 3) || (!isVideo && step === 2)" class="step-body">
        <a-form layout="vertical">
          <a-form-item v-if="showVoice" label="生成引擎">
            <a-radio-group v-model:value="engine" button-style="solid">
              <a-radio-button value="mixcut">智能混剪</a-radio-button>
              <a-radio-button value="aigc">AI成片·生成画面</a-radio-button>
            </a-radio-group>
            <div class="voice-hint">
              {{ engine === 'aigc'
                ? '每段画面由 AI 视频模型生成（勾选的图片作画面首帧，AI 生成背景与运镜），约 5-10 分钟/条，画面全新但消耗算力更高（50 算力）'
                : '用勾选/自动匹配的品牌素材图片视频智能匹配镜头，约 1-3 分钟/条，消耗 10 算力' }}
            </div>
          </a-form-item>
          <a-form-item v-if="showVoice" label="配音音色">
            <div class="voice-row">
              <a-select v-model:value="voice" placeholder="默认（晓晓）" style="flex: 1" allow-clear show-search option-filter-prop="label">
                <a-select-opt-group label="豆包音色（大模型·自然）">
                  <a-select-option v-for="x in doubaoVoices" :key="x.value" :value="x.value" :label="x.label">{{ x.label }}</a-select-option>
                </a-select-opt-group>
                <a-select-opt-group label="系统音色">
                  <a-select-option v-for="x in systemVoices" :key="x.value" :value="x.value" :label="x.label">{{ x.label }}</a-select-option>
                </a-select-opt-group>
                <a-select-opt-group v-if="customVoices.length" label="我的音色">
                  <a-select-option v-for="x in customVoices" :key="x.value" :value="x.value" :label="x.label">{{ x.label }}</a-select-option>
                </a-select-opt-group>
              </a-select>
              <a-button :loading="previewing" :disabled="!voice" @click="tryPreview">试听</a-button>
            </div>
            <div class="voice-hint">
              可用豆包大模型音色或系统音色，也可用自己声音复刻的专属音色；
              <router-link to="/hotspot/voices">去录制「我的音色」→</router-link>
            </div>
          </a-form-item>
          <div v-else class="confirm-summary">
            <div><b>{{ productName || '产品' }}</b>{{ pickedPoints.length ? `，重点围绕 ${pickedPoints.length} 条卖点/政策` : '' }}生成复刻文案</div>
          </div>
        </a-form>
      </div>

      <div class="step-actions">
        <a-button v-if="step > 0" style="flex: 0 0 auto" @click="step -= 1">上一步</a-button>
        <a-button v-if="!lastStep" type="primary" block :disabled="step === 0 && !productId" @click="next">下一步</a-button>
        <a-button v-else type="primary" block :loading="submitting" :disabled="step === 0 && !productId" @click="submit">确定</a-button>
      </div>
    </a-spin>
  </a-modal>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { message } from 'ant-design-vue';
import { getProducts } from '../../api/content';
import { getStrategies } from '../../api/contentpro';
import { getMaterialImages } from '../../api/contentpro';
import { getVoices, previewVoice, getMaterialVideos } from '../../api/hotspot';
import { useAuthStore } from '../../stores/auth';

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '选择产品' },
  withStrategy: { type: Boolean, default: false },
  showVoice: { type: Boolean, default: false },
});
const emit = defineEmits(['update:open', 'picked']);

const auth = useAuthStore();
const brandId = () => auth.currentBrandId ?? 1;

const isVideo = computed(() => props.showVoice);
const lastStep = computed(() => (isVideo.value ? step.value === 3 : step.value === 2));

const step = ref(0);
const stepLoading = ref(false);
const productId = ref(null);
const productName = ref('');
const strategyId = ref(null);
const voice = ref(null);
const engine = ref('mixcut');
const productOptions = ref([]);
const strategyOptions = ref([]);
const voiceMeta = ref({ default: 'zh-CN-XiaoxiaoNeural', items: [] });
const previewing = ref(false);
const submitting = ref(false);
let previewAudio = null;

const materialVideos = ref([]);
const materialImages = ref([]);
const pickedVideos = ref([]);
const pickedImages = ref([]);
const pointOptions = ref([]);
const pickedPoints = ref([]);

const toVoiceOption = (x) => ({
  value: x.id,
  label: x.custom ? `${x.name}（我的音色）` : `${x.name}（${x.gender}·${x.style}）`,
});
const doubaoVoices = computed(() =>
  (voiceMeta.value.items ?? []).filter((x) => x.provider === 'doubao').map(toVoiceOption),
);
const systemVoices = computed(() => (voiceMeta.value.items ?? []).filter((x) => !x.custom && x.provider !== 'doubao').map(toVoiceOption));
const customVoices = computed(() => (voiceMeta.value.items ?? []).filter((x) => x.custom).map(toVoiceOption));

const flattenProducts = (nodes, out = []) => {
  for (const n of nodes ?? []) {
    if (n.type === 'product') out.push({ value: n.id, label: n.display_name ?? n.name });
    flattenProducts(n.children, out);
  }
  return out;
};

/** 卖点/政策条目：产品知识按行、销售政策按行+分号切，标注来源 */
const buildPointOptions = (product, strategies) => {
  const opts = [];
  const seen = new Set();
  const push = (text, source) => {
    const t = String(text ?? '').trim();
    if (t.length < 2 || seen.has(t)) return;
    seen.add(t);
    opts.push({ value: t, source });
  };
  (product?.knowledge ?? '')
    .split('\n')
    .forEach((line) => push(line, '卖点'));
  const policy = product?.basic_info?.sales_policy ?? product?.salesPolicy ?? '';
  policy
    .split(/[\n；;]/)
    .forEach((line) => push(line, '政策'));
  const strat = strategies?.find((s) => s.id === strategyId.value) ?? strategies?.[0];
  (Array.isArray(strat?.sellingPoints) ? strat.sellingPoints : []).forEach((p) => push(p, '策略'));
  return opts.slice(0, 30);
};

const loadProductExtras = async () => {
  materialVideos.value = [];
  materialImages.value = [];
  pickedVideos.value = [];
  pickedImages.value = [];
  pointOptions.value = [];
  pickedPoints.value = [];
  if (!productId.value) {
    productName.value = '';
    return;
  }
  const node = productOptions.value.find((o) => o.value === productId.value);
  productName.value = node?.label ?? '';
  stepLoading.value = true;
  try {
    const tasks = [];
    if (isVideo.value) {
      tasks.push(
        getMaterialVideos({ brandId: brandId(), pageSize: 60, productNodeId: productId.value }).then(
          (r) => (materialVideos.value = r?.items ?? []),
        ).catch(() => {}),
      );
      tasks.push(
        getMaterialImages({ brandId: brandId(), pageSize: 60, productNodeId: productId.value, includeUnassigned: '1' }).then(
          (r) => (materialImages.value = r?.list ?? []),
        ).catch(() => {}),
      );
    }
    // 卖点条目需要产品的 knowledge/salesPolicy 原文（选项里只有 label），单独取产品树
    tasks.push(
      getProducts({ brandId: brandId() }).then((nodes) => {
        const flat = [];
        const walk = (list) => {
          for (const n of list ?? []) {
            if (n.id === productId.value) flat.push(n);
            walk(n.children);
          }
        };
        walk(nodes);
        const p = flat[0];
        const stratList = Array.isArray(strategiesCache.value) ? strategiesCache.value : [];
        pointOptions.value = buildPointOptions(p, stratList);
      }).catch(() => {}),
    );
    await Promise.all(tasks);
  } finally {
    stepLoading.value = false;
  }
};

const strategiesCache = ref([]);

const onProductChange = () => {
  void loadProductExtras();
};

watch(
  () => props.open,
  async (v) => {
    if (!v) return;
    step.value = 0;
    productId.value = null;
    productName.value = '';
    strategyId.value = null;
    voice.value = null;
    engine.value = 'mixcut';
    materialVideos.value = [];
    materialImages.value = [];
    pickedVideos.value = [];
    pickedImages.value = [];
    pointOptions.value = [];
    pickedPoints.value = [];
    const res = await getProducts({ brandId: brandId() }).catch(() => []);
    productOptions.value = flattenProducts(res ?? []);
    if (props.withStrategy) {
      const data = (await getStrategies({ brandId: brandId() }).catch(() => null)) ?? null;
      const list = Array.isArray(data) ? data : (data?.list ?? []);
      strategiesCache.value = list;
      strategyOptions.value = list
        .filter((s) => s.enabled !== false)
        .map((s) => ({ value: s.id, label: s.name }));
    }
    if (props.showVoice) {
      const vs = (await getVoices({ brandId: brandId() }).catch(() => null)) ?? null;
      if (vs) voiceMeta.value = vs;
    }
  },
);

const toggleVid = (id) => {
  const i = pickedVideos.value.indexOf(id);
  if (i > -1) pickedVideos.value.splice(i, 1);
  else pickedVideos.value.push(id);
};
const toggleImg = (id) => {
  const i = pickedImages.value.indexOf(id);
  if (i > -1) pickedImages.value.splice(i, 1);
  else pickedImages.value.push(id);
};
const clearMaterials = () => {
  pickedVideos.value = [];
  pickedImages.value = [];
};

const next = () => {
  step.value += 1;
};

const close = () => emit('update:open', false);

const tryPreview = async () => {
  if (!voice.value) return;
  previewing.value = true;
  try {
    const r = await previewVoice({ voice: voice.value });
    previewAudio?.pause();
    previewAudio = new Audio(r.url);
    await previewAudio.play().catch(() => message.warning('浏览器拦截了自动播放，请再点一次试听'));
  } catch (e) {
    message.error(e?.message ?? '试听生成失败');
  } finally {
    previewing.value = false;
  }
};

const submit = async () => {
  if (!productId.value) return message.warning('请选择产品');
  submitting.value = true;
  try {
    emit('picked', {
      productId: productId.value,
      strategyId: strategyId.value ?? null,
      voice: voice.value ?? null,
      engine: props.showVoice ? engine.value : undefined,
      materialVideoIds: pickedVideos.value,
      materialImageIds: pickedImages.value,
      focusPoints: pickedPoints.value,
    });
  } finally {
    submitting.value = false;
  }
};
</script>

<style scoped>
.steps { margin-bottom: 16px; }
.step-body { min-height: 220px; max-height: 420px; overflow-y: auto; }
.step-hint { color: #999; font-size: 12px; margin-bottom: 10px; line-height: 1.6; }
.group-lab { font-weight: 600; color: #555; margin: 10px 0 8px; }
.mat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; }
.mat-cell { border: 2px solid transparent; border-radius: 8px; overflow: hidden; cursor: pointer; background: #000; }
.mat-cell.picked { border-color: #1677ff; }
.mat-cell video { width: 100%; height: 96px; object-fit: contain; display: block; background: #000; }
.img-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 8px; }
.img-cell { border: 2px solid transparent; border-radius: 8px; overflow: hidden; cursor: pointer; background: #fafafa; }
.img-cell.picked { border-color: #1677ff; }
.img-cell img { width: 100%; height: 80px; object-fit: cover; display: block; }
.mat-meta { display: flex; align-items: center; gap: 4px; padding: 3px 6px; background: #fff; }
.mat-name { font-size: 12px; color: #666; }
.skip-row { margin-top: 10px; }
.point-group { display: block; }
.point-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; }
.point-text { font-size: 13px; }
.point-src { margin: 0; flex-shrink: 0; font-size: 11px; line-height: 16px; padding: 0 6px; }
.voice-row { display: flex; gap: 8px; }
.voice-hint { font-size: 12px; color: #999; margin-top: 4px; }
.confirm-summary { color: #555; font-size: 13px; padding: 8px 0; }
.step-actions { display: flex; gap: 10px; margin-top: 14px; }
</style>
