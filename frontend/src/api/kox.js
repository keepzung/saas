import request from './request';

export const getKoxAccounts = (params) =>
  request.get('/kox/accounts', { params });

export const createKoxAccount = (data) => request.post('/kox/accounts', data);

export const updateKoxAccount = (id, data) =>
  request.put(`/kox/accounts/${id}`, data);

export const deleteKoxAccount = (id) =>
  request.delete(`/kox/accounts/${id}`);

export const getKoxOverview = (params) =>
  request.get('/kox/overview', { params });

export const getKoxTasks = (params) => request.get('/kox/tasks', { params });

export const createKoxTask = (data) => request.post('/kox/tasks', data);

export const getKoxTaskDetail = (id) => request.get(`/kox/tasks/${id}`);

export const stopKoxTask = (id) => request.post(`/kox/tasks/${id}/stop`);

export const getModelSales = (params) =>
  request.get('/kox/model-sales', { params });
