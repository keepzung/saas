<template>
  <div class="batch-page">
    <!-- 深色页头：双页签 + 算力 -->
    <div class="bt-header">
      <div class="bt-tabs">
        <button type="button" :class="{ active: tab === 'create' }" @click="switchTab('create')">批量图文创作</button>
        <button type="button" :class="{ active: tab === 'result' }" @click="switchTab('result')">批量任务结果</button>
      </div>
      <div class="bt-right">
        <span v-if="quota" class="bt-quota">⚡ 可用算力 {{ quotaText }}</span>
      </div>
    </div>

    <!-- ── Tab1 批量图文创作 ─────────────────────────────────── -->
    <div v-if="tab === 'create'" class="bt-create">
      <div class="form-card">
        <div class="fc-grid">
          <div class="fc-item">
            <label><span class="req">*</span> 产品或服务</label>
            <a-select v-model:value="productId" :options="productOptions" placeholder="选择产品" show-search option-filter-prop="label" />
          </div>
          <div class="fc-item">
            <label><span class="req">*</span> 任务名称</label>
            <a-input v-model:value="taskName" :maxlength="40" placeholder="例如：618 护肤新品种草批量稿" />
          </div>
        </div>
      </div>

      <div class="create-layout">
        <div class="matrix-card">
          <div class="mc-head">
            <span>策略选择和数量设定</span>
            <span class="mc-sub">每个内容方向会沿用单篇小红书图文的文案写法和配图设置</span>
            <a-button size="small" type="text" @click="loadStrategies"><ReloadOutlined /> 刷新</a-button>
          </div>
          <div class="mc-table">
            <div class="tr tr-head">
              <span class="c-check" />
              <span class="c-strategy">创作策略</span>
              <span class="c-dir">内容方向</span>
              <span class="c-img">配图方式</span>
              <span class="c-words">字数</span>
              <span class="c-count">数量</span>
            </div>
            <div v-for="row in matrix" :key="row.id" class="tr" :class="{ checked: row.checked }">
              <span class="c-check"><a-checkbox v-model:checked="row.checked" /></span>
              <span class="c-strategy">
                <div class="cs-name">{{ row.name }}</div>
                <div class="cs-desc">{{ row.description }}</div>
              </span>
              <span class="c-dir">
                <a-select
                  v-model:value="row.direction"
                  size="small"
                  style="width: 100%"
                  :options="row.directionOptions"
                  :disabled="!row.checked"
                />
              </span>
              <span class="c-img"><a-tag class="img-tag">精准编排</a-tag></span>
              <span class="c-words">
                <a-select v-model:value="row.wordCount" size="small" style="width: 100%" :options="WORD_OPTIONS" :disabled="!row.checked" />
              </span>
              <span class="c-count">
                <a-input-number v-model:value="row.count" size="small" :min="1" :max="20" :disabled="!row.checked" />
              </span>
            </div>
            <a-empty v-if="!matrix.length" :image="Empty.PRESENTED_IMAGE_SIMPLE" description="暂无启用的创作策略，请先到「创作策略Pro」创建" />
          </div>
        </div>

        <div class="overview-card">
          <div class="oc-title">生成概览</div>
          <div class="oc-sub">提交后进入后台并发队列，结果回到批量任务草稿</div>
          <div class="oc-row"><FileDoneOutlined /> 已选策略<b>{{ plannedStrategy }}</b></div>
          <div class="oc-row"><FileTextOutlined /> 计划生成<b>{{ plannedCount }} 篇</b></div>
          <div class="oc-row"><ClockCircleOutlined /> 预计耗时<b>约 {{ Math.max(1, Math.ceil(plannedCount * 8 / 60)) }} 分钟</b></div>
          <div class="oc-row"><ThunderboltOutlined /> 预计消耗<b class="oc-cost">⚡ {{ plannedCount }} 算力</b></div>
          <div class="oc-row"><GiftOutlined /> 产品<b>{{ productName || '未选择' }}</b></div>
          <div class="oc-row"><PictureOutlined /> 配图<b>精准编排</b></div>
          <div v-if="quota" class="oc-quota">当前可用 ⚡ {{ quotaText }}</div>
        </div>
      </div>

      <div class="bottom-bar">
        <span class="model-pill"><SettingOutlined /> 选择模型 · 智能模型</span>
        <a-button
          type="primary"
          size="large"
          class="start-btn"
          :disabled="!plannedCount || !productId"
          :loading="creating"
          @click="create"
        >
          <ThunderboltOutlined /> 开始任务
        </a-button>
      </div>
    </div>

    <!-- ── Tab2 批量任务结果 ─────────────────────────────────── -->
    <div v-else class="bt-result">
      <div class="res-toolbar">
        <a-radio-group v-model:value="resTab" button-style="solid" size="small" @change="loadResults">
          <a-radio-button value="pending">待处理 ({{ counts.pending }})</a-radio-button>
          <a-radio-button value="moved">已移入内容包 ({{ counts.moved }})</a-radio-button>
          <a-radio-button value="discarded">已废弃 ({{ counts.discarded }})</a-radio-button>
        </a-radio-group>
        <a-select
          v-model:value="taskFilter"
          size="small"
          style="width: 220px"
          :options="taskOptions"
          placeholder="全部任务"
          allow-clear
          @change="loadResults"
        />
        <a-button size="small" @click="loadResults"><ReloadOutlined /> 刷新列表</a-button>
        <div class="rt-spacer" />
        <template v-if="resTab === 'pending'">
          <a-button size="small" type="primary" :disabled="!selectedIds.length" :loading="moving" @click="openMoveModal(selectedIds)">
            批量入库
          </a-button>
          <a-popconfirm title="确定废弃选中的内容？" @confirm="doDiscard(selectedIds)">
            <a-button size="small" danger :disabled="!selectedIds.length">批量废弃</a-button>
          </a-popconfirm>
        </template>
      </div>

      <div class="res-layout">
        <div class="res-list">
          <div
            v-for="(item, i) in results"
            :key="item.id"
            class="rl-item"
            :class="{ selected: current?.id === item.id }"
            @click="currentIndex = i"
          >
            <a-checkbox
              v-if="resTab === 'pending'"
              :checked="selectedIds.includes(item.id)"
              @click.stop
              @change="toggleSelect(item.id)"
            />
            <img :src="item.img_list?.[0] ?? item.cover_url" class="rl-cover" @error="$event.target.style.visibility = 'hidden'" />
            <div class="rl-body">
              <div class="rl-title">{{ item.title }}</div>
              <div class="rl-meta">{{ fmtTime(item.upload_time) }}<a-tag v-if="item.strategy_name || item.direction_name" class="rl-tag" color="blue">{{ item.direction_name || item.strategy_name }}</a-tag></div>
            </div>
            <span class="rl-status" :class="statusClass(item)">{{ statusText(item) }}</span>
          </div>
          <a-empty v-if="!results.length" :image="Empty.PRESENTED_IMAGE_SIMPLE" description="暂无内容" />
          <div class="rl-page" v-if="total > pageSize">
            <a-pagination v-model:current="page" size="small" :total="total" :page-size="pageSize" :show-size-changer="false" @change="loadResults" />
          </div>
        </div>

        <div v-if="current" class="res-detail">
          <div class="rd-title">{{ current.title }}</div>
          <div class="rd-imgs">
            <img v-for="(img, i) in current.img_list ?? []" :key="i" :src="img" />
          </div>
          <div class="rd-content">{{ current.content }}</div>
          <div class="rd-tags">
            <span v-for="t in current.tags ?? []" :key="t" class="rd-tag">#{{ t }}</span>
          </div>
          <div class="rd-footer">
            <div class="rd-ops">
              <a-button v-if="resTab === 'pending'" size="small" @click="openEditModal(current)"><EditOutlined /> 编辑内容</a-button>
              <a-button v-if="resTab === 'pending'" size="small" type="primary" @click="openMoveModal([current.id])"><InboxOutlined /> 移入内容包</a-button>
              <a-popconfirm v-if="resTab === 'pending'" title="确定废弃这条内容？" @confirm="doDiscard([current.id])">
                <a-button size="small" danger><DeleteOutlined /> 废弃</a-button>
              </a-popconfirm>
              <a-button v-if="resTab === 'moved' && current.package_id" size="small" @click="goPackage(current.package_id)">
                查看内容包 <RightOutlined />
              </a-button>
            </div>
            <div class="rd-nav">
              <a-button size="small" :disabled="currentIndex <= 0" @click="currentIndex--"><LeftOutlined /> 上一个</a-button>
              <a-button size="small" :disabled="currentIndex >= results.length - 1" @click="currentIndex++">下一个 <RightOutlined /></a-button>
            </div>
          </div>
        </div>
        <div v-else class="res-empty">
          <a-empty :image="Empty.PRESENTED_IMAGE_SIMPLE" description="从左侧选择内容查看详情" />
        </div>
      </div>
    </div>

    <!-- 编辑内容 -->
    <a-modal v-model:open="editOpen" title="编辑内容" width="640px" :confirm-loading="saving" @ok="saveEdit">
      <div class="edit-form">
        <div class="ef-item"><label>标题</label><a-input v-model:value="editForm.title" :maxlength="30" show-count /></div>
        <div class="ef-item"><label>正文</label><a-textarea v-model:value="editForm.content" :rows="8" :maxlength="1000" show-count /></div>
        <div class="ef-item">
          <label>标签（逗号分隔）</label>
          <a-input v-model:value="editForm.tagsText" placeholder="标签1,标签2,标签3" />
        </div>
      </div>
    </a-modal>

    <!-- 移入内容包 -->
    <a-modal v-model:open="moveOpen" title="移动到内容包" width="520px" :confirm-loading="moving" @ok="confirmMove">
      <div class="move-tip">将选中的 {{ moveIds.length }} 篇内容移动到内容包。</div>
      <div class="move-warn">注意：移动后工作区内容将进入包内草稿，可在包内提交审核。</div>
      <div class="move-label"><span class="req">*</span> 选择目标内容包</div>
      <a-select
        v-model:value="moveTarget"
        style="width: 100%"
        show-search
        option-filter-prop="label"
        :options="packageOptions"
        placeholder="选择内容包"
      />
      <div class="move-new">
        <span>没有合适的？</span>
        <a-input v-model:value="newPackageName" size="small" style="width: 200px" placeholder="新内容包名称" :maxlength="30" />
        <a-button size="small" :loading="creatingPkg" @click="createPkgInline">新建内容包</a-button>
      </div>
    </a-modal>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { message, Empty } from 'ant-design-vue';
