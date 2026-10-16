<template>
  <PageWrapper title="私信线索" subtitle="来鼓小红书私信会话线索">
    <template #filters>
      <FilterTopbar>
        <a-segmented
          v-model:value="viewMode"
          :options="[
            { label: '列表视图', value: 'list' },
            { label: '对话视图', value: 'chat' },
          ]"
          @change="onViewChange"
        />
        <template v-if="viewMode === 'list'">
          <a-segmented
            v-model:value="resMode"
            class="res-seg"
            :options="[
              { label: `已留资${stats.resourced ? ` ${stats.resourced}` : ''}`, value: 'true' },
              { label: '未留资', value: 'false' },
              { label: '全部会话', value: 'all' },
            ]"
            @change="onSearch"
          />
          <a-input-search
            v-model:value="keyword"
            placeholder="昵称 / 手机号 / 内容"
            style="width: 200px"
            allow-clear
            @search="onSearch"
          />
          <a-select
            v-model:value="kosFilter"
            style="width: 180px"
            show-search
            allow-clear
            placeholder="按 KOS 账号筛选"
            :options="kosOptions"
            @change="onSearch"
          />
          <a-select
            v-model:value="hasPhone"
            style="width: 110px"
            allow-clear
            placeholder="联系方式"
            :options="boolOptions"
            @change="onSearch"
          />
          <a-checkbox v-model:checked="hideEmpty" @change="onSearch">隐藏空会话</a-checkbox>
          <a-range-picker
            v-model:value="dateRange"
            style="width: 240px"
            value-format="YYYY-MM-DD"
            @change="onSearch"
          />
        </template>
        <template v-else>
          <span class="muted mini">客服工作台 · 只读展示（回复请到来鼓工作台操作）</span>
        </template>
        <template #actions>
          <a-button :loading="syncing" @click="doSync">
            <SyncOutlined /> 手动同步
          </a-button>
        </template>
      </FilterTopbar>
    </template>

    <div class="stat-row" v-if="viewMode === 'list'">
      <div class="stat-card">
        <div class="stat-value">{{ stats.total }}</div>
        <div class="stat-label">总会话</div>
      </div>
      <div class="stat-card accent-blue">
        <div class="stat-value">{{ stats.today }}</div>
        <div class="stat-label">今日活跃</div>
      </div>
      <div class="stat-card accent-green">
        <div class="stat-value">{{ stats.resourced }}</div>
        <div class="stat-label">留资会话</div>
      </div>
      <div class="stat-card accent-purple">
        <div class="stat-value">{{ stats.with_phone }}</div>
        <div class="stat-label">有联系方式</div>
      </div>
    </div>

    <a-card v-if="viewMode === 'list'" :bordered="false">
      <a-table
        :columns="columns"
        :data-source="list"
        :loading="loading"
        :pagination="pager"
        :row-class-name="rowClassName"
        row-key="id"
        @change="onTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'client_name'">
            <a @click="openDetail(record)">{{ record.client_name || '匿名用户' }}</a>
          </template>
          <template v-else-if="column.key === 'phone'">
            <span v-if="record.phone" class="phone-text">{{ record.phone }}</span>
            <span v-else class="muted">-</span>
          </template>
          <template v-else-if="column.key === 'is_resource'">
            <a-tag :color="record.is_resource ? 'green' : 'default'">
              {{ record.is_resource ? '已留资' : '未留资' }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'messages'">
            {{ record.client_message_count }} / {{ record.message_count }}
          </template>
          <template v-else-if="column.key === 'ad'">
            <a-tooltip v-if="adName(record)" :title="adName(record)">
              <a-tag color="blue">{{ adShort(record) }}</a-tag>
            </a-tooltip>
            <span v-else class="muted">-</span>
          </template>
          <template v-else-if="column.key === 'action'">
            <a @click="openDetail(record)">详情</a>
          </template>
        </template>
      </a-table>
    </a-card>

    <a-card v-else :bordered="false" :body-style="{ padding: 0 }">
      <div class="chat-shell">
        <!-- 一级：KOS 账号树 -->
        <div class="kos-tree">
          <div class="kos-tree-head">KOS 账号</div>
          <div class="kos-tree-body">
            <div class="kos-item" :class="{ active: !treeUid }" @click="selectTree(null)">
              <span class="kos-name">全部账号</span>
              <span class="kos-count">{{ chatTotal }}</span>
            </div>
            <div
              v-for="k in kosTree"
              :key="k.uid"
              class="kos-item"
              :class="{ active: treeUid === k.uid }"
              :title="k.nickname"
              @click="selectTree(k)"
            >
              <span class="kos-name">{{ k.nickname }}</span>
              <span class="kos-count">{{ k.count }}</span>
            </div>
          </div>
        </div>

        <!-- 二级：全部对话 -->
        <div class="conv-list" @scroll="onListScroll">
          <div class="conv-list-head">
            <div class="clh-top">
              <span>全部对话</span>
              <span class="muted mini">{{ chatTotal }}</span>
              <a-popover trigger="click" placement="bottomRight">
                <FilterOutlined class="filter-icon" />
                <template #content>
                  <div class="chat-filter-panel">
                    <div class="cf-row">
                      <span class="cf-label">留资</span>
                      <a-segmented
                        v-model:value="chatRes"
                        size="small"
                        :options="[
                          { label: '全部', value: 'all' },
                          { label: '已留资', value: 'true' },
                          { label: '未留资', value: 'false' },
                        ]"
                        @change="onChatFilterChange"
                      />
                    </div>
                    <div class="cf-row">
                      <span class="cf-label">标签</span>
                      <a-select
                        v-model:value="chatTag"
                        size="small"
                        style="width: 150px"
                        allow-clear
                        placeholder="全部标签"
                        :options="chatTagOptions"
                        @change="onChatFilterChange"
                      />
                    </div>
                    <div class="cf-row">
                      <span class="cf-label">日期</span>
                      <a-range-picker
                        v-model:value="chatDateRange"
                        size="small"
                        style="width: 220px"
                        value-format="YYYY-MM-DD"
                        @change="onChatFilterChange"
                      />
                    </div>
                    <div class="cf-row">
                      <span class="cf-label">其他</span>
                      <a-checkbox v-model:checked="hideEmpty" @change="onChatFilterChange">隐藏空会话</a-checkbox>
                    </div>
                    <div class="cf-row">
                      <span class="cf-label">联系</span>
                      <a-checkbox v-model:checked="chatHasPhone" @change="onChatFilterChange">仅看有联系方式</a-checkbox>
                    </div>
                  </div>
                </template>
              </a-popover>
            </div>
            <div class="clh-quick">
              <a-segmented
                v-model:value="chatRes"
                size="small"
                block
                :options="[
                  { label: '全部', value: 'all' },
                  { label: '已留资', value: 'true' },
                  { label: '未留资', value: 'false' },
                ]"
                @change="onChatFilterChange"
              />
            </div>
            <a-input-search
              v-model:value="chatKeyword"
              size="small"
              placeholder="搜索昵称 / 手机号 / 内容"
              allow-clear
              @search="onChatFilterChange"
              @change="(e) => { if (!e.target.value) onChatFilterChange(); }"
            />
          </div>
          <a-spin :spinning="chatLoading">
            <div
              v-for="item in chatDisplayItems"
              :key="item.id"
              class="conv-item"
              :class="{ active: selected?.id === item.id, resourced: item.is_resource }"
              @click="selectLead(item)"
            >
              <span class="conv-avatar">{{ (item.client_name || '#').slice(0, 1) }}</span>
              <div class="conv-main">
                <div class="conv-top">
                  <span class="conv-name">{{ item.client_name || '匿名用户' }}</span>
                  <span class="conv-time">{{ relTime(item.last_message_at) }}</span>
                </div>
                <div class="conv-sub">
                  <span class="conv-preview">{{ item.last_client_content || '（无文字内容）' }}</span>
                  <span v-if="pendingCount(item)" class="unread-badge">{{ Math.min(pendingCount(item), 99) }}</span>
                  <a-tag v-if="item.is_resource" color="green" class="conv-tag">留资</a-tag>
                </div>
              </div>
            </div>
            <div v-if="chatItems.length < chatTotal" class="conv-more muted mini">
              下拉加载更多（{{ chatItems.length }}/{{ chatTotal }}）
            </div>
            <a-empty v-if="!chatDisplayItems.length && !chatLoading" description="暂无会话" />
          </a-spin>
        </div>

        <!-- 三级：对话详情 -->
        <div class="conv-dialog">
          <template v-if="selected">
            <div class="conv-head">
              <div class="ch-left">
                <span class="conv-avatar sm">{{ (selected.client_name || '#').slice(0, 1) }}</span>
                <b class="ch-name">{{ selected.client_name || '匿名用户' }}</b>
                <a-tag :color="selected.is_resource ? 'green' : 'default'">
                  {{ selected.is_resource ? '已留资' : '未留资' }}
                </a-tag>
                <span v-if="chatSourceAccount(selected)" class="muted mini">{{ chatSourceAccount(selected) }}</span>
              </div>
              <div class="ch-actions">
                <a-tooltip title="只读模式：请到来鼓工作台操作">
                  <a-button size="small" disabled><SwapOutlined /> 转接</a-button>
                </a-tooltip>
                <a-tooltip title="只读模式：请到来鼓工作台操作">
                  <a-button size="small" disabled><StopOutlined /> 结束</a-button>
                </a-tooltip>
              </div>
            </div>
            <a-spin :spinning="detailLoading">
              <div ref="chatFlowEl" class="chat-flow">
                <template v-for="(block, bi) in timelineBlocks" :key="bi">
                  <div v-if="block.day" class="tl-chip tl-day">{{ block.day }}</div>
                  <div v-if="block.time" class="tl-chip tl-time">{{ block.time }}</div>
                  <div v-if="block.kind === 'system'" class="tl-system">{{ block.msg.content }}</div>
                  <div v-else-if="block.kind === 'msg'" class="chat-row" :class="{ self: !block.isClient }">
                    <div class="chat-meta">
                      <span class="chat-name">{{ roleLabel(block.msg) }}</span>
                    </div>
                    <div class="chat-bubble">
                      <template v-if="msgCard(block.msg).kind === 'photo'">
                        <img
                          class="msg-photo"
                          :src="msgCard(block.msg).url"
                          referrerpolicy="no-referrer"
                          loading="lazy"
                          @error="onCardImgError"
                        />
                      </template>
                      <template v-else-if="msgCard(block.msg).kind === 'voice'">
                        <span class="msg-voice">🎤 语音消息</span>
                      </template>
                      <template v-else-if="msgCard(block.msg).kind === 'json' && isCardData(msgCard(block.msg).data)">
                        <div class="msg-card">
                          <img
                            v-if="cardImg(msgCard(block.msg).data)"
                            class="msg-card-img"
                            :src="cardImg(msgCard(block.msg).data)"
                            referrerpolicy="no-referrer"
                            loading="lazy"
                            @error="onCardImgError"
                          />
                          <div class="msg-card-body">
                            <div v-if="noteAuthor(msgCard(block.msg).data)" class="msg-card-sub">
                              分享了笔记 · @{{ noteAuthor(msgCard(block.msg).data) }}
                            </div>
                            <div class="msg-card-title">{{ cardTitle(msgCard(block.msg).data) }}</div>
                            <a
                              v-if="cardLink(msgCard(block.msg).data)"
                              :href="cardLink(msgCard(block.msg).data)"
                              target="_blank"
                              rel="noopener noreferrer"
                            >查看笔记</a>
                          </div>
                        </div>
                      </template>
                      <template v-else-if="msgCard(block.msg).kind === 'json'">
                        <pre class="msg-json">{{ JSON.stringify(msgCard(block.msg).data, null, 2) }}</pre>
                      </template>
                      <template v-else>{{ msgCard(block.msg).text }}</template>
                    </div>
                  </div>
                </template>
                <a-empty v-if="!messages.length" description="暂无消息" />
              </div>
            </a-spin>
            <div class="chat-input-bar">
              <div class="cib-tools">
                <SmileOutlined />
                <PaperClipOutlined />
                <PictureOutlined />
                <FolderOpenOutlined />
                <BulbOutlined />
                <span class="cib-quick">快捷回复 /</span>
              </div>
              <a-textarea :value="''" disabled :rows="2" placeholder="只读模式：回复请到来鼓工作台操作" />
              <div class="cib-send">
                <a-button type="primary" disabled>发送</a-button>
              </div>
            </div>
          </template>
          <a-empty v-else description="选择左侧会话查看对话" style="margin-top: 120px" />
        </div>

        <!-- 用户信息 -->
        <div class="conv-profile">
          <template v-if="selected">
            <div class="profile-cust">
              <span class="conv-avatar lg">{{ (selected.client_name || '#').slice(0, 1) }}</span>
              <b>{{ selected.client_name || '匿名用户' }}</b>
            </div>
            <div class="profile-section">
              <div class="profile-sub">访问信息</div>
              <div class="profile-row"><span>来源渠道</span><b>{{ sourceLabel(selected.source) }}</b></div>
              <div class="profile-row">
                <span>来源账号</span>
                <b>
                  <a v-if="chatSourceAccount(selected)" @click="selectTree({ uid: selected.sub_source })">{{ chatSourceAccount(selected) }}</a>
                  <span v-else>-</span>
                </b>
              </div>
              <div class="profile-row"><span>归属地</span><b>{{ selected.ip_location || '-' }}</b></div>
              <div class="profile-row"><span>会话开始</span><b>{{ selected.session_created_at || fmtDay(selected.first_message_at) || '-' }}</b></div>
              <div class="profile-row"><span>最近活跃</span><b>{{ selected.last_message_at }}</b></div>
            </div>
            <div class="profile-section">
              <div class="profile-sub">留资信息</div>
              <div class="profile-row">
                <span>状态</span>
                <b><a-tag :color="selected.is_resource ? 'green' : 'default'">{{ selected.is_resource ? '已留资' : '未留资' }}</a-tag></b>
              </div>
              <div class="profile-row"><span>电话</span><b>{{ selected.phone || '-' }}</b></div>
              <div class="profile-row"><span>微信</span><b>{{ weixinOf(selected) || '-' }}</b></div>
            </div>
            <div class="profile-section">
              <div class="profile-sub">标签</div>
              <div class="tag-chips">
                <a-tag
                  v-for="t in selectedTags"
                  :key="t"
                  closable
                  color="blue"
                  @close.prevent="removeTag(t)"
                >{{ t }}</a-tag>
                <a-input
                  v-model:value="newTag"
                  size="small"
                  style="width: 110px"
                  placeholder="添加标签"
                  :maxlength="20"
                  @pressEnter="addTag"
                />
                <a-button size="small" type="dashed" :loading="tagSaving" @click="addTag">添加</a-button>
              </div>
            </div>
            <div class="profile-section" v-if="detail?.ad_info && Object.keys(detail.ad_info).length">
              <div class="profile-sub">广告归因</div>
              <div class="profile-row"><span>广告主</span><b>{{ detail.ad_info.advertiser_name || '-' }}</b></div>
              <div class="profile-row"><span>广告计划</span><b>{{ detail.ad_info.campaign_name || '-' }}</b></div>
              <div class="profile-row"><span>创意</span><b>{{ detail.ad_info.creativity_name || '-' }}</b></div>
            </div>
            <div class="profile-section">
              <div class="profile-sub">会话数据</div>
              <div class="profile-row"><span>客户消息</span><b>{{ selected.client_message_count ?? 0 }}</b></div>
              <div class="profile-row"><span>总消息</span><b>{{ selected.message_count ?? 0 }}</b></div>
              <div class="profile-row"><span>KOS 归属</span><b>{{ selected.staff_name || '-' }}</b></div>
            </div>
            <div class="profile-section">
              <div class="profile-sub">自定义名片</div>
              <div class="profile-row">
                <span>会话 ID</span>
                <b class="session-id">{{ selected.session_id }}</b>
                <a class="copy-btn" @click="copySessionId"><CopyOutlined /></a>
              </div>
            </div>
          </template>
          <a-empty v-else description="未选择会话" style="margin-top: 60px" />
        </div>
      </div>
    </a-card>

    <a-drawer
      v-model:open="detailOpen"
      :title="detailTitle"
      placement="right"
      :width="620"
      :body-style="{ padding: '0', overflow: 'hidden' }"
    >
      <div class="detail-shell">
        <a-spin v-if="detailLoading" class="detail-loading" tip="加载中..." />
        <template v-else-if="detail">
          <div class="detail-section">
            <div class="section-title">客户信息</div>
            <a-descriptions :column="2" size="small" bordered>
              <a-descriptions-item label="昵称" :span="1">
                {{ detail.client_name || '匿名用户' }}
              </a-descriptions-item>
              <a-descriptions-item label="联系电话" :span="1">
                {{ detail.phone || '-' }}
              </a-descriptions-item>
              <a-descriptions-item label="会话ID" :span="1">
                {{ detail.session_id }}
              </a-descriptions-item>
              <a-descriptions-item label="留资状态" :span="1">
                <a-tag :color="detail.is_resource ? 'green' : 'default'">
                  {{ detail.is_resource ? '已留资' : '未留资' }}
                </a-tag>
              </a-descriptions-item>
              <a-descriptions-item label="来源" :span="1">
                {{ sourceLabel(detail.source) }}
              </a-descriptions-item>
              <a-descriptions-item label="归属地" :span="1">
                {{ detail.ip_location || '-' }}
              </a-descriptions-item>
              <a-descriptions-item label="会话开始" :span="1">
                {{ fmtTime(detail.first_message_at) }}
              </a-descriptions-item>
              <a-descriptions-item label="最近活跃" :span="1">
                {{ fmtTime(detail.last_message_at) }}
              </a-descriptions-item>
            </a-descriptions>
          </div>

          <div v-if="detail.ad_info && Object.keys(detail.ad_info).length" class="detail-section">
            <div class="section-title">投放信息</div>
            <a-descriptions :column="1" size="small" bordered>
              <a-descriptions-item label="广告主">
                {{ detail.ad_info.advertiser_name || '-' }}
              </a-descriptions-item>
              <a-descriptions-item label="广告计划">
                {{ detail.ad_info.campaign_name || '-' }}
              </a-descriptions-item>
              <a-descriptions-item label="创意">
                {{ detail.ad_info.creativity_name || '-' }}
              </a-descriptions-item>
            </a-descriptions>
          </div>

          <div class="detail-section">
            <div class="section-title">
              聊天记录
              <span class="muted">（{{ messages.length }} 条）</span>
            </div>
            <div class="chat-list">
              <div
                v-for="msg in messages"
                :key="msg.id"
                class="chat-row"
                :class="{ self: msg.role !== 'client' }"
              >
                <div class="chat-meta">
                  <span class="chat-name">{{ roleLabel(msg) }}</span>
                  <span class="chat-time">{{ fmtTime(msg.created_at) }}</span>
                </div>
                <div class="chat-bubble">
                  <template v-if="msgCard(msg).kind === 'photo'">
                    <img
                      class="msg-photo"
                      :src="msgCard(msg).url"
                      referrerpolicy="no-referrer"
                      loading="lazy"
                      @error="onCardImgError"
                    />
                  </template>
                  <template v-else-if="msgCard(msg).kind === 'voice'">
                    <span class="msg-voice">🎤 语音消息</span>
                  </template>
                  <template v-else-if="msgCard(msg).kind === 'json' && isCardData(msgCard(msg).data)">
                    <div class="msg-card">
                      <img
                        v-if="cardImg(msgCard(msg).data)"
                        class="msg-card-img"
                        :src="cardImg(msgCard(msg).data)"
                        referrerpolicy="no-referrer"
                        loading="lazy"
                        @error="onCardImgError"
                      />
                      <div class="msg-card-body">
                        <div v-if="noteAuthor(msgCard(msg).data)" class="msg-card-sub">
                          分享了笔记 · @{{ noteAuthor(msgCard(msg).data) }}
                        </div>
                        <div class="msg-card-title">{{ cardTitle(msgCard(msg).data) }}</div>
                        <a
                          v-if="cardLink(msgCard(msg).data)"
                          :href="cardLink(msgCard(msg).data)"
                          target="_blank"
                          rel="noopener noreferrer"
                        >查看笔记</a>
                      </div>
                    </div>
                  </template>
                  <template v-else-if="msgCard(msg).kind === 'json'">
                    <pre class="msg-json">{{ JSON.stringify(msgCard(msg).data, null, 2) }}</pre>
                  </template>
                  <template v-else>{{ msgCard(msg).text }}</template>
                </div>
              </div>
              <a-empty v-if="!messages.length" description="暂无消息" />
            </div>
          </div>

          <div class="detail-section">
            <a-collapse :bordered="false">
              <a-collapse-panel key="raw" header="原始报文">
                <pre class="raw-json">{{ JSON.stringify(detail.raw_json, null, 2) }}</pre>
              </a-collapse-panel>
            </a-collapse>
          </div>
        </template>
      </div>
    </a-drawer>
  </PageWrapper>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from 'vue';
