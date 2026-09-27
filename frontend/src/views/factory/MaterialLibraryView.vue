<template>
  <PageWrapper title="素材库">
    <FilterTopbar>
      <a-select
        v-model:value="filterType"
        style="width: 140px"
        placeholder="按素材类型筛选"
        allow-clear
        :options="typeOptions"
      />
      <a-select
        v-model:value="filterSet"
        style="width: 140px"
        placeholder="按套图筛选"
        allow-clear
        :options="setOptions"
      />
      <a-input-search
        v-model:value="keyword"
        style="width: 200px"
        placeholder="搜索图片名称"
        allow-clear
        @search="load"
      />
      <a-checkbox v-model:checked="onlyUnassigned" style="margin-left: 8px">未分类</a-checkbox>
    </FilterTopbar>

    <div class="mat-body">
      <div class="mat-toolbar">
        <a-checkbox
          :checked="allChecked"
          :indeterminate="checked.length > 0 && !allChecked"
          @change="toggleAll"
        >全选</a-checkbox>
        <span class="mat-count">已选择 {{ checked.length }}</span>
        <a-button size="small" @click="load"><ReloadOutlined /> 刷新</a-button>
        <a-button size="small" danger :disabled="!checked.length" @click="batchDelete">
          <DeleteOutlined /> 批量删除
        </a-button>
        <a-button size="small" :disabled="!checked.length" @click="assignOpen = true">
          批量设置类型/套图
        </a-button>
        <div class="mat-toolbar-right">
          <a-upload
            :show-upload-list="false"
            :before-upload="onUpload"
            accept=".png,.jpg,.jpeg,.webp"
            multiple
          >
            <a-button type="primary" size="small" :loading="uploading">
              <UploadOutlined /> 上传产品素材
            </a-button>
          </a-upload>
          <a-button size="small" @click="importOpen = true"><LinkOutlined /> URL 导入</a-button>
          <a-button size="small" @click="manageOpen = true"><TagsOutlined /> 标签/套图管理</a-button>
        </div>
      </div>

      <a-spin :spinning="loading">
        <div v-if="list.length" class="img-grid">
          <div
            v-for="img in list"
            :key="img.id"
            class="img-cell"
            :class="{ checked: checked.includes(img.id) }"
            @click="toggleCheck(img.id)"
          >
            <a-checkbox :checked="checked.includes(img.id)" class="img-check" @click.stop @change="toggleCheck(img.id)" />
            <img :src="img.url" loading="lazy" class="img-thumb" />
            <div class="img-tags">
              <a-tag v-if="img.set_name" class="img-tag set">{{ img.set_name }}</a-tag>
              <a-tag v-if="img.type_name" class="img-tag type">{{ img.type_name }}</a-tag>
            </div>
          </div>
        </div>
        <a-empty v-else-if="!loading" description="暂无素材，点击右上角「上传产品素材」或「URL 导入」添加" class="mat-empty" />
      </a-spin>

      <div class="mat-footer">
        <a-pagination
          v-model:current="page"
          v-model:page-size="pageSize"
          :total="total"
          :page-size-options="['30', '50', '100']"
          show-size-changer
          @change="load"
        />
      </div>
    </div>

    <!-- 标签/套图管理 -->
    <a-modal v-model:open="manageOpen" title="标签/套图管理" :footer="null" width="680px">
      <a-tabs v-model:activeKey="manageTab">
        <a-tab-pane key="type" tab="素材类型标签">
          <div class="manage-row" v-for="t in tags" :key="t.id">
            <a-input v-model:value="t.name" size="small" style="width: 180px" />
            <span class="manage-count">{{ t.image_count }} 张</span>
            <a-button size="small" type="link" @click="saveTag(t)">保存</a-button>
            <a-button size="small" type="link" danger @click="removeTag(t)">删除</a-button>
          </div>
          <div class="manage-row">
            <a-input v-model:value="newTagName" size="small" style="width: 180px" placeholder="新标签名称" />
            <a-button size="small" type="primary" @click="addTag">新增标签</a-button>
          </div>
        </a-tab-pane>
        <a-tab-pane key="set" tab="套图">
          <div class="manage-row" v-for="s in sets" :key="s.id">
            <a-input v-model:value="s.name" size="small" style="width: 180px" />
            <span class="manage-count">{{ s.image_count }} 张</span>
            <a-button size="small" type="link" @click="saveSet(s)">保存</a-button>
            <a-button size="small" type="link" danger @click="removeSet(s)">删除</a-button>
          </div>
          <div class="manage-row">
            <a-input v-model:value="newSetName" size="small" style="width: 180px" placeholder="新套图名称（如 外-波尔多紫）" />
            <a-button size="small" type="primary" @click="addSet">新增套图</a-button>
          </div>
        </a-tab-pane>
      </a-tabs>
    </a-modal>

    <!-- 批量设置 -->
    <a-modal v-model:open="assignOpen" title="批量设置类型/套图" @ok="doAssign">
      <div class="assign-row">
        <span class="assign-label">素材类型</span>
        <a-select v-model:value="assignType" style="width: 200px" allow-clear placeholder="不修改" :options="typeOptions" />
      </div>
      <div class="assign-row">
        <span class="assign-label">所属套图</span>
        <a-select v-model:value="assignSet" style="width: 200px" allow-clear placeholder="不修改" :options="setOptions" />
      </div>
    </a-modal>

    <!-- URL 导入 -->
    <a-modal v-model:open="importOpen" title="URL 导入素材" @ok="doImport">
      <a-textarea v-model:value="importText" :rows="6" placeholder="每行一个图片 URL（http/https）" />
    </a-modal>
  </PageWrapper>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { message, Modal } from 'ant-design-vue';
