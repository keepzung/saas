import request from './request';

export const sparkSync = (data) => request.post('/spark/sync', data);

export const getSparkStatus = () => request.get('/spark/status');

export const getSparkLogs = (params) => request.get('/spark/logs', { params });

export const getSparkCampaignSummary = (params) =>
  request.get('/spark/campaign/summary', { params });

export const getSparkCampaignAccounts = (params) =>
  request.get('/spark/campaign/accounts', { params });

export const getSparkAccounts = (params) =>
  request.get('/spark/accounts', { params });

export const updateSparkAccountScope = (id, scope) =>
  request.put(`/spark/accounts/${id}/scope`, { scope });

export const getSparkProjects = (params) =>
  request.get('/spark/projects', { params });

export const createSparkProject = (data, brandId) =>
  request.post('/spark/projects', data, { params: brandId ? { brandId } : {} });

export const deleteSparkProject = (id) =>
  request.delete(`/spark/projects/${id}`);
