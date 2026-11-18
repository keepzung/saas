<template>
  <a-modal :open="open" :title="title" @cancel="close" :footer="null" width="480px">
    <a-form layout="vertical">
      <a-form-item label="产品" required>
        <a-select
          v-model:value="productId"
          show-search
          option-filter-prop="label"
          :options="productOptions"
          placeholder="选择要带货/推广的产品"
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
      <a-form-item v-if="showVoice" label="生成引擎">
        <a-radio-group v-model:value="engine" button-style="solid">
          <a-radio-button value="mixcut">智能混剪</a-radio-button>
          <a-radio-button value="aigc">AI成片·生成画面</a-radio-button>
        </a-radio-group>
        <div class="voice-hint">
          {{ engine === 'aigc'
            ? '每段画面由 CogVideoX AI 生成（素材库图片作首帧），约 5-10 分钟/条，画面全新但消耗算力更高（50 算力）'
            : '用品牌素材库图片/视频智能匹配镜头，约 1-3 分钟/条，消耗 10 算力' }}
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
      <a-button type="primary" block :loading="submitting" :disabled="!productId" @click="submit">确定</a-button>
    </a-form>
  </a-modal>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { message } from 'ant-design-vue';
import { getProducts } from '../../api/content';
import { getStrategies } from '../../api/contentpro';
import { getVoices, previewVoice } from '../../api/hotspot';
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

const productId = ref(null);
const strategyId = ref(null);
const voice = ref(null);
const engine = ref('mixcut');
const productOptions = ref([]);
const strategyOptions = ref([]);
const voiceMeta = ref({ default: 'zh-CN-XiaoxiaoNeural', items: [] });
const previewing = ref(false);
const submitting = ref(false);
let previewAudio = null;

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

watch(
  () => props.open,
  async (v) => {
    if (!v) return;
    productId.value = null;
    strategyId.value = null;
    voice.value = null;
    engine.value = 'mixcut';
    const res = await getProducts({ brandId: brandId() }).catch(() => []);
    productOptions.value = flattenProducts(res ?? []);
    if (props.withStrategy) {
      const data = (await getStrategies({ brandId: brandId() }).catch(() => null)) ?? null;
      const list = Array.isArray(data) ? data : (data?.list ?? []);
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
    });
  } finally {
    submitting.value = false;
  }
};
</script>

<style scoped>
.voice-row { display: flex; gap: 8px; }
.voice-hint { font-size: 12px; color: #999; margin-top: 4px; }
</style>
