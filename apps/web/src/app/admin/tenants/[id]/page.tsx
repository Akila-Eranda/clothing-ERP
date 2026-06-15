'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Building2, Users, CreditCard, Shield, ScrollText,
  ExternalLink, RefreshCw, Ban, CheckCircle, Edit2, Save, X,
  Globe, Mail, Phone, MapPin, Clock, Loader2, FileText,
} from 'lucide-react'
import { toast } from 'sonner'
import SubscriptionInvoiceModal from '@/components/admin/SubscriptionInvoiceModal'
import {
  fetchTenant, fetchTenantUsers, fetchPlans, updateTenant, provisionTenantSsl,
  fetchPlatformAuditLogs, formatPlanLimit, type TenantRow, type UserRow, type PlanDef,
  type AuditLogRow,
} from '@/lib/admin-api'
import { getShopProfile } from '@/lib/shop-profiles'
import { tenantLoginUrl, SHOP_DOMAIN_SUFFIX } from '@/lib/auth-host'

const TABS = [
  { id: 'overview', label: 'Overview', icon: Building2 },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'subscription', label: 'Subscription', icon: CreditCard },
  { id: 'infrastructure', label: 'Infrastructure', icon: Shield },
  { id: 'activity', label: 'Activity', icon: ScrollText },
] as const

type TabId = (typeof TABS)[number]['id']

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: 'bg-green-50 text-green-700',
  SUSPENDED: 'bg-amber-50 text-amber-700',
  TRIAL: 'bg-blue-50 text-blue-700',
  INACTIVE: 'bg-gray-100 text-gray-500',
}

