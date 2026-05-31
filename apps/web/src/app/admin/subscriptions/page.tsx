'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { RefreshCw, CreditCard, TrendingUp, Edit2, X, CheckCircle, AlertCircle } from 'lucide-react'
import { fetchTenants, fetchPlans, updateTenant, type TenantRow, type PlanDef } from '@/lib/admin-api'

const PLAN_BADGE: Record<string, string> = {
  STARTER:      'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-600',
  PROFESSIONAL: 'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700',
  ENTERPRISE:   'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-50 text-purple-700',
  CUSTOM:       'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-800',
}
const STATUS_BADGE: Record<string, string> = {
  ACTIVE:    'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-50 text-green-700',
  TRIAL:     'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700',
  SUSPENDED: 'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700',
  CANCELLED: 'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-500',
}

const PLAN_CARD_COLOR: Record<string, string> = {
  STARTER: 'bg-gray-100 text-gray-700',
  PROFESSIONAL: 'bg-blue-50 text-blue-700',
  ENTERPRISE: 'bg-purple-50 text-purple-700',
  CUSTOM: 'bg-amber-50 text-amber-800',
}

function formatLimit(n?: number) {
  if (n === undefined || n === null) return '—'
  if (n >= 999_999 || n < 0) return '∞'
  return String(n)
}

