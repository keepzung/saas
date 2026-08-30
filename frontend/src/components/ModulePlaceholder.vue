<template>
  <a-card>
    <template #title>{{ title }}</template>
    <a-empty :description="`「${title}」将在对应阶段实现（阶段${phase}），当前为占位页`" />
  </a-card>
</template>

<script setup>
defineProps({
  title: { type: String, required: true },
  phase: { type: String, default: '2' },
});
</script>
