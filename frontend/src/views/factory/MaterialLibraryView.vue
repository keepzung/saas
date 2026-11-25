<template>
  <PageWrapper title="素材库">
    <div v-if="productLines.length" class="prod-tabs">
      <div class="pt-row">
        <span class="pt-label">产品线</span>
        <a-radio-group v-model:value="activeLineKey" button-style="solid" size="small" @change="onLineChange">
          <a-radio-button v-for="l in productLines" :key="l.key" :value="l.key">{{ l.name }}</a-radio-button>
        </a-radio-group>
      </div>
      <div v-if="activeLineProducts.length" class="pt-row">
        <span class="pt-label">型号</span>
        <a-radio-group v-model:value="activeProductId" button-style="solid" size="small" @change="onProductChange">
          <a-radio-button v-for="p in activeLineProducts" :key="p.id" :value="p.id">{{ p.name }}</a-radio-button>
        </a-radio-group>
      </div>
    </div>
    <FilterTopbar>
      <a-select
        v-model:value="filterType"
        style="width: 140px"
        :placeholder="`按${typeLabel}筛选`"
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
      <a-checkbox v-model:checked="onlyNoProduct" style="margin-left: 8px">未归属产品</a-checkbox>
      <a-checkbox v-model:checked="onlyUntagged">未打标</a-checkbox>
    </FilterTopbar>

    <div class="mat-body" :class="{ 'mat-body-flat-top': productLines.length }">
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
          批量设置{{ typeLabel }}/套图
        </a-button>
        <div class="mat-toolbar-right">
          <a-select
            v-model:value="uploadProduct"
            style="width: 180px"
            size="small"
            show-search
            allow-clear
            placeholder="归属产品(可搜索/新建)"
            :options="productNodeOptions"
            @search="(v) => (uploadSearch = v)"
          >
            <template #dropdownRender>
              <div style="padding: 4px 8px">
                <a-button
                  size="small"
                  type="link"
                  :disabled="!uploadSearch.trim() || creatingNode"
                  @click="addProductNode(uploadSearch)"
                >＋ 新建产品「{{ uploadSearch.trim() }}」</a-button>
              </div>
            </template>
          </a-select>
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
          <a-button size="small" @click="openImport()"><LinkOutlined /> URL 导入</a-button>
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
              <a-tag v-if="img.product_name" class="img-tag prod">{{ img.product_name }}</a-tag>
              <a-tag v-if="img.set_name" class="img-tag set">{{ img.set_name }}</a-tag>
              <a-tag v-if="img.type_name" class="img-tag type">{{ img.type_name }}</a-tag>
            </div>
          </div>
        </div>
        <a-empty v-else-if="!loading" :description="activeProductId ? `「${activeLineProducts.find((p) => p.id === activeProductId)?.name ?? ''}」暂无素材，点击右上角「上传产品素材」添加（自动归属当前型号）` : '暂无素材，点击右上角「上传产品素材」或「URL 导入」添加'" class="mat-empty" />
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
    <a-modal v-model:open="manageOpen" :title="`${typeLabel}/套图管理`" :footer="null" width="680px">
      <a-tabs v-model:activeKey="manageTab">
        <a-tab-pane key="type" :tab="`${typeLabel}标签`">
          <div class="manage-row" v-for="t in tags" :key="t.id">
            <a-input v-model:value="t.name" size="small" style="width: 180px" />
            <span class="manage-count">{{ t.image_count }} 张</span>
            <a-button size="small" type="link" @click="saveTag(t)">保存</a-button>
            <a-button size="small" type="link" danger @click="removeTag(t)">删除</a-button>
          </div>
          <div class="manage-row">
            <a-input v-model:value="newTagName" size="small" style="width: 180px" :placeholder="`新${typeLabel}名称`" />
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
            <a-input v-model:value="newSetName" size="small" style="width: 180px" placeholder="新套图名称（如 外观-白色）" />
            <a-button size="small" type="primary" @click="addSet">新增套图</a-button>
          </div>
        </a-tab-pane>
      </a-tabs>
    </a-modal>

    <!-- 批量设置 -->
    <a-modal v-model:open="assignOpen" :title="`批量设置${typeLabel}/套图`" @ok="doAssign">
      <div class="assign-row">
        <span class="assign-label">{{ typeLabel }}</span>
        <a-select v-model:value="assignType" style="width: 200px" allow-clear placeholder="不修改" :options="typeOptions" />
      </div>
      <div class="assign-row">
        <span class="assign-label">所属套图</span>
        <a-select v-model:value="assignSet" style="width: 200px" allow-clear placeholder="不修改" :options="setOptions" />
      </div>
      <div class="assign-row">
        <span class="assign-label">所属产品</span>
        <a-select v-model:value="assignProduct" style="width: 200px" allow-clear placeholder="不修改" :options="productNodeOptions" />
      </div>
    </a-modal>

    <!-- URL 导入 -->
    <a-modal v-model:open="importOpen" title="URL 导入素材" @ok="doImport">
      <div class="assign-row" style="margin-bottom: 8px">
        <span class="assign-label">归属产品</span>
        <a-select v-model:value="importProduct" style="width: 100%" allow-clear placeholder="不指定" :options="productNodeOptions" />
      </div>
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
import { createProduct, getProducts } from '../../api/content';
import { useAuthStore } from '../../stores/auth';
import { BRAND_MATERIAL_TYPE_LABEL } from '../../config/brands';
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
const onlyUntagged = ref(false);
const onlyNoProduct = ref(false);
const uploading = ref(false);

