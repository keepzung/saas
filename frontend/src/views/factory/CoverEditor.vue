<template>
  <Teleport to="body">
    <div v-if="open" class="ce-mask">
      <div class="ce-topbar">
        <div class="ce-brand">
          <PictureOutlined />
          <span class="ce-name">封面设计</span>
        </div>
        <div class="ce-tabs">
          <button
            v-for="t in tabsVisible"
            :key="t.key"
            type="button"
            class="ce-tab"
            :class="{ active: activeTab === t.key }"
            @click="activeTab = t.key"
          >
            {{ t.name }}
          </button>
        </div>
        <button class="ce-close" type="button" @click="$emit('close')">关闭</button>
      </div>

      <!-- ── 压字：当前图全幅做底，标题压在图上 ── -->
      <div v-if="activeTab === 'yazi'" class="ce-body editor">
        <div class="ed-left">
          <div class="ed-section-label">压字设置</div>
          <div class="ed-tip">当前选中的图片全幅铺满封面，标题文字直接压在图上。右侧实时预览，调整满意后点「选用为封面」。</div>
          <div class="ed-field">
            <div class="ed-label">主标题</div>
            <a-input v-model:value="yzTitle" :maxlength="60" placeholder="默认使用文章标题，过长自动换行" />
          </div>
          <div class="ed-field">
            <div class="ed-label">副标题（选填）</div>
            <a-input v-model:value="yzSub" :maxlength="60" placeholder="如：实测真香 / 限时优惠（过长自动换行）" />
          </div>
          <div class="ed-field">
            <div class="ed-label">文字位置</div>
            <a-radio-group v-model:value="yzPos" button-style="solid" size="small">
              <a-radio-button value="top">上方</a-radio-button>
              <a-radio-button value="middle">居中</a-radio-button>
              <a-radio-button value="bottom">下方</a-radio-button>
            </a-radio-group>
          </div>
          <div class="ed-field">
            <div class="ed-label">压字样式</div>
            <a-radio-group v-model:value="yzStyle" button-style="solid" size="small">
              <a-radio-button v-for="s in YZ_STYLES" :key="s.value" :value="s.value">{{ s.label }}</a-radio-button>
            </a-radio-group>
          </div>
          <div class="ed-field" v-if="fxCanManage">
            <div class="ed-label">特效配色（全工作区共享，改色实时预览）</div>
            <div class="fx-color-row">
              <span class="fx-label">荧光高亮色块</span>
              <input type="color" v-model="fxTheme.highlight" class="fx-color" />
            </div>
            <div class="fx-color-row">
              <span class="fx-label">霓虹光色</span>
              <input type="color" v-model="fxTheme.neon" class="fx-color" />
            </div>
            <div class="fx-color-row">
              <span class="fx-label">金色渐变（顶/中/底）</span>
              <input type="color" v-model="fxTheme.gold[0]" class="fx-color" />
              <input type="color" v-model="fxTheme.gold[1]" class="fx-color" />
              <input type="color" v-model="fxTheme.gold[2]" class="fx-color" />
              <span class="fx-label">描边</span>
              <input type="color" v-model="fxTheme.goldStroke" class="fx-color" />
            </div>
            <a-space style="margin-top: 8px">
              <a-button size="small" type="primary" @click="saveFxTheme()">保存配色</a-button>
              <a-button size="small" @click="resetFxTheme">恢复默认</a-button>
            </a-space>
          </div>
          <div class="ed-field">
            <div class="ed-label">字体</div>
            <a-select v-model:value="designerFont" :options="FONT_OPTIONS" />
          </div>
          <div class="ed-field">
            <div class="ed-label">装饰形状/线条（画布上按住拖动可移位置）</div>
            <div class="shape-add-row">
              <a-button v-for="t in SHAPE_TYPES" :key="t.value" size="small" @click="addShape(t.value)">＋{{ t.label }}</a-button>
              <a-button v-if="shapes.length" size="small" type="text" danger @click="shapes = []">清空</a-button>
            </div>
            <div v-for="s in shapes" :key="s.id" class="shape-row">
              <span class="shape-name">{{ (SHAPE_TYPES.find((t) => t.value === s.type) || {}).label }}</span>
              <span
                v-for="c in SHAPE_COLORS"
                :key="c"
                class="color-dot"
                :class="{ on: s.color === c }"
                :style="{ background: c }"
                @click="s.color = c"
              />
              <a-select
                :value="s.scale"
                size="small"
                style="width: 64px"
                :options="[{ label: '小', value: 0.6 }, { label: '中', value: 1 }, { label: '大', value: 1.5 }]"
                @change="(v) => (s.scale = v)"
              />
              <a-button size="small" type="text" danger @click="removeShape(s.id)">删除</a-button>
            </div>
          </div>
        </div>
        <div class="ed-right">
          <canvas ref="previewCanvas" width="540" height="720" class="preview-canvas" @pointerdown="onCanvasPointerDown"></canvas>
          <div class="ed-actions">
            <a-button type="primary" size="large" class="use-btn" :loading="uploading" @click="applyCanvas">选用为封面</a-button>
          </div>
        </div>
      </div>

      <!-- ── 大字报：配色底 + 超大标题 ── -->
      <div v-else-if="activeTab === 'dazibao'" class="ce-body editor">
        <div class="ed-left">
          <div class="ed-section-label">大字报设置</div>
          <div class="ed-tip">纯色/渐变底 + 超大字标语，产品图可选放底部小窗。适合促销、活动、观点型封面。</div>
          <div class="ed-field">
            <div class="ed-label">大字主标题（≤16 字，自动分两行）</div>
            <a-input v-model:value="dzTitle" :maxlength="16" placeholder="如：装修必看 空调这样选" />
          </div>
          <div class="ed-field">
            <div class="ed-label">小字副标（选填）</div>
            <a-input v-model:value="dzSub" :maxlength="24" placeholder="如：格力门店老销售的建议" />
          </div>
          <div class="ed-field">
            <div class="ed-label">配色</div>
            <div class="swatch-row">
              <div
                v-for="(t, i) in DZ_THEMES"
                :key="i"
                class="swatch"
                :class="{ selected: dzTheme === i }"
                :style="{ background: `linear-gradient(135deg, ${t.bg[0]}, ${t.bg[1]})` }"
                @click="dzTheme = i"
              />
            </div>
          </div>
          <div class="ed-field">
            <a-checkbox v-model:checked="dzShowProduct">底部放产品图小窗</a-checkbox>
          </div>
        </div>
        <div class="ed-right">
          <canvas ref="previewCanvas" width="540" height="720" class="preview-canvas"></canvas>
          <div class="ed-actions">
            <a-button type="primary" size="large" class="use-btn" :loading="uploading" @click="applyCanvas">选用为封面</a-button>
          </div>
        </div>
      </div>

      <!-- ── 拼图：多图宫格 + 压字 ── -->
      <div v-else-if="activeTab === 'pintu'" class="ce-body editor">
        <div class="ed-left">
          <div class="ed-section-label">拼图设置</div>
          <div class="ed-tip">从本篇已选图片中挑 2-4 张拼成宫格封面，再压上标题。点击下方小图勾选（第 1 张为封面位）。</div>
          <div class="pick-grid">
            <div
              v-for="(img, i) in images"
              :key="img.url"
              class="pick-cell"
              :class="{ selected: pickSet.includes(i) }"
              @click="togglePick(i)"
            >
              <img :src="img.url" />
              <span v-if="pickSet.includes(i)" class="pick-idx">{{ pickSet.indexOf(i) + 1 }}</span>
            </div>
          </div>
          <div class="ed-field" style="margin-top: 12px">
            <div class="ed-label">拼图布局（{{ pickSet.length }} 张已选）</div>
            <a-radio-group v-model:value="ptLayout" button-style="solid" size="small">
              <a-radio-button v-if="pickSet.length >= 2" value="v2">上下两图</a-radio-button>
              <a-radio-button v-if="pickSet.length >= 3" value="big3">一大两小</a-radio-button>
              <a-radio-button v-if="pickSet.length >= 4" value="grid4">四宫格</a-radio-button>
            </a-radio-group>
          </div>
          <div class="ed-field">
            <div class="ed-label">压字标题（选填，压在拼图上）</div>
            <a-input v-model:value="ptTitle" :maxlength="60" placeholder="默认使用文章标题，过长自动换行" />
          </div>
        </div>
        <div class="ed-right">
          <canvas ref="previewCanvas" width="540" height="720" class="preview-canvas"></canvas>
          <div class="ed-actions">
            <a-button type="primary" size="large" class="use-btn" :loading="uploading" @click="applyCanvas" :disabled="pickSet.length < 2">选用为封面</a-button>
          </div>
        </div>
      </div>

      <!-- ── AI 海报：AI 出背景+产品，标题/标签本地特效合成 ── -->
      <div v-else-if="activeTab === 'poster'" class="ce-body editor">
        <div class="ed-left">
          <div class="ed-section-label">AI 海报</div>
          <div class="ed-field">
            <div class="ed-label">生成方式</div>
            <a-radio-group v-model:value="poMode" button-style="solid" size="small">
              <a-radio-button value="overlay">AI 生图 + 压字（文字清晰可编辑）</a-radio-button>
              <a-radio-button value="pure">纯 AI 生图（文字画进图里）</a-radio-button>
            </a-radio-group>
            <div class="ed-tip" style="margin-top: 8px">
              {{ poMode === 'pure'
                ? '标题/副标题/标签将由 AI 直接画进图片（⚡2/次，约 1-2 分钟，失败退回）；中文笔画如有变形，换个说法或重新生成即可。'
                : 'AI 生成海报背景与产品（⚡2/次），标题/副标题/功能标签用本地特效字合成——文字永远清晰可编辑。' }}
            </div>
          </div>
          <div class="ed-field">
            <div class="ed-label">AI 参考图（建议选整机清晰、无文字水印的图；封面位易致 AI 认错产品）</div>
            <div class="pick-grid" style="grid-template-columns: repeat(6, 1fr)">
              <div
                v-for="(img, i) in images"
                :key="img.url"
                class="pick-cell"
                :class="{ selected: poRefIdx === i }"
                @click="poRefIdx = i"
              >
                <img :src="img.url" />
                <span v-if="poRefIdx === i" class="pick-idx">✓</span>
              </div>
            </div>
          </div>
          <div class="ed-field">
            <div class="ed-label">海报场景</div>
            <div class="scene-chips">
              <a-tag
                v-for="(s, i) in mergedPresets"
                :key="s.builtin ? `b${i}` : `c${s.id}`"
                class="scene-chip"
                :class="{ active: poPreset === i }"
                :closable="scenesCanManage && s.custom"
                @click="poPreset = i"
                @close.prevent="removePosterScene(s)"
              >{{ s.name }}</a-tag>
            </div>
            <div v-if="scenesCanManage" class="scene-add-row">
              <a-input v-model:value="newSceneName" size="small" :maxlength="12" style="width: 110px" placeholder="场景名，如：泳池庭院" />
              <a-input v-model:value="newSceneText" size="small" style="flex: 1; min-width: 160px" placeholder="场景描述：产品放在什么环境里（写清背景、光线、氛围）" />
              <a-button size="small" type="primary" @click="addPosterScene">添加场景</a-button>
            </div>
          </div>
          <div class="ed-field">
            <a-button type="primary" block :loading="poBusy" :disabled="!baseImage" @click="generatePosterBg">
              {{ poBg ? '重新生成海报背景（⚡2）' : poMode === 'pure' ? 'AI 生成整图海报（⚡2）' : 'AI 生成海报背景（⚡2）' }}
            </a-button>
            <div class="limit-row">
              <span class="limit-badge">今日 AI 生图：剩余 {{ posterLimit.remaining }}/{{ posterLimit.limit }} 次</span>
              <template v-if="posterLimit.canManage">
                <span class="limit-manage">每人每日限额</span>
                <a-input-number v-model:value="limitDraft" :min="1" :max="500" size="small" style="width: 76px" />
                <span class="limit-manage">次</span>
                <a-button size="small" type="primary" @click="saveLimit">保存</a-button>
              </template>
            </div>
          </div>
          <div class="ed-field">
            <div class="ed-label">主标题</div>
            <a-input v-model:value="poTitle" :maxlength="40" placeholder="默认使用文章标题，过长自动换行" />
          </div>
          <div class="ed-field" v-if="poMode === 'overlay'">
            <div class="ed-label">标题特效</div>
            <a-radio-group v-model:value="poFx" button-style="solid" size="small">
              <a-radio-button value="gold">金色大字</a-radio-button>
              <a-radio-button value="neon">霓虹发光</a-radio-button>
              <a-radio-button value="shadow3d">立体投影</a-radio-button>
              <a-radio-button value="stroke">白描边</a-radio-button>
            </a-radio-group>
          </div>
          <div class="ed-field">
            <div class="ed-label">副标题（选填，默认用产品名）</div>
            <a-input v-model:value="poSub" :maxlength="30" placeholder="如：格力Star5 AI家庭中央空调" />
          </div>
          <div class="ed-field">
            <div class="ed-label">功能标签（最多 3 个，留空跳过）</div>
            <a-input v-model:value="poTags[0]" :maxlength="8" style="margin-bottom: 6px" placeholder="如：高能效省电" />
            <a-input v-model:value="poTags[1]" :maxlength="8" style="margin-bottom: 6px" placeholder="如：全屋舒适" />
            <a-input v-model:value="poTags[2]" :maxlength="8" placeholder="如：十年包修" />
          </div>
        </div>
        <div class="ed-right">
          <div class="preview-wrap">
            <a-spin v-if="poBusy" class="scene-spin" :tip="poMode === 'pure' ? 'AI 正在绘制整图海报（含文字），约 1-2 分钟…' : 'AI 正在绘制海报背景，约 1-2 分钟…'" size="large" />
            <canvas v-show="!poBusy" ref="previewCanvas" width="540" height="720" class="preview-canvas"></canvas>
          </div>
          <div class="ed-actions">
            <a-button type="primary" size="large" class="use-btn" :loading="uploading" @click="applyCanvas">选用为封面</a-button>
          </div>
        </div>
      </div>

      <!-- ── AI 场景：产品图换背景（经图片模型重绘，可选压字） ── -->
      <div v-else-if="activeTab === 'scene'" class="ce-body editor">
        <div class="ed-left">
          <div class="ed-section-label">AI 场景（换背景）</div>
          <div class="ed-tip">把产品图交给 AI 模型重新绘制场景（产品保持原样），生成后再决定是否压字。⚡ 2 算力/次，约 60-120 秒，失败自动退回算力。</div>
          <div class="bg-row">
            <div class="bg-info">
              <div class="bg-title">产品底图</div>
              <div class="bg-sub">使用当前封面图作为参考</div>
            </div>
            <img v-if="baseImage" :src="baseImage" class="bg-thumb" />
          </div>
          <div class="ed-field" style="margin-top: 12px">
            <div class="ed-label">场景一键预设</div>
            <div class="scene-chips">
              <a-tag
                v-for="s in SCENE_PRESETS"
                :key="s.prompt"
                class="scene-chip"
                :class="{ active: scPrompt === s.prompt }"
                @click="scPrompt = s.prompt"
              >{{ s.name }}</a-tag>
            </div>
          </div>
          <div class="ed-field">
            <div class="ed-label">场景描述（可自定义）</div>
            <a-textarea v-model:value="scPrompt" :rows="3" :maxlength="300" placeholder="例如：放在浅色原木台面上，米白简约客厅背景，柔和自然光，产品保持原样" />
          </div>
          <div class="ed-field">
            <a-checkbox v-model:checked="scOverlay">生成后压上标题</a-checkbox>
            <a-input v-if="scOverlay" v-model:value="scTitle" :maxlength="40" style="margin-top: 8px" placeholder="标题（默认用文章标题）" />
          </div>
        </div>
        <div class="ed-right">
          <div class="preview-wrap">
            <a-spin v-if="scBusy" class="scene-spin" tip="AI 正在绘制场景，约 60-120 秒…" size="large" />
            <img v-if="scResult && !scBusy" :src="scResult" class="scene-result" />
            <canvas v-else-if="!scBusy" ref="previewCanvas" width="540" height="720" class="preview-canvas"></canvas>
          </div>
          <div class="ed-actions">
            <template v-if="scResult">
              <a-button @click="useAsBase">拿去压字</a-button>
              <a-button type="primary" class="use-btn" @click="applyScene">选用为封面</a-button>
            </template>
            <a-button v-else type="primary" size="large" class="gen-btn" :loading="scBusy" :disabled="!baseImage || !scPrompt.trim()" @click="generateScene">
              ✦ AI 生成场景（⚡2）✦
            </a-button>
          </div>
        </div>
      </div>

      <!-- 创客贴模板（CHUANGKIT_APP_KEY 配置后出现） -->
      <div v-else-if="activeTab === 'chuangkit'" class="ce-body editor">
        <iframe :src="chuangkitUrl" class="ck-frame" allow="clipboard-write" />
        <div class="ck-side">
          <div class="ck-title">创客贴设计</div>
          <div class="ck-tip">在左侧编辑器完成设计并导出后，把导出的图片链接粘贴到这里导入。</div>
          <a-input v-model:value="ckUrl" placeholder="粘贴创客贴导出图片链接" />
          <a-button type="primary" block :loading="ckImporting" @click="importCk">导入为封面</a-button>
          <div class="ck-hint">创客贴开放平台接入中，导出回调直连后将免粘贴。</div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import { PictureOutlined } from '@ant-design/icons-vue';
