import request from './request';

export const getWorkspaces = () => request.get('/project/workspaces');

export const getWorkspace = (params) =>
  request.get('/project/workspace', { params });

export const getMembers = () => request.get('/project/members');

export const getFolders = (params) => request.get('/project/folders', { params });

export const createFolder = (data) => request.post('/project/folders', data);

export const updateFolder = (id, data) =>
  request.put(`/project/folders/${id}`, data);

export const deleteFolder = (id) => request.delete(`/project/folders/${id}`);

export const getProjects = (params) =>
  request.get('/project/projects', { params });

export const getProject = (id) => request.get(`/project/projects/${id}`);

export const createProject = (data) => request.post('/project/projects', data);

export const updateProject = (id, data) =>
  request.put(`/project/projects/${id}`, data);

export const deleteProject = (id) => request.delete(`/project/projects/${id}`);

export const archiveProject = (id) =>
  request.post(`/project/projects/${id}/archive`);

export const unarchiveProject = (id) =>
  request.post(`/project/projects/${id}/unarchive`);
