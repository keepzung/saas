<template>
  <PageWrapper title="创作策略">
    <template #extra>
      <span class="pro-badge">PRO</span>
    </template>
    <div class="st-layout">
      <div class="st-grid-wrap">
        <div class="st-head">
          <span class="st-title">创作策略列表</span>
          <a-button size="small" @click="load"><ReloadOutlined /> 刷新</a-button>
        </div>
        <div class="st-grid">
          <div class="st-card create-card" @click="openForm()">
            <PlusOutlined class="create-icon" />
            <div class="create-title">新建一条创作策略</div>
            <div class="create-sub">进入分步流程配置基础要素</div>
          </div>
          <div v-for="s in list" :key="s.id" class="st-card" :class="{ disabled: !s.enabled }">
            <div class="st-card-head">
              <span class="st-name" :title="s.name">{{ s.name }}</span>
              <div class="st-ops">
                <a-switch
                  size="small"
                  :checked="s.enabled"
                  @change="(v) => onToggle(s, v)"
                />
                <a-button type="text" size="small" @click="openForm(s)">
                  <SettingOutlined />
                </a-button>
              </div>
            </div>
            <div class="st-desc">{{ s.description }}</div>
            <div class="st-meta">
              <a-tag class="st-tag" v-if="s.content_directions.length">内容方向 {{ s.content_directions.length }}</a-tag>
              <a-tag class="st-tag">人设 {{ s.persona.length }}</a-tag>
              <a-tag class="st-tag">卖点 {{ s.selling_points.length }}</a-tag>
              <a-tag class="st-tag">受众 {{ s.audience.length }}</a-tag>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 编辑抽屉 -->
    <a-drawer
      v-model:open="formOpen"
      :title="form.id ? '编辑创作策略' : '新建创作策略'"
      :width="560"
      destroy-on-close
    >
      <a-form layout="vertical">
        <a-form-item label="策略名称" required>
          <a-input v-model:value="form.name" :maxlength="30" placeholder="如：从业多年的老销售" />
        </a-form-item>
        <a-form-item label="策略描述">
          <a-textarea v-model:value="form.description" :rows="3" placeholder="一句话描述这个策略面向什么客户、讲什么重点" />
        </a-form-item>
        <a-form-item label="人设">
          <a-select v-model:value="form.persona" mode="tags" placeholder="回车添加，如：从业多年的老销售" />
        </a-form-item>
        <a-form-item label="卖点（生成文章时必须覆盖）">
          <a-select v-model:value="form.selling_points" mode="tags" placeholder="回车添加卖点" />
        </a-form-item>
        <a-form-item label="目标受众">
          <a-select v-model:value="form.audience" mode="tags" placeholder="回车添加受众" />
        </a-form-item>
        <a-form-item label="内容方向">
          <div v-for="(d, i) in form.content_directions" :key="i" class="dir-row">
            <a-input v-model:value="d.name" style="width: 180px" placeholder="方向名称" />
            <a-input v-model:value="d.description" placeholder="方向说明" />
            <a-button type="text" danger @click="form.content_directions.splice(i, 1)"><DeleteOutlined /></a-button>
          </div>
          <a-button size="small" @click="form.content_directions.push({ name: '', description: '' })">
            <PlusOutlined /> 添加方向
          </a-button>
        </a-form-item>
        <a-form-item label="启用">
          <a-switch v-model:checked="form.enabled" />
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
import { message, Modal } from 'ant-design-vue';
import {
  ReloadOutlined,
  PlusOutlined,
  SettingOutlined,
  DeleteOutlined,
} from '@ant-design/icons-vue';
import PageWrapper from '../../components/PageWrapper.vue';
import { useAuthStore } from '../../stores/auth';
import {
  getStrategies,
  createStrategy,
  updateStrategy,
  toggleStrategy,
  deleteStrategy,
} from '../../api/contentpro';

const auth = useAuthStore();
const brandId = computed(() => auth.currentBrandId ?? 1);

const list = ref([]);
const formOpen = ref(false);
const saving = ref(false);
const emptyForm = () => ({
  id: null,
  name: '',
  description: '',
  persona: [],
  selling_points: [],
  audience: [],
  content_directions: [],
  enabled: true,
});
const form = ref(emptyForm());

const load = async () => {
  const data = await getStrategies({ brandId: brandId.value });
  list.value = data?.list ?? [];
};

const openForm = (s) => {
  form.value = s
    ? {
        id: s.id,
        name: s.name,
        description: s.description ?? '',
        persona: [...s.persona],
        selling_points: [...s.selling_points],
        audience: [...s.audience],
        content_directions: s.content_directions.map((d) => ({ ...d })),
        enabled: s.enabled,
      }
    : emptyForm();
  formOpen.value = true;
};

const save = async () => {
  if (!form.value.name.trim()) {
    message.warning('请填写策略名称');
    return;
  }
  saving.value = true;
  try {
    if (form.value.id) {
      await updateStrategy(form.value.id, form.value);
    } else {
      await createStrategy(form.value, { brandId: brandId.value });
    }
    message.success('已保存');
    formOpen.value = false;
    await load();
  } finally {
    saving.value = false;
  }
};

const onToggle = (s, v) => {
  toggleStrategy(s.id, v).then(() => {
    s.enabled = v;
  });
};

const remove = (s) => {
  Modal.confirm({
    title: `删除策略「${s.name}」？`,
    okType: 'danger',
    onOk: async () => {
      await deleteStrategy(s.id);
      message.success('已删除');
      await load();
    },
  });
};

onMounted(load);
</script>

<style scoped>
.pro-badge {
  padding: 1px 8px;
  border-radius: 4px;
  background: #facc15;
  color: #713f12;
  font-size: 12px;
  font-weight: 800;
  font-style: italic;
}

.st-layout {
  padding: 16px 20px;
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.st-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.st-title {
  font-size: 15px;
  font-weight: 600;
  color: #1e293b;
}

.st-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
  gap: 14px;
}

.st-card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 16px;
  transition: box-shadow 0.2s;
}

.st-card:hover {
  box-shadow: 0 6px 16px rgba(52, 86, 230, 0.08);
}

.st-card.disabled {
  opacity: 0.62;
}

.st-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.st-name {
  font-weight: 600;
  color: #1e293b;
  font-size: 14.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.st-ops {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: 0 0 auto;
}

.st-desc {
  margin-top: 8px;
  color: #64748b;
  font-size: 12.5px;
  line-height: 1.65;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 60px;
}

.st-meta {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.st-tag {
  margin: 0;
  background: #eef4ff;
  color: #3456e6;
  border: none;
  font-size: 11.5px;
}

.create-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 1px dashed #94a3b8;
  background: #f8fafc;
  cursor: pointer;
  min-height: 150px;
}

.create-icon {
  font-size: 26px;
  color: #3456e6;
}

.create-title {
  margin-top: 10px;
  color: #3456e6;
  font-weight: 600;
}

.create-sub {
  margin-top: 4px;
  color: #94a3b8;
  font-size: 12px;
}

.dir-row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}
</style>
