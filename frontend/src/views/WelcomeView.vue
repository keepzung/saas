<template>
  <div class="welcome-page">
    <div class="welcome-header">
      <div class="brand-logo">{{ systemName.slice(0, 1) }}</div>
      <div>
        <h1>{{ systemName }}</h1>
        <p>{{ companySourceConfig?.system_desc || '智能商业营销系统' }}</p>
      </div>
    </div>

    <a-spin :spinning="loading" tip="正在初始化工作区...">
      <div class="module-grid">
        <div
          v-for="cat in categories"
          :key="cat.id"
          class="module-card"
          @click="goFirstFeature(cat)"
        >
          <div class="module-icon">
            <component :is="iconMap[cat.icon] || AppstoreOutlined" />
          </div>
          <div class="module-name">{{ cat.name }}</div>
          <div class="module-desc">
            {{ firstFeaturePath(cat) || '暂无入口' }}
          </div>
        </div>
      </div>
    </a-spin>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  ProjectOutlined,
  TeamOutlined,
  AppstoreOutlined,
  CarOutlined,
  GlobalOutlined,
  UserOutlined,
} from '@ant-design/icons-vue';
import { useAuthStore } from '../stores/auth';

const router = useRouter();
const auth = useAuthStore();
const loading = ref(true);

const iconMap = {
  ProjectOutlined,
  TeamOutlined,
  AppstoreOutlined,
  CarOutlined,
  GlobalOutlined,
  UserOutlined,
};

const systemName = computed(() => auth.systemName);
const companySourceConfig = computed(() => auth.companySourceConfig);
const categories = computed(() => auth.moduleTree);

function firstFeaturePath(cat) {
  for (const group of cat.children ?? []) {
    for (const feature of group.children ?? []) {
      if (feature.path) return feature.path;
    }
  }
  return '';
}

function goFirstFeature(cat) {
  const path = firstFeaturePath(cat);
  if (path) router.push(path);
}

onMounted(async () => {
  if (!auth.initialized) {
    try {
      await auth.initWorkspace();
    } catch {
      /* 错误由拦截器处理 */
    }
  }
  loading.value = false;
});
</script>

<style scoped>
.welcome-page {
  min-height: 100vh;
  background: linear-gradient(135deg, #f8fafc 0%, #e4ebf7 100%);
  padding: 48px;
}

.welcome-header {
  display: flex;
  align-items: center;
  gap: 20px;
  max-width: 1080px;
  margin: 0 auto 40px;
}

.brand-logo {
  width: 72px;
  height: 72px;
  border-radius: 16px;
  background: linear-gradient(135deg, #3456e6 0%, #2c47c2 100%);
  color: #fff;
  font-size: 34px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(52, 86, 230, 0.3);
}

.welcome-header h1 {
  margin: 0 0 6px;
  font-size: 26px;
  color: var(--color-text);
}

.welcome-header p {
  margin: 0;
  color: var(--color-text-secondary);
}

.module-grid {
  max-width: 1080px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 20px;
}

.module-card {
  background: var(--color-bg-container);
  border-radius: 16px;
  padding: 26px 22px;
  cursor: pointer;
  transition:
    box-shadow 0.25s,
    transform 0.25s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  border: 1px solid var(--color-border-secondary);
}

.module-card:hover {
  box-shadow: 0 6px 20px rgba(52, 86, 230, 0.18);
  transform: translateY(-3px);
}

.module-icon {
  font-size: 30px;
  color: #3456e6;
  margin-bottom: 14px;
}

.module-name {
  font-size: 17px;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 6px;
}

.module-desc {
  font-size: 12px;
  color: var(--color-text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
