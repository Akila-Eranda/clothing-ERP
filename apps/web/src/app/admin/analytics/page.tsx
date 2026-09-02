'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { TrendingUp, Building2, Users, CreditCard, DollarSign } from 'lucide-react'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import {
  fetchTenants, fetchPlatformAnalytics, fetchMrrChart,
  type TenantRow, type PlatformAnalytics,
} from '@/lib/admin-api'
import { toast } from 'sonner'
import { PageHeader, PageKpiGrid, pageKpi } from '@/components/ui/page-kpi'
import { ADMIN_CARD } from '@/lib/admin-ui'
import { cn } from '@/lib/utils'
import Link from 'next/link'

function Skeleton({ h = 'h-8', w = 'w-full' }: { h?: string; w?: string }) {
  return <div className={cn(h, w, 'bg-muted rounded-lg animate-pulse')} />
}

const PLAN_COLORS: Record<string, string> = {
  STARTER: '#6b7280', PROFESSIONAL: '#3b82f6', ENTERPRISE: '#f59e0b', CUSTOM: '#8b5cf6',
}
const STATUS_COLORS: Record<string, string> = {
  ACTIVE: '#22c55e', SUSPENDED: '#f59e0b', INACTIVE: '#9ca3af',
}

function buildMonthlyData(tenants: TenantRow[]) {
  const map = new Map<string, number>()
  const now = new Date()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = d.toLocaleDateString('en-LK', { month: 'short', year: '2-digit' })
    map.set(key, 0)
  }
  tenants.forEach(t => {
    const d = new Date(t.createdAt)
    const key = d.toLocaleDateString('en-LK', { month: 'short', year: '2-digit' })
    if (map.has(key)) map.set(key, (map.get(key) ?? 0) + 1)
  })
  let cumulative = 0
  return Array.from(map.entries()).map(([month, count]) => {
    cumulative += count
    return { month, newTenants: count, cumulative }
  })
}

function fmtMoney(n?: number) {
  if (n == null || Number.isNaN(n)) return '—'
  return n.toLocaleString('en-LK', { maximumFractionDigits: 0 })
}

