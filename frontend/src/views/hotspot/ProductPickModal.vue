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
      <a-button type="primary" block :loading="submitting" :disabled="!productId" @click="submit">确定</a-button>
    </a-form>
  </a-modal>
</template>

<script setup>
import { ref, watch } from 'vue';
import { message } from 'ant-design-vue';
import { getProducts } from '../../api/content';
import { getStrategies } from '../../api/contentpro';
import { useAuthStore } from '../../stores/auth';

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '选择产品' },
  withStrategy: { type: Boolean, default: false },
});
const emit = defineEmits(['update:open', 'picked']);

const auth = useAuthStore();
const brandId = () => auth.currentBrandId ?? 1;

const productId = ref(null);
const strategyId = ref(null);
const productOptions = ref([]);
const strategyOptions = ref([]);
const submitting = ref(false);

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
    const res = await getProducts({ brandId: brandId() }).catch(() => []);
    productOptions.value = flattenProducts(res ?? []);
    if (props.withStrategy) {
      const data = (await getStrategies({ brandId: brandId() }).catch(() => null)) ?? null;
      const list = Array.isArray(data) ? data : (data?.list ?? []);
      strategyOptions.value = list
        .filter((s) => s.enabled !== false)
        .map((s) => ({ value: s.id, label: s.name }));
    }
  },
);

const close = () => emit('update:open', false);

const submit = async () => {
  if (!productId.value) return message.warning('请选择产品');
  submitting.value = true;
  try {
    emit('picked', { productId: productId.value, strategyId: strategyId.value ?? null });
  } finally {
    submitting.value = false;
  }
};
</script>
