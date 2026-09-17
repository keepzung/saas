<template>
  <PageWrapper title="笔记排行" subtitle="笔记内容表现排行与关键词洞察">
    <template #filters>
      <FilterTopbar>
        <a-select
          v-model:value="typeFilter"
          size="small"
          style="width: 120px"
          :options="typeOptions"
          @change="onFilterChange"
        />
        <a-select
          v-model:value="modelFilter"
          size="small"
          style="width: 130px"
          :options="modelOptions"
          @change="onFilterChange"
        />
        <a-radio-group v-model:value="days" size="small" @change="regenerate">
          <a-radio-button :value="7">近7天</a-radio-button>
          <a-radio-button :value="30">近30天</a-radio-button>
        </a-radio-group>
        <a-input-search
          v-model:value="keyword"
          size="small"
          style="width: 180px"
          placeholder="输入关键字"
          allow-clear
          @search="onFilterChange"
        />
        <a-input-search
          v-model:value="authorKw"
          size="small"
          style="width: 160px"
          placeholder="输入作者昵称"
          allow-clear
          @search="onFilterChange"
        />
      </FilterTopbar>
    </template>

    <NoticeBar>该页面为功能示意，不代表企业真实数据，所有数据的计算逻辑均会按照项目实际需求调整</NoticeBar>

    <div class="overview-blocks">
      <div v-for="b in blocks" :key="b.label" class="block-card">
        <div class="block-content">
          <div class="block-value">{{ b.value }}</div>
          <div class="block-label">{{ b.label }}</div>
        </div>
      </div>
    </div>

    <div class="note-analysis-row">
      <a-card :bordered="false" size="small" title="内容类型效率对比分析" class="note-analysis-card-left">
        <div ref="typeEffEl" class="type-efficiency-chart" />
      </a-card>
      <a-card :bordered="false" size="small" title="内容关键词词云" class="note-analysis-card-right">
        <div class="word-cloud-chart">
          <span
            v-for="w in wordCloud"
            :key="w.text"
            class="cloud-word"
            :style="{
              fontSize: w.size + 'px',
              color: w.color,
            }"
          >
            {{ w.text }}
          </span>
        </div>
      </a-card>
    </div>

    <a-card :bordered="false" size="small" title="提及车型分布">
      <div ref="modelPieEl" class="mention-model-chart" />
    </a-card>

    <a-card :bordered="false" size="small">
      <template #title>
        <div class="summary-row">
          <div class="left">
            <span class="bar"></span>
            <span class="list-title">内容列表</span>
            <span class="muted mini">共 {{ filtered.length }} 条</span>
          </div>
          <div class="right">
            <a-button size="small" :loading="exporting" @click="exportCsv">导出明细数据</a-button>
          </div>
        </div>
      </template>
      <a-table
        :columns="columns"
        :data-source="paged"
        :loading="loading"
        :pagination="{
          total: filtered.length,
          current: page,
          pageSize: PAGE_SIZE,
          showSizeChanger: false,
          size: 'small',
        }"
        row-key="id"
        @change="(pag) => { page = pag.current; }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'title'">
            <div class="note-title-cell">
              <img class="note-cover-img" :src="record.cover" alt="" />
              <div class="note-title-text">
                <a class="title-link" @click="showDetail(record)">{{ record.title }}</a>
                <div class="muted mini">{{ record.publishTime }}</div>
              </div>
            </div>
          </template>
          <template v-else-if="column.key === 'tags'">
            <a-tag class="mini">{{ record.type }}</a-tag>
            <a-tag class="mini" color="blue">{{ record.model }}</a-tag>
            <a-tag class="mini" :color="record.accountType === 'KOS' ? 'green' : 'purple'">
              {{ record.accountType }}
            </a-tag>
          </template>
        </template>
      </a-table>
    </a-card>

    <a-card :bordered="false" size="small">
      <template #title>
        <div class="summary-row">
          <div class="left">
            <span class="bar" style="background: #e15759"></span>
            <span class="list-title">内容违规检测</span>
          </div>
        </div>
      </template>
      <div class="violation-keyword-section">
        <div class="violation-scope-row">
          <span class="violation-keyword-label">违规关键词：</span>
          <a-input
            v-model:value="violationKw"
            size="small"
            style="width: 420px"
            placeholder="输入违规关键词，多个关键词用 / 分隔，如：虚假宣传/夸大功效/最低价"
          />
          <span style="color: #475569; font-size: 13px">检测范围：</span>
          <a-checkbox v-model:checked="scopeTitle">笔记标题</a-checkbox>
          <a-checkbox v-model:checked="scopeBody">笔记正文</a-checkbox>
          <a-tooltip title="口播文案分析，依赖对内容进行深度采集">
            <a-checkbox :checked="false" disabled>口播文案</a-checkbox>
          </a-tooltip>
          <a-button type="primary" size="small" :loading="detecting" style="margin-left: 12px" @click="detect">
            开始检测
          </a-button>
        </div>
      </div>

      <template v-if="detected">
        <div class="violation-summary">
          <div class="violation-stat-card">
            <div class="violation-stat-value">{{ detection.total }}</div>
            <div class="violation-stat-label">检测内容总数</div>
          </div>
          <div class="violation-stat-card">
            <div class="violation-stat-value" style="color: #e15759">{{ detection.bad }}</div>
            <div class="violation-stat-label">违规内容数</div>
          </div>
          <div class="violation-stat-card">
            <div class="violation-stat-value" style="color: #d97706">{{ detection.rate }}%</div>
            <div class="violation-stat-label">违规率</div>
          </div>
          <div class="violation-stat-card">
            <div class="violation-stat-value" style="color: #36b37e">{{ detection.good }}</div>
            <div class="violation-stat-label">合规内容数</div>
          </div>
        </div>

        <div class="violation-sub-title">
          违规内容明细
          <span class="violation-sub-count">共 {{ detection.rows.length }} 条</span>
        </div>
        <a-table
          v-if="detection.rows.length"
          :columns="violationColumns"
          :data-source="detection.rows"
          :pagination="{ pageSize: 5, size: 'small', showSizeChanger: false }"
          row-key="id"
          size="small"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'keywords'">
              <span v-for="k in record.keywords" :key="k" class="violation-tag">{{ k }}</span>
            </template>
          </template>
        </a-table>
        <a-empty v-else description="未发现违规内容" :image-style="{ height: '48px' }" style="padding: 24px 0" />
      </template>
      <a-alert
        v-else-if="detectError"
        type="warning"
        :message="detectError"
        show-icon
        style="margin-top: 8px"
      />
    </a-card>

    <a-modal
      v-model:open="detailOpen"
      :title="detail?.title || '内容详情'"
      :footer="null"
      width="640px"
    >
      <div v-if="detail" class="detail-body">
        <img class="detail-cover" :src="detail.cover" alt="" />
        <p class="detail-text">{{ detail.body }}</p>
        <div class="detail-meta muted mini">
          {{ detail.author }} · {{ detail.publishTime }} · 点赞 {{ detail.digg }} · 评论 {{ detail.comment }} ·
          收藏 {{ detail.collect }} · 分享 {{ detail.share }}
        </div>
      </div>
    </a-modal>
  </PageWrapper>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { message } from 'ant-design-vue';
