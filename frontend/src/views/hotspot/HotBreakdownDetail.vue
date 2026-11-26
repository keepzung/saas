<template>
  <div>
    <video
      v-if="videoUrl"
      :src="`/api/agency-api/hotspot-public/contents/${contentId}/stream`"
      :poster="coverUrl ?? undefined"
      controls
      preload="metadata"
      class="video"
    ></video>
    <template v-if="breakdown?.status === 'done'">
      <a-alert
        v-if="breakdown.partial"
        type="warning"
        show-icon
        message="视频源不可得，本次为文本降级拆解"
        class="sec"
      />
      <div class="sec">
        <div class="lab-row">
          <span class="lab">原文案</span>
          <a-button size="small" type="link" @click="copyScript">复制文案</a-button>
        </div>
        <pre class="script">{{ breakdown.scriptText || '（未提取到文案）' }}</pre>
      </div>
      <div class="sec"><span class="lab">开头钩子</span><p>{{ breakdown.hook }}</p></div>
      <div class="sec">
        <span class="lab">结构节奏</span>
        <a-steps direction="vertical" size="small" :current="99" class="steps">
          <a-step
            v-for="(s, i) in breakdown.structure ?? []"
            :key="i"
            :title="s.stage"
            :description="s.summary + (s.voiceover ? `｜口播：${s.voiceover}` : '')"
          />
        </a-steps>
      </div>
      <div class="sec">
        <span class="lab">卖点提炼</span>
        <div><a-tag v-for="p in breakdown.sellingPoints ?? []" :key="p" color="blue">{{ p }}</a-tag></div>
      </div>
      <div class="sec"><span class="lab">行动号召</span><p>{{ breakdown.cta }}</p></div>
      <div class="sec">
        <span class="lab">风格标签</span>
        <div><a-tag v-for="t in breakdown.styleTags ?? []" :key="t">{{ t }}</a-tag></div>
      </div>
      <div class="sec"><span class="lab">复刻建议</span><p>{{ breakdown.replicateTips }}</p></div>
    </template>
    <a-alert
      v-else
      type="info"
      class="sec"
      :message="`状态：${statusText(breakdown?.status)}${breakdown?.errorMsg ? `，错误：${breakdown.errorMsg}` : ''}`"
    />
  </div>
</template>

<script setup>
import { message } from 'ant-design-vue';

const props = defineProps({
  breakdown: { type: Object, default: null },
  contentId: { type: Number, default: null },
  videoUrl: { type: String, default: '' },
  coverUrl: { type: String, default: '' },
});

const statusText = (s) => ({ done: '已完成', processing: '拆解中', pending: '排队中', failed: '失败' }[s] ?? s ?? '—');

const copyScript = async () => {
  const text = props.breakdown?.scriptText ?? '';
  if (!text) return message.warning('没有可复制的文案');
  try {
    await navigator.clipboard.writeText(text);
    message.success('已复制');
  } catch {
    // 非安全上下文兜底
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    message.success('已复制');
  }
};
</script>

<style scoped>
.video { width: 100%; max-height: 320px; border-radius: 10px; background: #000; object-fit: contain; }
.sec { margin-top: 16px; }
.lab { font-weight: 600; color: #555; }
.lab-row { display: flex; align-items: center; justify-content: space-between; }
.lab-row .lab { margin-left: 0; }
.sec p { margin: 6px 0 0; line-height: 1.7; white-space: pre-wrap; }
.steps { margin-top: 8px; }
.script { white-space: pre-wrap; background: #fafafa; padding: 10px; border-radius: 8px; font-size: 12px; margin-top: 6px; }
</style>