import {
  ReloadOutlined,
  DeleteOutlined,
  UploadOutlined,
  LinkOutlined,
  TagsOutlined,
} from '@ant-design/icons-vue';
import PageWrapper from '../../components/PageWrapper.vue';
import FilterTopbar from '../../components/FilterTopbar.vue';
import { useAuthStore } from '../../stores/auth';
import {
  getMaterialTags,
  createMaterialTag,
  updateMaterialTag,
  deleteMaterialTags,
  getMaterialSets,
  createMaterialSet,
  updateMaterialSet,
  deleteMaterialSets,
  getMaterialImages,
  importMaterialImages,
  assignMaterialImages,
  deleteMaterialImages,
  uploadMaterialImage,
} from '../../api/contentpro';

const auth = useAuthStore();
const brandId = computed(() => auth.currentBrandId ?? 1);

const list = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(30);
const loading = ref(false);
const checked = ref([]);
const keyword = ref('');
const filterType = ref(null);
const filterSet = ref(null);
const onlyUnassigned = ref(false);
const uploading = ref(false);

const tags = ref([]);
const sets = ref([]);
const manageOpen = ref(false);
const manageTab = ref('type');
const newTagName = ref('');
const newSetName = ref('');

const assignOpen = ref(false);
const assignType = ref(undefined);
const assignSet = ref(undefined);
const importOpen = ref(false);
const importText = ref('');

const typeOptions = computed(() => tags.value.map((t) => ({ label: t.name, value: t.id })));
const setOptions = computed(() => sets.value.map((s) => ({ label: s.name, value: s.id })));
const allChecked = computed(() => list.value.length > 0 && checked.value.length === list.value.length);

const loadMeta = async () => {
  const [t, s] = await Promise.all([
    getMaterialTags({ brandId: brandId.value }),
    getMaterialSets({ brandId: brandId.value }),
  ]);
  tags.value = t?.list ?? [];
  sets.value = s?.list ?? [];
};

const load = async () => {
  loading.value = true;
  checked.value = [];
  try {
    const data = await getMaterialImages({
      brandId: brandId.value,
      page: page.value,
      pageSize: pageSize.value,
      keyword: keyword.value || undefined,
      typeId: filterType.value ?? undefined,
      setId: filterSet.value ?? undefined,
      unassigned: onlyUnassigned.value ? '1' : undefined,
    });
    list.value = data?.list ?? [];
    total.value = data?.total ?? 0;
  } finally {
    loading.value = false;
  }
};

const toggleCheck = (id) => {
  const i = checked.value.indexOf(id);
  if (i > -1) checked.value.splice(i, 1);
  else checked.value.push(id);
};

const toggleAll = () => {
  checked.value = allChecked.value ? [] : list.value.map((x) => x.id);
};

const onUpload = async (file) => {
  uploading.value = true;
  try {
    const res = await uploadMaterialImage(file, brandId.value);
    if (!res?.url) throw new Error(res?.error ?? '上传失败');
    await importMaterialImages({ urls: [res.url] }, { brandId: brandId.value });
    message.success(`已上传 ${file.name}`);
    await Promise.all([load(), loadMeta()]);
  } catch (e) {
    message.error(e?.message ?? '上传失败');
  } finally {
    uploading.value = false;
  }
  return false;
};

