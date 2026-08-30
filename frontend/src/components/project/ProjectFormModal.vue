<template>
  <a-modal
    :open="open"
    :title="isEdit ? '编辑项目' : '新建项目'"
    :confirm-loading="submitting"
    :width="640"
    ok-text="保存"
    cancel-text="取消"
    @ok="handleOk"
    @cancel="$emit('update:open', false)"
  >
    <a-form
      ref="formRef"
      :model="form"
      :rules="rules"
      layout="vertical"
      style="margin-top: 16px"
    >
      <a-row :gutter="16">
        <a-col :span="12">
          <a-form-item label="项目名称" name="name">
            <a-input
              v-model:value="form.name"
              placeholder="请输入项目名称"
              :maxlength="100"
            />
          </a-form-item>
        </a-col>
        <a-col :span="12">
          <a-form-item label="客户名称" name="clientName">
            <a-input
              v-model:value="form.clientName"
              placeholder="请输入客户名称"
              :maxlength="100"
            />
          </a-form-item>
        </a-col>
      </a-row>

      <a-row :gutter="16">
        <a-col :span="12">
          <a-form-item label="所属文件夹" name="folderId">
            <a-tree-select
              v-model:value="form.folderId"
              :tree-data="folderTreeData"
              placeholder="选择文件夹（可不选）"
              allow-clear
              tree-default-expand-all
              :field-names="{ label: 'name', value: 'id', children: 'children' }"
            />
          </a-form-item>
        </a-col>
        <a-col :span="12">
          <a-form-item label="项目负责人" name="ownerId">
            <a-select
              v-model:value="form.ownerId"
              :options="memberOptions"
              placeholder="选择负责人"
            />
          </a-form-item>
        </a-col>
      </a-row>

      <a-row :gutter="16">
        <a-col :span="12">
          <a-form-item label="项目周期" name="range">
            <a-range-picker
              v-model:value="form.range"
              style="width: 100%"
              value-format="YYYY-MM-DD"
            />
          </a-form-item>
        </a-col>
        <a-col :span="12">
          <a-form-item label="项目阶段" name="phase">
            <a-select v-model:value="form.phase" :options="phaseOptions" />
          </a-form-item>
        </a-col>
      </a-row>

      <a-row :gutter="16">
        <a-col :span="12">
          <a-form-item label="总预算（元）" name="budgetTotal">
            <a-input-number
              v-model:value="form.budgetTotal"
              :min="0"
              :precision="2"
              style="width: 100%"
              placeholder="0.00"
            />
          </a-form-item>
        </a-col>
        <a-col :span="12">
          <a-form-item label="状态" name="status">
            <a-select
              v-model:value="form.status"
              :options="statusOptions"
              :disabled="isEdit && form.status === 'archived'"
            />
          </a-form-item>
        </a-col>
      </a-row>

      <a-form-item label="项目描述" name="description">
        <a-textarea
          v-model:value="form.description"
          :rows="3"
          :maxlength="500"
          show-count
          placeholder="项目背景、目标、交付要求等"
        />
      </a-form-item>
    </a-form>
  </a-modal>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';
import dayjs from 'dayjs';
import { message } from 'ant-design-vue';
import { createProject, updateProject } from '../../api/project';

const props = defineProps({
  open: { type: Boolean, default: false },
  project: { type: Object, default: null },
  folders: { type: Array, default: () => [] },
  members: { type: Array, default: () => [] },
  defaultOwnerId: { type: Number, default: null },
});

const emit = defineEmits(['update:open', 'saved']);

const formRef = ref();
const submitting = ref(false);

const isEdit = computed(() => !!props.project?.id);

const emptyForm = () => ({
  name: '',
  clientName: '',
  folderId: null,
  ownerId: props.defaultOwnerId,
  range: null,
  phase: 'planning',
  status: 'draft',
  budgetTotal: 0,
  description: '',
});

const form = reactive(emptyForm());

const rules = {
  name: [{ required: true, message: '请输入项目名称' }],
};

const phaseOptions = [
  { label: '筹备中', value: 'planning' },
  { label: '执行中', value: 'executing' },
  { label: '验收中', value: 'accepting' },
  { label: '已结项', value: 'closed' },
];

const statusOptions = [
  { label: '草稿', value: 'draft' },
  { label: '进行中', value: 'active' },
  { label: '已归档', value: 'archived' },
];

const folderTreeData = computed(() => [
  ...(props.folders ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    children: (f.children ?? []).map((c) => ({
      id: c.id,
      name: c.name,
    })),
  })),
]);

const memberOptions = computed(() =>
  props.members.map((m) => ({ label: m.nickname, value: m.id })),
);

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    Object.assign(form, emptyForm());
    if (props.project?.id) {
      form.name = props.project.name;
      form.clientName = props.project.client_name ?? '';
      form.folderId = props.project.folder_id ?? null;
      form.ownerId = props.project.owner_user_id;
      form.phase = props.project.phase;
      form.status = props.project.status;
      form.budgetTotal = props.project.budget_total;
      form.description = props.project.description ?? '';
      if (props.project.start_date && props.project.end_date) {
        form.range = [
          dayjs(props.project.start_date).format('YYYY-MM-DD'),
          dayjs(props.project.end_date).format('YYYY-MM-DD'),
        ];
      }
    }
  },
);

async function handleOk() {
  try {
    await formRef.value.validate();
  } catch {
    return;
  }
  submitting.value = true;
  try {
    const payload = {
      name: form.name,
      clientName: form.clientName || null,
      folderId: form.folderId ?? null,
      ownerId: form.ownerId,
      phase: form.phase,
      status: form.status,
      budgetTotal: form.budgetTotal ?? 0,
      description: form.description || null,
      startDate: form.range?.[0] ?? null,
      endDate: form.range?.[1] ?? null,
    };
    if (isEdit.value) {
      await updateProject(props.project.id, payload);
      message.success('项目已更新');
    } else {
      await createProject(payload);
      message.success('项目已创建');
    }
    emit('update:open', false);
    emit('saved');
  } catch (e) {
    message.error(e.message || '保存失败');
  } finally {
    submitting.value = false;
  }
}
</script>
