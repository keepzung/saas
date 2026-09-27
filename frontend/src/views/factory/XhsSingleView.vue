<template>
  <div class="wizard-page">
    <!-- 深色步骤条 -->
    <div class="wz-stepper">
      <div class="wz-steps">
        <template v-for="(s, i) in steps" :key="s.key">
          <button
            type="button"
            class="wz-step"
            :class="{ active: step === i + 1, done: step > i + 1 }"
            @click="goStep(i + 1)"
          >
            <span class="wz-step-dot">{{ step > i + 1 ? '✓' : i + 1 }}</span>
            {{ s.name }}
          </button>
          <span v-if="i < steps.length - 1" class="wz-step-arrow">›</span>
        </template>
      </div>
      <div class="wz-actions">
        <a-button size="small" class="dark-btn" @click="resetAll">再写一篇</a-button>
        <a-button size="small" class="dark-btn" @click="goHistory">历史记录</a-button>
        <span class="wz-quota">⚡ 可用算力 {{ health.llm ? '∞' : '1,905' }}</span>
      </div>
    </div>

    <div class="wz-body">
      <!-- Step 1 输入写作要求 -->
      <template v-if="step === 1">
        <div class="sec-title"><span class="bar" /> 选择一项产品或者服务</div>
        <a-select
          v-model:value="productId"
          style="width: 100%"
          size="large"
          placeholder="请选择产品"
          :options="productOptions"
        />
        <div class="two-col">
          <div class="col-card">
            <div class="col-head"><BulbOutlined /> 创作策略 ({{ strategies.length }})</div>
            <div
              v-for="s in strategies"
              :key="s.id"
              class="strategy-item"
              :class="{ selected: s.id === strategyId, disabled: !s.enabled }"
              @click="s.enabled && (strategyId = s.id)"
            >
              <div class="si-name">
                {{ s.name }}
                <CheckOutlined v-if="s.id === strategyId" class="si-check" />
              </div>
              <div class="si-desc">{{ s.description }}</div>
            </div>
            <a-empty v-if="!strategies.length" :image="Empty.PRESENTED_IMAGE_SIMPLE" description="暂无创作策略，请先到「创作策略Pro」创建" />
          </div>
          <div class="col-card">
            <div class="col-head"><AimOutlined /> 内容方向 ({{ currentDirections.length }})</div>
            <div
              v-for="(d, i) in currentDirections"
              :key="i"
              class="dir-item"
              :class="{ selected: directionIndex === i }"
              @click="directionIndex = i"
            >
              <div class="si-name">
                {{ d.name }}
                <CheckOutlined v-if="directionIndex === i" class="si-check" />
              </div>
              <div class="si-desc">{{ d.description }}</div>
            </div>
            <div v-if="!currentDirections.length" class="dir-empty">选择创作策略后展示内容方向</div>
          </div>
        </div>
        <div class="sec-title" style="margin-top: 18px"><span class="bar" /> 额外写作要求</div>
        <a-textarea
          v-model:value="extra"
          :rows="3"
          placeholder="您可以在这里输入额外的写作要求~（如：突出限时优惠、侧重宝妈场景、语气更专业）"
        />
        <div class="bottom-bar">
          <a-button @click="resetAll"><ReloadOutlined /> 重置输入项</a-button>
          <div class="bottom-right">
            <span class="model-pill">选择模型 <SettingOutlined /> 智能模型</span>
            <a-button type="primary" size="large" :loading="generating" @click="generate">
              开始写作 <span class="cost">⚡ 1</span>
            </a-button>
          </div>
        </div>
      </template>

      <!-- Step 2 生成文章 -->
      <template v-else-if="step === 2">
        <div class="chat-user">帮我写一篇内容</div>
        <a-spin :spinning="generating" tip="AI 正在写作中...">
          <div class="article-card">
            <div class="ac-head">
              <span class="ac-badge">已完成写作思考</span>
              <a v-if="titles.length > 1" @click="titlesExpanded = !titlesExpanded">{{ titlesExpanded ? '收起' : '展开' }}</a>
            </div>
            <div class="title-row" v-if="titlesExpanded">
              <div
                v-for="(t, i) in titles"
                :key="i"
                class="title-cell"
                :class="{ selected: i === selectedTitle }"
                @click="selectedTitle = i"
              >
                <span class="tc-label">{{ i === 0 ? '主推' : `备选${i}` }}</span>
                <div class="tc-text">{{ t }}</div>
              </div>
            </div>
            <div class="article-body">{{ content }}</div>
            <div class="article-tags">
              <a-tag v-for="t in tags" :key="t" class="a-tag">#{{ t }}</a-tag>
            </div>
            <div class="ac-footer">
              <a-button size="small" @click="copyText"><CopyOutlined /> 复制</a-button>
              <a-button type="primary" size="small" @click="confirmArticle">
                确认使用该文章，进行下一步编辑&gt;&gt;
              </a-button>
            </div>
          </div>
        </a-spin>
        <div class="regen-bar">
          <a-input v-model:value="regenPrompt" placeholder="请输入您的修改要求..." @pressEnter="regenerate" />
          <a-button type="primary" shape="circle" :loading="generating" @click="regenerate">
            <ArrowUpOutlined />
          </a-button>
        </div>
      </template>

      <!-- Step 3 编辑文章 -->
      <template v-else-if="step === 3">
        <div class="edit-hint">您可以在这一步进行文章细节调整，修改部分文案、优化标题、增加标签等</div>
        <div class="edit-block">
          <div class="eb-head">
            <span><EditOutlined /> 标题</span>
            <span class="eb-count">{{ titleLen }}/20</span>
          </div>
          <a-input v-model:value="titles[selectedTitle]" :maxlength="22" />
        </div>
        <div class="edit-block">
          <div class="eb-head">
            <span><FileTextOutlined /> 正文</span>
            <span class="eb-count">{{ contentLen }}/1000</span>
          </div>
          <a-textarea v-model:value="content" :rows="14" :maxlength="1000" />
        </div>
        <div class="edit-block">
          <div class="eb-head"><span><TagsOutlined /> 标签</span></div>
          <div class="tags-row">
            <a-tag v-for="(t, i) in tags" :key="t + i" closable class="a-tag" @close="tags.splice(i, 1)">
              #{{ t }}
            </a-tag>
            <a-input
              v-if="tagAdding"
              v-model:value="tagDraft"
              size="small"
              style="width: 120px"
              @pressEnter="addTag"
              @blur="addTag"
            />
            <a-button v-else type="dashed" size="small" @click="tagAdding = true">
              <PlusOutlined /> 添加标签
            </a-button>
          </div>
        </div>
        <div class="bottom-bar">
          <a-button><ThunderboltOutlined /> AI标题修改</a-button>
          <a-button type="primary" @click="toMatch">文章内容确认，去匹配图片素材 &gt;&gt;</a-button>
        </div>
      </template>

      <!-- Step 4 智能配图 -->
      <template v-else-if="step === 4">
        <div class="match-head">
          <span>已智能匹配<span class="hl">{{ productName }}</span>的图片</span>
          <a-tag color="blue">已选择 {{ images.length }}/最多12</a-tag>
        </div>
        <div class="match-hint">拖动图片可以调整顺序，也可以从右侧素材库查找添加指定的产品素材图片</div>
        <div class="match-layout">
          <div class="selected-grid">
            <div
              v-for="(img, i) in images"
              :key="img.url"
              class="sel-cell"
              draggable="true"
              @dragstart="dragIndex = i"
              @dragover.prevent
              @drop="onDrop(i)"
            >
              <span v-if="i === 0" class="cover-tag">封面</span>
              <img :src="img.url" class="sel-img" />
              <div class="sel-ops">
                <span @click="move(i, -1)"><ArrowLeftOutlined /></span>
                <span @click="removeImage(i)"><DeleteOutlined /></span>
              </div>
            </div>
            <div
              v-if="images.length < 12"
              class="sel-cell add-cell"
              @click="matchImages()"
            >
              <PlusOutlined />
            </div>
          </div>
          <div class="material-panel">
            <div class="mp-head">
              <PictureOutlined /> 产品素材库
              <a-select v-model:value="mpSet" size="small" style="width: 120px" allow-clear placeholder="按套图" :options="setOptions" />
              <a-select v-model:value="mpType" size="small" style="width: 100px" allow-clear placeholder="按标签" :options="typeOptions" />
            </div>
            <div class="mp-grid">
              <img
                v-for="m in materialPool"
                :key="m.id"
                :src="m.url"
                class="mp-img"
                @click="addImage(m)"
              />
            </div>
          </div>
        </div>
        <div class="bottom-bar">
          <a-space>
            <a-button @click="coverOpen = true"><HighlightOutlined /> 添加文字封面</a-button>
            <a-upload :show-upload-list="false" :before-upload="uploadLocal" accept=".png,.jpg,.jpeg,.webp">
              <a-button><UploadOutlined /> 上传本地图片</a-button>
            </a-upload>
            <a-button :loading="matching" @click="matchImages(true)"><ReloadOutlined /> 重新匹配全部图片</a-button>
          </a-space>
          <a-button type="primary" size="large" :disabled="!images.length" @click="step = 5">
            已准备好图片，前往发布 &gt;&gt;
          </a-button>
        </div>
        <CoverEditor
          :open="coverOpen"
          :bg-image="images[0]?.url ?? ''"
          :title="titles[selectedTitle]"
          @close="coverOpen = false"
          @apply="onCoverApply"
        />
      </template>

      <!-- Step 5 预览发布 -->
      <template v-else-if="step === 5">
        <div class="publish-layout">
          <div class="phone-card">
            <img v-if="images[0]" :src="images[0]" class="pc-cover" />
            <div class="pc-title">{{ titles[selectedTitle] }}</div>
            <div class="pc-body">{{ content }}</div>
            <div class="pc-tags">
              <span v-for="t in tags" :key="t" class="pc-tag">#{{ t }}</span>
            </div>
            <div class="pc-imgs">
              <img v-for="img in images" :key="img.url" :src="img.url" />
            </div>
          </div>
          <div class="publish-side">
            <div class="ps-title">发布前确认</div>
            <div class="ps-row"><span>标题</span>{{ titles[selectedTitle] }}</div>
            <div class="ps-row"><span>配图</span>{{ images.length }} 张</div>
            <div class="ps-row"><span>标签</span>{{ tags.length }} 个</div>
            <a-space direction="vertical" style="width: 100%; margin-top: 18px">
              <a-button type="primary" block :loading="publishing" @click="publish">
                <SendOutlined /> 保存并进入发布
              </a-button>
              <a-button block @click="copyText"><CopyOutlined /> 复制文案</a-button>
              <a-button block @click="downloadImages"><DownloadOutlined /> 下载图片</a-button>
            </a-space>
            <div class="ps-tip">发布到小红书：复制文案 + 保存图片，打开小红书 App 粘贴发布；保存后在手机端继续操作</div>
            <div v-if="publishUrl" class="ps-link">
              <a :href="publishUrl" target="_blank">{{ publishUrl }}</a>
              <a-button size="small" @click="copy(publishUrl)">复制链接</a-button>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { message, Empty } from 'ant-design-vue';
