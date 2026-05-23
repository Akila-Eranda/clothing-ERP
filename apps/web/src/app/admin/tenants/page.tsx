'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Search, Plus, MoreHorizontal, RefreshCw, Trash2,
  ChevronLeft, ChevronRight, Building2, Users, CheckCircle,
  AlertCircle, Ban, Edit2, X,
} from 'lucide-react'
import { fetchTenants, fetchPlatformStats, updateTenant, registerTenant, type TenantRow, type PlatformStats } from '@/lib/admin-api'

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
  return new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })
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
      .catch(() => {})
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
    try { await updateTenant(t.id, { status: newStatus }); load() } catch {}
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
            <Plus size={14} />Add Tenant
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
                {['Tenant','Subdomain','Plan','Status','Users','Branches','Joined','Actions'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading && (
                <tr><td colSpan={8} className="px-4 py-12 text-center">
                  <RefreshCw size={18} className="animate-spin mx-auto text-gray-300" />
                </td></tr>
              )}
              {!loading && tenants.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-400">No tenants match filters.</td></tr>
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
      {showCreate  && <CreateTenantModal onClose={() => setShowCreate(false)} onCreated={load} />}
    </div>
  )
}

function EditTenantModal({ tenant, onClose, onSaved }: { tenant: TenantRow; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ status: tenant.status, plan: tenant.plan, name: tenant.name })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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
              <option value="STARTER">Starter</option>
              <option value="PROFESSIONAL">Professional</option>
              <option value="ENTERPRISE">Enterprise</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
            <select className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none"
              value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="INACTIVE">Inactive</option>
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

function CreateTenantModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ name: '', subdomain: '', email: '', phone: '', plan: 'STARTER', currency: 'LKR', country: 'LK' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function create() {
    setLoading(true); setError('')
    try {
      await registerTenant(form)
      setDone(true)
      onCreated()
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-sm font-bold text-gray-900">{done ? 'Tenant Created!' : 'Create New Tenant'}</h3>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"><X size={16} /></button>
        </div>
        {done ? (
          <div className="text-center py-6">
            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={24} className="text-green-600" />
            </div>
            <p className="text-sm text-gray-600">Tenant <strong>{form.name}</strong> has been created.</p>
            <button onClick={onClose} className="mt-5 px-6 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800">Done</button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Shop Name', key: 'name', placeholder: 'Fashion Hub' },
                { label: 'Subdomain', key: 'subdomain', placeholder: 'fashion-hub' },
                { label: 'Email', key: 'email', placeholder: 'owner@shop.com' },
                { label: 'Phone', key: 'phone', placeholder: '+94771234567' },
                { label: 'Currency', key: 'currency', placeholder: 'LKR' },
                { label: 'Country', key: 'country', placeholder: 'LK' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{f.label}</label>
                  <input
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-gray-900/10"
                    placeholder={f.placeholder}
                    value={(form as any)[f.key]}
                    onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                  />
                </div>
              ))}
            </div>
            <div className="mt-4">
              <label className="block text-xs font-medium text-gray-700 mb-1">Plan</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'STARTER', label: 'Starter', desc: 'Basic POS' },
                  { id: 'PROFESSIONAL', label: 'Professional', desc: 'Advanced features' },
                  { id: 'ENTERPRISE', label: 'Enterprise', desc: 'Unlimited' },
                ].map(p => (
                  <label key={p.id} className={`flex flex-col p-3 rounded-xl border-2 cursor-pointer transition-all text-center ${form.plan === p.id ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <input type="radio" name="plan" value={p.id} checked={form.plan === p.id} onChange={() => setForm({ ...form, plan: p.id })} className="sr-only" />
                    <span className="text-xs font-semibold text-gray-900">{p.label}</span>
                    <span className="text-[10px] text-gray-400 mt-0.5">{p.desc}</span>
                  </label>
                ))}
              </div>
            </div>
            {error && <p className="text-xs text-red-600 mt-3">{error}</p>}
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={create} disabled={loading || !form.name || !form.subdomain || !form.email} className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-40">
                {loading ? 'Creating…' : 'Create Tenant'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
