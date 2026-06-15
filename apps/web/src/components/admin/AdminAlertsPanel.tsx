'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { Bell, AlertTriangle, AlertCircle, Info } from 'lucide-react'
import { fetchPlatformOverview, type PlatformAlert } from '@/lib/admin-api'

const SEV_ICON = {
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
}

const SEV_COLOR = {
  error: 'text-red-600 bg-red-50',
  warning: 'text-amber-600 bg-amber-50',
  info: 'text-blue-600 bg-blue-50',
}

export default function AdminAlertsPanel() {
  const [open, setOpen] = useState(false)
  const [alerts, setAlerts] = useState<PlatformAlert[]>([])
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchPlatformOverview()
      .then(d => setAlerts(d.alerts))
      .catch(() => {})
  }, [])

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const count = alerts.length

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="relative p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
      >
        <Bell size={16} />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-900">Platform Alerts</p>
            <p className="text-[10px] text-gray-400">{count} item{count !== 1 ? 's' : ''} need attention</p>
          </div>
          {count === 0 ? (
            <p className="px-4 py-8 text-sm text-gray-400 text-center">All clear — no alerts</p>
          ) : (
            <div className="max-h-72 overflow-y-auto divide-y divide-gray-50">
              {alerts.map((a, i) => {
                const Icon = SEV_ICON[a.severity]
                const content = (
                  <div className="flex items-start gap-2.5 px-4 py-3 hover:bg-gray-50">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${SEV_COLOR[a.severity]}`}>
                      <Icon size={13} />
                    </div>
                    <p className="text-xs text-gray-700 leading-relaxed">{a.message}</p>
                  </div>
                )
                return a.href ? (
                  <Link key={i} href={a.href} onClick={() => setOpen(false)}>{content}</Link>
                ) : (
                  <div key={i}>{content}</div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