import dayjs from 'dayjs';
import * as echarts from 'echarts';
import PageWrapper from '../../components/PageWrapper.vue';
import FilterTopbar from '../../components/FilterTopbar.vue';
import NoticeBar from '../../components/NoticeBar.vue';
import { getKoxAccounts } from '../../api/kox';
import { useAuthStore } from '../../stores/auth';

const auth = useAuthStore();
const PAGE_SIZE = 10;

const TYPES = ['车型评测', '智能科技', '用车体验', '购车指南', '维保知识', '对比测评', '场景宣传', '用车避坑', '品牌对比', '新能源知识'];
const MODELS = ['D7', 'RX5', 'iMAX8', 'Ei5', 'RX9'];
const SELLING = ['划算', '好开', '黑科技', '能跑多远', '安全', '颜值', '空间够用', '省油', '充电快', '坐着舒服', '好操控', '内饰好看', '动力强', '配置多'];
const SCENES = ['上下班', '接送孩子', '周末出游', '长途旅行', '买菜代步', '回老家', '自驾游', '露营装备'];
const CONCERNS = ['牌子', '保值', '修车', '保养便宜'];
const CONTENT_KW = ['试过', '买车', '推荐', '值得买', '避坑', '优缺点', '对比', '测评', '真实感受', '车主', '提车'];

