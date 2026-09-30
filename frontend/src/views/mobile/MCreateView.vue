<template>
  <div class="mc-page">
    <!-- 任务上下文卡 -->
    <div v-if="task" class="task-card">
      <div class="tcard-head">
        <span class="tcard-flag">任务</span>
        <span class="tcard-name">{{ task.name }}</span>
        <span class="tcard-time">{{ fmt(task.start_time) }} ~ {{ fmt(task.end_time) }}</span>
      </div>
      <div v-if="task.instructions" class="tcard-line"><span>要求</span>{{ task.instructions }}</div>
      <div v-if="task.reward" class="tcard-line reward"><span>奖励</span>{{ task.reward }}</div>
      <a v-if="task.example_link" :href="task.example_link" target="_blank" class="tcard-link">
        示例内容：{{ task.example_link }}
      </a>
      <div v-if="task.example_images?.length" class="tcard-imgs">
        <img v-for="u in task.example_images" :key="u" :src="u" />
      </div>
    </div>
    <div v-if="draftLoaded" class="draft-tip">已带入 PC 端生成的草稿，确认配图后即可发布</div>

    <!-- 步骤指示 -->
    <div class="mc-steps">
      <span v-for="(s, i) in steps" :key="s" class="mc-step" :class="{ active: step === i + 1 }">{{ s }}</span>
    </div>

    <!-- Step 1 选择策略 -->
    <template v-if="step === 1">
      <div class="sec-label">产品</div>
      <a-select v-model:value="productId" style="width: 100%" :options="productOptions" size="large" />
      <div class="sec-label">选择一个创作策略</div>
      <div
        v-for="s in strategies"
        :key="s.id"
        class="st-item"
        :class="{ selected: s.id === strategyId }"
        @click="s.enabled && (strategyId = s.id)"
      >
        <div class="st-name">{{ s.name }}</div>
        <div class="st-desc">{{ s.description }}</div>
      </div>
      <a-button type="primary" block size="large" class="go-btn" :loading="generating" @click="generate">
        开始生成
      </a-button>
    </template>

    <!-- Step 2 生成结果 -->
    <template v-else-if="step === 2">
      <div class="article-card">
        <div class="ar-title-row">
          <div v-for="(t, i) in titles" :key="i" class="ar-title" :class="{ selected: i === selectedTitle }" @click="selectedTitle = i">
            {{ t }}
          </div>
        </div>
        <div class="ar-body">{{ content }}</div>
        <div class="ar-tags">
          <span v-for="t in tags" :key="t">#{{ t }}</span>
        </div>
      </div>
      <a-button block :loading="generating" style="margin-top: 10px" @click="regenerate">换一版</a-button>
      <a-button type="primary" block size="large" class="go-btn" @click="step = 3">
        确认点击下一步
      </a-button>
    </template>

    <!-- Step 3 配图 -->
    <template v-else-if="step === 3">
      <div class="sec-label">选择配图（点击选中/取消，最多 9 张）</div>
      <div class="img-grid">
        <div
          v-for="(img, i) in pool"
          :key="img.url"
          class="img-cell"
          :class="{ selected: img._sel }"
          @click="toggleImg(i)"
        >
          <img :src="img.url" loading="lazy" />
          <span v-if="img._sel" class="sel-badge">{{ selOrder(img) }}</span>
        </div>
      </div>
      <a-button block style="margin-top: 10px" :loading="matching" @click="loadPool(true)">换一批图片</a-button>
      <a-button type="primary" block size="large" class="go-btn" :disabled="!selCount" @click="step = 4">
        自动生成（{{ selCount }} 张）
      </a-button>
    </template>

    <!-- Step 4 发布 -->
    <template v-else>
      <div class="preview">
        <img v-if="selectedImages[0]" :src="selectedImages[0]" class="pv-cover" />
        <div class="pv-title">{{ titles[selectedTitle] }}</div>
        <div class="pv-body">{{ content }}</div>
        <div class="pv-tags"><span v-for="t in tags" :key="t">#{{ t }}</span></div>
      </div>
      <a-space direction="vertical" style="width: 100%; margin-top: 12px" :size="10">
        <a-button type="primary" block size="large" :loading="publishing" @click="publish">
          <SendOutlined /> 保存并发布小红书
        </a-button>
        <a-button block @click="copyText"><CopyOutlined /> 复制内容到小红书</a-button>
        <a-button block :disabled="!selectedImages.length" @click="downloadImages"><DownloadOutlined /> 保存图片</a-button>
      </a-space>
      <div v-if="published" class="pub-ok">
        已存入历史记录。打开小红书 App → 发布图文 → 粘贴文案 + 选择已保存图片即可。
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { message } from 'ant-design-vue';
import { CopyOutlined, DownloadOutlined, SendOutlined } from '@ant-design/icons-vue';
import { useAuthStore } from '../../stores/auth';
import { getProducts } from '../../api/content';
import {
  getStrategies,
  generateArticle,
  getRandomImages,
  saveXhsHistory,
  getXhsHistoryDetail,
  getContentTaskDetail,
  aiHealth,
} from '../../api/contentpro';

