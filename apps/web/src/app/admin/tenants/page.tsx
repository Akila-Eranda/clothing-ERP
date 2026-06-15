'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Search, Plus, MoreHorizontal, RefreshCw, Trash2,
  ChevronLeft, ChevronRight, Building2, Users, CheckCircle,
  AlertCircle, Ban, Edit2, X, Check,
} from 'lucide-react'
import {
  fetchTenants, fetchPlatformStats, updateTenant, registerTenant, fetchPlans,
  plansForOnboarding, formatPlanLimit, DEFAULT_PLANS, STARTER_TRIAL_DAYS,
  type TenantRow, type PlatformStats, type PlanDef,
} from '@/lib/admin-api'
import { SHOP_TYPE_LIST, ShopType, getShopProfile } from '@/lib/shop-profiles'
import { getVerticalFeatures } from '@/lib/shop-features'
import { ShopFeatureList } from '@/components/shop/shop-feature-list'
import { toast } from 'sonner'

const STATUS_BADGE: Record<string, string> = {
  ACTIVE:    'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-50 text-green-700',
  SUSPENDED: 'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700',
  INACTIVE:  'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-500',
}
const PLAN_BADGE: Record<string, string> = {
  STARTER:      'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-600',
  PROFESSIONAL: 'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700',
  ENTERPRISE:   'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-50 text-purple-700',
}
function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('en-LK', { day: 'numeric', month: 'short', year: '2-digit' })
}
const PER_PAGE = 20

