<template>
  <PageWrapper title="小红书图文(批量)">
    <div class="bt-container">
      <div class="gen-card">
        <div class="gc-title">批量图文创作</div>
        <div class="gc-sub">按创作策略批量生成多篇小红书图文，后台队列自动执行，结果自动存入历史记录</div>
        <div class="gc-form">
          <div class="gc-row">
            <span class="gc-label">产品</span>
            <a-select v-model:value="productId" style="width: 260px" :options="productOptions" placeholder="选择产品" />
          </div>
          <div class="gc-row">
            <span class="gc-label">创作策略</span>
            <a-select
              v-model:value="strategyId"
              style="width: 260px"
              :options="strategyOptions"
              placeholder="选择策略（可选）"
              allow-clear
            />
          </div>
          <div class="gc-row">
            <span class="gc-label">生成数量</span>
            <a-input-number v-model:value="qty" :min="1" :max="20" />
            <span class="gc-unit">篇（单次 ≤ 20）</span>
          </div>
          <div class="gc-row">
            <span class="gc-label">任务名称</span>
            <a-input v-model:value="taskName" style="width: 260px" placeholder="默认：{产品} × N 篇" />
          </div>
          <div class="gc-row">
            <span class="gc-label">补充要求</span>
            <a-input v-model:value="extra" style="width: 420px" placeholder="额外的写作要求（可选）" />
          </div>
          <a-button type="primary" size="large" class="gc-btn" :loading="creating" @click="create">
            开始批量生成
          </a-button>
        </div>
      </div>

      <div class="task-card">
        <div class="tc-head">
          <span class="tc-title">任务结果</span>
          <a-space>
            <span class="tc-count">共 {{ total }} 条</span>
            <a-button size="small" @click="loadTasks"><ReloadOutlined /> 刷新</a-button>
          </a-space>
        </div>
        <div class="list-head">
          <span style="width: 40px">状态</span>
          <span style="flex: 1">任务名称</span>
          <span style="width: 150px">产品</span>
          <span style="width: 150px">进度</span>
          <span style="width: 110px">成功/失败</span>
          <span style="width: 150px">创建时间</span>
        </div>
        <div v-for="t in tasks" :key="t.id" class="task-row">
          <span style="width: 40px"><span class="dot" :class="t.status" /></span>
          <span style="flex: 1" class="tr-name">{{ t.task_name }}</span>
          <span style="width: 150px" class="tr-sub">{{ t.product_name ?? '-' }}</span>
          <span style="width: 150px">
            <div class="prog"><div class="prog-in" :style="{ width: pct(t) }" :class="t.status" /></div>
          </span>
          <span style="width: 110px" class="tr-sub">{{ t.success_count }} 成功 / {{ t.failed_count }} 失败</span>
          <span style="width: 150px" class="tr-sub">{{ fmtTime(t.created_at) }}</span>
        </div>
        <a-empty v-if="!tasks.length" description="暂无批量任务" class="tc-empty" />
      </div>
    </div>
  </PageWrapper>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { message } from 'ant-design-vue';
import { ReloadOutlined } from '@ant-design/icons-vue';
import PageWrapper from '../../components/PageWrapper.vue';
import { useAuthStore } from '../../stores/auth';
import { getProducts } from '../../api/content';
import { getStrategies, batchGenerate, getBatchTasks } from '../../api/contentpro';

const auth = useAuthStore();
const brandId = computed(() => auth.currentBrandId ?? 1);

const productOptions = ref([]);
const strategyOptions = ref([]);
const productId = ref(null);
const strategyId = ref(null);
const qty = ref(5);
const taskName = ref('');
const extra = ref('');
const creating = ref(false);

const tasks = ref([]);
const total = ref(0);
let timer = null;

const flattenProducts = (nodes, out = []) => {
  for (const n of nodes ?? []) {
    if (n.type === 'product') out.push({ value: n.id, label: n.display_name ?? n.name });
    flattenProducts(n.children, out);
  }
  return out;
};

