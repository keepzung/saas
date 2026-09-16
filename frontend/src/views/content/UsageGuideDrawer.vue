<template>
  <a-drawer
    :open="open"
    width="min(720px, 100vw)"
    title="智能内容工厂使用说明"
    :footer="null"
    @update:open="$emit('update:open', $event)"
  >
    <div class="usage-guide">
      <div class="guide-hero">
        <div class="guide-kicker">新手先看这里</div>
        <h2>三步开启批量内容生产</h2>
        <p>
          智能内容工厂围绕「产品知识 → 创作策略 → 批量生成 → 审核分发」的链路设计。
          先把产品资料与策略配置完善，AI 才能生成贴合业务的内容草稿，最后经审核流入内容包供分发领取。
        </p>
      </div>

      <div class="guide-block">
        <h3 class="guide-block-title">功能介绍</h3>
        <div class="feature-grid">
          <div class="feature-card">
            <div class="feature-icon-wrap"><FileTextOutlined /></div>
            <h4>产品知识库</h4>
            <strong>写什么</strong>
            <p>产品基础信息、销售政策与常见问答，是 AI 生成内容的素材底座。</p>
          </div>
          <div class="feature-card">
            <div class="feature-icon-wrap"><PictureOutlined /></div>
            <h4>素材库</h4>
            <strong>用什么图</strong>
            <p>产品配图与场景素材集中管理，生成内容时自动匹配封面。</p>
          </div>
          <div class="feature-card">
            <div class="feature-icon-wrap"><BulbOutlined /></div>
            <h4>创作策略库</h4>
            <strong>怎么写</strong>
            <p>策略卡与场景约束文案角度、语气与结构，保证输出风格统一。</p>
          </div>
        </div>
      </div>

      <div class="guide-block">
        <h3 class="guide-block-title">操作步骤</h3>
        <div class="guide-steps">
          <div v-for="(step, i) in steps" :key="i" class="guide-step">
            <div class="step-rail">
              <div class="step-number">{{ i + 1 }}</div>
              <div v-if="i < steps.length - 1" class="step-line"></div>
            </div>
            <div class="step-card">
              <div class="step-label">第 {{ i + 1 }} 步</div>
              <div class="step-title-row">
                <h4>{{ step.title }}</h4>
                <a-button type="link" size="small" @click="go(step.path)">去设置</a-button>
              </div>
              <div class="step-summary">{{ step.summary }}</div>
              <ul>
                <li v-for="(item, j) in step.bullets" :key="j">{{ item }}</li>
              </ul>
              <div class="step-result">做到什么算完成：{{ step.result }}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="ready-card">
        <div class="ready-title">准备工作完成后，可以开始创作</div>
        <div class="ready-actions">
          <a-button @click="go('/content-center-pro/campaign/batch-tasks')">批量生产</a-button>
        </div>
      </div>

      <div class="guide-footer">
        <span>配置过程遇到问题，可在产品配置页调整后重试生成。</span>
        <a-button type="primary" @click="$emit('update:open', false)">知道了</a-button>
      </div>
    </div>
  </a-drawer>
</template>

<script setup>
import { useRouter } from 'vue-router';
import {
  BulbOutlined,
  FileTextOutlined,
  PictureOutlined,
} from '@ant-design/icons-vue';

defineProps({
  open: { type: Boolean, default: false },
});

defineEmits(['update:open']);

const router = useRouter();

const steps = [
  {
    title: '完善产品知识',
    path: '/content-center-pro/config/products',
    summary: '在产品配置中录入产品的基础信息。',
    bullets: ['产品名称与显示名称', '简介、知识、销售政策与 FAQ'],
    result: '至少 1 个产品具备名称与简介',
  },
  {
    title: '配置创作策略',
    path: '/content-center-pro/config/products',
    summary: '为产品添加策略卡与场景子级，约束生成角度。',
    bullets: ['策略卡定义文案框架', '场景定义投放语境'],
    result: '产品下至少挂载 1 张策略卡或场景',
  },
  {
    title: '创建批量任务',
    path: '/content-center-pro/campaign/batch-tasks',
    summary: '选择产品与目标内容包，设定生成数量。',
    bullets: ['任务完成后草稿自动进入内容包', '失败条目可在任务列表查看'],
    result: '任务运行完成且生成数量达标',
  },
];