import { message } from 'ant-design-vue';
import {
  SyncOutlined,
  FilterOutlined,
  SwapOutlined,
  StopOutlined,
  SmileOutlined,
  PaperClipOutlined,
  PictureOutlined,
  FolderOpenOutlined,
  BulbOutlined,
  CopyOutlined,
} from '@ant-design/icons-vue';
import dayjs from 'dayjs';
import { getLaiguKosTree, getLaiguLeadDetail, getLaiguLeads, getLaiguLeadStats, syncLaigu, updateLaiguLeadTags } from '../../api/laigu';
import { getKoxAccounts } from '../../api/kox';
import { useAuthStore } from '../../stores/auth';
import PageWrapper from '../../components/PageWrapper.vue';
import FilterTopbar from '../../components/FilterTopbar.vue';

const auth = useAuthStore();

const boolOptions = [
  { value: 'true', label: '是' },
  { value: 'false', label: '否' },
];

const columns = [
  { key: 'client_name', title: '客户昵称', width: 160, ellipsis: true },
  { key: 'phone', title: '联系电话', width: 130 },
  { key: 'is_resource', title: '留资', width: 90 },
  { key: 'messages', title: '客户/总消息', width: 110 },
  { key: 'last_client_content', title: '最后客户消息', dataIndex: 'last_client_content', ellipsis: true },
  { key: 'ad', title: '投放', width: 150, ellipsis: true },
  { key: 'last_message_at', title: '最近活跃', width: 160 },
  { key: 'action', title: '操作', width: 80 },
];