const TITLE_TPL = [
  (m, s) => `${m}提车三个月，${s}说说真实感受`,
  (m, s) => `${m} ${s}？车主实测${pickC(CONCERNS)}`,
  (m, s) => `预算内最${s}的选择，${m}一个月体验`,
  (m, s) => `${m} ${pickC(SCENES)}场景实测，${s}`,
  (m, s) => `试驾了三款车最后选${m}，就冲${s}`,
  (m, s) => `${m}车主${pickC(CONTENT_KW)}：${s}是真的`,
];
const BODY_TPL = [
  (m, s) => `开了两个月，主要${pickC(SCENES)}，${s}这点最满意。${pickC(CONCERNS)}方面也问过店里，整体觉得${m}在同级里性价比不错，推荐试驾。`,
  (m, s) => `当时对比了好几款，最后选${m}就是因为${s}。真实感受：日常通勤完全够用，${pickC(CONTENT_KW)}过的朋友应该懂。有问题欢迎评论区交流。`,
  (m, s) => `${pickC(SCENES)}一周，${m}的${s}表现超出预期。配置给得足，${pickC(CONCERNS)}成本也可控，准备推荐给同事。`,
];

function pickC(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

let seed = 42;
function rnd() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
function rint(min, max) {
  return min + Math.floor(rnd() * (max - min));
}

const days = ref(30);
const notes = ref([]);
const accounts = ref([]);
const loading = ref(false);
const page = ref(1);
const typeFilter = ref('全部');
const modelFilter = ref('全部车型');
const keyword = ref('');
const authorKw = ref('');

const typeOptions = [
  { value: '全部', label: '全部类型' },
  ...TYPES.map((t) => ({ value: t, label: t })),
];
const modelOptions = [
  { value: '全部车型', label: '全部车型' },
  ...MODELS.map((m) => ({ value: m, label: m })),
];

const columns = [
  { key: 'title', title: '标题', width: 300 },
  { title: '发布者', dataIndex: 'author', width: 130, ellipsis: true },
  { key: 'tags', title: '内容 / 车型 / 账号类型', width: 220 },
  { title: '点赞', dataIndex: 'digg', width: 80, sorter: (a, b) => a.digg - b.digg },
  { title: '评论', dataIndex: 'comment', width: 80, sorter: (a, b) => a.comment - b.comment },
  { title: '分享', dataIndex: 'share', width: 80 },
  { title: '收藏', dataIndex: 'collect', width: 80 },
  { title: '阅读', dataIndex: 'view', width: 100, sorter: (a, b) => a.view - b.view, defaultSortOrder: 'descend' },
  { title: '曝光', dataIndex: 'exposure', width: 110 },
  { title: '表单线索', dataIndex: 'formLeads', width: 90, sorter: (a, b) => a.formLeads - b.formLeads },
];

const violationColumns = [
  { title: '标题', dataIndex: 'title', ellipsis: true },
  { title: '发布者', dataIndex: 'author', width: 120, ellipsis: true },
  { key: 'keywords', title: '命中关键词', width: 180 },
  { title: '命中位置', dataIndex: 'position', width: 100 },
  { title: '发布时间', dataIndex: 'publishTime', width: 110 },
];

const fmt = (v) => {
  const n = Number(v ?? 0);
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return n.toLocaleString();
};

const blocks = computed(() => {
  const list = filtered.value;
  const sum = (k) => list.reduce((s, n) => s + Number(n[k] ?? 0), 0);
  return [
    { label: '内容数', value: fmt(list.length) },
    { label: '互动量', value: fmt(sum('digg') + sum('comment')) },
    { label: '获得关注数', value: fmt(sum('follow')) },
    { label: '阅读数', value: fmt(sum('view')) },
    { label: '曝光量', value: fmt(sum('exposure')) },
    { label: '私信进线数', value: fmt(sum('pmIn')) },
    { label: '私信开口数', value: fmt(sum('pmOpen')) },
    { label: '私信留资数', value: fmt(sum('pmLeads')) },
  ];
});

const filtered = computed(() =>
  notes.value.filter((n) => {
    if (typeFilter.value !== '全部' && n.type !== typeFilter.value) return false;
    if (modelFilter.value !== '全部车型' && n.model !== modelFilter.value) return false;
    if (keyword.value && !n.title.includes(keyword.value)) return false;
    if (authorKw.value && !n.author.includes(authorKw.value)) return false;
    return true;
  }),
);

const paged = computed(() => {
  const start = (page.value - 1) * PAGE_SIZE;
  return filtered.value.slice(start, start + PAGE_SIZE);
});

const wordCloud = computed(() => {
  const freq = new Map();
  for (const n of notes.value) {
    for (const w of [n.keyword, n.type]) freq.set(w, (freq.get(w) ?? 0) + 1);
  }
  const colors = ['#5087ec', '#f28e2b', '#36b37e', '#9b5de5'];
  const max = Math.max(1, ...freq.values());
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 42)
    .map(([text, count], i) => ({
      text,
      size: 12 + Math.round((count / max) * 18),
      color: colors[i % colors.length],
    }));
});

