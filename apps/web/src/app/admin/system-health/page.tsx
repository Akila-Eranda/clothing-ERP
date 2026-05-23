'use client'

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, CheckCircle, XCircle, AlertTriangle, Activity, Database, Wifi, Server } from 'lucide-react'
import { fetchHealth } from '@/lib/admin-api'

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span className={`inline-flex w-2.5 h-2.5 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'} animate-pulse`} />
  )
}

export default function SystemHealthPage() {
  const [health, setHealth]     = useState<any>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [lastCheck, setLastCheck] = useState<Date | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const h = await fetchHealth()
      setHealth(h)
      setLastCheck(new Date())
    } catch (e: any) {
      setError(e.message || 'Failed to reach API')
      setHealth(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 30_000)
    return () => clearInterval(id)
  }, [load])

  const apiOk    = !error && health !== null
  const dbOk     = health?.info?.database?.status === 'up' || health?.status === 'ok'
  const redisOk  = health?.info?.redis?.status === 'up' || health?.status === 'ok'
  const allOk    = apiOk && dbOk && redisOk

  const services = [
    {
      name: 'API Server',
      description: 'NestJS application server',
      ok: apiOk,
      icon: Server,
      detail: error || (apiOk ? 'Responding normally' : 'Not reachable'),
    },
    {
      name: 'PostgreSQL Database',
      description: 'Primary data store',
      ok: dbOk,
      icon: Database,
      detail: dbOk ? 'Connected & accepting queries' : 'Connection issue',
    },
    {
      name: 'Redis Cache',
      description: 'Session & queue store',
      ok: redisOk,
      icon: Activity,
      detail: redisOk ? 'Connected & operating' : 'Connection issue',
    },
    {
      name: 'Network',
      description: 'Frontend → API connectivity',
      ok: apiOk,
      icon: Wifi,
      detail: apiOk ? 'Reachable from browser' : 'Cannot reach API',
    },
  ]

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-base font-bold text-gray-900">System Health</h1>
          {lastCheck && (
            <p className="text-sm text-gray-500">Last checked: {lastCheck.toLocaleTimeString()}</p>
          )}
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="ml-auto flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 bg-white text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Overall status */}
      <div className={`rounded-xl border p-5 flex items-center gap-4 ${allOk ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
        {loading ? (
          <RefreshCw size={20} className="text-gray-400 animate-spin" />
        ) : allOk ? (
          <CheckCircle size={28} className="text-green-600 flex-shrink-0" />
        ) : (
          <AlertTriangle size={28} className="text-red-500 flex-shrink-0" />
        )}
        <div>
          <p className={`text-base font-bold ${allOk ? 'text-green-800' : 'text-red-800'}`}>
            {loading ? 'Checking…' : allOk ? 'All Systems Operational' : 'Service Disruption Detected'}
          </p>
          <p className={`text-sm ${allOk ? 'text-green-700' : 'text-red-700'}`}>
            {loading ? 'Running health checks…' : allOk ? 'FashionERP platform is running normally.' : 'One or more services are experiencing issues.'}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <StatusDot ok={!loading && allOk} />
          <span className={`text-xs font-semibold ${allOk ? 'text-green-700' : 'text-red-600'}`}>
            {loading ? 'Checking' : allOk ? 'Healthy' : 'Degraded'}
          </span>
        </div>
      </div>

      {/* Service cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {services.map(svc => {
          const Icon = svc.icon
          return (
            <div key={svc.name} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${svc.ok ? 'bg-green-50' : 'bg-red-50'}`}>
                    <Icon size={18} className={svc.ok ? 'text-green-600' : 'text-red-500'} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{svc.name}</p>
                    <p className="text-xs text-gray-400">{svc.description}</p>
                  </div>
                </div>
                {loading ? (
                  <RefreshCw size={14} className="text-gray-300 animate-spin" />
                ) : svc.ok ? (
                  <CheckCircle size={16} className="text-green-500" />
                ) : (
                  <XCircle size={16} className="text-red-500" />
                )}
              </div>
              <div className={`px-3 py-2 rounded-lg text-xs ${svc.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                {loading ? 'Checking…' : svc.detail}
              </div>
            </div>
          )
        })}
      </div>

      {/* Raw health response */}
      {health && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Raw Health Response</h2>
          <pre className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3 overflow-x-auto font-mono">
            {JSON.stringify(health, null, 2)}
          </pre>
        </div>
      )}

      {/* Auto refresh notice */}
      <p className="text-xs text-gray-400 text-center">Auto-refreshes every 30 seconds</p>
    </div>
  )
}