import {
  BulbOutlined,
  AimOutlined,
  CheckOutlined,
  ReloadOutlined,
  SettingOutlined,
  CopyOutlined,
  ArrowUpOutlined,
  EditOutlined,
  FileTextOutlined,
  TagsOutlined,
  PlusOutlined,
  ThunderboltOutlined,
  PictureOutlined,
  ArrowLeftOutlined,
  DeleteOutlined,
  HighlightOutlined,
  UploadOutlined,
  SendOutlined,
  DownloadOutlined,
} from '@ant-design/icons-vue';
import { useAuthStore } from '../../stores/auth';
import { getProducts } from '../../api/content';
import {
  getStrategies,
  generateArticle,
  getRandomImages,
  saveXhsHistory,
  aiHealth,
  getMaterialTags,
  getMaterialSets,
  getMaterialImages,
  uploadMaterialImage,
} from '../../api/contentpro';
import CoverEditor from './CoverEditor.vue';

const router = useRouter();
const auth = useAuthStore();
const brandId = computed(() => auth.currentBrandId ?? 1);

const steps = [
  { key: 'input', name: '输入写作要求' },
  { key: 'gen', name: '生成文章' },
  { key: 'edit', name: '编辑文章' },
  { key: 'img', name: '智能配图' },
  { key: 'pub', name: '预览发布' },
];

