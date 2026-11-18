<template>
  <PageWrapper title="我的音色">
    <FilterTopbar>
      <a-button type="primary" @click="openCreate"><PlusOutlined /> 提交我的声音</a-button>
      <a-button :loading="syncing" @click="doSync"><SyncOutlined /> 同步平台音色</a-button>
      <span class="tip">
        已训练的复刻音色在视频工坊直接可选；新录声音需在火山控制台完成训练后自动出现
        <a-tag v-if="loaded && !configured" color="red" class="mock-tag">未配置 SPARKHUB_API_KEY</a-tag>
      </span>
    </FilterTopbar>

    <a-spin :spinning="loading">
      <div class="list">
        <div v-for="v in list" :key="v.id" class="row">
          <div class="avatar">🎙</div>
          <div class="main">
            <div class="name">
              {{ v.name }}
              <a-tag :color="statusColor(v)">{{ statusText(v) }}</a-tag>
              <a-tag v-if="v.source === 'platform'" color="blue">平台音色</a-tag>
            </div>
            <div class="meta">
              <span v-if="v.duration_sec">样音 {{ v.duration_sec }}s</span>
              <span>创建于 {{ shortTime(v.created_at) }}</span>
              <span v-if="v.voice_type" class="code">{{ v.voice_type }}</span>
            </div>
            <div v-if="v.status === 'waiting'" class="hint">待训练：录音已保存，由运营在火山控制台完成声音复刻训练后，本音色将变为「可用」（通常约 10 分钟）</div>
            <div v-if="v.error_msg" class="err">{{ v.error_msg }}</div>
          </div>
          <div class="ops">
            <a-button
              size="small"
              :loading="previewingId === v.id"
              :disabled="v.status !== 'ready'"
              @click="tryPreview(v)"
            >试听</a-button>
            <a-button v-if="v.source === 'local'" size="small" danger @click="remove(v)">删除</a-button>
          </div>
        </div>
      </div>
      <a-empty v-if="!list.length && !loading" description="还没有可用音色：点「同步平台音色」拉取已训练音色，或提交自己的声音" />
    </a-spin>

    <a-modal v-model:open="createOpen" title="提交我的声音" :footer="null" width="560px" @after-close="resetCreate">
      <a-form layout="vertical">
        <a-form-item label="音色名称" required>
          <a-input v-model:value="form.name" :maxlength="20" placeholder="如：王总的声音（训练时请用同名便于关联）" />
        </a-form-item>

        <a-form-item label="训练音频" required>
          <a-tabs v-model:activeKey="tab">
            <a-tab-pane key="record" tab="麦克风录音">
              <VoiceRecorder @recorded="onRecorded" />
              <div v-if="recordBlob" class="sample-info">
                <a-spin v-if="uploading" size="small" />
                <span v-else-if="form.sampleUrl">✓ 已就绪（{{ form.durationSec }}s）</span>
                <span v-else>上传中…</span>
              </div>
            </a-tab-pane>
            <a-tab-pane key="upload" tab="上传音频文件">
              <a-upload
                :show-upload-list="false"
                :before-upload="onUpload"
                accept=".webm,.mp3,.wav,.m4a,.aac,.ogg,.mp4"
              >
                <a-button :loading="uploading"><UploadOutlined /> 选择音频文件</a-button>
              </a-upload>
              <span class="sample-info">
                {{ form.sampleUrl ? `✓ 已就绪（${form.durationSec}s）` : '支持 mp3 / wav / m4a / webm 等，10 秒 ~ 5 分钟' }}
              </span>
            </a-tab-pane>
          </a-tabs>
        </a-form-item>

        <div class="quality-tips">
          <div class="t">录音质量决定复刻效果：</div>
          <div>· 安静环境，远离空调/风扇噪音</div>
          <div>· 只有一个说话人，语速自然、音量稳定</div>
          <div>· 建议朗读一段 30 秒以上的文字（10 秒为下限）</div>
        </div>

        <a-checkbox v-model:checked="form.consent" class="consent">
          我确认已获得声音所有者本人授权，同意将该声音用于 AI 配音合成
        </a-checkbox>

        <a-button
          type="primary"
          block
          :loading="submitting"
          :disabled="!form.name || !form.sampleUrl || !form.consent"
          @click="submit"
        >提交样音</a-button>
        <div class="train-hint">
          提交后进入「待训练」：由运营在火山控制台（声音复刻）上传该录音完成训练，
          训练成功后点「同步平台音色」即可使用
        </div>
      </a-form>
    </a-modal>
  </PageWrapper>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { Modal, message } from 'ant-design-vue';
import { PlusOutlined, SyncOutlined, UploadOutlined } from '@ant-design/icons-vue';
import PageWrapper from '../../components/PageWrapper.vue';
import FilterTopbar from '../../components/FilterTopbar.vue';
import VoiceRecorder from '../../components/VoiceRecorder.vue';
import { useAuthStore } from '../../stores/auth';
import {
  createCustomVoice,
  deleteCustomVoice,
  getCustomVoices,
  previewCustomVoice,
  syncVoices,
  uploadVoiceSample,
} from '../../api/hotspot';

const auth = useAuthStore();
const brandId = computed(() => auth.currentBrandId ?? 1);

