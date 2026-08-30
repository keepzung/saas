import request from './request';

export const getCustomers = (params) =>
  request.get('/crm/customers', { params });

export const createCustomer = (data) => request.post('/crm/customers', data);

export const updateCustomer = (id, data) =>
  request.put(`/crm/customers/${id}`, data);

export const deleteCustomer = (id) =>
  request.delete(`/crm/customers/${id}`);

export const getOrders = (params) => request.get('/crm/orders', { params });

export const createOrder = (data) => request.post('/crm/orders', data);

export const updateOrderPayStatus = (id, payStatus) =>
  request.put(`/crm/orders/${id}/pay-status`, { payStatus });

export const deleteOrder = (id) => request.delete(`/crm/orders/${id}`);
