<template>
  <div class="filter-topbar" :class="{ 'is-mobile': isMobile, 'is-expanded': isMobile && expanded }">
    <!-- 桌面：横向筛选条 + 右侧操作区 -->
    <template v-if="!isMobile">
      <div class="filter-topbar-filters">
        <slot />
      </div>
      <div v-if="$slots.actions" class="filter-topbar-actions">
        <slot name="actions" />
      </div>
    </template>

    <!-- 手机：筛选开关条 + 可展开面板 -->
    <template v-else>
      <div class="filter-topbar-mobile-bar">
        <button
          class="filter-toggle"
          :class="{ active: expanded }"
          type="button"
          @click="expanded = !expanded"
        >
          <FilterOutlined />
          <span>筛选</span>
          <UpOutlined v-if="expanded" class="toggle-arrow" />
          <DownOutlined v-else class="toggle-arrow" />
        </button>
        <div v-if="$slots.actions" class="filter-topbar-actions">
          <slot name="actions" />
        </div>
      </div>
      <div v-if="expanded" class="filter-topbar-mobile-panel">
        <slot />
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { DownOutlined, FilterOutlined, UpOutlined } from '@ant-design/icons-vue';
import { useBreakpoint } from '../composables/useBreakpoint';

const { isMobile } = useBreakpoint();
const expanded = ref(false);
</script>

<style scoped>
.filter-topbar {
  display: flex;
  height: var(--toolbar-height);
  min-height: var(--toolbar-height);
  align-items: stretch;
  overflow: hidden;
  background: var(--color-bg-container);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.filter-topbar-filters {
  display: flex;
  flex: 1;
  min-width: 0;
  align-items: center;
  padding: 0 20px;
  overflow-x: auto;
  overflow-y: hidden;
  gap: 8px;
  scrollbar-width: thin;
}

.filter-topbar-filters::-webkit-scrollbar {
  height: 4px;
}

.filter-topbar-filters::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.08);
  border-radius: 2px;
}

.filter-topbar-filters :deep(.ant-select),
.filter-topbar-filters :deep(.ant-input),
.filter-topbar-filters :deep(.ant-input-search),
.filter-topbar-filters :deep(.ant-picker) {
  flex-shrink: 0;
}

.filter-topbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 20px;
  border-left: 1px solid var(--color-border-secondary);
  flex-shrink: 0;
}

/* ==================== 手机形态 ==================== */

.filter-topbar.is-mobile {
  height: auto;
  min-height: 48px;
  overflow: visible;
  flex-direction: column;
  align-items: stretch;
}

.filter-topbar-mobile-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  height: 48px;
  min-height: 48px;
  padding: 0 12px;
}

.filter-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  background: #fff;
  color: var(--color-text-secondary);
  font-size: 13px;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.2s;
}

.filter-toggle.active {
  color: var(--color-primary);
  border-color: var(--color-primary);
  background: var(--color-primary-muted);
}

.toggle-arrow {
  font-size: 10px;
}

.is-mobile .filter-topbar-actions {
  padding: 0;
  border-left: none;
  overflow-x: auto;
  justify-content: flex-end;
  scrollbar-width: none;
}

.is-mobile .filter-topbar-actions::-webkit-scrollbar {
  display: none;
}

.filter-topbar-mobile-panel {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--color-border-secondary);
}

.filter-topbar-mobile-panel :deep(.ant-select),
.filter-topbar-mobile-panel :deep(.ant-input),
.filter-topbar-mobile-panel :deep(.ant-input-search),
.filter-topbar-mobile-panel :deep(.ant-picker),
.filter-topbar-mobile-panel :deep(.ant-input-number) {
  flex: 1 1 calc(50% - 4px);
  min-width: 0;
  max-width: 100%;
}

.filter-topbar-mobile-panel :deep(.ant-btn),
.filter-topbar-mobile-panel :deep(.ant-radio-group) {
  flex: 0 0 auto;
  max-width: 100%;
}
</style>
