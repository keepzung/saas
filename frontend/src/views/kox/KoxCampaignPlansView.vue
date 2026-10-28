<template>
  <PageWrapper title="投放计划" subtitle="投流情况总览与账户投放明细">
    <template #filters>
      <FilterTopbar>
        <a-radio-group v-model:value="days" size="small" @change="onDaysChange">
          <a-radio-button :value="7">近7天</a-radio-button>
          <a-radio-button :value="30">近30天</a-radio-button>
        </a-radio-group>
        <a-range-picker v-model:value="range" size="small" @change="onRangeChange" />
        <a-select
          v-if="!isTesla"
          v-model:value="accountType"
          size="small"
          style="width: 120px"
          placeholder="账号类型"
          allow-clear
          :options="[
            { value: 'KOS', label: 'KOS 账号' },
            { value: 'KOB', label: 'KOB 账号' },
            { value: 'KOC', label: 'KOC 账号' },
          ]"
          @change="onFilterChange"
        />
        <a-input-search
          v-model:value="storeKeyword"
          size="small"
          style="width: 170px"
          placeholder="门店名筛选"
          allow-clear
          @search="onFilterChange"
        />
        <a-button size="small" @click="reload">
          <ReloadOutlined />
        </a-button>
      </FilterTopbar>
    </template>

    <a-alert
      v-if="cookieValid === false && !isVw"
      type="error"
      show-icon
      style="margin-bottom: 12px"
      message="投放数据拉取异常，投放数据暂停更新"
      description="数据断档期间历史数据仍可筛选，数据补齐后自动恢复实时展示。请联系管理员处理。"
    />

    <a-card :bordered="false" class="overview-card" :body-style="{ padding: '16px' }">
      <div class="section-title">
        <span class="bar"></span>投流情况总览
        <a-segmented
          v-if="isMdd"
          v-model:value="caliber"
          size="small"
          style="margin-left: 14px"
          :options="[
            { label: '自然流', value: 'organic' },
            { label: '聚光投放', value: 'juguang' },
            { label: '汇总', value: 'total' },
          ]"
          @change="() => nextTick(renderCharts)"
        />
      </div>

      <div class="hero-row" v-if="caliber !== 'organic'">
        <div class="hero-item">
          <div class="hero-label">
            总消耗（元）
            <a-tooltip v-if="heroFeeScopeNote" :title="heroFeeScopeNote">
              <InfoCircleOutlined class="metric-tip" />
            </a-tooltip>
          </div>
          <div class="hero-value hl-blue">{{ fmtNum(heroFee) }}</div>
        </div>
        <div class="hero-divider"></div>
        <div class="hero-item">
          <div class="hero-label">
            {{ isMdd ? (caliber === 'juguang' ? '广告线索' : '线索数') : '总私信留资数' }}
            <a-tooltip v-if="isMdd" :title="caliber === 'juguang' ? '聚光投放口径=线索分析「新增广告线索」（窗口逐日求和），与下方广告线索卡一致' : '与运营总览「全部线索/留资数」同源：MCC 线索管理→线索分析（按所选区间逐日求和，含广告/自然全部留资组件）；线索表空窗时回退笔记私信口径'">
              <InfoCircleOutlined class="metric-tip" />
            </a-tooltip>
          </div>
          <div class="hero-value hl-green">{{ fmtNum(leadCaliberValue) }}</div>
        </div>
        <div class="hero-divider"></div>
        <div class="hero-item">
          <div class="hero-label">{{ isMdd ? (caliber === 'juguang' ? '广告线索成本（元）' : '留资成本（元）') : '私信留资成本（元）' }}</div>
          <div class="hero-value hl-violet">{{ heroLeadCost }}</div>
        </div>
      </div>
      <div class="hero-row" v-else>
        <div class="hero-item">
          <div class="hero-label">
            笔记数
            <a-tooltip title="窗口内发布的全部员工笔记数（媒体级自然拆分视角，与运营总览·内容发布数同口径）">
              <InfoCircleOutlined class="metric-tip" />
            </a-tooltip>
          </div>
          <div class="hero-value hl-blue">{{ fmtNum(organicSummary?.note_cnt ?? 0) }}</div>
        </div>
        <div class="hero-divider"></div>
        <div class="hero-item">
          <div class="hero-label">自然曝光</div>
          <div class="hero-value hl-green">{{ fmtNum(organicSummary?.exposure ?? 0) }}</div>
        </div>
        <div class="hero-divider"></div>
        <div class="hero-item">
          <div class="hero-label">自然阅读</div>
          <div class="hero-value hl-violet">{{ fmtNum(organicSummary?.views ?? 0) }}</div>
        </div>
        <div class="hero-divider"></div>
        <div class="hero-item">
          <div class="hero-label">
            自然线索
            <a-tooltip title="MCC 线索管理→线索分析「新增自然线索」（所选区间逐日求和，账号维度同源）">
              <InfoCircleOutlined class="metric-tip" />
            </a-tooltip>
          </div>
          <div class="hero-value hl-blue">{{ fmtNum(clueSummary?.nature ?? 0) }}</div>
        </div>
      </div>

      <!-- 聚光口径 / 汇总：聚光投放指标卡 -->
      <div class="metric-grid" v-if="caliber !== 'organic'">
        <div class="metric-card">
          <div class="metric-label">
            投流内容数
            <a-tooltip :title="isMdd ? '窗口内有投放曝光的员工笔记数（聚光笔记报表口径，仅投放笔记不统计未投放，T+1/30 天窗口）' : isTesla ? '所选周期内被投流的笔记数（聚光笔记报表按笔记去重，剔官号，T+1）' : '全部历史被投流推广的笔记数（数据来源：聚光笔记推广状态，T+1）'">
              <InfoCircleOutlined class="metric-tip" />
            </a-tooltip>
          </div>
          <div class="metric-value">{{ mode === 'real' ? fmtNum(isMdd ? (campNoteMetrics?.note_cnt ?? 0) : (summary.promo_note_cnt ?? 0)) : '—' }}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">
            投流账号数
            <a-tooltip title="所选周期内被投流的 KOS 账号数（投流笔记 → 基线账号去重，剔官号，T+1）">
              <InfoCircleOutlined class="metric-tip" />
            </a-tooltip>
          </div>
          <div class="metric-value">{{ fmtNum(summary.account_num) }}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">
            {{ isMdd ? (caliber === 'total' ? '总曝光' : '投放曝光') : caliber === 'total' ? '总曝光（投+自）' : '总曝光' }}
            <a-tooltip v-if="isMdd" :title="caliber === 'total' ? '与运营总览·汇总一致：笔记明细分析行求和（发布窗口终身值）' : '聚光→标准投→基础报表→笔记报表口径：仅投放笔记（员工笔记）日维度竞价曝光窗口求和，不含未投放/官号内容'">
              <InfoCircleOutlined class="metric-tip" />
            </a-tooltip>
          </div>
          <div class="metric-value">{{ fmtWan(displayMetrics.impression) }}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">
            {{ isMdd ? (caliber === 'total' ? '总阅读' : '投放点击') : caliber === 'total' ? '自然阅读' : '总点击' }}
            <a-tooltip v-if="isMdd" :title="caliber === 'total' ? '与运营总览·总阅读一致：笔记明细分析行求和' : '笔记报表口径：仅投放笔记日维度竞价点击窗口求和'">
              <InfoCircleOutlined class="metric-tip" />
            </a-tooltip>
          </div>
          <div class="metric-value">{{ fmtWan(displayMetrics.views) }}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">
            {{ isMdd ? (caliber === 'total' ? '总互动' : '投放点击率') : caliber === 'total' ? '总互动（投+自）' : '总点击率' }}
            <a-tooltip v-if="isMdd && caliber === 'total'" title="与运营总览·总互动一致：赞+藏+评+享+涨粉（笔记明细分析行求和）">
              <InfoCircleOutlined class="metric-tip" />
            </a-tooltip>
          </div>
          <div class="metric-value">{{ caliber === 'total' ? fmtWan(displayMetrics.interaction) : (isMdd ? displayMetrics.ctr + '%' : summary.ctr + '%') }}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">
            私信进线数
            <a-tooltip v-if="isMdd" :title="caliber === 'juguang' ? '聚光投放日报私信咨询（种草账户 10847045）' : '线索分析·获客工具统计「私信进线人数」窗口求和（总数含商流+自然流，与运营总览一致）'">
              <InfoCircleOutlined class="metric-tip" />
            </a-tooltip>
          </div>
          <div class="metric-value">{{ fmtNum(isMdd && caliber === 'juguang' ? summary.camp_consult : summary.msg_inquiries) }}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">
            私信开口数
            <a-tooltip v-if="isMdd" :title="caliber === 'juguang' ? '聚光投放日报私信开口人数（种草账户 10847045）' : '线索分析·获客工具统计「私信开口人数」窗口求和（总数含商流+自然流，与运营总览一致）'">
              <InfoCircleOutlined class="metric-tip" />
            </a-tooltip>
          </div>
          <div class="metric-value">{{ fmtNum(isMdd && caliber === 'juguang' ? summary.camp_open : summary.msg_openings) }}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">
            <template v-if="isMdd">{{ caliber === 'juguang' ? '广告线索' : '线索数' }}</template>
            <template v-else>私信留资数</template>
            <a-tooltip v-if="isMdd" :title="caliber === 'juguang' ? '聚光投放口径=线索分析「新增广告线索」（所选区间逐日求和）' : '汇总口径=线索分析「新增线索」合计（与运营总览一致）'">
              <InfoCircleOutlined class="metric-tip" />
            </a-tooltip>
          </div>
          <div class="metric-value">{{ fmtNum(leadCaliberValue) }}</div>
        </div>
      </div>
      <!-- 自然流口径：自然内容指标卡（媒体级自然拆分，与运营总览·自然三数同值） -->
      <div class="metric-grid" v-else>
        <div class="metric-card">
          <div class="metric-label">
            笔记数
            <a-tooltip title="窗口内发布的全部员工笔记数（媒体级自然拆分视角，与运营总览·内容发布数同口径）">
              <InfoCircleOutlined class="metric-tip" />
            </a-tooltip>
          </div>
          <div class="metric-value">{{ fmtNum(organicSummary?.note_cnt ?? 0) }}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">
            自然曝光
            <a-tooltip title="星火笔记明细分析「自然曝光量」列求和（媒体级拆分，与运营总览·自然曝光同值）">
              <InfoCircleOutlined class="metric-tip" />
            </a-tooltip>
          </div>
          <div class="metric-value">{{ fmtWan(organicSummary?.exposure ?? 0) }}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">
            自然阅读
            <a-tooltip title="星火笔记明细分析「自然阅读量」列求和（媒体级拆分，与运营总览·自然点击同值）">
              <InfoCircleOutlined class="metric-tip" />
            </a-tooltip>
          </div>
          <div class="metric-value">{{ fmtWan(organicSummary?.views ?? 0) }}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">
            自然互动
            <a-tooltip title="总互动量（赞+藏+评+享+涨粉）− 星火笔记明细分析「竞价推广互动量」列（与运营总览·自然互动同值）">
              <InfoCircleOutlined class="metric-tip" />
            </a-tooltip>
          </div>
          <div class="metric-value">{{ fmtWan(organicSummary?.interaction ?? 0) }}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">
            涨粉数
            <a-tooltip title="平台无自然/投流涨粉拆分，取窗口内笔记涨粉合计（与运营总览·新增粉丝数同值）">
              <InfoCircleOutlined class="metric-tip" />
            </a-tooltip>
          </div>
          <div class="metric-value">{{ fmtNum(organicSummary?.follow ?? 0) }}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">
            自然线索
            <a-tooltip title="线索分析「新增自然线索」（所选区间逐日求和，2026-10-22 口径）">
              <InfoCircleOutlined class="metric-tip" />
            </a-tooltip>
          </div>
          <div class="metric-value">{{ fmtNum(clueSummary?.nature ?? 0) }}</div>
        </div>
      </div>

      <div class="metric-grid metric-grid-5" v-if="caliber !== 'organic'">
        <div class="metric-card">
          <div class="metric-label">点击成本</div>
          <div class="metric-value">{{ summary.click ? fmtNum(summary.cpc) : '—' }}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">千次展示成本</div>
          <div class="metric-value">{{ summary.impression ? fmtNum(summary.cpm) : '—' }}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">私信进线成本</div>
          <div class="metric-value">{{ summary.msg_inquiries ? fmtNum(summary.msg_inquiry_cost) : '—' }}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">私信开口成本</div>
          <div class="metric-value">{{ summary.msg_openings ? fmtNum(summary.msg_open_cost) : '—' }}</div>
        </div>
        <div class="metric-card">
          <!-- Morgandada：值=消耗÷线索分析合计（已是私信线索口径），标签对齐 2026-10-23 三数合一 -->
          <div class="metric-label">{{ isMdd ? '私信线索成本' : '私信留资成本' }}</div>
          <div class="metric-value">{{ summary.msg_leads ? fmtNum(summary.msg_lead_cost) : '—' }}</div>
        </div>
      </div>

      <div class="charts-row">
        <a-card :bordered="false" size="small" class="chart-card" v-if="caliber !== 'organic'">
          <template #title><div class="chart-title"><span class="bar"></span>消费趋势</div></template>
          <div :ref="(el) => (consumeEl = el)" class="chart-area" />
        </a-card>
        <a-card :bordered="false" size="small" class="chart-card" v-if="caliber !== 'organic'">
          <template #title>
            <div class="chart-title-wrap">
              <div class="chart-title"><span class="bar"></span>{{ isMdd ? '私信线索趋势' : '私信留资数趋势' }}</div>
              <a-radio-group v-model:value="leadTab" size="small" @change="() => nextTick(renderCharts)">
                <a-radio-button value="inquiries">私信进线数</a-radio-button>
                <a-radio-button value="openings">私信开口数</a-radio-button>
                <a-radio-button value="leads">{{ isMdd ? '线索数' : '私信留资数' }}</a-radio-button>
              </a-radio-group>
            </div>
          </template>
          <div :ref="(el) => (leadsEl = el)" class="chart-area" />
        </a-card>
        <a-card :bordered="false" size="small" class="chart-card" v-if="caliber === 'organic'">
          <template #title><div class="chart-title"><span class="bar"></span>自然流趋势（按发布日）</div></template>
          <div :ref="(el) => (organicEl = el)" class="chart-area" />
        </a-card>
        <!-- Morgandada(5)：自然流页签日留资折线（线索分析·自然线索逐日，2026-10-23 客户要求） -->
        <a-card :bordered="false" size="small" class="chart-card" v-if="caliber === 'organic'">
          <template #title><div class="chart-title"><span class="bar"></span>日留资趋势（自然线索）</div></template>
          <div :ref="(el) => (organicLeadsEl = el)" class="chart-area" />
        </a-card>
      </div>
    </a-card>

    <!-- Morgandada(5)：计划详情隐藏（按账号汇总唯一行=主账号 MorganDaDa，客户 2026-10-23 要求不在投放页显示） -->
    <a-card v-if="!isMdd" :bordered="false" size="small" class="detail-card">
      <template #title>
        <div class="chart-title-wrap">
          <div class="chart-title"><span class="bar"></span>计划详情</div>
          <a-tabs v-model:activeKey="detailTab" size="small" class="detail-tabs" @change="onDetailTabChange">
            <a-tab-pane v-if="!isTesla" key="account" tab="按账号汇总" />
            <a-tab-pane key="note" tab="按笔记汇总" />
            <a-tab-pane v-if="isTesla" key="author" tab="按作者汇总" />
            <a-tab-pane key="region" tab="区域汇总" />
          </a-tabs>
        </div>
      </template>
      <template #extra>
        <a-button size="small" type="primary" :loading="exporting" @click="exportAll">
          <DownloadOutlined /> 数据导出
        </a-button>
      </template>

      <div v-if="detailTab === 'note'" class="note-filter-row">
        <a-select
          v-if="isTesla"
          v-model:value="noteRegionFilter"
          size="small"
          style="width: 130px"
          :options="noteRegionOptions"
          @change="loadNoteTab"
        />
        <a-select
          v-if="!isTesla"
          v-model:value="noteRtbFilter"
          size="small"
          style="width: 130px"
          :options="[
            { label: '全部笔记', value: 'all' },
            { label: '已推广', value: 'true' },
            { label: '未推广', value: 'false' },
          ]"
          @change="loadNoteTab"
        />
        <a-input-search
          v-model:value="noteKeyword"
          size="small"
          style="width: 200px"
          placeholder="搜索笔记标题"
          allow-clear
          @search="loadNoteTab"
        />
        <span v-if="isTesla" class="muted small">仅展示投放笔记 · 口径：聚光笔记报表按笔记ID去重求和（窗口内逐日聚合）</span>
        <span v-else class="muted small">口径：聚光笔记效果数据（近30天累计快照），非投放消耗拆分</span>
      </div>
      <div v-if="detailTab === 'author'" class="note-filter-row">
        <a-input-search
          v-model:value="noteKeyword"
          size="small"
          style="width: 200px"
          placeholder="搜索作者 / 笔记标题"
          allow-clear
          @search="loadAuthorTab"
        />
        <span v-if="isTesla" class="muted small">口径：聚光笔记报表按基线账号归属 · 笔记数=该作者窗口内被投流笔记数 · 未匹配基线的以报表作者名单列</span>
      </div>
      <div v-if="detailTab === 'region'" class="note-filter-row">
        <a-radio-group v-model:value="regionGroupby" size="small" @change="loadRegionTab">
          <a-radio-button v-if="!isMdd" value="region">按大区</a-radio-button>
          <a-radio-button value="store">按门店</a-radio-button>
        </a-radio-group>
        <span class="muted small">口径：投放数据按账户归属映射至大区/门店，未匹配账户单独归组</span>
      </div>

      <a-table
        v-if="detailTab === 'account'"
        :columns="accountColumns"
        :data-source="accountRows"
        :loading="loading"
        :pagination="{ total: accountTotal, current: page, pageSize: PAGE_SIZE, size: 'small', showSizeChanger: false }"
        row-key="virtual_seller_id"
        @change="onTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <div class="c-name">{{ record.name }}</div>
            <div class="muted small">
              {{ record.account_kind === 'agent_sub' ? '代理商子账户' : '品牌主账户' }}
              <template v-if="record.agent_name"> · {{ record.agent_name }}</template>
            </div>
          </template>
          <template v-else-if="column.key === 'fee'">
            <div class="bar-cell">
              <span class="bar-num">¥{{ fmtNum(record.fee) }}</span>
              <div class="bar-track">
                <div class="bar-fill" :style="{ width: `${(record.fee / maxFee) * 100}%` }" />
              </div>
            </div>
          </template>
        </template>
      </a-table>

      <a-table
        v-else-if="detailTab === 'note'"
        :columns="noteColumns"
        :data-source="noteRows"
        :loading="noteLoading"
        :pagination="{ total: noteTotal, current: notePage, pageSize: PAGE_SIZE, size: 'small', showSizeChanger: false }"
        row-key="id"
        @change="onNoteTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'title'">
            <div class="note-cell">
              <img class="note-thumb" :src="record.cover" alt="" loading="lazy" @error="onNoteCoverErr(record)" />
              <div class="note-meta">
                <a v-if="record.note_url" :href="record.note_url" target="_blank" rel="noopener noreferrer" class="c-name">{{ record.title }}</a>
                <span v-else class="c-name">{{ record.title }}</span>
                <div class="muted small">{{ record.author_name }} · {{ record.publish_time }}</div>
              </div>
            </div>
          </template>
          <template v-else-if="column.key === 'rtb'">
            <a-tag :color="record.is_rtb ? 'green' : 'default'">{{ record.is_rtb ? '已推广' : '未推广' }}</a-tag>
          </template>
          <template v-else-if="column.key === 'fee'">
            <span class="fee-num">¥{{ fmtNum(record.fee) }}</span>
          </template>
          <template v-else-if="column.key === 'ctr'">
            {{ record.ctr != null ? `${record.ctr}%` : '-' }}
          </template>
          <template v-else-if="column.key === 'msg_lead_cost'">
            {{ record.msg_leads ? `¥${record.msg_lead_cost}` : '-' }}
          </template>
        </template>
      </a-table>

      <a-table
        v-else-if="detailTab === 'author'"
        :columns="authorColumns"
        :data-source="authorRows"
        :loading="authorLoading"
        :pagination="false"
        row-key="author"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'author'">
            <div class="c-name">{{ record.author }}</div>
            <div v-if="!record.matched" class="muted small">未匹配基线（报表作者）</div>
          </template>
          <template v-else-if="column.key === 'fee'">
            <span class="fee-num">¥{{ fmtNum(record.fee) }}</span>
          </template>
          <template v-else-if="column.key === 'ctr'">
            {{ record.ctr != null ? `${record.ctr}%` : '-' }}
          </template>
          <template v-else-if="column.key === 'msg_lead_cost'">
            {{ record.msg_leads ? `¥${record.msg_lead_cost}` : '-' }}
          </template>
        </template>
      </a-table>

      <a-table
        v-else-if="detailTab === 'region'"
        :columns="regionColumns"
        :data-source="regionRows"
        :loading="regionLoading"
        :pagination="false"
        row-key="name"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'fee'">
            <div class="bar-cell">
              <span class="bar-num">¥{{ fmtNum(record.fee) }}</span>
              <div class="bar-track">
                <div class="bar-fill" :style="{ width: `${(record.fee / maxRegionFee) * 100}%` }" />
              </div>
            </div>
          </template>
        </template>
      </a-table>
    </a-card>
  </PageWrapper>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { message } from 'ant-design-vue';
