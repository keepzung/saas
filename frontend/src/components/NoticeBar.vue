<template>
  <div class="notice-bar">
    <InfoCircleOutlined class="notice-icon" />
    <span class="notice-text"><slot /></span>
  </div>
</template>

<script setup>
import { InfoCircleOutlined } from '@ant-design/icons-vue';
</script>

<style scoped>
.notice-bar {
  flex: none;
  background: #e6f7ff;
  padding: 0 24px;
  z-index: 99;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.06);
  display: flex;
  align-items: center;
  height: 36px;
  gap: 8px;
}

.notice-icon {
  color: #436391;
  flex-shrink: 0;
}

.notice-text {
  font-size: 13px;
  color: #436391;
  line-height: 1.5;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
