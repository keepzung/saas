<template>
  <Teleport to="body">
    <div v-if="open" class="ce-mask">
      <div class="ce-topbar">
        <div class="ce-brand">
          <PictureOutlined />
          <span class="ce-name">智能编辑</span>
          <span class="ce-quota">今日还可使用 ★ 5/5</span>
        </div>
        <div class="ce-tabs">
          <button
            v-for="t in tabs"
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

      <!-- 模板选择 -->
      <div v-if="stage === 'gallery'" class="ce-body">
        <div class="ce-hint">
          <AppstoreOutlined /> 选择一个模板，基于当前选中的图片进行编辑
        </div>
        <div class="tpl-grid">
          <div
            v-for="tpl in templates"
            :key="tpl.id"
            class="tpl-card"
            :class="{ selected: tpl.id === selectedTpl }"
            @click="selectTpl(tpl)"
          >
            <canvas class="tpl-canvas" :ref="(el) => setTplCanvas(tpl.id, el)" width="270" height="360"></canvas>
            <div class="tpl-name">{{ tpl.name }}</div>
          </div>
        </div>
      </div>

      <!-- 编辑 -->
      <div v-else-if="stage === 'editor'" class="ce-body editor">
        <div class="ed-left">
          <button class="back-btn" type="button" @click="stage = 'gallery'">← 重新选择模板</button>
          <div class="ed-section-label">背景图</div>
          <div class="bg-row">
            <div class="bg-info">
              <div class="bg-title">图片预览</div>
              <div class="bg-sub">已自动填充当前背景图</div>
            </div>
            <img v-if="bgImage" :src="bgImage" class="bg-thumb" />
            <div v-else class="bg-thumb placeholder">产品底图</div>
          </div>
          <div class="ed-tip">请填充合适长度的文字，以确保设计效果美观</div>
          <div v-for="(f, i) in textFieldDefs" :key="i" class="ed-field">
            <div class="ed-label">{{ f.label }}</div>
            <a-input v-model:value="texts[i]" :maxlength="100" :placeholder="f.placeholder" />
          </div>
        </div>
        <div class="ed-right">
          <div class="preview-wrap">
            <canvas ref="previewCanvas" width="540" height="720" class="preview-canvas"></canvas>
            <span class="gen-badge" v-if="generated">生成结果</span>
          </div>
          <div class="ed-actions">
            <template v-if="generated">
              <a-button @click="generated = false">继续编辑</a-button>
              <a-button type="primary" class="use-btn" :loading="uploading" @click="apply">选 用</a-button>
            </template>
            <a-button v-else type="primary" block class="gen-btn" @click="render">
              ✦ 智能生成设计 ✦
            </a-button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { nextTick, ref, watch } from 'vue';
import { AppstoreOutlined, PictureOutlined } from '@ant-design/icons-vue';
import { message } from 'ant-design-vue';

const props = defineProps({
  open: { type: Boolean, default: false },
  bgImage: { type: String, default: '' },
  title: { type: String, default: '' },
});
const emit = defineEmits(['close', 'apply']);

const tabs = [
  { key: 'free', name: '自由设计' },
  { key: 'batch', name: '智能批量设计' },
];
const activeTab = ref('free');
const stage = ref('gallery');
const selectedTpl = ref(null);
const generated = ref(false);
const uploading = ref(false);
const previewCanvas = ref(null);
const tplCanvases = {};

// 5 段文字：主标题 / 副标题 / 小字政策1-3
const textFieldDefs = [
  { label: '文本1（主标题）', placeholder: '这是主标题' },
  { label: '文本2（副标题）', placeholder: '这是副标题' },
  { label: '文本3', placeholder: '小字政策1' },
  { label: '文本4', placeholder: '小字政策2' },
  { label: '文本5', placeholder: '小字政策3' },
];
const texts = ref(['', '', '', '', '']);

