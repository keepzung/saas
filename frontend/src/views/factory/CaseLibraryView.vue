<template>
  <PageWrapper title="案例库">
    <template #extra>
      <a-button size="small" @click="load"><ReloadOutlined /> 刷新</a-button>
    </template>
    <a-tabs v-model:activeKey="category" @change="load">
      <a-tab-pane key="all" tab="全部" />
      <a-tab-pane key="hot" tab="爆款案例" />
      <a-tab-pane key="breakdown" tab="拆解归档" />
      <a-tab-pane key="competitor" tab="竞品动态" />
    </a-tabs>
    <div class="cs-toolbar">
      <a-button type="primary" size="small" @click="openForm()">
        <PlusOutlined /> 手工录入案例
      </a-button>
      <span class="cs-hint">灵感引擎的爆款可在内容池页一键收藏入此案例库</span>
    </div>
    <a-table
      :columns="columns"
      :data-source="list"
      row-key="id"
      size="small"
      :pagination="{ pageSize: 10, showSizeChanger: false }"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'title'">
          <span class="cs-title">{{ record.title }}</span>
          <div class="cs-summary">{{ record.summary }}</div>
        </template>
        <template v-else-if="column.key === 'category'">
          <a-tag :color="{ hot: 'red', breakdown: 'purple', competitor: 'blue' }[record.category] ?? 'default'">
            {{ { hot: '爆款案例', breakdown: '拆解归档', competitor: '竞品动态' }[record.category] ?? record.category }}
          </a-tag>
        </template>
        <template v-else-if="column.key === 'platform'">
          {{ (record.platform ?? '').toUpperCase() || '-' }}
        </template>
        <template v-else-if="column.key === 'structure'">
          <a-button v-if="record.structureJson" size="small" type="text" @click="showStructure(record)">
            查看拆解
          </a-button>
          <span v-else>-</span>
        </template>
        <template v-else-if="column.key === 'ops'">
          <a-space>
            <a-button size="small" type="text" @click="openForm(record)">编辑</a-button>
            <a-button size="small" type="text" danger @click="onDelete(record)">删除</a-button>
          </a-space>
        </template>
      </template>
    </a-table>

    <a-drawer
      v-model:open="formOpen"
      :title="form.id ? '编辑案例' : '录入案例'"
      :width="520"
      destroy-on-close
    >
      <a-form layout="vertical">
        <a-form-item label="案例标题" required>
          <a-input v-model:value="form.title" :maxlength="60" placeholder="如：某车型周未试驾爆款笔记拆解" />
        </a-form-item>
        <a-form-item label="类别">
          <a-select v-model:value="form.category">
            <a-select-option value="hot">爆款案例</a-select-option>
            <a-select-option value="breakdown">拆解归档</a-select-option>
            <a-select-option value="competitor">竞品动态</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="平台">
          <a-select v-model:value="form.platform" allow-clear placeholder="可选">
            <a-select-option value="xhs">小红书</a-select-option>
            <a-select-option value="douyin">抖音</a-select-option>
            <a-select-option value="bilibili">B站</a-select-option>
            <a-select-option value="zhihu">知乎</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="摘要/要点">
          <a-textarea v-model:value="form.summary" :rows="4" placeholder="钩子、结构亮点、可复用的点" />
        </a-form-item>
        <a-form-item label="标签">
          <a-select v-model:value="form.tags" mode="tags" placeholder="回车添加标签" />
        </a-form-item>
      </a-form>
      <template #footer>
        <a-space>
          <a-button @click="formOpen = false">取消</a-button>
          <a-button type="primary" :loading="saving" @click="save">保存</a-button>
        </a-space>
      </template>
    </a-drawer>

    <a-modal v-model:open="structureOpen" title="拆解结构" :footer="null" width="640px">
      <pre class="cs-structure">{{ structureText }}</pre>
    </a-modal>
  </PageWrapper>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { message } from 'ant-design-vue';
import { ReloadOutlined, PlusOutlined } from '@ant-design/icons-vue';
import PageWrapper from '../../components/PageWrapper.vue';
import { useAuthStore } from '../../stores/auth';
import {
  getKnowledgeCases,
  createKnowledgeCase,
  updateKnowledgeCase,
  deleteKnowledgeCases,
} from '../../api/contentpro';

const auth = useAuthStore();
const brandId = computed(() => auth.currentBrandId ?? 1);

const columns = [
  { key: 'title', title: '案例', width: '46%' },
  { key: 'category', title: '类别', width: 100 },
  { key: 'platform', title: '平台', width: 80 },
  { key: 'structure', title: '拆解', width: 90 },
  { key: 'ops', title: '操作', width: 120 },
];

const list = ref([]);
const formOpen = ref(false);
const saving = ref(false);
const structureOpen = ref(false);
const structureText = ref('');
const emptyForm = () => ({
  id: null,
  title: '',
  category: 'hot',
  platform: null,
  summary: '',
  tags: [],
});
const form = ref(emptyForm());

const load = async () => {
  const params = { brandId: brandId.value };
  if (category.value !== 'all') params.category = category.value;
  const data = await getKnowledgeCases(params);
  list.value = data?.list ?? [];
};

const openForm = (row) => {
  form.value = row
    ? { id: row.id, title: row.title, category: row.category, platform: row.platform, summary: row.summary ?? '', tags: [...(row.tags ?? [])] }
    : emptyForm();
  formOpen.value = true;
};

const showStructure = (row) => {
  structureText.value = JSON.stringify(row.structureJson, null, 2);
  structureOpen.value = true;
};

const save = async () => {
  if (!form.value.title.trim()) {
    message.warning('请填写案例标题');
    return;
  }
  saving.value = true;
  try {
    if (form.value.id) {
      await updateKnowledgeCase(form.value.id, form.value);
    } else {
      await createKnowledgeCase(form.value, { brandId: brandId.value });
    }
    message.success('已保存');
    formOpen.value = false;
    await load();
  } finally {
    saving.value = false;
  }
};

const onDelete = (row) => {
  deleteKnowledgeCases([row.id]).then(() => {
    message.success('已删除');
    load();
  });
};

onMounted(load);
</script>

<style scoped>
.cs-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.cs-hint {
  color: #999;
  font-size: 12px;
}
.cs-title {
  font-weight: 600;
}
.cs-summary {
  color: #999;
  font-size: 12px;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 380px;
}
.cs-structure {
  white-space: pre-wrap;
  font-size: 12px;
  max-height: 60vh;
  overflow: auto;
}
</style>
