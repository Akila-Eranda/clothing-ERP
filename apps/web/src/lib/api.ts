const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

// ── Response shape from NestJS ResponseInterceptor ─────────────────────────
export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T;
  message?: string;
  meta?: { page: number; limit: number; total: number; totalPages: number };
}

// ── Token helpers (localStorage) ─────────────────────────────────────────
const TOKEN_KEY   = 'fe_access_token';
const REFRESH_KEY = 'fe_refresh_token';

export const tokenStorage = {
  getAccess:   () => (typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY)   : null),
  getRefresh:  () => (typeof window !== 'undefined' ? localStorage.getItem(REFRESH_KEY) : null),
  setAccess:   (t: string) => localStorage.setItem(TOKEN_KEY, t),
  setRefresh:  (t: string) => localStorage.setItem(REFRESH_KEY, t),
  clear:       () => { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(REFRESH_KEY); },
};

// ── Base fetch wrapper ────────────────────────────────────────────────────
let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

function subscribeRefresh(cb: (token: string) => void) {
  refreshSubscribers.push(cb);
}
function onRefreshed(token: string) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

async function tryRefresh(): Promise<string | null> {
  const refreshToken = tokenStorage.getRefresh();
  if (!refreshToken) return null;
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return null;
    const json: ApiResponse<{ accessToken: string; refreshToken: string }> = await res.json();
    tokenStorage.setAccess(json.data.accessToken);
    tokenStorage.setRefresh(json.data.refreshToken);
    return json.data.accessToken;
  } catch {
    return null;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  };

  const token = tokenStorage.getAccess();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });

  // 401 → try token refresh once
  if (res.status === 401) {
    if (!isRefreshing) {
      isRefreshing = true;
      const newToken = await tryRefresh();
      isRefreshing = false;
      if (newToken) {
        onRefreshed(newToken);
        // Retry original request
        headers['Authorization'] = `Bearer ${newToken}`;
        const retried = await fetch(`${API_BASE}${path}`, { ...init, headers });
        if (!retried.ok) {
          tokenStorage.clear();
          if (typeof window !== 'undefined') window.location.href = '/login';
          throw new Error('Session expired');
        }
        return retried.json() as Promise<ApiResponse<T>>;
      } else {
        tokenStorage.clear();
        if (typeof window !== 'undefined') window.location.href = '/login';
        throw new Error('Session expired');
      }
    } else {
      // Another request is already refreshing — wait for it
      return new Promise((resolve, reject) => {
        subscribeRefresh(async (newToken) => {
          headers['Authorization'] = `Bearer ${newToken}`;
          try {
            const retried = await fetch(`${API_BASE}${path}`, { ...init, headers });
            resolve(retried.json() as Promise<ApiResponse<T>>);
          } catch (e) {
            reject(e);
          }
        });
      });
    }
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      message = body?.message ?? message;
    } catch {}
    throw new Error(message);
  }

  return res.json() as Promise<ApiResponse<T>>;
}

export const api = {
  get:    <T>(path: string)                   => request<T>(path, { method: 'GET' }),
  post:   <T>(path: string, body?: unknown)   => request<T>(path, { method: 'POST',  body: JSON.stringify(body) }),
  put:    <T>(path: string, body?: unknown)   => request<T>(path, { method: 'PUT',   body: JSON.stringify(body) }),
  patch:  <T>(path: string, body?: unknown)   => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string)                   => request<T>(path, { method: 'DELETE' }),
};

// ── Auth API ─────────────────────────────────────────────────────────────
export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    tenantId: string;
    branchId: string | null;
    roles: string[];
  };
}

export const authApi = {
  login: (email: string, password: string) =>
    api.post<LoginResponse>('/auth/login', { email, password }),

  logout: () =>
    api.post<null>('/auth/logout'),

  me: () =>
    api.get<LoginResponse['user']>('/auth/me'),

  refresh: (refreshToken: string) =>
    api.post<{ accessToken: string; refreshToken: string }>('/auth/refresh', { refreshToken }),

  forgotPassword: (email: string) =>
    api.post<null>('/auth/forgot-password', { email }),

  resetPassword: (token: string, newPassword: string) =>
    api.post<null>('/auth/reset-password', { token, newPassword }),

  changePassword: (currentPassword: string, newPassword: string) =>
    api.post<null>('/auth/change-password', { currentPassword, newPassword }),
};
