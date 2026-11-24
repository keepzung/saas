import request from './request';

// ─── 素材库 ─────────────────────────────────────────────────────────
export const getMaterialTags = (params) =>
  request.get('/content-pro/material-tags', { params });

export const createMaterialTag = (data, params) =>
  request.post('/content-pro/material-tags', data, { params });

export const updateMaterialTag = (id, data) =>
  request.put(`/content-pro/material-tags/${id}`, data);

export const deleteMaterialTags = (ids) =>
  request.post('/content-pro/material-tags/batch-delete', { ids });

export const getMaterialSets = (params) =>
  request.get('/content-pro/material-sets', { params });

export const createMaterialSet = (data, params) =>
  request.post('/content-pro/material-sets', data, { params });

export const updateMaterialSet = (id, data) =>
  request.put(`/content-pro/material-sets/${id}`, data);

export const deleteMaterialSets = (ids) =>
  request.post('/content-pro/material-sets/batch-delete', { ids });

export const getMaterialImages = (params) =>
  request.get('/content-pro/material-images', { params });

export const importMaterialImages = (data, params) =>
  request.post('/content-pro/material-images/import', data, { params });

export const updateMaterialImage = (id, data) =>
  request.put(`/content-pro/material-images/${id}`, data);

export const assignMaterialImages = (data) =>
  request.post('/content-pro/material-images/batch-assign', data);

export const deleteMaterialImages = (ids) =>
  request.post('/content-pro/material-images/batch-delete', { ids });

export const uploadMaterialImage = (file, brandId) => {
  const fd = new FormData();
  fd.append('file', file);
  return request.post('/content-pro/upload', fd, {
    params: { brandId },
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000,
  });
};

// ─── 创作策略 ───────────────────────────────────────────────────────
export const getStrategies = (params) =>
  request.get('/content-pro/strategies', { params });

export const createStrategy = (data, params) =>
  request.post('/content-pro/strategies', data, { params });

export const updateStrategy = (id, data) =>
  request.put(`/content-pro/strategies/${id}`, data);

export const toggleStrategy = (id, enabled) =>
  request.patch(`/content-pro/strategies/${id}/toggle`, { enabled });

export const deleteStrategy = (id) =>
  request.delete(`/content-pro/strategies/${id}`);

// ─── AI / 历史 / 批量 ───────────────────────────────────────────────
export const aiHealth = () => request.get('/content-pro/ai/health');

export const generateStrategy = (data, params) =>
  request.post('/content-pro/ai/generate-strategy', data, { params, timeout: 120000 });

export const generateArticle = (data, params) =>
  request.post('/content-pro/ai/generate-article', data, { params, timeout: 180000 });

export const getRandomImages = (params) =>
  request.get('/content-pro/ai/random-images', { params });

export const getXhsHistory = (params) =>
  request.get('/content-pro/history/xhs', { params });

export const getXhsHistoryDetail = (id, params) =>
  request.get(`/content-pro/history/xhs/${id}`, { params });

export const saveXhsHistory = (data, params) =>
  request.post('/content-pro/history/xhs', data, { params });

export const deleteXhsHistory = (id) =>
  request.delete(`/content-pro/history/xhs/${id}`);

export const batchGenerate = (data, params) =>
  request.post('/content-pro/batch-generate', data, { params });

export const getBatchTasks = (params) =>
  request.get('/content-pro/batch-tasks', { params });

export const updateHistoryContent = (id, data, params) =>
  request.put(`/content-pro/history/xhs/${id}/content`, data, { params });

export const discardHistories = (ids, params) =>
  request.post('/content-pro/history/discard', { ids }, { params });

// ─── 算力配额 / 智能编辑 / 创客贴 ────────────────────────────────────
export const getQuota = (params) => request.get('/content-pro/quota', { params });

export const grantQuota = (data, params) =>
  request.post('/content-pro/quota/grant', data, { params });

export const getCoverEditStatus = (params) =>
  request.get('/content-pro/cover-edit/status', { params });

export const useCoverEdit = (params) =>
  request.post('/content-pro/cover-edit/use', {}, { params });

export const getChuangkitConfig = () =>
  request.get('/content-pro/chuangkit/config');

export const importChuangkitImage = (data, params) =>
  request.post('/content-pro/chuangkit/import', data, { params });

// ─── 内容包 Pro ─────────────────────────────────────────────────────
export const getPackagesPro = (params) =>
  request.get('/content-pro/packages', { params });

export const createPackagePro = (data, params) =>
  request.post('/content-pro/packages', data, { params });

export const updatePackagePro = (id, data, params) =>
  request.put(`/content-pro/packages/${id}`, data, { params });

export const deletePackagePro = (id, params) =>
  request.delete(`/content-pro/packages/${id}`, { params });

export const getPackageDetail = (id, params) =>
  request.get(`/content-pro/packages/${id}`, { params });

