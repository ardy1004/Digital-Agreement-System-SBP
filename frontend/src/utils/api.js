import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Agreement API
export const agreementApi = {
  // List all agreements
  list: (status) => api.get('/agreements', { params: status ? { status } : {} }),
  
  // Get single agreement
  get: (id) => api.get(`/agreements/${id}`),
  
  // Get by token (for signing page)
  getByToken: (token) => api.get(`/agreements/token/${token}`),
  
  // Create new agreement
  create: (data) => api.post('/agreements', data),
  
  // Update agreement
  update: (id, data) => api.put(`/agreements/${id}`, data),
  
  // Send agreement
  send: (id) => api.post(`/agreements/${id}/send`),
  
  // Sign agreement
  sign: (token, data) => api.post(`/agreements/sign/${token}`, data),
  
  // Download PDF
  getPdfUrl: (id) => `/api/agreements/${id}/pdf`,
};

export default api;
