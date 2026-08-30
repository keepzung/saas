import axios from 'axios';

const request = axios.create({
  baseURL: '/api/agency-api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

request.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.token = token;
  }
  return config;
});

request.interceptors.response.use(
  (response) => {
    const body = response.data;
    if (body && typeof body === 'object' && 'code' in body) {
      if (body.code !== 100) {
        return Promise.reject(new Error(body.msg || '请求失败'));
      }
      return body.data;
    }
    return body;
  },
  (error) => {
    const status = error.response?.status;
    if (status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('userInfo');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(
      new Error(error.response?.data?.msg ?? '请求失败'),
    );
  },
);

export default request;
