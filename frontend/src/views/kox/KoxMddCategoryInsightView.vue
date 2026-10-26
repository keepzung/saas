<template>
  <PageWrapper title="成交选题雷达" subtitle="成交品类 × 留资 × 内容供给 · 用成交数据反哺内容创作">
    <template #extra>
      <a-button size="small" @click="onExport">
        <DownloadOutlined /> 导出
      </a-button>
    </template>

    <a-segmented
      v-model:value="tab"
      :options="[
        { label: '选题建议', value: 'suggest' },
        { label: '供需矩阵', value: 'matrix' },
        { label: '内容类型', value: 'content' },
        { label: '口径维护', value: 'caliber' },
      ]"
      class="tab-seg"
      @change="onTabChange"
    />

    <a-card size="small" class="filter-card">
      <div class="filter-row">
        <span class="f-label">月份：</span>
        <a-range-picker
          v-model:value="monthRange"
          picker="month"
          size="small"
          format="YYYY-MM"
          :allow-clear="false"
          @change="reload"
        />
        <a-popover placement="bottomLeft">
          <template #content>
            <div class="scope-list">
              <div v-for="(v, k) in scopeNote" :key="k" class="scope-item">{{ v }}</div>
            </div>
          </template>
          <a-button size="small" type="text">
            <InfoCircleOutlined /> 口径说明
          </a-button>
        </a-popover>
      </div>
    </a-card>

    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-label">成交件数</div>
        <div class="stat-value hl-blue">{{ fmt(cards.total_qty) }}<span v-if="cards.qty_wow != null" class="wow" :class="cards.qty_wow >= 0 ? 'up' : 'down'">{{ cards.qty_wow >= 0 ? '↑' : '↓' }}{{ Math.abs(cards.qty_wow) }}%</span></div>
        <div class="stat-sub muted mini">{{ cards.total_orders }} 单</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">销售额</div>
        <div class="stat-value">¥{{ fmt(cards.total_amount) }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">留资（潜在成交）</div>
        <div class="stat-value hl-green">{{ fmt(cards.total_leads) }}<span v-if="cards.leads_wow != null" class="wow" :class="cards.leads_wow >= 0 ? 'up' : 'down'">{{ cards.leads_wow >= 0 ? '↑' : '↓' }}{{ Math.abs(cards.leads_wow) }}%</span></div>
        <div class="stat-sub muted mini">笔记私信+表单留资</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">供给笔记 / 活跃</div>
        <div class="stat-value hl-purple">{{ fmt(cards.supply_notes) }}<span class="muted mini"> / {{ fmt(activeNotes) }}</span></div>
        <div class="stat-sub muted mini">窗口内发布 / 有数据笔记</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">成交客户 / 复购率</div>
        <div class="stat-value">{{ fmt(cards.customers) }}</div>
        <div class="stat-sub muted mini">复购率 {{ cards.repurchase_rate }}%</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">在售品类 / 选题机会</div>
        <div class="stat-value">{{ categorySummary.length }}<span class="muted mini"> / </span><span class="hl-orange">{{ suggestions.length }}</span></div>
        <div class="stat-sub muted mini">含「未归类」以外的品类</div>
      </div>
    </div>

    <!-- ─── 选题建议 ─── -->
    <template v-if="tab === 'suggest'">
      <a-alert
        v-if="unclassified.length"
        type="warning"
        show-icon
        class="hint-bar"
      >
        <template #message>
          有 {{ unclassified.length }} 个品名未归入品类（可在「口径维护」补规则），销量 TOP：
          {{ unclassified.slice(0, 5).map((u) => `${u.name}(${u.qty}件)`).join('、') }}
        </template>
      </a-alert>

      <a-empty v-if="!suggestions.length && !loading" description="当前窗口暂无选题机会（各品类供需匹配均衡）" />
      <div class="sugg-list">
        <div v-for="s in suggestions" :key="s.type + s.category" class="sugg-card" :class="`sugg-${s.type}`">
          <div class="sugg-head">
            <a-tag :color="typeMeta[s.type]?.color" class="sugg-tag">{{ typeMeta[s.type]?.label }}</a-tag>
            <span class="sugg-title">{{ s.title }}</span>
            <a-tag v-if="s.weekly_target" color="blue" class="sugg-week">每周 +{{ s.weekly_target }} 篇</a-tag>
          </div>
          <div class="sugg-reason">{{ s.reason }}</div>
          <div class="sugg-action"><BulbOutlined /> {{ s.action }}</div>
          <div v-if="s.ref_notes.length" class="sugg-refs">
            <div class="refs-label">参考爆文：</div>
            <a
              v-for="rn in s.ref_notes"
              :key="rn.noteId"
              :href="rn.url || 'javascript:;'"
              target="_blank"
              class="ref-note"
            >
              <span class="ref-title">{{ rn.title || '(无标题)' }}</span>
              <span class="ref-meta">{{ rn.author || '匿名' }} · 互动{{ fmt(rn.engagement) }} · 留资{{ rn.leads }}</span>
            </a>
          </div>
          <div v-else class="sugg-refs muted mini">暂无该品类命中笔记——全新选题空间</div>
        </div>
      </div>
    </template>

    <!-- ─── 供需矩阵 ─── -->
    <template v-if="tab === 'matrix'">
      <a-card size="small" :bordered="false">
        <div class="filter-row" style="margin-bottom: 8px">
          <span class="f-label">需求口径：</span>
          <a-segmented
            v-model:value="lens"
            size="small"
            :options="[{ label: '按成交', value: 'sales' }, { label: '按留资', value: 'leads' }]"
            @change="renderScatter"
          />
          <span class="muted mini">横轴=供给笔记数 · 纵轴=需求量 · 气泡={{ lens === 'sales' ? '销售额' : '留资数' }}</span>
        </div>
        <div ref="scatterEl" style="height: 420px" />
        <div class="legend-row">
          <span class="lg"><i class="dot" style="background:#ef4444"></i>高需求低供给（选题机会）</span>
          <span class="lg"><i class="dot" style="background:#3456e6"></i>高需求高供给（主力维持）</span>
          <span class="lg"><i class="dot" style="background:#f59e0b"></i>低需求高供给（带货弱）</span>
          <span class="lg"><i class="dot" style="background:#94a3b8"></i>低需求低供给（观察）</span>
          <span class="lg"><i class="dot" style="background:#cbd5e1"></i>长尾</span>
        </div>
      </a-card>

      <a-card size="small" :bordered="false" class="detail-card" title="品类汇总（成交 + 留资双口径）">
        <a-table
          :columns="summaryColumns"
          :data-source="categorySummary"
          :loading="loading"
          :pagination="false"
          row-key="category"
          size="small"
          :scroll="{ x: 1200 }"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'notes_action'">
              <a-button size="small" type="link" @click="openNotes(record.category)">
                <EyeOutlined /> 看笔记
              </a-button>
            </template>
          </template>
        </a-table>
      </a-card>
    </template>

    <!-- ─── 内容类型 ─── -->
    <template v-if="tab === 'content'">
      <a-card size="small" :bordered="false" title="内容类型效率（穿搭展示/面料材质等 8 类内容轴，回答「怎么写」）">
        <div ref="typeEl" style="height: 360px" />
      </a-card>
      <a-card size="small" :bordered="false" class="detail-card" title="类型明细">
        <a-table
          :columns="typeColumns"
          :data-source="contentType"
          :pagination="false"
          row-key="type"
          size="small"
        />
      </a-card>
    </template>

    <!-- ─── 口径维护 ─── -->
    <template v-if="tab === 'caliber'">
      <a-alert type="info" show-icon class="hint-bar"
        message="品类由「关键词规则」按优先级首中命中（品名/笔记标题共用）；规则改动后点击「重算订单品类」生效。" />

      <a-card size="small" :bordered="false" title="品类定义">
        <template #extra>
          <a-button size="small" type="primary" @click="openDefModal()">
            <PlusOutlined /> 新增品类
          </a-button>
        </template>
        <a-table
          :columns="defColumns"
          :data-source="defs"
          :pagination="false"
          row-key="id"
          size="small"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'enabled'">
              <a-switch size="small" :checked="record.enabled" @change="(v) => toggleDef(record, v)" />
            </template>
            <template v-else-if="column.key === 'action'">
              <a-button size="small" type="link" @click="openDefModal(record)">编辑</a-button>
            </template>
          </template>
        </a-table>
      </a-card>

      <a-card size="small" :bordered="false" class="detail-card" title="映射规则（关键词 → 品类）">
        <template #extra>
          <a-space>
            <a-button size="small" @click="reclassify" :loading="recalcLoading">
              <SyncOutlined /> 重算订单品类
            </a-button>
            <a-button size="small" type="primary" @click="openRuleModal()">
              <PlusOutlined /> 新增规则
            </a-button>
          </a-space>
        </template>
        <a-table
          :columns="ruleColumns"
          :data-source="rules"
          :pagination="false"
          row-key="id"
          size="small"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'enabled'">
              <a-switch size="small" :checked="record.enabled" @change="(v) => toggleRule(record, v)" />
            </template>
            <template v-else-if="column.key === 'action'">
              <a-space>
                <a-button size="small" type="link" @click="openRuleModal(record)">编辑</a-button>
                <a-popconfirm title="删除该规则？" @confirm="removeRule(record)">
                  <a-button size="small" type="link" danger>删除</a-button>
                </a-popconfirm>
              </a-space>
            </template>
          </template>
        </a-table>
      </a-card>

      <a-card size="small" :bordered="false" class="detail-card" title="未归类品名（窗口内，按销量）">
        <a-empty v-if="!unclassified.length" description="当前窗口全部品名已归类" />
        <a-table
          v-else
          :columns="unclsColumns"
          :data-source="unclassified"
          :pagination="false"
          row-key="name"
          size="small"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'action'">
              <a-button size="small" type="link" @click="openRuleModal(null, record.name)">加规则</a-button>
            </template>
          </template>
        </a-table>
      </a-card>
    </template>

    <!-- 规则弹窗 -->
    <a-modal v-model:open="ruleModal.open" :title="ruleModal.id ? '编辑规则' : '新增规则'" @ok="saveRule" :confirm-loading="ruleModal.saving">
      <a-form layout="vertical" style="margin-top: 12px">
        <a-form-item label="关键词 / 完整品名" required>
          <a-input v-model:value="ruleModal.pattern" placeholder="如：开衫（contains）或完整品名（exact）" />
        </a-form-item>
        <a-form-item label="匹配方式">
          <a-radio-group v-model:value="ruleModal.matchType">
            <a-radio value="contains">包含（contains）</a-radio>
            <a-radio value="exact">精确（exact）</a-radio>
          </a-radio-group>
        </a-form-item>
        <a-form-item label="目标品类" required>
          <a-select v-model:value="ruleModal.category" :options="defOptions" placeholder="选择品类" />
        </a-form-item>
        <a-form-item label="优先级（数字越小越先匹配）">
          <a-input-number v-model:value="ruleModal.priority" :min="1" :max="9999" style="width: 100%" />
        </a-form-item>
        <a-form-item label="备注">
          <a-input v-model:value="ruleModal.remark" placeholder="选填" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 品类弹窗 -->
    <a-modal v-model:open="defModal.open" :title="defModal.id ? '编辑品类' : '新增品类'" @ok="saveDef" :confirm-loading="defModal.saving">
      <a-form layout="vertical" style="margin-top: 12px">
        <a-form-item label="品类名" required>
          <a-input v-model:value="defModal.name" :disabled="!!defModal.id" placeholder="如：配饰" />
        </a-form-item>
        <a-form-item label="排序（小在前）">
          <a-input-number v-model:value="defModal.sort" :min="0" :max="999" style="width: 100%" />
        </a-form-item>
        <a-form-item label="备注">
          <a-input v-model:value="defModal.remark" placeholder="选填" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 品类参考笔记弹窗 -->
    <a-modal
      v-model:open="noteModal.open"
      :title="`「${noteModal.category}」参考笔记（窗口内，按留资/互动排序 TOP10）`"
      :footer="null"
      width="780px"
    >
      <a-alert
        v-if="!noteModal.notes.length"
        type="info"
        show-icon
        message="该品类暂无标题命中笔记——正是全新选题空间，建议从成交爆品卖点切入创作"
      />
      <div v-else class="note-list">
        <a
          v-for="nt in noteModal.notes"
          :key="nt.noteId"
          :href="nt.url || 'javascript:;'"
          target="_blank"
          class="note-row"
        >
          <div class="note-title">{{ nt.title || '(无标题)' }}</div>
          <div class="note-meta">
            <span>{{ nt.author || '匿名' }}</span>
            <a-tag color="green" class="mini">留资 {{ nt.leads }}</a-tag>
            <a-tag color="blue" class="mini">互动 {{ fmt(nt.engagement) }}</a-tag>
            <a-tag class="mini">开口 {{ nt.pmOpenings }}</a-tag>
            <a-tag class="mini">阅读 {{ fmt(nt.views) }}</a-tag>
          </div>
        </a>
      </div>
    </a-modal>

    <a-collapse ghost class="scope-collapse">
      <a-collapse-panel key="scope" header="口径与规则说明">
        <div class="scope-list">
          <div v-for="(v, k) in scopeNote" :key="k" class="scope-item">{{ v }}</div>
        </div>
      </a-collapse-panel>
    </a-collapse>
  </PageWrapper>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { message } from 'ant-design-vue';
import { BulbOutlined, DownloadOutlined, EyeOutlined, InfoCircleOutlined, PlusOutlined, SyncOutlined } from '@ant-design/icons-vue';
import * as echarts from 'echarts';
import dayjs from 'dayjs';
import PageWrapper from '../../components/PageWrapper.vue';
import request from '../../api/request';
import { exportExcel } from '../../utils/excel';

const loading = ref(false);
const tab = ref('suggest');
const lens = ref('sales');
const monthRange = ref([dayjs().startOf('month').subtract(2, 'month'), dayjs()]);

const cards = ref({ total_qty: 0, total_amount: 0, total_orders: 0, customers: 0, repurchase_rate: 0, total_leads: 0, supply_notes: 0, qty_wow: null, leads_wow: null });
const categorySummary = ref([]);
const matrix = ref([]);
const contentType = ref([]);
const topNotes = ref([]);
const suggestions = ref([]);
const unclassified = ref([]);
const scopeNote = ref({});

const typeMeta = {
  supply_gap_sales: { label: '成交缺口', color: 'red' },
  supply_gap_leads: { label: '留资缺口', color: 'orange' },
  leads_no_conversion: { label: '转化观察', color: 'gold' },
  sales_low_leads: { label: '拉新空间', color: 'purple' },
};

// 口径维护状态
const defs = ref([]);
const rules = ref([]);
const recalcLoading = ref(false);
const ruleModal = reactive({ open: false, saving: false, id: null, pattern: '', matchType: 'contains', category: null, priority: 100, remark: '' });
const defModal = reactive({ open: false, saving: false, id: null, name: '', sort: 99, remark: '' });
const noteModal = reactive({ open: false, category: '', notes: [] });

const notesByCat = computed(() => new Map((topNotes.value ?? []).map((t) => [t.category, t.notes ?? []])));

function openNotes(category) {
  noteModal.category = category;
  noteModal.notes = notesByCat.value.get(category) ?? [];
  noteModal.open = true;
}

const defOptions = computed(() => defs.value.filter((d) => d.enabled).map((d) => ({ label: d.name, value: d.name })));
const activeNotes = computed(() => categorySummary.value.reduce((a, s) => a + (s.notes_active ?? 0), 0));

const fmt = (v) => Number(v ?? 0).toLocaleString();

const summaryColumns = [
  { title: '品类', dataIndex: 'category', width: 100, fixed: 'left' },
  { title: '成交(件)', dataIndex: 'qty', width: 90, align: 'right', sorter: (a, b) => a.qty - b.qty },
  { title: '环比', key: 'qty_wow', width: 80, align: 'right', customRender: ({ record }) => wowText(record.qty_wow) },
  { title: '销售额(元)', dataIndex: 'amount', width: 110, align: 'right', sorter: (a, b) => a.amount - b.amount, customRender: ({ text }) => fmt(text) },
  { title: '订单', dataIndex: 'orders', width: 70, align: 'right' },
  { title: '客户', dataIndex: 'customers', width: 70, align: 'right' },
  { title: '复购率', dataIndex: 'repurchase_rate', width: 80, align: 'right', customRender: ({ text }) => `${text}%` },
  { title: '留资', dataIndex: 'leads', width: 80, align: 'right', sorter: (a, b) => a.leads - b.leads },
  { title: '留资环比', key: 'leads_wow', width: 90, align: 'right', customRender: ({ record }) => wowText(record.leads_wow) },
  { title: '篇均留资', dataIndex: 'leads_per_note', width: 90, align: 'right' },
  { title: '留资→成交', dataIndex: 'leads_to_sales_rate', width: 100, align: 'right', customRender: ({ text }) => (text == null ? '-' : `${text}%`) },
  { title: '发布笔记', key: 'notes', width: 110, align: 'right', customRender: ({ record }) => `${record.notes_published} 篇` },
  { title: '篇/周', dataIndex: 'notes_per_week', width: 80, align: 'right' },
  { title: '活跃笔记', dataIndex: 'notes_active', width: 90, align: 'right' },
  { title: '互动', dataIndex: 'engagement', width: 90, align: 'right', customRender: ({ text }) => fmt(text) },
  { title: '参考笔记', key: 'notes_action', width: 100, align: 'center' },
];

const typeColumns = [
  { title: '内容类型', dataIndex: 'type', width: 110 },
  { title: '活跃笔记', dataIndex: 'notes', width: 90, align: 'right' },
  { title: '曝光', dataIndex: 'exposure', width: 100, align: 'right', customRender: ({ text }) => fmt(text) },
  { title: '互动', dataIndex: 'engagement', width: 100, align: 'right', sorter: (a, b) => a.engagement - b.engagement, customRender: ({ text }) => fmt(text) },
  { title: '私信开口', dataIndex: 'pm_openings', width: 100, align: 'right' },
  { title: '留资', dataIndex: 'leads', width: 90, align: 'right', sorter: (a, b) => a.leads - b.leads },
  { title: '篇均留资', key: 'lpn', width: 90, align: 'right', customRender: ({ record }) => (record.notes ? Math.round((record.leads / record.notes) * 100) / 100 : 0) },
];

const defColumns = [
  { title: '品类', dataIndex: 'name', width: 120 },
  { title: '排序', dataIndex: 'sort', width: 70, align: 'right' },
  { title: '启用', key: 'enabled', width: 80 },
  { title: '备注', dataIndex: 'remark' },
  { title: '操作', key: 'action', width: 80 },
];

const ruleColumns = [
  { title: '优先级', dataIndex: 'priority', width: 80, align: 'right', sorter: (a, b) => a.priority - b.priority },
  { title: '关键词', dataIndex: 'pattern', width: 140 },
  { title: '匹配', dataIndex: 'matchType', width: 90 },
  { title: '品类', dataIndex: 'category', width: 110 },
  { title: '启用', key: 'enabled', width: 80 },
  { title: '备注', dataIndex: 'remark' },
  { title: '操作', key: 'action', width: 120 },
];

const unclsColumns = [
  { title: '品名', dataIndex: 'name' },
  { title: '件数', dataIndex: 'qty', width: 90, align: 'right', sorter: (a, b) => a.qty - b.qty },
  { title: '单数', dataIndex: 'orders', width: 90, align: 'right' },
  { title: '操作', key: 'action', width: 100 },
];

const wowText = (w) => {
  if (w == null) return '-';
  const color = w >= 0 ? '#16a34a' : '#ef4444';
  return `${w >= 0 ? '↑' : '↓'}${Math.abs(w)}%`;
};

let scatterChart = null;
let typeChart = null;
const scatterEl = ref(null);
const typeEl = ref(null);

const monthParams = () => ({
  startMonth: monthRange.value?.[0]?.format('YYYY-MM'),
  endMonth: monthRange.value?.[1]?.format('YYYY-MM'),
});

async function reload() {
  loading.value = true;
  try {
    const res = await request.get('/mdd/sales/category-insight', { params: monthParams() });
    cards.value = res.cards ?? cards.value;
    categorySummary.value = res.category_summary ?? [];
    matrix.value = res.matrix ?? [];
    contentType.value = res.content_type_efficiency ?? [];
    topNotes.value = res.top_notes ?? [];
    suggestions.value = res.suggestions ?? [];
    unclassified.value = res.unclassified ?? [];
    scopeNote.value = res.scope_note ?? {};
    await nextTick();
    if (tab.value === 'matrix') renderScatter();
  } catch (e) {
    message.error(e.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

function onTabChange(v) {
  nextTick(() => {
    if (v === 'matrix') renderScatter();
    if (v === 'content') renderType();
    if (v === 'caliber' && !defs.value.length) loadCaliber();
  });
}

// ─── 供需矩阵散点 ───
const median = (arr) => {
  const v = [...arr].sort((a, b) => a - b);
  if (!v.length) return 0;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
};

function pointColor(m) {
  const demand = lens.value === 'sales' ? m.quadrant_sales : m.quadrant_leads;
  if (demand === '长尾') return '#cbd5e1';
  if (demand === '高' && m.supply_low) return '#ef4444';
  if (demand === '高') return '#3456e6';
  if (m.supply_low) return '#94a3b8';
  return '#f59e0b';
}

function renderScatter() {
  if (!scatterEl.value) return;
  if (!scatterChart) scatterChart = echarts.init(scatterEl.value);
  const data = matrix.value;
  if (!data.length) {
    scatterChart.setOption({ title: { text: '当前窗口暂无品类数据', left: 'center', top: 'middle', textStyle: { color: '#94a3b8', fontSize: 14 } }, xAxis: { show: false }, yAxis: { show: false }, series: [] }, { notMerge: true });
    return;
  }
  const medX = median(data.map((m) => m.notes_published));
  const yKey = lens.value === 'sales' ? 'qty' : 'leads';
  const medY = median(data.map((m) => m[yKey]));
  const sizeMax = Math.max(...data.map((m) => (lens.value === 'sales' ? m.amount : m.leads)), 1);
  scatterChart.setOption(
    {
      tooltip: {
        formatter: (p) => {
          const m = p.data.meta;
          return `<b>${m.category}</b><br/>供给 ${m.notes_published} 篇 · ${lens.value === 'sales' ? '成交' : '留资'} ${m[yKey]}<br/>成交 ${m.qty} 件/¥${fmt(m.amount)} · 留资 ${m.leads}<br/>象限：成交[${m.quadrant_sales}] 留资[${m.quadrant_leads}]`;
        },
      },
      grid: { left: 56, right: 32, top: 24, bottom: 44 },
      xAxis: { type: 'value', name: '供给笔记数（篇）', minInterval: 1, max: (v) => Math.ceil(v.max * 1.08) },
      yAxis: { type: 'value', name: lens.value === 'sales' ? '成交（件）' : '留资（条）', minInterval: 1, max: (v) => Math.ceil(v.max * 1.12) },
      series: [
        {
          type: 'scatter',
          symbolSize: (v) => {
            const s = v[2] ?? 0;
            return 12 + (Math.sqrt(Math.max(s, 0)) / Math.sqrt(sizeMax)) * 34;
          },
          label: { show: true, formatter: (p) => p.data.meta.category, position: 'top', fontSize: 11, color: '#475569' },
          data: data.map((m) => ({
            value: [m.notes_published, m[yKey], lens.value === 'sales' ? m.amount : m.leads],
            meta: m,
            itemStyle: { color: pointColor(m), opacity: 0.85 },
          })),
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { type: 'dashed', color: '#cbd5e1' },
            label: { show: false },
            data: [{ xAxis: medX }, { yAxis: medY }],
          },
        },
      ],
    },
    { notMerge: true },
  );
}

function renderType() {
  if (!typeEl.value) return;
  if (!typeChart) typeChart = echarts.init(typeEl.value);
  const rows = [...contentType.value].reverse();
  typeChart.setOption(
    {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { data: ['互动', '留资'], bottom: 0 },
      grid: { left: 90, right: 40, top: 16, bottom: 44 },
      xAxis: { type: 'value' },
      yAxis: { type: 'category', data: rows.map((r) => r.type) },
      series: [
        { name: '互动', type: 'bar', data: rows.map((r) => r.engagement), itemStyle: { color: '#3456e6' }, barMaxWidth: 18 },
        { name: '留资', type: 'bar', data: rows.map((r) => r.leads), itemStyle: { color: '#10b981' }, barMaxWidth: 18 },
      ],
    },
    { notMerge: true },
  );
}

// ─── 口径维护 ───
async function loadCaliber() {
  try {
    const res = await request.get('/mdd/sales/categories');
    defs.value = res.defs ?? [];
    rules.value = res.rules ?? [];
  } catch (e) {
    message.error(e.message || '加载口径失败');
  }
}

function openRuleModal(rule = null, presetPattern = '') {
  ruleModal.id = rule?.id ?? null;
  ruleModal.pattern = rule?.pattern ?? presetPattern ?? '';
  ruleModal.matchType = rule?.matchType ?? 'contains';
  ruleModal.category = rule?.category ?? null;
  ruleModal.priority = rule?.priority ?? 100;
  ruleModal.remark = rule?.remark ?? '';
  ruleModal.open = true;
}

async function saveRule() {
  if (!ruleModal.pattern.trim() || !ruleModal.category) {
    message.warning('关键词与目标品类必填');
    return;
  }
  ruleModal.saving = true;
  try {
    const body = {
      pattern: ruleModal.pattern.trim(),
      matchType: ruleModal.matchType,
      category: ruleModal.category,
      priority: ruleModal.priority,
      remark: ruleModal.remark,
    };
    if (ruleModal.id) await request.patch(`/mdd/sales/categories/rules/${ruleModal.id}`, body);
    else await request.post('/mdd/sales/categories/rules', body);
    message.success('规则已保存，建议点击「重算订单品类」生效');
    ruleModal.open = false;
    await Promise.all([loadCaliber(), reload()]);
  } catch (e) {
    message.error(e.message || '保存失败');
  } finally {
    ruleModal.saving = false;
  }
}

async function toggleRule(rule, enabled) {
  await request.patch(`/mdd/sales/categories/rules/${rule.id}`, { enabled });
  await Promise.all([loadCaliber(), reload()]);
}

async function removeRule(rule) {
  await request.delete(`/mdd/sales/categories/rules/${rule.id}`);
  message.success('已删除');
  await Promise.all([loadCaliber(), reload()]);
}

function openDefModal(def = null) {
  defModal.id = def?.id ?? null;
  defModal.name = def?.name ?? '';
  defModal.sort = def?.sort ?? 99;
  defModal.remark = def?.remark ?? '';
  defModal.open = true;
}

async function saveDef() {
  if (!defModal.name.trim()) {
    message.warning('品类名必填');
    return;
  }
  defModal.saving = true;
  try {
    if (defModal.id) {
      await request.patch(`/mdd/sales/categories/defs/${defModal.id}`, { sort: defModal.sort, remark: defModal.remark });
    } else {
      await request.post('/mdd/sales/categories/defs', { name: defModal.name.trim(), sort: defModal.sort, remark: defModal.remark });
    }
    defModal.open = false;
    await Promise.all([loadCaliber(), reload()]);
  } catch (e) {
    message.error(e.message || '保存失败');
  } finally {
    defModal.saving = false;
  }
}

async function toggleDef(def, enabled) {
  await request.patch(`/mdd/sales/categories/defs/${def.id}`, { enabled });
  await Promise.all([loadCaliber(), reload()]);
}

async function reclassify() {
  recalcLoading.value = true;
  try {
    const res = await request.post('/mdd/sales/categories/reclassify');
    message.success(`重算完成：共 ${res.total} 单，更新 ${res.changed} 条`);
    await reload();
  } catch (e) {
    message.error(e.message || '重算失败');
  } finally {
    recalcLoading.value = false;
  }
}

// ─── 导出 ───
function onExport() {
  const suffix = `${monthRange.value?.[0]?.format('YYYYMM')}-${monthRange.value?.[1]?.format('YYYYMM')}`;
  exportExcel(
    [
      {
        name: '选题建议',
        rows: suggestions.value.map((s) => ({
          类型: typeMeta[s.type]?.label ?? s.type,
          品类: s.category,
          建议: s.title,
          依据: s.reason,
          行动: s.action,
          每周建议篇数: s.weekly_target ?? '',
          参考爆文: s.ref_notes.map((r) => `${r.title}（${r.author}）`).join('；'),
        })),
      },
      {
        name: '品类汇总',
        rows: categorySummary.value.map((s) => ({
          品类: s.category,
          成交件数: s.qty,
          环比: s.qty_wow == null ? '' : `${s.qty_wow}%`,
          销售额: s.amount,
          订单数: s.orders,
          客户数: s.customers,
          复购率: `${s.repurchase_rate}%`,
          留资: s.leads,
          留资环比: s.leads_wow == null ? '' : `${s.leads_wow}%`,
          篇均留资: s.leads_per_note,
          留资转化率: s.leads_to_sales_rate == null ? '' : `${s.leads_to_sales_rate}%`,
          发布笔记: s.notes_published,
          篇周: s.notes_per_week,
          活跃笔记: s.notes_active,
          互动: s.engagement,
        })),
      },
      {
        name: '供需矩阵',
        rows: matrix.value.map((m) => ({
          品类: m.category,
          成交: m.qty,
          销售额: m.amount,
          留资: m.leads,
          供给笔记: m.notes_published,
          成交象限: m.quadrant_sales,
          留资象限: m.quadrant_leads,
          供给偏低: m.supply_low ? '是' : '否',
        })),
      },
      {
        name: '内容类型',
        rows: contentType.value.map((t) => ({
          类型: t.type,
          活跃笔记: t.notes,
          互动: t.engagement,
          私信开口: t.pm_openings,
          留资: t.leads,
        })),
      },
    ],
    `成交选题雷达_${suffix}`,
  );
}

function onResize() {
  scatterChart?.resize();
  typeChart?.resize();
}

onMounted(() => {
  reload();
  window.addEventListener('resize', onResize);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
  scatterChart?.dispose();
  typeChart?.dispose();
});
</script>

<style scoped>
.tab-seg {
  margin-bottom: 12px;
}

.filter-card {
  margin-bottom: 12px;
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.f-label {
  color: var(--color-text-secondary);
  font-size: 13px;
}

.hint-bar {
  margin-bottom: 12px;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 12px;
  margin-bottom: 12px;
}

@media (max-width: 1100px) {
  .stat-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

.stat-card {
  background: #fff;
  border-radius: 12px;
  padding: 16px 18px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  text-align: center;
}

.stat-label {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.stat-value {
  font-size: 26px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: #1e293b;
  font-family: 'DIN Alternate', 'Bahnschrift', -apple-system, sans-serif;
  margin-top: 4px;
}

.stat-sub {
  margin-top: 2px;
}

.wow {
  font-size: 12px;
  margin-left: 6px;
}

.wow.up {
  color: #16a34a;
}

.wow.down {
  color: #ef4444;
}

.hl-blue {
  color: #2563eb;
}

.hl-green {
  color: #16a34a;
}

.hl-purple {
  color: #7c3aed;
}

.hl-orange {
  color: #ea580c;
}

.muted {
  color: #94a3b8;
}

.mini {
  font-size: 12px;
}

.detail-card {
  margin-top: 12px;
}

.sugg-list {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

@media (max-width: 1100px) {
  .sugg-list {
    grid-template-columns: 1fr;
  }
}

.sugg-card {
  background: #fff;
  border-radius: 12px;
  padding: 16px 18px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  border-left: 4px solid #e2e8f0;
}

.sugg-supply_gap_sales {
  border-left-color: #ef4444;
}

.sugg-supply_gap_leads {
  border-left-color: #f59e0b;
}

.sugg-leads_no_conversion {
  border-left-color: #eab308;
}

.sugg-sales_low_leads {
  border-left-color: #8b5cf6;
}

.sugg-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.sugg-title {
  font-weight: 700;
  font-size: 15px;
  color: #1e293b;
}

.sugg-week {
  margin-left: auto;
}

.sugg-reason {
  margin-top: 8px;
  color: #475569;
  font-size: 13px;
}

.sugg-action {
  margin-top: 6px;
  font-size: 13px;
  color: #2563eb;
}

.sugg-refs {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px dashed #e2e8f0;
}

.refs-label {
  font-size: 12px;
  color: #94a3b8;
  margin-bottom: 4px;
}

.ref-note {
  display: block;
  font-size: 13px;
  color: #334155;
  text-decoration: none;
  padding: 3px 0;
}

.ref-note:hover .ref-title {
  color: #2563eb;
}

.ref-title {
  color: #334155;
}

.ref-meta {
  color: #94a3b8;
  font-size: 12px;
  margin-left: 8px;
}

.legend-row {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  margin-top: 8px;
  font-size: 12px;
  color: #64748b;
}

.lg {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}

.scope-collapse {
  margin-top: 12px;
  background: #fff;
  border-radius: 12px;
  padding: 0 12px;
}

.scope-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: #64748b;
}

.note-list {
  display: flex;
  flex-direction: column;
  max-height: 60vh;
  overflow-y: auto;
}

.note-row {
  display: block;
  padding: 10px 4px;
  border-bottom: 1px solid #f1f5f9;
  text-decoration: none;
}

.note-row:hover {
  background: #f8fafc;
}

.note-title {
  font-size: 14px;
  color: #1e293b;
  font-weight: 600;
}

.note-row:hover .note-title {
  color: #2563eb;
}

.note-meta {
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #94a3b8;
}
</style>
