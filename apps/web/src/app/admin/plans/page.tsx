'use client'

import { useState, useEffect } from 'react'
import { Edit2, X, Check, Users, GitBranch, Plus, Tag, TrendingUp } from 'lucide-react'
import { fetchPlans, updatePlanCatalog, DEFAULT_PLANS, type PlanDef } from '@/lib/admin-api'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { PageHeader, PageKpiGrid, pageKpi } from '@/components/ui/page-kpi'
import { AdminPlanBadge } from '@/components/admin/admin-badges'
import { ADMIN_CARD, ADMIN_INPUT, ADMIN_MODAL_PANEL } from '@/lib/admin-ui'
import { cn } from '@/lib/utils'

const PLAN_RING: Record<string, string> = {
  STARTER: 'border-border',
  PROFESSIONAL: 'border-primary/40',
  ENTERPRISE: 'border-amber-500/40',
  CUSTOM: 'border-violet-500/40',
}

export default function PlansPage() {
  const [plans, setPlans]       = useState<PlanDef[]>(DEFAULT_PLANS)
  const [loading, setLoading]   = useState(true)
  const [editPlan, setEditPlan] = useState<PlanDef | null>(null)

  async function load() {
    setLoading(true)
    try { setPlans(await fetchPlans()) } catch { toast.error('Failed to load plans') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  function handleSaved(updated: PlanDef) {
    setPlans(ps => ps.map(p => p.key === updated.key ? updated : p))
    setEditPlan(null)
  }

  const totalTenants = plans.reduce((s, p) => s + (p.tenantCount ?? 0), 0)
  const kpis = [
    pageKpi('Plans', plans.length, Tag, 'primary'),
    pageKpi('Tenants', totalTenants, Users, 'neutral'),
    pageKpi('Avg price', plans.length ? Math.round(plans.reduce((s, p) => s + p.price, 0) / plans.length).toLocaleString() : '—', TrendingUp, 'success'),
    pageKpi('Enterprise', plans.find(p => p.key === 'ENTERPRISE')?.tenantCount ?? 0, GitBranch, 'warning'),
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Subscription Plans"
        description="Manage pricing tiers and feature sets"
        onRefresh={load}
        refreshing={loading}
      />

      <PageKpiGrid items={kpis} loading={loading} cols={4} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {plans.map(plan => (
          <div key={plan.key} className={cn(ADMIN_CARD, 'border-2 p-6 flex flex-col transition-all', PLAN_RING[plan.key] ?? PLAN_RING.STARTER)}>
            <div className="flex items-start justify-between mb-4">
              <AdminPlanBadge plan={plan.key} />
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setEditPlan(plan)}
                className="text-muted-foreground hover:text-primary hover:bg-primary/10"
              >
                <Edit2 size={13} />
              </Button>
            </div>

            <div className="mb-1">
              <span className="text-3xl font-bold text-foreground">{plan.currency}{plan.price.toLocaleString()}</span>
              <span className="text-sm text-muted-foreground ml-1">/{plan.interval}</span>
            </div>
            <p className="text-xs text-muted-foreground mb-5">{plan.description}</p>

            <div className="space-y-2 mb-6 flex-1">
              {plan.features.map(f => (
                <div key={f} className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 bg-foreground">
                    <Check size={9} className="text-background" />
                  </div>
                  <span className="text-xs text-muted-foreground">{f}</span>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-border space-y-2">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Users size={12} />
                  {plan.maxUsers === -1 ? 'Unlimited users' : `${plan.maxUsers} users`}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <GitBranch size={12} />
                  {plan.maxBranches === -1 ? 'Unlimited branches' : `${plan.maxBranches} branches`}
                </div>
              </div>
              {typeof plan.tenantCount === 'number' && (
                <p className="text-[11px] text-muted-foreground">{plan.tenantCount} tenant{plan.tenantCount === 1 ? '' : 's'} on this plan</p>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className={cn(ADMIN_CARD, 'overflow-hidden')}>
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-sm font-bold text-foreground">Plan Comparison</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Feature</th>
                {plans.map(p => (
                  <th key={p.key} className="px-5 py-3 text-center text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{p.name}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {[
                { label: 'Monthly Price', render: (p: PlanDef) => `${p.currency}${p.price.toLocaleString()}` },
                { label: 'Users',        render: (p: PlanDef) => p.maxUsers === -1 ? 'Unlimited' : String(p.maxUsers) },
                { label: 'Branches',     render: (p: PlanDef) => p.maxBranches === -1 ? 'Unlimited' : String(p.maxBranches) },
                { label: 'Features',     render: (p: PlanDef) => String(p.features.length) + ' included' },
              ].map(row => (
                <tr key={row.label} className="hover:bg-muted/40">
                  <td className="px-5 py-3 text-xs font-medium text-foreground">{row.label}</td>
                  {plans.map(p => (
                    <td key={p.key} className="px-5 py-3 text-xs text-center text-muted-foreground font-mono">{row.render(p)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editPlan && <EditPlanModal plan={editPlan} onClose={() => setEditPlan(null)} onSaved={handleSaved} />}
    </div>
  )
}

function EditPlanModal({ plan, onClose, onSaved }: { plan: PlanDef; onClose: () => void; onSaved: (p: PlanDef) => void }) {
  const [form, setForm]         = useState<PlanDef>({ ...plan, features: [...plan.features] })
  const [featInput, setFeatInput] = useState('')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

  function addFeature() {
    if (!featInput.trim()) return
    setForm(f => ({ ...f, features: [...f.features, featInput.trim()] }))
    setFeatInput('')
  }

  function removeFeature(i: number) {
    setForm(f => ({ ...f, features: f.features.filter((_, idx) => idx !== i) }))
  }

  async function save() {
    setSaving(true)
    setError('')
    try {
      const updated = await updatePlanCatalog(plan.key, form)
      onSaved(updated)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save plan')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className={cn(ADMIN_MODAL_PANEL, 'max-w-md max-h-[90vh] overflow-y-auto')}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-sm font-bold text-foreground">Edit Plan — {plan.name}</h3>
          <Button variant="ghost" size="icon-sm" onClick={onClose} className="text-muted-foreground"><X size={16} /></Button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Plan Name</label>
              <input className={ADMIN_INPUT} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Price ({form.currency})</label>
              <input type="number" className={ADMIN_INPUT} value={form.price} onChange={e => setForm(f => ({ ...f, price: Number(e.target.value) }))} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Max Users <span className="text-muted-foreground">(-1 = unlimited)</span></label>
              <input type="number" className={ADMIN_INPUT} value={form.maxUsers} onChange={e => setForm(f => ({ ...f, maxUsers: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Max Branches <span className="text-muted-foreground">(-1 = unlimited)</span></label>
              <input type="number" className={ADMIN_INPUT} value={form.maxBranches} onChange={e => setForm(f => ({ ...f, maxBranches: Number(e.target.value) }))} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Description</label>
            <input className={ADMIN_INPUT} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-2">Features</label>
            <div className="space-y-1.5 mb-2">
              {form.features.map((feat, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="flex-1 px-2.5 py-1.5 text-xs bg-muted border border-border rounded-lg text-foreground">{feat}</div>
                  <Button variant="ghost" size="icon-sm" onClick={() => removeFeature(i)} className="h-7 w-7 text-muted-foreground hover:text-red-500">
                    <X size={12} />
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                className={cn(ADMIN_INPUT, 'flex-1')}
                placeholder="Add feature…"
                value={featInput}
                onChange={e => setFeatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addFeature()}
              />
              <Button variant="default" size="icon-sm" onClick={addFeature}>
                <Plus size={14} />
              </Button>
            </div>
          </div>
        </div>

        {error && <p className="mt-4 text-xs text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="default" onClick={save} disabled={saving}>
            <TrendingUp size={13} />{saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </div>
  )
}
