<template>
  <PageWrapper title="品牌模板库">
    <template #extra>
      <a-button size="small" @click="load"><ReloadOutlined /> 刷新</a-button>
    </template>
    <a-tabs v-model:activeKey="kind" @change="load">
      <a-tab-pane v-for="k in KINDS" :key="k.value" :tab="k.label" />
    </a-tabs>
    <div class="tp-toolbar">
      <a-button type="primary" size="small" @click="openForm()">
        <PlusOutlined /> 新建{{ kindLabel }}模板
      </a-button>
      <span class="tp-hint">模板启用后自动注入内容生成与私信对话</span>
    </div>
    <a-table
      :columns="columns"
      :data-source="list"
      row-key="id"
      size="small"
      :pagination="{ pageSize: 10, showSizeChanger: false }"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'name'">
          <span class="tp-name">{{ record.name }}</span>
          <div class="tp-summary">{{ record.summary }}</div>
        </template>
        <template v-else-if="column.key === 'status'">
          <a-switch size="small" :checked="record.status === 1" @change="(v) => onToggle(record, v)" />
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
      :title="form.id ? `编辑${kindLabel}模板` : `新建${kindLabel}模板`"
      :width="560"
      destroy-on-close
    >
      <a-form layout="vertical">
        <a-form-item label="模板名称" required>
          <a-input v-model:value="form.name" :maxlength="40" placeholder="如：东风日产品牌话术规范" />
        </a-form-item>
        <a-form-item label="说明">
          <a-textarea v-model:value="form.summary" :rows="2" placeholder="一句话说明这个模板的用途" />
        </a-form-item>

        <!-- 话术规范 -->
        <template v-if="form.kind === 'script_spec'">
          <a-form-item label="语气基调">
            <a-input v-model:value="form.content.tone" placeholder="如：专业热情、口语化、不卑不亢" />
          </a-form-item>
          <a-form-item label="必须做到">
            <a-select v-model:value="form.content.dos" mode="tags" placeholder="回车添加，如：卖点表述与产品库一致" />
          </a-form-item>
          <a-form-item label="禁止出现">
            <a-select v-model:value="form.content.donts" mode="tags" placeholder="回车添加，如：贬低竞品品牌" />
          </a-form-item>
          <a-form-item label="优先用语">
            <a-select v-model:value="form.content.vocabulary" mode="tags" placeholder="回车添加品牌标准用语" />
          </a-form-item>
        </template>

        <!-- 车型内容模板 -->
        <template v-else-if="form.kind === 'vehicle_template'">
          <a-form-item label="适用车系">
            <a-select v-model:value="form.productId" allow-clear placeholder="全部车系通用（可选指定车系）">
              <a-select-option v-for="p in products" :key="p.id" :value="p.id">
                {{ p.displayName || p.name }}
              </a-select-option>
            </a-select>
          </a-form-item>
          <a-form-item label="标题参考句式">
            <a-select v-model:value="form.content.titlePatterns" mode="tags" placeholder="回车添加，如：{车型}到底怎么选" />
          </a-form-item>
          <a-form-item label="内容结构（段落顺序）">
            <div v-for="(s, i) in form.content.sections" :key="i" class="dir-row">
              <a-input v-model:value="s.name" style="width: 140px" placeholder="段落名" />
              <a-input v-model:value="s.requirement" placeholder="写作要求" />
              <a-button type="text" danger @click="form.content.sections.splice(i, 1)"><DeleteOutlined /></a-button>
            </div>
            <a-button size="small" @click="form.content.sections.push({ name: '', requirement: '' })">
              <PlusOutlined /> 添加段落
            </a-button>
          </a-form-item>
          <a-form-item label="行动引导话术">
            <a-input v-model:value="form.content.cta" placeholder="如：想了解的私信我，帮你算落地价" />
          </a-form-item>
        </template>

        <!-- 合规模板 -->
        <template v-else-if="form.kind === 'compliance_template'">
          <a-form-item label="禁用词清单（生成后逐条校验）">
            <a-select v-model:value="form.content.bannedWords" mode="tags" placeholder="回车添加，如：最、第一、绝对" />
          </a-form-item>
          <a-form-item label="发布前必检项">
            <a-select v-model:value="form.content.requiredChecks" mode="tags" placeholder="回车添加检查项" />
          </a-form-item>
        </template>

        <!-- 门店人设模板 -->
        <template v-else>
          <a-form-item label="身份背景">
            <a-input v-model:value="form.content.identity" placeholder="如：从业8年的日产销售顾问，常驻XX店" />
          </a-form-item>
          <a-form-item label="性格特质">
            <a-select v-model:value="form.content.traits" mode="tags" placeholder="回车添加，如：热情、爱聊车" />
          </a-form-item>
          <a-form-item label="专业领域">
            <a-select v-model:value="form.content.expertise" mode="tags" placeholder="回车添加，如：SUV车型、金融方案" />
          </a-form-item>
          <a-form-item label="表达习惯">
            <a-select v-model:value="form.content.expressions" mode="tags" placeholder="回车添加口头禅/自称" />
          </a-form-item>
        </template>

        <a-form-item label="版本备注">
          <a-input v-model:value="form.remark" placeholder="如：v1 初稿，品牌方评审后定稿" />
        </a-form-item>
      </a-form>
      <template #footer>
        <a-space>
          <a-button @click="formOpen = false">取消</a-button>
          <a-button type="primary" :loading="saving" @click="save">保存</a-button>
        </a-space>
      </template>
    </a-drawer>
  </PageWrapper>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { message } from 'ant-design-vue';
import { ReloadOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons-vue';
import PageWrapper from '../../components/PageWrapper.vue';
import { useAuthStore } from '../../stores/auth';
import {
  getTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplates,
} from '../../api/contentpro';
import { getProducts } from '../../api/content';

const auth = useAuthStore();
const brandId = computed(() => auth.currentBrandId ?? 1);

const KINDS = [
  { value: 'script_spec', label: '话术规范' },
  { value: 'vehicle_template', label: '车型内容模板' },
  { value: 'compliance_template', label: '合规审核模板' },
  { value: 'persona', label: '门店人设模板' },
];
const kind = ref('script_spec');
const kindLabel = computed(() => KINDS.find((k) => k.value === kind.value)?.label ?? '');

const columns = [
  { key: 'name', title: '模板名称', width: '45%' },
  { key: 'remark', title: '版本备注' },
  { key: 'status', title: '启用', width: 80 },
  { key: 'ops', title: '操作', width: 130 },
];

const list = ref([]);
const products = ref([]);
const formOpen = ref(false);
const saving = ref(false);

const emptyContent = (k) => {
  if (k === 'script_spec') return { tone: '', dos: [], donts: [], vocabulary: [] };
  if (k === 'vehicle_template') return { titlePatterns: [], sections: [], cta: '' };
  if (k === 'compliance_template') return { bannedWords: [], requiredChecks: [] };
  return { identity: '', traits: [], expertise: [], expressions: [] };
};
const emptyForm = () => ({
  id: null,
  kind: kind.value,
  productId: null,
  name: '',
  summary: '',
  content: emptyContent(kind.value),
  remark: '',
});
const form = ref(emptyForm());

const load = async () => {
  const data = await getTemplates({ brandId: brandId.value, kind: kind.value });
  list.value = data?.list ?? [];
};

const loadProducts = async () => {
  const data = await getProducts({ brandId: brandId.value });
  products.value = data?.list ?? data ?? [];
};

const openForm = (row) => {
  form.value = row
    ? {
        id: row.id,
        kind: row.kind,
        productId: row.productId,
        name: row.name,
        summary: row.summary ?? '',
        content: { ...emptyContent(row.kind), ...(row.content ?? {}) },
        remark: row.remark ?? '',
      }
    : emptyForm();
  formOpen.value = true;
};

const save = async () => {
  if (!form.value.name.trim()) {
    message.warning('请填写模板名称');
    return;
  }
  saving.value = true;
  try {
    if (form.value.id) {
      await updateTemplate(form.value.id, form.value);
    } else {
      await createTemplate(form.value, { brandId: brandId.value });
    }
    message.success('已保存');
    formOpen.value = false;
    await load();
  } finally {
    saving.value = false;
  }
};

const onToggle = (row, v) => {
  updateTemplate(row.id, { status: v ? 1 : 0 }).then(() => {
    row.status = v ? 1 : 0;
  });
};

const onDelete = (row) => {
  deleteTemplates([row.id]).then(() => {
    message.success('已删除');
    load();
  });
};

onMounted(() => {
  load();
  loadProducts();
});
</script>

<style scoped>
.tp-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.tp-hint {
  color: #999;
  font-size: 12px;
}
.tp-name {
  font-weight: 600;
}
.tp-summary {
  color: #999;
  font-size: 12px;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 380px;
}
.dir-row {
  display: flex;
  gap: 8px;
  margin-bottom: 6px;
}
</style>
