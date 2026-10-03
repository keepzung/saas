<template>
  <div class="mt-wrap">
    <div class="mt-tabs">
      <button :class="{ active: tab === 'task' }" @click="tab = 'task'">发布任务</button>
      <button :class="{ active: tab === 'pkg' }" @click="switchPkg">
        内容包领用<span v-if="pkgBadge" class="pkg-badge">{{ pkgBadge }}</span>
      </button>
    </div>

    <!-- 发布任务 -->
    <div v-if="tab === 'task'" class="mt-list">
      <div v-for="t in list" :key="t.id" class="task-card" @click="goCreate(t)">
        <div class="tc-head">
          <span class="tc-name">{{ t.name }}</span>
          <span class="tc-status" :class="t.effective_status">{{ statusLabel(t.effective_status) }}</span>
        </div>
        <div class="tc-row"><span>任务平台</span>{{ platformLabel(t.platform) }}</div>
        <div class="tc-row"><span>参与团队</span>{{ t.scope_type === 'regions' ? (t.regions ?? []).join('、') : '全部大区' }}</div>
        <div class="tc-row"><span>任务时间</span>{{ fmt(t.start_time) }} 至 {{ fmt(t.end_time) }}</div>
        <div v-if="t.reward" class="tc-row reward"><span>奖励</span>{{ t.reward }}</div>
        <div v-if="t.instructions" class="tc-desc">{{ t.instructions }}</div>
        <div class="tc-progress">
          <div class="prog"><div class="prog-in" :style="{ width: `${t.completion_rate}%` }" /></div>
          <div class="prog-sub">已完成 {{ t.completion_rate }}% · {{ t.account_finished }}/{{ t.account_total }} 人有产出</div>
        </div>
        <a-button type="primary" block size="small" @click.stop="goCreate(t)">领取任务，去创作</a-button>
      </div>
      <a-spin v-if="loading" style="display: block; margin: 60px auto" />
      <a-empty v-if="!list.length && !loading" description="暂无可领取的任务" style="margin-top: 80px" />
      <p class="tip">完成度口径：任务周期内账号在小红书发布的笔记数（每日自动统计）</p>
    </div>

    <!-- 内容包领用 -->
    <div v-else class="mt-list">
      <!-- 分发给我的 -->
      <div v-if="dispatched.length" class="sec-label">分发给我们的内容</div>
      <div v-for="d in dispatched" :key="`d${d.id}`" class="pkg-item">
        <img :src="d.img_list?.[0] ?? d.cover_url" class="pi-cover" @error="$event.target.style.visibility = 'hidden'" />
        <div class="pi-body">
          <div class="pi-title">{{ d.title }}</div>
          <div class="pi-sub">{{ d.package_name }} · 指派内容</div>
        </div>
        <a-button type="primary" size="small" @click="claimDispatched(d)">领用去发布</a-button>
      </div>

      <div class="sec-label">可领用内容包</div>
      <div v-for="p in packages" :key="p.id" class="pkg-card">
        <div class="pkc-head">
          <span class="pkc-name">{{ p.name }}</span>
          <span class="pkc-count">可领 {{ p.claimable }} 篇</span>
        </div>
        <div v-if="p.description" class="pkc-desc">{{ p.description }}</div>
        <a-button
          type="primary"
          block
          size="small"
          :disabled="p.claim_once && p.my_claimed > 0"
          @click="claim(p)"
        >
          {{ p.claim_once && p.my_claimed > 0 ? '已领用' : '领取一条内容' }}
        </a-button>
      </div>
      <a-spin v-if="pkgLoading" style="display: block; margin: 60px auto" />
      <a-empty v-if="!pkgLoading && !packages.length && !dispatched.length" description="暂无可领用内容" style="margin-top: 60px" />

      <template v-if="claims.length">
        <div class="sec-label" style="margin-top: 18px">我的领用</div>
        <div v-for="c in claims" :key="`c${c.claim_id}`" class="pkg-item">
          <img :src="c.img_list?.[0] ?? c.cover_url" class="pi-cover" @error="$event.target.style.visibility = 'hidden'" />
          <div class="pi-body">
            <div class="pi-title">{{ c.title }}</div>
            <div class="pi-sub">{{ c.package_name }} · {{ c.status === 1 ? '已发布' : '未发布' }}</div>
          </div>
          <a-button size="small" @click="goRelay(c)">{{ c.status === 1 ? '再看' : '去创作' }}</a-button>
        </div>
      </template>
      <p class="tip">领用后内容进入创作向导，可改写后发布小红书</p>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import { useAuthStore } from '../../stores/auth';
import {
  getContentTasks,
  getMobilePackages,
  claimMobilePackage,
  getMobileClaims,
} from '../../api/contentpro';

