<template>
  <div class="welcome-layout">
    <div class="welcome-header">
      <div class="header-logo">
        <div class="company-logo">
          <img :src="headerLogo" alt="logo" />
        </div>
        <span class="header-system-name">{{ systemName }}</span>
      </div>
      <div class="header-right">
        <a-button
          v-if="isAdmin"
          size="small"
          class="admin-btn"
          @click="router.push(adminPath)"
        >
          <SettingOutlined />
          系统管理
        </a-button>
        <a-dropdown>
          <div class="user-dropdown">
            <div class="user-avatar-container">
              <UserOutlined class="user-icon" />
            </div>
            <span class="username">{{ auth.user?.nickname || auth.user?.mobile || '用户' }}</span>
            <DownOutlined style="font-size: 10px; margin-left: 4px; color: #94a3b8" />
          </div>
          <template #overlay>
            <a-menu @click="onUserMenuClick">
              <a-menu-item key="logout">
                <LogoutOutlined />
                退出登录
              </a-menu-item>
            </a-menu>
          </template>
        </a-dropdown>
      </div>
    </div>

    <div class="page-content">
      <a-spin :spinning="loading" tip="正在初始化工作区..." style="width: 100%">
        <div v-if="categories.length" class="module-grid">
          <div
            v-for="cat in categories"
            :key="cat.id"
            class="module-card"
            @mouseenter="activeCard = cat.id"
            @mouseleave="activeCard = null"
          >
            <div class="card-cover">
              <div class="cover-inner">
                <img class="cover-image" :src="coverOf(cat)" :alt="cat.name" />
              </div>
            </div>
            <div class="card-info">
              <div class="info-default" :class="{ 'is-hidden': activeCard === cat.id }">
                <div class="card-title-row">
                  <h3 class="card-title">{{ cat.name }}</h3>
                </div>
                <p class="card-desc">{{ descOf(cat) }}</p>
                <div class="card-meta">
                  <span class="meta-count">{{ featureCount(cat) }} 个功能入口</span>
                  <RightOutlined class="meta-arrow" />
                </div>
              </div>
              <div class="info-submenu" :class="{ 'is-visible': activeCard === cat.id }">
                <div class="submenu-scroll">
                  <div
                    v-for="group in cat.children ?? []"
                    :key="group.id"
                    class="submenu-group"
                  >
                    <div class="group-label">{{ group.name }}</div>
                    <div class="group-items">
                      <template v-if="group.children?.length">
                        <a
                          v-for="feature in group.children"
                          :key="feature.id"
                          class="feature-link"
                          @click.prevent="goFeature(feature)"
                        >
                          {{ feature.name }}
                        </a>
                      </template>
                      <a
                        v-else-if="group.path"
                        class="feature-link"
                        @click.prevent="goFeature(group)"
                      >
                        {{ group.name }}
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <a-empty v-else-if="!loading" class="page-empty" description="暂无可用模块" />
      </a-spin>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import {
  SettingOutlined,
  UserOutlined,
  DownOutlined,
  LogoutOutlined,
  RightOutlined,
} from '@ant-design/icons-vue';
import { useAuthStore } from '../stores/auth';
import { brandTheme } from '../config/brands';

const router = useRouter();
const auth = useAuthStore();
const loading = ref(true);
const activeCard = ref(null);

const systemName = computed(() => auth.systemName);
const headerLogo = computed(() =>
  brandTheme(auth.currentBrandId)?.logo || '/images/login/logo.png',
);
const categories = computed(() => auth.moduleTree);
const isAdmin = computed(() => auth.user?.admin_flag === 1);
const adminPath = '/users/manage';

const COVER_BY_ICON = {
  ProjectOutlined: '/images/welcome/project.jpg',
  AppstoreOutlined: '/images/welcome/content.jpg',
  GlobalOutlined: '/images/welcome/insight.jpg',
  CarOutlined: '/images/welcome/drtf.png',
  TeamOutlined: '/images/welcome/bg.jpg',
  UserOutlined: '/images/welcome/bg.jpg',
};

function coverOf(cat) {
  return COVER_BY_ICON[cat.icon] ?? '/images/welcome/bg.jpg';
}

function descOf(cat) {
  const groups = cat.children ?? [];
  if (!groups.length) return '暂无功能分组';
  return `包含 ${groups.map((g) => g.name).slice(0, 3).join(' · ')} 等功能分组`;
}

function featureCount(cat) {
  let n = 0;
  for (const group of cat.children ?? []) {
    n += group.children?.length ?? (group.path ? 1 : 0);
  }
  return n;
}

function goFeature(node) {
  if (node.path) router.push(node.path);
}