import { message } from 'ant-design-vue';
import { useAuthStore } from '../../stores/auth';
import {
  getChuangkitConfig,
  importChuangkitImage,
  generateCoverScene,
  getCoverSceneLimit,
  setCoverSceneLimit,
  getPosterScenes,
  createPosterScene,
  deletePosterScene,
  getEffectTheme,
  setEffectTheme,
} from '../../api/contentpro';

const props = defineProps({
  open: { type: Boolean, default: false },
  bgImage: { type: String, default: '' },
  title: { type: String, default: '' },
  images: { type: Array, default: () => [] },
  productName: { type: String, default: '' },
});
const emit = defineEmits(['close', 'apply']);

const auth = useAuthStore();
const brandId = computed(() => auth.currentBrandId ?? 1);

const previewCanvas = ref(null);
const uploading = ref(false);

// ── 页签
const tabs = [
  { key: 'yazi', name: '压字' },
  { key: 'dazibao', name: '大字报' },
  { key: 'pintu', name: '拼图' },
  { key: 'poster', name: 'AI 海报' },
  { key: 'scene', name: 'AI 场景' },
];
const ckEnabled = ref(false);
const chuangkitUrl = ref('');
const ckUrl = ref('');
const ckImporting = ref(false);
const activeTab = ref('yazi');
const tabsVisible = computed(() =>
  ckEnabled.value ? [...tabs, { key: 'chuangkit', name: '创客贴模板' }] : tabs,
);

