<template>
  <a-layout class="layout">
    <a-layout-sider
      v-model:collapsed="collapsed"
      collapsible
      :trigger="null"
      theme="dark"
      :width="172"
      :collapsed-width="60"
      class="sider"
    >
      <div class="logo" @click="router.push('/welcome')">
        <span class="logo-logo"></span>
        <span v-if="!collapsed">{{ auth.systemName }}</span>
        <span v-else>{{ auth.systemName.slice(0, 2) }}</span>
      </div>
      <a-menu
        v-model:selectedKeys="selectedKeys"
        v-model:openKeys="openKeys"
        theme="dark"
        mode="inline"
        @click="onMenuClick"
      >
        <template v-for="cat in categories" :key="cat.id">
          <a-sub-menu
            v-if="cat.children?.length"
            :key="cat.id"
          >
            <template #title>
              <span>
                <component :is="iconMap[cat.icon] || AppstoreOutlined" />
                <span>{{ cat.name }}</span>
              </span>
            </template>
            <template v-for="group in cat.children" :key="group.id">
              <a-sub-menu v-if="group.children?.length" :key="group.id">
                <template #title>{{ group.name }}</template>
                <a-menu-item
                  v-for="feature in group.children"
                  :key="feature.path"
                >
                  {{ feature.name }}
                </a-menu-item>
              </a-sub-menu>
              <a-menu-item v-else :key="group.id">{{ group.name }}</a-menu-item>
            </template>
          </a-sub-menu>
          <a-menu-item v-else :key="cat.id">{{ cat.name }}</a-menu-item>
        </template>
      </a-menu>
    </a-layout-sider>

    <a-layout>
      <a-layout-header class="header">
        <div class="header-left">
          <menu-unfold-outlined
            v-if="collapsed"
            class="trigger"
            @click="collapsed = false"
          />
          <menu-fold-outlined
            v-else
            class="trigger"
            @click="collapsed = true"
          />
          <a-breadcrumb>
            <a-breadcrumb-item>
              <router-link to="/welcome">{{ auth.systemName }}</router-link>
            </a-breadcrumb-item>
            <a-breadcrumb-item v-for="item in breadcrumbs" :key="item">
              {{ item }}
            </a-breadcrumb-item>
          </a-breadcrumb>
        </div>

        <a-dropdown>
          <div class="user-info">
            <a-avatar style="background-color: #3456e6">
              {{ avatarText }}
            </a-avatar>
            <span class="user-name">{{ auth.user?.nickname || '未登录' }}</span>
            <DownOutlined />
          </div>
          <template #overlay>
            <a-menu @click="onUserMenuClick">
              <a-menu-item key="switch">
                <SwapOutlined />
                切换工作系统
              </a-menu-item>
              <a-menu-item key="logout">
                <LogoutOutlined />
                退出登录
              </a-menu-item>
            </a-menu>
          </template>
        </a-dropdown>
      </a-layout-header>

      <a-layout-content class="content">
        <router-view />
      </a-layout-content>
    </a-layout>

    <a-drawer
      v-model:open="switchOpen"
      class="main-company-drawer"
      placement="right"
      :width="600"
      :closable="false"
      :mask-style="{ background: 'rgba(15,23,42,0.28)' }"
      :body-style="{ padding: '0', overflow: 'hidden' }"
    >
      <div class="drawer-shell">
        <div class="drawer-header">
          <div>
            <div class="drawer-title">切换工作系统</div>
          </div>
          <button class="drawer-close" type="button" @click="switchOpen = false">
            <CloseOutlined />
          </button>
        </div>
        <div class="drawer-body">
          <div class="switch-warning">
            <InfoCircleOutlined />
            <span>确认后会退出当前工作系统，并重新登录至所选系统。</span>
          </div>
          <a-spin v-if="switchLoading" class="drawer-loading" tip="正在加载工作系统..." />
          <div v-else-if="switchCompanies.length" class="company-list">
            <button
              v-for="c in switchCompanies"
              :key="c.main_company_id"
              type="button"
              class="company-card"
              :class="{
                selected: switchSelected === c.main_company_id,
                current: c.main_company_id === auth.currentBrandId,
              }"
              @click="switchSelected = c.main_company_id"
            >
              <span class="main-company-avatar">
                {{ (c.company_name || '工').charAt(0) }}
              </span>
              <span class="main-company-body">
                <span class="main-company-name">{{ c.company_name }}</span>
                <span class="main-company-meta">
                  {{ c.admin_flag_text || (c.admin_flag === 1 ? '管理员' : '用户')
                  }}{{ c.nickname_text ? ` · ${c.nickname_text}` : '' }}
                </span>
              </span>
              <span
                v-if="c.main_company_id === auth.currentBrandId"
                class="current-tag"
              >
                当前
              </span>
              <CheckOutlined
                v-if="switchSelected === c.main_company_id"
                class="main-company-check"
              />
            </button>
          </div>
          <a-empty v-else class="drawer-empty" description="暂无可用工作系统" />
        </div>
        <div class="drawer-footer">
          <a-button @click="switchOpen = false">取消</a-button>
          <a-button
            type="primary"
            :loading="switching"
            :disabled="!switchSelected || switchSelected === auth.currentBrandId"
            @click="doSwitch"
          >
            确认切换
          </a-button>
        </div>
      </div>
    </a-drawer>
  </a-layout>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import {
  ProjectOutlined,
  TeamOutlined,
  AppstoreOutlined,
  CarOutlined,
  GlobalOutlined,
  UserOutlined,
  DownOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SwapOutlined,
  CheckOutlined,
  CloseOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons-vue';
import { useAuthStore } from '../stores/auth';
import { getCompaniesByUserId } from '../api/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const collapsed = ref(false);
const selectedKeys = ref([route.path]);
const openKeys = ref([]);

const iconMap = {
  ProjectOutlined,
  TeamOutlined,
  AppstoreOutlined,
  CarOutlined,
  GlobalOutlined,
  UserOutlined,
};

const BRAND_HIDDEN_MENUS = { 2: ['任务管理'] };

const categories = computed(() => {
  const hidden = BRAND_HIDDEN_MENUS[auth.currentBrandId];
  if (!hidden || hidden.length === 0) return auth.moduleTree;
  return auth.moduleTree
    .map((cat) => ({
      ...cat,
      children: (cat.children ?? []).filter((g) => !hidden.includes(g.name)),
    }))
    .filter((cat) => (cat.children ?? []).length > 0);
});

const avatarText = computed(() => {
  const name = auth.user?.nickname || '?';
  return name.slice(0, 1);
});

const breadcrumbs = computed(() => {
  const crumbs = [];
  for (const cat of auth.moduleTree) {
    for (const group of cat.children ?? []) {
      for (const feature of group.children ?? []) {
        if (feature.path === route.path) {
          crumbs.push(cat.name, group.name, feature.name);
          return crumbs;
        }
      }
    }
  }
  crumbs.push(route.meta?.title ?? '');
  return crumbs;
});

watch(
  () => route.path,
  (path) => {
    selectedKeys.value = [path];
    for (const cat of auth.moduleTree) {
      for (const group of cat.children ?? []) {
        for (const feature of group.children ?? []) {
          if (feature.path === path) {
            openKeys.value = [cat.id, group.id];
          }
        }
      }
    }
  },
  { immediate: true },
);

function onMenuClick({ key }) {
  if (String(key).startsWith('/')) {
    router.push(String(key));
  }
}

function onUserMenuClick({ key }) {
  if (key === 'logout') {
    auth.logout();
    message.success('已退出登录');
    router.push('/login');
  } else if (key === 'switch') {
    openSwitch();
  }
}

const switchOpen = ref(false);
const switchLoading = ref(false);
const switchCompanies = ref([]);
const switchSelected = ref(null);
const switching = ref(false);

async function openSwitch() {
  switchSelected.value = null;
  switchOpen.value = true;
  const userId = auth.user?.user_id || auth.user?.id;
  if (!userId) return;
  switchLoading.value = true;
  try {
    switchCompanies.value = await getCompaniesByUserId(userId);
  } catch (e) {
    console.error('加载工作系统列表失败:', e);
    switchCompanies.value = [];
  } finally {
    switchLoading.value = false;
  }
}

async function doSwitch() {
  const brandId = Number(switchSelected.value);
  if (!brandId || brandId === auth.currentBrandId) return;

  const rememberedUser = localStorage.getItem('remembered_username');
  const rememberedPassword = localStorage.getItem('remembered_password');
  if (!rememberedUser || !rememberedPassword) {
    message.warning('切换工作系统需要重新登录');
    auth.logout();
    router.push('/login');
    return;
  }

  switching.value = true;
  try {
    await auth.login(rememberedUser, rememberedPassword, brandId);
    auth.setCurrentBrand(brandId);
    auth.initialized = false;
    await auth.initWorkspace();
    switchOpen.value = false;
    const target = switchCompanies.value.find(
      (c) => Number(c.main_company_id) === brandId,
    );
    message.success(`已切换至工作系统：${target?.company_name || ''}`);
    router.replace('/welcome');
  } catch (e) {
    message.error(e.message || '切换工作系统失败，请重新登录');
    auth.logout();
    router.push('/login');
  } finally {
    switching.value = false;
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
});
</script>

<style scoped>
.layout {
  height: 100vh;
}

.sider {
  background: var(--sidebar-bg);
}

.sider :deep(.ant-layout-sider-children) {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sider :deep(.ant-menu) {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  border-inline-end: none !important;
}

.sider :deep(.ant-menu::-webkit-scrollbar) {
  width: 4px;
}

.sider :deep(.ant-menu::-webkit-scrollbar-thumb) {
  background: rgba(255, 255, 255, 0.12);
  border-radius: 2px;
}

.logo {
  height: var(--header-height);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 1px;
  white-space: nowrap;
  overflow: hidden;
  cursor: pointer;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.logo-logo {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  background: linear-gradient(135deg, #3456e6, #6683c3);
  margin-right: 8px;
  flex-shrink: 0;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
  padding: 0 20px 0 0;
  height: var(--header-height);
  line-height: var(--header-height);
  border-bottom: 1px solid var(--color-border);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.trigger {
  font-size: 17px;
  padding: 0 14px;
  cursor: pointer;
  transition: color 0.2s;
}

.trigger:hover {
  color: var(--color-primary);
}

.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: var(--radius-control);
  transition: background 0.2s;
}

.user-info:hover {
  background: var(--color-border-secondary);
}

.user-name {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--color-bg-layout);
}

.drawer-shell {
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: #fff;
  background-image: radial-gradient(
    110% 38% at 50% 0%,
    #dbeafe80,
    #eae8fc38 46%,
    #fff0 80%
  );
}

.drawer-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 24px 28px 18px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.72);
}

.drawer-title {
  color: #1e293b;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.3;
}

.drawer-close {
  width: 32px;
  height: 32px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #ffffffb8;
  color: #64748b;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.drawer-close:hover {
  border-color: #cbd5e1;
  background: #fff;
  color: #1e293b;
}

.drawer-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 20px 28px 24px;
}