const router = useRouter();
const auth = useAuthStore();
const brandId = computed(() => auth.currentBrandId ?? 1);

const tab = ref('task');
const list = ref([]);
const loading = ref(false);

const packages = ref([]);
const dispatched = ref([]);
const claims = ref([]);
const pkgLoading = ref(false);

const pkgBadge = computed(() => dispatched.value.length || 0);

const statusLabel = (s) => ({ active: '进行中', expired: '已截止', voided: '已作废' }[s] ?? s);
const platformLabel = (p) => ({ xhs: '小红书', douyin: '抖音' }[p] ?? p);
const fmt = (s) => (s ? new Date(s).toLocaleDateString('zh-CN').replaceAll('/', '-') : '-');

const goCreate = (t) => {
  if (t.effective_status !== 'active') return;
  router.push({ path: '/m/aigc/create', query: { taskId: t.id } });
};

const goRelay = (item) => {
  router.push({ path: '/m/aigc/create', query: { historyId: item.id } });
};

const loadPkg = async () => {
  pkgLoading.value = true;
  try {
    const [pkgs, mine] = await Promise.all([
      getMobilePackages({ brandId: brandId.value }),
      getMobileClaims({ brandId: brandId.value }),
    ]);
    packages.value = pkgs?.list ?? [];
    dispatched.value = mine?.dispatched ?? [];
    claims.value = mine?.claims ?? [];
  } finally {
    pkgLoading.value = false;
  }
};

const switchPkg = () => {
  tab.value = 'pkg';
  if (!packages.value && !pkgLoading.value) loadPkg();
};

const claim = async (p) => {
  try {
    const res = await claimMobilePackage({ packageId: p.id, source: 'h5' }, { brandId: brandId.value });
    message.success('领取成功，去创作吧');
    if (res?.history_id) goRelay({ id: res.history_id });
    else loadPkg();
  } catch (e) {
    message.error(e?.response?.data?.msg ?? '领取失败');
  }
};

const claimDispatched = async (d) => {
  try {
    await claimMobilePackage({ packageId: d.package_id, source: 'dispatch' }, { brandId: brandId.value });
    message.success('领取成功，去创作吧');
    goRelay(d);
  } catch (e) {
    message.error(e?.response?.data?.msg ?? '领取失败');
  }
};

onMounted(async () => {
  loading.value = true;
  try {
    const res = await getContentTasks({ brandId: brandId.value, page: 1, page_size: 20 });
    list.value = (res?.list ?? []).filter((x) => x.effective_status === 'active');
  } finally {
    loading.value = false;
  }
  loadPkg();
});
</script>

<style scoped>
.mt-wrap {
  display: flex;
  flex-direction: column;
}

.mt-tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 12px;
  background: #fff;
  border-radius: 10px;
  padding: 4px;
}

.mt-tabs button {
  flex: 1;
  border: none;
  background: transparent;
  padding: 8px 0;
  font-size: 13px;
  color: #64748b;
  border-radius: 8px;
  cursor: pointer;
}

.mt-tabs button.active {
  background: #eef4ff;
  color: #3456e6;
  font-weight: 600;
}

.pkg-badge {
  display: inline-block;
  min-width: 16px;
  height: 16px;
  line-height: 16px;
  border-radius: 8px;
  background: #dc2626;
  color: #fff;
  font-size: 10px;
  padding: 0 4px;
  margin-left: 4px;
  vertical-align: 1px;
}

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

.tc-row.reward {
  color: #b45309;
}

.tc-desc {
  margin-top: 5px;
  color: #64748b;
  font-size: 12px;
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
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

.sec-label {
  font-size: 13px;
  font-weight: 700;
  color: #475569;
  margin: 4px 0 8px;
}

.pkg-card {
  background: #fff;
  border-radius: 14px;
  padding: 14px;
  margin-bottom: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.pkc-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.pkc-name {
  font-weight: 700;
  color: #1e293b;
  font-size: 14px;
}

.pkc-count {
  font-size: 12px;
  color: #16a34a;
  font-weight: 600;
}

.pkc-desc {
  font-size: 12px;
  color: #94a3b8;
  margin-bottom: 10px;
}

.pkg-item {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #fff;
  border-radius: 14px;
  padding: 10px 12px;
  margin-bottom: 10px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.pi-cover {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  object-fit: cover;
  background: #f1f5f9;
  flex-shrink: 0;
}

.pi-body {
  flex: 1;
  min-width: 0;
}

.pi-title {
  font-size: 13px;
  color: #1e293b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pi-sub {
  font-size: 11.5px;
  color: #94a3b8;
  margin-top: 2px;
}

.tip {
  margin-top: 16px;
  text-align: center;
  color: #cbd5e1;
  font-size: 11px;
}
</style>