// 产品线→型号两级 tab（与资料库产品树同构：brand→series→product）
const productLines = ref([]);
const activeLineKey = ref(null);
const activeProductId = ref(null);
const activeLine = computed(() => productLines.value.find((l) => l.key === activeLineKey.value) ?? null);
const activeLineProducts = computed(() => activeLine.value?.products ?? []);

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
const productNodeOptions = ref([]);
const uploadProduct = ref(null);
const importProduct = ref(null);
const assignProduct = ref(undefined);
const uploadSearch = ref('');
const creatingNode = ref(false);

const typeOptions = computed(() => tags.value.map((t) => ({ label: t.name, value: t.id })));
const setOptions = computed(() => sets.value.map((s) => ({ label: s.name, value: s.id })));
const typeLabel = computed(() => BRAND_MATERIAL_TYPE_LABEL[Number(brandId.value)] ?? '素材类型');
const allChecked = computed(() => list.value.length > 0 && checked.value.length === list.value.length);

const productNameMap = computed(() => {
  const m = {};
  for (const o of productNodeOptions.value) m[o.value] = o.label;
  return m;
});

const loadMeta = async () => {
  const [t, s] = await Promise.all([
    getMaterialTags({ brandId: brandId.value }),
    getMaterialSets({ brandId: brandId.value }),
  ]);
  tags.value = t?.list ?? [];
  sets.value = s?.list ?? [];
};

const parseTree = (tree) => {
  // 与资料库同构：brand → series(产品线) → product(型号)；series 可嵌套，产品平铺到所属线
  const lines = [];
  const orphans = [];
  const collectProducts = (node, out) => {
    for (const c of node.children ?? []) {
      if ((c.type ?? c.configType ?? "product") === "product") out.push({ id: c.id, name: c.display_name ?? c.name });
      else collectProducts(c, out);
    }
  };
  const walkRoot = (node) => {
    for (const c of node.children ?? []) {
      const t = c.type ?? c.configType ?? "product";
      if (t === 'product') orphans.push({ id: c.id, name: c.display_name ?? c.name });
      else {
        const ps = [];
        collectProducts(c, ps);
        lines.push({ key: `l${c.id}`, name: c.display_name ?? c.name, products: ps });
      }
    }
  };
  for (const root of tree ?? []) {
    const t = root.type ?? root.configType ?? "product";
    if (t === 'brand') walkRoot(root);
    else if (t === 'series') {
      const ps = [];
      collectProducts(root, ps);
      lines.push({ key: `l${root.id}`, name: root.display_name ?? root.name, products: ps });
    } else orphans.push({ id: root.id, name: root.display_name ?? root.name });
  }
  if (orphans.length) lines.push({ key: 'lorphan', name: '未分组', products: orphans });
  return lines;
};