import { ReloadOutlined, DownloadOutlined, InfoCircleOutlined } from '@ant-design/icons-vue';
import dayjs from 'dayjs';
import * as echarts from 'echarts';
import PageWrapper from '../../components/PageWrapper.vue';
import FilterTopbar from '../../components/FilterTopbar.vue';
import { getSparkCampaignSummary, getSparkCampaignAccounts, getSparkCampaignNotes, getSparkCampaignRegion } from '../../api/spark';
import { getKoxAccounts, getKoxNotes } from '../../api/kox';
import { exportExcel } from '../../utils/excel';
import { useAuthStore } from '../../stores/auth';

const auth = useAuthStore();
// 特斯拉按客户要求隐藏「按账号汇总」页签
const isTesla = computed(() => (auth.currentBrandId ?? 0) === 6);
// Morgandada：投放三口径切换（自然流 / 聚光投放 / 汇总）
const isMdd = computed(() => (auth.currentBrandId ?? 0) === 5);
// 大众(4)：无投流数据时如实空态，绝不回退演示（荣威假经销商对客户严重误导）
const isVw = computed(() => (auth.currentBrandId ?? 0) === 4);
const caliber = ref('juguang');
const PAGE_SIZE = 10;

/* ---------- 演示模式（表空回退） ---------- */
const rand = (seed) => {
  const x = Math.sin(seed * 127.1) * 43758.5453;
  return x - Math.floor(x);
};
const DEMO_ACCOUNTS = [
  '荣威北京中心', '上海安吉荣威', '成都宏达荣威', '广州广物荣威',
  '杭州康桥荣威', '武汉黄浦荣威', '南京朗驰荣威', '深圳都灵荣威',
];