function onUserMenuClick({ key }) {
  if (key === 'logout') {
    auth.logout();
    message.success('已退出登录');
    router.push('/login');
  }
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
.welcome-layout {
  height: 100vh;
  min-height: 100vh;
  max-height: 100vh;
  background: #f8fafb;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

.welcome-layout::before {
  content: '';
  position: fixed;
  inset: 0;
  background:
    radial-gradient(ellipse 80% 60% at 10% 20%, rgba(199, 210, 254, 0.4) 0%, transparent 60%),
    radial-gradient(ellipse 60% 50% at 85% 15%, rgba(191, 219, 254, 0.35) 0%, transparent 55%),
    radial-gradient(ellipse 70% 55% at 50% 85%, rgba(221, 214, 254, 0.3) 0%, transparent 55%),
    radial-gradient(ellipse 50% 40% at 80% 70%, rgba(254, 202, 202, 0.15) 0%, transparent 50%),
    radial-gradient(ellipse 45% 35% at 20% 60%, rgba(167, 243, 208, 0.12) 0%, transparent 50%);
  pointer-events: none;
  z-index: 0;
}

.welcome-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  padding: 0 24px;
  height: 54px !important;
  line-height: 54px !important;
  background: #ffffffb8 !important;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid #e2e8f0;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
}

.header-logo {
  display: flex;
  align-items: center;
  margin-right: 24px;
  gap: 12px;
}

.company-logo {
  height: 36px;
  width: auto;
  max-width: 172px;
  border-radius: 6px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.company-logo img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.header-system-name {
  font-size: 15px;
  font-weight: 600;
  color: #1e293b;
  white-space: nowrap;
}

.header-right {
  margin-left: auto;
  display: flex;
  align-items: center;
}

.admin-btn {
  margin-right: 16px;
  border-radius: 6px !important;
  font-weight: 500;
  font-size: 13px;
  background: #fff !important;
  border-color: #cbd5e1 !important;
  color: #475569 !important;
  transition: all 0.2s ease;
}

.admin-btn:hover {
  border-color: #2563eb !important;
  color: #2563eb !important;
  background: #eff6ff !important;
}

.admin-btn :deep(.anticon) {
  margin-right: 4px;
}

.user-dropdown {
  display: flex;
  align-items: center;
  cursor: pointer;
  color: #1e293b;
}

.user-avatar-container {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: linear-gradient(135deg, #2563eb, #60a5fa);
  display: flex;
  align-items: center;
  justify-content: center;
}

.user-icon {
  color: #fff;
  font-size: 14px;
}

.username {
  margin-left: 8px;
  font-size: 13px;
  font-weight: 500;
  color: #374151;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.page-content {
  margin-top: 54px;
  height: calc(100vh - 54px);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding: 24px 48px;
  background: transparent;
  position: relative;
  z-index: 1;
}

.module-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
  width: 100%;
  max-width: 1200px;
  margin: auto;
}

.module-card:only-child {
  grid-column: 1 / -1;
  max-width: 100%;
}

.module-card {
  display: flex;
  align-items: stretch;
  background: #ffffffd1;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.9);
  border-radius: 16px;
  overflow: hidden;
  transition: all 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  cursor: default;
  min-height: 120px;
}

.module-card:hover {
  background: #ffffffeb;
  border-color: #fff;
  box-shadow:
    0 0 0 1px #6366f11f,
    0 0 20px #6366f114,
    0 0 40px #8b5cf60f;
}

.card-cover {
  flex-shrink: 0;
  width: 160px;
  padding: 14px;
  display: flex;
  align-items: stretch;
}

.cover-inner {
  width: 100%;
  aspect-ratio: 3 / 4;
  overflow: hidden;
  -webkit-mask-image: radial-gradient(ellipse 90% 85% at 35% 50%, black 50%, transparent 100%);
  mask-image: radial-gradient(ellipse 90% 85% at 35% 50%, black 50%, transparent 100%);
}

.cover-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.5s ease;
}

.module-card:hover .cover-image {
  transform: scale(1.05);
}

.card-info {
  flex: 1;
  padding: 16px 20px 16px 6px;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
}

.info-default {
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.info-default.is-hidden {
  opacity: 0;
  pointer-events: none;
}

.card-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.card-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: #1e293b;
  letter-spacing: 0.3px;
}

.card-desc {
  margin: 16px 0 0;
  font-size: 15px;
  color: #64748b;
  line-height: 1.6;
  background: rgba(100, 116, 139, 0.03);
  border-radius: 8px;
  padding: 6px 10px;
}

.card-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: auto;
}

.meta-count {
  font-size: 12px;
  color: #94a3b8;
  font-weight: 500;
}

.meta-arrow {
  font-size: 10px;
  color: #cbd5e1;
  transition:
    transform 0.2s ease,
    color 0.2s ease;
}

.module-card:hover .meta-arrow {
  transform: translateX(3px);
  color: #2563eb;
}

.info-submenu {
  opacity: 0;
  transition: opacity 0.3s ease;
  pointer-events: none;
  position: absolute;
  inset: 0;
  padding: 16px 20px 16px 6px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  overflow: hidden;
}

.info-submenu.is-visible {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}

.submenu-scroll {
  max-height: 100%;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #cbd5e1 transparent;
}

.submenu-group {
  margin-bottom: 12px;
}

.submenu-group:last-child {
  margin-bottom: 0;
}

.group-label {
  font-size: 11px;
  font-weight: 600;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  margin-bottom: 6px;
  padding-bottom: 4px;
  border-bottom: 1px solid #e2e8f0;
}

.group-items {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 4px;
}

.feature-link {
  display: inline-flex;
  align-items: center;
  padding: 8px 18px;
  font-size: 14px;
  font-weight: 500;
  color: #334155;
  background: rgba(37, 99, 235, 0.06);
  border: 1px solid rgba(37, 99, 235, 0.1);
  border-radius: 20px;
  cursor: pointer;
  transition: all 0.2s ease;
  text-decoration: none;
  white-space: nowrap;
}

.feature-link:hover {
  color: #2563eb;
  background: rgba(37, 99, 235, 0.12);
  border-color: rgba(37, 99, 235, 0.3);
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(37, 99, 235, 0.1);
}

.page-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 60vh;
  margin: auto;
}
</style>