const viewMode = ref('list');
const list = ref([]);
const stats = ref({ total: 0, today: 0, resourced: 0, with_phone: 0 });
const loading = ref(false);
const page = ref(1);
const pageSize = ref(10);
const total = ref(0);
const keyword = ref('');
// 会话状态快捷切换（默认只看已留资，让操作人员一眼定位有留资的对话）
const resMode = ref('true');
// 默认隐藏"空白私信"（客户从未发过消息的会话）
const hideEmpty = ref(true);
const hasPhone = ref(undefined);
const dateRange = ref(null);
const syncing = ref(false);

// 按 KOS 账号筛选（MDD）：会话进线账号 id / 客服昵称 双判据
const kosFilter = ref(undefined);
const kosOptions = ref([]);

const detailOpen = ref(false);
const detailLoading = ref(false);
const detail = ref(null);

const pager = computed(() => ({
  current: page.value,
  pageSize: pageSize.value,
  total: total.value,
  showSizeChanger: false,
}));

const detailTitle = computed(
  () => `私信详情 - ${detail.value?.client_name || '匿名用户'}`,
);

const messages = computed(() => detail.value?.raw_json?.messages ?? []);

const brandParam = () => ({ brandId: auth.currentBrandId ?? undefined });

function filterParams() {
  const params = { ...brandParam() };
  if (keyword.value) params.keyword = keyword.value;
  if (resMode.value === 'true' || resMode.value === 'false') params.isResource = resMode.value;
  if (hasPhone.value !== undefined && hasPhone.value !== null)
    params.hasPhone = hasPhone.value;
  if (hideEmpty.value) params.hasClientMessage = 'true';
  if (dateRange.value?.length === 2) {
    params.from = dateRange.value[0];
    params.to = dateRange.value[1];
  }
  if (kosFilter.value) params.kos = kosFilter.value;
  return params;
}

