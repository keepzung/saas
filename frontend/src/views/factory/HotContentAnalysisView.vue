<template>
  <PageWrapper title="热门内容分析">
    <div class="hc-body">
      <a-empty description="热门内容分析建设规划中">
        <div class="hc-desc">
          将基于 KoxNote 笔记数据提供 爆文榜 / 关键词词云 / 车型分布 / 内容违规检测 能力，
          可先在「内容表现分析」查看笔记数据。
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
.hc-body {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
}

.hc-desc {
  margin: 12px 0 18px;
  color: #94a3b8;
  font-size: 13px;
}
</style>