export default function AnalyticsPage() {
  const [tenants, setTenants] = useState<TenantRow[]>([])
  const [analytics, setAnalytics] = useState<PlatformAnalytics | null>(null)
  const [mrrChart, setMrrChart] = useState<{ month: string; mrr: number }[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [analyticsRes, mrrRes, tenantsRes] = await Promise.all([
        fetchPlatformAnalytics().catch(() => null),
        fetchMrrChart().catch(() => [] as { month: string; mrr: number }[]),
        fetchTenants({ limit: '500' }).catch(() => null),
      ])
      setAnalytics(analyticsRes)
      setMrrChart(Array.isArray(mrrRes) ? mrrRes : [])
      if (tenantsRes) setTenants(tenantsRes.data)
      if (!analyticsRes && !tenantsRes) toast.error('Failed to load analytics data')
    } catch {
      toast.error('Failed to load analytics data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const hasPlatformAnalytics = !!(
    analytics &&
    (analytics.gmv != null ||
      analytics.customers != null ||
      (analytics.planMix && analytics.planMix.length > 0) ||
      (analytics.growth && analytics.growth.length > 0) ||
      (analytics.topTenants && analytics.topTenants.length > 0))
  )

  const monthlyData = useMemo(() => {
    if (hasPlatformAnalytics && analytics?.growth && analytics.growth.length > 0) {
      let cumulative = 0
      return analytics.growth.map(g => {
        cumulative += g.tenants
        return { month: g.month, newTenants: g.tenants, cumulative }
      })
    }
    return buildMonthlyData(tenants)
  }, [hasPlatformAnalytics, analytics, tenants])

  const planData = useMemo(() => {
    if (hasPlatformAnalytics && analytics?.planMix && analytics.planMix.length > 0) {
      return analytics.planMix.map(p => ({
        name: p.plan.charAt(0) + p.plan.slice(1).toLowerCase(),
        value: p.count,
        plan: p.plan,
      })).filter(p => p.value > 0)
    }
    return ['STARTER', 'PROFESSIONAL', 'ENTERPRISE'].map(plan => ({
      name: plan.charAt(0) + plan.slice(1).toLowerCase(),
      value: tenants.filter(t => t.plan === plan).length,
      plan,
    })).filter(p => p.value > 0)
  }, [hasPlatformAnalytics, analytics, tenants])

  const statusData = ['ACTIVE', 'SUSPENDED', 'INACTIVE'].map(status => ({
    name: status.charAt(0) + status.slice(1).toLowerCase(),
    value: tenants.filter(t => t.status === status).length,
    status,
  })).filter(s => s.value > 0)

  const countryData = Object.entries(
    tenants.reduce<Record<string, number>>((acc, t) => {
      acc[t.country] = (acc[t.country] ?? 0) + 1
      return acc
    }, {})
  ).map(([country, count]) => ({ country, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)

  const topTenants = hasPlatformAnalytics ? (analytics?.topTenants ?? []) : []

  const kpis = hasPlatformAnalytics
    ? [
        pageKpi('GMV', loading ? '—' : fmtMoney(analytics?.gmv), DollarSign, 'primary'),
        pageKpi('Customers', loading ? '—' : analytics?.customers ?? '—', Users, 'info'),
        pageKpi('Total Tenants', loading ? '—' : tenants.length || (analytics?.summary?.totalTenants ?? '—'), Building2, 'neutral'),
        pageKpi('Active', loading ? '—' : tenants.filter(t => t.status === 'ACTIVE').length || (analytics?.summary?.activeTenants ?? '—'), TrendingUp, 'success'),
      ]
    : [
        pageKpi('Total Tenants', loading ? '—' : tenants.length, Building2, 'primary'),
        pageKpi('Active', loading ? '—' : tenants.filter(t => t.status === 'ACTIVE').length, TrendingUp, 'success'),
        pageKpi('Total Users', loading ? '—' : tenants.reduce((s, t) => s + (t._count?.users ?? 0), 0), Users, 'neutral'),
        pageKpi('Enterprise', loading ? '—' : tenants.filter(t => t.plan === 'ENTERPRISE').length, CreditCard, 'warning'),
      ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description={hasPlatformAnalytics ? 'Platform GMV, growth, and plan mix' : 'Tenant growth and plan distribution'}
        onRefresh={load}
        refreshing={loading}
      />

      <PageKpiGrid items={kpis} loading={loading} cols={4} />

      <div className="grid lg:grid-cols-3 gap-4">
        <div className={cn(ADMIN_CARD, 'p-5 lg:col-span-2')}>
          <h2 className="text-sm font-semibold text-foreground mb-4">Tenant Growth (12 months)</h2>
          {loading ? <Skeleton h="h-48" /> : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="newTenants" stroke="hsl(var(--foreground))" strokeWidth={2.5} dot={false} name="New" />
                <Line type="monotone" dataKey="cumulative" stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} dot={false} strokeDasharray="4 2" name="Cumulative" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className={cn(ADMIN_CARD, 'p-5')}>
          <h2 className="text-sm font-semibold text-foreground mb-4">Plan Distribution</h2>
          {loading ? <Skeleton h="h-44" /> : planData.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-10">No data</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie data={planData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                    innerRadius={40} outerRadius={62} paddingAngle={3}>
                    {planData.map(p => <Cell key={p.plan} fill={PLAN_COLORS[p.plan] ?? '#9ca3af'} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => [v + ' tenants']} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-2">
                {planData.map(p => (
                  <div key={p.plan} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: PLAN_COLORS[p.plan] ?? '#9ca3af' }} />
                      <span className="text-muted-foreground">{p.name}</span>
                    </div>
                    <span className="font-semibold text-foreground">{p.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {mrrChart.length > 0 && (
        <div className={cn(ADMIN_CARD, 'p-5')}>
          <h2 className="text-sm font-semibold text-foreground mb-4">MRR Trend</h2>
          {loading ? <Skeleton h="h-48" /> : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={mrrChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: number) => [fmtMoney(v), 'MRR']} />
                <Line type="monotone" dataKey="mrr" stroke="hsl(var(--foreground))" strokeWidth={2.5} dot={false} name="MRR" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {topTenants.length > 0 && (
        <div className={cn(ADMIN_CARD, 'p-5')}>
          <h2 className="text-sm font-semibold text-foreground mb-4">Top Tenants</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border">
                  <th className="py-2 pr-3 font-semibold">Tenant</th>
                  <th className="py-2 pr-3 font-semibold text-right">GMV</th>
                  <th className="py-2 font-semibold text-right">Sales</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {topTenants.map(t => (
                  <tr key={t.id}>
                    <td className="py-2 pr-3">
                      <Link href={`/admin/tenants/${t.id}`} className="font-semibold text-foreground hover:underline">
                        {t.name}
                      </Link>
                      {t.subdomain && <p className="text-muted-foreground font-mono">{t.subdomain}</p>}
                    </td>
                    <td className="py-2 pr-3 text-right font-medium">{fmtMoney(t.gmv)}</td>
                    <td className="py-2 text-right text-muted-foreground">{t.sales ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <div className={cn(ADMIN_CARD, 'p-5')}>
          <h2 className="text-sm font-semibold text-foreground mb-4">Tenants by Status</h2>
          {loading ? <Skeleton h="h-44" /> : statusData.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-10">No tenant status data</p>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={statusData} barSize={50}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip formatter={(v: number) => [v + ' tenants']} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {statusData.map(s => (
                    <Cell key={s.status} fill={STATUS_COLORS[s.status] ?? '#9ca3af'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className={cn(ADMIN_CARD, 'p-5')}>
          <h2 className="text-sm font-semibold text-foreground mb-4">Tenants by Country</h2>
          {loading ? <Skeleton h="h-44" /> : countryData.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-10">No data</p>
          ) : (
            <div className="space-y-2.5">
              {countryData.map(c => (
                <div key={c.country} className="flex items-center gap-3">
                  <span className="text-xs font-mono text-muted-foreground w-8">{c.country}</span>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-foreground rounded-full"
                      style={{ width: `${(c.count / Math.max(tenants.length, 1)) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-foreground w-6 text-right">{c.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
