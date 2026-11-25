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
      <div class="ai-fill" v-if="!form.id">
        <div class="ai-fill-title"><ThunderboltOutlined /> AI 起草（选择产品即可自动生成，也可填空引导）</div>
        <a-form-item label="产品（必选，卖点/资料从这里读取）">
          <a-select
            v-model:value="aiFill.productId"
            :options="productOptions"
            placeholder="选择产品（可选）"
            allow-clear
            show-search
            option-filter-prop="label"
          />
        </a-form-item>
        <a-form-item label="写作角度（选填）">
          <a-input v-model:value="aiFill.angle" :maxlength="60" placeholder="如：装修师傅视角 / 一个月电费实测" />
        </a-form-item>
        <a-form-item label="想表达的观点（选填）">
          <a-textarea v-model:value="aiFill.viewpoint" :rows="2" :maxlength="200" placeholder="如：中央空调不是贵，是算完总账之后更省" />
        </a-form-item>
        <a-form-item label="重要的点（选填，可引导 AI 重点覆盖）">
          <a-textarea v-model:value="aiFill.keyPoints" :rows="3" placeholder="生成文章时必须讲到的点，每行一个" />
        </a-form-item>
        <a-button type="primary" block :loading="aiGenerating" @click="aiGenerate">AI 生成写作策略</a-button>
        <a-divider plain style="margin: 12px 0 4px">生成后可自行调整，再保存</a-divider>
      </div>
      <a-form layout="vertical">
        <a-form-item label="策略名称" required>
          <a-input v-model:value="form.name" :maxlength="30" placeholder="如：从业多年的老销售" />
        </a-form-item>
        <a-form-item label="策略描述">
          <a-textarea v-model:value="form.description" :rows="3" placeholder="一句话描述这个策略面向什么客户、讲什么重点" />
        </a-form-item>
        <a-form-item label="策略类型">
          <a-radio-group v-model:value="form.mode">
            <a-radio value="open">开放式写作（素人/KOC/矩阵号，随机性高）</a-radio>
            <a-radio value="precise">精准写作（品牌官号/蓝V，约束强）</a-radio>
          </a-radio-group>
        </a-form-item>
        <a-form-item label="写作要求提示词（支持变量占位符）">
          <div class="var-btns">
            <a-button
              v-for="v in varButtons"
              :key="v"
              size="small"
              @click="appendVar(v)"
            >【{{ v }}】</a-button>
          </div>
          <a-textarea
            v-model:value="form.prompt"
            :rows="7"
            placeholder="带【产品卖点】【人设】【目标受众】等占位符的写作要求模板；也可直接写固定要求。生成文章时按此提示词优先执行"
          />
        </a-form-item>
        <a-form-item label="内容格式（字数/结构/标题要求）">
          <a-textarea v-model:value="form.format_text" :rows="2" placeholder="如：300-600字，3段式，标题≤20字带数字" />
        </a-form-item>
        <a-form-item label="必带标签（每行一个，正文自然提及+文末带话题）">
          <a-textarea v-model:value="form.required_tags_text" :rows="2" placeholder="每行一个，如：#格力中央空调" />
        </a-form-item>
        <a-form-item label="绝对不要写（每行一条）">
          <a-textarea v-model:value="form.forbidden_text" :rows="2" placeholder="每行一条，如：不夸大功效，不做医疗表述，不贬低竞品" />
        </a-form-item>
        <a-form-item label="语气偏向（顿号分隔）">
          <a-input v-model:value="form.tone_text" placeholder="如：亲切、口语化、有生活气" />
        </a-form-item>
        <a-form-item label="人设（每行一个）">
          <a-textarea v-model:value="form.persona_text" :rows="2" placeholder="每行一个人设，如：从业多年的老销售" />
        </a-form-item>
        <a-form-item label="卖点（生成文章时必须覆盖，每行一个）">
          <a-textarea v-model:value="form.selling_points_text" :rows="3" placeholder="每行一个卖点" />
        </a-form-item>
        <a-form-item label="目标受众（每行一个）">
          <a-textarea v-model:value="form.audience_text" :rows="2" placeholder="每行一个目标受众" />
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
        <a-form-item label="视觉编排（AI 写完后的取图方式）">
          <a-radio-group v-model:value="form.visual_mode">
            <a-radio value="random">智能随机（按数量随机取图，同套图优先）</a-radio>
            <a-radio value="precise">精准编排（按类型标签逐位取图，需素材已打标）</a-radio>
          </a-radio-group>
          <div v-if="form.visual_mode === 'random'" class="visual-row">
            取图数量：
            <a-input-number v-model:value="form.visual_count" :min="1" :max="9" />
            张（建议 3-6，最多 9）
          </div>
          <div v-else class="visual-slots">
            <div v-for="(s, i) in form.visual_slots" :key="i" class="dir-row">
              <a-input v-model:value="s.position" style="width: 160px" placeholder="图片位置，如：封面/图2" />
              <a-select
                v-model:value="s.tagId"
                style="flex: 1"
                :options="typeOptions"
                placeholder="该位置的类型标签"
                allow-clear
              />
              <a-button type="text" danger @click="form.visual_slots.splice(i, 1)"><DeleteOutlined /></a-button>
            </div>
            <a-button size="small" @click="form.visual_slots.push({ position: '', tagId: null })">
              <PlusOutlined /> 添加图片位置
            </a-button>
          </div>
          <div class="visual-row" style="margin-top: 8px">
            指定套图（选填，限定只从该套图取图）：
            <a-select v-model:value="form.visual_set" style="width: 220px" allow-clear :options="setOptions" placeholder="不指定，系统自动匹配" />
          </div>
        </a-form-item>
        <a-form-item label="绑定产品（该策略适用的产品，可多选）">
          <a-select
            v-model:value="form.bound_products"
            mode="multiple"
            :options="productOptions"
            placeholder="选择适用的产品"
            allow-clear
          />
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
  ThunderboltOutlined,
  ReloadOutlined,
  PlusOutlined,
  SettingOutlined,
  DeleteOutlined,
} from '@ant-design/icons-vue';
import PageWrapper from '../../components/PageWrapper.vue';
import { useAuthStore } from '../../stores/auth';
import { getProducts } from '../../api/content';
import {
  generateStrategy,
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
  prompt: '',
  mode: 'open',
  format_text: '',
  required_tags_text: '',
  forbidden_text: '',
  tone_text: '',
  visual_mode: 'random',
  visual_count: 4,
  visual_set: null,
  visual_slots: [],
  bound_products: [],
  persona: [],
  selling_points: [],
  audience: [],
  persona_text: '',
  selling_points_text: '',
  audience_text: '',
  content_directions: [],
  enabled: true,
});
const varButtons = ['产品名称', '产品卖点', '产品知识', '人设', '目标受众', '钩子'];
const appendVar = (v) => {
  form.value.prompt = (form.value.prompt ? form.value.prompt + '\n' : '') + '【' + v + '】';
};
const form = ref(emptyForm());
const NL = String.fromCharCode(10);
const productOptions = ref([]);
const aiFill = ref({ productId: null, angle: '', viewpoint: '', keyPoints: '' });
const aiGenerating = ref(false);