import {
  ReloadOutlined,
  SettingOutlined,
  ThunderboltOutlined,
  ClockCircleOutlined,
  FileTextOutlined,
  FileDoneOutlined,
  GiftOutlined,
  PictureOutlined,
  EditOutlined,
  DeleteOutlined,
  InboxOutlined,
  LeftOutlined,
  RightOutlined,
} from '@ant-design/icons-vue';
import { useAuthStore } from '../../stores/auth';
import { getProducts } from '../../api/content';
import {
  getStrategies,
  batchGenerate,
  getBatchTasks,
  getXhsHistory,
  updateHistoryContent,
  discardHistories,
  getQuota,
  getPackagesPro,
  createPackagePro,
  moveToPackage,
} from '../../api/contentpro';

const WORD_OPTIONS = [
  { value: '200-300', label: '200-300' },
  { value: '300-600', label: '300-600' },
  { value: '600-800', label: '600-800' },
];

const router = useRouter();
const auth = useAuthStore();
const brandId = computed(() => auth.currentBrandId ?? 1);

const tab = ref('create');
const quota = ref(null);
const quotaText = computed(() => (quota.value ? quota.value.available.toLocaleString() : '—'));

// ── 创作
const productOptions = ref([]);
const productId = ref(null);
const taskName = ref('');
const creating = ref(false);
const matrix = ref([]);

