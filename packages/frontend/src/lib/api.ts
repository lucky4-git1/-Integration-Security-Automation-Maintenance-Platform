import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL ?? '';

export const api = axios.create({
  baseURL: `${BASE_URL}/api/v1`,
  withCredentials: true,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// Inject auth token
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('access_token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const orgId = localStorage.getItem('organization_id');
  if (orgId && config.headers) {
    config.headers['x-organization-id'] = orgId;
  }
  return config;
});

// Auto-refresh on 401
let refreshing = false;
let queue: Array<{ resolve: (token: string) => void; reject: (err: unknown) => void }> = [];

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    if (error.response?.status === 401 && !original._retry && !original.url?.includes('/auth/')) {
      if (refreshing) {
        return new Promise((resolve, reject) => {
          queue.push({ resolve: (t) => { original.headers!.Authorization = `Bearer ${t}`; resolve(api(original)); }, reject });
        });
      }
      original._retry = true;
      refreshing = true;
      const refreshToken = localStorage.getItem('refresh_token');
      if (!refreshToken) {
        clearAuth();
        window.location.href = '/login';
        return Promise.reject(error);
      }
      try {
        const { data } = await api.post('/auth/refresh', { refreshToken });
        const newToken = data.data.accessToken;
        localStorage.setItem('access_token', newToken);
        queue.forEach(({ resolve }) => resolve(newToken));
        queue = [];
        original.headers!.Authorization = `Bearer ${newToken}`;
        return api(original);
      } catch (refreshError) {
        queue.forEach(({ reject }) => reject(refreshError));
        queue = [];
        clearAuth();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        refreshing = false;
      }
    }
    return Promise.reject(error);
  }
);

export function clearAuth() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('organization_id');
  localStorage.removeItem('user');
}

export function getApiError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.error?.message ?? error.message ?? 'Request failed';
  }
  return error instanceof Error ? error.message : 'Unknown error';
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authApi = {
  register: (d: { email: string; password: string; firstName: string; lastName: string }) =>
    api.post('/auth/register', d).then(r => r.data),
  login: (d: { email: string; password: string }) =>
    api.post('/auth/login', d).then(r => r.data),
  logout: () => api.post('/auth/logout').then(r => r.data),
  me: () => api.get('/auth/me').then(r => r.data),
  changePassword: (d: { currentPassword: string; newPassword: string }) =>
    api.post('/auth/password/change', d).then(r => r.data),
  requestReset: (email: string) =>
    api.post('/auth/password-reset/request', { email }).then(r => r.data),
  confirmReset: (d: { token: string; newPassword: string }) =>
    api.post('/auth/password-reset/confirm', d).then(r => r.data),
};

// ── Organizations ─────────────────────────────────────────────────────────────
export const orgApi = {
  list: () => api.get('/organizations').then(r => r.data),
  get: (id: string) => api.get(`/organizations/${id}`).then(r => r.data),
  create: (d: { name: string; slug: string }) =>
    api.post('/organizations', d).then(r => r.data),
  update: (id: string, d: Record<string, unknown>) =>
    api.patch(`/organizations/${id}`, d).then(r => r.data),
  listMembers: (id: string) =>
    api.get(`/organizations/${id}/members`).then(r => r.data),
  addMember: (id: string, d: { email: string; roleId: string }) =>
    api.post(`/organizations/${id}/members`, d).then(r => r.data),
  removeMember: (id: string, memberId: string) =>
    api.delete(`/organizations/${id}/members/${memberId}`).then(r => r.data),
};

// ── Integrations ──────────────────────────────────────────────────────────────
export const integrationApi = {
  list: (p?: Record<string, unknown>) =>
    api.get('/integrations', { params: p }).then(r => r.data),
  providers: () => api.get('/integrations/providers').then(r => r.data),
  stats: () => api.get('/integrations/stats').then(r => r.data),
  get: (id: string) => api.get(`/integrations/${id}`).then(r => r.data),
  create: (d: Record<string, unknown>) =>
    api.post('/integrations', d).then(r => r.data),
  update: (id: string, d: Record<string, unknown>) =>
    api.patch(`/integrations/${id}`, d).then(r => r.data),
  delete: (id: string) => api.delete(`/integrations/${id}`).then(r => r.data),
  test: (id: string) => api.post(`/integrations/${id}/test`).then(r => r.data),
  webhooks: (id: string, p?: Record<string, unknown>) =>
    api.get(`/integrations/${id}/webhooks`, { params: p }).then(r => r.data),
};

// ── Automations ───────────────────────────────────────────────────────────────
export const automationApi = {
  list: (p?: Record<string, unknown>) =>
    api.get('/automations', { params: p }).then(r => r.data),
  stats: (p?: Record<string, unknown>) =>
    api.get('/automations/stats', { params: p }).then(r => r.data),
  get: (id: string) => api.get(`/automations/${id}`).then(r => r.data),
  create: (d: Record<string, unknown>) =>
    api.post('/automations', d).then(r => r.data),
  update: (id: string, d: Record<string, unknown>) =>
    api.patch(`/automations/${id}`, d).then(r => r.data),
  delete: (id: string) => api.delete(`/automations/${id}`).then(r => r.data),
  toggle: (id: string) => api.post(`/automations/${id}/toggle`).then(r => r.data),
  run: (id: string, input?: Record<string, unknown>) =>
    api.post(`/automations/${id}/run`, { input }).then(r => r.data),
  executions: (p?: Record<string, unknown>) =>
    api.get('/automations/executions', { params: p }).then(r => r.data),
  executionById: (id: string) =>
    api.get(`/automations/executions/${id}`).then(r => r.data),
  cancelExecution: (id: string) =>
    api.post(`/automations/executions/${id}/cancel`).then(r => r.data),
  automationExecutions: (id: string, p?: Record<string, unknown>) =>
    api.get(`/automations/${id}/executions`, { params: p }).then(r => r.data),
};

