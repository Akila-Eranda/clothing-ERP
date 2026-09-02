'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Building2, Users, Activity,
  AlertTriangle, CheckCircle, DollarSign, Clock, Loader2,
} from 'lucide-react'
import { ColumnDef } from '@tanstack/react-table'
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { ClientSideTable, DataTableColumnHeader, OpenRecordButton } from '@/components/table'
import { fetchPlatformOverview, fetchHealth, type PlatformOverview, type HealthData } from '@/lib/admin-api'
import { Button } from '@/components/ui/button'
import { PageHeader, PageKpiGrid, pageKpi } from '@/components/ui/page-kpi'
import { AdminStatusBadge, AdminPlanBadge } from '@/components/admin/admin-badges'
import { ADMIN_CARD } from '@/lib/admin-ui'
import { cn } from '@/lib/utils'

type RecentTenant = PlatformOverview['recentTenants'][number]

function Skeleton({ h = 'h-8', w = 'w-full' }: { h?: string; w?: string }) {
  return <div className={cn(h, w, 'bg-muted rounded-lg animate-pulse')} />
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('en-LK', { day: 'numeric', month: 'short', year: '2-digit' })
}

const PLAN_COLORS: Record<string, string> = {
  STARTER: '#6b7280', PROFESSIONAL: '#3b82f6', ENTERPRISE: '#f59e0b', CUSTOM: '#8b5cf6',
}