const days = ref(7);
const range = ref([]);
const mode = ref('loading');
const loading = ref(false);
const cookieValid = ref(undefined);
const page = ref(1);
const leadTab = ref('inquiries');
const detailTab = ref(isTesla.value ? 'note' : 'account');
const summary = ref({});
const trend = ref([]);
const platform = ref(null);
const coverage = ref(null);
const organicSummary = ref(null);
const organicLeadsEl = ref(null);
// Morgandada(5)：汇总口径块（与运营总览一致）+ 聚光投放口径块（笔记报表，仅投放笔记）
const overviewSummary = ref(null);
const campNoteMetrics = ref(null);
// Morgandada 线索分析块（全部/广告/自然线索，随所选区间）
const clueSummary = ref(null);
const organicEl = ref(null);
let organicChart = null;
let organicLeadsChart = null;

// 三口径展示值：聚光=报表原值；自然流=自然块；汇总=投+自相加（消耗仅聚光有）
// Morgandada(5) 2026-10-23 起口径切换：汇总=运营总览同源（overview 块：明细分析行求和+获客工具统计）；
// 聚光投放=笔记报表口径（camp_note 块：明细分析日维度竞价列窗口求和，仅投放笔记）
const displayMetrics = computed(() => {
  const s = summary.value ?? {};
  const o = organicSummary.value ?? {};
  const ov = overviewSummary.value ?? {};
  const cn = campNoteMetrics.value ?? {};
  if (caliber.value === 'organic') {
    return { impression: o.exposure ?? 0, views: o.views ?? 0, interaction: o.interaction ?? 0 };
  }
  if (isMdd.value) {
    if (caliber.value === 'total') {
      return {
        impression: ov.exposure_sum ?? 0,
        views: ov.view_sum ?? 0,
        interaction: ov.interaction_total ?? 0,
      };
    }
    const ctr = cn.impression ? Math.round((cn.click / cn.impression) * 10000) / 100 : 0;
    return { impression: cn.impression ?? 0, views: cn.click ?? 0, interaction: cn.interaction ?? 0, ctr };
  }
  if (caliber.value === 'total') {
    return {
      impression: Number(s.impression ?? 0) + Number(o.exposure ?? 0),
      views: Number(o.views ?? 0),
      interaction: Number(s.interaction ?? 0) + Number(o.interaction ?? 0),
    };
  }
  return { impression: s.impression ?? 0, views: s.click ?? 0, interaction: s.interaction ?? 0 };
});
const accountRows = ref([]);
const accountTotal = ref(0);
const exporting = ref(false);
// 账号类型（KOS/KOB/KOC）与门店名筛选
const accountType = ref();
const storeKeyword = ref('');

