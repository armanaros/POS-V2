import api from './api';

const menuAPI = {
  getAll: () => api.get('/menu/full'),
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

export default menuAPI;