const loadProducts = async () => {
  try {
    const tree = (await getProducts({ brandId: brandId.value })) ?? [];
    const walk = (nodes, out = []) => {
      for (const n of nodes ?? []) {
        const t = n.type ?? n.configType;
        if (t === 'product') out.push({ label: n.display_name ?? n.name, value: n.id });
        walk(n.children, out);
      }
      return out;
    };
    productOptions.value = walk(tree);
  } catch {
    // 产品树加载失败不阻塞策略表单
  }
};

const aiGenerate = async () => {
  const f = aiFill.value;
  if (!f.productId && !f.angle.trim() && !f.viewpoint.trim() && !f.keyPoints.trim()) {
    message.warning('先至少填写一个空（角度/观点/要点）');
    return;
  }
  aiGenerating.value = true;
  try {
    const draft = await generateStrategy(
      { productId: f.productId ?? null, angle: f.angle.trim(), viewpoint: f.viewpoint.trim(), keyPoints: f.keyPoints.trim() },
      { brandId: brandId.value },
    );
    const d = draft ?? {};
    if (d.name) form.value.name = d.name;
    if (d.description) form.value.description = d.description;
    if (d.prompt) form.value.prompt = d.prompt;
    if (d.mode) form.value.mode = d.mode;
    if (d.format_text) form.value.format_text = d.format_text;
    if (d.required_tags) form.value.required_tags_text = (d.required_tags ?? []).join('\n');
    if (d.forbidden) form.value.forbidden_text = d.forbidden;
    if (d.tone) form.value.tone_text = (d.tone ?? []).join('、');
    if (d.visual) {
      form.value.visual_mode = d.visual.mode ?? 'random';
      form.value.visual_count = d.visual.count ?? 4;
      form.value.visual_set = d.visual.set_id ?? null;
      form.value.visual_slots = (d.visual.slots ?? []).map((x) => ({ position: x.position ?? '', tagId: x.tagId ?? null }));
    }
    if (d.bound_product_ids) form.value.bound_products = [...(d.bound_product_ids ?? [])];
    form.value.persona = Array.isArray(d.persona) ? d.persona : [];
    form.value.selling_points = Array.isArray(d.selling_points) ? d.selling_points : [];
    form.value.audience = Array.isArray(d.audience) ? d.audience : [];
    form.value.persona_text = form.value.persona.join(NL);
    form.value.selling_points_text = form.value.selling_points.join(NL);
    form.value.audience_text = form.value.audience.join(NL);
    form.value.content_directions = Array.isArray(d.content_directions)
      ? d.content_directions.map((x) => ({ name: x.name ?? '', description: x.description ?? '' }))
      : [];
    if (!form.value.content_directions.length) form.value.content_directions.push({ name: '', description: '' });
    message.success('策略已生成，调整后点「保存」即可');
  } catch (e) {
    message.error(e?.response?.data?.msg ?? e?.message ?? 'AI 生成失败');
  } finally {
    aiGenerating.value = false;
  }
};



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
        prompt: s.prompt ?? '',
        mode: s.mode ?? 'open',
        format_text: s.format_text ?? '',
        required_tags_text: (s.required_tags ?? []).join('\n'),
        forbidden_text: s.forbidden_text ?? '',
        tone_text: (s.tone ?? []).join('、'),
        visual_mode: s.visual?.mode ?? 'random',
        visual_count: s.visual?.count ?? 4,
        visual_set: s.visual?.setId ?? null,
        visual_slots: (s.visual?.slots ?? []).map((x) => ({ position: x.position ?? '', tagId: x.tagId ?? null })),
        bound_products: [...(s.bound_product_ids ?? [])],
        persona: [...s.persona],
        selling_points: [...s.selling_points],
        audience: [...s.audience],
        persona_text: (s.persona ?? []).join('\n'),
        selling_points_text: (s.selling_points ?? []).join('\n'),
        audience_text: (s.audience ?? []).join('\n'),
        content_directions: s.content_directions.map((d) => ({ ...d })),
        enabled: s.enabled,
      }
    : emptyForm();
  if (!s) aiFill.value = { productId: null, angle: '', viewpoint: '', keyPoints: '' };
  formOpen.value = true;
};

