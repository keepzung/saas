<template>
  <PageWrapper title="素材库">
    <div class="tip-bar">
      按产品组织创作素材：图片/视频用于「生成同款视频」的画面来源，销售政策/产品卖点编辑后立即作用于文案与视频生成（与内容工厂共用一份数据）。
    </div>
    <div class="layout">
      <a-card size="small" class="tree-card" title="产品">
        <a-input-search v-model:value="kw" placeholder="搜产品" size="small" allow-clear style="margin-bottom: 8px" />
        <a-spin :spinning="treeLoading">
          <a-tree
            v-if="filteredTree.length"
            :tree-data="filteredTree"
            :selected-keys="selectedKeys"
            :expanded-keys="expandedKeys"
            block-node
            @select="onSelect"
            @expand="onExpand"
          />
          <a-empty v-else-if="!treeLoading" description="暂无产品" :image-style="{ height: '40px' }" />
        </a-spin>
      </a-card>

      <div class="main">
        <a-tabs v-model:activeKey="tab">
          <!-- 图片 -->
          <a-tab-pane key="image">
            <template #tab>图片{{ imgTotal ? `（${imgTotal}）` : '' }}</template>
            <div class="toolbar">
              <a-checkbox v-model:checked="onlyNoProduct" @change="loadImages">只看未归属素材</a-checkbox>
              <a-upload :show-upload-list="false" accept="image/*" multiple :before-upload="onImageUpload">
                <a-button type="primary" size="small" :loading="imgUploading" :disabled="!curProductId">
                  <UploadOutlined /> 上传图片（归属当前产品）
                </a-button>
              </a-upload>
              <a-button v-if="imgChecked.length" size="small" @click="assignImages">归属到当前产品</a-button>
              <a-popconfirm v-if="imgChecked.length" title="删除选中图片？" ok-text="删除" cancel-text="取消" @confirm="deleteImages">
                <a-button size="small" danger>删除选中（{{ imgChecked.length }}）</a-button>
              </a-popconfirm>
            </div>
            <a-spin :spinning="imgLoading">
              <div v-if="imgList.length" class="img-grid">
                <div v-for="m in imgList" :key="m.id" class="img-cell" :class="{ picked: imgChecked.includes(m.id) }" @click="toggleImg(m.id)">
                  <img :src="m.url" loading="lazy" />
                  <div class="img-meta">
                    <a-checkbox :checked="imgChecked.includes(m.id)" @click.stop @change="toggleImg(m.id)" />
                    <span class="img-name">{{ m.name || `#${m.id}` }}</span>
                    <a-tag v-if="m.product_node_id === curProductId && curProductId" color="blue" class="own-tag">本产品</a-tag>
                    <a-tag v-else-if="!m.product_node_id" class="own-tag">未归属</a-tag>
                  </div>
                </div>
              </div>
              <a-empty v-else-if="!imgLoading" :description="curProductId || onlyNoProduct ? '该产品暂无图片素材，点上方上传' : '先在左侧选择产品，或勾选「只看未归属素材」'" />
              <div v-if="imgTotal > imgPageSize" class="pager">
                <a-pagination v-model:current="imgPage" :total="imgTotal" :page-size="imgPageSize" size="small" @change="loadImages" />
              </div>
            </a-spin>
          </a-tab-pane>

          <!-- 视频 -->
          <a-tab-pane key="video">
            <template #tab>视频{{ vidTotal ? `（${vidTotal}）` : '' }}</template>
            <div class="toolbar">
              <a-checkbox v-model:checked="onlyNoProductV" @change="loadVideos">只看未归属素材</a-checkbox>
              <a-upload :show-upload-list="false" accept=".mp4,.mov,.webm,.m4v" :before-upload="onVideoUpload">
                <a-button type="primary" size="small" :loading="vidUploading" :disabled="!curProductId">
                  <UploadOutlined /> 上传视频（归属当前产品）
                </a-button>
              </a-upload>
              <a-button v-if="vidChecked.length" size="small" :disabled="!curProductId" @click="assignVideos">归属到当前产品</a-button>
              <a-popconfirm v-if="vidChecked.length" title="删除选中视频？" ok-text="删除" cancel-text="取消" @confirm="deleteVideos">
                <a-button size="small" danger>删除选中（{{ vidChecked.length }}）</a-button>
              </a-popconfirm>
            </div>
            <a-spin :spinning="vidLoading">
              <div v-if="vidList.length" class="vid-grid">
                <div v-for="m in vidList" :key="m.id" class="vid-cell" :class="{ picked: vidChecked.includes(m.id) }" @click="toggleVid(m.id)">
                  <video :src="m.url" :poster="m.thumbUrl ?? undefined" controls preload="metadata"></video>
                  <div class="img-meta">
                    <a-checkbox :checked="vidChecked.includes(m.id)" @click.stop @change="toggleVid(m.id)" />
                    <span class="img-name">{{ m.durationSec }}s</span>
                    <a-tag v-if="m.productNodeId === curProductId && curProductId" color="blue" class="own-tag">本产品</a-tag>
                    <a-tag v-else-if="!m.productNodeId" class="own-tag">未归属</a-tag>
                  </div>
                </div>
              </div>
              <a-empty v-else-if="!vidLoading" :description="curProductId || onlyNoProductV ? '暂无视频素材，点上方上传' : '先在左侧选择产品，或勾选「只看未归属素材」'" />
              <div v-if="vidTotal > vidPageSize" class="pager">
                <a-pagination v-model:current="vidPage" :total="vidTotal" :page-size="vidPageSize" size="small" @change="loadVideos" />
              </div>
            </a-spin>
          </a-tab-pane>

          <!-- 销售政策 -->
          <a-tab-pane key="policy" tab="销售政策">
            <template v-if="curProduct">
              <div class="edit-hint">保存后立即用于爆款复刻文案、AI成片与混剪的口播创作（Product 销售政策字段）。</div>
              <a-textarea v-model:value="salesPolicy" :rows="14" placeholder="填写本品销售政策：价格、优惠、金融方案、置换/赠送、限时活动等" />
              <div class="save-row">
                <a-button type="primary" :loading="savingPolicy" @click="savePolicy">保存销售政策</a-button>
              </div>
            </template>
            <a-empty v-else description="先在左侧选择产品" />
          </a-tab-pane>

          <!-- 产品卖点 -->
          <a-tab-pane key="selling" tab="产品卖点">
            <template v-if="curProduct">
              <div class="edit-hint">每行一条卖点，生成视频时可勾选作为「重点卖点」注入分镜（Product 产品知识字段）。</div>
              <a-textarea v-model:value="knowledge" :rows="14" placeholder="填写产品卖点/知识，建议每行一条：&#10;超长续航 600km&#10;智能驾驶辅助全系标配" />
              <div class="save-row">
                <a-button type="primary" :loading="savingKnowledge" @click="saveKnowledge">保存产品卖点</a-button>
              </div>
            </template>
            <a-empty v-else description="先在左侧选择产品" />
          </a-tab-pane>
        </a-tabs>
      </div>
    </div>
  </PageWrapper>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { message } from 'ant-design-vue';
