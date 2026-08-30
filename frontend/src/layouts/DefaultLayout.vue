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
} from '@ant-design/icons-vue';
import { useAuthStore } from '../stores/auth';

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

const categories = computed(() => auth.moduleTree);

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
</style>