const save = async () => {
  if (!form.value.name.trim()) {
    message.warning('请填写策略名称');
    return;
  }
  // 多行文本 → 数组（兼容中文输入法：不再依赖回车逐条添加）
  const toLines = (t) => String(t ?? '').split('\n').map((x) => x.trim()).filter(Boolean);
  form.value.persona = toLines(form.value.persona_text);
  form.value.selling_points = toLines(form.value.selling_points_text);
  form.value.audience = toLines(form.value.audience_text);
  form.value.required_tags = toLines(form.value.required_tags_text);
  form.value.tone = form.value.tone_text.split(/[、,，]/).map((x) => x.trim()).filter(Boolean);
  form.value.visual = {
    mode: form.value.visual_mode,
    count: form.value.visual_count || 4,
    setId: form.value.visual_set ?? null,
    slots: (form.value.visual_slots ?? []).map((s) => ({ position: s.position ?? '', tagId: s.tagId ?? null })),
  };
  form.value.boundProductIds = (form.value.bound_products ?? []).map(Number).filter(Number.isInteger);
  form.value.formatText = form.value.format_text;
  form.value.forbiddenText = form.value.forbidden_text;
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

onMounted(() => {
  load();
  loadProducts();
});
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

.var-btns {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 6px;
}

.visual-row {
  color: #475569;
  font-size: 13px;
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.visual-slots {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
</style>