const typeEffEl = ref(null);
const modelPieEl = ref(null);
let typeChart = null;
let pieChart = null;

function renderCharts() {
  if (typeEffEl.value) {
    if (!typeChart) typeChart = echarts.init(typeEffEl.value);
    const byType = new Map();
    for (const n of filtered.value) {
      const cur = byType.get(n.type) ?? { inter: 0, leads: 0 };
      cur.inter += n.digg + n.comment;
      cur.leads += n.formLeads;
      byType.set(n.type, cur);
    }
    const types = [...byType.keys()];
    const totalInter = Math.max(1, [...byType.values()].reduce((s, v) => s + v.inter, 0));
    const totalLeads = Math.max(1, [...byType.values()].reduce((s, v) => s + v.leads, 0));
    typeChart.setOption({
      tooltip: { trigger: 'axis', valueFormatter: (v) => `${v}%` },
      legend: { data: ['互动量占比', '获取线索占比'] },
      grid: { left: 90, right: 30, top: 40, bottom: 40 },
      xAxis: { type: 'value', max: 100, axisLabel: { formatter: '{value}%' } },
      yAxis: { type: 'category', data: types, axisLabel: { width: 84 } },
      series: [
        {
          name: '互动量占比',
          type: 'bar',
          stack: 'x',
          data: types.map((t) => Math.round((byType.get(t).inter / totalInter) * 100)),
          itemStyle: { color: '#5087ec' },
          barMaxWidth: 14,
        },
        {
          name: '获取线索占比',
          type: 'bar',
          data: types.map((t) => Math.round((byType.get(t).leads / totalLeads) * 100)),
          itemStyle: { color: '#36b37e' },
          barMaxWidth: 14,
        },
      ],
    });
  }
  if (modelPieEl.value) {
    if (!pieChart) pieChart = echarts.init(modelPieEl.value);
    const byModel = new Map();
    for (const n of filtered.value) byModel.set(n.model, (byModel.get(n.model) ?? 0) + 1);
    pieChart.setOption({
      tooltip: { trigger: 'item', formatter: '{b}: {c}篇 ({d}%)' },
      legend: { orient: 'vertical', right: 10, top: 'center' },
      series: [
        {
          type: 'pie',
          radius: ['38%', '66%'],
          center: ['38%', '50%'],
          data: [...byModel.entries()].map(([name, value]) => ({ name, value })),
          label: { show: false },
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: '#8cc8ff' },
              { offset: 1, color: '#5087ec' },
            ]),
          },
        },
      ],
    });
  }
}

