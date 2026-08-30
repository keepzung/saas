<template>
  <div class="page-wrapper">
    <div v-if="title || $slots.extra" class="page-header">
      <div class="page-header-left">
        <span class="bar"></span>
        <span class="title">{{ title }}</span>
        <span v-if="subtitle" class="subtitle">{{ subtitle }}</span>
      </div>
      <div v-if="$slots.extra" class="page-header-extra">
        <slot name="extra" />
      </div>
    </div>
    <div v-if="$slots.filters" class="filter-zone">
      <slot name="filters" />
    </div>
    <div class="scrollable-content">
      <div class="page-container">
        <slot />
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
});
</script>

<style scoped>
.page-wrapper {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-layout);
  overflow: hidden;
  width: 100%;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--toolbar-height);
  min-height: var(--toolbar-height);
  padding: 0 20px;
  background: var(--color-bg-container);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.page-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.bar {
  width: 4px;
  height: 14px;
  background: var(--color-primary);
  border-radius: 2px;
  flex-shrink: 0;
}

.title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
  white-space: nowrap;
}

.subtitle {
  font-size: 12px;
  color: var(--color-text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.page-header-extra {
  display: flex;
  align-items: center;
  gap: 8px;
}

.filter-zone {
  flex-shrink: 0;
}

.scrollable-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0;
  width: 100%;
  scroll-behavior: smooth;
}

.scrollable-content::-webkit-scrollbar {
  width: 6px;
}

.scrollable-content::-webkit-scrollbar-track {
  background: transparent;
}

.scrollable-content::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.08);
  border-radius: 3px;
}

.page-container {
  gap: 12px;
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: var(--page-content-spacing);
}

.page-container :deep(.ant-card) {
  margin-bottom: 0 !important;
}
</style>
