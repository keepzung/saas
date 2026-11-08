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
      <a-form-item v-if="showVoice" label="配音音色">
        <div class="voice-row">
          <a-select v-model:value="voice" :options="voiceOptions" placeholder="默认（晓晓）" style="flex: 1" />
          <a-button :loading="previewing" :disabled="!voice" @click="tryPreview">试听</a-button>
        </div>
        <div class="voice-hint">不选则用系统默认音色（晓晓·女）</div>
      </a-form-item>
      <a-button type="primary" block :loading="submitting" :disabled="!productId" @click="submit">确定</a-button>
    </a-form>
  </a-modal>
</template>

<script setup>
import { ref, watch } from 'vue';
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
const productOptions = ref([]);
const strategyOptions = ref([]);
const voiceOptions = ref([]);
const voiceMeta = ref({ default: 'zh-CN-XiaoxiaoNeural', items: [] });
const previewing = ref(false);
const submitting = ref(false);
let previewAudio = null;

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
      if (vs) {
        voiceMeta.value = vs;
        voiceOptions.value = (vs.items ?? []).map((x) => ({
          value: x.id,
          label: `${x.name}（${x.gender}·${x.style}）`,
        }));
      }
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
    emit('picked', { productId: productId.value, strategyId: strategyId.value ?? null, voice: voice.value ?? null });
  } finally {
    submitting.value = false;
  }
};
</script>

<style scoped>
.voice-row { display: flex; gap: 8px; }
.voice-hint { font-size: 12px; color: #999; margin-top: 4px; }
</style>