const productName = computed(() => productOptions.value.find((o) => o.value === productId.value)?.label ?? '');
const plannedCount = computed(() => matrix.value.filter((r) => r.checked).reduce((s, r) => s + (r.count ?? 0), 0));
const plannedStrategy = computed(() => matrix.value.filter((r) => r.checked).length);

const flattenProducts = (nodes, out = []) => {
  for (const n of nodes ?? []) {
    if (n.type === 'product') out.push({ value: n.id, label: n.display_name ?? n.name });
    flattenProducts(n.children, out);
  }
  return out;
};

const loadStrategies = async () => {
  const res = await getStrategies({ brandId: brandId.value });
  const list = (res?.list ?? []).filter((s) => s.enabled);
  matrix.value = list.map((s) =>
    reactive({
      id: s.id,
      name: s.name,
      description: s.description ?? '',
      checked: false,
      direction: s.content_directions?.[0]?.name ?? null,
      directionOptions: [
        { value: null, label: '不指定' },
        ...(s.content_directions ?? []).map((d) => ({ value: d.name, label: d.name })),
      ],
      wordCount: '200-300',
      count: 1,
    }),
  );
};

const loadProducts = async () => {
  const res = await getProducts({ brandId: brandId.value });
  productOptions.value = flattenProducts(res ?? []);
};

