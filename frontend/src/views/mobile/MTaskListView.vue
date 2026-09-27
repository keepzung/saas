<template>
  <div class="mt-list">
    <div v-for="t in list" :key="t.id" class="task-card" @click="goCreate(t)">
      <div class="tc-head">
        <span class="tc-name">{{ t.name }}</span>
        <span class="tc-status" :class="t.effective_status">{{ statusLabel(t.effective_status) }}</span>
      </div>
      <div class="tc-row"><span>任务平台</span>{{ platformLabel(t.platform) }}</div>
      <div class="tc-row"><span>参与团队</span>{{ t.scope_type === 'regions' ? (t.regions ?? []).join('、') : '全部大区' }}</div>
      <div class="tc-row"><span>任务时间</span>{{ fmt(t.start_time) }} 至 {{ fmt(t.end_time) }}</div>
      <div class="tc-progress">
        <div class="prog"><div class="prog-in" :style="{ width: `${t.completion_rate}%` }" /></div>
        <div class="prog-sub">已完成 {{ t.completion_rate }}% · {{ t.account_finished }}/{{ t.account_total }} 人有产出</div>
      </div>
      <a-button type="primary" block size="small" @click.stop="goCreate(t)">领取任务，去创作</a-button>
    </div>
    <a-empty v-if="!list.length && !loading" description="暂无可领取的任务" style="margin-top: 80px" />
    <p class="tip">完成度口径：任务周期内账号在小红书发布的笔记数（每日自动统计）</p>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth';
import { getContentTasks } from '../../api/contentpro';

const router = useRouter();
const auth = useAuthStore();
const brandId = computed(() => auth.currentBrandId ?? 1);

const list = ref([]);
const loading = ref(false);

const statusLabel = (s) => ({ active: '进行中', expired: '已截止', voided: '已作废' }[s] ?? s);
const platformLabel = (p) => ({ xhs: '小红书', douyin: '抖音' }[p] ?? p);
const fmt = (s) => (s ? new Date(s).toLocaleDateString('zh-CN').replaceAll('/', '-') : '-');

const goCreate = (t) => {
  if (t.effective_status !== 'active') return;
  router.push({ path: '/m/aigc/create', query: { taskId: t.id } });
};

onMounted(async () => {
  loading.value = true;
  try {
    const res = await getContentTasks({ brandId: brandId.value, page: 1, page_size: 20 });
    list.value = (res?.list ?? []).filter((x) => x.effective_status === 'active');
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.task-card {
  background: #fff;
  border-radius: 14px;
  padding: 14px;
  margin-bottom: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.tc-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.tc-name {
  font-weight: 700;
  color: #1e293b;
}

.tc-status.active {
  color: #16a34a;
  font-size: 12px;
}

.tc-status.expired,
.tc-status.voided {
  color: #d97706;
  font-size: 12px;
}

.tc-row {
  color: #475569;
  font-size: 12.5px;
  padding: 2px 0;
}

.tc-row span {
  color: #94a3b8;
  margin-right: 8px;
}

.tc-progress {
  margin: 10px 0 12px;
}

.prog {
  height: 7px;
  border-radius: 4px;
  background: #e2e8f0;
  overflow: hidden;
}

.prog-in {
  height: 100%;
  background: linear-gradient(90deg, #16a34a, #4ade80);
}

.prog-sub {
  margin-top: 4px;
  color: #94a3b8;
  font-size: 11.5px;
}

.tip {
  margin-top: 16px;
  text-align: center;
  color: #cbd5e1;
  font-size: 11px;
}
</style>
