'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { TrendingUp, Edit2, X, CheckCircle, AlertCircle, FileText, DollarSign, Users, Clock } from 'lucide-react'
import { ColumnDef } from '@tanstack/react-table'
import { ClientSideTable, DataTableColumnHeader } from '@/components/table'
import { fetchTenants, fetchPlans, fetchBillingSummary, updateTenant, type TenantRow, type PlanDef } from '@/lib/admin-api'
import SubscriptionInvoiceModal from '@/components/admin/SubscriptionInvoiceModal'
import { Button } from '@/components/ui/button'
import { PageHeader, PageKpiGrid, pageKpi } from '@/components/ui/page-kpi'
import { AdminStatusBadge, AdminPlanBadge } from '@/components/admin/admin-badges'
import { ADMIN_MODAL_PANEL } from '@/lib/admin-ui'
import { cn } from '@/lib/utils'

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
          <p className="text-xs font-semibold text-foreground">{row.original.name}</p>
          <p className="text-[10px] text-muted-foreground">{row.original.email}</p>
        </div>
      ),
    },
    {
      accessorKey: 'subdomain',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Subdomain" />,
      cell: ({ row }) => (
        <span className="text-xs font-mono text-muted-foreground">{row.original.subdomain}</span>
      ),
    },
    {
      accessorKey: 'plan',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Plan" />,
      cell: ({ row }) => <AdminPlanBadge plan={row.original.plan} />,
    },
    {
      accessorKey: 'status',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => <AdminStatusBadge status={row.original.status} />,
    },
    {
      id: 'trialEndsAt',
      accessorFn: (t) => t.trialEndsAt ?? '',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Trial ends" />,
      cell: ({ row }) => {
        const t = row.original
        return (
          <span className="text-xs text-muted-foreground whitespace-nowrap">
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
        <span className="text-xs text-muted-foreground">
          {row.original._count?.users ?? 0} / {formatLimit(row.original.maxUsers)}
        </span>
      ),
    },
    {
      id: 'branches',
      accessorFn: (t) => t._count?.branches ?? 0,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Branches" />,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original._count?.branches ?? 0} / {formatLimit(row.original.maxBranches)}
        </span>
      ),
    },
    {
      accessorKey: 'createdAt',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Joined" />,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
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
              className="text-muted-foreground hover:text-emerald-600 hover:bg-emerald-500/10"
            >
              <FileText size={13} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setEditTenant(t)}
              className="text-muted-foreground hover:text-primary hover:bg-primary/10"
            >
              <Edit2 size={13} />
            </Button>
          </div>
        )
      },
    },
  ], [])

  const kpis = billing ? [
    pageKpi('MRR', `LKR ${billing.mrr.toLocaleString()}`, DollarSign, 'success'),
    pageKpi('ARR', `LKR ${billing.arr.toLocaleString()}`, TrendingUp, 'primary'),
    pageKpi('Active', billing.activeTenants, Users, 'success'),
    pageKpi('Trials', billing.trialTenants, Clock, 'warning'),
    pageKpi('Due invoices', billing.recentInvoices.filter(i => i.status === 'DUE').length, FileText, 'danger'),
  ] : [
    pageKpi('MRR', '—', DollarSign, 'success'),
    pageKpi('ARR', '—', TrendingUp, 'primary'),
    pageKpi('Active', '—', Users, 'success'),
    pageKpi('Trials', '—', Clock, 'warning'),
    pageKpi('Due invoices', '—', FileText, 'danger'),
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Subscriptions"
        description={
          loading
            ? 'Loading…'
            : `${filtered.length} tenant${filtered.length === 1 ? '' : 's'}${planFilter !== 'ALL' ? ` · ${planFilter}` : ''}`
        }
        onRefresh={() => load(planFilter === 'ALL' ? undefined : planFilter)}
        refreshing={loading}
      />

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 text-sm text-red-700 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      <PageKpiGrid items={kpis} loading={loading && !billing} cols={5} />

      <div className="flex flex-wrap gap-2">
        {breakdown.map(p => (
          <div
            key={p.id}
            className="inline-flex items-center gap-2 h-9 px-3 rounded-xl border border-border bg-card text-xs font-medium"
          >
            <AdminPlanBadge plan={p.id} />
            <span className="font-bold tabular-nums text-foreground">{p.count}</span>
            <span className="text-muted-foreground">{p.active} active · {p.price}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Filter:</span>
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
      <div className={cn(ADMIN_MODAL_PANEL, 'max-w-sm')}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-sm font-bold text-foreground">Change Plan</h3>
            <p className="text-xs text-muted-foreground">{tenant.name}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Limits update automatically from plan catalog</p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose} className="text-muted-foreground"><X size={16} /></Button>
        </div>
        {done ? (
          <div className="text-center py-4">
            <CheckCircle size={32} className="text-emerald-500 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Plan updated to <strong className="text-foreground">{plan}</strong></p>
          </div>
        ) : (
          <>
            <div className="space-y-2 mb-5 max-h-64 overflow-y-auto">
              {options.map(p => (
                <label key={p.key} className={cn(
                  'flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all',
                  plan === p.key ? 'border-foreground bg-muted/50' : 'border-border hover:border-muted-foreground/40',
                )}>
                  <input type="radio" value={p.key} checked={plan === p.key} onChange={() => setPlan(p.key)} className="accent-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{p.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{p.description}</p>
                  </div>
                </label>
              ))}
            </div>
            {error && <p className="text-xs text-red-600 dark:text-red-400 mb-3">{error}</p>}
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
