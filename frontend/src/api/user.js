import request from './request';

export const getUsers = () => request.get('/user/manage/list');

export const createUser = (data) => request.post('/user/manage', data);

export const batchCreateUsers = (data) =>
  request.post('/user/manage/batch', data);

export const updateUser = (id, data) =>
  request.put(`/user/manage/${id}`, data);

export const resetUserPassword = (id, password) =>
  request.put(`/user/manage/${id}/password`, { password });
