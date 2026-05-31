const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1'
const API_ROOT = API_BASE.replace(/\/api\/v1\/?$/, '/api')

const TOKEN_KEY = 'fashionerp_admin_token'
const TENANT_KEY = 'fashionerp_admin_tenant'
const ROLES_KEY = 'fashionerp_admin_roles'

function parseRolesFromToken(token: string): string[] {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    const roles = payload.roles
    return Array.isArray(roles) ? roles.map(String) : []
  } catch {
    return []
  }
}

export const adminAuth = {
  getToken: () => (typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null),
  getTenantId: () => (typeof window !== 'undefined' ? localStorage.getItem(TENANT_KEY) : null),
  getRoles: (): string[] => {
    if (typeof window === 'undefined') return []
    const stored = localStorage.getItem(ROLES_KEY)
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as unknown
        if (Array.isArray(parsed)) return parsed.map(String)
      } catch {
        /* fall through */
      }
    }
    const token = localStorage.getItem(TOKEN_KEY)
    return token ? parseRolesFromToken(token) : []
  },
  isSuperAdmin: (): boolean => adminAuth.getRoles().includes('SUPER_ADMIN'),
  setSession: (token: string, tenantSlug: string, roles: string[]) => {
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(TENANT_KEY, tenantSlug)
    localStorage.setItem(ROLES_KEY, JSON.stringify(roles))
    document.cookie = `admin_token=${token}; path=/; max-age=${60 * 60 * 8}; SameSite=Strict`
  },
  clear: () => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(TENANT_KEY)
    localStorage.removeItem(ROLES_KEY)
    document.cookie = 'admin_token=; path=/; max-age=0'
  },
}

function unwrap<T>(json: unknown): T {
  if (json && typeof json === 'object' && 'data' in json && (json as { success?: boolean }).success !== false) {
    return (json as { data: T }).data
  }
  return json as T
}

async function req<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = adminAuth.getToken()
  const tenantSlug = adminAuth.getTenantId()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (tenantSlug) headers['x-tenant-id'] = tenantSlug

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers })
  const json = await res.json().catch(() => ({}))

  if (res.status === 401) {
    adminAuth.clear()
    if (typeof window !== 'undefined') window.location.href = '/admin/login'
    throw new Error('Session expired')
  }

  if (!res.ok) {
    const msg = (json as { message?: string })?.message || 'Request failed'
    throw new Error(msg)
  }

  return unwrap<T>(json)
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
  maxUsers?: number
  maxBranches?: number
  maxProducts?: number
  trialEndsAt?: string | null
  createdAt: string
  updatedAt: string
  _count?: { users: number; branches: number }
}

export interface UserRow {
  id: string
  firstName: string | null
  lastName: string | null
  email: string
  status: string
  gender?: string
  createdAt: string
  tenant?: { id: string; name: string; plan: string; subdomain?: string }
  roles?: { role: { name: string; type: string } }[]
}

export interface AuditLogRow {
  id: string
  action: string
  resource: string
  resourceId?: string | null
  createdAt: string
  tenant?: { id: string; name: string; subdomain: string }
  user?: { id: string; firstName: string | null; lastName: string | null; email: string } | null
}

export interface HealthData {
  status: string
  uptime?: number
  services?: { database?: string; api?: string }
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
  maxProducts?: number
  tenantCount?: number
}

export const STARTER_TRIAL_DAYS = 14

export const DEFAULT_PLANS: PlanDef[] = [
  {
    id: 'starter',
    key: 'STARTER',
    name: 'Starter',
    price: 1199,
    currency: 'Rs.',
    interval: 'mo',
    description: '14-day free trial, then Rs.1,199/mo',
    features: ['14-day free trial', '3 Users', '1 Branch', 'Basic POS', 'Inventory'],
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
    description: '10 users, 3 branches, analytics',
    features: ['10 Users', '3 Branches', 'Analytics', 'HR module'],
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
    description: 'Unlimited users, API access',
    features: ['Unlimited Users', 'Unlimited Branches', 'API Access', 'White-label'],
    maxUsers: -1,
    maxBranches: -1,
  },
  {
    id: 'custom',
    key: 'CUSTOM',
    name: 'Custom',
    price: 0,
    currency: 'Rs.',
    interval: 'mo',
    description: 'Negotiated limits per tenant',
    features: ['Custom limits', 'Dedicated support'],
    maxUsers: -1,
    maxBranches: -1,
  },
]

