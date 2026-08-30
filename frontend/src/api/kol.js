import request from './request';

export const getAuthors = (data) => request.post('/kol/authors/list', data);

export const getLibrary = (params) => request.get('/kol/list', { params });

export const collectAuthors = (authorIds) =>
  request.post('/kol/collect', { authorIds });

export const uncollectCreator = (id) => request.delete(`/kol/list/${id}`);

export const updateCreator = (id, data) => request.put(`/kol/list/${id}`, data);

export const toggleCreatorStatus = (id) =>
  request.post(`/kol/list/${id}/toggle-status`);

export const getInstitutions = (params) =>
  request.get('/kol/institutions', { params });

export const getInstitutionCreators = (params) =>
  request.get('/kol/institution-creators', { params });

export const getKolUsers = () => request.get('/kol/user/list');

export const getMcns = () => request.get('/kol/mcns');

export const getKolTags = () => request.get('/kol/tags');

export const getRegionTree = () => request.get('/kol/region/tree');

export const getReviews = (params) => request.get('/kol/reviews', { params });

export const getPendingCount = () => request.get('/kol/reviews/pending-count');

export const approveReview = (id, reason) =>
  request.post(`/kol/reviews/${id}/approve`, { reason });

export const rejectReview = (id, reason) =>
  request.post(`/kol/reviews/${id}/reject`, { reason });

export const getKolLogs = (params) => request.get('/kol/logs', { params });
