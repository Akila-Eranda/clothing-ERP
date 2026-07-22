'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { RefreshCw, TrendingUp, Edit2, X, CheckCircle, AlertCircle, FileText } from 'lucide-react'
import { ColumnDef } from '@tanstack/react-table'
import { ClientSideTable, DataTableColumnHeader } from '@/components/table'
import { fetchTenants, fetchPlans, fetchBillingSummary, updateTenant, type TenantRow, type PlanDef } from '@/lib/admin-api'
import SubscriptionInvoiceModal from '@/components/admin/SubscriptionInvoiceModal'
import { Button } from '@/components/ui/button'

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

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('en-LK', { day: 'numeric', month: 'short', year: '2-digit' })
}

export default function SubscriptionsPage() {
  const [tenants, setTenants] = useState<TenantRow[]>([])
  const [plans, setPlans] = useState<PlanDef[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [planFilter, setPlanFilter] = useState('ALL')
  const [editTenant, setEditTenant] = useState<TenantRow | null>(null)
  const [invoiceTenant, setInvoiceTenant] = useState<TenantRow | null>(null)
  const [billing, setBilling] = useState<{
    mrr: number; arr: number; totalTenants: number; activeTenants: number; trialTenants: number; trialExpiringSoon: number;
    recentInvoices: { tenantName: string; plan: string; amount: number; status: string; dueDate: string | null }[];
  } | null>(null)

  const load = useCallback(async (plan?: string) => {
    setLoading(true)
    setError('')
    const p: Record<string, string> = { limit: '500' }
    if (plan && plan !== 'ALL') p.plan = plan
    try {
      const [tenantRes, planList, billingRes] = await Promise.all([
        fetchTenants(p),
        fetchPlans(),
        fetchBillingSummary().catch(() => null),
      ])
      setTenants(tenantRes.data)
      setPlans(planList.filter(pl => pl.key !== 'CUSTOM' || tenantRes.data.some(t => t.plan === 'CUSTOM')))
      if (billingRes) setBilling(billingRes)
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

  const columns = useMemo<ColumnDef<TenantRow>[]>(() => [
    {
      id: 'name',
      accessorFn: (t) => `${t.name} ${t.subdomain ?? ''} ${t.email ?? ''}`.trim(),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tenant" />,
      cell: ({ row }) => (
        <div>
          <p className="text-xs font-semibold text-gray-900">{row.original.name}</p>
          <p className="text-[10px] text-gray-400">{row.original.email}</p>
        </div>
      ),
    },
    {
      accessorKey: 'subdomain',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Subdomain" />,
      cell: ({ row }) => (
        <span className="text-xs font-mono text-gray-500">{row.original.subdomain}</span>
      ),
    },
    {
      accessorKey: 'plan',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Plan" />,
      cell: ({ row }) => (
        <span className={PLAN_BADGE[row.original.plan] ?? PLAN_BADGE.STARTER}>{row.original.plan}</span>
      ),
    },
    {
      accessorKey: 'status',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => (
        <span className={STATUS_BADGE[row.original.status] ?? STATUS_BADGE.CANCELLED}>{row.original.status}</span>
      ),
    },
    {
      id: 'trialEndsAt',
      accessorFn: (t) => t.trialEndsAt ?? '',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Trial ends" />,
      cell: ({ row }) => {
        const t = row.original
        return (
          <span className="text-xs text-gray-600 whitespace-nowrap">
            {t.plan === 'STARTER' && t.trialEndsAt ? fmtDate(t.trialEndsAt) : '—'}
          </span>
        )
      },
    },
    {
      id: 'users',
      accessorFn: (t) => t._count?.users ?? 0,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Users" />,
      cell: ({ row }) => (
        <span className="text-xs text-gray-600">
          {row.original._count?.users ?? 0} / {formatLimit(row.original.maxUsers)}
        </span>
      ),
    },
    {
      id: 'branches',
      accessorFn: (t) => t._count?.branches ?? 0,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Branches" />,
      cell: ({ row }) => (
        <span className="text-xs text-gray-600">
          {row.original._count?.branches ?? 0} / {formatLimit(row.original.maxBranches)}
        </span>
      ),
    },
    {
      accessorKey: 'createdAt',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Joined" />,
      cell: ({ row }) => (
        <span className="text-xs text-gray-500 whitespace-nowrap">
          {fmtDate(row.original.createdAt)}
        </span>
      ),
    },
    {
      id: 'actions',
      enableSorting: false,
      cell: ({ row }) => {
        const t = row.original
        return (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setInvoiceTenant(t)}
              title="Generate invoice"
              className="text-gray-400 hover:text-emerald-600 hover:bg-emerald-50"
            >
              <FileText size={13} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setEditTenant(t)}
              className="text-gray-400 hover:text-blue-600 hover:bg-blue-50"
            >
              <Edit2 size={13} />
            </Button>
          </div>
        )
      },
    },
  ], [])

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-base font-bold text-gray-900">Subscriptions</h1>
          <p className="text-sm text-gray-500">
            {loading ? 'Loading…' : `${filtered.length} tenant${filtered.length === 1 ? '' : 's'}`}
            {!loading && planFilter !== 'ALL' ? ` · ${planFilter}` : ''}
          </p>
        </div>
        <Button variant="outline" className="ml-auto" onClick={() => load(planFilter === 'ALL' ? undefined : planFilter)} disabled={loading}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {billing && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            { label: 'MRR', value: `LKR ${billing.mrr.toLocaleString()}`, sub: 'Monthly recurring' },
            { label: 'ARR', value: `LKR ${billing.arr.toLocaleString()}`, sub: 'Annual run rate' },
            { label: 'Active Tenants', value: String(billing.activeTenants), sub: `${billing.totalTenants} total` },
            { label: 'Trials', value: String(billing.trialTenants), sub: `${billing.trialExpiringSoon} expiring soon` },
            { label: 'Due Invoices', value: String(billing.recentInvoices.filter(i => i.status === 'DUE').length), sub: 'This cycle' },
          ].map((k) => (
            <div key={k.label} className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{k.label}</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{k.value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{k.sub}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {breakdown.map(p => (
          <div
            key={p.id}
            className="inline-flex items-center gap-2 h-9 px-3 rounded-xl border bg-card text-xs font-medium"
          >
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${p.color}`}>{p.label}</span>
            <span className="font-bold tabular-nums text-foreground">{p.count}</span>
            <span className="text-muted-foreground">{p.active} active · {p.price}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-gray-600">Filter:</span>
        {filterOptions.map(f => (
          <Button
            key={f}
            size="sm"
            variant={planFilter === f ? 'default' : 'chip'}
            onClick={() => { setPlanFilter(f); load(f === 'ALL' ? undefined : f) }}
          >
            {f === 'ALL' ? 'All Plans' : (catalogPlans.find(p => p.key === f)?.name ?? f)}
          </Button>
        ))}
      </div>

      <ClientSideTable
        data={filtered}
        columns={columns}
        searchableColumns={[
          { id: 'name', title: 'Tenant / subdomain' },
        ]}
        filterableColumns={[
          {
            id: 'status',
            title: 'Status',
            options: [
              { value: 'ACTIVE', label: 'Active' },
              { value: 'TRIAL', label: 'Trial' },
              { value: 'SUSPENDED', label: 'Suspended' },
              { value: 'CANCELLED', label: 'Cancelled' },
            ],
          },
          {
            id: 'plan',
            title: 'Plan',
            options: catalogPlans.map((p) => ({ value: p.key, label: p.name })),
          },
        ]}
        isShowExportButtons={{ isShow: true, fileName: 'admin-subscriptions-export' }}
      />

      {editTenant && (
        <EditPlanModal
          tenant={editTenant}
          plans={plans.length > 0 ? plans : catalogPlans.map(p => ({ key: p.key, name: p.name, id: p.key } as PlanDef))}
          onClose={() => setEditTenant(null)}
          onSaved={() => { load(planFilter === 'ALL' ? undefined : planFilter); setEditTenant(null) }}
        />
      )}

      {invoiceTenant && (
        <SubscriptionInvoiceModal tenant={invoiceTenant} onClose={() => setInvoiceTenant(null)} />
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
          <Button variant="ghost" size="icon-sm" onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></Button>
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
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button variant="default" onClick={save} disabled={loading || plan === tenant.plan}>
                <TrendingUp size={13} />{loading ? 'Saving…' : 'Update Plan'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
