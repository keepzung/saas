<template>
  <PageWrapper title="评论维护">
    <template #extra>
      <a-button size="small" @click="load"><ReloadOutlined /> 刷新</a-button>
    </template>
    <div class="cm-stats">
      <div class="cm-card"><div class="cm-num">{{ summary.total ?? '-' }}</div><div class="cm-label">评论总数</div></div>
      <div class="cm-card pos"><div class="cm-num">{{ summary.positive ?? '-' }}</div><div class="cm-label">正面互动</div></div>
      <div class="cm-card neg"><div class="cm-num">{{ summary.negative ?? '-' }}</div><div class="cm-label">负面反馈</div></div>
      <div class="cm-card cns"><div class="cm-num">{{ summary.consult ?? '-' }}</div><div class="cm-label">购车咨询</div></div>
    </div>
    <div class="cm-toolbar">
      <a-radio-group v-model:value="sentiment" size="small" @change="load">
        <a-radio-button value="">全部</a-radio-button>
        <a-radio-button value="positive">正面</a-radio-button>
        <a-radio-button value="negative">负面</a-radio-button>
        <a-radio-button value="consult">咨询</a-radio-button>
        <a-radio-button value="neutral">一般</a-radio-button>
      </a-radio-group>
      <a-input-search v-model:value="keyword" placeholder="搜索评论内容" style="width: 220px" size="small" allow-clear @search="load" />
    </div>
    <a-table
      :columns="columns"
      :data-source="list"
      row-key="id"
      size="small"
      :loading="loading"
      :pagination="{ total, pageSize, current: page, showSizeChanger: false, onChange: (p) => { page = p; load(); } }"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'content'">
          <div class="cm-content">{{ record.content }}</div>
          <div v-if="record.note_title" class="cm-note">笔记：{{ record.note_title }}</div>
        </template>
        <template v-else-if="column.key === 'sentiment'">
          <a-tag :color="sentimentColor(record.sentiment)">{{ sentimentLabel(record.sentiment) }}</a-tag>
        </template>
        <template v-else-if="column.key === 'reply_state'">
          <a-tag :color="record.reply_state === 1 || record.reply_state === 2 ? 'green' : 'orange'">
            {{ record.reply_state === 1 || record.reply_state === 2 ? '已回复' : '待回复' }}
          </a-tag>
        </template>
        <template v-else-if="column.key === 'ops'">
          <a-button size="small" type="text" @click="openReply(record)">一键回复</a-button>
        </template>
      </template>
    </a-table>

    <a-modal v-model:open="replyOpen" title="一键回复" width="520px" @ok="confirmReply">
      <div class="cm-reply-target" v-if="replyTarget">
        <div class="cm-reply-q">「{{ replyTarget.content }}」</div>
        <div class="cm-reply-sub">@{{ replyTarget.comment_user || '匿名用户' }} · {{ replyTarget.note_title || '-' }}</div>
      </div>
      <div class="cm-tpl">
        <a-tag
          v-for="t in replyTemplates"
          :key="t"
          class="cm-tpl-tag"
          @click="replyContent = t"
        >{{ t.slice(0, 18) }}…</a-tag>
      </div>
      <a-textarea v-model:value="replyContent" :rows="4" :maxlength="200" placeholder="输入回复话术（dry-run：通道接入前仅记录，不实际发送）" />
      <div class="cm-reply-tip">当前为 dry-run 模式：回复只记录到回复日志，不会发布到评论区。</div>
    </a-modal>
  </PageWrapper>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { message } from 'ant-design-vue';
import { ReloadOutlined } from '@ant-design/icons-vue';
import PageWrapper from '../../components/PageWrapper.vue';
import { useAuthStore } from '../../stores/auth';
import { getLaiguCommentList, replyLaiguComment } from '../../api/laigu';

const auth = useAuthStore();
const brandId = computed(() => auth.currentBrandId ?? 9);

