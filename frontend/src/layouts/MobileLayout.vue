<template>
  <div class="m-layout">
    <header class="m-header">
      <div class="m-brand">{{ theme?.short ?? auth.systemName }}</div>
      <div class="m-title">{{ route.meta?.title ?? '' }}</div>
      <a-dropdown>
        <div class="m-user">
          <a-avatar :size="26" style="background-color: #3456e6; font-size: 13px">
            {{ (auth.user?.nickname || '用').slice(0, 1) }}
          </a-avatar>
        </div>
        <template #overlay>
          <a-menu @click="onMenu">
            <a-menu-item key="logout">
              <LogoutOutlined /> 退出登录
            </a-menu-item>
          </a-menu>
        </template>
      </a-dropdown>
    </header>
    <main class="m-main">
      <router-view />
    </main>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import { LogoutOutlined } from '@ant-design/icons-vue';
import { useAuthStore } from '../stores/auth';
import { brandTheme } from '../config/brands';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const theme = computed(() => brandTheme(auth.currentBrandId));

const onMenu = ({ key }) => {
  if (key === 'logout') {
    auth.logout();
    message.success('已退出登录');
    router.push('/m/login');
  }
};
</script>

<style scoped>
.m-layout {
  min-height: 100vh;
  background: #f4f6fa;
  display: flex;
  flex-direction: column;
}

.m-header {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 52px;
  padding: 0 14px;
  background: #fff;
  border-bottom: 1px solid var(--color-border);
}

.m-brand {
  font-weight: 700;
  color: #1e293b;
  max-width: 90px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.m-title {
  flex: 1;
  text-align: center;
  font-weight: 600;
  color: #1e293b;
  font-size: 15px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.m-user {
  cursor: pointer;
  display: flex;
}

.m-main {
  flex: 1;
  padding: 12px;
  max-width: 560px;
  width: 100%;
  margin: 0 auto;
}
</style>
