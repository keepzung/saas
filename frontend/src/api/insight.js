import request from './request';

export const getInsightOverview = (params) =>
  request.get('/insight/brand/overview', { params });

export const getInsightContents = (params) =>
  request.get('/insight/brand/contents', { params });

export const markIrrelevant = (id) =>
  request.post(`/insight/brand/contents/${id}/irrelevant`);

export const getInsightReports = () =>
  request.get('/insight/brand/reports');

export const createInsightReport = (data) =>
  request.post('/insight/brand/reports', data);

export const deleteInsightReport = (id) =>
  request.delete(`/insight/brand/reports/${id}`);
