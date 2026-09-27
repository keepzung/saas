<template>
  <div class="side-nav">
    <div class="logo" @click="$emit('logo-click')">
      <span v-if="theme?.logo && !collapsed" class="logo-brand-chip">
        <img class="logo-brand-img" :src="theme.logo" :alt="theme.short" />
      </span>
      <template v-else>
        <span class="logo-logo"></span>
        <span v-if="!collapsed">{{ systemName }}</span>
        <span v-else>{{ systemName.slice(0, 2) }}</span>
      </template>
    </div>
    <a-menu
      v-model:selectedKeys="selectedKeys"
      v-model:openKeys="openKeys"
      theme="dark"
      mode="inline"
      @click="onMenuClick"
    >
      <template v-for="cat in categories" :key="cat.id">
        <a-sub-menu v-if="cat.children?.length" :key="cat.id">
          <template #title>
            <span>
              <component :is="iconMap[cat.icon] || AppstoreOutlined" />
              <span>{{ cat.name }}</span>
            </span>
          </template>
          <template v-for="group in cat.children" :key="group.id">
            <a-sub-menu v-if="group.children?.length" :key="group.id">
              <template #title>{{ group.name }}</template>
              <a-menu-item v-for="feature in group.children" :key="feature.path">
                {{ feature.name }}
              </a-menu-item>
            </a-sub-menu>
            <a-menu-item v-else :key="group.id">{{ group.name }}</a-menu-item>
          </template>
        </a-sub-menu>
        <a-menu-item v-else :key="cat.id">{{ cat.name }}</a-menu-item>
      </template>
    </a-menu>
  </div>
</template>

<script setup>
import {
  ProjectOutlined,
  TeamOutlined,
  AppstoreOutlined,
  CarOutlined,
  GlobalOutlined,
  UserOutlined,
  MessageOutlined,
} from '@ant-design/icons-vue';

const selectedKeys = defineModel('selectedKeys', { type: Array, default: () => [] });
const openKeys = defineModel('openKeys', { type: Array, default: () => [] });

defineProps({
  collapsed: { type: Boolean, default: false },
  categories: { type: Array, default: () => [] },
  theme: { type: Object, default: null },
  systemName: { type: String, default: '' },
});

const emit = defineEmits(['menu-click', 'logo-click']);

const iconMap = {
  ProjectOutlined,
  TeamOutlined,
  AppstoreOutlined,
  CarOutlined,
  GlobalOutlined,
  UserOutlined,
  MessageOutlined,
};

function onMenuClick(info) {
  emit('menu-click', info);
}
</script>

<style scoped>
.side-nav {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--sidebar-bg);
  position: relative;
}

.side-nav :deep(.ant-menu) {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  border-inline-end: none !important;
}

.side-nav :deep(.ant-menu::-webkit-scrollbar) {
  width: 4px;
}

.side-nav :deep(.ant-menu::-webkit-scrollbar-thumb) {
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

.logo-brand-chip {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  border-radius: 6px;
  padding: 3px 8px;
  max-width: 152px;
  flex-shrink: 0;
}

.logo-brand-img {
  height: 24px;
  width: auto;
  max-width: 136px;
  object-fit: contain;
  display: block;
}
</style>