// 底图可被 AI 生成结果覆盖（拿去压字）
const bgOverride = ref('');
const baseImage = computed(() => bgOverride.value || props.bgImage || props.images?.[0]?.url || '');
const images = computed(() => {
  const list = props.images ?? [];
  if (list.length) return list;
  return baseImage.value ? [{ url: baseImage.value, name: '' }] : [];
});

const loadEditorMeta = async () => {
  const ck = await getChuangkitConfig().then((r) => r).catch(() => null);
  ckEnabled.value = Boolean(ck?.enabled && ck?.editor_url);
  chuangkitUrl.value = ck?.editor_url ?? '';
};

const importCk = async () => {
  if (!/^https?:\/\//.test(ckUrl.value)) return message.warning('请粘贴合法的图片链接');
  ckImporting.value = true;
  try {
    const res = await importChuangkitImage({ url: ckUrl.value.trim() }, { brandId: brandId.value });
    if (!res?.url) throw new Error('导入失败');
    emit('apply', { remoteUrl: res.data.url });
  } catch (e) {
    message.error(e?.response?.data?.msg ?? e?.message ?? '导入失败');
  } finally {
    ckImporting.value = false;
  }
};

// ── 图片缓存
const imgCache = new Map();
const loadImage = (url) =>
  new Promise((resolve) => {
    if (!url) return resolve(null);
    if (imgCache.has(url)) return resolve(imgCache.get(url));
    // 大图（AI 生成可达 10MB+）弱网下首次可能失败，自动重试 2 次
    const attempt = (left) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        imgCache.set(url, img);
        resolve(img);
      };
      img.onerror = () => {
        if (left > 0) setTimeout(() => attempt(left - 1), 1500);
        else resolve(null);
      };
      img.src = url;
    };
    attempt(2);
  });

const drawCoverFit = (ctx, img, x, y, w, h) => {
  const scale = Math.max(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, x - dw / 2, y - dh / 2, dw, dh);
};

// 统一画布坐标：所有绘制按 (ctx, W, H) 相对布局，预览 540×720 与导出 1080×1440 共用
const SCENE_PRESETS = [
  { name: '原木家居', prompt: '把这个产品放在浅色原木台面上，米白色简约客厅背景，柔和自然光，产品外观保持原样不变' },
  { name: '纯白影棚', prompt: '把这个产品放在纯白色影棚背景中央，柔和顶光，轻微倒影，商业摄影质感，产品外观保持原样不变' },
  { name: '大理石台面', prompt: '把这个产品放在浅灰色大理石台面上，高级质感背景，柔和灯光，产品外观保持原样不变' },
  { name: '户外庭院', prompt: '把这个产品放在阳光明媚的户外庭院环境中，绿植背景虚化，自然光，产品外观保持原样不变' },
  { name: '现代厨房', prompt: '把这个产品放在干净明亮的现代厨房环境中，浅色橱柜背景，产品外观保持原样不变' },
  { name: '节日礼盒', prompt: '把这个产品放在节日礼盒氛围场景中，暖色调灯光，丝带与礼盒点缀背景，产品外观保持原样不变' },
];

// ── 压字
const yzTitle = ref('');
const yzSub = ref('');
const yzPos = ref('bottom');
const yzStyle = ref('shade');

// ── 大字报
const DZ_THEMES = [
  { bg: ['#fef3c7', '#fca5a5'], main: '#b91c1c', sub: '#7c2d12' },
  { bg: ['#dbeafe', '#c7d2fe'], main: '#1d4ed8', sub: '#3730a3' },
  { bg: ['#dcfce7', '#a7f3d0'], main: '#047857', sub: '#065f46' },
  { bg: ['#f3e8ff', '#e9d5ff'], main: '#7e22ce', sub: '#6b21a8' },
  { bg: ['#1e293b', '#334155'], main: '#facc15', sub: '#e2e8f0' },
];
const dzTitle = ref('');
const dzSub = ref('');
const dzTheme = ref(0);
const dzShowProduct = ref(true);

