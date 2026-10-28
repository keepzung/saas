<template>
  <PageWrapper :title="editId ? '修改任务' : '新建任务'" :subtitle="editId ? '修改任务信息（派发对象创建后不可更改）；保存后完成度将按新口径重新计算。' : '创建各种类型的任务并下发给不同区域账号，销售终端会收到实时的任务推送。'">
    <template #extra>
      <a-space>
        <a-button @click="$router.push('/kox_task/content-task/task-list')">取消</a-button>
        <a-button type="primary" :loading="submitting" @click="submit">{{ editId ? '保 存' : '提 交' }}</a-button>
      </a-space>
    </template>

    <div class="ct-body">
      <a-alert v-if="editId" type="info" show-icon style="margin-bottom: 14px" message="编辑模式：派发对象（矩阵号/员工）创建后不可修改；时间与话题的变更会影响完成度重新计算。" />
      <div class="sec">
        <div class="sec-title"><span class="bar" /> 任务基本信息</div>
        <div class="form-row">
          <span class="form-label"><i>*</i> 任务名称：</span>
          <a-input v-model:value="form.name" style="width: 420px" :maxlength="40" placeholder="请输入任务名称" />
        </div>
        <div class="form-row">
          <span class="form-label"><i>*</i> 任务持续时间：</span>
          <a-range-picker v-model:value="form.range" value-format="YYYY-MM-DD" style="width: 320px" />
        </div>
        <template v-if="!editId">
          <div class="form-row">
            <span class="form-label"><i>*</i> 参与任务的团队：</span>
            <a-radio-group v-model:value="form.scopeType" @change="onScopeChange">
              <a-radio value="all">全部大区</a-radio>
              <a-radio value="regions">指定大区</a-radio>
              <a-radio value="users">指定员工</a-radio>
            </a-radio-group>
            <a-select
              v-if="form.scopeType === 'regions'"
              v-model:value="form.regions"
              mode="multiple"
              style="width: 320px"
              placeholder="选择大区"
              :options="regionOptions"
            />
            <a-select
              v-if="form.scopeType === 'users'"
              v-model:value="form.userIds"
              mode="multiple"
              show-search
              allow-clear
              style="width: 420px"
              placeholder="按姓名 / 手机号搜索并选择员工"
              :options="candidateOptions"
              :filter-option="filterCandidate"
            />
          </div>
          <div class="form-row" v-if="form.scopeType !== 'users'">
            <span class="form-label"><i>*</i> 账号类型：</span>
            <a-radio-group v-model:value="form.accountType">
              <a-radio value="">不限</a-radio>
              <a-radio value="KOS">仅KOS</a-radio>
              <a-radio value="KOB">仅KOB</a-radio>
              <a-radio value="素人">仅素人</a-radio>
            </a-radio-group>
          </div>
          <div class="form-row">
            <span class="form-label"><i>*</i> 任务目标平台：</span>
            <a-checkbox-group v-model:value="form.platforms" :options="[{ label: '小红书', value: 'xhs' }]" />
            <span class="form-hint">所勾选的平台的社媒账号参与与考核</span>
          </div>
          <div class="form-row">
            <span class="form-label">预估参与：</span>
            <span v-if="form.scopeType === 'users'" class="estimate">{{ form.userIds.length }} 名员工将参与该任务</span>
            <span v-else class="estimate">{{ previewCount }} 个账号将参与该任务</span>
          </div>
        </template>
      </div>

      <div class="sec">
        <div class="sec-title"><span class="bar" /> 添加任务详情</div>
        <div class="form-row top">
          <span class="form-label"><i>*</i> 指定话题：</span>
          <div>
            <a-select
              v-model:value="form.hashtags"
              mode="tags"
              style="width: 420px"
              :max-tag-count="5"
              placeholder="输入话题词后回车（可多个）"
              :token-separators="[',', '，', ' ']"
            />
            <div class="form-hint" style="margin-top: 6px">
              完成判定口径：员工笔记的<b>话题标签或标题包含任一话题词</b>即算完成任务；不设话题则发布即算
            </div>
          </div>
        </div>
        <div class="form-row top">
          <span class="form-label">创作要求：</span>
          <a-space>
            <span class="form-hint">正文≥</span>
            <a-input-number v-model:value="form.requireMinWords" :min="1" :precision="0" placeholder="字数" style="width: 100px" />
            <span class="form-hint">字</span>
            <span class="form-hint" style="margin-left: 12px">配图≥</span>
            <a-input-number v-model:value="form.requireMinImages" :min="1" :precision="0" placeholder="张数" style="width: 100px" />
            <span class="form-hint">张</span>
            <span class="form-hint">（留空=不要求；不达标提交时仅提醒）</span>
          </a-space>
        </div>
        <div class="form-row top">
          <span class="form-label">任务示例图片：</span>
          <div>
            <a-upload
              :show-upload-list="false"
              :before-upload="uploadExample"
              accept=".png,.jpg,.jpeg,.webp"
              multiple
            >
              <a-button><UploadOutlined /> 上传图片</a-button>
            </a-upload>
            <a-upload
              :show-upload-list="false"
              :before-upload="uploadDoc"
              accept=".pdf"
              style="margin-left: 10px"
            >
              <a-button><FilePdfOutlined /> 上传 PDF 示例</a-button>
            </a-upload>
            <span class="form-hint" style="margin-left: 10px">图片支持png/jpg/jpeg/webp（≤5Mb）；PDF 单个≤20Mb</span>
            <div v-if="form.exampleImages.length" class="example-grid">
              <div v-for="(u, i) in form.exampleImages" :key="u" class="example-cell">
                <img :src="u" />
                <span class="ex-del" @click="form.exampleImages.splice(i, 1)"><DeleteOutlined /></span>
              </div>
            </div>
            <div v-if="form.exampleDocs.length" class="doc-list">
              <div v-for="(d, i) in form.exampleDocs" :key="d.url" class="doc-item">
                <FilePdfOutlined class="doc-icon" />
                <a :href="d.url" target="_blank" class="doc-name">{{ d.name }}</a>
                <span class="ex-del" @click="form.exampleDocs.splice(i, 1)"><DeleteOutlined /></span>
              </div>
            </div>
          </div>
        </div>
        <div class="form-row top">
          <span class="form-label">添加示例内容：</span>
          <div style="flex: 1">
            <div class="form-hint" style="margin-bottom: 6px">填写内容链接，用户在小程序端可复制链接打开查看</div>
            <a-input v-model:value="form.exampleLink" style="width: 560px" placeholder="请添加内容链接" />
          </div>
        </div>
        <div class="form-row top">
          <span class="form-label">任务说明：</span>
          <div style="flex: 1">
            <div class="rich-toolbar">
              <button type="button" title="加粗" @click="wrapBold"><BoldOutlined /></button>
              <button type="button" title="红色" @click="wrapColor"><FontColorsOutlined /></button>
            </div>
            <a-textarea v-model:value="form.instructions" :rows="6" placeholder="请输入任务说明...（支持 **加粗** 语法，示例工具会原样下发）" />
            <div class="form-hint" style="margin-top: 6px">支持加粗、换颜色、换行等基础格式</div>
          </div>
        </div>
        <div class="form-row top">
          <span class="form-label">任务奖励机制：</span>
          <a-textarea v-model:value="form.reward" :rows="3" style="width: 560px" placeholder="请添加任务奖励机制" />
        </div>
      </div>
    </div>
  </PageWrapper>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import {
  UploadOutlined,
  DeleteOutlined,
  BoldOutlined,
  FilePdfOutlined,
  FontColorsOutlined,
} from '@ant-design/icons-vue';
import PageWrapper from '../../components/PageWrapper.vue';
import { useAuthStore } from '../../stores/auth';
import { createContentTask, getTaskCandidates, uploadTaskDoc, updateContentTask, getContentTaskDetail } from '../../api/contentpro';
import { getKoxAccounts } from '../../api/kox';
import { uploadMaterialImage } from '../../api/contentpro';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const brandId = computed(() => auth.currentBrandId ?? 1);
// 编辑模式：?id=任务ID（派发对象不可改，仅任务信息）
const editId = computed(() => (route.query.id ? Number(route.query.id) : null));

