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