const batchDelete = () => {
  if (!checked.value.length) return;
  Modal.confirm({
    title: `确认删除选中的 ${checked.value.length} 张素材？`,
    okText: '删除',
    okType: 'danger',
    onOk: async () => {
      await deleteMaterialImages(checked.value);
      message.success('已删除');
      await Promise.all([load(), loadMeta()]);
    },
  });
};

const doAssign = async () => {
  if (!checked.value.length) return;
  const data = { ids: checked.value };
  if (assignType.value !== undefined) data.typeId = assignType.value;
  if (assignSet.value !== undefined) data.setId = assignSet.value;
  await assignMaterialImages(data);
  message.success('已更新');
  assignOpen.value = false;
  await load();
};

const doImport = async () => {
  const urls = importText.value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  if (!urls.length) return;
  const res = await importMaterialImages({ urls }, { brandId: brandId.value });
  message.success(`新增 ${res?.added ?? 0} 张`);
  importOpen.value = false;
  importText.value = '';
  await Promise.all([load(), loadMeta()]);
};

const saveTag = async (t) => {
  await updateMaterialTag(t.id, { name: t.name });
  message.success('已保存');
  await loadMeta();
};

const removeTag = (t) => {
  Modal.confirm({
    title: `删除标签「${t.name}」？`,
    okType: 'danger',
    onOk: async () => {
      await deleteMaterialTags([t.id]);
      await Promise.all([load(), loadMeta()]);
    },
  });
};

const addTag = async () => {
  if (!newTagName.value.trim()) return;
  try {
    await createMaterialTag({ name: newTagName.value.trim() }, { brandId: brandId.value });
    newTagName.value = '';
    await loadMeta();
  } catch (e) {
    message.error(e?.response?.data?.msg ?? '创建失败');
  }
};

const saveSet = async (s) => {
  await updateMaterialSet(s.id, { name: s.name });
  message.success('已保存');
  await loadMeta();
};

const removeSet = (s) => {
  Modal.confirm({
    title: `删除套图「${s.name}」？`,
    okType: 'danger',
    onOk: async () => {
      await deleteMaterialSets([s.id]);
      await Promise.all([load(), loadMeta()]);
    },
  });
};

const addSet = async () => {
  if (!newSetName.value.trim()) return;
  try {
    await createMaterialSet({ name: newSetName.value.trim() }, { brandId: brandId.value });
    newSetName.value = '';
    await loadMeta();
  } catch (e) {
    message.error(e?.response?.data?.msg ?? '创建失败');
  }
};

onMounted(async () => {
  await loadMeta();
  await load();
});
</script>

<style scoped>
.mat-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 14px 20px;
  background: #fff;
  margin: 0 20px 16px;
  border-radius: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  overflow: auto;
}

.mat-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}

.mat-count {
  color: #5087ec;
  font-size: 13px;
}

.mat-toolbar-right {
  margin-left: auto;
  display: flex;
  gap: 8px;
}

.img-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
}

.img-cell {
  position: relative;
  border-radius: 10px;
  overflow: hidden;
  border: 2px solid transparent;
  cursor: pointer;
  background: #f8fafc;
}

.img-cell.checked {
  border-color: #3456e6;
}

.img-thumb {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  display: block;
}

.img-check {
  position: absolute;
  top: 6px;
  left: 6px;
  z-index: 2;
}

.img-tags {
  position: absolute;
  left: 6px;
  bottom: 6px;
  display: flex;
  gap: 4px;
}

.img-tag.set {
  margin: 0;
  background: rgba(15, 23, 42, 0.72);
  color: #fff;
  border: none;
  font-size: 11px;
  max-width: 90px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.img-tag.type {
  margin: 0;
  background: #eef4ff;
  color: #3456e6;
  border: none;
  font-size: 11px;
}

.mat-empty {
  margin: 60px 0;
}

.mat-footer {
  margin-top: auto;
  padding-top: 14px;
  display: flex;
  justify-content: center;
}

.manage-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.manage-count {
  color: #94a3b8;
  font-size: 12px;
}

.assign-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}

.assign-label {
  width: 70px;
  color: #64748b;
  font-size: 13px;
}
</style>
