<template>
  <PageWrapper title="反馈分析" subtitle="评论互动与留资转化分析">
    <template #extra>
      <a-radio-group v-model:value="days" size="small" @change="regenerate">
        <a-radio-button :value="7">近7天</a-radio-button>
        <a-radio-button :value="30">近30天</a-radio-button>
      </a-radio-group>
    </template>

    <a-card :bordered="false" class="pipeline-card" size="small">
      <div class="pipeline-bar">
        <span class="pipeline-pulse"></span>
        <span class="pipeline-status-text">评论采集正常运行</span>
        <a-popover placement="bottomLeft" trigger="hover">
          <template #content>
            <div class="pipeline-popover">
              <div class="pipeline-popover-item">
                <span class="pipeline-popover-num">1</span>
                <div>
                  <div class="pipeline-popover-label">内容采集</div>
                  <div class="pipeline-popover-desc">定时抓取账号发布的笔记/视频及基础互动数据</div>
                </div>
              </div>
              <div class="pipeline-popover-item">
                <span class="pipeline-popover-num">2</span>
                <div>
                  <div class="pipeline-popover-label">评论抽取</div>
                  <div class="pipeline-popover-desc">按内容维度抽取评论与 @回复，保留作者与时间信息</div>
                </div>
              </div>
              <div class="pipeline-popover-item">
                <span class="pipeline-popover-num">3</span>
                <div>
                  <div class="pipeline-popover-label">语义分类</div>
                  <div class="pipeline-popover-desc">对评论做情感判定与意图分类，标记留资线索</div>
                </div>
              </div>
            </div>
          </template>
          <QuestionCircleOutlined class="pipeline-help" />
        </a-popover>
        <span class="pipeline-sync">最近同步：{{ syncTime }}</span>
      </div>
    </a-card>

    <div class="stat-cards">
      <div v-for="s in statCards" :key="s.label" class="stat-card">
        <div class="stat-card-icon-wrap" :style="{ background: s.bg, color: s.color }">
          <component :is="s.icon" />
        </div>
        <div class="stat-card-info">
          <div class="stat-card-value">{{ s.value }}</div>
          <div class="stat-card-label">{{ s.label }}</div>
        </div>
        <div class="stat-card-bar" :style="{ background: s.color, width: s.bar + '%' }"></div>
      </div>
    </div>

    <div class="charts-row">
      <a-card :bordered="false" size="small" title="情感分布" class="chart-card">
        <div class="sentiment-visual">
          <div class="sentiment-legend">
            <div v-for="s in sentiment" :key="s.name" class="sentiment-row">
              <span class="sentiment-dot" :style="{ background: s.color }"></span>
              <span class="sentiment-name">{{ s.name }}</span>
              <span class="sentiment-count">{{ s.count }}</span>
              <div class="sentiment-bar-track">
                <div class="sentiment-bar-fill" :style="{ background: s.color, width: s.pct + '%' }"></div>
              </div>
              <span class="sentiment-pct">{{ s.pct }}%</span>
            </div>
          </div>
        </div>
      </a-card>
      <a-card :bordered="false" size="small" title="评论分类" class="chart-card">
        <div class="category-list">
          <div v-for="c in categories" :key="c.name" class="cat-item">
            <div class="cat-header">
              <span class="cat-dot" :style="{ background: c.color }"></span>
              <span class="cat-name">{{ c.name }}</span>
              <span class="cat-count">{{ c.count }}</span>
            </div>
            <div class="cat-bar-track">
              <div class="cat-bar-fill" :style="{ background: c.color, width: c.pct + '%' }"></div>
            </div>
          </div>
        </div>
      </a-card>
    </div>

    <a-card :bordered="false" size="small">
      <template #title>
        <div class="card-header">
          <span class="bar"></span>
          <span class="title">评论明细</span>
          <div class="comment-toolbar">
            <span class="comment-count">共 {{ filteredComments.length }} 条</span>
            <a-select
              v-model:value="sentimentFilter"
              size="small"
              style="width: 110px"
              :options="sentimentOptions"
              @change="onFilterChange"
            />
            <a-select
              v-model:value="replyFilter"
              size="small"
              style="width: 110px"
              :options="replyOptions"
              @change="onFilterChange"
            />
          </div>
        </div>
      </template>
      <div class="comment-feed">
        <div
          v-for="c in pagedComments"
          :key="c.id"
          class="comment-card"
        >
          <div class="comment-left-bar" :style="{ background: sentimentColor[c.sentiment] }"></div>
          <div class="comment-main">
            <div class="comment-body">
              <div class="comment-content">{{ c.content }}</div>
              <div class="comment-meta-row">
                <span class="comment-author">{{ c.author }}</span>
                <span class="comment-tag" :style="{ color: c.color, background: c.bg }">{{ c.category }}</span>
                <span v-if="c.isLead" class="comment-tag lead-text">留资线索</span>
                <span v-if="c.replied" class="comment-tag replied-text">已回复</span>
                <span v-else class="comment-tag unreplied-text">待回复</span>
                <span class="comment-time">{{ c.time }}</span>
                <span class="comment-video-source" :title="c.source">来源：{{ c.source }}</span>
              </div>
            </div>
            <div v-if="c.replies?.length" class="kos-reply-zone">
              <div v-for="(r, ri) in c.replies" :key="ri" class="kos-reply-item">
                <span class="kos-reply-author">{{ r.author }}</span>
                <span class="kos-reply-content">{{ r.content }}</span>
                <span class="kos-reply-time">{{ r.time }}</span>
              </div>
            </div>
          </div>
        </div>
        <div v-if="!filteredComments.length" class="empty-feed">暂无符合条件的评论</div>
      </div>
      <div class="table-pagination">
        <a-pagination
          size="small"
          :total="filteredComments.length"
          :page-size="PAGE_SIZE"
          :current="page"
          show-size-changer="false"
          @change="(p) => { page = p; }"
        />
      </div>
    </a-card>
  </PageWrapper>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import dayjs from 'dayjs';