const route = useRoute();
const auth = useAuthStore();
const brandId = computed(() => auth.currentBrandId ?? 1);

const steps = ['选策略', '开始生成', '选择配图', '发布小红书'];
const step = ref(1);

// 任务上下文（?taskId=）与 PC 草稿接力（?historyId=）
const task = ref(null);
const draftLoaded = ref(false);
const draftId = ref(null);

const productOptions = ref([]);
const productId = ref(null);
const strategies = ref([]);
const strategyId = ref(null);
const generating = ref(false);
const matching = ref(false);
const publishing = ref(false);
const published = ref(false);
const health = ref({ llm: false });

const titles = ref([]);
const selectedTitle = ref(0);
const content = ref('');
const tags = ref([]);
const pool = ref([]);

const selCount = computed(() => pool.value.filter((x) => x._sel).length);
const selectedImages = computed(() => pool.value.filter((x) => x._sel).map((x) => x.url));
const selOrder = (img) => selectedImages.value.indexOf(img.url) + 1;
const fmt = (s) => (s ? new Date(s).toLocaleDateString('zh-CN').replaceAll('/', '-') : '-');

const flattenProducts = (nodes, out = []) => {
  for (const n of nodes ?? []) {
    if (n.type === 'product') out.push({ value: n.id, label: n.display_name ?? n.name });
    flattenProducts(n.children, out);
  }
  return out;
};

const generate = async () => {
  if (!productId.value) {
    message.warning('请先选择产品');
    return;
  }
  generating.value = true;
  try {
    const res = await generateArticle(
      { productId: productId.value, strategyId: strategyId.value },
      { brandId: brandId.value },
    );
    titles.value = res?.titles ?? [];
    selectedTitle.value = 0;
    content.value = res?.content ?? '';
    tags.value = res?.tags ?? [];
    step.value = 2;
  } catch (e) {
    message.error(e?.response?.data?.msg ?? '生成失败');
  } finally {
    generating.value = false;
  }
};

const regenerate = async () => {
  generating.value = true;
  try {
    const res = await generateArticle(
      { productId: productId.value, strategyId: strategyId.value, extra: '换一个角度重写' },
      { brandId: brandId.value },
    );
    titles.value = res?.titles ?? titles.value;
    content.value = res?.content ?? content.value;
    tags.value = res?.tags ?? tags.value;
  } finally {
    generating.value = false;
  }
};

const loadPool = async (force) => {
  matching.value = true;
  try {
    const res = await getRandomImages({ brandId: brandId.value, productId: productId.value, num: 9 });
    const fresh = (res ?? []).map((x) => ({ url: x.url, _sel: false }));
    pool.value = force ? fresh : [...pool.value, ...fresh].slice(0, 18);
  } finally {
    matching.value = false;
  }
};