export const moveToPackage = (id, historyIds, params) =>
  request.post(`/content-pro/packages/${id}/move`, { historyIds }, { params });

export const moveOutOfPackage = (historyIds, params) =>
  request.post('/content-pro/packages/move-out', { historyIds }, { params });

export const submitAudit = (historyIds, params) =>
  request.post('/content-pro/history/submit-audit', { historyIds }, { params });

export const approveHistory = (historyIds, params) =>
  request.post('/content-pro/history/approve', { historyIds }, { params });

export const rejectHistory = (historyIds, reason, params) =>
  request.post('/content-pro/history/reject', { historyIds, reason }, { params });

export const getAuditList = (params) =>
  request.get('/content-pro/audit/list', { params });

export const dispatchHistory = (historyIds, userId, params) =>
  request.post('/content-pro/history/dispatch', { historyIds, userId }, { params });

export const getClaimLog = (params) =>
  request.get('/content-pro/claim-log', { params });

// ─── H5 领用 ────────────────────────────────────────────────────────
export const getMobilePackages = (params) =>
  request.get('/content-pro/mobile/packages', { params });

export const claimMobilePackage = (data, params) =>
  request.post('/content-pro/mobile/claim', data, { params });

export const getMobileClaims = (params) =>
  request.get('/content-pro/mobile/claims', { params });

// ─── 内容创作任务（任务分发）────────────────────────────────────────
export const getContentTasks = (params) =>
  request.get('/content-tasks', { params });

export const createContentTask = (data, params) =>
  request.post('/content-tasks', data, { params });

export const getContentTaskDetail = (id, params) =>
  request.get(`/content-tasks/${id}`, { params });

export const voidContentTask = (id, params) =>
  request.post(`/content-tasks/${id}/void`, {}, { params });

// 修改任务（仅任务信息，派发对象不可改）
export const updateContentTask = (id, data, params) =>
  request.put(`/content-tasks/${id}`, data, { params });

// 任务候选人：工作区内成员（发任务"指定员工"用）
export const getTaskCandidates = (params) =>
  request.get('/content-pro/task-candidates', { params });

export const getMyMobileTasks = (params) =>
  request.get('/content-pro/mobile/my-tasks', { params });

// 配图打包下载：服务端抓图打 zip，绕开浏览器跨域/多文件下载限制
export const downloadImagesZip = (data) =>
  request.post('/content-pro/images/download-zip', data, {
    responseType: 'blob',
    timeout: 120000,
  });

// 任务示例文档上传（仅 PDF，≤20MB）
export const uploadTaskDoc = (file, brandId) => {
  const fd = new FormData();
  fd.append('file', file);
  return request.post('/content-pro/upload-doc', fd, {
    params: { brandId },
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  });
};

// ─── 品牌模板库（话术规范/车型内容模板/合规模板/门店人设）────────────
export const getTemplates = (params) =>
  request.get('/content-pro/templates', { params });

export const createTemplate = (data, params) =>
  request.post('/content-pro/templates', data, { params });

export const updateTemplate = (id, data) =>
  request.put(`/content-pro/templates/${id}`, data);

export const deleteTemplates = (ids) =>
  request.post('/content-pro/templates/batch-delete', { ids });

// ─── 知识库规则（评论/私信/分流/合规红线）───────────────────────────
export const getKnowledgeRules = (params) =>
  request.get('/content-pro/knowledge-rules', { params });

export const createKnowledgeRule = (data, params) =>
  request.post('/content-pro/knowledge-rules', data, { params });

export const updateKnowledgeRule = (id, data) =>
  request.put(`/content-pro/knowledge-rules/${id}`, data);

export const deleteKnowledgeRules = (ids) =>
  request.post('/content-pro/knowledge-rules/batch-delete', { ids });

// ─── 案例库（爆款/拆解/竞品）────────────────────────────────────────
export const getKnowledgeCases = (params) =>
  request.get('/content-pro/knowledge-cases', { params });

export const createKnowledgeCase = (data, params) =>
  request.post('/content-pro/knowledge-cases', data, { params });

export const favoriteKnowledgeCase = (hotContentId, params) =>
  request.post('/content-pro/knowledge-cases/favorite', { hotContentId }, { params });

export const updateKnowledgeCase = (id, data) =>
  request.put(`/content-pro/knowledge-cases/${id}`, data);

export const deleteKnowledgeCases = (ids) =>
  request.post('/content-pro/knowledge-cases/batch-delete', { ids });

// ─── AI 预审 / 运营报表 ─────────────────────────────────────────────
export const preReviewHistory = (historyId, params) =>
  request.post(`/content-pro/ai/pre-review/${historyId}`, {}, { params });

export const getReports = (params) => request.get('/report/list', { params });

export const getReportDetail = (id, params) =>
  request.get(`/report/${id}`, { params });
