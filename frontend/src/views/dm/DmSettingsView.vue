<template>
  <PageWrapper title="智能私信">
    <a-alert
      v-if="config.dry_run"
      type="info"
      show-icon
      class="dm-alert"
      message="dry-run 模式：AI 全链路运行（意图识别/打标/回复生成/合规拦截），但回复只记录不发送给客户。来鼓发送通道接入后关闭此开关即真实外发。"
    />
    <a-tabs v-model:activeKey="tab">
      <a-tab-pane key="settings" tab="接待设置" />
      <a-tab-pane key="logs" tab="回复日志" />
      <a-tab-pane key="sla" tab="SLA 看板" />
    </a-tabs>

    <!-- 接待设置 -->
    <div v-if="tab === 'settings'" class="dm-body">
      <a-spin :spinning="loading">
        <a-form layout="vertical" class="dm-form">
          <a-row :gutter="24">
            <a-col :span="12">
              <a-form-item label="总开关（开启后自动处理新私信）">
                <a-switch v-model:checked="config.enabled" />
              </a-form-item>
              <a-form-item label="自动生成回复">
                <a-switch v-model:checked="config.auto_reply" />
              </a-form-item>
              <a-form-item label="dry-run 模式（只记录不外发）">
                <a-switch v-model:checked="config.dry_run" />
              </a-form-item>
              <a-form-item label="高意向线索推企微群">
                <a-switch v-model:checked="config.notify_wecom" />
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item label="3 分钟回复 SLA（分钟）">
                <a-input-number v-model:value="config.sla_minutes" :min="1" :max="60" style="width: 100%" />
              </a-form-item>
              <a-form-item label="上下文携带轮数">
                <a-input-number v-model:value="config.context_turns" :min="2" :max="30" style="width: 100%" />
              </a-form-item>
              <a-form-item label="品牌人设模板（门店人设卡）">
                <a-select
                  v-model:value="config.persona_template_id"
                  allow-clear
                  placeholder="选择模板库中的门店人设模板"
                  :options="personaOptions"
                />
              </a-form-item>
              <a-form-item>
                <a-button type="primary" :loading="saving" @click="save">保存设置</a-button>
                <a-button style="margin-left: 12px" :loading="processing" @click="processNow">
                  立即处理待接待会话
                </a-button>
              </a-form-item>
            </a-col>
          </a-row>
        </a-form>
      </a-spin>
      <div class="dm-tip">
        私信工作台在「<router-link to="/laigu/leads">私信线索</router-link>」页（会话内可人工接管 / 查看 AI 干预记录）；
        接待话术与合规词库在「<router-link to="/content-pro/config/rules">知识库规则</router-link>」维护。
      </div>
    </div>

    <!-- 回复日志 -->
    <div v-else-if="tab === 'logs'" class="dm-body">
      <a-table
        :columns="logColumns"
        :data-source="logs"
        row-key="id"
        size="small"
        :loading="logsLoading"
        :pagination="{ total: logsTotal, pageSize: logsPageSize, current: logsPage, showSizeChanger: false, onChange: (p) => { logsPage = p; loadLogs(); } }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'status'">
            <a-tag :color="statusColor(record.status)">{{ statusLabel(record.status) }}</a-tag>
          </template>
          <template v-else-if="column.key === 'final'">
            <span class="dm-final">{{ record.final_content || record.draft }}</span>
          </template>
          <template v-else-if="column.key === 'level'">
            <a-tag v-if="record.lead_level" :color="{ H: 'red', A: 'orange', B: 'blue', C: 'default' }[record.lead_level]">
              {{ record.lead_level }}
            </a-tag>
            <span v-else>-</span>
          </template>
          <template v-else-if="column.key === 'created'">
            {{ fmtTime(record.created_at) }}
          </template>
        </template>
      </a-table>
    </div>

    <!-- SLA 看板 -->
    <div v-else class="dm-body">
      <div class="sla-head">
        <span>按客户首条消息日聚合；目标 {{ slaMinutes }} 分钟内首响（真实回复口径，dry-run 不计入）</span>
        <a-button size="small" @click="loadSla"><ReloadOutlined /> 刷新</a-button>
      </div>
      <a-table
        :columns="slaColumns"
        :data-source="slaRows"
        row-key="day"
        size="small"
        :loading="slaLoading"
        :pagination="false"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'sla_rate'">
            <span :class="{ 'sla-ok': record.sla_rate != null && record.sla_rate >= 90, 'sla-bad': record.sla_rate != null && record.sla_rate < 70 }">
              {{ record.sla_rate != null ? record.sla_rate + '%' : '-' }}
            </span>
          </template>
        </template>
      </a-table>
    </div>
  </PageWrapper>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { message } from 'ant-design-vue';
import { ReloadOutlined } from '@ant-design/icons-vue';
import PageWrapper from '../../components/PageWrapper.vue';
import { useAuthStore } from '../../stores/auth';
import {
  getLaiguDmConfig,
  updateLaiguDmConfig,
  getLaiguDmReplyLogs,
  getLaiguDmSlaStats,
  processLaiguDm,
} from '../../api/laigu';
import { getTemplates } from '../../api/contentpro';

const route = useRoute();
const auth = useAuthStore();
const brandId = computed(() => auth.currentBrandId ?? 9);

const tab = ref(route.path.endsWith('/dm/sla') ? 'sla' : 'settings');
watch(() => route.path, (p) => {
  if (p === '/dm/sla') tab.value = 'sla';
  else if (p === '/dm/settings') tab.value = 'settings';
});

