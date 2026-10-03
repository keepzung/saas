<template>
  <PageWrapper title="内容包Pro" subtitle="内容生产 → 审核 → 领用 的管理容器">
    <div class="pk-body">
      <div class="pk-toolbar">
        <a-radio-group v-model:value="scope" button-style="solid" size="small" @change="load">
          <a-radio-button value="mine">我创建的</a-radio-button>
          <a-radio-button value="all">全部内容包</a-radio-button>
        </a-radio-group>
        <div class="pk-spacer" />
        <a-input-search
          v-model:value="keyword"
          placeholder="搜索内容包名称"
          style="width: 240px"
          allow-clear
          @search="load"
        />
        <a-button type="primary" @click="openCreate"><PlusOutlined /> 新建内容包</a-button>
      </div>

      <a-spin :spinning="loading">
        <div v-if="list.length" class="pkg-grid">
          <div v-for="p in list" :key="p.id" class="pkg-card" @click="goDetail(p.id)">
            <div class="pc-head">
              <FolderOutlined class="pc-folder" />
              <a-tag class="pc-pro">PRO</a-tag>
              <span class="pc-name">{{ p.name }}</span>
              <a-dropdown @click.stop>
                <MoreOutlined class="pc-more" />
                <template #overlay>
                  <a-menu @click="({ key }) => onMenu(key, p)">
                    <a-menu-item key="setting">包设置</a-menu-item>
                    <a-menu-item key="delete" danger>删除</a-menu-item>
                  </a-menu>
                </template>
              </a-dropdown>
            </div>
            <div class="pc-stats">
              <div class="pcs"><b>{{ p.stats.total }}</b><span>总内容</span></div>
              <div class="pcs"><b class="c-gray">{{ p.stats.draft }}</b><span>草稿</span></div>
              <div class="pcs"><b class="c-blue">{{ p.stats.pending }}</b><span>待审核</span></div>
              <div class="pcs"><b class="c-red">{{ p.stats.rejected }}</b><span>被驳回</span></div>
              <div class="pcs"><b class="c-green">{{ p.stats.approved }}</b><span>过审待领用</span></div>
              <div class="pcs"><b class="c-purple">{{ p.stats.used }}</b><span>已被领用</span></div>
            </div>
            <div class="pc-open">
              <a-switch
                :checked="p.open_flag"
                size="small"
                @click.stop
                @change="(v) => toggleOpen(p, v)"
              />
              <span class="pc-open-label">可被领用</span>
              <span v-if="p.claim_once" class="pc-open-hint">每个用户只能领用一次</span>
            </div>
            <div class="pc-uid">
              <span class="pc-uid-text">{{ p.uid }}</span>
              <CopyOutlined class="pc-uid-copy" @click.stop="copyUid(p.uid)" />
            </div>
          </div>
        </div>
        <a-empty v-else-if="!loading" description="暂无内容包，点击右上角「新建内容包」创建" class="pk-empty" />
      </a-spin>
    </div>

    <!-- 新建/设置 -->
    <a-modal
      v-model:open="formOpen"
      :title="formMode === 'create' ? '新建内容包' : '包设置'"
      :confirm-loading="saving"
      @ok="submitForm"
    >
      <div class="pkg-form">
        <div class="pf-item"><label><span class="req">*</span> 包名称</label><a-input v-model:value="form.name" :maxlength="30" placeholder="例如：618 中央空调种草包" /></div>
        <div class="pf-item"><label>描述</label><a-textarea v-model:value="form.description" :rows="2" :maxlength="200" /></div>
        <div class="pf-item"><label>关联产品</label>
          <a-select v-model:value="form.productId" :options="productOptions" allow-clear placeholder="可选" show-search option-filter-prop="label" />
        </div>
        <div class="pf-item">
          <div class="pf-switch"><a-switch v-model:checked="form.openFlag" size="small" /><span>可被领用（开放给 KOS 手机端领取）</span></div>
          <div class="pf-switch"><a-switch v-model:checked="form.claimOnce" size="small" /><span>每个用户只能领用一次</span></div>
        </div>
      </div>
    </a-modal>
  </PageWrapper>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import {
  PlusOutlined,
  FolderOutlined,
  MoreOutlined,
  CopyOutlined,
} from '@ant-design/icons-vue';
import PageWrapper from '../../components/PageWrapper.vue';
import { useAuthStore } from '../../stores/auth';
import { getProducts } from '../../api/content';
import {
  getPackagesPro,
  createPackagePro,
  updatePackagePro,
  deletePackagePro,
} from '../../api/contentpro';

const router = useRouter();
const auth = useAuthStore();
const brandId = computed(() => auth.currentBrandId ?? 1);

const scope = ref('mine');
const keyword = ref('');
const loading = ref(false);
const list = ref([]);

const formOpen = ref(false);
const formMode = ref('create');
const formId = ref(null);
const saving = ref(false);
const form = reactive({ name: '', description: '', productId: null, openFlag: true, claimOnce: true });
const productOptions = ref([]);

const flattenProducts = (nodes, out = []) => {
  for (const n of nodes ?? []) {
    if (n.type === 'product') out.push({ value: n.id, label: n.display_name ?? n.name });
    flattenProducts(n.children, out);
  }
  return out;
};

const load = async () => {
  loading.value = true;
  try {
    const res = await getPackagesPro({ brandId: brandId.value, scope: scope.value, keyword: keyword.value || undefined });
    list.value = res?.list ?? [];
  } finally {
    loading.value = false;
  }
};