const form = ref({
  name: '',
  range: [],
  scopeType: 'all',
  regions: [],
  userIds: [],
  accountType: '',
  platforms: ['xhs'],
  hashtags: [],
  requireMinWords: null,
  requireMinImages: null,
  exampleImages: [],
  exampleDocs: [],
  exampleLink: '',
  instructions: '',
  reward: '',
});

const regionOptions = ref([]);
const accounts = ref([]);
const candidates = ref([]);
const submitting = ref(false);

const candidateOptions = computed(() =>
  candidates.value.map((c) => ({ label: `${c.name}（${c.phone}）`, value: c.id })),
);
const filterCandidate = (input, option) => {
  const c = candidates.value.find((x) => x.id === option.value);
  if (!c) return false;
  return c.name.includes(input.trim()) || c.phone.includes(input.trim());
};
const onScopeChange = () => {
  if (form.value.scopeType !== 'users') form.value.userIds = [];
};

const previewCount = computed(() => {
  let rows = accounts.value;
  if (form.value.accountType) rows = rows.filter((a) => a.account_type === form.value.accountType);
  if (form.value.scopeType === 'regions' && form.value.regions.length) {
    rows = rows.filter((a) => form.value.regions.includes(a.region_name));
  }
  return rows.length;
});

const loadAccounts = async () => {
  const res = await getKoxAccounts({ brandId: brandId.value, page: 1, page_size: 1000 });
  accounts.value = res?.list ?? [];
  const facets = res?.region_facets ?? [];
  regionOptions.value = facets.map((r) => ({ label: r, value: r }));
};