const list = ref([]);
const limit = ref(3);
const configured = ref(true);
const loaded = ref(false);
const loading = ref(false);
const syncing = ref(false);
const createOpen = ref(false);
const submitting = ref(false);
const uploading = ref(false);
const previewingId = ref(null);
const tab = ref('record');
const recordBlob = ref(null);
const form = ref({ name: '', sampleUrl: '', durationSec: 0, consent: false });

const statusColor = (v) => (v.status === 'ready' ? 'green' : v.status === 'waiting' ? 'orange' : 'red');
const statusText = (v) => ({ ready: '可用', waiting: '待训练', failed: '失败' }[v.status] ?? v.status);
const shortTime = (t) => (t ? new Date(t).toLocaleString('zh-CN', { hour12: false }).slice(5, 16) : '');

const load = async () => {
  loading.value = list.value.length === 0;
  try {
    const res = await getCustomVoices({ brandId: brandId.value });
    list.value = res?.items ?? [];
    limit.value = res?.limit ?? 3;
    configured.value = res?.configured !== false;
    loaded.value = true;
  } finally {
    loading.value = false;
  }
};

const doSync = async () => {
  syncing.value = true;
  try {
    const res = await syncVoices({ brandId: brandId.value });
    message.success(`已同步，当前可用平台音色 ${res?.synced ?? 0} 个`);
    load();
  } catch (e) {
    message.error(e?.message ?? '同步失败');
  } finally {
    syncing.value = false;
  }
};

const openCreate = () => {
  resetCreate();
  createOpen.value = true;
};

const resetCreate = () => {
  form.value = { name: '', sampleUrl: '', durationSec: 0, consent: false };
  recordBlob.value = null;
  tab.value = 'record';
};

const onRecorded = async (blob) => {
  recordBlob.value = blob;
  const file = new File([blob], 'record.webm', { type: blob.type || 'audio/webm' });
  await uploadSample(file);
};

const onUpload = async (file) => {
  if (file.size > 25 * 1024 * 1024) {
    message.warning('音频不能超过 25MB');
    return false;
  }
  await uploadSample(file);
  return false;
};

const uploadSample = async (file) => {
  uploading.value = true;
  form.value.sampleUrl = '';
  try {
    const res = await uploadVoiceSample(file, brandId.value);
    form.value.sampleUrl = res.url;
    form.value.durationSec = res.duration_sec;
    message.success(`音频已就绪（${res.duration_sec} 秒）`);
  } catch (e) {
    recordBlob.value = null;
    message.error(e?.message ?? '音频上传失败');
  } finally {
    uploading.value = false;
  }
};

const submit = async () => {
  submitting.value = true;
  try {
    await createCustomVoice(
      { brandId: brandId.value, name: form.value.name, sampleUrl: form.value.sampleUrl, consent: form.value.consent },
      { brandId: brandId.value },
    );
    message.success('样音已保存，进入待训练');
    createOpen.value = false;
    load();
  } catch (e) {
    message.error(e?.message ?? '提交失败');
  } finally {
    submitting.value = false;
  }
};

const tryPreview = async (v) => {
  previewingId.value = v.id;
  try {
    const r = await previewCustomVoice(v.id, { brandId: brandId.value });
    await new Audio(r.url).play().catch(() => message.warning('浏览器拦截了自动播放，请再点一次试听'));
  } catch (e) {
    message.error(e?.message ?? '试听失败');
  } finally {
    previewingId.value = null;
  }
};

const remove = (v) => {
  Modal.confirm({
    title: `删除待训练样音「${v.name}」？`,
    content: '删除后运营将无法用这条录音训练；已训练的平台音色不受影响。',
    okType: 'danger',
    okText: '删除',
    onOk: async () => {
      try {
        await deleteCustomVoice(v.id, { brandId: brandId.value });
        message.success('已删除');
        load();
      } catch (e) {
        message.error(e?.message ?? '删除失败');
      }
    },
  });
};

onMounted(load);
</script>

<style scoped>
.tip { color: #999; font-size: 12px; display: flex; align-items: center; gap: 6px; }
.mock-tag { margin: 0; }
.list { display: flex; flex-direction: column; gap: 12px; margin-top: 12px; }
.row { display: flex; gap: 14px; align-items: center; background: #fff; border: 1px solid #f0f0f0; border-radius: 12px; padding: 14px; }
.avatar { width: 44px; height: 44px; border-radius: 50%; background: #f0f5ff; display: flex; align-items: center; justify-content: center; font-size: 20px; }
.main { flex: 1; min-width: 0; }
.name { font-weight: 600; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.meta { margin-top: 4px; font-size: 12px; color: #999; display: flex; gap: 14px; flex-wrap: wrap; }
.meta .code { color: #bbb; font-family: monospace; }
.hint { margin-top: 6px; font-size: 12px; color: #fa8c16; }
.err { margin-top: 6px; color: #ff4d4f; font-size: 12px; word-break: break-all; }
.ops { display: flex; flex-direction: column; gap: 8px; }
.sample-info { margin-left: 10px; font-size: 12px; color: #52c41a; }
.quality-tips { background: #fafafa; border-radius: 8px; padding: 10px 12px; font-size: 12px; color: #666; margin-bottom: 12px; }
.quality-tips .t { font-weight: 600; color: #333; margin-bottom: 2px; }
.consent { margin-bottom: 16px; }
.train-hint { margin-top: 10px; font-size: 12px; color: #999; text-align: center; line-height: 1.6; }
</style>