const step = ref(1);
const health = ref({ llm: false, model: 'glm-4-flash' });

// step1
const productOptions = ref([]);
const productId = ref(null);
const strategies = ref([]);
const strategyId = ref(null);
const directionIndex = ref(0);
const extra = ref('');
const generating = ref(false);
const regenPrompt = ref('');

// step2/3
const titles = ref([]);
const selectedTitle = ref(0);
const titlesExpanded = ref(true);
const content = ref('');
const tags = ref([]);
const tagAdding = ref(false);
const tagDraft = ref('');

// step4
const images = ref([]);
const dragIndex = ref(-1);
const matching = ref(false);
const materialPool = ref([]);
const mpSet = ref(null);
const mpType = ref(null);
const mpTags = ref([]);
const mpSets = ref([]);
const coverOpen = ref(false);

// step5
const publishing = ref(false);
const publishUrl = ref('');

const currentDirections = computed(() => {
  const s = strategies.value.find((x) => x.id === strategyId.value);
  return s?.content_directions ?? [];
});
const productName = computed(() => {
  for (const opt of productOptions.value) {
    if (opt.value === productId.value) return opt.label;
  }
  return '产品';
});
const titleLen = computed(() => (titles.value[selectedTitle.value] ?? '').length);
const contentLen = computed(() => (content.value ?? '').length);