const loadProductNodes = async () => {
  try {
    const tree = (await getProducts({ brandId: brandId.value })) ?? [];
    const walk = (nodes, depth, out = []) => {
      for (const n of nodes ?? []) {
        out.push({ label: (depth ? '　'.repeat(depth) : '') + (n.display_name ?? n.name), value: n.id });
        walk(n.children, depth + 1, out);
      }
      return out;
    };
    productNodeOptions.value = walk(tree, 0);
    productLines.value = parseTree(tree);
    if (productLines.value.length) {
      activeLineKey.value = productLines.value[0].key;
      activeProductId.value = productLines.value[0].products[0]?.id ?? null;
      uploadProduct.value = activeProductId.value;
    }
  } catch {
    // 产品树缺失的工作区允许手动新建
  }
};

const onLineChange = () => {
  activeProductId.value = activeLine.value?.products[0]?.id ?? null;
  uploadProduct.value = activeProductId.value;
  page.value = 1;
  load();
};

const onProductChange = () => {
  uploadProduct.value = activeProductId.value;
  page.value = 1;
  load();
};

const addProductNode = async (name) => {
  const n = String(name ?? '').trim();
  if (!n || creatingNode.value) return;
  creatingNode.value = true;
  try {
    const root = productNodeOptions.value.length ? productNodeOptions.value[0].value : null;
    const created = await createProduct({ name: n, parentId: root, configType: 'product' }, brandId.value);
    message.success(`已创建产品「${n}」`);
    await loadProductNodes();
    uploadProduct.value = created?.id ?? uploadProduct.value;
  } catch (e) {
    message.error(e?.response?.data?.msg ?? '新建失败');
  } finally {
    creatingNode.value = false;
  }
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
      // 产品 tab 选中时只看当前型号；勾选"未归属产品"时忽略 tab
      productNodeId: onlyNoProduct.value ? undefined : activeProductId.value ?? undefined,
      noProduct: onlyNoProduct.value ? '1' : undefined,
      unassigned: onlyUntagged.value ? '1' : undefined,
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
    await importMaterialImages({ urls: [res.url], productNodeId: uploadProduct.value ?? null }, { brandId: brandId.value });
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
  if (assignProduct.value !== undefined) data.productNodeId = assignProduct.value;
  await assignMaterialImages(data);
  message.success('已更新');
  assignOpen.value = false;
  await load();
};

const openImport = () => {
  // 默认归属当前选中的型号，可改
  importProduct.value = activeProductId.value;
  importOpen.value = true;
};

const doImport = async () => {
  const urls = importText.value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  if (!urls.length) return;
  const res = await importMaterialImages({ urls, productNodeId: importProduct.value ?? null }, { brandId: brandId.value });
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
  await loadProductNodes();
  await loadMeta();
  await load();
});
</script>

<style scoped>
.prod-tabs {
  background: #fff;
  margin: 0 20px;
  padding: 12px 20px 4px;
  border-radius: 16px 16px 0 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pt-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  flex-wrap: wrap;
}

.pt-row :deep(.ant-radio-group) {
  flex-wrap: wrap;
  row-gap: 6px;
}

.pt-label {
  color: #94a3b8;
  font-size: 13px;
  line-height: 24px;
  flex-shrink: 0;
}

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

.mat-body-flat-top {
  border-radius: 0 0 16px 16px;
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

.img-tag.prod {
  margin: 0;
  background: #e0e9ff;
  color: #1d4ed8;
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
