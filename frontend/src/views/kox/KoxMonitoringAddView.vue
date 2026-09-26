<template>
  <PageWrapper title="新增监测账号">
    <a-alert
      type="info"
      show-icon
      message="上传需要监测的创作者链接或账号清单，系统解析后批量加入监测列表"
      style="margin-bottom: 12px"
    />
    <a-spin :spinning="importing">
      <div class="add-card">
        <div class="step-row">
          <span class="step-badge">1</span>
          <span>上传账号清单 Excel</span>
          <a class="tpl-link" @click="downloadTemplate">下载导入模板</a>
        </div>
        <a-upload-dragger
          :file-list="fileList"
          :before-upload="onFile"
          accept=".xlsx,.xls"
          :max-count="1"
          class="uploader"
        >
          <p class="uploader-icon"><FolderOpenOutlined /></p>
          <p class="uploader-text">点击或将文件拖拽到这里上传</p>
          <p class="uploader-hint">支持 UID / 昵称 / 大区 / 销售区域 / 门店 等表头自动识别</p>
        </a-upload-dragger>

        <template v-if="rows.length">
          <div class="preview-head">
            <span>解析结果：共 <b>{{ rows.length }}</b> 条账号<template v-if="errors.length">，{{ errors.length }} 行有问题</template></span>
            <a-space>
              <a-button @click="reset">重新选择</a-button>
              <a-button type="primary" :loading="importing" @click="submit">提交</a-button>
            </a-space>
          </div>
          <a-alert v-if="errors.length" type="warning" show-icon :message="errors.join('；')" style="margin-bottom: 10px" />
          <a-table
            :columns="previewColumns"
            :data-source="rows.slice(0, 50)"
            :pagination="false"
            row-key="authorId"
            size="small"
            :scroll="{ y: 360 }"
          />
          <div v-if="rows.length > 50" class="more-hint">仅预览前 50 条，提交时导入全部 {{ rows.length }} 条</div>
        </template>

        <div v-if="result" class="result-row">
          <a-alert
            type="success"
            show-icon
            :message="`导入完成：新增 ${result.added}，更新 ${result.updated}`"
          />
          <router-link to="/kox_df/monitoring/list">前往监测列表查看 →</router-link>
        </div>
      </div>
    </a-spin>
  </PageWrapper>
</template>

<script setup>
import { ref } from 'vue';
import { message } from 'ant-design-vue';
import { FolderOpenOutlined } from '@ant-design/icons-vue';
import PageWrapper from '../../components/PageWrapper.vue';
import { importKoxAccounts } from '../../api/kox';
import { parseAccountWorkbook } from '../../utils/xlsx-import';
import { useAuthStore } from '../../stores/auth';

const auth = useAuthStore();
const fileList = ref([]);
const rows = ref([]);
const errors = ref([]);
const importing = ref(false);
const result = ref(null);

const previewColumns = [
  { title: 'UID', dataIndex: 'authorId', width: 220, ellipsis: true },
  { title: '昵称', dataIndex: 'nickname', ellipsis: true },
  { title: '类型', dataIndex: 'accountType', width: 80 },
  { title: '大区', dataIndex: 'regionName', width: 110, ellipsis: true },
  { title: '门店', dataIndex: 'storeName', ellipsis: true },
];

async function onFile(file) {
  result.value = null;
  try {
    const parsed = await parseAccountWorkbook(file);
    rows.value = parsed.accounts;
    errors.value = parsed.errors;
    fileList.value = [{ uid: '-1', name: file.name, status: 'done' }];
    if (!parsed.accounts.length) message.warning('未解析到有效账号行');
  } catch (e) {
    message.error(e.message || '文件解析失败');
    fileList.value = [];
  }
  return false;
}

function reset() {
  fileList.value = [];
  rows.value = [];
  errors.value = [];
  result.value = null;
}

async function submit() {
  if (!rows.value.length) {
    message.warning('请先选择文件');
    return;
  }
  importing.value = true;
  try {
    const res = await importKoxAccounts(
      rows.value.map((r) => ({ ...r, brandId: auth.currentBrandId ?? r.brandId })),
    );
    result.value = res;
    rows.value = [];
    fileList.value = [];
    message.success('导入完成');
  } catch (e) {
    message.error(e.message || '导入失败');
  } finally {
    importing.value = false;
  }
}

function downloadTemplate() {
  import('../../utils/excel').then(({ exportExcel }) => {
    exportExcel(
      [
        {
          name: '账号导入模板',
          rows: [
            {
              账号UID: '',
              账号昵称: '',
              账号类型: 'KOS',
              区域: '',
              销售区域: '',
              省: '',
              市: '',
              店名: '',
              运营人: '',
              手机号: '',
              主页链接: '',
            },
          ],
        },
      ],
      '监测账号导入模板.xlsx',
    );
  });
}
</script>

<style scoped>
.add-card {
  background: #fff;
  border-radius: 16px;
  padding: 22px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}
.step-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 14px;
}
.step-badge {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #3456e6;
  color: #fff;
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.tpl-link {
  font-weight: 400;
  font-size: 13px;
}
.uploader {
  margin-bottom: 16px;
}
.uploader-icon {
  font-size: 34px;
  color: #3456e6;
  margin-bottom: 4px;
}
.uploader-text {
  font-size: 15px;
  color: #1e293b;
}
.uploader-hint {
  font-size: 12px;
  color: #94a3b8;
}
.preview-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  font-size: 14px;
  color: #334155;
}
.more-hint {
  margin-top: 8px;
  font-size: 12px;
  color: #94a3b8;
  text-align: right;
}
.result-row {
  margin-top: 16px;
  display: flex;
  align-items: center;
  gap: 16px;
}
</style>