import { UploadOutlined } from '@ant-design/icons-vue';
import PageWrapper from '../../components/PageWrapper.vue';
import { useAuthStore } from '../../stores/auth';
import { getProducts, updateProduct } from '../../api/content';
import { getMaterialImages, importMaterialImages, deleteMaterialImages, assignMaterialImages, uploadMaterialImage } from '../../api/contentpro';
import { getMaterialVideos, uploadMaterialVideo, assignMaterialVideos, deleteMaterialVideo } from '../../api/hotspot';

const auth = useAuthStore();
const brandId = computed(() => auth.currentBrandId ?? 1);

// ─── 产品树 ───
const treeLoading = ref(false);
const tree = ref([]);
const kw = ref('');
const selectedKeys = ref([]);
const expandedKeys = ref([]);
const tab = ref('image');

const findNode = (nodes, key) => {
  for (const n of nodes ?? []) {
    if (n.key === key) return n;
    const hit = findNode(n.children, key);
    if (hit) return hit;
  }
  return null;
};

const curProduct = computed(() => findNode(tree.value, selectedKeys.value[0]));
const curProductId = computed(() => curProduct.value?.id ?? null);

const filteredTree = computed(() => {
  const k = kw.value?.trim();
  if (!k) return tree.value;
  const hit = (n) => (n.title ?? '').includes(k);
  return tree.value
    .map((line) => {
      if (hit(line)) return line;
      const kids = (line.children ?? []).filter(hit);
      return kids.length ? { ...line, children: kids } : null;
    })
    .filter(Boolean);
});