// 已留资会话整行高亮，一眼识别
function rowClassName(record) {
  return record.is_resource ? 'row-resourced' : '';
}

async function loadKosOptions() {
  try {
    const res = await getKoxAccounts({ brandId: auth.currentBrandId ?? 5, status: 'enabled', page_size: 100 });
    kosOptions.value = (res.list ?? [])
      .filter((a) => a.nickname)
      .map((a) => ({ label: a.nickname, value: a.nickname }));
  } catch {
    /* 筛选项加载失败不阻塞 */
  }
}

function weixinOf(item) {
  const wx = item?.client_attrs?.weixin;
  return Array.isArray(wx) ? wx[0] : wx || null;
}

async function reload() {
  loading.value = true;
  try {
    const params = {
      page: page.value,
      page_size: pageSize.value,
      ...filterParams(),
    };
    const res = await getLaiguLeads(params);
    list.value = res.list.map((r) => ({
      ...r,
      last_message_at: fmtTime(r.last_message_at),
    }));
    total.value = res.total;
  } catch (e) {
    message.error(e.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

async function loadStats() {
  try {
    stats.value = await getLaiguLeadStats(brandParam());
  } catch {
    /* 静默 */
  }
}

function onTableChange(p) {
  page.value = p.current;
  reload();
}

function onSearch() {
  page.value = 1;
  chatPage.value = 1;
  if (viewMode.value === 'chat') loadChat(true);
  reload();
}

function onViewChange() {
  if (viewMode.value === 'chat') {
    loadKosTree();
    loadChat(true);
  } else {
    // 切回列表：清除工作台的树筛选，避免列表数据被隐藏条件影响
    treeUid.value = undefined;
    chatTag.value = undefined;
    chatRes.value = 'all';
  }
}

async function doSync() {
  syncing.value = true;
  try {
    const res = await syncLaigu();
    message.success(`同步完成：拉取 ${res.fetched} 条会话`);
    await Promise.all([reload(), loadStats()]);
    if (viewMode.value === 'chat') await loadChat(true);
  } catch (e) {
    message.error(e.message || '同步失败');
  } finally {
    syncing.value = false;
  }
}

async function openDetail(record) {
  detailOpen.value = true;
  detailLoading.value = true;
  detail.value = null;
  try {
    detail.value = await getLaiguLeadDetail(record.id);
  } catch (e) {
    message.error(e.message || '加载详情失败');
    detailOpen.value = false;
  } finally {
    detailLoading.value = false;
  }
}

// ── 对话视图（四栏工作台） ──
const chatItems = ref([]);
const chatPage = ref(1);
const chatTotal = ref(0);
const chatLoading = ref(false);
const selected = ref(null);
const chatFlowEl = ref(null);

// 一级树 + 工作台筛选
const kosTree = ref([]);
const treeUid = ref(undefined);
const chatRes = ref('all');
const chatTag = ref(undefined);
const chatKeyword = ref('');
const chatHasPhone = ref(false);
const chatDateRange = ref(null);
const newTag = ref('');
const tagSaving = ref(false);

const chatTagOptions = computed(() => {
  const set = new Set();
  for (const it of chatItems.value) for (const t of it.tags ?? []) set.add(t);
  return [...set].map((t) => ({ label: t, value: t }));
});

const chatDisplayItems = computed(() =>
  chatItems.value.filter((it) => !(chatRes.value !== 'false' && !it.is_resource && false)),
);

/** 相对时间：39秒前 / 1分钟前 / 3小时前 / 昨天 HH:mm / MM-DD HH:mm */
function relTime(v) {
  if (!v) return '-';
  const d = dayjs(v);
  if (!d.isValid()) return String(v);
  const diff = dayjs().diff(d, 'second');
  if (diff < 60) return `${Math.max(1, diff)}秒前`;
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
  if (d.isSame(dayjs().subtract(1, 'day'), 'day')) return `昨天 ${d.format('HH:mm')}`;
  return d.format('MM-DD HH:mm');
}

function fmtDay(v) {
  if (!v) return '';
  const d = dayjs(v);
  return d.isValid() ? d.format('YYYY-MM-DD') : '';
}

/** 来源账号昵称（subSource → KOS 树映射） */
function chatSourceAccount(item) {
  if (!item?.sub_source) return null;
  const hit = kosTree.value.find((k) => k.uid === item.sub_source);
  return hit?.nickname ?? null;
}

/** 消息时间轴：日期分隔 + 时间 chip + 系统消息居中 */
const isSystemMsg = (msg) => {
  const c = String(msg.content ?? '');
  return msg.type === 'system' || c.includes('温馨提示') || c.includes('没有 AI 接待');
};
const timelineBlocks = computed(() => {
  const blocks = [];
  let lastDay = '';
  let lastTime = '';
  for (const msg of messages.value) {
    const d = msg.created_at ? dayjs(msg.created_at * 1000) : null;
    const day = d?.isValid() ? d.format('YYYY-MM-DD') : '';
    const time = d?.isValid() ? d.format('HH:mm') : '';
    if (day && day !== lastDay) {
      blocks.push({ day });
      lastDay = day;
      lastTime = '';
    }
    if (time && time !== lastTime) {
      blocks.push({ time });
      lastTime = time;
    }
    if (isSystemMsg(msg)) blocks.push({ kind: 'system', msg });
    else blocks.push({ kind: 'msg', isClient: msg.role === 'client', msg });
  }
  return blocks;
});

const selectedTags = computed(() => detail.value?.tags ?? selected.value?.tags ?? []);

async function loadKosTree() {
  try {
    const res = await getLaiguKosTree(brandParam());
    kosTree.value = res.list ?? [];
  } catch {
    /* 树加载失败不阻塞 */
  }
}

function selectTree(k) {
  treeUid.value = k?.uid ?? undefined;
  chatPage.value = 1;
  loadChat(true);
}

function onChatFilterChange() {
  chatPage.value = 1;
  loadChat(true);
}

function chatParams() {
  const params = { ...brandParam() };
  if (chatKeyword.value) params.keyword = chatKeyword.value;
  if (chatRes.value === 'true' || chatRes.value === 'false') params.isResource = chatRes.value;
  if (hideEmpty.value) params.hasClientMessage = 'true';
  if (chatHasPhone.value) params.hasPhone = 'true';
  if (treeUid.value) params.uid = treeUid.value;
  if (chatTag.value) params.tag = chatTag.value;
  if (chatDateRange.value?.length === 2) {
    params.from = chatDateRange.value[0];
    params.to = chatDateRange.value[1];
  }
  return params;
}

function isPending(item) {
  // 客户发过消息且客服尚无后续回复 = 待回复
  return item.client_message_count > 0 && item.message_count <= item.client_message_count;
}

/** 未读近似数 = 客户消息数 − 客服消息数（来鼓无已读状态，按未承接消息估算） */
function pendingCount(item) {
  const pending = (item.client_message_count ?? 0) - ((item.message_count ?? 0) - (item.client_message_count ?? 0));
  return Math.max(0, pending);
}

async function loadChat(reset = false) {
  if (chatLoading.value) return;
  chatLoading.value = true;
  try {
    if (reset) chatPage.value = 1;
    const res = await getLaiguLeads({
      page: chatPage.value,
      page_size: 50,
      ...chatParams(),
    });
    const rows = res.list.map((r) => ({
      ...r,
      last_message_at: fmtTime(r.last_message_at),
    }));
    chatItems.value = reset ? rows : [...chatItems.value, ...rows];
    chatTotal.value = res.total ?? 0;
    if (reset && chatItems.value.length && !selected.value) {
      // 优先选中最近有客户内容的会话，避免默认落在空会话上
      const first = rows.find((r) => r.last_client_content || r.client_message_count > 0) ?? rows[0];
      await selectLead(first);
    }
  } catch {
    /* 静默 */
  } finally {
    chatLoading.value = false;
  }
}

function onListScroll(e) {
  const el = e.target;
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) {
    if (chatItems.value.length < chatTotal.value) {
      chatPage.value += 1;
      loadChat(false);
    }
  }
}

async function selectLead(item) {
  selected.value = item;
  detailLoading.value = true;
  detail.value = null;
  try {
    detail.value = await getLaiguLeadDetail(item.id);
    await nextTick();
    if (chatFlowEl.value) chatFlowEl.value.scrollTop = chatFlowEl.value.scrollHeight;
  } catch (e) {
    message.error(e.message || '加载对话失败');
  } finally {
    detailLoading.value = false;
  }
}

async function addTag() {
  const t = newTag.value.trim();
  if (!t || !selected.value) return;
  const cur = selectedTags.value;
  if (cur.includes(t)) {
    message.info('标签已存在');
    newTag.value = '';
    return;
  }
  tagSaving.value = true;
  try {
    const tags = [...cur, t].slice(0, 10);
    const res = await updateLaiguLeadTags(selected.value.id, tags);
    detail.value = { ...(detail.value ?? {}), tags: res.tags ?? tags };
    selected.value = { ...selected.value, tags: res.tags ?? tags };
    newTag.value = '';
  } catch (e) {
    message.error(e.message || '保存标签失败');
  } finally {
    tagSaving.value = false;
  }
}

async function removeTag(t) {
  if (!selected.value) return;
  const tags = selectedTags.value.filter((x) => x !== t);
  tagSaving.value = true;
  try {
    const res = await updateLaiguLeadTags(selected.value.id, tags);
    detail.value = { ...(detail.value ?? {}), tags: res.tags ?? tags };
    selected.value = { ...selected.value, tags: res.tags ?? tags };
  } catch (e) {
    message.error(e.message || '删除标签失败');
  } finally {
    tagSaving.value = false;
  }
}

async function copySessionId() {
  try {
    await navigator.clipboard.writeText(String(selected.value?.session_id ?? ''));
    message.success('会话 ID 已复制');
  } catch {
    message.warning('复制失败，请手动选择复制');
  }
}

function adName(record) {
  return record.ad_info?.campaign_name || record.ad_info?.advertiser_name || '';
}

function adShort(record) {
  return record.ad_info?.advertiser_name || '投放会话';
}

function sourceLabel(source) {
  const map = { redbook: '小红书' };
  return map[source] || source || '-';
}

function roleLabel(msg) {
  if (msg.role === 'client') return msg.name || '客户';
  if (msg.role === 'ai_employee') return msg.name || 'AI客服';
  return msg.name || '客服';
}

/** 消息渲染分类：text / photo / voice / json（json = 各类小红书卡片：笔记/名片/分享评论/通用） */
function msgCard(msg) {
  const t = String(msg.type ?? '');
  const raw = String(msg.content ?? '');
  if (t === 'photo') return { kind: 'photo', url: raw };
  if (t === 'voice') return { kind: 'voice' };
  let data = null;
  if (raw.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') data = parsed;
    } catch {
      data = null;
    }
  }
  if (data) return { kind: 'json', data };
  return { kind: 'text', text: raw };
}

/** 可渲染为卡片的 JSON（含标题/图片/链接特征） */
function isCardData(data) {
  return !!(data && (data.title || data.image || data.cover || data.name || data.note_link));
}

function cardImg(data) {
  return data?.cover || data?.image || '';
}

function cardTitle(data) {
  return data?.title || data?.name || '卡片消息';
}

function noteAuthor(data) {
  return data?.user_info?.nickname || '';
}

function cardLink(data) {
  const link = data?.note_link || data?.link || '';
  // xhsdiscover:// 等 app 私有协议浏览器无法打开，不渲染链接
  return link.startsWith('http') ? link : '';
}

function onCardImgError(e) {
  const el = e.target;
  const span = document.createElement('span');
  span.className = 'img-expired';
  span.textContent = '图片已过期';
  el.replaceWith(span);
}

function fmtTime(value) {
  if (!value) return '-';
  if (typeof value === 'number') {
    const ms = value > 1e12 ? value : value * 1000;
    return dayjs(ms).format('YYYY-MM-DD HH:mm');
  }
  return dayjs(value).format('YYYY-MM-DD HH:mm');
}

onMounted(() => {
  reload();
  loadStats();
  loadKosOptions();
  loadKosTree();
});
</script>

<style scoped>
/* 会话状态切换（默认已留资）：加粗强调 */
.res-seg {
  font-weight: 600;
}

/* 已留资会话整行浅绿高亮 + 左侧绿色描边，一眼识别 */
:deep(.row-resourced > td) {
  background: #f2fbf6 !important;
}

:deep(.row-resourced > td:first-child) {
  box-shadow: inset 3px 0 0 #16a34a;
}

.stat-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 12px;
}

