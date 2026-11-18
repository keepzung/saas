<template>
  <div class="recorder">
    <div v-if="!blob" class="idle">
      <a-button type="primary" :loading="starting" @click="start"><AudioOutlined /> 开始录音</a-button>
      <span class="tip">点击开始，对麦克风朗读一段文字</span>
    </div>
    <div v-else-if="recording" class="live">
      <span class="dot"></span>
      <span class="time">{{ fmt(elapsed) }}</span>
      <span class="hint">{{ elapsed < 10 ? '请至少录 10 秒…' : '已可停止，建议 30 秒以上' }}</span>
      <a-button danger @click="stop">停止</a-button>
    </div>
    <div v-else class="done">
      <span class="ok">✓ 已录制 {{ fmt(elapsed) }}</span>
      <a-button size="small" @click="play">试听</a-button>
      <a-button size="small" @click="reset">重录</a-button>
    </div>
    <audio v-if="playUrl" ref="audioEl" :src="playUrl" style="display: none"></audio>
  </div>
</template>

<script setup>
import { onUnmounted, ref } from 'vue';
import { message } from 'ant-design-vue';
import { AudioOutlined } from '@ant-design/icons-vue';

const emit = defineEmits(['recorded']);

const starting = ref(false);
const recording = ref(false);
const blob = ref(null);
const elapsed = ref(0);
const playUrl = ref('');
const audioEl = ref(null);

let stream = null;
let recorder = null;
let chunks = [];
let timer = null;
let startedAt = 0;

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const start = async () => {
  starting.value = true;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((m) =>
      window.MediaRecorder?.isTypeSupported?.(m),
    );
    recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    chunks = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = () => {
      blob.value = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
      playUrl.value = URL.createObjectURL(blob.value);
      emit('recorded', blob.value);
      stream.getTracks().forEach((t) => t.stop());
    };
    recorder.start();
    recording.value = true;
    startedAt = Date.now();
    elapsed.value = 0;
    timer = setInterval(() => {
      elapsed.value = (Date.now() - startedAt) / 1000;
    }, 250);
  } catch (e) {
    const denied = e?.name === 'NotAllowedError' || e?.name === 'PermissionDeniedError';
    message.warning(denied ? '麦克风权限被拒绝，请在浏览器地址栏允许麦克风后重试' : `无法访问麦克风：${e?.message ?? e}`);
  } finally {
    starting.value = false;
  }
};

const stop = () => {
  clearInterval(timer);
  timer = null;
  elapsed.value = (Date.now() - startedAt) / 1000;
  recording.value = false;
  recorder?.stop();
};

const play = () => {
  const el = audioEl.value ?? new Audio(playUrl.value);
  el.currentTime = 0;
  el.play().catch(() => message.warning('浏览器拦截了自动播放，请再点一次试听'));
};

const reset = () => {
  blob.value = null;
  playUrl.value = '';
  elapsed.value = 0;
};

onUnmounted(() => {
  clearInterval(timer);
  if (recording.value) recorder?.stop();
  stream?.getTracks().forEach((t) => t.stop());
});
</script>

<style scoped>
.recorder { width: 100%; }
.idle, .live, .done { display: flex; align-items: center; gap: 10px; }
.tip, .hint { color: #999; font-size: 12px; }
.dot { width: 10px; height: 10px; border-radius: 50%; background: #ff4d4f; animation: blink 1s infinite; }
.time { font-variant-numeric: tabular-nums; font-weight: 600; }
.ok { color: #52c41a; }
@keyframes blink { 50% { opacity: 0.2; } }
</style>