// 简版模板：渐变底 + 文字排版（绘制按画布实际尺寸，位置为比例坐标）
const templates = [
  {
    id: 'poster',
    name: '主标题型',
    bg: ['#dbeafe', '#ede9fe'],
    draw(ctx, W, H, t) {
      h.text(ctx, t[0] || '这是主标题', W / 2, H * 0.16, W * 0.085, '#1e293b', true);
      h.text(ctx, t[1] || '这是副标题副标题副标题', W / 2, H * 0.26, W * 0.05, '#334155', false);
      h.thumb(ctx, W / 2, H * 0.5, W * 0.5, H * 0.34);
      h.pills(ctx, [t[2], t[3], t[4]], W * 0.1, H * 0.78, W * 0.04);
    },
  },
  {
    id: 'promo',
    name: '促销大字型',
    bg: ['#fef3c7', '#fecaca'],
    draw(ctx, W, H, t) {
      h.text(ctx, t[0] || '此处修改标题', W / 2, H * 0.22, W * 0.1, '#b91c1c', true);
      h.text(ctx, t[1] || '限时权益一览', W / 2, H * 0.34, W * 0.055, '#7c2d12', false);
      h.pills(ctx, [t[2], t[3], t[4]], W * 0.12, H * 0.62, W * 0.048);
      h.thumb(ctx, W / 2, H * 0.85, W * 0.42, H * 0.14);
    },
  },
  {
    id: 'clean',
    name: '知识清单型',
    bg: ['#dcfce7', '#dbeafe'],
    draw(ctx, W, H, t) {
      h.text(ctx, t[0] || '产品干货篇', W / 2, H * 0.12, W * 0.078, '#14532d', true);
      h.text(ctx, t[1] || '每天一个使用小知识', W / 2, H * 0.2, W * 0.044, '#166534', false);
      h.pills(ctx, [t[2], t[3], t[4]], W * 0.14, H * 0.42, W * 0.042);
      h.thumb(ctx, W / 2, H * 0.78, W * 0.56, H * 0.28);
    },
  },
  {
    id: 'tech',
    name: '科技蓝型',
    bg: ['#e0f2fe', '#e0e7ff'],
    draw(ctx, W, H, t) {
      h.text(ctx, t[0] || '智能配置大盘点', W / 2, H * 0.14, W * 0.082, '#1e3a8a', true);
      h.text(ctx, t[1] || '看得见的安全感', W / 2, H * 0.24, W * 0.048, '#3730a3', false);
      h.pills(ctx, [t[2], t[3], t[4]], W * 0.12, H * 0.66, W * 0.042);
      h.thumb(ctx, W / 2, H * 0.47, W * 0.52, H * 0.3);
    },
  },
];

const h = {
  text(ctx, str, x, y, size, color, stroke) {
    ctx.save();
    ctx.font = `900 ${size}px "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (stroke) {
      ctx.lineWidth = size / 7;
      ctx.strokeStyle = 'rgba(255,255,255,0.92)';
      ctx.lineJoin = 'round';
      ctx.strokeText(String(str).slice(0, 14), x, y);
    }
    ctx.fillStyle = color;
    ctx.fillText(String(str).slice(0, 14), x, y);
    ctx.restore();
  },
  pills(ctx, items, x, y, size) {
    const list = items.filter(Boolean).slice(0, 3);
    list.forEach((s, i) => {
      const py = y + i * size * 1.7;
      ctx.save();
      ctx.fillStyle = 'rgba(15,23,42,0.78)';
      const w = Math.min(W_PILL_MAX(size), size * String(s).length * 1.05 + size * 2);
      ctx.beginPath();
      ctx.roundRect(x, py - size * 0.72, w, size * 1.44, size * 0.72);
      ctx.fill();
      ctx.font = `700 ${size}px "PingFang SC", "Microsoft YaHei", sans-serif`;
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(s).slice(0, 16), x + size * 0.9, py);
      ctx.restore();
    });
  },
  thumb(ctx, x, y, w, hh) {
    const img = bgLoad.value;
    ctx.save();
    if (img) {
      const scale = Math.max(w / img.width, hh / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      ctx.beginPath();
      ctx.roundRect(x - w / 2, y - hh / 2, w, hh, w * 0.06);
      ctx.clip();
      ctx.drawImage(img, x - dw / 2, y - dh / 2, dw, dh);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath();
      ctx.roundRect(x - w / 2, y - hh / 2, w, hh, w * 0.06);
      ctx.fill();
      ctx.fillStyle = '#94a3b8';
      ctx.font = `600 ${w * 0.09}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('产品底图', x, y);
    }
    ctx.restore();
  },
};