// 客户 2026-10 确认：以聚光「标准投笔记报表」为唯一消耗口径，不再使用平台盯盘月快照
const heroFee = computed(() => summary.value.fee ?? 0);
const heroFeeScopeNote = computed(() => '');
const heroLeadCost = computed(() => {
  // Morgandada(5)：留资成本随口径分母走（聚光投放=广告线索、汇总=线索合计）
  if (isMdd.value) {
    const leads = Number(leadCaliberValue.value ?? 0);
    if (!leads) return '—';
    return fmtNum(Math.round((Number(summary.value.fee ?? 0) / leads) * 100) / 100);
  }
  if (!summary.value.msg_leads) return '—';
  return fmtNum(summary.value.msg_lead_cost);
});

const consumeEl = ref(null);
const leadsEl = ref(null);
let consumeChart = null;
let leadsChart = null;

function fmtNum(v) {
  return Number(v ?? 0).toLocaleString();
}
function fmtWan(v) {
  const n = Number(v ?? 0);
  return n >= 10000 ? `${(n / 10000).toFixed(2)}w` : fmtNum(n);
}

function realParams(extra = {}) {
  const hasRange = range.value?.[0] && range.value?.[1];
  return {
    brandId: auth.currentBrandId ?? 2,
    start: hasRange ? range.value[0].format('YYYY-MM-DD') : dayjs().subtract(days.value - 1, 'day').format('YYYY-MM-DD'),
    end: hasRange ? range.value[1].format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
    ...(accountType.value ? { accountType: accountType.value } : {}),
    ...(storeKeyword.value.trim() ? { keyword: storeKeyword.value.trim() } : {}),
    ...extra,
  };
}

function onFilterChange() {
  page.value = 1;
  reload();
}

function onDaysChange() {
  range.value = [];
  page.value = 1;
  reload();
}
function onRangeChange() {
  if (range.value?.[0] && range.value?.[1]) {
    page.value = 1;
    reload();
  }
}

async function reload() {
  if (mode.value !== 'real') return probeAndLoad();
  loading.value = true;
  try {
    const [sumRes, listRes] = await Promise.all([
      getSparkCampaignSummary(realParams()),
      getSparkCampaignAccounts(realParams({ metric: 'fee', page: page.value, page_size: PAGE_SIZE })),
    ]);
    applyData(sumRes, listRes);
  } finally {
    loading.value = false;
  }
  // 时间筛选变化后同步刷新当前明细页签，避免明细数据停留旧区间
  if (detailTab.value === 'note') {
    notePage.value = 1;
    loadNoteTab();
  } else if (detailTab.value === 'author') {
    loadAuthorTab();
  } else if (detailTab.value === 'region') {
    loadRegionTab();
  }
}

function applyData(sumRes, listRes) {
  summary.value = sumRes.summary ?? {};
  trend.value = sumRes.trend ?? [];
  platform.value = sumRes.platform ?? null;
  coverage.value = sumRes.coverage ?? null;
  organicSummary.value = sumRes.organic ?? null;
  overviewSummary.value = sumRes.overview ?? null;
  campNoteMetrics.value = sumRes.camp_note ?? null;
  clueSummary.value = sumRes.clue ?? null;
  accountTotal.value = listRes.total ?? 0;
  accountRows.value = listRes.list ?? [];
  nextTick(renderCharts);
}

// 留资卡三口径值（MDD）：聚光投放=广告线索，汇总=线索合计（自然流页签单独展示自然线索卡）
const leadCaliberValue = computed(() => {
  if (!isMdd.value) return summary.value.msg_leads ?? 0;
  if (caliber.value === 'juguang') return clueSummary.value?.ad ?? 0;
  return clueSummary.value?.total ?? summary.value.msg_leads ?? 0;
});

async function probeAndLoad() {
  loading.value = true;
  try {
    const probe = await getSparkCampaignSummary(realParams());
    // 横幅只看投数数据是否真的断更（聚光数据正常即视为有效，不再探测登录态）
    cookieValid.value = (probe.total ?? 0) > 0;
    if ((probe.total ?? 0) > 0) {
      mode.value = 'real';
      const listRes = await getSparkCampaignAccounts(
        realParams({ metric: 'fee', page: page.value, page_size: PAGE_SIZE }),
      );
      applyData(probe, listRes);
    } else if (isTesla.value || isVw.value) {
      // 特斯拉/大众工作区不降级为演示数据：该区间无投放就如实显示 0
      mode.value = 'real';
      applyData(probe, { total: 0, list: [] });
    } else {
      mode.value = 'demo';
    }
  } catch {
    if (isTesla.value || isVw.value) {
      mode.value = 'real';
      applyData({ summary: {}, trend: [] }, { total: 0, list: [] });
    } else {
      mode.value = 'demo';
    }
  } finally {
    loading.value = false;
    // 首次进入即加载当前明细页签（默认按笔记汇总），避免空表直到手动切换
    if (detailTab.value === 'note') {
      notePage.value = 1;
      loadNoteTab();
    } else if (detailTab.value === 'author') {
      loadAuthorTab();
    } else if (detailTab.value === 'region') {
      loadRegionTab();
    }
  }
}