const columns = [
  { key: 'content', title: '评论', width: '46%' },
  { key: 'ent_open_name', title: '所属账号', width: 140, ellipsis: true },
  { key: 'comment_user', title: '评论人', width: 120, ellipsis: true },
  { key: 'sentiment', title: '分类', width: 90 },
  { key: 'reply_state', title: '回复状态', width: 90 },
  { key: 'created_at', title: '时间', width: 150 },
  { key: 'ops', title: '操作', width: 90 },
];

const list = ref([]);
const loading = ref(false);
const page = ref(1);
const pageSize = 20;
const total = ref(0);
const summary = ref({});
const sentiment = ref('');
const keyword = ref('');

const sentimentLabel = (s) => ({ positive: '正面', negative: '负面', consult: '咨询', neutral: '一般' }[s] ?? s);
const sentimentColor = (s) => ({ positive: 'green', negative: 'red', consult: 'blue', neutral: 'default' }[s] ?? 'default');

const replyOpen = ref(false);
const replyTarget = ref(null);
const replyContent = ref('');
const replyTemplates = [
  '感谢关注！具体配置和价格我可以帮您详细介绍，方便私信聊一下您的用车需求吗？',
  '刚好店里有现车，欢迎到店试驾体验，我可以帮您约个时间~',
  '目前有购车权益活动，私信发您详细政策，帮您算个落地价~',
];

const load = async () => {
  loading.value = true;
  try {
    const params = { brandId: brandId.value, page: String(page.value), pageSize: String(pageSize) };
    if (sentiment.value) params.sentiment = sentiment.value;
    if (keyword.value) params.keyword = keyword.value;
    const res = await getLaiguCommentList(params);
    list.value = res?.list ?? [];
    total.value = res?.total ?? 0;
    summary.value = res?.summary ?? {};
  } finally {
    loading.value = false;
  }
};

const openReply = (record) => {
  replyTarget.value = record;
  replyContent.value = '';
  replyOpen.value = true;
};

const confirmReply = async () => {
  if (!replyContent.value.trim()) {
    message.warning('请输入回复内容');
    return;
  }
  try {
    await replyLaiguComment(replyTarget.value.id, { content: replyContent.value.trim() }, { brandId: brandId.value });
    message.success('已记录回复（dry-run，未实际发送）');
    replyOpen.value = false;
  } catch (e) {
    message.error(e.message || '操作失败');
  }
};

onMounted(load);
</script>

<style scoped>
.cm-stats {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
}
.cm-card {
  flex: 1;
  background: #fff;
  border-radius: 12px;
  padding: 14px 18px;
  text-align: center;
}
.cm-num {
  font-size: 22px;
  font-weight: 700;
  color: #1e293b;
}
.cm-card.pos .cm-num { color: #16a34a; }
.cm-card.neg .cm-num { color: #dc2626; }
.cm-card.cns .cm-num { color: #2563eb; }
.cm-label {
  font-size: 12px;
  color: #94a3b8;
  margin-top: 2px;
}
.cm-toolbar {
  display: flex;
  gap: 10px;
  margin-bottom: 10px;
}
.cm-content {
  font-size: 13px;
  color: #1e293b;
  white-space: pre-wrap;
}
.cm-note {
  font-size: 12px;
  color: #94a3b8;
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cm-reply-target {
  background: #f8fafc;
  border-radius: 8px;
  padding: 10px;
  margin-bottom: 10px;
}
.cm-reply-q {
  font-size: 13px;
  color: #1e293b;
}
.cm-reply-sub {
  font-size: 12px;
  color: #94a3b8;
  margin-top: 4px;
}
.cm-tpl {
  margin-bottom: 8px;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.cm-tpl-tag {
  cursor: pointer;
}
.cm-reply-tip {
  margin-top: 8px;
  font-size: 12px;
  color: #94a3b8;
}
</style>
