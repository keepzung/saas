<template>
  <PageWrapper title="AI简报" subtitle="基于运营数据的智能洞察">
    <div class="briefing-list">
      <a-card :bordered="false" class="ai-briefing-card" :body-style="{ padding: '16px 20px' }">
        <div class="briefing-header" @click="collapsed = !collapsed">
          <div class="briefing-title-row">
            <div class="briefing-icon">
              <ThunderboltFilled />
            </div>
            <span class="briefing-title">智能运营简报</span>
            <span class="briefing-date">{{ today }}</span>
            <span class="briefing-badge">AI分析</span>
          </div>
          <span class="collapse-btn">{{ collapsed ? '展开' : '收起' }} {{ collapsed ? '↓' : '↑' }}</span>
        </div>
        <div v-if="!collapsed" class="briefing-body">
          <div v-if="!insights.length" class="insight-empty">暂无分析数据</div>
          <div
            v-for="(item, i) in insights"
            :key="i"
            class="insight-item"
            :class="`insight-${item.level}`"
          >
            <span class="insight-tag" :class="`tag-${item.level}`">{{ item.tag }}</span>
            <span class="insight-text">{{ item.text }}</span>
          </div>
        </div>
      </a-card>
    </div>
  </PageWrapper>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import dayjs from 'dayjs';
import { ThunderboltFilled } from '@ant-design/icons-vue';
import PageWrapper from '../../components/PageWrapper.vue';
import { getKoxRanking } from '../../api/kox';
import { useAuthStore } from '../../stores/auth';

const auth = useAuthStore();
const collapsed = ref(false);
const today = dayjs().format('YYYY-MM-DD');

const summary = ref({});
const regions = ref([]);
const loading = ref(false);

const fmt = (v) => Number(v ?? 0).toLocaleString();

const insights = computed(() => {
  const items = [];
  const s = summary.value;
  if (!s.account_num) return items;

  const silentRegions = regions.value.filter((r) => Number(r.item_cnt ?? 0) === 0);
  if (silentRegions.length) {
    items.push({
      level: 'warning',
      tag: '风险',
      text: `${silentRegions.length} 个大区本期零内容产出（${silentRegions.map((r) => r.name).join('、')}），建议区域负责人跟进激活。`,
    });
  }

  if (regions.value.length) {
    const top = regions.value[0];
    items.push({
      level: 'trend',
      tag: '趋势',
      text: `「${top.name}」领跑本期排行：阅读 ${fmt(top.view_sum)}、互动 ${fmt(top.interaction_sum)}、线索 ${fmt(top.pm_leads)}，为大区第一流量池。`,
    });
    const best = regions.value.reduce((a, b) => (b.growth ?? -999) > (a.growth ?? -999) ? b : a);
    if (best.growth != null && best.growth !== 0) {
      items.push({
        level: best.growth > 0 ? 'efficiency' : 'warning',
        tag: best.growth > 0 ? '效率' : '风险',
        text: `「${best.name}」环比${best.growth > 0 ? '增长' : '下降'} ${Math.abs(best.growth)}%，为${best.growth > 0 ? '增速最快' : '回落最明显'}的大区。`,
      });
    }
  }

  if (Number(s.pm_leads ?? 0) > 0) {
    const perAccount = (Number(s.pm_leads) / Number(s.account_num)).toFixed(1);
    items.push({
      level: 'efficiency',
      tag: '效率',
      text: `人均留资 ${perAccount} 条，私信留资总量 ${fmt(s.pm_leads)} 条；建议对高留资账号的爆款内容做模板化复制。`,
    });
  }

  items.push({
    level: 'info',
    tag: '洞察',
    text: `本期参与账号 ${fmt(s.account_num)} 个，产出内容 ${fmt(s.item_cnt)} 篇，总曝光 ${fmt(s.exposure_sum)}，总互动 ${fmt(s.interaction_sum)}。`,
  });

  return items;
});

async function reload() {
  loading.value = true;
  try {
    const brandId = auth.currentBrandId ?? undefined;
    const res = await getKoxRanking({
      dimension: 'region',
      brandId,
      metric: 'view_sum',
      page_size: 50,
    });
    summary.value = res.summary ?? {};
    regions.value = (res.list ?? []).filter((r) => r.account_num > 0);
  } catch {
    summary.value = {};
  } finally {
    loading.value = false;
  }
}

onMounted(reload);
</script>

<style scoped>
.briefing-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ai-briefing-card {
  background:
    radial-gradient(ellipse 60% 80% at 10% 20%, rgba(208, 226, 255, 0.5) 0%, transparent 70%),
    radial-gradient(ellipse 50% 70% at 90% 80%, rgba(199, 220, 255, 0.3) 0%, transparent 70%),
    #fbfcfe !important;
  border: 1px solid #e8edf5 !important;
  border-radius: 10px !important;
  overflow: hidden;
}

.briefing-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  -webkit-user-select: none;
  user-select: none;
}

.briefing-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.briefing-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: linear-gradient(135deg, #2563eb, #4a90d9);
  border-radius: 6px;
  color: #fff;
  font-size: 16px;
}

.briefing-title {
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
}

.briefing-date {
  font-size: 12px;
  color: #94a3b8;
  margin-left: 4px;
}

.briefing-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(135deg, #2563eb, #4a90d9);
  border-radius: 4px;
  padding: 1px 6px;
  letter-spacing: 0.5px;
  animation: ai-breathe 2.4s ease-in-out infinite;
}

@keyframes ai-breathe {
  0%,
  100% {
    opacity: 1;
    box-shadow: 0 0 rgba(37, 99, 235, 0);
  }
  50% {
    opacity: 0.72;
    box-shadow: 0 0 8px 2px rgba(37, 99, 235, 0.25);
  }
}

.collapse-btn {
  color: #94a3b8;
  font-size: 12px;
  transition: color 0.2s;
}

.collapse-btn:hover {
  color: #2563eb;
}

.briefing-body {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.insight-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 14px;
  color: #334155;
  line-height: 1.6;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.7);
  border-radius: 8px;
  border-left: 3px solid #cbd5e1;
}

.insight-item.insight-warning {
  border-left-color: #f59e0b;
}

.insight-item.insight-critical {
  border-left-color: #ef4444;
  background: rgba(255, 245, 245, 0.7);
}

.insight-item.insight-trend {
  border-left-color: #5087ec;
}

.insight-item.insight-efficiency {
  border-left-color: #36b37e;
}

.insight-item.insight-info {
  border-left-color: #94a3b8;
}

.insight-tag {
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 600;
  padding: 1px 8px;
  border-radius: 4px;
  margin-top: 1px;
}

.tag-warning {
  color: #d97706;
  background: #fef3c7;
}

.tag-critical {
  color: #dc2626;
  background: #fee2e2;
}

.tag-trend {
  color: #2563eb;
  background: #dbeafe;
}

.tag-efficiency {
  color: #059669;
  background: #d1fae5;
}

.tag-info {
  color: #64748b;
  background: #f1f5f9;
}

.insight-text {
  flex: 1;
}

.insight-empty {
  font-size: 14px;
  color: #94a3b8;
  text-align: center;
  padding: 12px;
}
</style>