// ── 拼图
const pickSet = ref([0]);
const ptLayout = ref('v2');
const ptTitle = ref('');
const togglePick = (i) => {
  const idx = pickSet.value.indexOf(i);
  if (idx > -1) pickSet.value.splice(idx, 1);
  else if (pickSet.value.length < 4) pickSet.value.push(i);
  else message.warning('最多选 4 张');
};

// ── AI 场景
const scPrompt = ref('');
const scOverlay = ref(false);
const scTitle = ref('');
const scBusy = ref(false);
const scResult = ref('');

// ── AI 海报：AI 出背景+产品，标题/副标题/功能标签本地特效合成
const POSTER_PRESETS = [
  { name: '科技蓝舞台', scene: '发光的深蓝色科技舞台上，背景有蓝色发光电路纹理、光束和粒子光效' },
  { name: '聚光展台', scene: '深色高级展台聚光灯下，背景有暖金色光斑虚化' },
  { name: '原木家居', scene: '浅色原木台面上，米白色简约客厅背景' },
  { name: '红金节日', scene: '红金配色的节日礼盒氛围中，暖色灯带背景' },
];
// 内置 + 设计师自定义（有 ai_poster_limit_set 管理权限者可增删，存库全工作区共享）
const serverScenes = ref([]);
const scenesCanManage = ref(false);
const mergedPresets = computed(() => [
  ...POSTER_PRESETS.map((p) => ({ ...p, builtin: true })),
  ...serverScenes.value.map((p) => ({ ...p, custom: true })),
]);
const newSceneName = ref('');
const newSceneText = ref('');
const addPosterScene = async () => {
  if (!newSceneName.value.trim() || !newSceneText.value.trim()) return message.warning('请填写场景名和场景描述');
  try {
    await createPosterScene(
      { name: newSceneName.value.trim(), scene: newSceneText.value.trim() },
      { brandId: brandId.value },
    );
    message.success('场景已添加');
    newSceneName.value = '';
    newSceneText.value = '';
    loadPosterScenes();
  } catch (e) {
    message.error(e?.response?.data?.msg ?? '添加失败');
  }
};
const removePosterScene = async (s) => {
  try {
    await deletePosterScene(s.id, { brandId: brandId.value });
    if (poPreset.value >= mergedPresets.value.length - 1) poPreset.value = 0;
    loadPosterScenes();
  } catch (e) {
    message.error(e?.response?.data?.msg ?? '删除失败');
  }
};
const loadPosterScenes = async () => {
  try {
    const [list, can] = await Promise.all([
      getPosterScenes({ brandId: brandId.value }),
      getCoverSceneLimit({ brandId: brandId.value }),
    ]);
    serverScenes.value = list?.list ?? [];
    scenesCanManage.value = !!can?.canManage;
  } catch {
    /* 场景接口异常回退内置预设 */
  }
};

// ── 特效配色（荧光块/霓虹光/金色渐变，按工作区配置；有管理权限者可调）
const FX_DEFAULTS = {
  highlight: '#fde047',
  neon: '#22d3ee',
  gold: ['#fff8d6', '#fbbf24', '#d97706'],
  goldStroke: '#78350f',
};
const hexToRgba = (hex, a) => {
  const m = String(hex ?? '').replace('#', '');
  const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
  const n = parseInt(full || '000000', 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};
const fxTheme = ref({
  highlight: FX_DEFAULTS.highlight,
  neon: FX_DEFAULTS.neon,
  gold: [...FX_DEFAULTS.gold],
  goldStroke: FX_DEFAULTS.goldStroke,
});
const fxCanManage = ref(false);
const loadFxTheme = async () => {
  try {
    const r = await getEffectTheme({ brandId: brandId.value });
    fxCanManage.value = !!r?.canManage;
    const cfg = r?.config;
    if (cfg) {
      fxTheme.value = {
        highlight: cfg.highlight || FX_DEFAULTS.highlight,
        neon: cfg.neon || FX_DEFAULTS.neon,
        gold: Array.isArray(cfg.gold) && cfg.gold.length === 3 ? cfg.gold : [...FX_DEFAULTS.gold],
        goldStroke: cfg.goldStroke || FX_DEFAULTS.goldStroke,
      };
    }
  } catch {
    /* 配色接口异常走默认 */
  }
};
const saveFxTheme = async (cfg) => {
  const config = cfg ?? JSON.parse(JSON.stringify(fxTheme.value));
  try {
    await setEffectTheme({ config }, { brandId: brandId.value });
    message.success('特效配色已保存，全工作区生效');
    fxTheme.value = {
      highlight: config.highlight,
      neon: config.neon,
      gold: [...config.gold],
      goldStroke: config.goldStroke,
    };
  } catch (e) {
    message.error(e?.response?.data?.msg ?? '保存失败');
  }
};
const resetFxTheme = () => {
  fxTheme.value = { highlight: FX_DEFAULTS.highlight, neon: FX_DEFAULTS.neon, gold: [...FX_DEFAULTS.gold], goldStroke: FX_DEFAULTS.goldStroke };
  saveFxTheme(JSON.parse(JSON.stringify(fxTheme.value)));
};

const poPreset = ref(0);
const poMode = ref('overlay'); // overlay=AI生图+本地压字 | pure=纯AI生图(文字画进图里)
const poTitle = ref('');
const poSub = ref('');
const poTags = ref(['高能效省电', '全屋舒适', '十年包修']);
const poFx = ref('gold');
const poBusy = ref(false);

// ── 字体（压字 + AI 海报标题共用）：含手写体；霞鹜文楷为本地自托管 webfont
const FONT_OPTIONS = [
  { label: '默认雅黑', value: '"Microsoft YaHei"' },
  { label: '楷体（手写感）', value: 'KaiTi, STKaiti' },
  { label: '华文行楷（手写）', value: 'STXingkai, KaiTi' },
  { label: '霞鹜文楷（手写）', value: '"LXGW WenKai", KaiTi' },
  { label: '隶书', value: 'LiSu, KaiTi' },
  { label: '幼圆', value: 'YouYuan, "Microsoft YaHei"' },
  { label: '宋体', value: 'SimSun, serif' },
];
const designerFont = ref('"Microsoft YaHei"');
const designerFontCss = () => `${designerFont.value}, "PingFang SC", "Microsoft YaHei", sans-serif`;
const fontStr = (size, family) => `${family && family.includes('LXGW') ? 700 : 900} ${size}px ${family || designerFontCss()}`;
// 选霞鹜文楷时按需注入自托管 css 并等待字体就绪
const FONT_CSS = { '"LXGW WenKai", KaiTi': '/fonts/lxgw/lxgwwenkai-bold.css' };
let loadedFontCss = '';
watch(designerFont, async () => {
  const href = FONT_CSS[designerFont.value];
  if (href && loadedFontCss !== href) {
    loadedFontCss = href;
    await new Promise((resolve) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.onload = () => resolve();
      link.onerror = () => resolve();
      document.head.appendChild(link);
      setTimeout(resolve, 5000);
    });
    try {
      await Promise.race([document.fonts.load('700 40px "LXGW WenKai"'), new Promise((r) => setTimeout(r, 4000))]);
    } catch {}
  }
  drawPreview();
});