function onTableChange(pag) {
  page.value = pag.current ?? 1;
  if (mode.value === 'real') {
    loading.value = true;
    getSparkCampaignAccounts(realParams({ metric: 'fee', page: page.value, page_size: PAGE_SIZE }))
      .then((listRes) => {
        accountTotal.value = listRes.total ?? 0;
        accountRows.value = listRes.list ?? [];
      })
      .finally(() => (loading.value = false));
  }
}

/* ---------- 图表 ---------- */
function areaOption(dates, values, name, yName) {
  return {
    tooltip: { trigger: 'axis' },
    grid: { left: 60, right: 24, top: 24, bottom: 30 },
    xAxis: { type: 'category', data: dates, boundaryGap: false },
    yAxis: { type: 'value', name: yName, splitLine: { lineStyle: { type: 'dashed' } } },
    series: [
      {
        name,
        type: 'line',
        smooth: true,
        data: values,
        itemStyle: { color: '#3456E6' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(52,86,230,0.25)' },
            { offset: 1, color: 'rgba(52,86,230,0.02)' },
          ]),
        },
      },
    ],
  };
}

function renderCharts() {
  const dates = trend.value.map((t) => t.date);
  if (isMdd.value && caliber.value === 'organic') {
    renderOrganicTrend();
    renderOrganicLeads();
    return;
  }
  // caliber 切换会经 v-if 销毁/重建图表容器：实例还挂在旧 div 上时必须重新 init，否则画到脱离 DOM 的节点上（图表空白）
  if (consumeEl.value) {
    if (consumeChart && consumeChart.getDom() !== consumeEl.value) {
      consumeChart.dispose();
      consumeChart = null;
    }
    if (!consumeChart) consumeChart = echarts.init(consumeEl.value);
    consumeChart.setOption(areaOption(dates, trend.value.map((t) => t.fee), '总消费', '元'), { notMerge: true });
  }
  if (leadsEl.value) {
    if (leadsChart && leadsChart.getDom() !== leadsEl.value) {
      leadsChart.dispose();
      leadsChart = null;
    }
    if (!leadsChart) leadsChart = echarts.init(leadsEl.value);
    let name = leadTab.value === 'inquiries' ? '私信进线数' : leadTab.value === 'openings' ? '私信开口数' : '私信留资数';
    let data = trend.value.map((t) => {
      const key = leadTab.value === 'inquiries' ? 'msg_inquiries' : leadTab.value === 'openings' ? 'msg_openings' : 'msg_leads';
      return t[key] ?? 0;
    });
    // Morgandada(5)：趋势三口径（2026-10-23 客户反馈）——总数=获客工具统计/线索分析逐日，
    // 聚光投放=聚光日报逐日，自然流=总数−投放；线索页签=线索分析合计（不再是笔记口径私信留资）
      if (isMdd.value) {
        const cal = caliber.value;
        const pick = (total, camp) =>
          cal === 'juguang' ? camp : cal === 'organic' ? Math.max(0, total - camp) : total;
      if (leadTab.value === 'inquiries') {
        data = trend.value.map((t) => pick(t.acq_consult ?? 0, t.camp_consult ?? 0));
      } else if (leadTab.value === 'openings') {
        data = trend.value.map((t) => pick(t.acq_open ?? 0, t.camp_open ?? 0));
      } else {
        name = '线索数';
        data = trend.value.map((t) => (cal === 'juguang' ? t.clue_ad ?? 0 : cal === 'organic' ? t.clue_nature ?? 0 : t.clue_total ?? 0));
      }
    }
    leadsChart.setOption(areaOption(dates, data, name, '条'), { notMerge: true });
  }
}

/** Morgandada 自然流趋势（按笔记发布日） */
function renderOrganicTrend() {
  if (!organicEl.value) return;
  if (organicChart && organicChart.getDom() !== organicEl.value) {
    organicChart.dispose();
    organicChart = null;
  }
  if (!organicChart) organicChart = echarts.init(organicEl.value);
  const o = organicSummary.value ?? {};
  const t = o.trend ?? [];
  const dates = t.map((x) => x.date);
  organicChart.setOption(
    {
      tooltip: { trigger: 'axis' },
      legend: { bottom: 0, data: ['自然曝光', '自然阅读', '自然互动'] },
      grid: { left: 60, right: 30, top: 24, bottom: 46 },
      xAxis: { type: 'category', data: dates, boundaryGap: false },
      yAxis: { type: 'value' },
      series: [
        { name: '自然曝光', type: 'line', smooth: true, showSymbol: false, itemStyle: { color: '#3456e6' }, data: t.map((x) => x.exposure ?? 0) },
        { name: '自然阅读', type: 'line', smooth: true, showSymbol: false, itemStyle: { color: '#10b981' }, data: t.map((x) => x.views ?? 0) },
        { name: '自然互动', type: 'line', smooth: true, showSymbol: false, itemStyle: { color: '#f59e0b' }, data: t.map((x) => x.interaction ?? 0) },
      ],
    },
    { notMerge: true },
  );
}

/** Morgandada(5) 自然流页签：日留资折线（线索分析·自然线索逐日，与顶层 trend 同源含 T+1 尾日裁剪） */
function renderOrganicLeads() {
  if (!organicLeadsEl.value) return;
  if (organicLeadsChart && organicLeadsChart.getDom() !== organicLeadsEl.value) {
    organicLeadsChart.dispose();
    organicLeadsChart = null;
  }
  if (!organicLeadsChart) organicLeadsChart = echarts.init(organicLeadsEl.value);
  const t = trend.value ?? [];
  organicLeadsChart.setOption(
    {
      tooltip: { trigger: 'axis' },
      grid: { left: 50, right: 30, top: 24, bottom: 30 },
      xAxis: { type: 'category', data: t.map((x) => x.date), boundaryGap: false },
      yAxis: { type: 'value', minInterval: 1 },
      series: [
        {
          name: '自然线索',
          type: 'line',
          smooth: true,
          showSymbol: false,
          itemStyle: { color: '#10b981' },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(16,185,129,0.18)' },
              { offset: 1, color: 'rgba(16,185,129,0.02)' },
            ]),
          },
          data: t.map((x) => x.clue_nature ?? 0),
        },
      ],
    },
    { notMerge: true },
  );
}

function onResize() {
  consumeChart?.resize();
  leadsChart?.resize();
  organicChart?.resize();
  organicLeadsChart?.resize();
}