const loading = ref(false);
const saving = ref(false);
const processing = ref(false);
const config = ref({
  enabled: false,
  auto_reply: true,
  dry_run: true,
  sla_minutes: 3,
  context_turns: 10,
  persona_template_id: null,
  notify_wecom: true,
});
const personaOptions = ref([]);

const loadConfig = async () => {
  loading.value = true;
  try {
    const res = await getLaiguDmConfig({ brandId: brandId.value });
    config.value = {
      enabled: !!res.enabled,
      auto_reply: !!res.autoReply,
      dry_run: !!res.dryRun,
      sla_minutes: res.slaMinutes ?? 3,
      context_turns: res.contextTurns ?? 10,
      persona_template_id: res.personaTemplateId ?? null,
      notify_wecom: !!res.notifyWecom,
    };
  } finally {
    loading.value = false;
  }
};

const loadPersonas = async () => {
  try {
    const res = await getTemplates({ brandId: brandId.value, kind: 'persona' });
    personaOptions.value = (res?.list ?? []).map((t) => ({ value: t.id, label: t.name }));
  } catch {
    personaOptions.value = [];
  }
};

const save = async () => {
  saving.value = true;
  try {
    await updateLaiguDmConfig(
      {
        enabled: config.value.enabled,
        autoReply: config.value.auto_reply,
        dryRun: config.value.dry_run,
        slaMinutes: config.value.sla_minutes,
        contextTurns: config.value.context_turns,
        personaTemplateId: config.value.persona_template_id ?? null,
        notifyWecom: config.value.notify_wecom,
      },
      { brandId: brandId.value },
    );
    message.success('已保存');
  } catch (e) {
    message.error(e.message || '保存失败');
  } finally {
    saving.value = false;
  }
};

const processNow = async () => {
  processing.value = true;
  try {
    const res = await processLaiguDm({}, { brandId: brandId.value });
    if (res.skipped === 'disabled') {
      message.warning('总开关未开启，先打开总开关再处理');
    } else {
      message.success(`处理完成：${res.processed ?? 0} 个会话`);
      if (tab.value === 'logs') loadLogs();
    }
  } catch (e) {
    message.error(e.message || '处理失败');
  } finally {
    processing.value = false;
  }
};

// ─── 回复日志 ────────────────────────────────────────────────────
const logs = ref([]);
const logsLoading = ref(false);
const logsPage = ref(1);
const logsPageSize = 20;
const logsTotal = ref(0);
const logColumns = [
  { key: 'status', title: '状态', width: 110 },
  { key: 'intent', title: '意图', width: 100 },
  { key: 'level', title: '意向', width: 70 },
  { key: 'final', title: '回复内容', ellipsis: true },
  { key: 'created', title: '时间', width: 160 },
];
const statusLabel = (s) =>
  ({ dry_run: 'dry-run 预览', sent: '已发送', blocked: '合规拦截', suppressed: '未回复', takeover_skip: '接管跳过', channel_missing: '通道未接入' }[s] ?? s);
const statusColor = (s) =>
  ({ dry_run: 'purple', sent: 'green', blocked: 'red', suppressed: 'default', takeover_skip: 'blue', channel_missing: 'orange' }[s] ?? 'default');
const fmtTime = (v) => (v ? String(v).replace('T', ' ').slice(0, 19) : '');
const loadLogs = async () => {
  logsLoading.value = true;
  try {
    const res = await getLaiguDmReplyLogs({ brandId: brandId.value, page: String(logsPage.value), pageSize: String(logsPageSize) });
    logs.value = res.list ?? [];
    logsTotal.value = res.total ?? 0;
  } finally {
    logsLoading.value = false;
  }
};

// ─── SLA 看板 ────────────────────────────────────────────────────
const slaRows = ref([]);
const slaLoading = ref(false);
const slaMinutes = computed(() => config.value.sla_minutes);
const slaColumns = [
  { key: 'day', title: '日期', width: 110 },
  { key: 'sessions', title: '新会话', width: 90 },
  { key: 'within_sla', title: '达标', width: 80 },
  { key: 'over_sla', title: '超时', width: 80 },
  { key: 'unanswered', title: '未回复', width: 90 },
  { key: 'bot_replied', title: 'AI 首响', width: 90 },
  { key: 'human_replied', title: '人工首响', width: 90 },
  { key: 'avg_first_reply_sec', title: '平均首响(秒)', width: 110 },
  { key: 'sla_rate', title: 'SLA 达标率', width: 100 },
];
const loadSla = async () => {
  slaLoading.value = true;
  try {
    const res = await getLaiguDmSlaStats({ brandId: brandId.value, days: '7' });
    slaRows.value = res.list ?? [];
  } finally {
    slaLoading.value = false;
  }
};

watch(tab, (t) => {
  if (t === 'logs' && !logs.value.length) loadLogs();
  if (t === 'sla' && !slaRows.value.length) loadSla();
});

onMounted(() => {
  loadConfig();
  loadPersonas();
  if (tab.value === 'logs') loadLogs();
  if (tab.value === 'sla') loadSla();
});
</script>

<style scoped>
.dm-alert {
  margin-bottom: 12px;
}
.dm-body {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
}
.dm-form {
  max-width: 960px;
}
.dm-tip {
  color: #94a3b8;
  font-size: 12px;
  margin-top: 8px;
}
.dm-final {
  white-space: pre-wrap;
}
.sla-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  color: #64748b;
  font-size: 12px;
}
.sla-ok {
  color: #16a34a;
  font-weight: 600;
}
.sla-bad {
  color: #dc2626;
  font-weight: 600;
}
</style>
