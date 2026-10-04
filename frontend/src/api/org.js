import request from './request';

export const getOrgTree = (params) => request.get('/org/tree', { params });

export const createOrg = (data) => request.post('/org', data);

export const updateOrg = (id, data) => request.put(`/org/${id}`, data);

export const deleteOrg = (id) => request.delete(`/org/${id}`);
