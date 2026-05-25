'use client'

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, TrendingUp, Building2, Users, CreditCard } from 'lucide-react'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { fetchTenants, type TenantRow } from '@/lib/admin-api'

function Skeleton({ h = 'h-8', w = 'w-full' }: { h?: string; w?: string }) {
  return <div className={`${h} ${w} bg-gray-100 rounded-lg animate-pulse`} />
}

const PLAN_COLORS: Record<string, string> = {
  STARTER: '#6b7280', PROFESSIONAL: '#374151', ENTERPRISE: '#f59e0b',
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

export default function AnalyticsPage() {
  const [tenants, setTenants] = useState<TenantRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchTenants({ limit: '500' })
      setTenants(res.data)
    } catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const monthlyData = buildMonthlyData(tenants)

  const planData = ['STARTER', 'PROFESSIONAL', 'ENTERPRISE'].map(plan => ({
    name: plan.charAt(0) + plan.slice(1).toLowerCase(),
    value: tenants.filter(t => t.plan === plan).length,
    plan,
  })).filter(p => p.value > 0)

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

  const summaryCards = [
    { label: 'Total Tenants',  value: tenants.length,                                    icon: Building2,  color: 'text-blue-600',   bg: 'bg-blue-50'    },
    { label: 'Active',         value: tenants.filter(t => t.status === 'ACTIVE').length,  icon: TrendingUp, color: 'text-green-600',  bg: 'bg-green-50'   },
    { label: 'Total Users',    value: tenants.reduce((s, t) => s + (t._count?.users ?? 0), 0), icon: Users, color: 'text-violet-600', bg: 'bg-violet-50' },
    { label: 'Enterprise',     value: tenants.filter(t => t.plan === 'ENTERPRISE').length, icon: CreditCard,color: 'text-amber-600',  bg: 'bg-amber-50'   },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-base font-bold text-gray-900">Analytics</h1>
        <button onClick={load} disabled={loading} className="ml-auto flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 bg-white text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-50">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryCards.map(c => (
          <div key={c.label} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl ${c.bg} flex items-center justify-center flex-shrink-0`}>
              <c.icon size={15} className={c.color} />
            </div>
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wide">{c.label}</p>
              <p className="text-xl font-bold text-gray-900">{loading ? '—' : c.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tenant Growth + Plan Pie */}
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Tenant Growth (12 months)</h2>
          {loading ? <Skeleton h="h-48" /> : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="newTenants" stroke="#111827" strokeWidth={2.5} dot={false} name="New" />
                <Line type="monotone" dataKey="cumulative" stroke="#9ca3af" strokeWidth={1.5} dot={false} strokeDasharray="4 2" name="Cumulative" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Plan Distribution</h2>
          {loading ? <Skeleton h="h-44" /> : planData.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-10">No data</p>
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
                      <span className="text-gray-600">{p.name}</span>
                    </div>
                    <span className="font-semibold text-gray-800">{p.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Status Bar + Country */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Tenants by Status</h2>
          {loading ? <Skeleton h="h-44" /> : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={statusData} barSize={50}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip formatter={(v: number) => [v + ' tenants']} />
                {statusData.map(s => (
                  <Bar key={s.status} dataKey="value" fill={STATUS_COLORS[s.status] ?? '#9ca3af'} radius={[4, 4, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Tenants by Country</h2>
          {loading ? <Skeleton h="h-44" /> : countryData.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-10">No data</p>
          ) : (
            <div className="space-y-2.5">
              {countryData.map(c => (
                <div key={c.country} className="flex items-center gap-3">
                  <span className="text-xs font-mono text-gray-600 w-8">{c.country}</span>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gray-900 rounded-full"
                      style={{ width: `${(c.count / tenants.length) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-gray-800 w-6 text-right">{c.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