.stat-card {
  background: #fff;
  border-radius: var(--radius-card, 12px);
  padding: 16px 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.stat-value {
  font-size: 26px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: #1e293b;
}

.stat-label {
  margin-top: 2px;
  font-size: 13px;
  color: #64748b;
}

.accent-blue .stat-value {
  color: #3456e6;
}

.accent-green .stat-value {
  color: #16a34a;
}

.accent-purple .stat-value {
  color: #9333ea;
}

.muted {
  color: #94a3b8;
}

.mini {
  font-size: 12px;
}

.phone-text {
  font-variant-numeric: tabular-nums;
}

/* ── 对话视图（四栏工作台：KOS树 / 会话列表 / 对话详情 / 用户信息） ── */
.chat-shell {
  display: flex;
  height: calc(100vh - 150px);
  min-height: 560px;
}

/* 一级：KOS 账号树 */
.kos-tree {
  width: 200px;
  flex-shrink: 0;
  border-right: 1px solid #eef2f7;
  display: flex;
  flex-direction: column;
  background: #fbfcfe;
}

.kos-tree-head {
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
  padding: 12px 14px 8px;
  border-bottom: 1px solid #f1f5f9;
}

.kos-tree-body {
  flex: 1;
  overflow-y: auto;
}

.kos-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  border-bottom: 1px solid #f8fafc;
}

