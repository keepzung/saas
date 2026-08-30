<template>
  <div class="filter-topbar">
    <div class="filter-topbar-filters">
      <slot />
    </div>
    <div v-if="$slots.actions" class="filter-topbar-actions">
      <slot name="actions" />
    </div>
  </div>
</template>

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
</style>