const setOptions = computed(() => mpSets.value.map((s) => ({ label: s.name, value: s.id })));
const typeOptions = computed(() => mpTags.value.map((t) => ({ label: t.name, value: t.id })));

const flattenProducts = (nodes, out = []) => {
  for (const n of nodes ?? []) {
    if (n.type === 'product') out.push({ value: n.id, label: n.display_name ?? n.name });
    flattenProducts(n.children, out);
  }
  return out;
};

const loadBase = async () => {
  const [products, st, h] = await Promise.all([
    getProducts({ brandId: brandId.value }),
    getStrategies({ brandId: brandId.value }),
    aiHealth(),
  ]);
  productOptions.value = flattenProducts(products);
  if (!productId.value && productOptions.value.length) productId.value = productOptions.value[0].value;
  strategies.value = st?.list ?? [];
  if (!strategyId.value && strategies.value.length) {
    const first = strategies.value.find((s) => s.enabled) ?? strategies.value[0];
    strategyId.value = first.id;
  }
  health.value = h ?? health.value;
};

const loadMaterialMeta = async () => {
  const [t, s] = await Promise.all([
    getMaterialTags({ brandId: brandId.value }),
    getMaterialSets({ brandId: brandId.value }),
  ]);
  mpTags.value = t?.list ?? [];
  mpSets.value = s?.list ?? [];
};

const generate = async () => {
  if (!productId.value) {
    message.warning('请先选择产品');
    return;
  }
  generating.value = true;
  step.value = 2;
  try {
    const dir = currentDirections.value[directionIndex.value];
    const res = await generateArticle(
      {
        productId: productId.value,
        strategyId: strategyId.value,
        extra: [extra.value, dir ? `内容方向：${dir.name}（${dir.description ?? ''}）` : ''].filter(Boolean).join('；'),
      },
      { brandId: brandId.value },
    );
    titles.value = res?.titles ?? [];
    selectedTitle.value = 0;
    titlesExpanded.value = true;
    content.value = res?.content ?? '';
    tags.value = res?.tags ?? [];
    if (res?.source === 'template') {
      message.info('当前为内置模板生成，配置 LLM_API_KEY 后自动切换大模型');
    }
  } catch (e) {
    message.error(e?.response?.data?.msg ?? '生成失败');
    step.value = 1;
  } finally {
    generating.value = false;
  }
};

const regenerate = async () => {
  if (!regenPrompt.value.trim()) return;
  generating.value = true;
  try {
    const res = await generateArticle(
      { productId: productId.value, strategyId: strategyId.value, extra: `${extra.value}；${regenPrompt.value}` },
      { brandId: brandId.value },
    );
    titles.value = res?.titles ?? titles.value;
    selectedTitle.value = 0;
    content.value = res?.content ?? content.value;
    tags.value = res?.tags ?? tags.value;
    regenPrompt.value = '';
  } finally {
    generating.value = false;
  }
};

