const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1'

const TOKEN_KEY = 'fashionerp_admin_token'
const TENANT_KEY = 'fashionerp_admin_tenant'

export const adminAuth = {
  getToken: () => (typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null),
  getTenantId: () => (typeof window !== 'undefined' ? localStorage.getItem(TENANT_KEY) : null),
  setSession: (token: string, tenantId: string) => {
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(TENANT_KEY, tenantId)
    document.cookie = `admin_token=${token}; path=/; max-age=${60 * 60 * 8}; SameSite=Strict`
  },
  clear: () => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(TENANT_KEY)
    document.cookie = 'admin_token=; path=/; max-age=0'
  },
}

async function req<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = adminAuth.getToken()
  const tenantId = adminAuth.getTenantId()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (tenantId) headers['x-tenant-id'] = tenantId

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers })

  if (res.status === 401) {
    adminAuth.clear()
    if (typeof window !== 'undefined') window.location.href = '/admin/login'
    throw new Error('Session expired')
  }

  const json = await res.json()
  if (!res.ok) throw new Error(json.message || 'Request failed')
  return json.data ?? json
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface TenantRow {
  id: string
  name: string
  subdomain: string
  email: string
  phone?: string
  plan: string
  status: string
  currency: string
  country: string
  timezone: string
  createdAt: string
  updatedAt: string
  _count?: { users: number; branches: number }
}

export interface UserRow {
  id: string
  firstName: string
  lastName: string
  email: string
  status: string
  gender?: string
  createdAt: string
  tenant?: { id: string; name: string; plan: string }
  roles?: { role: { name: string; type: string } }[]
}

export interface HealthData {
  status: string
  info?: {
    database?: { status: string }
    redis?: { status: string }
  }
}

export interface PlatformStats {
  totalTenants: number
  activeTenants: number
  suspendedTenants: number
  totalUsers: number
  newThisMonth: number
  planBreakdown: { plan: string; count: number }[]
}

export interface PlanDef {
  id: string
  key: string
  name: string
  price: number
  currency: string
  interval: string
  description: string
  features: string[]
  maxUsers: number
  maxBranches: number
}

export const DEFAULT_PLANS: PlanDef[] = [
  {
    id: 'starter',
    key: 'STARTER',
    name: 'Starter',
    price: 1199,
    currency: 'Rs.',
    interval: 'mo',
    description: '3 users, 1 branch, basic POS + repairs',
    features: ['3 Users', '1 Branch', 'Basic POS', 'Inventory', 'Repairs module'],
    maxUsers: 3,
    maxBranches: 1,
  },
  {
    id: 'professional',
    key: 'PROFESSIONAL',
    name: 'Pro',
    price: 4799,
    currency: 'Rs.',
    interval: 'mo',
    description: '10 users, 3 branches, analytics, warranties',
    features: ['10 Users', '3 Branches', 'Analytics', 'Warranties', 'HR module'],
    maxUsers: 10,
    maxBranches: 3,
  },
  {
    id: 'enterprise',
    key: 'ENTERPRISE',
    name: 'Enterprise',
    price: 14399,
    currency: 'Rs.',
    interval: 'mo',
    description: 'Unlimited users, API access, white-label',
    features: ['Unlimited Users', 'Unlimited Branches', 'API Access', 'White-label', 'Custom Domain'],
    maxUsers: -1,
    maxBranches: -1,
  },
]

export async function fetchPlans(): Promise<PlanDef[]> {
  try {
    return await req<PlanDef[]>('/admin/plans')
  } catch {
    return DEFAULT_PLANS
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export async function adminLogin(email: string, password: string, tenantSlug: string) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantSlug },
    body: JSON.stringify({ email, password }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.message || 'Login failed')
  const data = json.data ?? json
  if (!data.accessToken) throw new Error('No token received')
  adminAuth.setSession(data.accessToken, tenantSlug)
  return data
}

// ── Tenants ───────────────────────────────────────────────────────────────────
export async function fetchTenants(params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params) : ''
  return req<{ data: TenantRow[]; total: number; page: number; limit: number }>(`/tenants${qs}`)
}

export async function fetchTenant(id: string) {
  return req<TenantRow>(`/tenants/${id}`)
}

export async function updateTenant(id: string, data: Partial<TenantRow>) {
  return req<TenantRow>(`/tenants/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export async function registerTenant(data: {
  name: string; subdomain: string; email: string; phone?: string
  plan: string; currency?: string; country?: string; timezone?: string
  ownerName?: string; password?: string
}) {
  return req<{ tenant: TenantRow }>('/tenants/register', { method: 'POST', body: JSON.stringify(data) })
}

// ── Users ─────────────────────────────────────────────────────────────────────
export async function fetchUsers(params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params) : ''
  return req<{ data: UserRow[]; total: number }>(`/users${qs}`)
}

export async function updateUserStatus(id: string, status: string) {
  return req<UserRow>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) })
}

export async function deleteUser(id: string) {
  return req<null>(`/users/${id}`, { method: 'DELETE' })
}

// ── Health ────────────────────────────────────────────────────────────────────
export async function fetchHealth() {
  return req<HealthData>('/health')
}

// ── Roles ─────────────────────────────────────────────────────────────────────
export async function fetchRoles() {
  return req<{ data: { id: string; name: string; type: string; isSystem: boolean; _count: { users: number } }[] }>('/roles')
}

// ── Branches ──────────────────────────────────────────────────────────────────
export async function fetchBranches() {
  return req<{ data: { id: string; name: string; code: string; isDefault: boolean; isActive: boolean }[] }>('/branches')
}

// ── Dashboard Stats (derived) ─────────────────────────────────────────────────
export async function fetchPlatformStats(): Promise<PlatformStats> {
  const res = await fetchTenants({ limit: '500' })
  const tenants = res.data
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const planBreakdown = ['STARTER', 'PROFESSIONAL', 'ENTERPRISE'].map(plan => ({
    plan,
    count: tenants.filter(t => t.plan === plan).length,
  }))

  return {
    totalTenants: res.total,
    activeTenants: tenants.filter(t => t.status === 'ACTIVE').length,
    suspendedTenants: tenants.filter(t => t.status === 'SUSPENDED').length,
    totalUsers: tenants.reduce((s, t) => s + (t._count?.users ?? 0), 0),
    newThisMonth: tenants.filter(t => new Date(t.createdAt) >= monthStart).length,
    planBreakdown,
  }
}