export default function AdminDashboardPage() {
  const router = useRouter()
  const [overview, setOverview] = useState<PlatformOverview | null>(null)
  const [health, setHealth]     = useState<HealthData | null>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [o, h] = await Promise.all([
        fetchPlatformOverview(),
        fetchHealth().catch(() => null),
      ])
      setOverview(o)
      setHealth(h)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const recentColumns = useMemo<ColumnDef<RecentTenant>[]>(
    () => [
      {
        id: 'name',
        accessorKey: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
        cell: ({ row }) => {
          const t = row.original
          return (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-foreground text-background text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                {t.name.charAt(0)}
              </div>
              <div>
                <OpenRecordButton
                  onClick={() => router.push(`/admin/tenants/${t.id}`)}
                  className="text-xs"
                  title="View tenant"
                >
                  {t.name}
                </OpenRecordButton>
                <p className="text-[10px] text-muted-foreground">{t.email}</p>
              </div>
            </div>
          )
        },
      },
      {
        id: 'subdomain',
        accessorKey: 'subdomain',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Subdomain" />,
        cell: ({ row }) => (
          <span className="text-xs font-mono text-muted-foreground">{row.original.subdomain}</span>
        ),
      },
      {
        id: 'plan',
        accessorKey: 'plan',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Plan" />,
        cell: ({ row }) => <AdminPlanBadge plan={row.original.plan} />,
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => <AdminStatusBadge status={row.original.status} />,
      },
      {
        id: 'users',
        accessorKey: 'userCount',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Users" />,
        cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.userCount}</span>,
      },
      {
        id: 'joined',
        accessorFn: (t) => fmtDate(t.createdAt),
        header: ({ column }) => <DataTableColumnHeader column={column} title="Joined" />,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{fmtDate(row.original.createdAt)}</span>
        ),
      },
    ],
    [router],
  )

  const stats = overview?.stats
  const recentTenants = overview?.recentTenants ?? []

  const kpiItems = stats ? [
    { ...pageKpi('Total Tenants', stats.totalTenants, Building2, 'primary'), href: '/admin/tenants' },
    { ...pageKpi('Active', stats.activeTenants, CheckCircle, 'success'), href: '/admin/tenants?status=ACTIVE' },
    { ...pageKpi('On Trial', stats.trialTenants, Clock, 'info'), href: '/admin/subscriptions' },
    { ...pageKpi('Total Users', stats.totalUsers, Users, 'neutral'), href: '/admin/users' },
    { ...pageKpi('MRR', `Rs.${stats.mrr.toLocaleString()}`, DollarSign, 'success'), href: '/admin/subscriptions' },
    {
      ...pageKpi(
        'System Health',
        health?.status === 'ok' ? 'Healthy' : 'Check',
        Activity,
        health?.status === 'ok' ? 'success' : 'danger',
      ),
      href: '/admin/system-health',
    },
  ] : []

  const planDonut = overview?.planBreakdown.filter(p => p.count > 0).map(p => ({
    name: p.plan, value: p.count,
  })) ?? []

  if (error) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
      <AlertTriangle size={32} className="text-amber-400" />
      <p className="text-sm font-medium text-foreground">Could not load dashboard</p>
      <p className="text-xs text-muted-foreground">{error}</p>
      <Button variant="default" size="sm" onClick={load}>Retry</Button>
    </div>
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Platform overview and recent activity"
        onRefresh={load}
        refreshing={loading}
      />

      {!loading && overview && overview.alerts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {overview.alerts.map((a, i) => (
            <Link key={i} href={a.href ?? '/admin/dashboard'}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border',
                a.severity === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-700 dark:text-red-400' :
                a.severity === 'warning' ? 'bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-400' :
                'bg-primary/10 border-primary/20 text-primary',
              )}>
              <AlertTriangle size={12} /> {a.message}
            </Link>
          ))}
        </div>
      )}

      <PageKpiGrid items={kpiItems} loading={loading} cols={6} />

      <div className="grid lg:grid-cols-3 gap-4">
        <div className={cn(ADMIN_CARD, 'p-5 lg:col-span-2')}>
          <h2 className="text-sm font-semibold text-foreground mb-4">Tenants by Plan</h2>
          {loading ? <Skeleton h="h-48" /> : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={overview?.planBreakdown ?? []} barSize={40}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="plan" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip formatter={(v: number) => [v + ' tenants']} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} fill="hsl(var(--foreground))"
                  label={{ position: 'top', fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className={cn(ADMIN_CARD, 'p-5')}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-foreground">Trials Expiring</h2>
            <Link href="/admin/subscriptions" className="text-[10px] text-muted-foreground hover:text-foreground">View all →</Link>
          </div>
          {loading ? <Skeleton h="h-40" /> : (overview?.trialsExpiring.length ?? 0) === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-10">No trials expiring soon</p>
          ) : (
            <div className="space-y-2">
              {overview!.trialsExpiring.slice(0, 5).map(t => (
                <Link key={t.id} href={`/admin/tenants/${t.id}`}
                  className="flex items-center justify-between p-2.5 rounded-lg hover:bg-muted/60 group">
                  <div>
                    <p className="text-xs font-semibold text-foreground">{t.name}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">{t.subdomain}</p>
                  </div>
                  <span className={cn(
                    'text-[10px] font-bold px-2 py-0.5 rounded-full',
                    t.daysLeft <= 2 ? 'bg-red-500/10 text-red-600 dark:text-red-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
                  )}>{t.daysLeft}d left</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className={cn(ADMIN_CARD, 'p-5')}>
          <h2 className="text-sm font-semibold text-foreground mb-4">Plan Distribution</h2>
          {loading ? <Skeleton h="h-40" /> : planDonut.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-10">No data yet</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={planDonut} dataKey="value" nameKey="name" cx="50%" cy="50%"
                    innerRadius={42} outerRadius={68} paddingAngle={2}>
                    {planDonut.map(p => (
                      <Cell key={p.name} fill={PLAN_COLORS[p.name] ?? '#9ca3af'} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number, n: string) => [v + ' tenants', n]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-2">
                {planDonut.map(p => (
                  <div key={p.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: PLAN_COLORS[p.name] ?? '#9ca3af' }} />
                      <span className="text-muted-foreground">{p.name}</span>
                    </div>
                    <span className="font-semibold text-foreground">{p.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className={cn(ADMIN_CARD, 'overflow-hidden lg:col-span-2')}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">Recent Tenants</h2>
            <Link href="/admin/tenants" className="text-xs text-muted-foreground hover:text-foreground">View all →</Link>
          </div>
          <div className="p-3">
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 size={16} className="animate-spin text-muted-foreground" />
              </div>
            ) : (
              <ClientSideTable
                data={recentTenants}
                columns={recentColumns}
                searchableColumns={[
                  { id: 'name', title: 'Name / subdomain' },
                ]}
                filterableColumns={[]}
                isShowExportButtons={{ isShow: true, fileName: 'recent-tenants' }}
              />
            )}
          </div>
        </div>
      </div>

      {!loading && (
        <div className="grid sm:grid-cols-4 gap-3">
          {[
            { label: 'Onboard Tenant', href: '/admin/tenants?create=1', desc: 'New workspace' },
            { label: 'Manage Plans', href: '/admin/plans', desc: 'Pricing & limits' },
            { label: 'Activity Logs', href: '/admin/activity-logs', desc: 'Audit trail' },
            { label: 'Platform Settings', href: '/admin/settings', desc: 'Configuration' },
          ].map(a => (
            <Link key={a.href} href={a.href}
              className={cn(ADMIN_CARD, 'p-4 hover:border-primary/25 transition-colors block')}>
              <p className="text-sm font-semibold text-foreground">{a.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{a.desc}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
