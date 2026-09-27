<template>
  <PageWrapper title="评论维护">
    <div class="cm-body">
      <a-empty description="评论维护能力规划中">
        <template #image></template>
        <div class="cm-desc">
          将接入来鼓私信评论通道，提供 评论明细 / 情感分布 / 主题分类 / 一键回复 能力。
        </div>
        <a-button type="primary" @click="$router.push('/kox_df/operation-analysis/note-ranking')">
          前往内容表现分析
        </a-button>
      </a-empty>
    </div>
  </PageWrapper>
</template>

<script setup>
import PageWrapper from '../../components/PageWrapper.vue';
</script>

<style scoped>
.cm-body {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
}

.cm-desc {
  margin: 12px 0 18px;
  color: #94a3b8;
  font-size: 13px;
}
</style>