const loadTree = async () => {
  treeLoading.value = true;
  try {
    const nodes = (await getProducts({ brandId: brandId.value })) ?? [];
    const nodeOf = (n, isLeaf) => ({
      ...n,
      title: n.display_name ?? n.name,
      key: n.id,
      id: n.id,
      isLeaf,
      children: [],
    });
    const lineNode = (n) => {
      const kids = (n.children ?? [])
        .filter((c) => (c.type ?? c.configType ?? 'product') === 'product')
        .map((c) => nodeOf(c, true));
      return { ...nodeOf(n, !kids.length), children: kids };
    };
    const out = [];
    for (const root of nodes) {
      const t = root.type ?? root.configType ?? 'product';
      if (t === 'brand') {
        for (const line of root.children ?? []) out.push(lineNode(line));
      } else if (t === 'series') {
        out.push(lineNode(root));
      } else {
        out.push(nodeOf(root, true));
      }
    }
    tree.value = out;
    if (!expandedKeys.value.length) expandedKeys.value = tree.value.map((n) => n.key);
    // 默认选中第一个型号，避免首屏空白
    const first = tree.value[0]?.children?.length ? tree.value[0].children[0] : tree.value[0];
    if (first && !selectedKeys.value.length) {
      selectedKeys.value = [first.key];
      loadProductText();
    }
  } finally {
    treeLoading.value = false;
  }
};

const onSelect = (keys) => {
  if (!keys.length) return;
  selectedKeys.value = keys;
  imgChecked.value = [];
  vidChecked.value = [];
  loadImages();
  loadVideos();
  loadProductText();
};

const onExpand = (keys) => {
  expandedKeys.value = keys;
};

// ─── 图片 ───
const imgList = ref([]);
const imgTotal = ref(0);
const imgPage = ref(1);
const imgPageSize = 60;
const imgLoading = ref(false);
const imgUploading = ref(false);
const imgChecked = ref([]);
const onlyNoProduct = ref(false);

const loadImages = async () => {
  imgLoading.value = true;
  try {
    const data = await getMaterialImages({
      brandId: brandId.value,
      page: imgPage.value,
      pageSize: imgPageSize,
      productNodeId: onlyNoProduct.value ? undefined : curProductId.value ?? undefined,
      noProduct: onlyNoProduct.value ? '1' : undefined,
    });
    imgList.value = data?.list ?? [];
    imgTotal.value = data?.total ?? 0;
  } finally {
    imgLoading.value = false;
  }
};

const toggleImg = (id) => {
  const i = imgChecked.value.indexOf(id);
  if (i > -1) imgChecked.value.splice(i, 1);
  else imgChecked.value.push(id);
};

const onImageUpload = async (file) => {
  imgUploading.value = true;
  try {
    const res = await uploadMaterialImage(file, brandId.value);
    if (!res?.url) throw new Error(res?.error ?? '上传失败');
    await importMaterialImages({ urls: [res.url], productNodeId: curProductId.value ?? null }, { brandId: brandId.value });
    message.success(`已上传 ${file.name}`);
    await loadImages();
  } catch (e) {
    message.error(e?.message ?? '上传失败');
  } finally {
    imgUploading.value = false;
  }
  return false;
};

const assignImages = async () => {
  try {
    await assignMaterialImages({ ids: imgChecked.value, productNodeId: curProductId.value ?? null });
    message.success(`已归属 ${imgChecked.value.length} 张图片到当前产品`);
    imgChecked.value = [];
    await loadImages();
  } catch (e) {
    message.error(e?.message ?? '归属失败');
  }
};

const deleteImages = async () => {
  try {
    await deleteMaterialImages(imgChecked.value);
    message.success('已删除');
    imgChecked.value = [];
    await loadImages();
  } catch (e) {
    message.error(e?.message ?? '删除失败');
  }
};

// ─── 视频 ───
const vidList = ref([]);
const vidTotal = ref(0);
const vidPage = ref(1);
const vidPageSize = 24;
const vidLoading = ref(false);
const vidUploading = ref(false);
const vidChecked = ref([]);
const onlyNoProductV = ref(false);

const loadVideos = async () => {
  vidLoading.value = true;
  try {
    const data = await getMaterialVideos({
      brandId: brandId.value,
      page: vidPage.value,
      pageSize: vidPageSize,
      productNodeId: onlyNoProductV.value ? undefined : curProductId.value ?? undefined,
      noProduct: onlyNoProductV.value ? '1' : undefined,
    });
    vidList.value = data?.items ?? [];
    vidTotal.value = data?.total ?? 0;
  } finally {
    vidLoading.value = false;
  }
};