const toggleImg = (i) => {
  const img = pool.value[i];
  if (!img._sel && selCount.value >= 9) {
    message.warning('最多选择 9 张');
    return;
  }
  img._sel = !img._sel;
};

const publish = async () => {
  publishing.value = true;
  try {
    const res = await saveXhsHistory(
      {
        id: draftId.value ?? undefined,
        title: titles.value[selectedTitle.value],
        content: content.value,
        tags: tags.value,
        imgList: selectedImages.value,
        coverUrl: selectedImages.value[0] ?? null,
        status: 1,
        source: health.value.llm ? 'ai' : 'template',
        ...(task.value ? { contentTaskId: task.value.id } : {}),
      },
      { brandId: brandId.value },
    );
    draftId.value = res?.id ?? draftId.value;
    published.value = true;
    message.success('已保存，可复制内容到小红书发布');
  } catch (e) {
    message.error(e?.response?.data?.msg ?? '保存失败');
  } finally {
    publishing.value = false;
  }
};

const copyText = async () => {
  await navigator.clipboard.writeText(
    `${titles.value[selectedTitle.value]}\n\n${content.value}\n\n${tags.value.map((t) => `#${t}`).join(' ')}`,
  );
  message.success('已复制，去小红书粘贴发布');
};

const downloadImages = () => {
  selectedImages.value.forEach((url, i) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = `note-${i + 1}.jpg`;
    a.target = '_blank';
    a.click();
  });
};


onMounted(async () => {
  // 1) 任务上下文
  const taskId = Number(route.query.taskId);
  if (taskId) {
    try {
      task.value = await getContentTaskDetail(taskId, { brandId: brandId.value });
    } catch {
      /* 任务加载失败按自由创作处理 */
    }
  }
  const [products, st, h] = await Promise.all([
    getProducts({ brandId: brandId.value }),
    getStrategies({ brandId: brandId.value }),
    aiHealth(),
  ]);
  productOptions.value = flattenProducts(products);
  if (productOptions.value.length) productId.value = productOptions.value[0].value;
  strategies.value = st?.list ?? [];
  const firstEnabled = strategies.value.find((s) => s.enabled);
  if (firstEnabled) strategyId.value = firstEnabled.id;
  health.value = h ?? health.value;

  // 2) PC 草稿接力（?historyId=）：带出图文直进配图/发布
  const historyId = Number(route.query.historyId);
  if (historyId) {
    try {
      const draft = await getXhsHistoryDetail(historyId, { brandId: brandId.value });
      titles.value = [draft.title];
      selectedTitle.value = 0;
      content.value = draft.content ?? '';
      tags.value = draft.tags ?? [];
      draftId.value = draft.id;
      if (draft.content_task_id && !task.value) {
        task.value = await getContentTaskDetail(draft.content_task_id, { brandId: brandId.value }).catch(() => null);
      }
      const imgs = (draft.img_list ?? []).map((url) => ({ url, _sel: true }));
      if (imgs.length) {
        pool.value = imgs;
        const extra = await getRandomImages({ brandId: brandId.value, productId: productId.value, num: 9 });
        for (const x of extra ?? []) {
          if (!imgs.some((i) => i.url === x.url)) pool.value.push({ url: x.url, _sel: false });
        }
      } else {
        await loadPool();
      }
      draftLoaded.value = true;
      step.value = 3;
      return;
    } catch {
      message.warning('草稿加载失败，已进入正常创作流程');
    }
  }
  await loadPool();
});
</script>

<style scoped>
.task-card {
  background: #fff;
  border-radius: 12px;
  padding: 12px;
  margin-bottom: 10px;
  border-left: 3px solid #3456e6;
}

.tcard-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.tcard-flag {
  background: #3456e6;
  color: #fff;
  font-size: 11px;
  border-radius: 4px;
  padding: 1px 6px;
  flex: 0 0 auto;
}

