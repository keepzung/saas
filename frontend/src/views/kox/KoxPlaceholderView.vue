<template>
  <PageWrapper :title="title" subtitle="功能建设中，敬请期待">
    <a-card :bordered="false">
      <a-empty :description="`${title}模块将于下一版本上线（星火数据采集授权接入后开放）`">
        <template #image>
          <ClockCircleOutlined style="font-size: 48px; color: #94a3b8" />
        </template>
      </a-empty>
    </a-card>
  </PageWrapper>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { ClockCircleOutlined } from '@ant-design/icons-vue';
import PageWrapper from '../../components/PageWrapper.vue';

const route = useRoute();
const title = computed(() => route.meta.title ?? '功能建设中');
</script>