function regenerate() {
  seed = 42 + days.value;
  const count = days.value === 7 ? 60 : 150;
  const out = [];
  for (let i = 0; i < count; i++) {
    const acc = accounts.value.length
      ? accounts.value[rint(0, accounts.value.length)]
      : null;
    const model = MODELS[rint(0, MODELS.length)];
    const kw = SELLING[rint(0, SELLING.length)];
    const type = TYPES[rint(0, TYPES.length)];
    const tpl = TITLE_TPL[rint(0, TITLE_TPL.length)];
    const body = BODY_TPL[rint(0, BODY_TPL.length)];
    const view = rint(3000, 120000);
    out.push({
      id: i + 1,
      title: tpl(model, kw),
      body: body(model, kw),
      author: acc?.nickname || `演示账号${i + 1}`,
      accountType: acc?.accountType || 'KOS',
      type,
      model,
      keyword: kw,
      cover: `/images/kox-notes/note${rint(1, 6)}.webp`,
      publishTime: dayjs()
        .subtract(rint(0, days.value), 'day')
        .format('YYYY-MM-DD HH:mm'),
      digg: Math.round(view * (rnd() * 0.08 + 0.02)),
      comment: rint(5, 400),
      share: rint(2, 200),
      collect: rint(10, 1500),
      view,
      exposure: view * rint(6, 14),
      formLeads: rnd() > 0.55 ? rint(1, 25) : 0,
      follow: rint(2, 300),
      pmIn: rint(0, 60),
      pmOpen: rint(0, 40),
      pmLeads: rint(0, 18),
    });
  }
  notes.value = out;
  page.value = 1;
  nextTick(renderCharts);
}

function onFilterChange() {
  page.value = 1;
  nextTick(renderCharts);
}

const detailOpen = ref(false);
const detail = ref(null);

function showDetail(row) {
  detail.value = row;
  detailOpen.value = true;
}

const exporting = ref(false);