const confirmArticle = () => {
  step.value = 3;
};

const toMatch = () => {
  step.value = 4;
  if (!images.value.length) matchImages(true);
};

const matchImages = async (force) => {
  matching.value = true;
  try {
    const num = force ? 4 : Math.min(12 - images.value.length, 4);
    const res = await getRandomImages({ brandId: brandId.value, productId: productId.value, num });
    const urls = (res ?? []).map((x) => ({ url: x.url, name: x.name }));
    images.value = force ? urls : [...images.value, ...urls].slice(0, 12);
  } finally {
    matching.value = false;
  }
};

const loadPool = async () => {
  const res = await getMaterialImages({
    brandId: brandId.value,
    page: 1,
    pageSize: 60,
    setId: mpSet.value ?? undefined,
    typeId: mpType.value ?? undefined,
  });
  materialPool.value = res?.list ?? [];
};

const addImage = (m) => {
  if (images.value.length >= 12) {
    message.warning('最多选择 12 张');
    return;
  }
  if (images.value.some((x) => x.url === m.url)) return;
  images.value.push({ url: m.url, name: m.name });
};

const removeImage = (i) => {
  images.value.splice(i, 1);
};

const move = (i, d) => {
  const j = i + d;
  if (j < 0 || j >= images.value.length) return;
  const arr = [...images.value];
  [arr[i], arr[j]] = [arr[j], arr[i]];
  images.value = arr;
};

const onDrop = (i) => {
  if (dragIndex.value < 0 || dragIndex.value === i) return;
  const arr = [...images.value];
  const [m] = arr.splice(dragIndex.value, 1);
  arr.splice(i, 0, m);
  images.value = arr;
  dragIndex.value = -1;
};

const uploadLocal = async (file) => {
  try {
    const res = await uploadMaterialImage(file, brandId.value);
    if (!res?.url) throw new Error(res?.error ?? '上传失败');
    images.value.push({ url: res.url, name: file.name });
  } catch (e) {
    message.error(e?.message ?? '上传失败');
  }
  return false;
};

const onCoverApply = async ({ dataUrl }) => {
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], 'cover.png', { type: 'image/png' });
    const res = await uploadMaterialImage(file, brandId.value);
    if (!res?.url) throw new Error(res?.error ?? '封面上传失败');
    images.value.unshift({ url: res.url, name: '文字封面' });
    coverOpen.value = false;
    message.success('文字封面已添加');
  } catch (e) {
    message.error(e?.message ?? '封面上传失败');
  }
};