const go = (path) => {
  router.push(path);
};
</script>

<style scoped>
.usage-guide {
  display: flex;
  flex-direction: column;
  gap: 28px;
  padding: 4px;
  background: #f8fafc;
}

.guide-hero {
  padding: 24px;
  border: 1px solid rgba(80, 135, 236, 0.2);
  border-radius: 14px;
  background:
    radial-gradient(circle at 90% 10%, rgba(167, 139, 250, 0.16), transparent 38%),
    linear-gradient(135deg, #eef4ff, #fff 68%);
}

.guide-kicker {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-primary);
  margin-bottom: 8px;
}

.guide-hero h2 {
  font-size: 24px;
  font-weight: 700;
  color: #1e293b;
  margin: 0 0 10px;
}

.guide-hero p {
  max-width: 590px;
  margin: 0;
  font-size: 14px;
  line-height: 1.8;
  color: #475569;
}

.guide-block-title {
  font-size: 16px;
  font-weight: 700;
  color: #1e293b;
  margin: 0 0 12px;
}

.feature-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.feature-card {
  padding: 16px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
}

.feature-icon-wrap {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: rgba(80, 135, 236, 0.1);
  color: #5087ec;
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 10px;
}

.feature-card h4 {
  font-size: 14px;
  font-weight: 700;
  color: #1e293b;
  margin: 0 0 4px;
}

.feature-card strong {
  display: block;
  font-size: 13px;
  color: var(--color-primary);
  margin-bottom: 6px;
}

.feature-card p {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.7;
  color: #64748b;
}

.guide-steps {
  display: flex;
  flex-direction: column;
}

.guide-step {
  display: grid;
  grid-template-columns: 36px 1fr;
  gap: 0 8px;
}

.step-rail {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.step-number {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--color-primary);
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 0 5px rgba(80, 135, 236, 0.1);
  flex-shrink: 0;
}

.step-line {
  flex: 1;
  width: 2px;
  min-height: 12px;
  background: #e2e8f0;
  margin: 4px 0;
}

.step-card {
  margin: 0 0 20px 8px;
  padding: 18px;
  border-radius: 12px;
  background: #fff;
  border: 1px solid #e2e8f0;
}

.guide-step:last-child .step-card {
  margin-bottom: 0;
}

.step-label {
  font-size: 12px;
  color: #94a3b8;
  margin-bottom: 2px;
}

.step-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.step-title-row h4 {
  font-size: 16px;
  font-weight: 700;
  color: #1e293b;
  margin: 0;
}

.step-summary {
  font-size: 13.5px;
  font-weight: 600;
  color: #475569;
  margin: 6px 0 8px;
}

.step-card ul {
  margin: 0 0 12px;
  padding-left: 18px;
}

.step-card li {
  font-size: 13px;
  color: #64748b;
  line-height: 1.8;
}

.step-result {
  padding: 8px 12px;
  border-radius: 8px;
  background: #f0fdf4;
  color: #3f6212;
  font-size: 12.5px;
}

.ready-card {
  padding: 20px 24px;
  border-radius: 14px;
  background:
    radial-gradient(circle at 8% 20%, rgba(167, 139, 250, 0.14), transparent 40%),
    linear-gradient(135deg, #eef4ff, #fff 70%);
  border: 1px solid rgba(80, 135, 236, 0.18);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.ready-title {
  font-size: 15px;
  font-weight: 700;
  color: #1e293b;
}

.ready-actions {
  display: flex;
  gap: 8px;
}

.guide-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.guide-footer span {
  font-size: 12.5px;
  color: #94a3b8;
}

@media (max-width: 640px) {
  .feature-grid {
    grid-template-columns: 1fr;
  }

  .guide-hero h2 {
    font-size: 20px;
  }
}
</style>