export async function fetchPlans(): Promise<PlanDef[]> {
  try {
    const rows = await req<PlanDef[]>('/tenants/subscription-plans')
    if (Array.isArray(rows) && rows.length > 0) {
      return rows.map((p) => ({
        ...p,
        key: String(p.key),
        features: Array.isArray(p.features) ? p.features : [],
      }))
    }
  } catch {
    /* fallback when API unavailable */
  }
  return DEFAULT_PLANS
}

export async function updatePlanCatalog(key: string, data: Partial<PlanDef>): Promise<PlanDef> {
  return req<PlanDef>(`/tenants/subscription-plans/${key}`, {
    method: 'PUT',
    body: JSON.stringify({
      name: data.name,
      price: data.price,
      currency: data.currency,
      interval: data.interval,
      description: data.description,
      features: data.features,
      maxUsers: data.maxUsers,
      maxBranches: data.maxBranches,
      maxProducts: data.maxProducts,
    }),
  })
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export async function adminLogin(email: string, password: string, tenantSlug: string) {
  const res = await fetch(`${API_BASE}/auth/platform-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantSlug },
    body: JSON.stringify({ email, password }),
  })
  const json = await res.json()
  if (!res.ok) {
    const msg = (json as { message?: string })?.message || 'Login failed'
    throw new Error(msg)
  }
  const data = unwrap<{ accessToken: string; user: { roles: string[] } }>(json)
  if (!data.accessToken) throw new Error('No token received')
  const roles: string[] = data.user?.roles ?? parseRolesFromToken(data.accessToken)
  if (!roles.includes('SUPER_ADMIN')) {
    throw new Error('This account does not have Super Admin access to the platform console.')
  }
  adminAuth.setSession(data.accessToken, tenantSlug, roles)
  return data
}

// ── Tenants ───────────────────────────────────────────────────────────────────
export async function fetchTenants(params?: Record<string, string>) {
  const page = params?.page ? parseInt(params.page, 10) : 1
  const limit = params?.limit ? parseInt(params.limit, 10) : 500
  const filterQs = new URLSearchParams()
  if (params?.search) filterQs.set('search', params.search)
  if (params?.status) filterQs.set('status', params.status)
  if (params?.plan) filterQs.set('plan', params.plan)
  const qs = filterQs.toString()
  const arr = await req<TenantRow[]>(`/tenants${qs ? `?${qs}` : ''}`)
  const list = Array.isArray(arr) ? arr : []
  const start = (page - 1) * limit
  return {
    data: list.slice(start, start + limit),
    total: list.length,
    page,
    limit,
  }
}

export async function fetchTenant(id: string) {
  return req<TenantRow>(`/tenants/${id}`)
}

export async function updateTenant(
  id: string,
  data: { name?: string; status?: string; plan?: string },
) {
  return req<TenantRow>(`/tenants/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export interface RegisterTenantResult {
  tenant: TenantRow
  branch: { id: string; name: string }
  adminUser: { id: string; email: string; firstName: string; lastName: string }
  initialPassword: string
}

const ONBOARD_PLAN_KEYS = ['STARTER', 'PROFESSIONAL', 'ENTERPRISE'] as const

export function plansForOnboarding(plans: PlanDef[]): PlanDef[] {
  const filtered = plans.filter(p => ONBOARD_PLAN_KEYS.includes(p.key as (typeof ONBOARD_PLAN_KEYS)[number]))
  return filtered.length > 0 ? filtered : DEFAULT_PLANS.filter(p => ONBOARD_PLAN_KEYS.includes(p.key as (typeof ONBOARD_PLAN_KEYS)[number]))
}

export function formatPlanLimit(n?: number): string {
  if (n === undefined || n === null) return '—'
  if (n < 0 || n >= 999_999) return 'Unlimited'
  return String(n)
}

export async function registerTenant(data: {
  name: string
  subdomain: string
  email: string
  phone?: string
  plan: string
  currency?: string
  country?: string
  timezone?: string
  ownerName?: string
  password: string
}) {
  const pwd = data.password.trim()
  if (!pwd || pwd.length < 8) {
    throw new Error('Password is required and must be at least 8 characters')
  }
  const [firstName, ...rest] = (data.ownerName ?? '').trim().split(' ')
  const payload: Record<string, string> = {
    companyName:    data.name,
    subdomain:      data.subdomain,
    adminEmail:     data.email.trim().toLowerCase(),
    adminPassword:  pwd,
    adminFirstName: firstName || data.name,
    adminLastName:  rest.join(' ') || '-',
    plan:           data.plan,
  }
  if (data.phone) payload.phone = data.phone
  if (data.currency) payload.currency = data.currency
  if (data.country) payload.country = data.country
  if (data.timezone) payload.timezone = data.timezone

  const token = adminAuth.getToken()
  const tenantSlug = adminAuth.getTenantId()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (tenantSlug) headers['x-tenant-id'] = tenantSlug

  const res = await fetch(`${API_BASE}/tenants/register`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = (json as { message?: string })?.message || 'Registration failed'
    throw new Error(msg)
  }
  return unwrap<RegisterTenantResult>(json)
}

// ── Users (platform-wide) ─────────────────────────────────────────────────────
export async function fetchUsers(params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params) : ''
  const result = await req<{
    data: UserRow[]
    meta?: { total: number; page: number; limit: number }
    total?: number
  }>(`/users/platform${qs}`)
  return {
    data: result.data ?? [],
    total: result.meta?.total ?? result.total ?? 0,
    page: result.meta?.page ?? 1,
    limit: result.meta?.limit ?? 20,
  }
}

export async function updateUserStatus(id: string, status: string) {
  return req<UserRow>(`/users/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
}

export async function deleteUser(id: string) {
  await req<null>(`/users/${id}`, { method: 'DELETE' })
}

// ── Audit logs (platform) ───────────────────────────────────────────────────────
export async function fetchPlatformAuditLogs(params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params) : ''
  const result = await req<{
    data: AuditLogRow[]
    meta?: { total: number }
    total?: number
  }>(`/audit-logs/platform${qs}`)
  return {
    data: result.data ?? [],
    total: result.meta?.total ?? result.total ?? 0,
  }
}

// ── Health (public, no version prefix) ──────────────────────────────────────────
export async function fetchHealth(): Promise<HealthData> {
  const res = await fetch(`${API_ROOT}/health`)
  const json = await res.json().catch(() => ({}))
  const data = unwrap<{
    status: string
    uptime?: number
    services?: { database?: string; api?: string }
  }>(json)
  const dbOk = data.services?.database === 'healthy'
  return {
    status: data.status,
    uptime: data.uptime,
    services: data.services,
    info: {
      database: { status: dbOk ? 'up' : 'down' },
      redis: { status: data.status === 'ok' ? 'up' : 'down' },
    },
  }
}

// ── Dashboard Stats (derived) ─────────────────────────────────────────────────
export async function fetchPlatformStats(): Promise<PlatformStats> {
  const res = await fetchTenants()
  const tenants = res.data
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const planBreakdown = ['STARTER', 'PROFESSIONAL', 'ENTERPRISE', 'CUSTOM'].map(plan => ({
    plan,
    count: tenants.filter(t => t.plan === plan).length,
  }))

  return {
    totalTenants: tenants.length,
    activeTenants: tenants.filter(t => t.status === 'ACTIVE').length,
    suspendedTenants: tenants.filter(t => t.status === 'SUSPENDED').length,
    totalUsers: tenants.reduce((s, t) => s + (t._count?.users ?? 0), 0),
    newThisMonth: tenants.filter(t => new Date(t.createdAt) >= monthStart).length,
    planBreakdown,
  }
}