const create = async () => {
  if (!productId.value) return message.warning('请选择产品');
  const items = matrix.value
    .filter((r) => r.checked && r.count > 0)
    .map((r) => ({ strategyId: r.id, directionName: r.direction, count: r.count, wordCount: r.wordCount }));
  if (!items.length) return message.warning('请至少勾选一个创作策略');
  creating.value = true;
  try {
    const res = await batchGenerate(
      { productId: productId.value, taskName: taskName.value || undefined, items },
      { brandId: brandId.value },
    );
    message.success(`任务已创建：计划生成 ${res?.target_quantity ?? 0} 篇`);
    activeTaskId.value = res?.id;
    taskFilter.value = String(res?.id ?? '');
    switchTab('result');
    loadQuota();
  } catch (e) {
    message.error(e?.response?.data?.msg ?? '创建失败');
  } finally {
    creating.value = false;
  }
};

// ── 结果审核
const resTab = ref('pending');
const taskFilter = ref(null);
const activeTaskId = ref(null);
const results = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = 20;
const currentIndex = ref(-1);
const selectedIds = ref([]);
const counts = ref({ pending: 0, moved: 0, discarded: 0 });
const taskOptions = ref([]);
const moving = ref(false);

const current = computed(() => results.value[currentIndex.value] ?? null);

const statusText = (item) => {
  if (item.review_status === 'discarded') return '已废弃';
  if (item.package_id) {
    if (item.claimed_by_id) return '已被领用';
    const m = { draft: '包内草稿', pending: '待审核', approved: '过审待领用', rejected: '被驳回' };
    return m[item.review_status] ?? item.review_status;
  }
  return '待处理';
};
const statusClass = (item) => {
  if (item.review_status === 'discarded') return 'st-discarded';
  if (item.package_id) {
    if (item.claimed_by_id) return 'st-claimed';
    return { draft: 'st-pending', pending: 'st-audit', approved: 'st-approved', rejected: 'st-rejected' }[item.review_status] ?? 'st-pending';
  }
  return 'st-pending';
};

const listQuery = (extra = {}) => ({
  brandId: brandId.value,
  batchOnly: '1',
  pageSize: String(pageSize),
  page: String(page.value),
  ...extra,
});

const loadCounts = async () => {
  const base = taskFilter.value ? { batchTaskId: taskFilter.value } : {};
  const [p, m, d] = await Promise.all([
    getXhsHistory(listQuery({ ...base, reviewStatus: 'draft', unpackaged: '1', pageSize: '1' })),
    getXhsHistory(listQuery({ ...base, packaged: '1', reviewStatus: 'draft,pending,approved,rejected', pageSize: '1' })),
    getXhsHistory(listQuery({ ...base, reviewStatus: 'discarded', pageSize: '1' })),
  ]);
  counts.value.pending = p?.total ?? 0;
  counts.value.moved = m?.total ?? 0;
  counts.value.discarded = d?.total ?? 0;
};