function fmtDate(s?: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-LK', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [tab, setTab] = useState<TabId>('overview')
  const [tenant, setTenant] = useState<TenantRow | null>(null)
  const [users, setUsers] = useState<UserRow[]>([])
  const [logs, setLogs] = useState<AuditLogRow[]>([])
  const [plans, setPlans] = useState<PlanDef[]>([])
  const [loading, setLoading] = useState(true)
  const [sslLoading, setSslLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ name: '', status: '', plan: '', maxUsers: '', maxBranches: '', maxProducts: '' })
  const [showInvoice, setShowInvoice] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const [t, p] = await Promise.all([fetchTenant(id), fetchPlans()])
      setTenant(t)
      setPlans(p)
      setForm({
        name: t.name,
        status: t.status,
        plan: t.plan,
        maxUsers: String(t.maxUsers ?? ''),
        maxBranches: String(t.maxBranches ?? ''),
        maxProducts: String(t.maxProducts ?? ''),
      })
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load tenant')
    } finally {
      setLoading(false)
    }
  }, [id])

  const loadUsers = useCallback(async () => {
    if (!id) return
    try {
      const res = await fetchTenantUsers(id, { limit: 100 })
      setUsers(res.data)
    } catch { /* ignore */ }
  }, [id])

  const loadLogs = useCallback(async () => {
    if (!tenant?.subdomain) return
    try {
      const res = await fetchPlatformAuditLogs({ limit: '30', search: tenant.subdomain })
      setLogs(res.data.filter(l => l.tenant?.id === id || l.resourceId === id))
    } catch { /* ignore */ }
  }, [id, tenant?.subdomain])

  useEffect(() => { load() }, [load])
  useEffect(() => { if (tab === 'users') loadUsers() }, [tab, loadUsers])
  useEffect(() => { if (tab === 'activity') loadLogs() }, [tab, loadLogs])

  async function handleSave() {
    if (!tenant) return
    setSaving(true)
    try {
      const updated = await updateTenant(tenant.id, {
        name: form.name,
        status: form.status,
        plan: form.plan,
        maxUsers: form.maxUsers ? parseInt(form.maxUsers, 10) : undefined,
        maxBranches: form.maxBranches ? parseInt(form.maxBranches, 10) : undefined,
        maxProducts: form.maxProducts ? parseInt(form.maxProducts, 10) : undefined,
      })
      setTenant(updated)
      setEditing(false)
      toast.success('Tenant updated')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleStatus() {
    if (!tenant) return
    const newStatus = tenant.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE'
    try {
      const updated = await updateTenant(tenant.id, { status: newStatus })
      setTenant(updated)
      setForm(f => ({ ...f, status: newStatus }))
      toast.success(newStatus === 'SUSPENDED' ? 'Tenant suspended' : 'Tenant reactivated')
    } catch {
      toast.error('Status update failed')
    }
  }

  async function handleProvisionSsl() {
    if (!tenant) return
    setSslLoading(true)
    try {
      const res = await provisionTenantSsl(tenant.id)
      toast.success(res.message || 'SSL renewal queued — ready in 1–3 minutes')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'SSL provision failed')
    } finally {
      setSslLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-gray-300" />
      </div>
    )
  }

  if (!tenant) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500 mb-4">Tenant not found</p>
        <Link href="/admin/tenants" className="text-sm text-gray-900 underline">Back to tenants</Link>
      </div>
    )
  }

  const shopUrl = tenantLoginUrl(tenant.subdomain)
  const profile = getShopProfile(tenant.shopType)
  const currentPlan = plans.find(p => p.key === tenant.plan)

  return (
    <div className="space-y-5">
      {/* Breadcrumb + header */}
      <div className="flex flex-col gap-4">
        <button onClick={() => router.push('/admin/tenants')} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 w-fit">
          <ArrowLeft size={14} /> Back to Tenants
        </button>
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="flex items-start gap-3 flex-1">
            <div className="w-12 h-12 rounded-xl bg-gray-900 text-white text-lg font-bold flex items-center justify-center shrink-0">
              {tenant.name.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-bold text-gray-900">{tenant.name}</h1>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_BADGE[tenant.status] ?? STATUS_BADGE.INACTIVE}`}>
                  {tenant.status}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-600">{tenant.plan}</span>
              </div>
              <p className="text-sm text-gray-500 mt-0.5">
                {profile.emoji} {profile.label} · <span className="font-mono">{tenant.subdomain}{SHOP_DOMAIN_SUFFIX}</span>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={shopUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 bg-white rounded-lg hover:bg-gray-50">
              <ExternalLink size={13} /> Open Workspace
            </a>
            <button onClick={handleToggleStatus}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg ${
                tenant.status === 'ACTIVE' ? 'border-amber-200 text-amber-700 hover:bg-amber-50' : 'border-green-200 text-green-700 hover:bg-green-50'
              }`}>
              {tenant.status === 'ACTIVE' ? <><Ban size={13} /> Suspend</> : <><CheckCircle size={13} /> Reactivate</>}
            </button>
            <button onClick={load} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50">
              <RefreshCw size={14} className="text-gray-500" />
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-gray-200 pb-px">
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                tab === t.id ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              <Icon size={14} /> {t.label}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      {tab === 'overview' && (
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Tenant Details</h2>
              {!editing ? (
                <button onClick={() => setEditing(true)} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800">
                  <Edit2 size={12} /> Edit
                </button>
              ) : (
                <div className="flex gap-2">
                  <button onClick={() => setEditing(false)} className="p-1.5 text-gray-400 hover:text-gray-700"><X size={14} /></button>
                  <button onClick={handleSave} disabled={saving} className="flex items-center gap-1 px-3 py-1.5 text-xs bg-gray-900 text-white rounded-lg">
                    {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save
                  </button>
                </div>
              )}
            </div>
            {editing ? (
              <div className="grid sm:grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500">Name</label>
                  <input className="w-full mt-1 px-3 py-2 text-sm border rounded-lg" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
                <div><label className="text-xs text-gray-500">Status</label>
                  <select className="w-full mt-1 px-3 py-2 text-sm border rounded-lg" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                    <option value="ACTIVE">ACTIVE</option><option value="SUSPENDED">SUSPENDED</option><option value="TRIAL">TRIAL</option><option value="INACTIVE">INACTIVE</option>
                  </select></div>
                <div><label className="text-xs text-gray-500">Plan</label>
                  <select className="w-full mt-1 px-3 py-2 text-sm border rounded-lg" value={form.plan} onChange={e => setForm(f => ({ ...f, plan: e.target.value }))}>
                    {plans.map(p => <option key={p.key} value={p.key}>{p.name}</option>)}
                  </select></div>
              </div>
            ) : (
              <dl className="grid sm:grid-cols-2 gap-4 text-sm">
                {[
                  { icon: Mail, label: 'Email', value: tenant.email },
                  { icon: Phone, label: 'Phone', value: tenant.phone || '—' },
                  { icon: MapPin, label: 'Country', value: `${tenant.country} · ${tenant.currency}` },
                  { icon: Clock, label: 'Timezone', value: tenant.timezone },
                  { icon: Globe, label: 'Subdomain', value: tenant.subdomain },
                  { icon: Clock, label: 'Joined', value: fmtDate(tenant.createdAt) },
                ].map(row => (
                  <div key={row.label} className="flex items-start gap-2">
                    <row.icon size={14} className="text-gray-400 mt-0.5 shrink-0" />
                    <div><dt className="text-[10px] text-gray-400 uppercase">{row.label}</dt><dd className="text-gray-800">{row.value}</dd></div>
                  </div>
                ))}
              </dl>
            )}
            {tenant.branches && tenant.branches.length > 0 && (
              <div className="pt-4 border-t border-gray-100">
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Branches ({tenant.branches.length})</h3>
                <div className="space-y-1">
                  {tenant.branches.map(b => (
                    <div key={b.id} className="flex items-center justify-between text-sm py-1.5 px-2 rounded-lg bg-gray-50">
                      <span>{b.name}</span>
                      <span className="text-xs font-mono text-gray-400">{b.code}{b.isDefault ? ' · default' : ''}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="space-y-4">
            {[
              { label: 'Users', value: tenant._count?.users ?? 0 },
              { label: 'Branches', value: tenant._count?.branches ?? 0 },
              { label: 'Max Users', value: formatPlanLimit(tenant.maxUsers) },
              { label: 'Max Branches', value: formatPlanLimit(tenant.maxBranches) },
            ].map(k => (
              <div key={k.label} className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-[10px] text-gray-400 uppercase">{k.label}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{k.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'users' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Users ({users.length})</h2>
            <Link href={`/admin/users?tenant=${tenant.subdomain}`} className="text-xs text-gray-500 hover:text-gray-800">View all platform users →</Link>
          </div>
          <table className="w-full">
            <thead><tr className="bg-gray-50 border-b">
              {['Name', 'Email', 'Roles', 'Status', 'Joined'].map(h => (
                <th key={h} className="px-4 py-2 text-left text-[11px] font-semibold text-gray-500 uppercase">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {users.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">No users</td></tr>
              ) : users.map(u => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium">{u.firstName} {u.lastName}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{u.email}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">{u.roles?.map(r => r.role.name).join(', ') || '—'}</td>
                  <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_BADGE[u.status] ?? STATUS_BADGE.INACTIVE}`}>{u.status}</span></td>
                  <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(u.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'subscription' && (
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <h2 className="text-sm font-semibold">Current Plan</h2>
            <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
              <p className="text-lg font-bold">{currentPlan?.name ?? tenant.plan}</p>
              <p className="text-sm text-gray-500 mt-1">{currentPlan?.description}</p>
              {currentPlan && currentPlan.price > 0 && (
                <p className="text-xl font-bold mt-3">{currentPlan.currency}{currentPlan.price.toLocaleString()}<span className="text-sm font-normal text-gray-400">/{currentPlan.interval}</span></p>
              )}
            </div>
            {tenant.trialEndsAt && (
              <div className={`p-3 rounded-lg text-sm ${new Date(tenant.trialEndsAt) < new Date() ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
                Trial ends: {fmtDate(tenant.trialEndsAt)}
              </div>
            )}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Max Users', key: 'maxUsers' as const },
                { label: 'Max Branches', key: 'maxBranches' as const },
                { label: 'Max Products', key: 'maxProducts' as const },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-[10px] text-gray-400 uppercase">{f.label}</label>
                  <input className="w-full mt-1 px-2 py-1.5 text-sm border rounded-lg font-mono"
                    value={form[f.key]} onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))} />
                </div>
              ))}
            </div>
            <button onClick={handleSave} disabled={saving} className="w-full py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50">
              {saving ? 'Saving…' : 'Update Limits & Plan'}
            </button>
            {currentPlan && currentPlan.price > 0 && (
              <button
                onClick={() => setShowInvoice(true)}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 font-medium text-gray-700"
              >
                <FileText size={14} /> Generate & Send Invoice
              </button>
            )}
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold mb-3">Plan Features</h2>
            <ul className="space-y-2">
              {(currentPlan?.features ?? []).map(f => (
                <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
                  <CheckCircle size={14} className="text-green-500 shrink-0" /> {f}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {tab === 'infrastructure' && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-5 max-w-2xl">
          <h2 className="text-sm font-semibold">DNS & SSL</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-4 rounded-xl bg-gray-50 border border-gray-100">
              <div>
                <p className="text-sm font-medium">Workspace URL</p>
                <p className="text-xs font-mono text-gray-500 mt-0.5">{tenant.subdomain}{SHOP_DOMAIN_SUFFIX}</p>
              </div>
              <a href={shopUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                Test <ExternalLink size={11} />
              </a>
            </div>
            <p className="text-xs text-gray-500">
              SSL certificates are issued automatically on registration. Re-provision if a tenant sees a certificate error (usually ready in 1–3 minutes).
            </p>
            <button onClick={handleProvisionSsl} disabled={sslLoading}
              className="flex items-center gap-2 px-4 py-2.5 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50">
              {sslLoading ? <Loader2 size={14} className="animate-spin" /> : <Shield size={14} />}
              {sslLoading ? 'Queuing SSL renewal…' : 'Re-provision DNS + SSL'}
            </button>
          </div>
        </div>
      )}

      {tab === 'activity' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold">Recent Activity</h2>
          </div>
          {logs.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-gray-400">No activity logs for this tenant</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {logs.map(log => (
                <div key={log.id} className="px-5 py-3 flex items-start justify-between gap-4 hover:bg-gray-50">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{log.action}</p>
                    <p className="text-xs text-gray-500">{log.resource}{log.resourceId ? ` · ${log.resourceId.slice(0, 8)}…` : ''}</p>
                    {log.user && <p className="text-[10px] text-gray-400 mt-0.5">{log.user.email}</p>}
                  </div>
                  <span className="text-[10px] text-gray-400 whitespace-nowrap">{fmtDate(log.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showInvoice && tenant && (
        <SubscriptionInvoiceModal tenant={tenant} onClose={() => setShowInvoice(false)} />
      )}
    </div>
  )
}
