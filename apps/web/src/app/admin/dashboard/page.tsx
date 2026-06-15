'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Building2, Users, Activity, RefreshCw,
  AlertTriangle, CheckCircle, ArrowUpRight, DollarSign, Clock,
} from 'lucide-react'
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { fetchPlatformOverview, fetchHealth, type PlatformOverview, type HealthData } from '@/lib/admin-api'

function Skeleton({ h = 'h-8', w = 'w-full' }: { h?: string; w?: string }) {
  return <div className={`${h} ${w} bg-gray-100 rounded-lg animate-pulse`} />
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('en-LK', { day: 'numeric', month: 'short', year: '2-digit' })
}

const STATUS_BADGE: Record<string, string> = {
  ACTIVE:    'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-50 text-green-700',
  SUSPENDED: 'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700',
  TRIAL:     'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700',
  INACTIVE:  'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-500',
}
const PLAN_COLORS: Record<string, string> = {
  STARTER: '#6b7280', PROFESSIONAL: '#374151', ENTERPRISE: '#f59e0b', CUSTOM: '#8b5cf6',
}

export default function AdminDashboardPage() {
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

  const stats = overview?.stats
  const statCards = stats ? [
    { label: 'Total Tenants',  value: stats.totalTenants,    icon: Building2,   color: 'text-blue-600',   bg: 'bg-blue-50',    href: '/admin/tenants' },
    { label: 'Active',         value: stats.activeTenants,   icon: CheckCircle, color: 'text-green-600',  bg: 'bg-green-50',   href: '/admin/tenants?status=ACTIVE' },
    { label: 'On Trial',       value: stats.trialTenants,    icon: Clock,       color: 'text-cyan-600',   bg: 'bg-cyan-50',    href: '/admin/subscriptions' },
    { label: 'Total Users',    value: stats.totalUsers,      icon: Users,       color: 'text-violet-600', bg: 'bg-violet-50',  href: '/admin/users' },
    { label: 'MRR',            value: `Rs.${stats.mrr.toLocaleString()}`, icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-50', href: '/admin/subscriptions' },
    { label: 'System Health',  value: health?.status === 'ok' ? 'Healthy' : 'Check', icon: Activity, color: health?.status === 'ok' ? 'text-green-600' : 'text-red-600', bg: health?.status === 'ok' ? 'bg-green-50' : 'bg-red-50', href: '/admin/system-health' },
  ] : []

  const planDonut = overview?.planBreakdown.filter(p => p.count > 0).map(p => ({
    name: p.plan, value: p.count,
  })) ?? []

  if (error) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
      <AlertTriangle size={32} className="text-amber-400" />
      <p className="text-sm font-medium text-gray-700">Could not load dashboard</p>
      <p className="text-xs text-gray-400">{error}</p>
      <button onClick={load} className="px-4 py-2 text-xs bg-gray-900 text-white rounded-lg hover:bg-gray-800">
        <RefreshCw size={12} className="inline mr-1" />Retry
      </button>
    </div>
  )

  return (
    <div className="space-y-6">

      {/* Alerts strip */}
      {!loading && overview && overview.alerts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {overview.alerts.map((a, i) => (
            <Link key={i} href={a.href ?? '/admin/dashboard'}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border ${
                a.severity === 'error' ? 'bg-red-50 border-red-200 text-red-700' :
                a.severity === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-700' :
                'bg-blue-50 border-blue-200 text-blue-700'
              }`}>
              <AlertTriangle size={12} /> {a.message}
            </Link>
          ))}
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {loading ? Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 space-y-2">
            <Skeleton h="h-4" w="w-1/2" /><Skeleton h="h-8" /><Skeleton h="h-3" w="w-2/3" />
          </div>
        )) : statCards.map(c => (
          <Link key={c.label} href={c.href} className="bg-white rounded-xl border border-gray-200 p-5 flex items-start gap-4 hover:border-gray-300 hover:shadow-sm transition-all group">
            <div className={`w-10 h-10 rounded-xl ${c.bg} flex items-center justify-center flex-shrink-0`}>
              <c.icon size={18} className={c.color} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-500 mb-0.5">{c.label}</p>
              <p className="text-2xl font-bold text-gray-900">{c.value}</p>
            </div>
            <ArrowUpRight size={14} className="text-gray-300 group-hover:text-gray-500 flex-shrink-0 mt-1 transition-colors" />
          </Link>
        ))}
      </div>

      {/* Charts + Trials expiring */}
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Tenants by Plan</h2>
          {loading ? <Skeleton h="h-48" /> : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={overview?.planBreakdown ?? []} barSize={40}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="plan" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip formatter={(v: number) => [v + ' tenants']} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} fill="#111827"
                  label={{ position: 'top', fontSize: 11, fill: '#6b7280' }} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900">Trials Expiring</h2>
            <Link href="/admin/subscriptions" className="text-[10px] text-gray-400 hover:text-gray-700">View all →</Link>
          </div>
          {loading ? <Skeleton h="h-40" /> : (overview?.trialsExpiring.length ?? 0) === 0 ? (
            <p className="text-xs text-gray-400 text-center py-10">No trials expiring soon</p>
          ) : (
            <div className="space-y-2">
              {overview!.trialsExpiring.slice(0, 5).map(t => (
                <Link key={t.id} href={`/admin/tenants/${t.id}`}
                  className="flex items-center justify-between p-2.5 rounded-lg hover:bg-gray-50 group">
                  <div>
                    <p className="text-xs font-semibold text-gray-800 group-hover:text-gray-900">{t.name}</p>
                    <p className="text-[10px] text-gray-400 font-mono">{t.subdomain}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    t.daysLeft <= 2 ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'
                  }`}>{t.daysLeft}d left</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Plan donut + Recent tenants */}
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Plan Distribution</h2>
          {loading ? <Skeleton h="h-40" /> : planDonut.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-10">No data yet</p>
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
                      <span className="text-gray-600">{p.name}</span>
                    </div>
                    <span className="font-semibold text-gray-800">{p.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden lg:col-span-2">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Recent Tenants</h2>
            <div className="flex items-center gap-2">
              <Link href="/admin/tenants" className="text-xs text-gray-500 hover:text-gray-800">View all →</Link>
              <button onClick={load} disabled={loading} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Name', 'Subdomain', 'Plan', 'Status', 'Users', 'Joined'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center">
                    <RefreshCw size={16} className="animate-spin mx-auto text-gray-300" />
                  </td></tr>
                ) : (overview?.recentTenants.length ?? 0) === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">No tenants yet</td></tr>
                ) : overview!.recentTenants.map(t => (
                  <tr key={t.id} className="hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => window.location.href = `/admin/tenants/${t.id}`}>
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
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-600">{t.plan}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={STATUS_BADGE[t.status] ?? STATUS_BADGE.INACTIVE}>{t.status}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">{t.userCount}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(t.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      {!loading && (
        <div className="grid sm:grid-cols-4 gap-3">
          {[
            { label: 'Onboard Tenant', href: '/admin/tenants?create=1', desc: 'New workspace' },
            { label: 'Manage Plans', href: '/admin/plans', desc: 'Pricing & limits' },
            { label: 'Activity Logs', href: '/admin/activity-logs', desc: 'Audit trail' },
            { label: 'Platform Settings', href: '/admin/settings', desc: 'Configuration' },
          ].map(a => (
            <Link key={a.href} href={a.href}
              className="p-4 bg-white rounded-xl border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all">
              <p className="text-sm font-semibold text-gray-900">{a.label}</p>
              <p className="text-xs text-gray-400 mt-0.5">{a.desc}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