export default function TenantsPage() {
  const [tenants, setTenants]               = useState<TenantRow[]>([])
  const [total, setTotal]                   = useState(0)
  const [stats, setStats]                   = useState<PlatformStats | null>(null)
  const [loading, setLoading]               = useState(true)
  const [search, setSearch]                 = useState('')
  const [statusFilter, setStatusFilter]     = useState('ALL')
  const [planFilter, setPlanFilter]         = useState('ALL')
  const [page, setPage]                     = useState(1)
  const [menuOpen, setMenuOpen]             = useState<string | null>(null)
  const [editTenant, setEditTenant]         = useState<TenantRow | null>(null)
  const [showCreate, setShowCreate]         = useState(false)
  const [actionLoading, setActionLoading]   = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback((params: { search?: string; status?: string; plan?: string; page?: number } = {}) => {
    setLoading(true)
    const p: Record<string, string> = { page: String(params.page ?? page), limit: String(PER_PAGE) }
    const s = params.search  ?? search
    const st = params.status ?? statusFilter
    const pl = params.plan   ?? planFilter
    if (s)         p.search = s
    if (st !== 'ALL') p.status = st
    if (pl !== 'ALL') p.plan   = pl
    fetchTenants(p)
      .then(d => { setTenants(d.data); setTotal(d.total) })
      .catch((e: unknown) => { console.error(e) })
      .finally(() => setLoading(false))
  }, [search, statusFilter, planFilter, page])

  useEffect(() => {
    load()
    fetchPlatformStats().then(setStats).catch(() => {})
  }, [])

  function handleSearch(v: string) {
    setSearch(v); setPage(1)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => load({ search: v, page: 1 }), 350)
  }

  async function handleStatusToggle(t: TenantRow) {
    setActionLoading(t.id); setMenuOpen(null)
    const newStatus = t.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE'
    try { await updateTenant(t.id, { status: newStatus }); load() } catch { toast.error('Failed to update tenant status') }
    setActionLoading(null)
  }

  const totalPages = Math.ceil(total / PER_PAGE)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div>
          <h1 className="text-base font-bold text-gray-900">Tenants</h1>
          <p className="text-sm text-gray-500">{loading ? 'Loading…' : `${total.toLocaleString()} tenants`}</p>
        </div>
        <div className="sm:ml-auto flex gap-2">
          <button onClick={() => load()} disabled={loading} className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 bg-white text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-50">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 px-3 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800">
            <Plus size={14} />Onboard Tenant
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total',      value: stats?.totalTenants ?? '—',      icon: Building2,  color: 'text-gray-600',   bg: 'bg-gray-100'   },
          { label: 'Active',     value: stats?.activeTenants ?? '—',     icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50'   },
          { label: 'Suspended',  value: stats?.suspendedTenants ?? '—',  icon: AlertCircle,color: 'text-amber-600',  bg: 'bg-amber-50'   },
          { label: 'New Month',  value: stats?.newThisMonth ?? '—',      icon: Users,      color: 'text-blue-600',   bg: 'bg-blue-50'    },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl ${k.bg} flex items-center justify-center flex-shrink-0`}>
              <k.icon size={15} className={k.color} />
            </div>
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wide">{k.label}</p>
              <p className="text-xl font-bold text-gray-900 leading-none mt-0.5">{String(k.value)}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 flex-1 min-w-[200px]">
          <Search size={14} className="text-gray-400" />
          <input
            className="bg-transparent text-sm text-gray-700 placeholder-gray-400 outline-none flex-1"
            placeholder="Search name, subdomain, email…"
            value={search}
            onChange={e => handleSearch(e.target.value)}
          />
        </div>
        <select
          className="px-3 py-2 text-sm border border-gray-200 bg-white rounded-lg outline-none text-gray-700"
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1); load({ status: e.target.value, page: 1 }) }}
        >
          <option value="ALL">All Status</option>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
          <option value="INACTIVE">Inactive</option>
        </select>
        <select
          className="px-3 py-2 text-sm border border-gray-200 bg-white rounded-lg outline-none text-gray-700"
          value={planFilter}
          onChange={e => { setPlanFilter(e.target.value); setPage(1); load({ plan: e.target.value, page: 1 }) }}
        >
          <option value="ALL">All Plans</option>
          <option value="STARTER">Starter</option>
          <option value="PROFESSIONAL">Professional</option>
          <option value="ENTERPRISE">Enterprise</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Tenant','Type','Subdomain','Plan','Status','Users','Branches','Joined','Actions'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading && (
                <tr><td colSpan={9} className="px-4 py-12 text-center">
                  <RefreshCw size={18} className="animate-spin mx-auto text-gray-300" />
                </td></tr>
              )}
              {!loading && tenants.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-gray-400">No tenants match filters.</td></tr>
              )}
              {!loading && tenants.map(t => (
                <tr key={t.id} className={`hover:bg-gray-50 transition-colors ${actionLoading === t.id ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-gray-900 text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                        {t.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-gray-900">{t.name}</p>
                        <p className="text-[10px] text-gray-400">{t.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 text-xs text-gray-600">
                      <span>{getShopProfile(t.shopType).emoji}</span>
                      <span className="whitespace-nowrap">{getShopProfile(t.shopType).label.replace(' Shop', '')}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-gray-500">{t.subdomain}</td>
                  <td className="px-4 py-3"><span className={PLAN_BADGE[t.plan] ?? PLAN_BADGE.STARTER}>{t.plan}</span></td>
                  <td className="px-4 py-3"><span className={STATUS_BADGE[t.status] ?? STATUS_BADGE.INACTIVE}>{t.status}</span></td>
                  <td className="px-4 py-3 text-xs text-gray-600 text-center">{t._count?.users ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-600 text-center">{t._count?.branches ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{fmtDate(t.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="relative flex items-center justify-center gap-1">
                      <button
                        onClick={() => setEditTenant(t)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        onClick={() => setMenuOpen(menuOpen === t.id ? null : t.id)}
                        className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
                      >
                        <MoreHorizontal size={13} />
                      </button>
                      {menuOpen === t.id && (
                        <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-xl shadow-xl py-1 z-20">
                          <button
                            onClick={() => handleStatusToggle(t)}
                            className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 ${t.status === 'ACTIVE' ? 'text-amber-600' : 'text-green-600'}`}
                          >
                            <Ban size={13} />
                            {t.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}
                          </button>
                          <div className="border-t border-gray-100 mt-1 pt-1">
                            <button
                              onClick={() => { setMenuOpen(null) }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                            >
                              <Trash2 size={13} />Delete
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-500">
              Showing {((page - 1) * PER_PAGE + 1)}–{Math.min(page * PER_PAGE, total)} of {total}
            </p>
            <div className="flex items-center gap-1">
              <button onClick={() => { setPage(p => p - 1); load({ page: page - 1 }) }} disabled={page === 1}
                className="p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-30 rounded-lg hover:bg-gray-100">
                <ChevronLeft size={16} />
              </button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                const n = i + 1
                return (
                  <button key={n} onClick={() => { setPage(n); load({ page: n }) }}
                    className={`w-7 h-7 text-xs rounded-lg ${n === page ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                    {n}
                  </button>
                )
              })}
              <button onClick={() => { setPage(p => p + 1); load({ page: page + 1 }) }} disabled={page === totalPages}
                className="p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-30 rounded-lg hover:bg-gray-100">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {editTenant && <EditTenantModal tenant={editTenant} onClose={() => setEditTenant(null)} onSaved={load} />}
      {showCreate  && <OnboardTenantWizard onClose={() => setShowCreate(false)} onCreated={load} />}
    </div>
  )
}

function EditTenantModal({ tenant, onClose, onSaved }: { tenant: TenantRow; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ status: tenant.status, plan: tenant.plan, name: tenant.name })
  const [plans, setPlans] = useState<PlanDef[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchPlans()
      .then(list => {
        const opts = list.length > 0 ? list : DEFAULT_PLANS
        if (!opts.some(p => p.key === tenant.plan)) {
          setPlans([...opts, { id: tenant.plan.toLowerCase(), key: tenant.plan, name: tenant.plan, price: 0, currency: '', interval: 'mo', description: '', features: [], maxUsers: tenant.maxUsers ?? -1, maxBranches: tenant.maxBranches ?? -1 }])
        } else setPlans(opts)
      })
      .catch(() => setPlans(DEFAULT_PLANS))
  }, [tenant.plan, tenant.maxUsers, tenant.maxBranches])

  const selectedPlan = plans.find(p => p.key === form.plan)

  async function save() {
    setLoading(true); setError('')
    try { await updateTenant(tenant.id, form); onSaved(); onClose() }
    catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-sm font-bold text-gray-900">Edit Tenant — {tenant.name}</h3>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"><X size={16} /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
            <input className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-gray-900/10"
              value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Plan</label>
            <select className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none"
              value={form.plan} onChange={e => setForm({ ...form, plan: e.target.value })}>
              {plans.map(p => (
                <option key={p.key} value={p.key}>{p.name}</option>
              ))}
            </select>
            {selectedPlan && form.plan !== tenant.plan && (
              <p className="text-[10px] text-gray-500 mt-1">
                New limits: {formatPlanLimit(selectedPlan.maxUsers)} users, {formatPlanLimit(selectedPlan.maxBranches)} branches
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
            <select className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none"
              value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
              <option value="TRIAL">Trial</option>
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
        </div>
        {error && <p className="text-xs text-red-600 mt-3">{error}</p>}
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
          <button onClick={save} disabled={loading} className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50">
            {loading ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

function OnboardTenantWizard({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [step, setStep]                 = useState(1)
  const [showPass, setShowPass]         = useState(false)
  const [plans, setPlans]               = useState<PlanDef[]>(DEFAULT_PLANS)
  const [provisioning, setProvisioning] = useState(false)
  const [provDone, setProvDone]         = useState<string[]>([])
  const [error, setError]               = useState('')
  const [form, setForm]                 = useState({
    shopName: '', ownerName: '', email: '', phone: '', password: '',
    subdomain: '', plan: 'STARTER', currency: 'LKR', country: 'LK',
    shopType: ShopType.CLOTHING as ShopType,
  })
  const [provisionedPassword, setProvisionedPassword] = useState('')
  const [createdPlan, setCreatedPlan] = useState('')
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null)

  useEffect(() => {
    fetchPlans()
      .then(list => setPlans(plansForOnboarding(list)))
      .catch(() => setPlans(plansForOnboarding(DEFAULT_PLANS)))
  }, [])

  const selectedPlan = plans.find(p => p.key === form.plan) ?? plans[0]
  const selectedProfile = getShopProfile(form.shopType)

  function onShopName(v: string) {
    const slug = v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    setForm(f => ({ ...f, shopName: v, subdomain: slug }))
  }

  const canNext = !!(
    form.shopName.trim() &&
    form.ownerName.trim() &&
    form.email.trim() &&
    form.phone.trim() &&
    form.password.trim().length >= 8
  )

  const provItems = [
    { key: 'schema', label: 'PostgreSQL schema',          sub: `schema: ${form.subdomain || '—'}` },
    { key: 'realm',  label: 'Keycloak realm',             sub: `realm: ${form.subdomain || '—'}` },
    { key: 'roles',  label: 'Default roles & permissions', sub: 'Owner, Manager, Cashier, Technician' },
    { key: 'catalog', label: `${selectedProfile.label} setup`, sub: `${selectedProfile.defaultCategories.length} categories · variants: ${selectedProfile.variantAttributes.map(a => a.name).join(', ')}` },
    { key: 'dns',    label: 'DNS record (Cloudflare)',    sub: `${form.subdomain || '—'}.shop.hexalyte.com → server` },
    { key: 'ssl',    label: 'SSL certificate',            sub: 'HTTPS for tenant shop URL' },
    { key: 'email',  label: 'Welcome email',              sub: `to ${form.email || '—'}` },
  ]

  async function provision() {
    const pwd = form.password.trim()
    if (!pwd) {
      setError('Password is required.')
      return
    }
    if (pwd.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    setProvisioning(true); setError(''); setProvDone([])
    try {
      const result = await registerTenant({
        name: form.shopName, subdomain: form.subdomain, email: form.email,
        phone: form.phone || undefined, plan: form.plan, shopType: form.shopType,
        currency: form.currency, country: form.country, ownerName: form.ownerName,
        password: pwd,
      })
      setCreatedPlan(result.tenant?.plan ?? form.plan)
      setTrialEndsAt(result.tenant?.trialEndsAt ?? null)
      setProvisionedPassword(result.initialPassword)
      setForm(f => ({ ...f, password: result.initialPassword }))
      for (const item of provItems) {
        await new Promise<void>(r => setTimeout(r, 380))
        setProvDone(prev => [...prev, item.key])
      }
      setTimeout(() => { onCreated(); setStep(4) }, 300)
    } catch (e: unknown) { setError((e as Error).message || 'Provisioning failed') }
    finally { setProvisioning(false) }
  }

  const STEP_LABELS = ['Shop Details', 'Plan', 'Provisioning', 'Done']
  const circ = (n: number) =>
    `w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-colors ${step >= n ? 'bg-indigo-600 text-white' : 'bg-white/10 text-white/30'}`
  const line = (n: number) =>
    `flex-1 h-0.5 mx-1 transition-colors ${step > n ? 'bg-indigo-600' : 'bg-white/10'}`
  const inp = 'w-full px-4 py-2 text-sm rounded-xl outline-none text-white placeholder:text-white/30 bg-white/5 border border-white/10 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30'

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="rounded-2xl w-full max-w-[820px] max-h-[92vh] flex flex-col shadow-2xl overflow-hidden" style={{background:'#0f172a',border:'1px solid rgba(255,255,255,0.08)'}}>

        {/* Step progress */}
        <div className="px-6 pt-5 pb-4 shrink-0" style={{borderBottom:'1px solid rgba(255,255,255,0.07)'}}>
          <div className="flex items-center">
            <div className={circ(1)}>{step > 1 ? <Check size={13}/> : 1}</div>
            <div className={line(1)}/>
            <div className={circ(2)}>{step > 2 ? <Check size={13}/> : 2}</div>
            <div className={line(2)}/>
            <div className={circ(3)}>{step > 3 ? <Check size={13}/> : 3}</div>
            <div className={line(3)}/>
            <div className={circ(4)}>4</div>
            <span className="text-sm font-semibold ml-3 shrink-0" style={{color:'rgba(255,255,255,0.7)'}}>{STEP_LABELS[step - 1]}</span>
          </div>
        </div>

        <div className="px-6 py-5 overflow-y-auto min-h-0">

          {/* ── Step 1: Shop Details ── */}
          {step === 1 && (
            <div className="space-y-3">
              <h3 className="text-base font-bold text-white">Shop Details</h3>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{color:'rgba(255,255,255,0.6)'}}>Business Type *</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {SHOP_TYPE_LIST.map((p) => (
                    <button
                      key={p.type}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, shopType: p.type }))}
                      className="rounded-xl p-2.5 text-left transition-all"
                      style={form.shopType === p.type
                        ? { border: '2px solid #4f46e5', background: 'rgba(79,70,229,0.12)' }
                        : { border: '2px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}
                    >
                      <span className="text-base">{p.emoji}</span>
                      <p className="text-xs font-semibold text-white mt-0.5 leading-tight">{p.label}</p>
                      <p className="text-[9px] mt-0.5 leading-tight line-clamp-1" style={{color:'rgba(255,255,255,0.4)'}}>{p.labelSi}</p>
                    </button>
                  ))}
                </div>
                <div className="rounded-xl px-3 py-2 mt-2" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <p className="text-[10px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'rgba(255,255,255,0.45)' }}>
                    {selectedProfile.label} features
                  </p>
                  <ShopFeatureList
                    features={getVerticalFeatures(form.shopType)}
                    compact
                    variant="on-dark"
                    showComingSoon={false}
                    className="grid grid-cols-2 gap-x-4 gap-y-1 space-y-0"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1" style={{color:'rgba(255,255,255,0.6)'}}>Shop Name</label>
                  <input className={inp} placeholder="e.g. Fashion Hub" value={form.shopName} onChange={e => onShopName(e.target.value)}/>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{color:'rgba(255,255,255,0.6)'}}>Owner Name</label>
                  <input className={inp} placeholder="e.g. Kamal Perera" value={form.ownerName} onChange={e => setForm(f => ({...f, ownerName: e.target.value}))}/>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium mb-1" style={{color:'rgba(255,255,255,0.6)'}}>Shop URL (Subdomain)</label>
                  <div className="flex items-center rounded-xl overflow-hidden" style={{border:'1px solid rgba(255,255,255,0.1)',background:'rgba(255,255,255,0.05)'}}>
                    <input
                      className="flex-1 px-4 py-2 text-sm bg-transparent outline-none text-white placeholder:text-white/30"
                      placeholder="fashion-hub"
                      value={form.subdomain}
                      onChange={e => setForm(f => ({...f, subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,'').replace(/^-|-$/g,'')}))}
                    />
                    <span className="px-3 py-2 text-sm shrink-0 select-none" style={{color:'rgba(255,255,255,0.35)',borderLeft:'1px solid rgba(255,255,255,0.08)'}}>
                      .shop.hexalyte.com
                    </span>
                  </div>
                  {form.subdomain && (
                    <p className="mt-1 text-xs" style={{color:'rgba(99,102,241,0.9)'}}>
                      🔗 https://{form.subdomain}.shop.hexalyte.com
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{color:'rgba(255,255,255,0.6)'}}>Email</label>
                  <input type="email" className={inp} placeholder="owner@shop.com" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))}/>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{color:'rgba(255,255,255,0.6)'}}>Phone</label>
                  <input className={inp} placeholder="+94771234567" value={form.phone} onChange={e => setForm(f => ({...f, phone: e.target.value}))}/>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium mb-1" style={{color:'rgba(255,255,255,0.6)'}}>
                    Password <span className="font-normal" style={{color:'rgba(255,255,255,0.3)'}}>(required, min 8 characters)</span>
                  </label>
                  <div className="relative max-w-md">
                    <input type={showPass ? 'text' : 'password'} className={inp + ' pr-14 py-2'} placeholder="Min 8 characters" value={form.password} onChange={e => setForm(f => ({...f, password: e.target.value}))}/>
                    <button type="button" onClick={() => setShowPass(s => !s)} className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-medium" style={{color:'rgba(255,255,255,0.4)'}}>{showPass ? 'Hide' : 'Show'}</button>
                  </div>
                </div>
              </div>
              <div className="flex justify-between pt-1">
                <button onClick={onClose} className="px-5 py-2.5 text-sm rounded-xl transition-colors" style={{border:'1px solid rgba(255,255,255,0.12)',color:'rgba(255,255,255,0.6)'}}>Cancel</button>
                <button onClick={() => setStep(2)} disabled={!canNext} className="px-5 py-2.5 text-sm font-semibold text-white rounded-xl transition-colors disabled:opacity-40" style={{background:'#4f46e5'}}>Next →</button>
              </div>
            </div>
          )}

          {/* ── Step 2: Plan ── */}
          {step === 2 && (
            <div className="space-y-4">
              <h3 className="text-base font-bold text-white">Select Plan</h3>
              <p className="text-xs" style={{color:'rgba(255,255,255,0.45)'}}>
                Starter includes a <strong className="text-white">{STARTER_TRIAL_DAYS}-day free trial</strong>. Paid plans activate immediately.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {plans.map(p => (
                  <label key={p.key} className="flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all" style={form.plan === p.key ? {border:'2px solid #4f46e5',background:'rgba(79,70,229,0.1)'} : {border:'2px solid rgba(255,255,255,0.08)',background:'rgba(255,255,255,0.03)'}}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0" style={{borderColor: form.plan === p.key ? '#4f46e5' : 'rgba(255,255,255,0.2)'}}>
                        {form.plan === p.key && <div className="w-2 h-2 rounded-full" style={{background:'#4f46e5'}}/>}
                      </div>
                      <input type="radio" name="plan" value={p.key} checked={form.plan === p.key} onChange={() => setForm(f => ({...f, plan: p.key}))} className="sr-only"/>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white">{p.name}</p>
                        <p className="text-xs mt-0.5" style={{color:'rgba(255,255,255,0.4)'}}>{p.description}</p>
                        <p className="text-[10px] mt-1" style={{color:'rgba(99,102,241,0.85)'}}>
                          {formatPlanLimit(p.maxUsers)} users · {formatPlanLimit(p.maxBranches)} branches
                        </p>
                      </div>
                    </div>
                    <span className="text-sm font-bold shrink-0 ml-4 text-white">{p.currency}{p.price.toLocaleString()}/{p.interval}</span>
                  </label>
                ))}
              </div>
              <div className="flex justify-between pt-2">
                <button onClick={() => setStep(1)} className="px-5 py-2.5 text-sm rounded-xl" style={{border:'1px solid rgba(255,255,255,0.12)',color:'rgba(255,255,255,0.6)'}}>← Back</button>
                <button onClick={() => setStep(3)} className="px-5 py-2.5 text-sm font-semibold text-white rounded-xl" style={{background:'#4f46e5'}}>Next →</button>
              </div>
            </div>
          )}

          {/* ── Step 3: Provisioning ── */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-bold text-white">Auto-Provisioning</h3>
                <p className="text-sm mt-0.5" style={{color:'rgba(255,255,255,0.4)'}}>The following will be created automatically:</p>
              </div>
              {selectedPlan && (
                <div className="px-3 py-2.5 rounded-xl text-xs" style={{background:'rgba(79,70,229,0.12)',border:'1px solid rgba(79,70,229,0.25)',color:'rgba(255,255,255,0.75)'}}>
                  {selectedProfile.emoji} <strong className="text-white">{selectedProfile.label}</strong>
                  {' · '}Plan: <strong className="text-white">{selectedPlan.name}</strong>
                  {' · '}{formatPlanLimit(selectedPlan.maxUsers)} users
                  {' · '}{formatPlanLimit(selectedPlan.maxBranches)} branches
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {provItems.map(item => (
                  <div key={item.key} className="flex items-center gap-3 p-3 rounded-xl transition-all duration-300" style={provDone.includes(item.key) ? {border:'1px solid rgba(16,185,129,0.3)',background:'rgba(16,185,129,0.08)'} : {border:'1px solid rgba(255,255,255,0.07)',background:'rgba(255,255,255,0.03)'}}>
                    <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all" style={provDone.includes(item.key) ? {background:'#10b981'} : {background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)'}}>
                      {provDone.includes(item.key) ? <Check size={13} className="text-white"/> : <div className="w-2 h-2 rounded-full" style={{background:'rgba(255,255,255,0.2)'}}/>}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{item.label}</p>
                      <p className="text-xs" style={{color:'rgba(255,255,255,0.4)'}}>{item.sub}</p>
                    </div>
                  </div>
                ))}
              </div>
              {error && <p className="text-xs px-3 py-2 rounded-lg" style={{color:'#f87171',background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.2)'}}>{error}</p>}
              <div className="flex justify-between pt-2">
                <button onClick={() => setStep(2)} disabled={provisioning} className="px-5 py-2.5 text-sm rounded-xl disabled:opacity-50" style={{border:'1px solid rgba(255,255,255,0.12)',color:'rgba(255,255,255,0.6)'}}>← Back</button>
                <button onClick={provision} disabled={provisioning} className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white rounded-xl disabled:opacity-70" style={{background:'#4f46e5'}}>
                  {provisioning ? <><RefreshCw size={13} className="animate-spin"/>Provisioning…</> : 'Provision Tenant'}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 4: Done ── */}
          {step === 4 && (
            <div className="text-center py-6">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{background:'rgba(16,185,129,0.15)'}}>
                <CheckCircle size={28} style={{color:'#10b981'}}/>
              </div>
              <h3 className="text-base font-bold text-white mb-1">Tenant Provisioned!</h3>
              <p className="text-sm mb-4" style={{color:'rgba(255,255,255,0.5)'}}><strong className="text-white">{form.shopName}</strong> is live.</p>
              <div className="text-left rounded-xl p-4 space-y-2.5 mb-4" style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.1)'}}>
                <p className="text-xs font-semibold uppercase tracking-wide" style={{color:'rgba(255,255,255,0.45)'}}>Login credentials — save these now</p>
                <div>
                  <p className="text-xs" style={{color:'rgba(255,255,255,0.4)'}}>Business Type</p>
                  <p className="text-sm font-semibold text-white">{selectedProfile.emoji} {selectedProfile.label}</p>
                </div>
                <div>
                  <p className="text-xs" style={{color:'rgba(255,255,255,0.4)'}}>Shop URL</p>
                  <p className="text-sm font-mono text-indigo-300">https://{form.subdomain}.shop.hexalyte.com</p>
                </div>
                <div>
                  <p className="text-xs" style={{color:'rgba(255,255,255,0.4)'}}>Email</p>
                  <p className="text-sm font-mono text-white">{form.email.trim().toLowerCase()}</p>
                </div>
                <div>
                  <p className="text-xs" style={{color:'rgba(255,255,255,0.4)'}}>Password</p>
                  <p className="text-sm font-mono text-white break-all">{provisionedPassword || form.password}</p>
                </div>
                <div>
                  <p className="text-xs" style={{color:'rgba(255,255,255,0.4)'}}>Plan</p>
                  <p className="text-sm font-semibold text-white">
                    {plans.find(p => p.key === (createdPlan || form.plan))?.name ?? (createdPlan || form.plan)}
                  </p>
                  {(createdPlan || form.plan) === 'STARTER' && trialEndsAt && (
                    <p className="text-[11px] mt-1" style={{color:'rgba(251,191,36,0.95)'}}>
                      Trial ends {new Date(trialEndsAt).toLocaleDateString('en-LK', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  )}
                </div>
              </div>
              <p className="text-xs mb-4" style={{color:'rgba(251,191,36,0.9)'}}>HTTPS is provisioned automatically (DNS + SSL). If the shop URL shows a certificate warning, wait 2–3 minutes and refresh.</p>
              <button onClick={onClose} className="px-6 py-2.5 text-sm font-semibold text-white rounded-xl" style={{background:'#4f46e5'}}>Done</button>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
