import api from './api';

const ordersAPI = {
  getAll: (params) => api.get('/orders', { params }),
  getById: (id) => api.get(`/orders/${id}`),
  create: (orderData) => api.post('/orders', orderData),
  updateStatus: (id, status) => api.patch(`/orders/${id}/status`, { status }),
  updatePayment: (id, paymentStatus) => api.patch(`/orders/${id}/payment`, { paymentStatus }),
  getActive: () => api.get('/orders/active/all'),
  getTodaySummary: () => api.get('/orders/summary/today'),
};

export default ordersAPI;