const create = async () => {
  if (!productId.value) {
    message.warning('请选择产品');
    return;
  }
  creating.value = true;
  try {
    await batchGenerate(
      {
        productId: productId.value,
        strategyId: strategyId.value,
        targetQuantity: qty.value,
        taskName: taskName.value || undefined,
        extra: extra.value || undefined,
      },
      { brandId: brandId.value },
    );
    message.success('批量任务已创建，后台生成中');
    await loadTasks();
  } finally {
    creating.value = false;
  }
};

const loadTasks = async () => {
  const res = await getBatchTasks({ brandId: brandId.value, page: 1, page_size: 20 });
  tasks.value = res?.list ?? [];
  total.value = res?.total ?? 0;
};

const pct = (t) => {
  const base = t.target_quantity || 1;
  return `${Math.min(100, Math.round(((t.success_count + t.failed_count) / base) * 100))}%`;
};

const fmtTime = (s) => (s ? new Date(s).toLocaleString('zh-CN', { hour12: false }).slice(0, 19) : '-');

onMounted(async () => {
  const [products, st] = await Promise.all([
    getProducts({ brandId: brandId.value }),
    getStrategies({ brandId: brandId.value }),
  ]);
  productOptions.value = flattenProducts(products);
  if (productOptions.value.length) productId.value = productOptions.value[0].value;
  strategyOptions.value = (st?.list ?? [])
    .filter((s) => s.enabled)
    .map((s) => ({ value: s.id, label: s.name }));
  await loadTasks();
  timer = setInterval(loadTasks, 5000);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<style scoped>
.bt-container {
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.gen-card {
  background: linear-gradient(135deg, #eef4ff 0%, #f6f2ff 100%);
  border: 1px solid #dbe6ff;
  border-radius: 16px;
  padding: 24px;
}

.gc-title {
  font-size: 18px;
  font-weight: 700;
  color: #1e293b;
}

.gc-sub {
  margin-top: 4px;
  color: #64748b;
  font-size: 13px;
}

.gc-form {
  margin-top: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.gc-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.gc-label {
  width: 70px;
  color: #475569;
  font-size: 13px;
  text-align: right;
}

.gc-unit {
  color: #94a3b8;
  font-size: 12px;
}

.gc-btn {
  margin-top: 8px;
  align-self: flex-start;
  padding: 0 34px;
  height: 44px;
  background: linear-gradient(90deg, #5c6ec8, #7c5cf0);
  border: none;
}

.task-card {
  background: #fff;
  border-radius: 16px;
  padding: 18px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.tc-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.tc-title {
  font-weight: 600;
  color: #1e293b;
}

.tc-count {
  color: #5087ec;
  font-size: 13px;
}

.list-head,
.task-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  font-size: 13px;
}

.list-head {
  color: #64748b;
  background: #f8fafc;
  border-radius: 8px;
  font-size: 12px;
}

.task-row {
  border-bottom: 1px solid #f1f5f9;
  color: #334155;
}

.tr-name {
  font-weight: 600;
}

.tr-sub {
  color: #94a3b8;
  font-size: 12.5px;
}

.dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #cbd5e1;
}

.dot.completed {
  background: #16a34a;
}

.dot.running,
.dot.pending {
  background: #3456e6;
}

.dot.failed,
.dot.cancelled {
  background: #dc2626;
}

.prog {
  height: 6px;
  border-radius: 3px;
  background: #e2e8f0;
  overflow: hidden;
}

.prog-in {
  height: 100%;
  border-radius: 3px;
  background: linear-gradient(90deg, #5c6ec8, #a7aef8);
}

.prog-in.completed {
  background: #16a34a;
}

.prog-in.failed {
  background: #dc2626;
}

.tc-empty {
  margin: 30px 0;
}
</style>
