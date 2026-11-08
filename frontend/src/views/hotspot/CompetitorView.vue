<template>
  <PageWrapper title="竞品分析">
    <FilterTopbar>
      <a-select v-model:value="platform" style="width: 130px" @change="loadAll">
        <a-select-option value="">全部平台</a-select-option>
        <a-select-option value="xhs">小红书</a-select-option>
        <a-select-option value="bilibili">B站</a-select-option>
      </a-select>
      <a-button type="primary" @click="addOpen = true"><PlusOutlined /> 添加竞品账号</a-button>
      <span class="tip">粘贴竞品主页链接即可跟踪其内容；系统每天自动同步一次，也可手动刷新</span>
    </FilterTopbar>

    <a-spin :spinning="loading">
      <div v-if="cards.length" class="cards">
        <div v-for="c in cards" :key="c.id" class="comp-card">
          <div class="head">
            <a-avatar :src="c.avatar" shape="square" :size="44">{{ (c.nickname || '?').slice(0, 1) }}</a-avatar>
            <div class="who">
              <div class="name">{{ c.alias || c.nickname || c.author_id }} <a-tag color="blue" class="plt">{{ platformName(c.platform) }}</a-tag></div>
              <div class="sub">{{ c.nickname }} · {{ fmtNum(c.fans) }} 粉丝 · 最近同步 {{ c.last_sync_at ? fmtDate(c.last_sync_at) : '从未' }}</div>
            </div>
            <div class="ops">
              <a-tooltip title="同步最新内容"><a-button size="small" :loading="syncingId === c.id" @click="sync(c)"><SyncOutlined /></a-button></a-tooltip>
              <a-tooltip :title="c.enabled ? '暂停跟踪' : '恢复跟踪'"><a-button size="small" @click="toggle(c)"><BulbOutlined :style="{ color: c.enabled ? '#1890ff' : '#bbb' }" /></a-button></a-tooltip>
              <a-popconfirm title="删除该竞品及其跟踪？" @confirm="remove(c)"><a-button size="small" danger><DeleteOutlined /></a-button></a-popconfirm>
            </div>
          </div>
          <div class="stats">
            <div class="s"><b>{{ c.stats.count }}</b><span>跟踪内容</span></div>
            <div class="s"><b>{{ fmtNum(c.stats.avgLikes) }}</b><span>平均点赞</span></div>
            <div class="s"><b>{{ fmtNum(c.stats.maxLikes) }}</b><span>最高点赞</span></div>
            <div class="s"><b>{{ c.stats.videoRate }}%</b><span>视频占比</span></div>
            <div class="s"><b>{{ c.stats.perWeek }}</b><span>周均更新</span></div>
          </div>
          <div v-if="c.stats.hotTopics.length" class="topics">
            <a-tag v-for="t in c.stats.hotTopics" :key="t" color="orange">{{ t }}</a-tag>
          </div>
          <div class="top-notes">
            <div v-for="n in c.stats.top" :key="n.id" class="note-row" @click="goRadar(n)">
              <img v-if="n.cover_url" :src="n.cover_url" class="thumb" loading="lazy" />
              <span class="t">{{ n.title || '（无标题）' }}</span>
              <span class="l">♥ {{ fmtNum(n.like_count) }}</span>
            </div>
          </div>
        </div>
      </div>
      <a-empty v-else-if="!loading" description="还没有竞品账号，点右上角「添加竞品账号」粘贴主页链接开始跟踪" />
    </a-spin>

    <a-modal v-model:open="addOpen" title="添加竞品账号" @ok="submitAdd" :confirm-loading="adding">
      <a-form layout="vertical">
        <a-form-item label="平台" required>
          <a-radio-group v-model:value="form.platform">
            <a-radio value="xhs">小红书</a-radio>
            <a-radio value="bilibili">B站</a-radio>
          </a-radio-group>
        </a-form-item>
        <a-form-item label="主页链接" required :help="form.platform === 'xhs' ? '形如 https://www.xiaohongshu.com/user/profile/xxxx' : '形如 https://space.bilibili.com/12345'">
          <a-input v-model:value="form.url" placeholder="粘贴主页链接" />
        </a-form-item>
        <a-form-item label="竞品别名（可选）">
          <a-input v-model:value="form.alias" placeholder="如：竞品A-美的官号" />
        </a-form-item>
        <a-form-item label="备注（可选）">
          <a-textarea v-model:value="form.note" :rows="2" placeholder="为什么跟踪它" />
        </a-form-item>
      </a-form>
    </a-modal>
  </PageWrapper>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { message } from 'ant-design-vue';
import { useRouter } from 'vue-router';
import { PlusOutlined, SyncOutlined, DeleteOutlined, BulbOutlined } from '@ant-design/icons-vue';
import PageWrapper from '../../components/PageWrapper.vue';
import FilterTopbar from '../../components/FilterTopbar.vue';
import { useAuthStore } from '../../stores/auth';
import {
  getCompetitors,
  parseCompetitor,
  syncCompetitor,
  toggleCompetitor,
  deleteCompetitor,
  getHotContents,
} from '../../api/hotspot';

const router = useRouter();
const auth = useAuthStore();
const brandId = computed(() => auth.currentBrandId ?? 1);

