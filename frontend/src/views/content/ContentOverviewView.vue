<template>
  <PageWrapper title="内容中心总览" subtitle="产品知识 · AI 批量创作 · 审核分发">
    <template #extra>
      <a-button size="small" @click="$router.push('/content-center-pro/config/products')">
        <AppstoreOutlined /> 产品配置
      </a-button>
      <a-button size="small" @click="$router.push('/content-center-pro/campaign/batch-tasks')">
        <ThunderboltOutlined /> 批量任务
      </a-button>
      <a-button size="small" type="primary" @click="$router.push('/content-center-pro/campaign/content-package')">
        进入内容包
      </a-button>
    </template>

    <a-row :gutter="12">
      <a-col :span="6">
        <a-card :bordered="false">
          <a-statistic title="产品数" :value="ov.product_count" />
          <div class="sub muted">
            策略卡 {{ ov.strategy_card_count }} · 场景 {{ ov.scene_count }}
          </div>
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card :bordered="false">
          <a-statistic
            title="内容包"
            :value="ov.package_count"
            :value-style="{ color: '#3456E6' }"
          />
          <div class="sub muted">进行中任务 {{ ov.running_tasks }}</div>
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card :bordered="false">
          <a-statistic
            title="内容总数"
            :value="ov.content_total"
            :value-style="{ color: '#16a34a' }"
          />
          <div class="sub muted">草稿 {{ ov.content_breakdown?.draft ?? 0 }}</div>
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card :bordered="false">
          <a-statistic
            title="待审核"
            :value="ov.content_breakdown?.pending_review ?? 0"
            :value-style="{ color: '#d97706' }"
          />
          <div class="sub muted">
            已驳回 {{ ov.content_breakdown?.rejected ?? 0 }}
          </div>
        </a-card>
      </a-col>
    </a-row>

    <a-card :bordered="false" title="内容状态分布">
      <div class="status-bars">
        <div v-for="item in statusItems" :key="item.key" class="status-item">
          <span class="s-label">{{ item.label }}</span>
          <a-progress
            :percent="pct(item.value)"
            :stroke-color="item.color"
            size="small"
            style="flex: 1"
          />
          <span class="s-num">{{ item.value }}</span>
        </div>
      </div>
    </a-card>
  </PageWrapper>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { message } from 'ant-design-vue';
import {
  AppstoreOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons-vue';
import { getOverview } from '../../api/content';
import PageWrapper from '../../components/PageWrapper.vue';

const ov = ref({});

const statusItems = computed(() => {
  const b = ov.value.content_breakdown ?? {};
  return [
    { key: 'draft', label: '草稿', value: b.draft ?? 0, color: '#94a3b8' },
    { key: 'pending_review', label: '待审核', value: b.pending_review ?? 0, color: '#d97706' },
    { key: 'approved', label: '运营已过', value: b.approved ?? 0, color: '#3456E6' },
    { key: 'brand_approved', label: '品牌已过', value: b.brand_approved ?? 0, color: '#16a34a' },
    { key: 'rejected', label: '已驳回', value: b.rejected ?? 0, color: '#dc2626' },
  ];
});

const pct = (v) => {
  const total = ov.value.content_total || 1;
  return Math.round((v / total) * 100);
};

onMounted(async () => {
  try {
    ov.value = await getOverview();
  } catch (e) {
    message.error(e.message || '加载总览失败');
  }
});
</script>

<style scoped>
.muted {
  color: var(--color-text-secondary);
}

.sub {
  font-size: 12px;
  margin-top: 4px;
}

.status-bars {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 640px;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 16px;
}

.s-label {
  width: 90px;
  font-size: 13px;
}

.s-num {
  width: 40px;
  text-align: right;
  font-weight: 600;
}
</style>