import {
  QuestionCircleOutlined,
  MessageOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  SendOutlined,
  AlertOutlined,
  FrownOutlined,
} from '@ant-design/icons-vue';
import PageWrapper from '../../components/PageWrapper.vue';

const PAGE_SIZE = 12;

const sentimentColor = { 正面: '#36b37e', 中性: '#5087ec', 负面: '#e15759' };

let seed = 20260916;
function rnd() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
function pick(arr) {
  return arr[Math.floor(rnd() * arr.length)];
}

const RAW_COMMENTS = [
  ['多少', '价格咨询'], ['多少？', '价格咨询'], ['什么价', '价格咨询'], ['月供多少呢', '价格咨询'],
  ['想了解价格', '价格咨询'], ['礼貌问价', '价格咨询'], ['价？', '价格咨询'], ['几个', '价格咨询'],
  ['在哪里', '产品咨询'], ['怎么加你', '产品咨询'], ['发你', '产品咨询'], ['发啦', '产品咨询'],
  ['发你[派对R]', '产品咨询'], ['踢你', '产品咨询'], ['我踢你宝', '产品咨询'],
  ['关注🫰辛苦后台踢我 拿mini50台车源表', '价格咨询'], ['敞篷有7⃣️台 价格11-29W', '价格咨询'],
  ['试过觉得动力真不错，跑高速很稳', '正面评价'], ['提车一个月，开着很顺手', '正面评价'],
  ['内饰好看，空间也够用', '正面评价'], ['真实感受：续航比预期好', '正面评价'],
  ['后排坐三个大人不挤，值得买', '正面评价'], ['充电快，通勤无焦虑', '正面评价'],
  ['保值吗？听说优惠幅度大', '负面评价'], ['保养便宜吗，怕后期修车贵', '产品咨询'],
  ['对比过同价位，配置一般', '负面评价'], ['刹车有异响，去店里看了两次', '负面评价'],
  ['优惠比隔壁店少了吧', '价格咨询'], ['配置多但用料一般', '负面评价'],
];
const AUTHORS = ['小卷同学🐨', '栗子🌰', '无人之岛', 'Zzz郑郑', '初十。', '素野君', '梦中情车', '小狗没有翅膀', 'U汇无忧', '徐-', '小红薯684D14F0', '小红薯629E4AAA'];
const SOURCES = ['【荣威D7】试驾报告', '提车作业分享', '【用车体验】一个月真实感受', '周末自驾游vlog', '新车到店实拍', '【购车指南】怎么选配置'];
const REPLIES = ['发你！', '私信已发，注意查收～', '在的，价格私聊', '到店可以试驾，地址发您', '本月有促销活动，详询私信', '感谢关注！'];

