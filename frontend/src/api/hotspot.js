import request from './request';

// ─── 内容池 ─────────────────────────────────────────────────────────
export const getHotContents = (params) => request.get('/hotspot/contents', { params });

export const getHotContentDetail = (id, params) => request.get(`/hotspot/contents/${id}`, { params });

// ─── 抓取 ───────────────────────────────────────────────────────────
export const runScrape = (data) => request.post('/hotspot/scrape/run', data, { timeout: 120000 });

export const runScrapeRound = () => request.post('/hotspot/scrape/round', {}, { timeout: 300000 });

export const getScrapeStatus = (params) => request.get('/hotspot/scrape/status', { params });

// ─── 关键词 ─────────────────────────────────────────────────────────
export const getKeywords = (params) => request.get('/hotspot/keywords', { params });

export const addKeyword = (data, params) => request.post('/hotspot/keywords', data, { params });

export const updateKeyword = (id, data) => request.put(`/hotspot/keywords/${id}`, data);

export const deleteKeyword = (id, params) => request.delete(`/hotspot/keywords/${id}`, { params });

// ─── 竞品 ───────────────────────────────────────────────────────────
export const getCompetitors = (params) => request.get('/hotspot/competitors', { params });

export const parseCompetitor = (data, params) =>
  request.post('/hotspot/competitors/parse', data, { params, timeout: 120000 });

export const syncCompetitor = (id, params) =>
  request.post(`/hotspot/competitors/${id}/sync`, {}, { params, timeout: 120000 });

export const toggleCompetitor = (id, data) => request.put(`/hotspot/competitors/${id}`, data);

export const deleteCompetitor = (id, params) => request.delete(`/hotspot/competitors/${id}`, { params });

// ─── 拆解 ───────────────────────────────────────────────────────────
export const requestBreakdown = (data, params) => request.post('/hotspot/breakdown', data, { params });

export const getBreakdowns = (params) => request.get('/hotspot/breakdowns', { params });

// ─── 爆款复刻文案 ───────────────────────────────────────────────────
export const generateFromBreakdown = (data, params) =>
  request.post('/hotspot/creation/article', data, { params, timeout: 180000 });

// ─── 视频工坊 ───────────────────────────────────────────────────────
export const getVoices = (params) => request.get('/hotspot/voices', { params });

export const previewVoice = (data) => request.post('/hotspot/videos/voice-preview', data, { timeout: 30000 });

export const generateVideo = (data, params) => request.post('/hotspot/videos/generate', data, { params });

export const getVideoTasks = (params) => request.get('/hotspot/videos', { params });

export const retryVideo = (id, params) => request.post(`/hotspot/videos/${id}/retry`, {}, { params });

export const getMaterialVideos = (params) => request.get('/hotspot/material-videos', { params });

// ─── 达人匹配 ───────────────────────────────────────────────────────
export const runMatch = (data, params) => request.post('/hotspot/match/run', data, { params, timeout: 300000 });

export const getMatches = (params) => request.get('/hotspot/match', { params });

export const updateMatchStatus = (id, data) => request.put(`/hotspot/match/${id}/status`, data);

// ─── 平台会话（登录态）──────────────────────────────────────────────
export const getSessions = (params) => request.get('/hotspot/sessions', { params });

// ─── 我的音色（声音复刻）────────────────────────────────────────────
export const uploadVoiceSample = (file, brandId) => {
  const fd = new FormData();
  fd.append('file', file);
  return request.post('/hotspot/voices/sample', fd, {
    params: { brandId },
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  });
};

export const createCustomVoice = (data, params) => request.post('/hotspot/voices', data, { params });

export const getCustomVoices = (params) => request.get('/hotspot/voices/custom', { params });

export const previewCustomVoice = (id, params) =>
  request.post(`/hotspot/voices/custom/${id}/preview`, {}, { params, timeout: 60000 });

export const deleteCustomVoice = (id, params) => request.delete(`/hotspot/voices/custom/${id}`, { params });

export const syncVoices = (params) => request.post('/hotspot/voices/custom/sync', {}, { params, timeout: 60000 });

export const deleteVideoTask = (id, params) => request.delete(`/hotspot/videos/${id}`, { params });