const addTag = () => {
  const v = tagDraft.value.trim().replace(/^#/, '');
  if (v && !tags.value.includes(v)) tags.value.push(v);
  tagDraft.value = '';
  tagAdding.value = false;
};

const publish = async () => {
  publishing.value = true;
  try {
    await saveXhsHistory(
      {
        title: titles.value[selectedTitle.value],
        content: content.value,
        tags: tags.value,
        imgList: images.value.map((x) => x.url),
        coverUrl: images.value[0]?.url ?? null,
        source: health.value.llm ? 'ai' : 'template',
      },
      { brandId: brandId.value },
    );
    message.success('已存入历史记录');
    const q = `title=${encodeURIComponent(titles.value[selectedTitle.value])}&brand=${brandId.value}`;
    publishUrl.value = `${window.location.origin}/m/aigc/create?${q}`;
  } catch (e) {
    message.error(e?.response?.data?.msg ?? '保存失败');
  } finally {
    publishing.value = false;
  }
};

const copy = async (text) => {
  await navigator.clipboard.writeText(text);
  message.success('已复制');
};
const copyText = () =>
  copy(`${titles.value[selectedTitle.value]}\n\n${content.value}\n\n${tags.value.map((t) => `#${t}`).join(' ')}`);

const downloadImages = () => {
  images.value.forEach((img, i) => {
    const a = document.createElement('a');
    a.href = img.url;
    a.download = `${titles.value[selectedTitle.value] ?? 'note'}-${i + 1}.jpg`;
    a.target = '_blank';
    a.click();
  });
};

const goStep = (n) => {
  if (n === 1) step.value = 1;
  else if (n === 2 && titles.value.length) step.value = 2;
  else if (n === 3 && content.value) step.value = 3;
  else if (n === 4 && content.value) toMatch();
  else if (n === 5 && images.value.length) step.value = 5;
};

const resetAll = () => {
  step.value = 1;
  titles.value = [];
  content.value = '';
  tags.value = [];
  images.value = [];
  extra.value = '';
  regenPrompt.value = '';
  publishUrl.value = '';
};

const goHistory = () => router.push('/content-pro/history');

watch(mpSet, loadPool);
watch(mpType, loadPool);

onMounted(async () => {
  await Promise.all([loadBase(), loadMaterialMeta()]);
  await loadPool();
});
</script>

<style scoped>
.wizard-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.wz-stepper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 54px;
  min-height: 54px;
  padding: 0 20px;
  background: #02152f;
  color: #fff;
}

.wz-steps {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
}

.wz-step {
  display: flex;
  align-items: center;
  gap: 7px;
  border: none;
  background: rgba(255, 255, 255, 0.08);
  color: #8ea3c0;
  border-radius: 999px;
  padding: 6px 14px;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}

.wz-step.active {
  background: #3456e6;
  color: #fff;
  font-weight: 600;
}

.wz-step.done {
  background: rgba(22, 163, 74, 0.22);
  color: #4ade80;
}

.wz-step-dot {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.18);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
}

.wz-step-arrow {
  color: #33507a;
}

.wz-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dark-btn {
  background: rgba(255, 255, 255, 0.1);
  border: none;
  color: #dbeafe;
}

.wz-quota {
  color: #facc15;
  font-size: 13px;
  white-space: nowrap;
}

.wz-body {
  flex: 1;
  overflow: auto;
  padding: 18px 22px;
}

.sec-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 10px;
}

.sec-title .bar {
  width: 4px;
  height: 15px;
  border-radius: 2px;
  background: #3456e6;
}

.two-col {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 16px;
}

.col-card {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 14px;
  max-height: 380px;
  overflow: auto;
}

.col-head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  color: #334155;
  margin-bottom: 10px;
}

.strategy-item,
.dir-item {
  padding: 10px 12px;
  border-radius: 10px;
  cursor: pointer;
  border: 1px solid transparent;
}

.strategy-item:hover,
.dir-item:hover {
  background: #f8fafc;
}

.strategy-item.selected,
.dir-item.selected {
  background: #eef4ff;
  border-color: #3456e6;
}

