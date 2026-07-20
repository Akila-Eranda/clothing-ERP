import { posCashierStorage } from '@/lib/pos-cashier';

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
const TENANT_KEY  = 'fe_tenant_id';

export const tokenStorage = {
  getAccess:   () => (typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY)   : null),
  getRefresh:  () => (typeof window !== 'undefined' ? localStorage.getItem(REFRESH_KEY) : null),
  getTenant:   () => (typeof window !== 'undefined' ? localStorage.getItem(TENANT_KEY)  : null),
  setAccess:   (t: string) => {
    localStorage.setItem(TOKEN_KEY, t);
    document.cookie = `${TOKEN_KEY}=${t}; path=/; SameSite=Lax; max-age=86400`;
  },
  setRefresh:  (t: string) => localStorage.setItem(REFRESH_KEY, t),
  setTenant:   (id: string) => localStorage.setItem(TENANT_KEY, id),
  clear:       () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(TENANT_KEY);
    document.cookie = `${TOKEN_KEY}=; path=/; max-age=0`;
  },
};

// ── Extract tenantId from JWT payload (fallback for existing sessions) ────
function getTenantFromToken(): string | null {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('fe_access_token') : null;
    if (!token) return null;
    const payload = JSON.parse(atob(token.split('.')[1]));
    return (payload.tenantId as string) ?? null;
  } catch {
    return null;
  }
}

// ── Extract tenant slug from subdomain (e.g. akila.shop.hexalyte.com → akila) ──
function getTenantFromSubdomain(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const hostname = window.location.hostname; // e.g. akila.shop.hexalyte.com
    const parts = hostname.split('.');
    // Must be at least 4 parts: <slug>.shop.hexalyte.com
    if (parts.length >= 4 && parts[1] === 'shop') return parts[0];
    // Also handle localhost:<port> dev fallback via query param ?tenant=slug
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('tenant');
  } catch {
    return null;
  }
}

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
function onRefreshFailed() {
  refreshSubscribers.forEach((cb) => cb(''));
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

/** POS PIN unlock — attach only where the API attributes cash/sales to the unlocked cashier. */
function needsPosCashierHeader(path: string): boolean {
  if (path.startsWith('/pos') || path.startsWith('/cash')) return true;
  if (path.startsWith('/accounting/expenses')) return true;
  return /\/suppliers\/[^/]+\/ap\/payment/.test(path);
}

async function request<T>(path: string, init: RequestInit = {}, attempt = 0): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  };

  const token = tokenStorage.getAccess();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  // Active POS cashier (PIN unlock) — only on routes that attribute sales/cash to the unlocked user
  const needsPosCashier = needsPosCashierHeader(path);
  if (needsPosCashier) {
    const posToken = posCashierStorage.getToken();
    if (posToken) headers['x-pos-cashier-token'] = posToken;
  }

  const tenantId = (init.headers as Record<string, string> | undefined)?.['x-tenant-id']
    || tokenStorage.getTenant()
    || getTenantFromToken()
    || getTenantFromSubdomain();
  if (tenantId) {
    headers['x-tenant-id'] = tenantId;
    if (!tokenStorage.getTenant()) tokenStorage.setTenant(tenantId);
  }

  const branchId = (init.headers as Record<string, string> | undefined)?.['x-branch-id']
    || (typeof window !== 'undefined' ? localStorage.getItem('fe_active_branch') : null);
  if (branchId) headers['x-branch-id'] = branchId;

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });

  // Transient gateway errors (deploy restart, upstream boot) — retry with backoff
  const isGatewayError = res.status === 502 || res.status === 503 || res.status === 504;
  const maxGatewayRetries = 3;
  if (isGatewayError && attempt < maxGatewayRetries) {
    const delayMs = Math.min(3000, 300 * 2 ** attempt) + Math.floor(Math.random() * 100);
    await new Promise((r) => setTimeout(r, delayMs));
    return request<T>(path, init, attempt + 1);
  }

  // 401 → try token refresh once
  if (res.status === 401) {
    if (!isRefreshing) {
      isRefreshing = true;
      const newToken = await tryRefresh();
      isRefreshing = false;
      if (newToken) {
        onRefreshed(newToken);
        headers['Authorization'] = `Bearer ${newToken}`;
        const retried = await fetch(`${API_BASE}${path}`, { ...init, headers });
        if (!retried.ok) {
          tokenStorage.clear();
          if (typeof window !== 'undefined') window.location.href = '/login';
          throw new Error('Session expired');
        }
        return retried.json() as Promise<ApiResponse<T>>;
      } else {
        onRefreshFailed();
        tokenStorage.clear();
        if (typeof window !== 'undefined') window.location.href = '/login';
        throw new Error('Session expired');
      }
    } else {
      // Another request is already refreshing — wait for it
      return new Promise((resolve, reject) => {
        subscribeRefresh(async (token) => {
          if (!token) { reject(new Error('Session expired')); return; }
          headers['Authorization'] = `Bearer ${token}`;
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
  get:    <T>(path: string, init?: RequestInit)                   => request<T>(path, { method: 'GET', ...init }),
  post:   <T>(path: string, body?: unknown, init?: RequestInit)   => request<T>(path, { method: 'POST',  body: JSON.stringify(body), ...init }),
  put:    <T>(path: string, body?: unknown, init?: RequestInit)   => request<T>(path, { method: 'PUT',   body: JSON.stringify(body), ...init }),
  patch:  <T>(path: string, body?: unknown, init?: RequestInit)   => request<T>(path, { method: 'PATCH', body: JSON.stringify(body), ...init }),
  delete: <T>(path: string, init?: RequestInit)                   => request<T>(path, { method: 'DELETE', ...init }),
};

/** Phase 06 Sprint 12 — client-side PRINT / EXPORT beacon (fire-and-forget safe). */
export async function logClientAuditEvent(payload: {
  action: 'PRINT' | 'EXPORT';
  resource: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await api.post('/audit-logs/client-event', payload);
  } catch {
    // never block UX on audit beacon
  }
}

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
  login: (email: string, password: string, tenantSlug?: string) =>
    api.post<LoginResponse>(
      '/auth/login',
      { email, password },
      tenantSlug ? { headers: { 'x-tenant-id': tenantSlug } } : undefined,
    ),

  logout: () =>
    api.delete<null>('/auth/logout'),

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