const loadCandidates = async () => {
  try {
    const res = await getTaskCandidates({ brandId: brandId.value });
    candidates.value = res?.list ?? [];
  } catch {
    candidates.value = [];
  }
};

const uploadExample = async (file) => {
  try {
    const res = await uploadMaterialImage(file, brandId.value);
    if (!res?.url) throw new Error(res?.error ?? '上传失败');
    form.value.exampleImages.push(res.url);
  } catch (e) {
    message.error(e?.message ?? '上传失败');
  }
  return false;
};

const uploadDoc = async (file) => {
  if (file.size > 20 * 1024 * 1024) {
    message.warning('PDF 超过 20MB 限制');
    return false;
  }
  try {
    const res = await uploadTaskDoc(file, brandId.value);
    if (!res?.url) throw new Error(res?.error ?? '上传失败');
    form.value.exampleDocs.push({ url: res.url, name: res.name || file.name });
    message.success(`已上传 ${res.name || file.name}`);
  } catch (e) {
    message.error(e?.message ?? '上传失败');
  }
  return false;
};

const wrapBold = () => {
  form.value.instructions = `${form.value.instructions}**加粗内容**`;
};

const wrapColor = () => {
  form.value.instructions = `${form.value.instructions}【红色：重点内容】`;
};

const submit = async () => {
  if (!form.value.name.trim()) {
    message.warning('请输入任务名称');
    return;
  }
  if (!form.value.range?.length) {
    message.warning('请选择任务持续时间');
    return;
  }
  if (form.value.scopeType === 'regions' && !form.value.regions.length) {
    message.warning('请至少选择一个大区');
    return;
  }
  if (form.value.scopeType === 'users' && !form.value.userIds.length) {
    message.warning('请至少选择一名员工');
    return;
  }
  submitting.value = true;
  try {
    const infoPayload = {
      name: form.value.name.trim(),
      startTime: form.value.range[0],
      endTime: form.value.range[1],
      platform: form.value.platforms[0] ?? 'xhs',
      hashtags: form.value.hashtags.map((h) => String(h).trim().replace(/^#/, '')).filter(Boolean),
      requireMinWords: form.value.requireMinWords ?? undefined,
      requireMinImages: form.value.requireMinImages ?? undefined,
      exampleImages: [
        ...form.value.exampleImages,
        ...form.value.exampleDocs.map((d) => d.url),
      ],
      exampleLink: form.value.exampleLink || undefined,
      instructions: form.value.instructions || undefined,
      reward: form.value.reward || undefined,
    };
    if (editId.value) {
      await updateContentTask(editId.value, infoPayload, { brandId: brandId.value });
      message.success('任务已更新');
    } else {
      const res = await createContentTask(
        {
          ...infoPayload,
          scopeType: form.value.scopeType,
          regions: form.value.scopeType === 'regions' ? form.value.regions : [],
          accountTypes: form.value.scopeType === 'users' ? [] : form.value.accountType ? [form.value.accountType] : [],
          userIds: form.value.scopeType === 'users' ? form.value.userIds : undefined,
        },
        { brandId: brandId.value },
      );
      const total = (res?.user_total ?? 0) + (res?.account_total ?? 0);
      message.success(`任务已创建，${total} 个对象参与`);
    }
    router.push('/kox_task/content-task/task-list');
  } catch (e) {
    message.error(e?.response?.data?.msg ?? (editId.value ? '保存失败' : '创建失败'));
  } finally {
    submitting.value = false;
  }
};

const loadForEdit = async () => {
  try {
    const t = await getContentTaskDetail(editId.value, { brandId: brandId.value });
    form.value.name = t?.name ?? '';
    form.value.range = t?.start_time && t?.end_time ? [t.start_time.slice(0, 10), t.end_time.slice(0, 10)] : [];
    form.value.hashtags = t?.hashtags ?? [];
    form.value.requireMinWords = t?.require_min_words ?? null;
    form.value.requireMinImages = t?.require_min_images ?? null;
    form.value.exampleImages = (t?.example_images ?? []).filter((u) => !/\.pdf($|\?)/i.test(u));
    form.value.exampleDocs = (t?.example_images ?? [])
      .filter((u) => /\.pdf($|\?)/i.test(u))
      .map((u) => ({ url: u, name: '示例文档.pdf' }));
    form.value.exampleLink = t?.example_link ?? '';
    form.value.instructions = t?.instructions ?? '';
    form.value.reward = t?.reward ?? '';
    form.value.platforms = [t?.platform ?? 'xhs'];
  } catch (e) {
    message.error('任务加载失败');
    router.push('/kox_task/content-task/task-list');
  }
};

onMounted(() => {
  loadAccounts();
  loadCandidates();
  if (editId.value) loadForEdit();
});
</script>

<style scoped>
.ct-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 18px 22px;
}

.sec {
  background: #fff;
  border-radius: 16px;
  padding: 20px 22px;
  margin-bottom: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.sec-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 16px;
}

.sec-title .bar {
  width: 4px;
  height: 15px;
  border-radius: 2px;
  background: #3456e6;
}

.form-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.form-row.top {
  align-items: flex-start;
}

.form-label {
  width: 130px;
  flex: 0 0 130px;
  color: #475569;
  font-size: 13.5px;
}

.form-label i {
  color: #ff4d4f;
  font-style: normal;
  margin-right: 2px;
}

.form-hint {
  color: #94a3b8;
  font-size: 12px;
}

.estimate {
  color: #3456e6;
  font-size: 13px;
  font-weight: 600;
}

.example-grid {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.doc-list {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.doc-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  width: 420px;
}

.doc-icon {
  color: #e11d48;
  font-size: 16px;
}

.doc-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.doc-item .ex-del {
  cursor: pointer;
  color: #94a3b8;
}

.doc-item .ex-del:hover {
  color: #ef4444;
}

.example-cell {
  position: relative;
  width: 96px;
  height: 96px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #e2e8f0;
}

.example-cell img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ex-del {
  position: absolute;
  top: 4px;
  right: 4px;
  background: rgba(15, 23, 42, 0.6);
  color: #fff;
  border-radius: 50%;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 12px;
}

.rich-toolbar {
  display: flex;
  gap: 6px;
  margin-bottom: 6px;
}

.rich-toolbar button {
  width: 30px;
  height: 30px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  color: #475569;
}

.rich-toolbar button:hover {
  border-color: #3456e6;
  color: #3456e6;
}
</style>