// ── Incidents ─────────────────────────────────────────────────────────────────
export const incidentApi = {
  list: (p?: Record<string, unknown>) =>
    api.get('/incidents', { params: p }).then(r => r.data),
  stats: () => api.get('/incidents/stats').then(r => r.data),
  get: (id: string) => api.get(`/incidents/${id}`).then(r => r.data),
  create: (d: Record<string, unknown>) =>
    api.post('/incidents', d).then(r => r.data),
  update: (id: string, d: Record<string, unknown>) =>
    api.patch(`/incidents/${id}`, d).then(r => r.data),
  acknowledge: (id: string) =>
    api.post(`/incidents/${id}/acknowledge`).then(r => r.data),
  investigate: (id: string) =>
    api.post(`/incidents/${id}/investigate`).then(r => r.data),
  resolve: (id: string, resolution: string) =>
    api.post(`/incidents/${id}/resolve`, { resolution }).then(r => r.data),
  channels: () => api.get('/incidents/channels').then(r => r.data),
  createChannel: (d: Record<string, unknown>) =>
    api.post('/incidents/channels', d).then(r => r.data),
  deleteChannel: (id: string) =>
    api.delete(`/incidents/channels/${id}`).then(r => r.data),
  notifications: (id: string) =>
    api.get(`/incidents/${id}/notifications`).then(r => r.data),
};

// ── Backups ───────────────────────────────────────────────────────────────────
export const backupApi = {
  stats: () => api.get('/backups/stats').then(r => r.data),
  policies: (p?: Record<string, unknown>) =>
    api.get('/backups/policies', { params: p }).then(r => r.data),
  createPolicy: (d: Record<string, unknown>) =>
    api.post('/backups/policies', d).then(r => r.data),
  getPolicy: (id: string) =>
    api.get(`/backups/policies/${id}`).then(r => r.data),
  updatePolicy: (id: string, d: Record<string, unknown>) =>
    api.patch(`/backups/policies/${id}`, d).then(r => r.data),
  deletePolicy: (id: string) =>
    api.delete(`/backups/policies/${id}`).then(r => r.data),
  runPolicy: (id: string) =>
    api.post(`/backups/policies/${id}/run`).then(r => r.data),
  list: (p?: Record<string, unknown>) =>
    api.get('/backups', { params: p }).then(r => r.data),
  get: (id: string) => api.get(`/backups/${id}`).then(r => r.data),
  restore: (id: string, targetEnvironment: string) =>
    api.post(`/backups/${id}/restore`, { targetEnvironment }).then(r => r.data),
  getRestore: (id: string) =>
    api.get(`/backups/restores/${id}`).then(r => r.data),
  authorizeRestore: (id: string) =>
    api.post(`/backups/restores/${id}/authorize`).then(r => r.data),
};

// ── Security ──────────────────────────────────────────────────────────────────
export const securityApi = {
  stats: () => api.get('/security/stats').then(r => r.data),
  findings: (p?: Record<string, unknown>) =>
    api.get('/security/findings', { params: p }).then(r => r.data),
  getFinding: (id: string) =>
    api.get(`/security/findings/${id}`).then(r => r.data),
  createFinding: (d: Record<string, unknown>) =>
    api.post('/security/findings', d).then(r => r.data),
  updateFinding: (id: string, d: Record<string, unknown>) =>
    api.patch(`/security/findings/${id}`, d).then(r => r.data),
  runAssessment: () => api.post('/security/assessment').then(r => r.data),
};

// ── Documents ─────────────────────────────────────────────────────────────────
export const documentApi = {
  list: (p?: Record<string, unknown>) =>
    api.get('/documents', { params: p }).then(r => r.data),
  get: (id: string) => api.get(`/documents/${id}`).then(r => r.data),
  create: (d: Record<string, unknown>) =>
    api.post('/documents', d).then(r => r.data),
  update: (id: string, d: Record<string, unknown>) =>
    api.patch(`/documents/${id}`, d).then(r => r.data),
  delete: (id: string) => api.delete(`/documents/${id}`).then(r => r.data),
  publish: (id: string) =>
    api.post(`/documents/${id}/publish`).then(r => r.data),
  versions: (id: string) =>
    api.get(`/documents/${id}/versions`).then(r => r.data),
};

// ── Performance ───────────────────────────────────────────────────────────────
export const performanceApi = {
  reviews: (p?: Record<string, unknown>) =>
    api.get('/performance/reviews', { params: p }).then(r => r.data),
  getReview: (id: string) =>
    api.get(`/performance/reviews/${id}`).then(r => r.data),
  createReview: (d: Record<string, unknown>) =>
    api.post('/performance/reviews', d).then(r => r.data),
  approveReview: (id: string) =>
    api.post(`/performance/reviews/${id}/approve`).then(r => r.data),
  addRecommendation: (id: string, d: Record<string, unknown>) =>
    api.post(`/performance/reviews/${id}/recommendations`, d).then(r => r.data),
  updateRecommendation: (reviewId: string, recId: string, d: Record<string, unknown>) =>
    api.patch(`/performance/reviews/${reviewId}/recommendations/${recId}`, d).then(r => r.data),
  metrics: (startDate: string, endDate: string) =>
    api.get('/performance/metrics', { params: { startDate, endDate } }).then(r => r.data),
};

// ── Audit ─────────────────────────────────────────────────────────────────────
export const auditApi = {
  logs: (p?: Record<string, unknown>) =>
    api.get('/audit/logs', { params: p }).then(r => r.data),
};