const toggleVid = (id) => {
  const i = vidChecked.value.indexOf(id);
  if (i > -1) vidChecked.value.splice(i, 1);
  else vidChecked.value.push(id);
};

const onVideoUpload = async (file) => {
  vidUploading.value = true;
  try {
    await uploadMaterialVideo(file, brandId.value, undefined, curProductId.value);
    message.success(`已上传 ${file.name}`);
    await loadVideos();
  } catch (e) {
    message.error(e?.message ?? '上传失败');
  } finally {
    vidUploading.value = false;
  }
  return false;
};

const assignVideos = async () => {
  try {
    await assignMaterialVideos({ ids: vidChecked.value, productNodeId: curProductId.value ?? null }, { brandId: brandId.value });
    message.success(`已归属 ${vidChecked.value.length} 个视频到当前产品`);
    vidChecked.value = [];
    await loadVideos();
  } catch (e) {
    message.error(e?.message ?? '归属失败');
  }
};

const deleteVideos = async () => {
  try {
    for (const id of vidChecked.value) {
      await deleteMaterialVideo(id, { brandId: brandId.value });
    }
    message.success('已删除');
    vidChecked.value = [];
    await loadVideos();
  } catch (e) {
    message.error(e?.message ?? '删除失败');
  }
};

// ─── 销售政策 / 产品卖点 ───
const salesPolicy = ref('');
const knowledge = ref('');
const savingPolicy = ref(false);
const savingKnowledge = ref(false);

const loadProductText = () => {
  if (!curProduct.value) return;
  const p = curProduct.value;
  salesPolicy.value = p.basic_info?.sales_policy ?? p.salesPolicy ?? '';
  knowledge.value = p.knowledge ?? '';
};

const saveProductField = async (field, value, label) => {
  if (!curProduct.value) return;
  const p = curProduct.value;
  await updateProduct(p.id, {
    name: p.name,
    [field]: value,
  });
  if (field === 'salesPolicy') p.basic_info = { ...(p.basic_info ?? {}), sales_policy: value };
  else p[field] = value;
  message.success(`已保存${label}`);
};

const savePolicy = async () => {
  savingPolicy.value = true;
  try {
    await saveProductField('salesPolicy', salesPolicy.value, '销售政策');
  } catch (e) {
    message.error(e?.message ?? '保存失败');
  } finally {
    savingPolicy.value = false;
  }
};

const saveKnowledge = async () => {
  savingKnowledge.value = true;
  try {
    await saveProductField('knowledge', knowledge.value, '产品卖点');
  } catch (e) {
    message.error(e?.message ?? '保存失败');
  } finally {
    savingKnowledge.value = false;
  }
};

onMounted(() => {
  loadTree();
  loadImages();
  loadVideos();
});
</script>

<style scoped>
.tip-bar { color: #8c8c8c; font-size: 12px; margin-bottom: 10px; }
.layout { display: flex; gap: 12px; align-items: flex-start; }
.tree-card { width: 260px; flex-shrink: 0; min-height: 420px; }
.main { flex: 1; min-width: 0; background: #fff; border: 1px solid #f0f0f0; border-radius: 10px; padding: 4px 16px 16px; }
.toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
.img-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 10px; }
.img-cell { border: 2px solid transparent; border-radius: 8px; overflow: hidden; cursor: pointer; background: #fafafa; }
.img-cell.picked { border-color: #1677ff; }
.img-cell img { width: 100%; height: 110px; object-fit: cover; display: block; }
.img-meta { display: flex; align-items: center; gap: 4px; padding: 4px 6px; }
.img-name { font-size: 12px; color: #666; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.own-tag { margin: 0; flex-shrink: 0; font-size: 11px; line-height: 16px; padding: 0 4px; }
.vid-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; }
.vid-cell { border: 2px solid transparent; border-radius: 8px; overflow: hidden; cursor: pointer; background: #000; }
.vid-cell.picked { border-color: #1677ff; }
.vid-cell video { width: 100%; height: 140px; object-fit: contain; display: block; background: #000; }
.pager { display: flex; justify-content: center; margin-top: 12px; }
.edit-hint { color: #999; font-size: 12px; margin-bottom: 8px; }
.save-row { margin-top: 12px; }
</style>
