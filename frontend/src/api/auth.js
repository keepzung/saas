import request from './request';

export const getCompaniesByUserId = (userId) =>
  request.get('/getcompanybyuserid', { params: { user_id: userId } });