.kos-item:hover {
  background: #f1f5f9;
}

.kos-item.active {
  background: #eef4ff;
  border-right: 2px solid #3456e6;
}

.kos-name {
  font-size: 12px;
  color: #334155;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kos-count {
  font-size: 11px;
  color: #64748b;
  background: #eef2f7;
  border-radius: 8px;
  padding: 0 6px;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.conv-list {
  width: 320px;
  flex-shrink: 0;
  border-right: 1px solid #eef2f7;
  overflow-y: auto;
}

.conv-list-head {
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
  padding: 10px 14px 8px;
  border-bottom: 1px solid #f1f5f9;
  position: sticky;
  top: 0;
  background: #fff;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.clh-top {
  display: flex;
  align-items: center;
  gap: 8px;
}

.clh-top .filter-icon {
  margin-left: auto;
  color: #64748b;
  cursor: pointer;
  font-size: 14px;
}

.clh-top .filter-icon:hover {
  color: #3456e6;
}

.clh-quick :deep(.ant-segmented-item) {
  font-size: 12px;
}

.conv-item {
  display: flex;
  gap: 10px;
  padding: 10px 14px;
  cursor: pointer;
  border-bottom: 1px solid #f8fafc;
}

.conv-item:hover {
  background: #f8fafc;
}

.conv-item.active {
  background: #eef4ff;
}

.conv-item.resourced {
  background: #f4fcf7;
}

.conv-item.resourced.active {
  background: #eef4ff;
}

.conv-avatar {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: #eef4ff;
  color: #3456e6;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  flex-shrink: 0;
}

.conv-avatar.sm {
  width: 28px;
  height: 28px;
  font-size: 12px;
}

.conv-avatar.lg {
  width: 44px;
  height: 44px;
}

.conv-main {
  flex: 1;
  min-width: 0;
}

.conv-top {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.conv-name {
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conv-time {
  font-size: 11px;
  color: #94a3b8;
  flex-shrink: 0;
}

.conv-sub {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
}

.conv-preview {
  flex: 1;
  font-size: 12px;
  color: #94a3b8;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.unread-badge {
  min-width: 16px;
  height: 16px;
  border-radius: 8px;
  background: #ef4444;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
  flex-shrink: 0;
}

.conv-tag {
  font-size: 11px;
  line-height: 16px;
  padding: 0 4px;
  flex-shrink: 0;
}

.conv-more {
  text-align: center;
  padding: 10px 0;
}

.conv-dialog {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.conv-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 18px;
  border-bottom: 1px solid #eef2f7;
}

.ch-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.ch-name {
  font-size: 15px;
  font-weight: 700;
  color: #1e293b;
}

.ch-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.chat-flow {
  flex: 1;
  overflow-y: auto;
  padding: 18px 22px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: #fafbfc;
}

/* 时间轴：日期/时间 chip + 系统消息 */
.tl-chip {
  align-self: center;
  font-size: 11px;
  color: #94a3b8;
  background: #eef2f7;
  border-radius: 10px;
  padding: 2px 10px;
}

.tl-day {
  font-weight: 600;
  color: #64748b;
}

.tl-system {
  align-self: center;
  max-width: 70%;
  text-align: center;
  font-size: 11px;
  color: #94a3b8;
  background: #f1f5f9;
  border-radius: 8px;
  padding: 4px 12px;
  word-break: break-all;
}

/* 只读输入区（还原工作台样式，禁用置灰） */
.chat-input-bar {
  border-top: 1px solid #eef2f7;
  padding: 8px 14px 12px;
  background: #fff;
}

.cib-tools {
  display: flex;
  align-items: center;
  gap: 14px;
  color: #94a3b8;
  font-size: 15px;
  padding-bottom: 6px;
}

.cib-quick {
  margin-left: auto;
  font-size: 12px;
}

.cib-send {
  display: flex;
  justify-content: flex-end;
  margin-top: 6px;
}

/* 右栏客户资料 */
.conv-profile {
  width: 280px;
  flex-shrink: 0;
  border-left: 1px solid #eef2f7;
  overflow-y: auto;
  padding: 14px 16px;
}

.profile-cust {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}

.profile-cust b {
  font-size: 14px;
  color: #1e293b;
}

.tag-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.session-id {
  font-variant-numeric: tabular-nums;
  font-size: 11px !important;
  word-break: break-all !important;
}

.copy-btn {
  flex-shrink: 0;
  color: #3456e6;
}

.profile-section {
  margin-bottom: 16px;
}

.profile-sub {
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
  margin-bottom: 8px;
  padding-bottom: 4px;
  border-bottom: 1px dashed #e2e8f0;
}

.profile-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  padding: 4px 0;
}

.profile-row span {
  color: #94a3b8;
  flex-shrink: 0;
}

.profile-row b {
  color: #1e293b;
  font-weight: 600;
  text-align: right;
  word-break: break-all;
}

/* ── 详情抽屉 ── */
.detail-shell {
  height: 100%;
  overflow-y: auto;
  padding: 16px 20px 24px;
}

.detail-loading {
  margin-top: 120px;
}

.detail-section {
  margin-bottom: 18px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 10px;
}

.chat-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.chat-row {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.chat-row.self {
  align-items: flex-end;
}

.chat-meta {
  display: flex;
  gap: 8px;
  font-size: 12px;
  color: #94a3b8;
  margin-bottom: 3px;
}

.chat-bubble {
  max-width: 78%;
  padding: 8px 12px;
  border-radius: 10px;
  background: #f1f5f9;
  color: #1e293b;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.chat-row.self .chat-bubble {
  background: #eaf1ff;
  color: #1d4ed8;
}

.note-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.note-title {
  font-weight: 600;
}

/* ── 消息卡片（名片/分享评论/通用卡/图片/语音/JSON） ── */
.msg-card {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  min-width: 220px;
  max-width: 320px;
}

.msg-card-img {
  width: 56px;
  height: 56px;
  border-radius: 6px;
  object-fit: cover;
  flex-shrink: 0;
  background: #f1f5f9;
}

.msg-card-body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.msg-card-title {
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
  line-height: 1.35;
  word-break: break-all;
}

.msg-card-sub {
  font-size: 11px;
  color: #94a3b8;
}

.msg-card-body .msg-card-sub + .msg-card-title {
  margin-top: 0;
}

.msg-photo {
  max-width: 220px;
  max-height: 280px;
  border-radius: 8px;
  display: block;
  cursor: zoom-in;
}

.msg-voice {
  font-size: 13px;
  color: #475569;
}

.msg-json {
  font-size: 11px;
  color: #64748b;
  background: rgba(15, 23, 42, 0.05);
  padding: 8px 10px;
  border-radius: 6px;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 150px;
  overflow: auto;
}

.img-expired {
  font-size: 11px;
  color: #94a3b8;
}

.raw-json {
  max-height: 320px;
  overflow: auto;
  font-size: 12px;
  background: #f8fafc;
  border-radius: 8px;
  padding: 10px;
  margin: 0;
}
</style>
