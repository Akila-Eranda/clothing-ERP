import { tokenStorage } from '@/lib/api';

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
