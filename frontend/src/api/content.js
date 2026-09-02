import request from './request';

export const getProducts = () => request.get('/products');

export const createProduct = (data) => request.post('/products', data);

export const importProducts = (data) =>
  request.post('/products/import', data);

export const updateProduct = (id, data) => request.put(`/products/${id}`, data);

export const deleteProduct = (id) => request.delete(`/products/${id}`);

export const moveProduct = (id, direction) =>
  request.patch(`/products/${id}/move`, { direction });

export const getOverview = () => request.get('/overview');

export const getPackages = (params) =>
  request.get('/campaign/packages', { params });

export const createPackage = (data) => request.post('/campaign/packages', data);

export const updatePackage = (id, data) =>
  request.put(`/campaign/packages/${id}`, data);

export const deletePackage = (id) =>
  request.delete(`/campaign/packages/${id}`);

export const getMaterials = (packageId, params) =>
  request.get(`/campaign/packages/${packageId}/materials`, { params });

export const addMaterial = (packageId, data) =>
  request.post(`/campaign/packages/${packageId}/materials`, data);

export const updateMaterial = (id, data) =>
  request.put(`/campaign/materials/${id}`, data);

export const deleteMaterial = (id) =>
  request.delete(`/campaign/materials/${id}`);

export const submitMaterials = (ids) =>
  request.post('/campaign/materials/batch-submit', { ids });

export const approveMaterial = (id, comment) =>
  request.post('/campaign/reviews/approve', { id, comment });

export const rejectMaterial = (id, comment) =>
  request.post('/campaign/reviews/reject', { id, comment });

export const brandApproveMaterial = (id, comment) =>
  request.post('/campaign/reviews/brand-approve', { id, comment });

export const brandRejectMaterial = (id, comment) =>
  request.post('/campaign/reviews/brand-reject', { id, comment });

export const getBatchTasks = (params) =>
  request.get('/batch-tasks', { params });

export const createBatchTask = (data) => request.post('/batch-tasks', data);

export const cancelBatchTask = (id) => request.post(`/batch-tasks/${id}/cancel`);