const loadResults = async () => {
  const extra =
    resTab.value === 'moved'
      ? { packaged: '1', reviewStatus: 'draft,pending,approved,rejected' }
      : resTab.value === 'discarded'
        ? { reviewStatus: 'discarded' }
        : { reviewStatus: 'draft', unpackaged: '1' };
  if (taskFilter.value) extra.batchTaskId = taskFilter.value;
  const res = await getXhsHistory(listQuery(extra));
  results.value = res?.list ?? [];
  total.value = res?.total ?? 0;
  selectedIds.value = [];
  currentIndex.value = results.value.length ? 0 : -1;
  loadCounts();
};

const loadTasks = async () => {
  const res = await getBatchTasks({ brandId: brandId.value, page: 1, page_size: 50 });
  taskOptions.value = (res?.list ?? []).map((t) => ({
    value: String(t.id),
    label: `#${t.id} ${t.task_name}（${t.success_count}/${t.target_quantity}）`,
  }));
};

const switchTab = (t) => {
  tab.value = t;
  if (t === 'result') {
    page.value = 1;
    loadResults();
    loadTasks();
  }
};

const toggleSelect = (id) => {
  const i = selectedIds.value.indexOf(id);
  if (i >= 0) selectedIds.value.splice(i, 1);
  else selectedIds.value.push(id);
};

const fmtTime = (t) => (t ? new Date(t).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');

// ── 编辑
const editOpen = ref(false);
const saving = ref(false);
const editForm = reactive({ id: null, title: '', content: '', tagsText: '' });
const openEditModal = (item) => {
  Object.assign(editForm, {
    id: item.id,
    title: item.title,
    content: item.content,
    tagsText: (item.tags ?? []).join(','),
  });
  editOpen.value = true;
};
const saveEdit = async () => {
  saving.value = true;
  try {
    await updateHistoryContent(
      editForm.id,
      {
        title: editForm.title,
        content: editForm.content,
        tags: editForm.tagsText.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
      },
      { brandId: brandId.value },
    );
    message.success('已保存');
    editOpen.value = false;
    loadResults();
  } catch (e) {
    message.error(e?.response?.data?.msg ?? '保存失败');
  } finally {
    saving.value = false;
  }
};

// ── 移入内容包
const moveOpen = ref(false);
const moveIds = ref([]);
const moveTarget = ref(null);
const packageOptions = ref([]);
const newPackageName = ref('');
const creatingPkg = ref(false);

const loadPackages = async () => {
  const res = await getPackagesPro({ brandId: brandId.value });
  packageOptions.value = (res?.list ?? []).map((p) => ({ value: p.id, label: p.name }));
};
const openMoveModal = async (ids) => {
  if (!ids?.length) return message.warning('请先选择内容');
  moveIds.value = ids;
  moveTarget.value = null;
  newPackageName.value = '';
  await loadPackages();
  moveOpen.value = true;
};
const createPkgInline = async () => {
  if (!newPackageName.value.trim()) return message.warning('请输入新内容包名称');
  creatingPkg.value = true;
  try {
    const res = await createPackagePro({ name: newPackageName.value.trim() }, { brandId: brandId.value });
    await loadPackages();
    moveTarget.value = res?.id;
    message.success('内容包已创建');
  } catch (e) {
    message.error(e?.response?.data?.msg ?? '创建失败');
  } finally {
    creatingPkg.value = false;
  }
};
const confirmMove = async () => {
  if (!moveTarget.value) return message.warning('请选择目标内容包');
  moving.value = true;
  try {
    await moveToPackage(moveTarget.value, moveIds.value, { brandId: brandId.value });
    message.success(`已移入内容包（${moveIds.value.length} 篇）`);
    moveOpen.value = false;
    loadResults();
    loadQuota();
  } catch (e) {
    message.error(e?.response?.data?.msg ?? '移动失败');
  } finally {
    moving.value = false;
  }
};

const doDiscard = async (ids) => {
  try {
    const res = await discardHistories(ids, { brandId: brandId.value });
    message.success(`已废弃 ${res?.discarded ?? 0} 篇`);
    loadResults();
  } catch (e) {
    message.error(e?.response?.data?.msg ?? '废弃失败');
  }
};

const goPackage = (id) => router.push(`/content-pro/package/${id}`);

const loadQuota = async () => {
  try {
    const res = await getQuota({ brandId: brandId.value });
    quota.value = res.data;
  } catch {
    quota.value = null;
  }
};

onMounted(() => {
  loadProducts();
  loadStrategies();
  loadQuota();
});
</script>

<style scoped>
.batch-page {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}
.bt-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #02152f;
  border-radius: 10px;
  padding: 10px 16px;
}
.bt-tabs {
  display: flex;
  gap: 8px;
}
.bt-tabs button {
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.72);
  font-size: 14px;
  padding: 7px 18px;
  border-radius: 8px;
  cursor: pointer;
}
.bt-tabs button.active {
  background: rgba(80, 135, 236, 0.32);
  color: #fff;
  font-weight: 600;
}
.bt-right { display: flex; align-items: center; gap: 12px; }
.bt-quota {
  color: #ffd666;
  font-size: 13px;
  font-weight: 600;
}

