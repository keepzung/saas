<template>
  <PageWrapper title="报告中心" subtitle="监测报告上传与分享管理">
    <template #extra>
      <a-button type="primary" size="small" @click="createOpen = true">
        <PlusOutlined /> 上传报告
      </a-button>
    </template>

    <a-card :bordered="false">
      <a-table
        :columns="columns"
        :data-source="list"
        :loading="loading"
        :pagination="false"
        row-key="id"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <FileTextOutlined class="file-icon" />
            <a @click="download(record)">{{ record.name }}</a>
          </template>
          <template v-else-if="column.key === 'access'">
            <a-tag :color="accessColor[record.access]">
              {{ accessLabel[record.access] }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'file_size'">
            {{ (record.file_size / 1024 / 1024).toFixed(1) }} MB
          </template>
          <template v-else-if="column.key === 'actions'">
            <a @click="download(record)">下载</a>
            <a-divider type="vertical" />
            <a-popconfirm
              title="确认删除该报告？删除后分享链接将失效。"
              @confirm="removeReport(record)"
            >
              <a class="danger">删除</a>
            </a-popconfirm>
          </template>
        </template>
      </a-table>
    </a-card>

    <a-modal
      v-model:open="createOpen"
      title="上传报告"
      :confirm-loading="creating"
      @ok="saveCreate"
    >
      <a-form layout="vertical" style="margin-top: 12px">
        <a-form-item label="报告名称" required>
          <a-input v-model:value="form.name" placeholder="如：华帝品牌监测周报 W35" />
        </a-form-item>
        <a-form-item label="报告所属周期" required>
          <a-input v-model:value="form.period" placeholder="如：2026-08 W35" />
        </a-form-item>
        <a-form-item label="访问保护方式">
          <a-radio-group v-model:value="form.access">
            <a-radio value="public">公开访问</a-radio>
            <a-radio value="password">密码保护</a-radio>
            <a-radio value="private">仅内部</a-radio>
          </a-radio-group>
        </a-form-item>
        <a-form-item label="报告文件">
          <a-upload :before-upload="() => false" :max-count="1">
            <a-button><UploadOutlined /> 选择文件（演示，不实际上传）</a-button>
          </a-upload>
        </a-form-item>
      </a-form>
    </a-modal>
  </PageWrapper>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { message } from 'ant-design-vue';
import {
  FileTextOutlined,
  PlusOutlined,
  UploadOutlined,
} from '@ant-design/icons-vue';
import dayjs from 'dayjs';
import PageWrapper from '../../components/PageWrapper.vue';
import {
  createInsightReport,
  deleteInsightReport,
  getInsightReports,
} from '../../api/insight';

const accessLabel = { public: '公开', password: '密码', private: '内部' };
const accessColor = { public: 'green', password: 'orange', private: 'red' };

const columns = [
  { key: 'name', title: '报告名称' },
  { title: '报告所属周期', dataIndex: 'period', width: 150 },
  { key: 'access', title: '访问保护方式', width: 130 },
  { key: 'file_size', title: '大小', width: 100 },
  { title: '上传时间', dataIndex: 'created_at', width: 160 },
  { key: 'actions', title: '操作', width: 150 },
];

const list = ref([]);
const loading = ref(false);
const createOpen = ref(false);
const creating = ref(false);
const form = reactive({ name: '', period: '', access: 'public' });

async function reload() {
  loading.value = true;
  try {
    const res = await getInsightReports();
    list.value = res.list.map((r) => ({
      ...r,
      created_at: dayjs(r.created_at).format('YYYY-MM-DD HH:mm'),
    }));
  } catch (e) {
    message.error(e.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

async function saveCreate() {
  if (!form.name.trim() || !form.period.trim()) {
    message.warning('请填写报告名称与周期');
    return;
  }
  creating.value = true;
  try {
    await createInsightReport({ ...form });
    message.success('报告已上传');
    createOpen.value = false;
    Object.assign(form, { name: '', period: '', access: 'public' });
    reload();
  } catch (e) {
    message.error(e.message || '上传失败');
  } finally {
    creating.value = false;
  }
}

function download(record) {
  const blob = new Blob(
    [`品牌洞察报告（演示）：${record.name}\n周期：${record.period}\n`],
    { type: 'text/plain' },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${record.name}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

async function removeReport(record) {
  try {
    await deleteInsightReport(record.id);
    message.success('已删除');
    reload();
  } catch (e) {
    message.error(e.message || '删除失败');
  }
}

onMounted(reload);
</script>

<style scoped>
.file-icon {
  margin-right: 8px;
  color: var(--color-primary);
}

.danger {
  color: var(--color-error);
}
</style>