const days = ref(30);
const comments = ref([]);
const page = ref(1);
const sentimentFilter = ref('全部');
const replyFilter = ref('全部');
const syncTime = ref(dayjs().format('MM-DD HH:mm'));

const sentimentOptions = [
  { value: '全部', label: '全部情感' },
  { value: '正面', label: '正面' },
  { value: '中性', label: '中性' },
  { value: '负面', label: '负面' },
];
const replyOptions = [
  { value: '全部', label: '全部回复' },
  { value: '已回复', label: '已回复' },
  { value: '待回复', label: '待回复' },
];

function classify(text) {
  if (text.includes('好看') || text.includes('不错') || text.includes('值得') || text.includes('顺手') || text.includes('好评')) return '正面';
  if (text.includes('一般') || text.includes('异响') || text.includes('贵') || text.includes('少')) return '负面';
  return pick(['中性', '中性', '正面']);
}

const CAT_META = {
  价格咨询: { color: '#ea580c', bg: '#fff7ed' },
  产品咨询: { color: '#2563eb', bg: '#eff6ff' },
  正面评价: { color: '#059669', bg: '#ecfdf5' },
  负面评价: { color: '#dc2626', bg: '#fef2f2' },
};

function regenerate() {
  seed = 20260916 + days.value;
  const n = days.value === 7 ? 48 : 96;
  const out = [];
  for (let i = 0; i < n; i++) {
    const [content, category] = pick(RAW_COMMENTS);
    const sentiment = classify(content);
    const replied = rnd() > 0.35;
    const d = dayjs().subtract(Math.floor(rnd() * days.value), 'day').subtract(Math.floor(rnd() * 10), 'hour');
    out.push({
      id: i + 1,
      content,
      category,
      sentiment,
      color: CAT_META[category].color,
      bg: CAT_META[category].bg,
      author: pick(AUTHORS),
      time: d.format('MM-DD HH:mm'),
      source: pick(SOURCES),
      isLead: category === '价格咨询' && rnd() > 0.5,
      replied,
      replies: replied && rnd() > 0.4
        ? [{ author: '门店KOS', content: pick(REPLIES), time: d.add(2, 'hour').format('MM-DD HH:mm') }]
        : [],
    });
  }
  comments.value = out;
  page.value = 1;
}