// ── 装饰形状/线条（压字页签，画布可拖动）
const SHAPE_TYPES = [
  { value: 'rect', label: '矩形' },
  { value: 'circle', label: '圆形' },
  { value: 'star', label: '星星' },
  { value: 'line', label: '横线' },
  { value: 'arrow', label: '箭头' },
];
const SHAPE_COLORS = ['#facc15', '#f87171', '#60a5fa', '#34d399', '#ffffff', '#111827'];
const shapes = ref([]);
const addShape = (type) => {
  shapes.value.push({ id: Date.now() + Math.random(), type, x: 0.5, y: 0.42, scale: 1, color: SHAPE_COLORS[0] });
};
const removeShape = (id) => {
  shapes.value = shapes.value.filter((s) => s.id !== id);
};
const drawShapes = (ctx, W, H) => {
  for (const s of shapes.value) {
    const base = W * 0.14 * s.scale;
    const cx = s.x * W;
    const cy = s.y * H;
    ctx.save();
    ctx.fillStyle = s.color;
    ctx.strokeStyle = s.color;
    ctx.lineJoin = 'round';
    if (s.type === 'rect') {
      ctx.beginPath();
      ctx.roundRect(cx - base * 0.9, cy - base * 0.5, base * 1.8, base, base * 0.15);
      ctx.fill();
    } else if (s.type === 'circle') {
      ctx.beginPath();
      ctx.arc(cx, cy, base * 0.55, 0, Math.PI * 2);
      ctx.fill();
    } else if (s.type === 'star') {
      const r1 = base * 0.62;
      const r2 = base * 0.27;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const ang = (Math.PI / 5) * i - Math.PI / 2;
        const r = i % 2 === 0 ? r1 : r2;
        const px = cx + Math.cos(ang) * r;
        const py = cy + Math.sin(ang) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    } else if (s.type === 'line') {
      ctx.beginPath();
      ctx.roundRect(cx - base * 0.9, cy - base * 0.055, base * 1.8, base * 0.11, base * 0.055);
      ctx.fill();
    } else if (s.type === 'arrow') {
      ctx.beginPath();
      ctx.moveTo(cx - base * 0.8, cy - base * 0.1);
      ctx.lineTo(cx + base * 0.2, cy - base * 0.1);
      ctx.lineTo(cx + base * 0.2, cy - base * 0.38);
      ctx.lineTo(cx + base * 0.8, cy);
      ctx.lineTo(cx + base * 0.2, cy + base * 0.38);
      ctx.lineTo(cx + base * 0.2, cy + base * 0.1);
      ctx.lineTo(cx - base * 0.8, cy + base * 0.1);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
};
// 画布按住形状拖动（坐标存相对值，预览/导出等比缩放）
const onCanvasPointerDown = (e) => {
  if (activeTab.value !== 'yazi' || !shapes.value.length) return;
  const rect = e.target.getBoundingClientRect();
  const px = (e.clientX - rect.left) / rect.width;
  const py = (e.clientY - rect.top) / rect.height;
  const hit = [...shapes.value]
    .reverse()
    .find((s) => Math.abs(px - s.x) < 0.17 * s.scale && Math.abs(py - s.y) < 0.14 * s.scale);
  if (!hit) return;
  const target = e.target;
  target.setPointerCapture?.(e.pointerId);
  const move = (ev) => {
    const r2 = target.getBoundingClientRect();
    hit.x = Math.min(0.98, Math.max(0.02, (ev.clientX - r2.left) / r2.width));
    hit.y = Math.min(0.98, Math.max(0.02, (ev.clientY - r2.top) / r2.height));
    drawPreview();
  };
  const up = () => {
    target.removeEventListener('pointermove', move);
    target.removeEventListener('pointerup', up);
    target.removeEventListener('pointercancel', up);
  };
  target.addEventListener('pointermove', move);
  target.addEventListener('pointerup', up);
  target.addEventListener('pointercancel', up);
};
const poBg = ref('');
// AI 参考图：默认封面位（第1张），可换任意已选图——整机图做参考才不易认错产品
const poRefIdx = ref(0);
const poRefUrl = computed(() => images.value[poRefIdx.value]?.url ?? baseImage.value);

// ── AI 生图每日限额（AI 海报/场景共用）
const posterLimit = ref({ limit: 20, used: 0, remaining: 20, canManage: false });
const limitDraft = ref(20);
const loadPosterLimit = async () => {
  try {
    const st = await getCoverSceneLimit({ brandId: brandId.value });
    posterLimit.value = {
      limit: st?.limit ?? 20,
      used: st?.used ?? 0,
      remaining: st?.remaining ?? 20,
      canManage: !!st?.canManage,
    };
    limitDraft.value = posterLimit.value.limit;
  } catch {
    /* 限额接口异常不阻塞设计器 */
  }
};
const saveLimit = async () => {
  try {
    await setCoverSceneLimit({ limit: limitDraft.value }, { brandId: brandId.value });
    message.success(`已保存：每人每日 ${limitDraft.value} 次`);
    loadPosterLimit();
  } catch (e) {
    message.error(e?.response?.data?.msg ?? '保存失败');
  }
};

const generatePosterBg = async () => {
  if (!baseImage.value) return message.warning('请先在配图步骤选定产品底图');
  poBusy.value = true;
  poBg.value = '';
  try {
    const preset = mergedPresets.value[poPreset.value] ?? mergedPresets.value[0];
    const productName = (props.productName || poSub.value || '').trim();
    const base = `电商风格产品营销海报：参考图中的产品是${productName ? `「${productName}」` : '图中所示产品'}，把它放在${preset.scene}，产品居中偏下完整展示。严格保持参考图产品的外形、结构、颜色与品牌标识，不要增删产品的任何部件（如天线、支架），不要把产品变成其他品类，产品外观保持原样不变，高清商业广告摄影`;
    let prompt = base;
    if (poMode.value === 'pure') {
      // 纯 AI 生图：标题/副标题/标签由模型画进图片
      const title = (poTitle.value || props.title || '').trim();
      const sub = (poSub.value || props.productName || '').trim();
      const tags = poTags.value.map((t) => (t ?? '').trim()).filter(Boolean).slice(0, 3);
      prompt = base + `，画面顶部三分之一绘制大号醒目的金色立体中文大标题「${title}」`;
      if (sub) prompt += `，标题下方居中一行白色中文副标题「${sub}」`;
      if (tags.length) prompt += `，左侧竖排${tags.length}个发光圆角胶囊标签框，分别写「${tags.join('」「')}」`;
      prompt += `，所有中文文字笔画清晰工整、结构正确、无变形无错字`;
    } else {
      prompt = base + `，画面顶部三分之一和左侧留出干净区域用于排版标题文字`;
    }
    const res = await generateCoverScene(
      { imageUrl: poRefUrl.value, prompt, width: 1080, height: 1440 },
      { brandId: brandId.value },
    );
    poBg.value = res?.url ?? '';
    message.success('海报背景已生成，标题/标签可继续调整');
    // 先等大图加载完成再结束 busy 态，避免首帧画成占位符
    if (poBg.value) await loadImage(poBg.value);
    loadPosterLimit();
  } catch (e) {
    message.error(e?.response?.data?.msg ?? e?.message ?? 'AI 生成失败');
  } finally {
    poBusy.value = false;
  }
};

// ── 绘制
const drawText = (ctx, str, x, y, size, color, style) => {
  ctx.save();
  ctx.font = `900 ${size}px "PingFang SC", "Microsoft YaHei", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (style === 'stroke') {
    ctx.lineWidth = size / 6;
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineJoin = 'round';
    ctx.strokeText(str, x, y);
  }
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
  ctx.restore();
};

// 压字特效样式清单
const YZ_STYLES = [
  { value: 'stroke', label: '白描边' },
  { value: 'band', label: '色块横条' },
  { value: 'shade', label: '渐变遮罩' },
  { value: 'highlight', label: '荧光高亮' },
  { value: 'gold', label: '金色大字' },
  { value: 'shadow3d', label: '立体投影' },
  { value: 'neon', label: '霓虹发光' },
  { value: 'hollow', label: '镂空描边' },
];

// 特效字：按样式渲染单行文字（坐标为画布单位，预览/导出等比缩放）
const paintFx = (ctx, str, x, y, size, style, isSub, family) => {
  ctx.save();
  ctx.font = fontStr(size, family);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  switch (style) {
    case 'highlight':
      ctx.fillStyle = isSub ? '#334155' : '#0f172a';
      ctx.fillText(str, x, y);
      break;
    case 'gold': {
      const g = ctx.createLinearGradient(0, y - size * 0.55, 0, y + size * 0.55);
      g.addColorStop(0, '#fff8d6');
      g.addColorStop(0.45, '#fbbf24');
      g.addColorStop(1, '#d97706');
      ctx.lineWidth = Math.max(1, size / 12);
      ctx.strokeStyle = 'rgba(120,53,15,0.9)';
      ctx.lineJoin = 'round';
      ctx.strokeText(str, x, y);
      ctx.fillStyle = g;
      ctx.fillText(str, x, y);
      break;
    }
    case 'shadow3d': {
      ctx.fillStyle = '#475569';
      const depth = Math.max(2, Math.round(size * 0.07));
      for (let i = depth; i >= 1; i--) ctx.fillText(str, x + i, y + i * 0.9);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(str, x, y);
      break;
    }
    case 'neon': {
      ctx.shadowColor = '#22d3ee';
      ctx.lineWidth = Math.max(1, size / 10);
      ctx.strokeStyle = 'rgba(34,211,238,0.85)';
      ctx.lineJoin = 'round';
      for (const blur of [size * 0.5, size * 0.28, size * 0.12]) {
        ctx.shadowBlur = blur;
        ctx.fillStyle = '#f0fdff';
        ctx.fillText(str, x, y);
      }
      ctx.shadowBlur = 0;
      ctx.strokeText(str, x, y);
      break;
    }
    case 'hollow':
      ctx.lineWidth = Math.max(1.5, size / 7);
      ctx.strokeStyle = 'rgba(255,255,255,0.96)';
      ctx.lineJoin = 'round';
      ctx.strokeText(str, x, y);
      break;
    case 'stroke':
      ctx.lineWidth = size / 6;
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineJoin = 'round';
      ctx.strokeText(str, x, y);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(str, x, y);
      break;
    default:
      ctx.fillStyle = isSub ? '#e2e8f0' : '#ffffff';
      ctx.fillText(str, x, y);
  }
  ctx.restore();
};

// 按实际渲染宽度自动换行（中文逐字符装箱）
const wrapByMeasure = (ctx, text, maxWidth) => {
  const chars = Array.from(text);
  const lines = [];
  let cur = '';
  for (const ch of chars) {
    const test = cur + ch;
    if (cur && ctx.measureText(test).width > maxWidth) {
      lines.push(cur);
      cur = ch;
    } else cur = test;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
};

const drawYazi = (ctx, W, H) => {
  const img = imgCache.get(baseImage.value);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, W, H);
  if (img) drawCoverFit(ctx, img, W / 2, H / 2, W, H);
  drawShapes(ctx, W, H);
  const main = (yzTitle.value || props.title || '').trim().slice(0, 60);
  const sub = yzSub.value.trim().slice(0, 60);
  // 主标题自动换行：超过 4 行自动缩小字号
  let size = W * (main.length > 24 ? 0.062 : main.length > 12 ? 0.072 : 0.082);
  const fam = designerFontCss();
  const font = (s) => fontStr(s, fam);
  ctx.font = font(size);
  let mainLines = wrapByMeasure(ctx, main, W * 0.88);
  if (mainLines.length > 4) {
    size = W * Math.max(0.042, (0.072 * 3.6) / mainLines.length);
    ctx.font = font(size);
    mainLines = wrapByMeasure(ctx, main, W * 0.88);
  }
  const subSize = size * 0.5;
  ctx.font = fontStr(subSize, fam);
  const subLines = sub ? wrapByMeasure(ctx, sub, W * 0.82) : [];
  const lhM = size * 1.34;
  const lhS = subSize * 1.5;
  const blockH = mainLines.length * lhM + (subLines.length ? subLines.length * lhS + size * 0.26 : 0);
  const centerY = yzPos.value === 'top' ? H * 0.2 : yzPos.value === 'middle' ? H * 0.46 : H * 0.78;
  const maxTop = H * 0.96 - blockH;
  const top = Math.max(H * 0.04, Math.min(maxTop, centerY - blockH / 2));
  const style = yzStyle.value;
  if (style === 'shade' && yzPos.value === 'bottom') {
    const gradTop = Math.max(0, Math.min(H * 0.5, top - size * 1.1));
    const grad = ctx.createLinearGradient(0, gradTop, 0, H);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.75)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, gradTop, W, H - gradTop);
  }
  if (style === 'band') {
    ctx.fillStyle = 'rgba(15,23,42,0.66)';
    ctx.fillRect(0, top - size * 0.5, W, blockH + size);
  }
  const mainTop = top + (subLines.length ? subLines.length * lhS + size * 0.26 : 0);
  // 荧光高亮：先铺每行荧光色块，再压深色文字
  if (style === 'highlight') {
    const drawBlock = (ln, y, s) => {
      const w = ctx.measureText(ln).width + s * 0.9;
      ctx.save();
      ctx.fillStyle = hexToRgba(fxTheme.value.highlight, 0.92);
      ctx.beginPath();
      ctx.roundRect(W / 2 - w / 2, y - s * 0.58, w, s * 1.16, s * 0.16);
      ctx.fill();
      ctx.restore();
    };
    ctx.font = font(subSize);
    subLines.forEach((ln, i) => drawBlock(ln, top + lhS * (i + 0.5), subSize));
    ctx.font = font(size);
    mainLines.forEach((ln, i) => drawBlock(ln, mainTop + lhM * (i + 0.5), size));
  }
  // 副标题在上、主标题在下
  subLines.forEach((ln, i) => {
    paintFx(ctx, ln, W / 2, top + lhS * (i + 0.5), subSize, style, true, fam);
  });
  mainLines.forEach((ln, i) => {
    paintFx(ctx, ln, W / 2, mainTop + lhM * (i + 0.5), size, style, false, fam);
  });
};

const drawDazibao = (ctx, W, H) => {
  const t = DZ_THEMES[dzTheme.value];
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, t.bg[0]);
  grad.addColorStop(1, t.bg[1]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  // 装饰圆点
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(W * (0.12 + i * 0.38), H * 0.08, W * 0.02, 0, Math.PI * 2);
    ctx.fill();
  }
  const main = (dzTitle.value || props.title || '').slice(0, 16);
  const mid = Math.ceil(main.length / 2);
  const lines = main.length <= 8 ? [main] : [main.slice(0, mid), main.slice(mid)];
  const size = W * (lines.length > 1 ? 0.135 : 0.17);
  const startY = H * (dzShowProduct.value ? 0.3 : 0.42) - (lines.length - 1) * size * 0.6;
  lines.forEach((ln, i) => {
    drawText(ctx, ln, W / 2, startY + i * size * 1.18, size, t.main, 'stroke');
  });
  const sub = dzSub.value.trim().slice(0, 24);
  if (sub) {
    ctx.fillStyle = t.sub;
    ctx.font = `600 ${W * 0.045}px "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(sub, W / 2, startY + lines.length * size * 1.18 + W * 0.05);
  }
  if (dzShowProduct.value) {
    const img = imgCache.get(images.value[0]?.url ?? '');
    const w = W * 0.56;
    const hh = H * 0.22;
    const y = H * 0.8;
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.roundRect(W / 2 - w / 2, y - hh / 2, w, hh, w * 0.05);
    ctx.fill();
    ctx.clip();
    if (img) drawCoverFit(ctx, img, W / 2, y, w, hh);
    ctx.restore();
  }
};

const drawPintu = (ctx, W, H) => {
  const urls = pickSet.value.map((i) => images.value[i]?.url).filter(Boolean);
  const imgs = urls.map((u) => imgCache.get(u)).filter(Boolean);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  const gap = W * 0.015;
  const cells = [];
  if (imgs.length >= 4) {
    const cw = (W - gap * 3) / 2;
    const ch = (H - gap * 3) / 2;
    imgs.slice(0, 4).forEach((img, i) => {
      cells.push({ img, x: gap + cw / 2 + (i % 2) * (cw + gap), y: gap + ch / 2 + Math.floor(i / 2) * (ch + gap), w: cw, h: ch });
    });
  } else if (imgs.length === 3) {
    const topH = H * 0.55;
    const bw = (W - gap * 3) / 2;
    cells.push({ img: imgs[0], x: W / 2, y: gap + topH / 2, w: W - gap * 2, h: topH });
    cells.push({ img: imgs[1], x: gap + bw / 2, y: gap * 2 + topH + (H - gap * 3 - topH) / 2, w: bw, h: H - gap * 3 - topH });
    cells.push({ img: imgs[2], x: gap * 2 + bw + bw / 2, y: gap * 2 + topH + (H - gap * 3 - topH) / 2, w: bw, h: H - gap * 3 - topH });
  } else if (imgs.length === 2) {
    const ch = (H - gap * 3) / 2;
    cells.push({ img: imgs[0], x: W / 2, y: gap + ch / 2, w: W - gap * 2, h: ch });
    cells.push({ img: imgs[1], x: W / 2, y: gap * 2 + ch + ch / 2, w: W - gap * 2, h: ch });
  }
  cells.forEach((c) => {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(c.x - c.w / 2, c.y - c.h / 2, c.w, c.h, W * 0.012);
    ctx.clip();
    drawCoverFit(ctx, c.img, c.x, c.y, c.w, c.h);
    ctx.restore();
  });
  const title = (ptTitle.value || '').trim().slice(0, 20);
  if (title) {
    const size = W * 0.075;
    const bandH = size * 1.7;
    ctx.fillStyle = 'rgba(15,23,42,0.66)';
    ctx.fillRect(0, H * 0.44 - bandH / 2, W, bandH);
    drawText(ctx, title, W / 2, H * 0.44, size, '#ffffff', 'plain');
  }
};

const drawPreview = async () => {
  if (activeTab.value === 'scene' && scResult.value) return;
  const need = [];
  if (activeTab.value === 'yazi') need.push(baseImage.value);
  if (activeTab.value === 'dazibao' && dzShowProduct.value) need.push(images.value[0]?.url);
  if (activeTab.value === 'pintu') need.push(...pickSet.value.map((i) => images.value[i]?.url));
  if (activeTab.value === 'poster' && poBg.value) need.push(poBg.value);
  await Promise.all(need.filter(Boolean).map((u) => loadImage(u)));
  await nextTick();
  const canvas = previewCanvas.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (activeTab.value === 'yazi') drawYazi(ctx, canvas.width, canvas.height);
  else if (activeTab.value === 'dazibao') drawDazibao(ctx, canvas.width, canvas.height);
  else if (activeTab.value === 'pintu') drawPintu(ctx, canvas.width, canvas.height);
  else if (activeTab.value === 'poster') drawPoster(ctx, canvas.width, canvas.height);
};

// AI 海报排版：pure=整图 AI 出（含文字），overlay=顶部标题区 + 左侧功能标签本地合成
const drawPoster = (ctx, W, H) => {
  const img = poBg.value ? imgCache.get(poBg.value) : null;
  ctx.fillStyle = '#0b1220';
  ctx.fillRect(0, 0, W, H);
  if (img) {
    drawCoverFit(ctx, img, W / 2, H / 2, W, H);
    if (poMode.value === 'pure') return; // 纯 AI 生图：文字已画进图里，不再叠加
  } else {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#0e1a33');
    g.addColorStop(1, '#123a6b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = `600 ${W * 0.042}px "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(poMode.value === 'pure' ? '点左侧「AI 生成整图海报」开始（⚡2/次）' : '点左侧「AI 生成海报背景」开始（⚡2/次）', W / 2, H / 2);
    if (poMode.value === 'pure') return; // 纯 AI 生图：文字走模型，本地不排版
  }
  // 顶部主标题（自动换行 ≤3 行）
  const title = (poTitle.value || props.title || '').trim().slice(0, 40);
  if (title) {
    const fam = designerFontCss();
    let size = W * (title.length > 20 ? 0.07 : title.length > 10 ? 0.082 : 0.094);
    const font = (s) => fontStr(s, fam);
    ctx.font = font(size);
    let lines = wrapByMeasure(ctx, title, W * 0.9);
    if (lines.length > 3) {
      size = W * Math.max(0.05, (0.082 * 2.6) / lines.length);
      ctx.font = font(size);
      lines = wrapByMeasure(ctx, title, W * 0.9);
    }
    const lh = size * 1.28;
    const startY = H * 0.06 + size * 0.6;
    lines.forEach((ln, i) => paintFx(ctx, ln, W / 2, startY + i * lh, size, poFx.value, false, fam));
    // 副标题（默认产品名）
    const sub = (poSub.value || props.productName || '').trim().slice(0, 30);
    if (sub) {
      const subSize = W * 0.048;
      ctx.font = `900 ${subSize}px "PingFang SC", "Microsoft YaHei", sans-serif`;
      paintFx(ctx, sub, W / 2, startY + lines.length * lh + subSize * 0.2, subSize, 'band', false);
    }
  }
  // 左侧功能标签（发光描边圆角药丸）
  const tags = poTags.value.map((t) => (t ?? '').trim()).filter(Boolean).slice(0, 3);
  if (tags.length) {
    const tagSize = W * 0.048;
    ctx.textBaseline = 'middle';
    tags.forEach((t, i) => {
      ctx.font = `700 ${tagSize}px "PingFang SC", "Microsoft YaHei", sans-serif`;
      const tw = ctx.measureText(t).width;
      const pw = tw + tagSize * 1.7;
      const ph = tagSize * 1.7;
      const px = W * 0.06;
      const py = H * 0.46 + i * ph * 1.5;
      ctx.save();
      ctx.shadowColor = 'rgba(56,189,248,0.95)';
      ctx.shadowBlur = tagSize * 0.55;
      ctx.fillStyle = 'rgba(13,42,84,0.55)';
      ctx.beginPath();
      ctx.roundRect(px, py - ph / 2, pw, ph, ph / 2);
      ctx.fill();
      ctx.shadowBlur = tagSize * 0.35;
      ctx.strokeStyle = 'rgba(125,211,252,0.95)';
      ctx.lineWidth = Math.max(1.5, tagSize * 0.08);
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = '#ffffff';
      ctx.font = `700 ${tagSize}px "PingFang SC", "Microsoft YaHei", sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText(t, px + tagSize * 0.85, py + tagSize * 0.06);
    });
  }
};

watch(
  [activeTab, yzTitle, yzSub, yzPos, yzStyle, dzTitle, dzSub, dzTheme, dzShowProduct, pickSet.value, ptLayout, ptTitle,
    poTitle, poSub, poFx, poPreset, poBg, poTags.value, shapes.value, poMode, poRefIdx, serverScenes.value, fxTheme],
  () => drawPreview(),
  { deep: true },
);
watch(scResult, (v) => {
  if (v) loadImage(v);
});

// ── AI 场景
const generateScene = async () => {
  if (!baseImage.value) return message.warning('请先在配图步骤选定产品底图');
  if (!scPrompt.value.trim()) return message.warning('请选择或填写场景描述');
  scBusy.value = true;
  scResult.value = '';
  try {
    const res = await generateCoverScene(
      { imageUrl: baseImage.value, prompt: scPrompt.value.trim(), width: 1080, height: 1440 },
      { brandId: brandId.value },
    );
    scResult.value = res?.url ?? '';
    message.success('AI 场景已生成');
    await loadImage(scResult.value);
  } catch (e) {
    message.error(e?.response?.data?.msg ?? e?.message ?? 'AI 生成失败');
  } finally {
    scBusy.value = false;
  }
};

const useAsBase = () => {
  bgOverride.value = scResult.value;
  scResult.value = '';
  yzTitle.value = scOverlay.value ? scTitle.value || yzTitle.value : yzTitle.value;
  activeTab.value = 'yazi';
  message.success('已设为底图，继续压字');
};

const applyScene = () => {
  emit('apply', { remoteUrl: scResult.value, name: 'AI 场景封面' });
};

// ── 导出：预览 540×720 同比例放大到 1080×1440
const applyCanvas = () => {
  const src = previewCanvas.value;
  if (!src) return;
  const out = document.createElement('canvas');
  out.width = 1080;
  out.height = 1440;
  const ctx = out.getContext('2d');
  ctx.drawImage(src, 0, 0, out.width, out.height);
  uploading.value = true;
  try {
    // JPEG：海报/压字类封面是照片内容，体积比 PNG 小一个量级
    emit('apply', { dataUrl: out.toDataURL('image/jpeg', 0.92) });
  } finally {
    uploading.value = false;
  }
};

watch(
  () => props.open,
  (v) => {
    if (v) {
      activeTab.value = 'yazi';
      bgOverride.value = '';
      scResult.value = '';
      scBusy.value = false;
      scPrompt.value = SCENE_PRESETS[0].prompt;
      scOverlay.value = true;
      scTitle.value = props.title ?? '';
      yzTitle.value = props.title ?? '';
      yzSub.value = '';
      dzTitle.value = props.title ?? '';
      dzSub.value = '';
      pickSet.value = props.images?.length ? [0] : [];
      ptTitle.value = props.title ?? '';
      poTitle.value = props.title ?? '';
      poSub.value = props.productName ?? '';
      poBg.value = '';
      poBusy.value = false;
      poRefIdx.value = 0;
      poPreset.value = 0;
      poFx.value = 'gold';
      loadEditorMeta();
      loadPosterLimit();
      loadPosterScenes();
      loadFxTheme();
      nextTick(() => drawPreview());
    }
  },
);
</script>

<style scoped>
.ce-mask {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: #fff;
  display: flex;
  flex-direction: column;
}

.ce-topbar {
  display: flex;
  align-items: center;
  height: 52px;
  padding: 0 20px;
  background: #0b1526;
  color: #fff;
}

.ce-brand {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ce-name {
  font-weight: 600;
}

.ce-tabs {
  flex: 1;
  display: flex;
  justify-content: center;
  gap: 28px;
}

.ce-tab {
  position: relative;
  border: none;
  background: none;
  color: #94a3b8;
  font-size: 14px;
  cursor: pointer;
  padding: 6px 2px;
}

.ce-tab.active {
  color: #facc15;
}

.ce-tab.active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -2px;
  height: 2px;
  background: #facc15;
}

.ce-close {
  border: none;
  background: none;
  color: #94a3b8;
  cursor: pointer;
  font-size: 13px;
}

.ce-close:hover {
  color: #fff;
}

.ce-body {
  flex: 1;
  overflow: auto;
  padding: 20px 28px;
  background: #f8fafc;
}

.ce-body.editor {
  display: flex;
  gap: 28px;
}

.ed-left {
  width: 420px;
  flex: 0 0 420px;
}

.ed-section-label {
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 8px;
  font-size: 15px;
}

.ed-tip {
  margin: 0 0 14px;
  color: #64748b;
  font-size: 12.5px;
  line-height: 1.7;
}

.ed-field {
  margin-bottom: 14px;
}

.limit-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 10px;
  font-size: 12.5px;
}

.limit-badge {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  color: #1d4ed8;
  border-radius: 999px;
  padding: 2px 10px;
  font-size: 12px;
}

.limit-manage {
  color: #64748b;
}

.shape-add-row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.shape-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.shape-name {
  color: #475569;
  font-size: 12.5px;
  width: 34px;
}

.color-dot {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid #e2e8f0;
  display: inline-block;
}

.color-dot.on {
  border-color: #3456e6;
}

.ed-label {
  color: #475569;
  font-size: 13px;
  margin-bottom: 6px;
}

.ed-right {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.preview-wrap {
  position: relative;
}

.preview-canvas {
  width: min(420px, 100%);
  border-radius: 14px;
  box-shadow: 0 14px 34px rgba(15, 23, 42, 0.16);
}

.scene-result {
  width: min(420px, 100%);
  border-radius: 14px;
  box-shadow: 0 14px 34px rgba(15, 23, 42, 0.16);
  display: block;
}

.scene-spin {
  width: min(420px, 100%);
  height: 300px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ed-actions {
  margin-top: 18px;
  display: flex;
  gap: 12px;
}

.gen-btn {
  width: min(420px, 80vw);
  height: 46px;
  background: linear-gradient(90deg, #6366f1, #a78bfa);
  border: none;
}

.use-btn {
  background: #f59e0b;
  border: none;
  padding: 0 40px;
}

.bg-row {
  display: flex;
  gap: 12px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 12px;
  background: #fff;
  align-items: center;
}

.bg-info {
  flex: 1;
}

.bg-title {
  font-weight: 600;
  color: #1e293b;
  font-size: 14px;
}

.bg-sub {
  margin-top: 4px;
  color: #16a34a;
  font-size: 12px;
}

.bg-thumb {
  width: 72px;
  height: 72px;
  object-fit: cover;
  border-radius: 8px;
}

.scene-chips {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.scene-add-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 10px;
  align-items: center;
}

.scene-chip {
  cursor: pointer;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 12.5px;
  border: 1px solid #e2e8f0;
  background: #fff;
  color: #475569;
}

.scene-chip.active {
  border-color: #3456e6;
  background: #eef4ff;
  color: #3456e6;
}

.swatch-row {
  display: flex;
  gap: 10px;
}

.swatch {
  width: 44px;
  height: 32px;
  border-radius: 8px;
  cursor: pointer;
  border: 2px solid transparent;
}

.swatch.selected {
  border-color: #3456e6;
}

.pick-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.pick-cell {
  position: relative;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  border: 2px solid transparent;
  aspect-ratio: 1;
}

.pick-cell.selected {
  border-color: #3456e6;
}

.pick-cell img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.pick-idx {
  position: absolute;
  top: 4px;
  left: 4px;
  width: 20px;
  height: 20px;
  border-radius: 999px;
  background: #3456e6;
  color: #fff;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ck-frame {
  flex: 1;
  border: none;
  background: #f8fafc;
}

.ck-side {
  width: 300px;
  padding: 18px 16px;
  border-left: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: #fff;
}

.ck-title {
  font-size: 15px;
  font-weight: 700;
  color: #1e293b;
}

.ck-tip {
  font-size: 12px;
  color: #64748b;
  line-height: 1.7;
}

.ck-hint {
  font-size: 11px;
  color: #94a3b8;
  margin-top: auto;
}
</style>
