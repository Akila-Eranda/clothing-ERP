import { api, tokenStorage } from '@/lib/api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

export interface UploadedFile {
  id: string;
  url: string;
  originalName: string;
  mimeType: string;
  size: number;
}

/** Turn stored `/uploads/...` or absolute URL into a browser-loadable URL. */
export function resolvePublicAssetUrl(url: string): string {
  if (!url) return '';
  if (/^https?:\/\//i.test(url) || url.startsWith('data:')) return url;
  const path = url.startsWith('/') ? url : `/${url}`;
  // Shop subdomains serve /uploads via nginx — same-origin avoids broken API-host links.
  if (typeof window !== 'undefined') {
    return `${window.location.origin}${path}`;
  }
  const apiOrigin = API_BASE.replace(/\/api\/v1\/?$/, '');
  return `${apiOrigin}${path}`;
}

export async function uploadFile(file: File, folder = 'general'): Promise<UploadedFile> {
  const form = new FormData();
  form.append('file', file);
  form.append('folder', folder);

  const headers: Record<string, string> = {};
  const token = tokenStorage.getAccess();
  if (token) headers.Authorization = `Bearer ${token}`;

  const tenantId = tokenStorage.getTenant();
  if (tenantId) headers['x-tenant-id'] = tenantId;

  const branchId = typeof window !== 'undefined' ? localStorage.getItem('fe_active_branch') : null;
  if (branchId) headers['x-branch-id'] = branchId;

  const res = await fetch(`${API_BASE}/files/upload`, {
    method: 'POST',
    headers,
    body: form,
  });

  if (!res.ok) {
    let message = `Upload failed (${res.status})`;
    try {
      const body = await res.json();
      message = body?.message ?? message;
    } catch { /* noop */ }
    throw new Error(message);
  }

  const json = await res.json();
  const data = (json.data ?? json) as UploadedFile;
  if (!data?.url) throw new Error('Upload failed — no URL returned');
  return data;
}

/** Auth / tenant / branch headers for a raw fetch to the API (multipart upload or file download). */
function rawApiHeaders(token: string | null): Record<string, string> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const tenantId = tokenStorage.getTenant();
  if (tenantId) headers['x-tenant-id'] = tenantId;
  const branchId = typeof window !== 'undefined' ? localStorage.getItem('fe_active_branch') : null;
  if (branchId) headers['x-branch-id'] = branchId;
  return headers;
}

/**
 * After a 401, renew the access token through the shared api client so its single-flight refresh and
 * its logout-on-failure behaviour are reused (its refresh helper is private; any authenticated call
 * through `api` runs it). Returns the new token, null when the session could not be renewed, or
 * undefined when the session is still valid with the same token (the 401 had another cause).
 */
async function renewAccessToken(sentToken: string | null): Promise<string | null | undefined> {
  const current = tokenStorage.getAccess();
  if (current && current !== sentToken) return current; // another request already refreshed it
  try {
    await api.get('/auth/me');
  } catch {
    return null;
  }
  const next = tokenStorage.getAccess();
  return next && next !== sentToken ? next : undefined;
}

/** fetch with the API headers; on 401 renews the session once (like the api client) and retries. */
async function fetchWithAuth(url: string, init: RequestInit): Promise<Response> {
  const token = tokenStorage.getAccess();
  const res = await fetch(url, { ...init, headers: rawApiHeaders(token) });
  if (res.status !== 401) return res;
  const renewed = await renewAccessToken(token);
  if (renewed === undefined) return res; // token unchanged and still accepted: show the API's own 401 message
  if (renewed === null) throw new Error('Session expired. Please sign in again.');
  return fetch(url, { ...init, headers: rawApiHeaders(renewed) });
}

/**
 * POST one file (multipart field "file") to an API endpoint with the usual auth / tenant / branch
 * headers, and return the unwrapped `data`. Used by QR image upload and product import preview.
 */
export async function postFile<T>(path: string, file: File, extra: Record<string, string> = {}): Promise<T> {
  const form = new FormData();
  form.append('file', file);
  for (const [k, v] of Object.entries(extra)) form.append(k, v);

  const res = await fetchWithAuth(`${API_BASE}${path.startsWith('/') ? path : `/${path}`}`, { method: 'POST', body: form });
  let body: unknown = null;
  try { body = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const m = (body as { message?: unknown } | null)?.message;
    throw new Error(Array.isArray(m) ? m.join('; ') : typeof m === 'string' ? m : `Request failed (${res.status})`);
  }
  return ((body as { data?: T } | null)?.data ?? body) as T;
}

/** GET a file from the API (with auth / tenant headers) and save it in the browser. */
export async function downloadFile(path: string, fileName: string): Promise<void> {
  const res = await fetchWithAuth(`${API_BASE}${path.startsWith('/') ? path : `/${path}`}`, {});
  if (!res.ok) {
    let message = `Download failed (${res.status})`;
    try { const b = await res.json(); if (typeof b?.message === 'string') message = b.message; } catch { /* not JSON */ }
    throw new Error(message);
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