const statCards = computed(() => {
  const list = comments.value;
  const replied = list.filter((c) => c.replied).length;
  const leads = list.filter((c) => c.isLead).length;
  const negative = list.filter((c) => c.sentiment === '负面').length;
  const mk = (icon, value, label, color, bg, bar) => ({ icon, value, label, color, bg, bar });
  return [
    mk(MessageOutlined, list.length, '评论总数', '#2563eb', '#eff6ff', 100),
    mk(ClockCircleOutlined, list.length - replied, '待回复', '#ea580c', '#fff7ed', ((list.length - replied) / Math.max(list.length, 1)) * 100),
    mk(CheckCircleOutlined, replied, '已回复', '#059669', '#ecfdf5', (replied / Math.max(list.length, 1)) * 100),
    mk(SendOutlined, `${Math.round((replied / Math.max(list.length, 1)) * 100)}%`, '回复率', '#5087ec', '#eef4ff', (replied / Math.max(list.length, 1)) * 100),
    mk(AlertOutlined, leads, '留资线索', '#d97706', '#fffbeb', (leads / Math.max(list.length, 1)) * 100),
    mk(FrownOutlined, negative, '负面评论', '#dc2626', '#fef2f2', (negative / Math.max(list.length, 1)) * 100),
  ];
});

const sentiment = computed(() => {
  const total = Math.max(comments.value.length, 1);
  return ['正面', '中性', '负面'].map((name) => {
    const count = comments.value.filter((c) => c.sentiment === name).length;
    return { name, count, pct: Math.round((count / total) * 100), color: sentimentColor[name] };
  });
});

const categories = computed(() => {
  const total = Math.max(comments.value.length, 1);
  return Object.keys(CAT_META).map((name) => {
    const count = comments.value.filter((c) => c.category === name).length;
    return { name, count, pct: Math.round((count / total) * 100), color: CAT_META[name].color };
  });
});

const filteredComments = computed(() =>
  comments.value.filter((c) => {
    if (sentimentFilter.value !== '全部' && c.sentiment !== sentimentFilter.value) return false;
    if (replyFilter.value === '已回复' && !c.replied) return false;
    if (replyFilter.value === '待回复' && c.replied) return false;
    return true;
  }),
);

const pagedComments = computed(() => {
  const start = (page.value - 1) * PAGE_SIZE;
  return filteredComments.value.slice(start, start + PAGE_SIZE);
});

function onFilterChange() {
  page.value = 1;
}

onMounted(regenerate);
</script>

<style scoped>
.pipeline-card :deep(.ant-card-body) {
  padding: 12px 16px;
}

.pipeline-bar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pipeline-pulse {
  width: 8px;
  height: 8px;
  background: #36b37e;
  border-radius: 50%;
  display: inline-block;
  animation: pulse-glow 1.5s ease-in-out infinite;
}

@keyframes pulse-glow {
  0%,
  100% {
    box-shadow: 0 0 rgba(54, 179, 126, 0.4);
  }
  50% {
    box-shadow: 0 0 0 6px rgba(54, 179, 126, 0);
  }
}

.pipeline-status-text {
  font-size: 13px;
  font-weight: 600;
  color: #36b37e;
  white-space: nowrap;
}

.pipeline-help {
  font-size: 14px;
  color: #94a3b8;
  cursor: pointer;
}

.pipeline-help:hover {
  color: #64748b;
}

.pipeline-sync {
  font-size: 12px;
  color: #94a3b8;
  margin-left: auto;
  white-space: nowrap;
}

.pipeline-popover {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 340px;
}

.pipeline-popover-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.pipeline-popover-num {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #eff6ff;
  color: #2563eb;
  font-size: 11px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-top: 1px;
}

.pipeline-popover-label {
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
}

.pipeline-popover-desc {
  font-size: 12px;
  color: #64748b;
  line-height: 1.5;
  margin-top: 2px;
}

.stat-cards {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 12px;
}

.stat-card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 16px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  position: relative;
  overflow: hidden;
}

.stat-card-icon-wrap {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  flex-shrink: 0;
}

.stat-card-info {
  flex: 1;
  min-width: 0;
}

.stat-card-value {
  font-size: 24px;
  font-weight: 700;
  color: #1e293b;
  line-height: 1.1;
}

.stat-card-label {
  font-size: 12px;
  color: #64748b;
  margin-top: 4px;
}

.stat-card-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 3px;
  opacity: 0.5;
  transition: width 0.6s ease;
}