/* ---------- Excel 导出 ---------- */
async function fetchAllNoteRows() {
  if (isTesla.value) {
    // 特斯拉：投放笔记明细（聚光笔记报表口径）全量分页
    const all = [];
    let p = 1;
    for (;;) {
      const res = await getSparkCampaignNotes(noteParams({ page: p, page_size: 200 }));
      all.push(...(res.list ?? []));
      if (!res.list?.length || all.length >= (res.total ?? 0)) break;
      p += 1;
    }
    return all.map((n) => ({
      _tesla: true,
      title: n.title,
      author_name: n.author_name,
      publish_time: n.publish_time,
      note_url: n.note_url,
      exposure: n.exposure,
      views: n.views,
      likes: n.likes,
      comments: n.comments,
      collects: n.collects,
      shares: n.shares,
      follow: n.follow,
      fee: n.fee,
      click: n.click,
      ctr: n.ctr,
      interaction: n.interaction,
      msg_inquiries: n.msg_inquiries,
      msg_openings: n.msg_openings,
      msg_leads: n.msg_leads,
      msg_lead_cost: n.msg_lead_cost,
    }));
  }
  const all = [];
  let p = 1;
  for (;;) {
    const res = await getKoxNotes(noteParams({ page: p, page_size: 500 }));
    all.push(...(res.list ?? []));
    if (!res.list?.length || all.length >= (res.total ?? 0)) break;
    p += 1;
  }
  return all;
}

async function exportAll() {
  exporting.value = true;
  try {
    let sumData = { summary: summary.value, trend: trend.value };
    let rows = accountRows.value;
    if (mode.value === 'real') {
      const [sumRes, listRes] = await Promise.all([
        getSparkCampaignSummary(realParams()),
        getSparkCampaignAccounts(realParams({ metric: 'fee', page: 1, page_size: 500 })),
      ]);
      sumData = sumRes;
      rows = listRes.list ?? [];
    } else {
      message.warning('当前为演示数据，导出内容为示意数据');
    }
    const s = sumData.summary ?? {};
    const sheets = [
      {
        name: '投流情况总览',
        rows: [
          { 指标: '总消耗（元）', 数值: s.fee ?? 0 },
          { 指标: '投流内容数（已推广笔记）', 数值: s.promo_note_cnt ?? 0 },
          { 指标: '投流账号数', 数值: s.account_num ?? 0 },
          { 指标: '总曝光', 数值: s.impression ?? 0 },
          { 指标: '总点击', 数值: s.click ?? 0 },
          { 指标: '总点击率(%)', 数值: s.ctr ?? 0 },
          { 指标: '点击成本(元)', 数值: s.cpc ?? 0 },
          { 指标: '千次展示成本(元)', 数值: s.cpm ?? 0 },
          { 指标: '互动量', 数值: s.interaction ?? 0 },
          { 指标: '私信进线数', 数值: s.msg_inquiries ?? 0 },
          { 指标: '私信开口数', 数值: s.msg_openings ?? 0 },
          { 指标: isMdd.value ? '线索数' : '私信留资数', 数值: s.msg_leads ?? 0 },
          { 指标: '私信进线成本(元)', 数值: s.msg_inquiry_cost ?? 0 },
          { 指标: '私信开口成本(元)', 数值: s.msg_open_cost ?? 0 },
          { 指标: isMdd.value ? '私信线索成本(元)' : '私信留资成本(元)', 数值: s.msg_lead_cost ?? 0 },
        ],
      },
      // Morgandada(5)：账号明细行=主账号 MorganDaDa，客户要求不在投放页/导出中显示
      ...(isMdd.value
        ? []
        : [
            {
              name: '账号投放明细',
              rows: rows.map((a) => ({
                账户名称: a.name,
                账户类型: a.account_kind === 'agent_sub' ? '代理商子账户' : '品牌主账户',
                代理商: a.agent_name ?? '',
                投放ID: a.advertiser_id ?? '',
                消耗天数: a.consume_days,
                消耗: a.fee,
                曝光量: a.impression,
                点击量: a.click,
                点击率: `${a.ctr}%`,
                互动量: a.interaction,
                私信进线数: a.msg_inquiries ?? 0,
                私信开口数: a.msg_openings ?? 0,
                私信留资数: a.msg_leads,
                留资成本: a.msg_leads ? a.msg_lead_cost : '-',
              })),
            },
          ]),
    ];

    if (mode.value === 'real' && detailTab.value === 'note') {
      const noteRowsRaw = await fetchAllNoteRows();
      if (noteRowsRaw[0]?._tesla) {
        sheets.push({
          name: '投放笔记明细',
          rows: noteRowsRaw.map((n) => ({
            笔记标题: n.title,
            作者: n.author_name ?? '',
            发布时间: n.publish_time ? dayjs(n.publish_time).format('YYYY-MM-DD HH:mm') : '',
            消耗: n.fee,
            曝光: n.exposure,
            点击: n.click,
            点击率: `${n.ctr ?? 0}%`,
            互动: n.interaction,
            私信进线: n.msg_inquiries,
            私信开口: n.msg_openings,
            私信留资: n.msg_leads,
            留资成本CPL: n.msg_leads ? n.msg_lead_cost : '-',
            阅读: n.views,
            点赞: n.likes,
            评论: n.comments,
            收藏: n.collects,
            分享: n.shares,
            涨粉: n.follow,
            链接: n.note_url ?? '',
          })),
        });
      } else {
        sheets.push({
          name: '笔记明细',
          rows: noteRowsRaw.map((n) => ({
            笔记标题: n.title,
            作者: n.author_name ?? '',
            专业号主体: n.brand_user_name ?? '',
            发布时间: n.publish_time ?? '',
            推广状态: n.is_rtb_adver === true ? '已推广' : n.is_rtb_adver === false ? '未推广' : '',
            曝光: n.exposure,
            阅读: n.views,
            点赞: n.likes,
            评论: n.comments,
            收藏: n.collects,
            分享: n.shares,
            涨粉: n.follow_count,
            链接: n.note_url ?? '',
          })),
        });
      }
    }

    if (mode.value === 'real' && detailTab.value === 'author') {
      const res = await getSparkCampaignNotes(authorParams());
      sheets.push({
        name: '按作者汇总',
        rows: (res.list ?? []).map((a) => ({
          作者: a.author,
          笔记数: a.note_count,
          消耗: a.fee,
          曝光: a.impression,
          点击: a.click,
          点击率: `${a.ctr ?? 0}%`,
          互动: a.interaction,
          私信进线: a.msg_inquiries,
          私信开口: a.msg_openings,
          私信留资: a.msg_leads,
          留资成本CPL: a.msg_leads ? a.msg_lead_cost : '-',
        })),
      });
    }

    if (mode.value === 'real' && detailTab.value === 'region') {
      await loadRegionTab();
      sheets.push({
        name: regionGroupby.value === 'store' ? '区域汇总-按门店' : '区域汇总-按大区',
        rows: regionRows.value.map((r) => ({
          区域: r.name,
          所属大区: r.region ?? '',
          账户数: r.account_num,
          消耗: r.fee,
          曝光量: r.impression,
          点击量: r.click,
          点击率: `${r.ctr}%`,
          互动量: r.interaction,
          私信进线数: r.msg_inquiries,
          私信开口数: r.msg_openings,
          私信留资数: r.msg_leads,
          留资成本: r.msg_leads ? r.msg_lead_cost : '-',
        })),
      });
    }

    exportExcel(sheets, '投放计划数据');
    message.success('Excel 导出成功');
  } catch {
    message.error('导出失败，请稍后重试');
  } finally {
    exporting.value = false;
  }
}

const maxFee = computed(() =>
  accountRows.value.reduce((mx, r) => Math.max(mx, Number(r.fee ?? 0)), 1),
);

/* ---------- 按笔记汇总 ---------- */
const noteRows = ref([]);
const noteTotal = ref(0);
const notePage = ref(1);
const noteLoading = ref(false);
const noteRtbFilter = ref('all');
const noteKeyword = ref('');
const noteRegionFilter = ref('全部大区');
const noteRegionFacets = ref([]);
const noteRegionOptions = computed(() => [
  { value: '全部大区', label: '全部大区' },
  ...noteRegionFacets.value.map((r) => ({ value: r, label: r })),
]);