const comps = ref([]);
const contents = ref([]);
const loading = ref(false);
const platform = ref('');
const addOpen = ref(false);
const adding = ref(false);
const syncingId = ref(null);
const form = ref({ platform: 'xhs', url: '', alias: '', note: '' });

const platformName = (p) => ({ xhs: '小红书', bilibili: 'B站' }[p] ?? p);
const fmtNum = (n) => {
  const v = Number(n ?? 0);
  if (v >= 10000) return `${(v / 10000).toFixed(1)}万`;
  return String(v);
};
const fmtDate = (d) => (d ? String(d).slice(0, 10) : '');

const loadAll = async () => {
  loading.value = true;
  try {
    comps.value = (await getCompetitors({ brandId: brandId.value })) ?? [];
    const res = await getHotContents({
      brandId: brandId.value,
      sourceType: 'competitor',
      platform: platform.value || undefined,
      page: 1,
      pageSize: 60,
      sort: 'hot',
    });
    contents.value = res?.items ?? [];
  } finally {
    loading.value = false;
  }
};

const cards = computed(() =>
  comps.value
    .filter((c) => !platform.value || c.platform === platform.value)
    .map((c) => {
      const mine = contents.value.filter((n) => n.author_id === c.author_id && n.platform === c.platform);
      const likes = mine.map((n) => Number(n.like_count ?? 0));
      const videos = mine.filter((n) => n.kind === 'video').length;
      const dates = mine.map((n) => new Date(n.first_seen_at).getTime()).filter((x) => !Number.isNaN(x));
      const spanDays = dates.length > 1 ? Math.max(1, (Math.max(...dates) - Math.min(...dates)) / 86400000) : 7;
      const topicCount = {};
      for (const n of mine) for (const t of n.topics ?? []) topicCount[t] = (topicCount[t] ?? 0) + 1;
      const hotTopics = Object.entries(topicCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([t]) => t);
      return {
        ...c,
        fans: mine[0]?.author_fans ?? null,
        stats: {
          count: mine.length,
          avgLikes: likes.length ? Math.round(likes.reduce((a, b) => a + b, 0) / likes.length) : 0,
          maxLikes: likes.length ? Math.max(...likes) : 0,
          videoRate: mine.length ? Math.round((videos / mine.length) * 100) : 0,
          perWeek: Math.max(1, Math.round((mine.length / spanDays) * 7 * 10) / 10),
          hotTopics,
          top: [...mine].sort((a, b) => (b.like_count ?? 0) - (a.like_count ?? 0)).slice(0, 4),
        },
      };
    }),
);

const submitAdd = async () => {
  if (!form.value.url) return message.warning('请粘贴主页链接');
  adding.value = true;
  try {
    await parseCompetitor(
      { platform: form.value.platform, url: form.value.url.trim(), alias: form.value.alias || undefined, note: form.value.note || undefined },
      { brandId: brandId.value },
    );
    message.success('已添加并开始同步该竞品内容');
    addOpen.value = false;
    form.value = { platform: form.value.platform, url: '', alias: '', note: '' };
    setTimeout(loadAll, 3000);
  } catch (e) {
    message.error(e?.message ?? '解析失败');
  } finally {
    adding.value = false;
  }
};

const sync = async (c) => {
  syncingId.value = c.id;
  try {
    await syncCompetitor(c.id, { brandId: brandId.value });
    message.success('同步完成');
    loadAll();
  } catch (e) {
    message.error(e?.message ?? '同步失败');
  } finally {
    syncingId.value = null;
  }
};

const toggle = async (c) => {
  await toggleCompetitor(c.id, { brandId: brandId.value, enabled: !c.enabled });
  loadAll();
};

const remove = async (c) => {
  await deleteCompetitor(c.id, { brandId: brandId.value });
  loadAll();
};

const goRadar = (n) => {
  router.push({ path: '/hotspot/radar', query: { id: n.id } });
};

onMounted(loadAll);
</script>

<style scoped>
.tip { color: #999; font-size: 12px; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 14px; margin-top: 12px; }
.comp-card { background: #fff; border: 1px solid #f0f0f0; border-radius: 12px; padding: 14px; }
.head { display: flex; align-items: center; gap: 10px; }
.who { flex: 1; min-width: 0; }
.name { font-weight: 600; display: flex; align-items: center; gap: 6px; }
.plt { font-size: 11px; }
.sub { font-size: 12px; color: #999; margin-top: 2px; }
.ops { display: flex; gap: 6px; }
.stats { display: flex; gap: 8px; margin-top: 12px; }
.stats .s { flex: 1; text-align: center; background: #fafafa; border-radius: 8px; padding: 8px 0; }
.stats b { display: block; font-size: 15px; }
.stats span { font-size: 11px; color: #999; }
.topics { margin-top: 10px; }
.topics .ant-tag { margin-bottom: 4px; }
.top-notes { margin-top: 10px; border-top: 1px dashed #f0f0f0; padding-top: 8px; }
.note-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; cursor: pointer; font-size: 12px; }
.note-row:hover .t { color: #1890ff; }
.thumb { width: 34px; height: 34px; border-radius: 6px; object-fit: cover; }
.t { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #333; }
.l { color: #ff6026; }
</style>