export default function SubscriptionsPage() {
  const [tenants, setTenants] = useState<TenantRow[]>([])
  const [plans, setPlans] = useState<PlanDef[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [planFilter, setPlanFilter] = useState('ALL')
  const [editTenant, setEditTenant] = useState<TenantRow | null>(null)

  const load = useCallback(async (plan?: string) => {
    setLoading(true)
    setError('')
    const p: Record<string, string> = { limit: '500' }
    if (plan && plan !== 'ALL') p.plan = plan
    try {
      const [tenantRes, planList] = await Promise.all([fetchTenants(p), fetchPlans()])
      setTenants(tenantRes.data)
      setPlans(planList.filter(pl => pl.key !== 'CUSTOM' || tenantRes.data.some(t => t.plan === 'CUSTOM')))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load subscriptions')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const catalogPlans = useMemo(() => {
    const keys = plans.length > 0 ? plans : []
    if (keys.length === 0) {
      return ['STARTER', 'PROFESSIONAL', 'ENTERPRISE'].map(key => ({
        key,
        name: key.charAt(0) + key.slice(1).toLowerCase(),
        price: 0,
        currency: '',
      }))
    }
    return keys
  }, [plans])

  const filtered = planFilter === 'ALL' ? tenants : tenants.filter(t => t.plan === planFilter)

  const breakdown = catalogPlans.map(p => {
    const key = p.key
    const count = tenants.filter(t => t.plan === key).length
    const active = tenants.filter(t => t.plan === key && (t.status === 'ACTIVE' || t.status === 'TRIAL')).length
    const priceLabel =
      p.price > 0 ? `${p.currency || ''}${p.price.toLocaleString()}/mo` : 'Custom pricing'
    return {
      id: key,
      label: p.name,
      price: priceLabel,
      color: PLAN_CARD_COLOR[key] ?? PLAN_CARD_COLOR.STARTER,
      count,
      active,
    }
  })

  const filterOptions = ['ALL', ...catalogPlans.map(p => p.key)]

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-base font-bold text-gray-900">Subscriptions</h1>
          <p className="text-sm text-gray-500">
            {filtered.length} tenant{filtered.length === 1 ? '' : 's'}
            {planFilter !== 'ALL' ? ` · ${planFilter}` : ''}
          </p>
        </div>
        <button onClick={() => load(planFilter === 'ALL' ? undefined : planFilter)} disabled={loading} className="ml-auto flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 bg-white text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-50">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      <div className={`grid grid-cols-1 gap-4 ${breakdown.length <= 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2 lg:grid-cols-4'}`}>
        {breakdown.map(p => (
          <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${p.color}`}>{p.label}</span>
              <CreditCard size={16} className="text-gray-300" />
            </div>
            <p className="text-3xl font-bold text-gray-900">{p.count}</p>
            <p className="text-xs text-gray-500 mt-1">{p.active} active / trial · {p.price}</p>
            <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gray-900 rounded-full transition-all"
                style={{ width: `${tenants.length > 0 ? (p.count / tenants.length) * 100 : 0}%` }}
              />
            </div>
            <p className="text-[10px] text-gray-400 mt-1">
              {tenants.length > 0 ? Math.round((p.count / tenants.length) * 100) : 0}% of total
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-gray-600">Filter:</span>
        {filterOptions.map(f => (
          <button
            key={f}
            onClick={() => { setPlanFilter(f); load(f === 'ALL' ? undefined : f) }}
            className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${planFilter === f ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
          >
            {f === 'ALL' ? 'All Plans' : (catalogPlans.find(p => p.key === f)?.name ?? f)}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Tenant', 'Subdomain', 'Plan', 'Status', 'Trial ends', 'Users', 'Branches', 'Joined', ''].map(h => (
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
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-gray-400">No tenants for this plan</td></tr>
              )}
              {!loading && filtered.map(t => (
                <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-xs font-semibold text-gray-900">{t.name}</p>
                    <p className="text-[10px] text-gray-400">{t.email}</p>
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-gray-500">{t.subdomain}</td>
                  <td className="px-4 py-3"><span className={PLAN_BADGE[t.plan] ?? PLAN_BADGE.STARTER}>{t.plan}</span></td>
                  <td className="px-4 py-3"><span className={STATUS_BADGE[t.status] ?? STATUS_BADGE.CANCELLED}>{t.status}</span></td>
                  <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                    {t.plan === 'STARTER' && t.trialEndsAt
                      ? new Date(t.trialEndsAt).toLocaleDateString('en-LK', { day: 'numeric', month: 'short', year: '2-digit' })
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">
                    {t._count?.users ?? 0} / {formatLimit(t.maxUsers)}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">
                    {t._count?.branches ?? 0} / {formatLimit(t.maxBranches)}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                    {new Date(t.createdAt).toLocaleDateString('en-LK', { day: 'numeric', month: 'short', year: '2-digit' })}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => setEditTenant(t)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg">
                      <Edit2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editTenant && (
        <EditPlanModal
          tenant={editTenant}
          plans={plans.length > 0 ? plans : catalogPlans.map(p => ({ key: p.key, name: p.label, id: p.key } as PlanDef))}
          onClose={() => setEditTenant(null)}
          onSaved={() => { load(planFilter === 'ALL' ? undefined : planFilter); setEditTenant(null) }}
        />
      )}
    </div>
  )
}

function EditPlanModal({
  tenant,
  plans,
  onClose,
  onSaved,
}: {
  tenant: TenantRow
  plans: PlanDef[]
  onClose: () => void
  onSaved: () => void
}) {
  const [plan, setPlan] = useState(tenant.plan)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const options = plans.filter(p => p.key !== 'CUSTOM' || tenant.plan === 'CUSTOM')

  async function save() {
    setLoading(true)
    setError('')
    try {
      await updateTenant(tenant.id, { plan })
      setDone(true)
      setTimeout(onSaved, 800)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update plan')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-sm font-bold text-gray-900">Change Plan</h3>
            <p className="text-xs text-gray-500">{tenant.name}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">Limits update automatically from plan catalog</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"><X size={16} /></button>
        </div>
        {done ? (
          <div className="text-center py-4">
            <CheckCircle size={32} className="text-green-500 mx-auto mb-2" />
            <p className="text-sm text-gray-600">Plan updated to <strong>{plan}</strong></p>
          </div>
        ) : (
          <>
            <div className="space-y-2 mb-5 max-h-64 overflow-y-auto">
              {options.map(p => (
                <label key={p.key} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${plan === p.key ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <input type="radio" value={p.key} checked={plan === p.key} onChange={() => setPlan(p.key)} className="accent-gray-900" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{p.name}</p>
                    <p className="text-xs text-gray-500 truncate">{p.description}</p>
                  </div>
                </label>
              ))}
            </div>
            {error && <p className="text-xs text-red-600 mb-3">{error}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={save} disabled={loading || plan === tenant.plan} className="flex items-center gap-1.5 px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-40">
                <TrendingUp size={13} />{loading ? 'Saving…' : 'Update Plan'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
