'use client'

import { LoadingCenter } from "@/components/ui/loading";
import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Building2, Users, CreditCard, Shield, ScrollText,
  ExternalLink, RefreshCw, Ban, CheckCircle, Edit2, Save, X,
  Globe, Mail, Phone, MapPin, Clock, Loader2, FileText, LifeBuoy,
  LogIn, Copy, ShieldOff, StickyNote, Trash2, Plus, KeyRound,
  Package, ShoppingCart, UserRound,
} from 'lucide-react'
import { toast } from 'sonner'
import SubscriptionInvoiceModal from '@/components/admin/SubscriptionInvoiceModal'
import {
  fetchTenant, fetchTenantUsers, fetchPlans, updateTenant, provisionTenantSsl,
  fetchPlatformAuditLogs, formatPlanLimit, type TenantRow, type UserRow, type PlanDef,
  type AuditLogRow, impersonateTenant, fetchTenantDebug, fetchSupportNotes,
  createSupportNote, deleteSupportNote, revokeTenantSessions, resetUserPassword,
  type TenantDebugInfo, type SupportNote,
} from '@/lib/admin-api'
import { parseApiList } from '@/lib/parse-api-list'
import { getShopProfile } from '@/lib/shop-profiles'
import { tenantLoginUrl, SHOP_DOMAIN_SUFFIX } from '@/lib/auth-host'
import { Button } from '@/components/ui/button'
import { PAGE_HEADER_BTN_TONES, PageKpiGrid, pageKpi } from '@/components/ui/page-kpi'
import { AdminStatusBadge, AdminPlanBadge } from '@/components/admin/admin-badges'
import { ADMIN_CARD, ADMIN_INPUT, ADMIN_SELECT, ADMIN_MODAL_PANEL } from '@/lib/admin-ui'
import { cn } from '@/lib/utils'

const TABS = [
  { id: 'overview', label: 'Overview', icon: Building2 },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'subscription', label: 'Subscription', icon: CreditCard },
  { id: 'infrastructure', label: 'Infrastructure', icon: Shield },
  { id: 'activity', label: 'Activity', icon: ScrollText },
  { id: 'support', label: 'Support', icon: LifeBuoy },
] as const

