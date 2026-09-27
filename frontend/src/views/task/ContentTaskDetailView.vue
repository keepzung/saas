<template>
  <PageWrapper :title="task?.name ?? '任务详情'">
    <template #extra>
      <a-space>
        <span class="tstatus" :class="task?.effective_status">{{ statusLabel(task?.effective_status) }}</span>
        <a-button @click="$router.push('/kox_task/content-task/task-list')">返回列表</a-button>
      </a-space>
    </template>

    <div class="td-body">
      <a-spin :spinning="loading">
        <div class="stat-grid">
          <div class="stat-card">
            <div class="num">{{ task?.account_total ?? 0 }}</div>
            <div class="lab">参与账号</div>
          </div>
          <div class="stat-card">
            <div class="num done">{{ task?.account_finished ?? 0 }}</div>
            <div class="lab">有产出账号</div>
          </div>
          <div class="stat-card">
            <div class="num">{{ task?.note_total ?? 0 }}</div>
            <div class="lab">任务期笔记</div>
          </div>
          <div class="stat-card">
            <div class="num done">{{ task?.completion_rate ?? 0 }}%</div>
            <div class="lab">完成度</div>
          </div>
        </div>

        <div class="info-card">
          <div class="info-row"><span>任务平台</span>{{ platformLabel(task?.platform) }}</div>
          <div class="info-row"><span>参与团队</span>{{ task?.scope_type === 'regions' ? (task?.regions ?? []).join('、') : '全部大区' }}</div>
          <div class="info-row"><span>账号类型</span>{{ (task?.account_types ?? []).length ? task.account_types.join(' / ') : '不限' }}</div>
          <div class="info-row"><span>任务时间</span>{{ fmt(task?.start_time) }} 至 {{ fmt(task?.end_time) }}</div>
          <div class="info-row" v-if="task?.example_link"><span>示例内容</span><a :href="task.example_link" target="_blank">{{ task.example_link }}</a></div>
          <div class="info-row" v-if="task?.instructions"><span>任务说明</span><div class="pre">{{ task.instructions }}</div></div>
          <div class="info-row" v-if="task?.reward"><span>奖励机制</span><div class="pre">{{ task.reward }}</div></div>
          <div class="info-row" v-if="task?.example_images?.length">
            <span>示例图片</span>
            <div class="imgs"><img v-for="u in task.example_images" :key="u" :src="u" /></div>
          </div>
        </div>

        <div class="acc-card">
          <div class="acc-head">
            <span class="acc-title">参与账号进度</span>
            <a-button size="small" @click="exportRows"><DownloadOutlined /> 导出明细</a-button>
          </div>
          <a-table
            :data-source="task?.accounts ?? []"
            row-key="account_id"
            size="small"
            :pagination="{ pageSize: 15, showTotal: (n) => `共 ${n} 条` }"
            :columns="columns"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'finished'">
                <a-tag :color="record.finished ? 'success' : 'default'">{{ record.finished ? '完成' : '未完成' }}</a-tag>
              </template>
            </template>
          </a-table>
        </div>
      </a-spin>
    </div>
  </PageWrapper>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { message } from 'ant-design-vue';
import { DownloadOutlined } from '@ant-design/icons-vue';
import PageWrapper from '../../components/PageWrapper.vue';
import { useAuthStore } from '../../stores/auth';
import { getContentTaskDetail } from '../../api/contentpro';
import { exportExcel } from '../../utils/excel';

const route = useRoute();
const auth = useAuthStore();
const brandId = computed(() => auth.currentBrandId ?? 1);

const task = ref(null);
const loading = ref(false);

const columns = [
  { title: '账号昵称', dataIndex: 'nickname' },
  { title: '账号类型', dataIndex: 'account_type', width: 90 },
  { title: '大区', dataIndex: 'region', width: 110 },
  { title: '门店', dataIndex: 'store', width: 200 },
  { title: '任务期笔记数', dataIndex: 'note_count', width: 110 },
  { title: '完成状态', key: 'finished', width: 90 },
];

const statusLabel = (s) => ({ active: '进行中', expired: '已截止', voided: '已作废' }[s] ?? s ?? '');
const platformLabel = (p) => ({ xhs: '小红书', douyin: '抖音' }[p] ?? p);
const fmt = (s) => (s ? new Date(s).toLocaleDateString('zh-CN').replaceAll('/', '-') : '-');

const exportRows = () => {
  const rows = (task.value?.accounts ?? []).map((a, i) => ({
    序号: i + 1,
    账号昵称: a.nickname,
    账号类型: a.account_type,
    大区: a.region ?? '',
    门店: a.store ?? '',
    任务期笔记数: a.note_count,
    是否完成: a.finished ? '完成' : '未完成',
  }));
  exportExcel([{ name: '账号进度', rows }], `任务-${task.value?.name ?? '详情'}`);
  message.success('已导出');
};

onMounted(async () => {
  loading.value = true;
  try {
    task.value = await getContentTaskDetail(Number(route.query.id), { brandId: brandId.value });
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.tstatus {
  font-size: 13px;
}

.tstatus.active {
  color: #16a34a;
}

.tstatus.expired {
  color: #d97706;
}

.tstatus.voided {
  color: #dc2626;
}

.td-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 14px;
}

.stat-card {
  background: #fff;
  border-radius: 16px;
  padding: 18px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.num {
  font-size: 26px;
  font-weight: 800;
  color: #1e293b;
  font-variant-numeric: tabular-nums;
}

.num.done {
  color: #16a34a;
}

.lab {
  margin-top: 2px;
  color: #64748b;
  font-size: 12.5px;
}

.info-card,
.acc-card {
  background: #fff;
  border-radius: 16px;
  padding: 18px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.info-row {
  display: flex;
  gap: 12px;
  padding: 7px 0;
  color: #334155;
  font-size: 13px;
  border-bottom: 1px dashed #f1f5f9;
}

.info-row:last-child {
  border-bottom: none;
}

.info-row span {
  flex: 0 0 80px;
  color: #94a3b8;
}

.pre {
  white-space: pre-wrap;
}

.imgs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.imgs img {
  width: 80px;
  height: 80px;
  object-fit: cover;
  border-radius: 8px;
}

.acc-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.acc-title {
  font-weight: 600;
  color: #1e293b;
}
</style>