const openCreate = () => {
  formMode.value = 'create';
  formId.value = null;
  Object.assign(form, { name: '', description: '', productId: null, openFlag: true, claimOnce: true });
  formOpen.value = true;
};

const openSetting = (p) => {
  formMode.value = 'setting';
  formId.value = p.id;
  Object.assign(form, {
    name: p.name,
    description: p.description ?? '',
    productId: p.product_id,
    openFlag: p.open_flag,
    claimOnce: p.claim_once,
  });
  formOpen.value = true;
};

const submitForm = async () => {
  if (!form.name.trim()) return message.warning('请输入包名称');
  saving.value = true;
  try {
    if (formMode.value === 'create') {
      await createPackagePro(
        {
          name: form.name.trim(),
          description: form.description || undefined,
          productId: form.productId,
          openFlag: form.openFlag,
          claimOnce: form.claimOnce,
        },
        { brandId: brandId.value },
      );
      message.success('内容包已创建');
    } else {
      await updatePackagePro(
        formId.value,
        {
          name: form.name.trim(),
          description: form.description,
          productId: form.productId,
          openFlag: form.openFlag,
          claimOnce: form.claimOnce,
        },
        { brandId: brandId.value },
      );
      message.success('已保存');
    }
    formOpen.value = false;
    load();
  } catch (e) {
    message.error(e?.response?.data?.msg ?? '保存失败');
  } finally {
    saving.value = false;
  }
};

const toggleOpen = async (p, v) => {
  try {
    await updatePackagePro(p.id, { openFlag: v }, { brandId: brandId.value });
    p.open_flag = v;
    message.success(v ? '已开放领用' : '已关闭领用');
  } catch (e) {
    message.error(e?.response?.data?.msg ?? '操作失败');
  }
};

const onMenu = (key, p) => {
  if (key === 'setting') openSetting(p);
  if (key === 'delete') {
    if (!confirm(`确定删除内容包「${p.name}」？（包内需为空）`)) return;
    deletePackagePro(p.id, { brandId: brandId.value })
      .then(() => {
        message.success('已删除');
        load();
      })
      .catch((e) => message.error(e?.response?.data?.msg ?? '删除失败'));
  }
};

const copyUid = (uid) => {
  navigator.clipboard?.writeText(uid);
  message.success('已复制');
};

const goDetail = (id) => router.push(`/content-pro/package/${id}`);

onMounted(async () => {
  load();
  const res = await getProducts({ brandId: brandId.value });
  productOptions.value = flattenProducts(res ?? []);
});
</script>

<style scoped>
.pk-body { display: flex; flex-direction: column; gap: 14px; }
.pk-toolbar { display: flex; align-items: center; gap: 10px; }
.pk-spacer { flex: 1; }
.pkg-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(460px, 1fr));
  gap: 14px;
}
.pkg-card {
  background: #fff;
  border-radius: 14px;
  padding: 16px 18px;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.15s;
}
.pkg-card:hover { border-color: #5087ec; box-shadow: 0 4px 14px rgba(52, 86, 230, 0.08); }
.pc-head { display: flex; align-items: center; gap: 8px; }
.pc-folder { font-size: 18px; color: #5087ec; }
.pc-pro {
  background: linear-gradient(90deg, #7c5cf0, #5087ec);
  color: #fff;
  border: none;
  font-size: 11px;
  font-weight: 700;
  border-radius: 4px;
  padding: 0 6px;
  line-height: 18px;
  margin: 0;
}
.pc-name { font-size: 15px; font-weight: 600; color: #1e293b; flex: 1; }
.pc-more { color: #94a3b8; cursor: pointer; padding: 0 4px; }
.pc-stats {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  background: #f8fafc;
  border-radius: 10px;
  padding: 10px 6px;
  margin-top: 12px;
}
.pcs { text-align: center; display: flex; flex-direction: column; gap: 2px; }
.pcs b { font-size: 17px; color: #1e293b; font-variant-numeric: tabular-nums; }
.pcs span { font-size: 11px; color: #94a3b8; }
.c-gray { color: #64748b !important; }
.c-blue { color: #1677ff !important; }
.c-red { color: #dc2626 !important; }
.c-green { color: #16a34a !important; }
.c-purple { color: #7c5cf0 !important; }
.pc-open { display: flex; align-items: center; gap: 8px; margin-top: 12px; }
.pc-open-label { font-size: 13px; color: #16a34a; font-weight: 500; }
.pc-open-hint { font-size: 12px; color: #94a3b8; }
.pc-uid {
  margin-top: 10px;
  background: #f8fafc;
  border-radius: 6px;
  padding: 5px 10px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.pc-uid-text {
  flex: 1;
  font-size: 11px;
  color: #94a3b8;
  font-family: monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pc-uid-copy { cursor: pointer; color: #64748b; }
.pk-empty { background: #fff; border-radius: 14px; padding: 60px 0; }

.pkg-form { display: flex; flex-direction: column; gap: 12px; }
.pf-item { display: flex; flex-direction: column; gap: 6px; }
.pf-item label { font-size: 13px; color: #64748b; }
.pf-switch { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #334155; }
.req { color: #ff4d4f; margin-right: 2px; }

@media (max-width: 991px) {
  .pkg-grid { grid-template-columns: 1fr; }
}
</style>
