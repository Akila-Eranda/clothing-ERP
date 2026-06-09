'use client'

import { useState, useEffect } from 'react'
import { Edit2, X, Check, Users, GitBranch, Plus, RefreshCw, Tag, TrendingUp } from 'lucide-react'
import { fetchPlans, updatePlanCatalog, DEFAULT_PLANS, type PlanDef } from '@/lib/admin-api'
import { toast } from 'sonner'

const PLAN_COLOR: Record<string, { badge: string; ring: string; bar: string }> = {
  STARTER:      { badge: 'bg-gray-100 text-gray-700',    ring: 'border-gray-300',   bar: 'bg-gray-400'   },
  PROFESSIONAL: { badge: 'bg-blue-50 text-blue-700',     ring: 'border-blue-400',   bar: 'bg-blue-500'   },
  ENTERPRISE:   { badge: 'bg-purple-50 text-purple-700', ring: 'border-purple-400', bar: 'bg-purple-500' },
  CUSTOM:       { badge: 'bg-amber-50 text-amber-800',   ring: 'border-amber-400',  bar: 'bg-amber-500'  },
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

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-base font-bold text-gray-900">Subscription Plans</h1>
          <p className="text-sm text-gray-500">Manage pricing tiers and feature sets</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="ml-auto flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 bg-white text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Plan Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {plans.map(plan => {
          const c = PLAN_COLOR[plan.key] ?? PLAN_COLOR.STARTER
          return (
            <div key={plan.key} className={`bg-white rounded-2xl border-2 p-6 flex flex-col transition-all ${c.ring}`}>
              <div className="flex items-start justify-between mb-4">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${c.badge}`}>
                  <Tag size={11} />{plan.name}
                </span>
                <button
                  onClick={() => setEditPlan(plan)}
                  className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                >
                  <Edit2 size={13} />
                </button>
              </div>

              <div className="mb-1">
                <span className="text-3xl font-bold text-gray-900">{plan.currency}{plan.price.toLocaleString()}</span>
                <span className="text-sm text-gray-400 ml-1">/{plan.interval}</span>
              </div>
              <p className="text-xs text-gray-500 mb-5">{plan.description}</p>

              <div className="space-y-2 mb-6 flex-1">
                {plan.features.map(f => (
                  <div key={f} className="flex items-center gap-2">
                    <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${c.bar}`}>
                      <Check size={9} className="text-white" />
                    </div>
                    <span className="text-xs text-gray-600">{f}</span>
                  </div>
                ))}
              </div>

              <div className="pt-4 border-t border-gray-100 space-y-2">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <Users size={12} />
                    {plan.maxUsers === -1 ? 'Unlimited users' : `${plan.maxUsers} users`}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <GitBranch size={12} />
                    {plan.maxBranches === -1 ? 'Unlimited branches' : `${plan.maxBranches} branches`}
                  </div>
                </div>
                {typeof plan.tenantCount === 'number' && (
                  <p className="text-[11px] text-gray-400">{plan.tenantCount} tenant{plan.tenantCount === 1 ? '' : 's'} on this plan</p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Comparison Table */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-900">Plan Comparison</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Feature</th>
                {plans.map(p => (
                  <th key={p.key} className="px-5 py-3 text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{p.name}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {[
                { label: 'Monthly Price', render: (p: PlanDef) => `${p.currency}${p.price.toLocaleString()}` },
                { label: 'Users',        render: (p: PlanDef) => p.maxUsers === -1 ? 'Unlimited' : String(p.maxUsers) },
                { label: 'Branches',     render: (p: PlanDef) => p.maxBranches === -1 ? 'Unlimited' : String(p.maxBranches) },
                { label: 'Features',     render: (p: PlanDef) => String(p.features.length) + ' included' },
              ].map(row => (
                <tr key={row.label} className="hover:bg-gray-50">
                  <td className="px-5 py-3 text-xs font-medium text-gray-700">{row.label}</td>
                  {plans.map(p => (
                    <td key={p.key} className="px-5 py-3 text-xs text-center text-gray-600 font-mono">{row.render(p)}</td>
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
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-sm font-bold text-gray-900">Edit Plan — {plan.name}</h3>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"><X size={16} /></button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Plan Name</label>
              <input
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-gray-900/10"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Price ({form.currency})</label>
              <input
                type="number"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-gray-900/10"
                value={form.price}
                onChange={e => setForm(f => ({ ...f, price: Number(e.target.value) }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Max Users <span className="text-gray-400">(-1 = unlimited)</span></label>
              <input
                type="number"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-gray-900/10"
                value={form.maxUsers}
                onChange={e => setForm(f => ({ ...f, maxUsers: Number(e.target.value) }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Max Branches <span className="text-gray-400">(-1 = unlimited)</span></label>
              <input
                type="number"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-gray-900/10"
                value={form.maxBranches}
                onChange={e => setForm(f => ({ ...f, maxBranches: Number(e.target.value) }))}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
            <input
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-gray-900/10"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">Features</label>
            <div className="space-y-1.5 mb-2">
              {form.features.map((feat, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="flex-1 px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-100 rounded-lg text-gray-700">{feat}</div>
                  <button onClick={() => removeFeature(i)} className="p-1 text-gray-400 hover:text-red-500 transition-colors">
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-gray-900/10"
                placeholder="Add feature…"
                value={featInput}
                onChange={e => setFeatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addFeature()}
              />
              <button onClick={addFeature} className="px-3 py-1.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800">
                <Plus size={14} />
              </button>
            </div>
          </div>
        </div>

        {error && <p className="mt-4 text-xs text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
          <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50">
            <TrendingUp size={13} />{saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