.switch-warning {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  padding: 12px 14px;
  border: 1px solid rgba(80, 135, 236, 0.22);
  border-radius: 12px;
  background: #eff6ffc2;
  color: #475569;
  font-size: 13px;
  line-height: 1.6;
}

.switch-warning :deep(.anticon) {
  color: #5087ec;
  flex: 0 0 auto;
}

.drawer-loading,
.drawer-empty {
  margin-top: 120px;
}

.company-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.company-card {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 12px;
  padding: 14px;
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 12px;
  background: #ffffffdb;
  box-shadow: 0 3px 10px #00000005;
  cursor: pointer;
  text-align: left;
  transition: all 0.18s;
}

.company-card:hover {
  border-color: #5087ec4d;
  background: #fafcff;
  box-shadow: 0 8px 18px #5087ec12;
}

.company-card.selected {
  border-color: #5087ec;
  background: linear-gradient(180deg, #eff6fffa, #ffffffeb);
}

.main-company-avatar {
  width: 42px;
  height: 42px;
  background: #eaf1ff;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #3b82f6;
  font-size: 18px;
  font-weight: 700;
  flex: 0 0 auto;
}

.main-company-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  line-height: 1.3;
}

.main-company-name {
  overflow: hidden;
  color: #1f2937;
  font-size: 15px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.main-company-meta {
  margin-top: 3px;
  overflow: hidden;
  color: #9ca3af;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.current-tag {
  flex: 0 0 auto;
  padding: 2px 8px;
  border-radius: 999px;
  background: #eef2ff;
  color: #5087ec;
  font-size: 12px;
  font-weight: 600;
}

.main-company-check {
  color: #5087ec;
  font-size: 14px;
  flex: 0 0 auto;
}

.drawer-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 28px;
  border-top: 1px solid rgba(226, 232, 240, 0.86);
  background: #ffffffeb;
}
</style>