async function loadNoteRegionFacets() {
  try {
    const res = await getKoxAccounts({
      brandId: auth.currentBrandId ?? undefined,
      page_size: 1,
    });
    noteRegionFacets.value = res.region_facets ?? [];
  } catch {
    noteRegionFacets.value = [];
  }
}

const maxRegionFee = computed(() =>
  regionRows.value.reduce((mx, r) => Math.max(mx, Number(r.fee ?? 0)), 1),
);

const noteColumns = computed(() => {
  if (isTesla.value) {
    // 特斯拉：仅投放笔记 + 聚光笔记报表投放数据（消耗/点击/进线/开口/留资/CPL）
    return [
      { key: 'title', title: '笔记 / 作者', width: 300 },
      { title: '发布时间', dataIndex: 'publish_time', width: 150 },
      { key: 'fee', title: '消耗', dataIndex: 'fee', width: 110, sorter: (a, b) => a.fee - b.fee },
      { title: '曝光', dataIndex: 'exposure', width: 100, sorter: (a, b) => a.exposure - b.exposure },
      { title: '点击', dataIndex: 'click', width: 90, sorter: (a, b) => a.click - b.click },
      { key: 'ctr', title: '点击率', dataIndex: 'ctr', width: 90, sorter: (a, b) => a.ctr - b.ctr },
      { title: '互动', dataIndex: 'interaction', width: 80, sorter: (a, b) => a.interaction - b.interaction },
      { title: '私信进线', dataIndex: 'msg_inquiries', width: 95, sorter: (a, b) => a.msg_inquiries - b.msg_inquiries },
      { title: '私信开口', dataIndex: 'msg_openings', width: 95, sorter: (a, b) => a.msg_openings - b.msg_openings },
      { title: '私信留资', dataIndex: 'msg_leads', width: 95, sorter: (a, b) => a.msg_leads - b.msg_leads },
      { key: 'msg_lead_cost', title: '留资成本', dataIndex: 'msg_lead_cost', width: 95, sorter: (a, b) => a.msg_lead_cost - b.msg_lead_cost },
    ];
  }
  return [
    { key: 'title', title: '笔记 / 作者', width: 300 },
    { key: 'rtb', title: '推广状态', width: 90 },
    { title: '曝光', dataIndex: 'exposure', width: 100, sorter: (a, b) => a.exposure - b.exposure },
    { title: '阅读', dataIndex: 'views', width: 100, sorter: (a, b) => a.views - b.views },
    { title: '点赞', dataIndex: 'likes', width: 80, sorter: (a, b) => a.likes - b.likes },
    { title: '评论', dataIndex: 'comments', width: 80, sorter: (a, b) => a.comments - b.comments },
    { title: '收藏', dataIndex: 'collects', width: 80, sorter: (a, b) => a.collects - b.collects },
    { title: '分享', dataIndex: 'shares', width: 80, sorter: (a, b) => a.shares - b.shares },
    { title: '涨粉', dataIndex: 'follow', width: 80, sorter: (a, b) => a.follow - b.follow },
    { title: '发布时间', dataIndex: 'publish_time', width: 150 },
  ];
});

function noteParams(extra = {}) {
  const hasRange = range.value?.[0] && range.value?.[1];
  return {
    brandId: auth.currentBrandId ?? 2,
    start: hasRange ? range.value[0].format('YYYY-MM-DD') : dayjs().subtract(days.value - 1, 'day').format('YYYY-MM-DD'),
    end: hasRange ? range.value[1].format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
    ...(noteRtbFilter.value !== 'all' ? { isRtbAdver: noteRtbFilter.value } : {}),
    ...(noteKeyword.value ? { keyword: noteKeyword.value.trim() } : {}),
    ...(isTesla.value && noteRegionFilter.value !== '全部大区' ? { regionName: noteRegionFilter.value } : {}),
    metric: 'views',
    page: notePage.value,
    page_size: PAGE_SIZE,
    ...extra,
  };
}

async function loadNoteTab() {
  noteLoading.value = true;
  try {
    if (isTesla.value) {
      // 特斯拉：聚光笔记报表按笔记ID去重求和（仅投放笔记），服务端分页
      const res = await getSparkCampaignNotes(noteParams());
      noteTotal.value = res.total ?? 0;
      noteRows.value = (res.list ?? []).map((n) => ({
        id: n.note_id,
        title: n.title,
        cover: n.cover || `/images/kox-notes/note${(n.note_id?.length % 5) + 1}.webp`,
        note_url: n.note_url,
        author_name: n.author_name,
        publish_time: n.publish_time ? dayjs(n.publish_time).format('YYYY-MM-DD HH:mm') : '',
        fee: n.fee ?? 0,
        exposure: n.exposure ?? 0,
        click: n.click ?? 0,
        ctr: n.ctr ?? 0,
        interaction: n.interaction ?? 0,
        msg_inquiries: n.msg_inquiries ?? 0,
        msg_openings: n.msg_openings ?? 0,
        msg_leads: n.msg_leads ?? 0,
        msg_lead_cost: n.msg_lead_cost ?? 0,
      }));
      return;
    }
    const res = await getKoxNotes(noteParams());
    noteTotal.value = res.total ?? 0;
    noteRows.value = (res.list ?? []).map((n) => ({
      id: n.id,
      title: n.title,
      cover: n.cover_url || `/images/kox-notes/note${(n.id % 5) + 1}.webp`,
      note_url: n.note_url,
      author_name: n.author_name,
      publish_time: n.publish_time ? dayjs(n.publish_time).format('YYYY-MM-DD HH:mm') : '',
      is_rtb: n.is_rtb_adver === true,
      exposure: n.exposure,
      views: n.views,
      likes: n.likes,
      comments: n.comments,
      collects: n.collects,
      shares: n.shares,
      follow: n.follow_count,
    }));
  } catch {
    noteRows.value = [];
  } finally {
    noteLoading.value = false;
  }
}

function onNoteTableChange(pag) {
  notePage.value = pag.current ?? 1;
  loadNoteTab();
}

function onNoteCoverErr(record) {
  record.cover = `/images/kox-notes/note${((record.id?.length ?? 0) % 5) + 1}.webp`;
}

/* ---------- 按作者汇总 ---------- */
const authorRows = ref([]);
const authorLoading = ref(false);

const authorColumns = [
  { key: 'author', title: '作者（KOS 账号）', width: 240 },
  { title: '笔记数', dataIndex: 'note_count', width: 90, sorter: (a, b) => a.note_count - b.note_count },
  { key: 'fee', title: '消耗', dataIndex: 'fee', width: 110, sorter: (a, b) => a.fee - b.fee },
  { title: '曝光', dataIndex: 'impression', width: 100, sorter: (a, b) => a.impression - b.impression },
  { title: '点击', dataIndex: 'click', width: 90, sorter: (a, b) => a.click - b.click },
  { key: 'ctr', title: '点击率', dataIndex: 'ctr', width: 90, sorter: (a, b) => a.ctr - b.ctr },
  { title: '互动', dataIndex: 'interaction', width: 80, sorter: (a, b) => a.interaction - b.interaction },
  { title: '私信进线', dataIndex: 'msg_inquiries', width: 95, sorter: (a, b) => a.msg_inquiries - b.msg_inquiries },
  { title: '私信开口', dataIndex: 'msg_openings', width: 95, sorter: (a, b) => a.msg_openings - b.msg_openings },
  { title: '私信留资', dataIndex: 'msg_leads', width: 95, sorter: (a, b) => a.msg_leads - b.msg_leads },
  { key: 'msg_lead_cost', title: '留资成本', dataIndex: 'msg_lead_cost', width: 95, sorter: (a, b) => a.msg_lead_cost - b.msg_lead_cost },
];