.charts-row {
  display: flex;
  gap: 12px;
}

.chart-card {
  flex: 1;
  min-width: 0;
}

.sentiment-visual {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 0;
}

.sentiment-legend {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.sentiment-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sentiment-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.sentiment-name {
  font-size: 13px;
  color: #475569;
  width: 28px;
  flex-shrink: 0;
}

.sentiment-count {
  font-size: 14px;
  font-weight: 700;
  color: #1e293b;
  width: 34px;
  text-align: right;
  flex-shrink: 0;
}

.sentiment-bar-track {
  flex: 1;
  min-width: 0;
  height: 8px;
  background: #f1f5f9;
  border-radius: 4px;
  overflow: hidden;
}

.sentiment-bar-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.6s ease;
}

.sentiment-pct {
  font-size: 12px;
  color: #94a3b8;
  width: 34px;
  text-align: right;
  flex-shrink: 0;
}

.category-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cat-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 3px;
}

.cat-dot {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  flex-shrink: 0;
}

.cat-name {
  font-size: 13px;
  font-weight: 600;
  color: #334155;
}

.cat-count {
  font-size: 13px;
  font-weight: 700;
  color: #1e293b;
  margin-left: auto;
}

.cat-bar-track {
  height: 6px;
  background: #f1f5f9;
  border-radius: 3px;
  overflow: hidden;
}

.cat-bar-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.6s ease;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 0;
}

.card-header .bar {
  width: 4px;
  height: 16px;
  background: #2563eb;
  border-radius: 2px;
  margin-right: 8px;
  flex-shrink: 0;
}

.card-header .title {
  font-size: 16px;
  font-weight: 600;
  color: #1e293b;
}

.comment-toolbar {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 12px;
}

.comment-count {
  font-size: 13px;
  color: #94a3b8;
}

.comment-feed {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.comment-card {
  display: flex;
  align-items: stretch;
  background: #fff;
  border: 1px solid #f1f5f9;
  border-radius: 10px;
  overflow: hidden;
  transition:
    border-color 0.2s,
    box-shadow 0.2s;
}

.comment-card:hover {
  border-color: #e2e8f0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.comment-left-bar {
  width: 4px;
  flex-shrink: 0;
}

.comment-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.comment-body {
  padding: 12px 16px;
}

.comment-content {
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
  line-height: 1.6;
  word-break: break-all;
}

.comment-meta-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  flex-wrap: wrap;
}

.comment-author {
  font-size: 12px;
  color: #64748b;
}

.comment-tag {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
}

.lead-text {
  color: #ea580c;
  background: #fff7ed;
}

.replied-text {
  color: #16a34a;
  background: #f0fdf4;
}

.unreplied-text {
  color: #ea580c;
  background: #fff7ed;
}

.comment-time {
  font-size: 11px;
  color: #cbd5e1;
}

.comment-video-source {
  margin-left: auto;
  font-size: 12px;
  color: #94a3b8;
  max-width: 220px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.kos-reply-zone {
  border-top: 1px dashed #e2e8f0;
  margin: 0 16px;
  padding: 10px 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.kos-reply-item {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 6px 10px;
  background: #f0f5ff;
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.5;
}

.kos-reply-author {
  color: #2563eb;
  font-weight: 600;
  white-space: nowrap;
  flex-shrink: 0;
}

.kos-reply-content {
  color: #475569;
  flex: 1;
  min-width: 0;
  word-break: break-all;
}

.kos-reply-time {
  color: #cbd5e1;
  font-size: 11px;
  white-space: nowrap;
  flex-shrink: 0;
}

.empty-feed {
  text-align: center;
  padding: 48px 0;
  color: #94a3b8;
  font-size: 14px;
}

.table-pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

@media (max-width: 1200px) {
  .stat-cards {
    grid-template-columns: repeat(3, 1fr);
  }

  .charts-row {
    flex-direction: column;
  }
}
</style>