.strategy-item.disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.si-name {
  font-weight: 600;
  color: #1e293b;
  font-size: 13.5px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.si-check {
  color: #3456e6;
}

.si-desc {
  margin-top: 3px;
  color: #94a3b8;
  font-size: 12px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.dir-empty {
  color: #94a3b8;
  font-size: 12.5px;
  text-align: center;
  padding: 30px 0;
}

.bottom-bar {
  margin-top: 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.bottom-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.model-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 14px;
  border: 1px solid #e2e8f0;
  border-radius: 999px;
  color: #64748b;
  font-size: 13px;
}

.cost {
  font-size: 12px;
  color: #facc15;
}

.chat-user {
  margin-left: auto;
  width: fit-content;
  background: #3456e6;
  color: #fff;
  padding: 8px 16px;
  border-radius: 12px 12px 2px 12px;
  margin-bottom: 14px;
}

.article-card {
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 18px;
  background: #fff;
}

.ac-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.ac-badge {
  color: #94a3b8;
  font-size: 12.5px;
}

.title-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-top: 12px;
}

.title-cell {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 10px 12px;
  cursor: pointer;
}

.title-cell.selected {
  border-color: #3456e6;
  background: #eef4ff;
}

.tc-label {
  font-size: 11px;
  color: #94a3b8;
}

.tc-text {
  margin-top: 4px;
  font-weight: 600;
  color: #1e293b;
  font-size: 13px;
}

.article-body {
  margin-top: 14px;
  white-space: pre-wrap;
  color: #334155;
  font-size: 13.5px;
  line-height: 1.8;
}

.article-tags {
  margin-top: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.a-tag {
  background: #eef4ff;
  border: none;
  color: #3456e6;
}

.ac-footer {
  margin-top: 14px;
  display: flex;
  justify-content: space-between;
}

.regen-bar {
  margin-top: 18px;
  display: flex;
  gap: 10px;
  max-width: 720px;
}

.edit-hint {
  background: #eef4ff;
  color: #3456e6;
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 13px;
  margin-bottom: 16px;
}

.edit-block {
  margin-bottom: 18px;
}

.eb-head {
  display: flex;
  justify-content: space-between;
  color: #334155;
  font-weight: 600;
  margin-bottom: 6px;
  font-size: 13.5px;
}

.eb-count {
  color: #94a3b8;
  font-weight: 400;
  font-size: 12px;
}

.tags-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.match-head {
  font-size: 15px;
  color: #1e293b;
  display: flex;
  align-items: center;
  gap: 10px;
}

.hl {
  color: #3456e6;
  font-weight: 700;
}

.match-hint {
  margin: 8px 0 14px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 8px 12px;
  color: #94a3b8;
  font-size: 12.5px;
}

.match-layout {
  display: flex;
  gap: 18px;
}

.selected-grid {
  flex: 1.6;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 12px;
  align-content: start;
}

.sel-cell {
  position: relative;
  border: 2px solid #3456e6;
  border-radius: 10px;
  overflow: hidden;
  cursor: grab;
  aspect-ratio: 3/4;
  background: #f1f5f9;
}

.sel-cell.add-cell {
  border: 2px dashed #cbd5e1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  font-size: 24px;
}

.cover-tag {
  position: absolute;
  top: 6px;
  right: 6px;
  background: #ef4444;
  color: #fff;
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 4px;
  z-index: 2;
}

.sel-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.sel-ops {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: space-around;
  padding: 5px 0;
  background: rgba(15, 23, 42, 0.55);
  color: #fff;
  font-size: 14px;
}

.material-panel {
  flex: 1;
  min-width: 0;
  border-left: 1px solid #e2e8f0;
  padding-left: 18px;
}

.mp-head {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #1e293b;
  font-weight: 600;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.mp-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  max-height: 420px;
  overflow: auto;
}

.mp-img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 8px;
  cursor: pointer;
}

.mp-img:hover {
  outline: 2px solid #3456e6;
}

.publish-layout {
  display: flex;
  gap: 28px;
  justify-content: center;
}

.phone-card {
  width: 340px;
  border: 1px solid #e2e8f0;
  border-radius: 18px;
  padding: 14px;
  background: #fff;
  max-height: 70vh;
  overflow: auto;
}

.pc-cover {
  width: 100%;
  border-radius: 12px;
  aspect-ratio: 3/4;
  object-fit: cover;
}

.pc-title {
  margin-top: 10px;
  font-weight: 700;
  color: #1e293b;
  font-size: 15px;
}

.pc-body {
  margin-top: 8px;
  color: #475569;
  font-size: 12.5px;
  line-height: 1.7;
  white-space: pre-wrap;
  display: -webkit-box;
  -webkit-line-clamp: 8;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.pc-tags {
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.pc-tag {
  color: #3456e6;
  font-size: 12px;
}

.pc-imgs {
  margin-top: 10px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}

.pc-imgs img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 6px;
}

.publish-side {
  width: 380px;
}

.ps-title {
  font-weight: 700;
  color: #1e293b;
  margin-bottom: 12px;
}

.ps-row {
  display: flex;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px dashed #e2e8f0;
  color: #475569;
  font-size: 13px;
}

.ps-row span {
  color: #94a3b8;
  flex: 0 0 40px;
}

.ps-tip {
  margin-top: 14px;
  color: #94a3b8;
  font-size: 12px;
  line-height: 1.7;
}

.ps-link {
  margin-top: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  word-break: break-all;
}

@media (max-width: 991px) {
  .two-col,
  .match-layout,
  .publish-layout {
    display: flex;
    flex-direction: column;
  }

  .material-panel {
    border-left: none;
    padding-left: 0;
  }
}
</style>
