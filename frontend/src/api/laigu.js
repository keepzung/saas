import request from './request';

export const getLaiguLeads = (params) =>
  request.get('/laigu/leads', { params });

export const getLaiguLeadStats = (params) =>
  request.get('/laigu/leads/stats', { params });

export const getLaiguLeadDetail = (id) =>
  request.get(`/laigu/leads/${id}`);

export const syncLaigu = (data = {}) => request.post('/laigu/sync', data);
