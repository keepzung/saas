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

export const generateArticle = (data, params) =>
  request.post('/content-pro/ai/generate-article', data, { params, timeout: 180000 });

export const getRandomImages = (params) =>
  request.get('/content-pro/ai/random-images', { params });

export const getXhsHistory = (params) =>
  request.get('/content-pro/history/xhs', { params });

export const saveXhsHistory = (data, params) =>
  request.post('/content-pro/history/xhs', data, { params });

export const deleteXhsHistory = (id) =>
  request.delete(`/content-pro/history/xhs/${id}`);

export const batchGenerate = (data, params) =>
  request.post('/content-pro/batch-generate', data, { params });

export const getBatchTasks = (params) =>
  request.get('/content-pro/batch-tasks', { params });

// ─── 内容创作任务（任务分发）────────────────────────────────────────
export const getContentTasks = (params) =>
  request.get('/content-tasks', { params });

export const createContentTask = (data, params) =>
  request.post('/content-tasks', data, { params });

export const getContentTaskDetail = (id, params) =>
  request.get(`/content-tasks/${id}`, { params });

export const voidContentTask = (id, params) =>
  request.post(`/content-tasks/${id}/void`, {}, { params });