/* ── 创作 ── */
.bt-create { display: flex; flex-direction: column; gap: 12px; margin-top: 12px; flex: 1; }
.form-card { background: #fff; border-radius: 12px; padding: 16px 18px; }
.fc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.fc-item { display: flex; flex-direction: column; gap: 6px; }
.fc-item label { font-size: 13px; color: #64748b; }
.req { color: #ff4d4f; margin-right: 2px; }

.create-layout { display: grid; grid-template-columns: 1fr 280px; gap: 12px; align-items: start; }
.matrix-card { background: #fff; border-radius: 12px; padding: 14px 16px; }
.mc-head { display: flex; align-items: center; gap: 10px; font-size: 15px; font-weight: 600; color: #1e293b; }
.mc-sub { font-size: 12px; color: #94a3b8; font-weight: 400; flex: 1; }
.mc-table { margin-top: 10px; }
.tr {
  display: grid;
  grid-template-columns: 36px minmax(180px, 1.4fr) minmax(150px, 1fr) 90px 100px 90px;
  gap: 10px;
  align-items: center;
  padding: 9px 6px;
  border-bottom: 1px solid #f1f5f9;
  border-radius: 6px;
}
.tr:not(.tr-head):hover { background: #f8fafc; }
.tr.checked { background: #f0f7ff; }
.tr-head {
  font-size: 12px;
  color: #94a3b8;
  background: #f8fafc;
  border-bottom: none;
  padding: 8px 6px;
}
.cs-name { font-size: 13px; color: #1e293b; font-weight: 500; }
.cs-desc {
  font-size: 12px;
  color: #94a3b8;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
}
.img-tag { background: #e6f7ff; color: #1677ff; border: none; border-radius: 4px; margin: 0; }

.overview-card {
  background: linear-gradient(160deg, #f0f5ff 0%, #ffffff 70%);
  border: 1px solid #dce6ff;
  border-radius: 12px;
  padding: 16px;
  position: sticky;
  top: 12px;
}
.oc-title { font-size: 15px; font-weight: 700; color: #1e293b; }
.oc-sub { font-size: 12px; color: #94a3b8; margin: 4px 0 12px; }
.oc-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 0;
  font-size: 13px;
  color: #64748b;
  border-bottom: 1px dashed #eef2f7;
}
.oc-row b { margin-left: auto; color: #1e293b; }
.oc-cost { color: #d97706 !important; }
.oc-quota { margin-top: 10px; font-size: 12px; color: #d97706; text-align: center; }

.bottom-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
  border-radius: 12px;
  padding: 10px 16px;
}
.model-pill {
  font-size: 13px;
  color: #475569;
  background: #f1f5f9;
  border-radius: 999px;
  padding: 6px 14px;
}
.start-btn { border-radius: 8px; padding: 0 34px; }

/* ── 结果 ── */
.bt-result { margin-top: 12px; display: flex; flex-direction: column; gap: 10px; flex: 1; }
.res-toolbar { display: flex; align-items: center; gap: 10px; }
.rt-spacer { flex: 1; }
.res-layout { display: grid; grid-template-columns: 380px 1fr; gap: 10px; align-items: start; flex: 1; }
.res-list {
  background: #fff;
  border-radius: 12px;
  padding: 8px;
  max-height: calc(100vh - 220px);
  overflow-y: auto;
}
.rl-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: 8px;
  cursor: pointer;
  border: 1px solid transparent;
}
.rl-item:hover { background: #f8fafc; }
.rl-item.selected { background: #f0f7ff; border-color: #5087ec; }
.rl-cover {
  width: 44px;
  height: 44px;
  border-radius: 6px;
  object-fit: cover;
  background: #f1f5f9;
  flex-shrink: 0;
}
.rl-body { flex: 1; min-width: 0; }
.rl-title {
  font-size: 13px;
  color: #1e293b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rl-meta { font-size: 12px; color: #94a3b8; display: flex; align-items: center; gap: 6px; }
.rl-tag { font-size: 11px; line-height: 16px; padding: 0 5px; margin: 0; border-radius: 4px; }
.rl-status { font-size: 12px; padding: 2px 8px; border-radius: 999px; flex-shrink: 0; }
.st-pending { background: #fff7e6; color: #d97706; }
.st-audit { background: #e6f7ff; color: #1677ff; }
.st-approved { background: #f0fdf4; color: #16a34a; }
.st-rejected { background: #fef2f2; color: #dc2626; }
.st-claimed { background: #eef4ff; color: #3456e6; }
.st-discarded { background: #f1f5f9; color: #94a3b8; }
.rl-page { padding: 8px 0 2px; display: flex; justify-content: center; }

.res-detail {
  background: #fff;
  border-radius: 12px;
  padding: 18px 20px;
  max-height: calc(100vh - 220px);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
.rd-title { font-size: 17px; font-weight: 700; color: #1e293b; }
.rd-imgs { display: flex; gap: 8px; margin: 12px 0; flex-wrap: wrap; }
.rd-imgs img { width: 108px; height: 144px; object-fit: cover; border-radius: 8px; background: #f1f5f9; }
.rd-content { white-space: pre-wrap; font-size: 13px; color: #334155; line-height: 1.8; }
.rd-tags { margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap; }
.rd-tag { color: #3456e6; font-size: 13px; }
.rd-footer {
  margin-top: auto;
  padding-top: 14px;
  border-top: 1px solid #f1f5f9;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.rd-ops { display: flex; gap: 8px; }
.rd-nav { display: flex; gap: 8px; }
.res-empty {
  background: #fff;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 300px;
}

/* ── 弹窗 ── */
.edit-form { display: flex; flex-direction: column; gap: 12px; }
.ef-item { display: flex; flex-direction: column; gap: 6px; }
.ef-item label { font-size: 13px; color: #64748b; }
.move-tip { font-size: 13px; color: #334155; }
.move-warn { font-size: 12px; color: #d97706; margin: 6px 0 12px; }
.move-label { font-size: 13px; color: #64748b; margin-bottom: 6px; }
.move-new { display: flex; align-items: center; gap: 8px; margin-top: 12px; font-size: 12px; color: #94a3b8; }

@media (max-width: 991px) {
  .create-layout { grid-template-columns: 1fr; }
  .res-layout { grid-template-columns: 1fr; }
  .fc-grid { grid-template-columns: 1fr; }
  .tr { grid-template-columns: 32px 1fr 110px 90px; }
  .c-img, .c-words { display: none; }
}
</style>
