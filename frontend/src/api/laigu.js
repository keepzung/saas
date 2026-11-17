import request from './request';

export const getLaiguLeads = (params) =>
  request.get('/laigu/leads', { params });

export const getLaiguLeadStats = (params) =>
  request.get('/laigu/leads/stats', { params });

export const getLaiguKosTree = (params) =>
  request.get('/laigu/leads/kos-tree', { params });

export const updateLaiguLeadTags = (id, tags) =>
  request.patch(`/laigu/leads/${id}/tags`, { tags });

export const getLaiguFeedbackAnalysis = (params) =>
  request.get('/laigu/feedback/analysis', { params });

export const getLaiguLeadDetail = (id) =>
  request.get(`/laigu/leads/${id}`);

export const syncLaigu = (data = {}) => request.post('/laigu/sync', data);

// ─── 智能私信（DM bot，东风日产建设项）──────────────────────────────
export const getLaiguDmConfig = (params) =>
  request.get('/laigu/dm/config', { params });

export const updateLaiguDmConfig = (data, params) =>
  request.put('/laigu/dm/config', data, { params });

export const processLaiguDm = (data, params) =>
  request.post('/laigu/dm/process', data, { params });

export const getLaiguDmReplyLogs = (params) =>
  request.get('/laigu/dm/reply-logs', { params });

export const takeoverLaiguLead = (id, takeover) =>
  request.patch(`/laigu/leads/${id}/takeover`, { takeover });

export const getLaiguDmSlaStats = (params) =>
  request.get('/laigu/dm/sla-stats', { params });

export const getLaiguCommentList = (params) =>
  request.get('/laigu/comments/list', { params });

export const replyLaiguComment = (id, data, params) =>
  request.post(`/laigu/comments/${id}/reply`, data, { params });
