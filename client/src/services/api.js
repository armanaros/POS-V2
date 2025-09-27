import axios from 'axios';

// Use relative '/api' by default so the Create React App dev server proxy (package.json "proxy")
// will forward API calls to the backend in development. Set REACT_APP_API_URL to override in production.
const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth API calls
export const authAPI = {
  login: (credentials) => api.post('/auth/login', credentials),
  verify: () => api.get('/auth/verify'),
  logout: () => api.post('/auth/logout'),
};

// Users API calls
export const usersAPI = {
  getAllUsers: () => api.get('/users'),
  getAll: () => api.get('/users'),
  getById: (id) => api.get(`/users/${id}`),
  createUser: (userData) => api.post('/users', userData),
  create: (userData) => api.post('/users', userData),
  updateUser: (id, userData) => api.put(`/users/${id}`, userData),
  update: (id, userData) => api.put(`/users/${id}`, userData),
  deleteUser: (id) => api.delete(`/users/${id}`),
  delete: (id) => api.delete(`/users/${id}`),
  toggleUserStatus: (id, isActive) => api.patch(`/users/${id}/status`, { isActive }),
  getUserActivity: (id) => api.get(`/users/${id}/activity`),
};

// Menu API calls
export const menuAPI = {
  getFullMenu: () => api.get('/menu/full'),
  getCategories: () => api.get('/menu/categories'),
  getCategoryItems: (categoryId) => api.get(`/menu/categories/${categoryId}/items`),
  createCategory: (categoryData) => api.post('/menu/categories', categoryData),
  createItem: (itemData) => api.post('/menu/items', itemData),
  updateCategory: (id, categoryData) => api.put(`/menu/categories/${id}`, categoryData),
  updateItem: (id, itemData) => api.put(`/menu/items/${id}`, itemData),
  toggleAvailability: (id, isAvailable) => api.patch(`/menu/items/${id}/availability`, { isAvailable }),
  deleteCategory: (id) => api.delete(`/menu/categories/${id}`),
  deleteItem: (id) => api.delete(`/menu/items/${id}`),
};

// Orders API calls
export const ordersAPI = {
  getAll: (params) => api.get('/orders', { params }),
  getById: (id) => api.get(`/orders/${id}`),
  create: (orderData) => api.post('/orders', orderData),
  updateStatus: (id, status) => api.patch(`/orders/${id}/status`, { status }),
  updatePayment: (id, paymentStatus) => api.patch(`/orders/${id}/payment`, { paymentStatus }),
  getActive: () => api.get('/orders/active/all'),
  getTodaySummary: () => api.get('/orders/summary/today'),
  getIncomeAnalysis: () => api.get('/orders/income/analysis'),
  getIncomeBreakdown: (params) => api.get('/orders/income/breakdown', { params }),
};

// Reports API calls
export const reportsAPI = {
  getDashboard: () => api.get('/reports/dashboard'),
  getSalesReport: (startDate, endDate) => api.get('/reports/sales', { params: { startDate, endDate } }),
  getTopItems: (startDate, endDate) => api.get('/reports/top-items', { params: { startDate, endDate } }),
  getEmployeePerformance: (startDate, endDate) => api.get('/reports/employees/performance', { params: { startDate, endDate } }),
  getOrderAnalytics: (startDate, endDate) => api.get('/reports/order-analytics', { params: { startDate, endDate } }),
  exportReport: (type, startDate, endDate) =>
    api.get('/reports/export', {
      params: { type, startDate, endDate },
      responseType: 'blob',
    }),
  getDailySales: (date) => api.get('/reports/sales/daily', { params: { date } }),
  getWeeklySales: (startDate, endDate) => api.get('/reports/sales/weekly', { params: { startDate, endDate } }),
  getMenuPerformance: (startDate, endDate) => api.get('/reports/menu/performance', { params: { startDate, endDate } }),
  getOrderTypes: (startDate, endDate) => api.get('/reports/orders/types', { params: { startDate, endDate } }),
  getHourlySales: (date) => api.get('/reports/sales/hourly', { params: { date } }),
  getActivityLogs: (params) => api.get('/reports/activity', { params }),
};

export default api;