.tcard-name {
  font-weight: 700;
  color: #1e293b;
  font-size: 13.5px;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tcard-time {
  color: #94a3b8;
  font-size: 11px;
  flex: 0 0 auto;
}

.tcard-line {
  color: #475569;
  font-size: 12px;
  line-height: 1.6;
  margin-top: 3px;
}

.tcard-line span {
  color: #94a3b8;
  margin-right: 6px;
}

.tcard-line.reward span {
  color: #d97706;
}

.tcard-line.reward {
  color: #b45309;
}

.tcard-link {
  display: block;
  margin-top: 5px;
  color: #3456e6;
  font-size: 12px;
  word-break: break-all;
}

.tcard-imgs {
  margin-top: 8px;
  display: flex;
  gap: 6px;
  overflow-x: auto;
}

.tcard-imgs img {
  width: 64px;
  height: 64px;
  object-fit: cover;
  border-radius: 6px;
  flex: 0 0 auto;
}

.draft-tip {
  background: #e7f8ef;
  color: #15803d;
  border-radius: 8px;
  padding: 7px 10px;
  font-size: 12px;
  margin-bottom: 10px;
}

.mc-steps {
  display: flex;
  gap: 6px;
  margin-bottom: 14px;
  overflow-x: auto;
}

.mc-step {
  flex: 1;
  text-align: center;
  font-size: 12px;
  color: #94a3b8;
  background: #fff;
  border-radius: 999px;
  padding: 6px 4px;
  white-space: nowrap;
}

.mc-step.active {
  background: #3456e6;
  color: #fff;
  font-weight: 600;
}

.sec-label {
  font-weight: 600;
  color: #1e293b;
  margin: 12px 0 8px;
  font-size: 13.5px;
}

.st-item {
  background: #fff;
  border-radius: 12px;
  padding: 12px;
  margin-bottom: 8px;
  border: 1.5px solid transparent;
}

.st-item.selected {
  border-color: #3456e6;
  background: #eef4ff;
}

.st-name {
  font-weight: 600;
  color: #1e293b;
  font-size: 14px;
}

.st-desc {
  margin-top: 3px;
  color: #94a3b8;
  font-size: 12px;
}

.go-btn {
  margin-top: 16px;
}

.article-card {
  background: #fff;
  border-radius: 14px;
  padding: 14px;
}

.ar-title-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 10px;
}

.ar-title {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 8px 10px;
  font-weight: 600;
  color: #1e293b;
  font-size: 13px;
}

.ar-title.selected {
  border-color: #3456e6;
  background: #eef4ff;
}

.ar-body {
  white-space: pre-wrap;
  color: #334155;
  font-size: 13px;
  line-height: 1.75;
  max-height: 44vh;
  overflow: auto;
}

.ar-tags {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.ar-tags span {
  color: #3456e6;
  font-size: 12px;
}

.img-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.img-cell {
  position: relative;
  border-radius: 8px;
  overflow: hidden;
  aspect-ratio: 1;
  border: 2px solid transparent;
}

.img-cell.selected {
  border-color: #3456e6;
}

.img-cell img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.sel-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #3456e6;
  color: #fff;
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview {
  background: #fff;
  border-radius: 14px;
  padding: 14px;
}

.pv-cover {
  width: 100%;
  border-radius: 10px;
  aspect-ratio: 3/4;
  object-fit: cover;
}

.pv-title {
  margin-top: 10px;
  font-weight: 700;
  color: #1e293b;
}

.pv-body {
  margin-top: 6px;
  color: #475569;
  font-size: 12.5px;
  line-height: 1.7;
  white-space: pre-wrap;
  max-height: 34vh;
  overflow: auto;
}

.pv-tags {
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.pv-tags span {
  color: #3456e6;
  font-size: 12px;
}

.pub-ok {
  margin-top: 12px;
  background: #e7f8ef;
  color: #15803d;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 12.5px;
  line-height: 1.6;
}
</style>