const W_PILL_MAX = (size) => size * 20;

const bgLoad = ref(null);
const loadBg = () =>
  new Promise((resolve) => {
    if (!props.bgImage) {
      bgLoad.value = null;
      resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      bgLoad.value = img;
      resolve(img);
    };
    img.onerror = () => {
      bgLoad.value = null;
      resolve(null);
    };
    img.src = props.bgImage;
  });

const setTplCanvas = (id, el) => {
  if (el) tplCanvases[id] = el;
};

const drawTpl = (canvas, tpl) => {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, tpl.bg[0]);
  grad.addColorStop(1, tpl.bg[1]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  tpl.draw(ctx, W, H, texts.value);
};

const renderGallery = async () => {
  await loadBg();
  await nextTick();
  templates.forEach((tpl) => drawTpl(tplCanvases[tpl.id], tpl));
};

const render = () => {
  drawTpl(previewCanvas.value, templates.find((t) => t.id === selectedTpl.value));
  generated.value = true;
};

const selectTpl = (tpl) => {
  selectedTpl.value = tpl.id;
  if (!texts.value[0]) texts.value[0] = props.title ?? '';
  stage.value = 'editor';
  generated.value = false;
  nextTick(() => drawTpl(previewCanvas.value, tpl));
};

const apply = async () => {
  uploading.value = true;
  try {
    const canvas = previewCanvas.value;
    const dataUrl = canvas.toDataURL('image/png');
    emit('apply', { dataUrl });
  } finally {
    uploading.value = false;
  }
};

watch(
  () => props.open,
  (v) => {
    if (v) {
      stage.value = 'gallery';
      generated.value = false;
      texts.value = ['', '', '', '', ''];
      renderGallery();
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

.ce-quota {
  padding: 2px 10px;
  border-radius: 999px;
  background: rgba(250, 204, 21, 0.16);
  color: #facc15;
  font-size: 12px;
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

.ce-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #475569;
  font-size: 13px;
  margin-bottom: 16px;
}

.tpl-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 18px;
}

.tpl-card {
  background: #fff;
  border-radius: 12px;
  padding: 12px;
  cursor: pointer;
  border: 2px solid transparent;
  transition: all 0.2s;
}

.tpl-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.1);
}

.tpl-card.selected {
  border-color: #3456e6;
}

.tpl-canvas {
  width: 100%;
  border-radius: 8px;
  display: block;
}

.tpl-name {
  margin-top: 8px;
  text-align: center;
  color: #475569;
  font-size: 13px;
}

.ce-body.editor {
  display: flex;
  gap: 28px;
}

.ed-left {
  width: 400px;
  flex: 0 0 400px;
}

.back-btn {
  border: 1px solid #cbd5e1;
  background: #fff;
  border-radius: 8px;
  padding: 6px 14px;
  cursor: pointer;
  color: #475569;
  margin-bottom: 18px;
}

.ed-section-label {
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 8px;
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

.bg-thumb.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #e2e8f0;
  color: #94a3b8;
  font-size: 12px;
}

.ed-tip {
  margin: 14px 0 10px;
  color: #7c5cf0;
  font-size: 12.5px;
}

.ed-field {
  margin-bottom: 12px;
}

.ed-label {
  color: #475569;
  font-size: 13px;
  margin-bottom: 4px;
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
  width: min(400px, 100%);
  border-radius: 14px;
  box-shadow: 0 14px 34px rgba(15, 23, 42, 0.16);
}

.gen-badge {
  position: absolute;
  top: 10px;
  right: 10px;
  padding: 3px 10px;
  border-radius: 999px;
  background: #16a34a;
  color: #fff;
  font-size: 12px;
}

.ed-actions {
  margin-top: 18px;
  display: flex;
  gap: 12px;
}

.gen-btn {
  width: min(400px, 80vw);
  height: 46px;
  background: linear-gradient(90deg, #6366f1, #a78bfa);
  border: none;
}

.use-btn {
  background: #f59e0b;
  border: none;
  padding: 0 40px;
}
</style>