function authorParams() {
  const hasRange = range.value?.[0] && range.value?.[1];
  return {
    brandId: auth.currentBrandId ?? 2,
    start: hasRange ? range.value[0].format('YYYY-MM-DD') : dayjs().subtract(days.value - 1, 'day').format('YYYY-MM-DD'),
    end: hasRange ? range.value[1].format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
    ...(noteKeyword.value ? { keyword: noteKeyword.value.trim() } : {}),
    group: 'author',
    page: 1,
    page_size: 200,
  };
}

async function loadAuthorTab() {
  authorLoading.value = true;
  try {
    const res = await getSparkCampaignNotes(authorParams());
    authorRows.value = (res.list ?? []).map((a) => ({ ...a }));
  } catch {
    authorRows.value = [];
  } finally {
    authorLoading.value = false;
  }
}

/* ---------- 区域汇总 ---------- */
const regionRows = ref([]);
const regionLoading = ref(false);
// MDD：单一投放账户无大区映射，去掉「按大区」只留按门店
const regionGroupby = ref(isMdd.value ? 'store' : 'region');

const regionColumns = computed(() => {
  const cols = [];
  if (regionGroupby.value === 'store') {
    cols.push({ title: '门店', dataIndex: 'name', width: 200, ellipsis: true });
    cols.push({ title: '所属大区', dataIndex: 'region', width: 100 });
  } else {
    cols.push({ title: '大区', dataIndex: 'name', width: 160 });
  }
  cols.push(
    { title: '账户数', dataIndex: 'account_num', width: 80, sorter: (a, b) => a.account_num - b.account_num },
    { key: 'fee', title: '消耗', width: 160, sorter: (a, b) => a.fee - b.fee },
    { title: '曝光量', dataIndex: 'impression', width: 100, sorter: (a, b) => a.impression - b.impression },
    { title: '点击量', dataIndex: 'click', width: 90, sorter: (a, b) => a.click - b.click },
    { title: '点击率', dataIndex: 'ctr', width: 90, sorter: (a, b) => a.ctr - b.ctr },
    { title: '互动量', dataIndex: 'interaction', width: 90, sorter: (a, b) => a.interaction - b.interaction },
    { title: '私信进线', dataIndex: 'msg_inquiries', width: 95, sorter: (a, b) => a.msg_inquiries - b.msg_inquiries },
    { title: '私信开口', dataIndex: 'msg_openings', width: 95, sorter: (a, b) => a.msg_openings - b.msg_openings },
    { title: '私信留资', dataIndex: 'msg_leads', width: 95, sorter: (a, b) => a.msg_leads - b.msg_leads },
    { title: '留资成本', dataIndex: 'msg_lead_cost', width: 95, sorter: (a, b) => a.msg_lead_cost - b.msg_lead_cost },
  );
  return cols;
});

async function loadRegionTab() {
  regionLoading.value = true;
  try {
    const res = await getSparkCampaignRegion(realParams({ groupby: regionGroupby.value }));
    regionRows.value = res.list ?? [];
  } catch {
    regionRows.value = [];
  } finally {
    regionLoading.value = false;
  }
}

function onDetailTabChange() {
  if (detailTab.value === 'note') {
    notePage.value = 1;
    loadNoteTab();
  } else if (detailTab.value === 'author') {
    loadAuthorTab();
  } else if (detailTab.value === 'region') {
    loadRegionTab();
  }
}

const accountColumns = [
  { key: 'name', title: '账户名称 / 类型' },
  { title: '消耗天数', dataIndex: 'consume_days', width: 90, sorter: (a, b) => a.consume_days - b.consume_days },
  { key: 'fee', title: '消耗', width: 170, sorter: (a, b) => a.fee - b.fee },
  { title: '曝光量', dataIndex: 'impression', width: 100, sorter: (a, b) => a.impression - b.impression },
  { title: '点击量', dataIndex: 'click', width: 90, sorter: (a, b) => a.click - b.click },
  { title: '点击率', dataIndex: 'ctr', width: 90, sorter: (a, b) => a.ctr - b.ctr },
  { title: '互动量', dataIndex: 'interaction', width: 95, sorter: (a, b) => a.interaction - b.interaction },
  { title: '私信进线', dataIndex: 'msg_inquiries', width: 95, sorter: (a, b) => a.msg_inquiries - b.msg_inquiries },
  { title: '私信开口', dataIndex: 'msg_openings', width: 95, sorter: (a, b) => a.msg_openings - b.msg_openings },
  { title: '私信留资', dataIndex: 'msg_leads', width: 95, sorter: (a, b) => a.msg_leads - b.msg_leads },
  { title: '留资成本', dataIndex: 'msg_lead_cost', width: 95, sorter: (a, b) => a.msg_lead_cost - b.msg_lead_cost },
];

onMounted(() => {
  loadNoteRegionFacets();
  probeAndLoad();
  window.addEventListener('resize', onResize);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
  consumeChart?.dispose();
  leadsChart?.dispose();
});
</script>

<style scoped>
.overview-card,
.detail-card { margin-bottom: 12px; }

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 14px;
}

.bar {
  width: 4px;
  height: 14px;
  background: #2563eb;
  border-radius: 2px;
}

.hero-row {
  display: flex;
  align-items: center;
  gap: 32px;
  padding: 14px 20px;
  background: linear-gradient(135deg, #f5f8ff, #fdfdff);
  border-radius: 12px;
  margin-bottom: 14px;
}

.hero-item { min-width: 160px; }

.hero-label {
  font-size: 13px;
  color: #64748b;
}

.hero-value {
  margin-top: 4px;
  font-size: 30px;
  font-weight: 800;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}

.hero-divider {
  width: 1px;
  height: 44px;
  background: #e2e8f0;
}

.hl-blue { color: #3456e6; }
.hl-green { color: #16a34a; }
.hl-violet { color: #7c3aed; }

.metric-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 10px;
  margin-bottom: 10px;
}

.metric-grid-5 {
  grid-template-columns: repeat(5, 1fr);
}

.metric-card {
  background: #f8fafc;
  border-radius: 8px;
  padding: 12px 14px;
}

.metric-label {
  font-size: 12px;
  color: #64748b;
  display: flex;
  align-items: center;
  gap: 4px;
}

.metric-tip { color: #cbd5e1; cursor: help; }

.metric-value {
  margin-top: 6px;
  font-size: 20px;
  font-weight: 700;
  color: #1e293b;
  font-variant-numeric: tabular-nums;
}

.charts-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 6px;
}

.chart-card {
  border: 1px solid #eef2f7;
  border-radius: 10px;
}

.chart-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
}

.chart-title-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.chart-area { height: 260px; }

.detail-tabs { margin-left: 8px; }

.note-filter-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.fee-num {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.note-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.note-thumb {
  width: 40px;
  height: 54px;
  object-fit: cover;
  border-radius: 4px;
  background: #f1f5f9;
  flex-shrink: 0;
}

.note-meta { min-width: 0; }

.c-name { font-weight: 500; }
.muted { color: var(--color-text-secondary, #64748b); }
.small { font-size: 12px; }

.bar-cell { display: flex; flex-direction: column; gap: 3px; }
.bar-num { font-variant-numeric: tabular-nums; font-size: 13px; }
.bar-track { height: 5px; border-radius: 3px; background: #eef2f7; overflow: hidden; }
.bar-fill { height: 100%; border-radius: 3px; background: linear-gradient(90deg, #3456e6, #7c3aed); }

@media (max-width: 1200px) {
  .metric-grid { grid-template-columns: repeat(4, 1fr); }
  .charts-row { grid-template-columns: 1fr; }
}
</style>