async function exportCsv() {
  exporting.value = true;
  try {
    const head = ['标题', '发布者', '内容类型', '提及车型', '账号类型', '点赞', '评论', '分享', '收藏', '阅读', '曝光', '表单线索', '发布时间'];
    const rows = filtered.value.map((n) => [
      n.title, n.author, n.type, n.model, n.accountType,
      n.digg, n.comment, n.share, n.collect, n.view, n.exposure, n.formLeads, n.publishTime,
    ]);
    const csv = [head, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `内容排行_${dayjs().format('YYYYMMDD')}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    message.success('导出成功');
  } catch {
    message.error('导出失败，请稍后重试');
  } finally {
    exporting.value = false;
  }
}

const violationKw = ref('');
const scopeTitle = ref(true);
const scopeBody = ref(true);
const detecting = ref(false);
const detected = ref(false);
const detectError = ref('');
const detection = ref({ total: 0, bad: 0, good: 0, rate: 0, rows: [] });

function detect() {
  const kws = violationKw.value.split('/').map((s) => s.trim()).filter(Boolean);
  if (!kws.length) {
    detectError.value = '请输入违规关键词后点击「开始检测」';
    detected.value = false;
    return;
  }
  if (!scopeTitle.value && !scopeBody.value) {
    detectError.value = '请至少选择一个检测范围';
    detected.value = false;
    return;
  }
  detectError.value = '';
  detecting.value = true;
  setTimeout(() => {
    const rows = [];
    for (const n of filtered.value) {
      const hits = [];
      const positions = [];
      if (scopeTitle.value) {
        const hit = kws.filter((k) => n.title.includes(k));
        if (hit.length) {
          hits.push(...hit);
          positions.push('标题');
        }
      }
      if (scopeBody.value) {
        const hit = kws.filter((k) => n.body.includes(k));
        if (hit.length) {
          hits.push(...hit);
          positions.push('正文');
        }
      }
      if (hits.length) {
        rows.push({
          id: n.id,
          title: n.title,
          author: n.author,
          keywords: [...new Set(hits)],
          position: [...new Set(positions)].join('+'),
          publishTime: n.publishTime,
        });
      }
    }
    const total = filtered.value.length;
    detection.value = {
      total,
      bad: rows.length,
      good: total - rows.length,
      rate: total ? ((rows.length / total) * 100).toFixed(1) : '0.0',
      rows,
    };
    detected.value = true;
    detecting.value = false;
  }, 600);
}

async function loadAccounts() {
  try {
    const res = await getKoxAccounts({
      brandId: auth.currentBrandId ?? undefined,
      page_size: 200,
    });
    accounts.value = res.list ?? [];
  } catch {
    accounts.value = [];
  }
}

function onResize() {
  typeChart?.resize();
  pieChart?.resize();
}

onMounted(async () => {
  loading.value = true;
  await loadAccounts();
  regenerate();
  loading.value = false;
  window.addEventListener('resize', onResize);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
  typeChart?.dispose();
  pieChart?.dispose();
});
</script>

<style scoped>
.overview-blocks {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
}

.block-card {
  width: 100%;
  height: 100px;
  min-width: 140px;
  background: linear-gradient(135deg, #f0f8ff, #fff);
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.block-content {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 100%;
  padding: 6px 8px;
}

.block-value {
  font-size: 20px;
  font-weight: 700;
  color: #1e293b;
  line-height: 1.2;
  margin-bottom: 8px;
  font-variant-numeric: tabular-nums;
}

.block-label {
  font-size: 13px;
  color: #666;
  text-align: center;
  line-height: 1.2;
  margin-top: auto;
}

.note-analysis-row {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 12px;
}

.note-analysis-card-left,
.note-analysis-card-right {
  width: 100%;
}

.type-efficiency-chart {
  width: 100%;
  height: 400px;
  margin-top: 16px;
}

.word-cloud-chart {
  width: 100%;
  height: 400px;
  margin-top: 16px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  align-content: center;
  gap: 6px 10px;
  padding: 0 8px;
  overflow: hidden;
}

.cloud-word {
  font-weight: 600;
  line-height: 1.2;
  transition: transform 0.2s ease;
  cursor: default;
  white-space: nowrap;
}

.cloud-word:hover {
  transform: scale(1.08);
}

.mention-model-chart {
  width: 100%;
  height: 360px;
  margin-top: 16px;
}

.summary-row {
  display: flex;
  align-items: center;
  margin: 10px 0;
}

.summary-row .left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.summary-row .right {
  display: flex;
  align-items: center;
  margin-left: auto;
}

.bar {
  width: 4px;
  height: 14px;
  background: #2563eb;
  border-radius: 2px;
}

.list-title {
  font-size: 16px;
  font-weight: 600;
  color: #1e293b;
}

.note-title-cell {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 0;
}

.note-cover-img {
  width: 45px;
  height: 60px;
  object-fit: cover;
  border-radius: 4px;
  flex-shrink: 0;
  background: #f1f5f9;
}

.note-title-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.title-link {
  color: #1e293b;
  font-weight: 700;
  text-decoration: none;
  cursor: pointer;
}

.title-link:hover {
  color: #2563eb;
  text-decoration: underline;
}

.violation-keyword-section {
  margin-bottom: 16px;
}

.violation-scope-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.violation-keyword-label {
  color: #475569;
  font-size: 13px;
  white-space: nowrap;
  font-weight: 600;
}

.violation-summary {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin: 16px 0;
}

.violation-stat-card {
  background: linear-gradient(135deg, #f8fafc, #fff);
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  padding: 16px;
  text-align: center;
}

.violation-stat-value {
  font-size: 24px;
  font-weight: 700;
  color: #1e293b;
  line-height: 1.2;
}

.violation-stat-label {
  font-size: 13px;
  color: #64748b;
  margin-top: 6px;
}

.violation-sub-title {
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 12px;
  margin-top: 16px;
}

.violation-sub-count {
  font-size: 12px;
  font-weight: 400;
  color: #64748b;
  margin-left: 8px;
}

.violation-tag {
  display: inline-block;
  background: #fef2f2;
  color: #e15759;
  border: 1px solid #fecaca;
  border-radius: 4px;
  padding: 1px 6px;
  font-size: 12px;
  margin: 2px 4px 2px 0;
}

.detail-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.detail-cover {
  width: 100%;
  max-height: 280px;
  object-fit: cover;
  border-radius: 8px;
}

.detail-text {
  font-size: 14px;
  line-height: 1.8;
  color: #334155;
  margin: 0;
}

.detail-meta {
  text-align: right;
}

.muted {
  color: var(--color-text-secondary);
}

.mini {
  font-size: 12px;
}

@media (max-width: 1200px) {
  .note-analysis-row {
    grid-template-columns: 1fr;
  }
}
</style>