type TabId = (typeof TABS)[number]['id']

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
  const [debug, setDebug] = useState<TenantDebugInfo | null>(null)
  const [notes, setNotes] = useState<SupportNote[]>([])
  const [supportLoading, setSupportLoading] = useState(false)
  const [supportBusy, setSupportBusy] = useState<string | null>(null)
  const [noteModal, setNoteModal] = useState(false)
  const [noteForm, setNoteForm] = useState({ title: '', body: '' })
  const [savingNote, setSavingNote] = useState(false)

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

  const loadSupport = useCallback(async () => {
    if (!id) return
    setSupportLoading(true)
    try {
      const [dbg, noteList] = await Promise.all([
        fetchTenantDebug(id),
        fetchSupportNotes(id),
      ])
      setDebug(dbg)
      setNotes(parseApiList<SupportNote>(noteList))
      await loadUsers()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load support data')
    } finally {
      setSupportLoading(false)
    }
  }, [id, loadUsers])

  useEffect(() => { load() }, [load])
  useEffect(() => { if (tab === 'users') loadUsers() }, [tab, loadUsers])
  useEffect(() => { if (tab === 'activity') loadLogs() }, [tab, loadLogs])
  useEffect(() => { if (tab === 'support') loadSupport() }, [tab, loadSupport])

  async function handleImpersonate() {
    if (!id) return
    setSupportBusy('impersonate')
    try {
      const res = await impersonateTenant(id)
      if (res.loginUrl) {
        await navigator.clipboard.writeText(res.loginUrl)
        toast.success('Impersonation login URL copied')
      } else {
        toast.error('No login URL returned')
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Impersonation failed')
    } finally {
      setSupportBusy(null)
    }
  }

  async function handleRevokeSessions() {
    if (!id) return
    if (!window.confirm('Revoke all active sessions for this tenant?')) return
    setSupportBusy('revoke')
    try {
      const res = await revokeTenantSessions(id)
      toast.success(
        typeof res.revoked === 'number' ? `Revoked ${res.revoked} session(s)` : 'Tenant sessions revoked',
      )
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Revoke failed')
    } finally {
      setSupportBusy(null)
    }
  }

  async function handleCreateNote() {
    if (!noteForm.title.trim() || !noteForm.body.trim()) {
      toast.error('Title and body are required')
      return
    }
    setSavingNote(true)
    try {
      await createSupportNote({ tenantId: id, title: noteForm.title.trim(), body: noteForm.body.trim() })
      toast.success('Support note added')
      setNoteModal(false)
      setNoteForm({ title: '', body: '' })
      await loadSupport()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to create note')
    } finally {
      setSavingNote(false)
    }
  }

  async function handleDeleteNote(note: SupportNote) {
    if (!window.confirm(`Delete note “${note.title}”?`)) return
    setSupportBusy(`note-${note.id}`)
    try {
      await deleteSupportNote(note.id)
      toast.success('Note deleted')
      setNotes(n => n.filter(x => x.id !== note.id))
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setSupportBusy(null)
    }
  }

  async function handleResetPassword(user: UserRow) {
    if (!window.confirm(`Send password reset for ${user.email}?`)) return
    setSupportBusy(`pwd-${user.id}`)
    try {
      await resetUserPassword(user.id)
      toast.success('Password reset sent')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Reset failed')
    } finally {
      setSupportBusy(null)
    }
  }

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
      <LoadingCenter className="h-64 py-0" size={88} />
    )
  }

  if (!tenant) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground mb-4">Tenant not found</p>
        <Link href="/admin/tenants" className="text-sm text-foreground underline">Back to tenants</Link>
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
        <Button variant="ghost" onClick={() => router.push('/admin/tenants')} className="h-auto px-0 text-xs text-muted-foreground hover:text-foreground hover:bg-transparent w-fit">
          <ArrowLeft size={14} /> Back to Tenants
        </Button>
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="flex items-start gap-3 flex-1">
            <div className="w-12 h-12 rounded-xl bg-foreground text-background text-lg font-bold flex items-center justify-center shrink-0">
              {tenant.name.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-bold text-foreground">{tenant.name}</h1>
                <AdminStatusBadge status={tenant.status} />
                <AdminPlanBadge plan={tenant.plan} />
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                {profile.emoji} {profile.label} · <span className="font-mono">{tenant.subdomain}{SHOP_DOMAIN_SUFFIX}</span>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={shopUrl} target="_blank" rel="noopener noreferrer"
              className={cn('flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border', PAGE_HEADER_BTN_TONES.blue)}>
              <ExternalLink size={13} /> Open Workspace
            </a>
            <Button
              variant={tenant.status === 'ACTIVE' ? 'danger' : 'success'}
              onClick={handleToggleStatus}
            >
              {tenant.status === 'ACTIVE' ? <><Ban size={13} /> Suspend</> : <><CheckCircle size={13} /> Reactivate</>}
            </Button>
            <Button variant="outline" size="icon-sm" onClick={load}>
              <RefreshCw size={14} className="text-muted-foreground" />
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-border pb-px">
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <Button
              key={t.id}
              size="sm"
              variant={tab === t.id ? 'default' : 'ghost'}
              onClick={() => setTab(t.id)}
              className={`rounded-none border-b-2 border-x-0 border-t-0 ${
                tab === t.id ? 'border-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon size={14} /> {t.label}
            </Button>
          )
        })}
      </div>

      {/* Tab content */}
      {tab === 'overview' && (
        <div className="grid lg:grid-cols-3 gap-4">
          <div className={cn(ADMIN_CARD, "lg:col-span-2 p-5 space-y-4")}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">Tenant Details</h2>
              {!editing ? (
                <Button variant="ghost" size="sm" onClick={() => setEditing(true)} className="h-auto px-0 text-xs text-muted-foreground hover:text-foreground hover:bg-transparent">
                  <Edit2 size={12} /> Edit
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button variant="ghost" size="icon-sm" onClick={() => setEditing(false)} className="text-muted-foreground hover:text-foreground"><X size={14} /></Button>
                  <Button variant="default" size="sm" onClick={handleSave} disabled={saving}>
                    {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save
                  </Button>
                </div>
              )}
            </div>
            {editing ? (
              <div className="grid sm:grid-cols-2 gap-3">
                <div><label className="text-xs text-muted-foreground">Name</label>
                  <input className={cn(ADMIN_INPUT, 'mt-1')} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
                <div><label className="text-xs text-muted-foreground">Status</label>
                  <select className={cn(ADMIN_SELECT, 'w-full mt-1')} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                    <option value="ACTIVE">ACTIVE</option><option value="SUSPENDED">SUSPENDED</option><option value="TRIAL">TRIAL</option><option value="INACTIVE">INACTIVE</option>
                  </select></div>
                <div><label className="text-xs text-muted-foreground">Plan</label>
                  <select className={cn(ADMIN_SELECT, 'w-full mt-1')} value={form.plan} onChange={e => setForm(f => ({ ...f, plan: e.target.value }))}>
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
                    <row.icon size={14} className="text-muted-foreground mt-0.5 shrink-0" />
                    <div><dt className="text-[10px] text-muted-foreground uppercase">{row.label}</dt><dd className="text-foreground">{row.value}</dd></div>
                  </div>
                ))}
              </dl>
            )}
            {tenant.branches && tenant.branches.length > 0 && (
              <div className="pt-4 border-t border-border">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Branches ({tenant.branches.length})</h3>
                <div className="space-y-1">
                  {tenant.branches.map(b => (
                    <div key={b.id} className="flex items-center justify-between text-sm py-1.5 px-2 rounded-lg bg-muted/50">
                      <span>{b.name}</span>
                      <span className="text-xs font-mono text-muted-foreground">{b.code}{b.isDefault ? ' · default' : ''}</span>
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
              <div key={k.label} className="bg-card rounded-xl border border-border p-4">
                <p className="text-[10px] text-muted-foreground uppercase">{k.label}</p>
                <p className="text-2xl font-bold text-foreground mt-1">{k.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'users' && (
        <div className={cn(ADMIN_CARD, "overflow-hidden")}>
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-semibold">Users ({users.length})</h2>
            <Link href={`/admin/users?tenant=${tenant.subdomain}`} className="text-xs text-muted-foreground hover:text-foreground">View all platform users →</Link>
          </div>
          <table className="w-full">
            <thead><tr className="bg-muted/50 border-b">
              {['Name', 'Email', 'Roles', 'Status', 'Joined'].map(h => (
                <th key={h} className="px-4 py-2 text-left text-[11px] font-semibold text-muted-foreground uppercase">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-border">
              {users.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">No users</td></tr>
              ) : users.map(u => (
                <tr key={u.id} className="hover:bg-muted/50">
                  <td className="px-4 py-3 text-sm font-medium">{u.firstName} {u.lastName}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{u.email}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{u.roles?.map(r => r.role.name).join(', ') || '—'}</td>
                  <td className="px-4 py-3"><AdminStatusBadge status={u.status} /></td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{fmtDate(u.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'subscription' && (
        <div className="grid lg:grid-cols-2 gap-4">
          <div className={cn(ADMIN_CARD, "p-5 space-y-4")}>
            <h2 className="text-sm font-semibold">Current Plan</h2>
            <div className="p-4 rounded-xl bg-muted/50 border border-border">
              <p className="text-lg font-bold">{currentPlan?.name ?? tenant.plan}</p>
              <p className="text-sm text-muted-foreground mt-1">{currentPlan?.description}</p>
              {currentPlan && currentPlan.price > 0 && (
                <p className="text-xl font-bold mt-3">{currentPlan.currency}{currentPlan.price.toLocaleString()}<span className="text-sm font-normal text-muted-foreground">/{currentPlan.interval}</span></p>
              )}
            </div>
            {tenant.trialEndsAt && (
              <div className={`p-3 rounded-lg text-sm ${new Date(tenant.trialEndsAt) < new Date() ? 'bg-red-500/10 text-red-700' : 'bg-primary/10 text-primary'}`}>
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
                  <label className="text-[10px] text-muted-foreground uppercase">{f.label}</label>
                  <input className={cn(ADMIN_INPUT, 'mt-1 font-mono')}
                    value={form[f.key]} onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))} />
                </div>
              ))}
            </div>
            <Button variant="default" className="w-full" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Update Limits & Plan'}
            </Button>
            {currentPlan && currentPlan.price > 0 && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setShowInvoice(true)}
              >
                <FileText size={14} /> Generate & Send Invoice
              </Button>
            )}
          </div>
          <div className={cn(ADMIN_CARD, "p-5")}>
            <h2 className="text-sm font-semibold mb-3">Plan Features</h2>
            <ul className="space-y-2">
              {(currentPlan?.features ?? []).map(f => (
                <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle size={14} className="text-green-500 shrink-0" /> {f}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {tab === 'infrastructure' && (
        <div className="bg-card rounded-xl border border-border p-5 space-y-5 max-w-2xl">
          <h2 className="text-sm font-semibold">DNS & SSL</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50 border border-border">
              <div>
                <p className="text-sm font-medium">Workspace URL</p>
                <p className="text-xs font-mono text-muted-foreground mt-0.5">{tenant.subdomain}{SHOP_DOMAIN_SUFFIX}</p>
              </div>
              <a href={shopUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                Test <ExternalLink size={11} />
              </a>
            </div>
            <p className="text-xs text-muted-foreground">
              SSL certificates are issued automatically on registration. Re-provision if a tenant sees a certificate error (usually ready in 1–3 minutes).
            </p>
            <Button variant="default" onClick={handleProvisionSsl} disabled={sslLoading}>
              {sslLoading ? <Loader2 size={14} className="animate-spin" /> : <Shield size={14} />}
              {sslLoading ? 'Queuing SSL renewal…' : 'Re-provision DNS + SSL'}
            </Button>
          </div>
        </div>
      )}

      {tab === 'activity' && (
        <div className={cn(ADMIN_CARD, "overflow-hidden")}>
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-sm font-semibold">Recent Activity</h2>
          </div>
          {logs.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">No activity logs for this tenant</p>
          ) : (
            <div className="divide-y divide-border">
              {logs.map(log => (
                <div key={log.id} className="px-5 py-3 flex items-start justify-between gap-4 hover:bg-muted/50">
                  <div>
                    <p className="text-sm font-medium text-foreground">{log.action}</p>
                    <p className="text-xs text-muted-foreground">{log.resource}{log.resourceId ? ` · ${log.resourceId.slice(0, 8)}…` : ''}</p>
                    {log.user && <p className="text-[10px] text-muted-foreground mt-0.5">{log.user.email}</p>}
                  </div>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">{fmtDate(log.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'support' && (
        <div className="space-y-4">
          <div className={cn(ADMIN_CARD, 'p-4')}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Support tools</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Impersonate, revoke sessions, notes, and password resets
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/admin/support?tenant=${id}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                >
                  <LifeBuoy size={13} /> Open Support console
                </Link>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={supportBusy === 'impersonate'}
                  onClick={() => void handleImpersonate()}
                >
                  <LogIn size={13} /> Impersonate <Copy size={12} className="opacity-60" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-amber-700 dark:text-amber-400"
                  disabled={supportBusy === 'revoke'}
                  onClick={() => void handleRevokeSessions()}
                >
                  <ShieldOff size={13} /> Revoke sessions
                </Button>
              </div>
            </div>
          </div>

          <PageKpiGrid
            items={[
              pageKpi('Products', debug?.counts.products ?? '—', Package, 'primary'),
              pageKpi('Customers', debug?.counts.customers ?? '—', UserRound, 'info'),
              pageKpi('Sales', debug?.counts.sales ?? '—', ShoppingCart, 'success'),
              pageKpi('Users', debug?.counts.users ?? '—', Users, 'neutral'),
            ]}
            cols={4}
            loading={supportLoading}
          />

          <div className={cn(ADMIN_CARD, 'p-4 space-y-3')}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <StickyNote size={14} className="text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">Support notes</h3>
              </div>
              <Button
                type="button"
                size="sm"
                className="gap-1.5"
                onClick={() => { setNoteForm({ title: '', body: '' }); setNoteModal(true) }}
              >
                <Plus className="h-4 w-4" /> Add note
              </Button>
            </div>
            {notes.length === 0 ? (
              <p className="text-xs text-muted-foreground">No notes for this tenant.</p>
            ) : (
              <ul className="space-y-2">
                {notes.map(n => (
                  <li key={n.id} className="rounded-lg border border-border px-3 py-2 flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-foreground">{n.title}</p>
                      <p className="text-[11px] text-muted-foreground whitespace-pre-wrap mt-0.5">{n.body}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {fmtDate(n.createdAt)}{n.createdBy ? ` · ${n.createdBy}` : ''}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="text-red-500"
                      disabled={supportBusy === `note-${n.id}`}
                      onClick={() => void handleDeleteNote(n)}
                    >
                      <Trash2 size={13} />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className={cn(ADMIN_CARD, 'p-4 space-y-3')}>
            <div className="flex items-center gap-2">
              <Users size={14} className="text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">Tenant users</h3>
            </div>
            {users.length === 0 ? (
              <p className="text-xs text-muted-foreground">No users loaded.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border">
                      <th className="py-2 pr-3 font-semibold">User</th>
                      <th className="py-2 pr-3 font-semibold">Status</th>
                      <th className="py-2 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {users.map(u => (
                      <tr key={u.id}>
                        <td className="py-2 pr-3">
                          <p className="font-semibold text-foreground">
                            {[u.firstName, u.lastName].filter(Boolean).join(' ') || '—'}
                          </p>
                          <p className="text-muted-foreground">{u.email}</p>
                        </td>
                        <td className="py-2 pr-3"><AdminStatusBadge status={u.status} /></td>
                        <td className="py-2 text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 gap-1"
                            disabled={supportBusy === `pwd-${u.id}`}
                            onClick={() => void handleResetPassword(u)}
                          >
                            <KeyRound size={12} /> Reset password
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {noteModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className={cn(ADMIN_MODAL_PANEL, 'max-w-md')}>
            <h3 className="text-sm font-bold text-foreground mb-4">Add support note</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Title</label>
                <input
                  className={ADMIN_INPUT}
                  value={noteForm.title}
                  onChange={e => setNoteForm(f => ({ ...f, title: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Body</label>
                <textarea
                  className={cn(ADMIN_INPUT, 'min-h-[100px] resize-y')}
                  value={noteForm.body}
                  onChange={e => setNoteForm(f => ({ ...f, body: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <Button type="button" variant="outline" onClick={() => setNoteModal(false)}>Cancel</Button>
              <Button type="button" disabled={savingNote} onClick={() => void handleCreateNote()}>
                {savingNote ? 'Saving…' : 'Save note'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showInvoice && tenant && (
        <SubscriptionInvoiceModal tenant={tenant} onClose={() => setShowInvoice(false)} />
      )}
    </div>
  )
}
