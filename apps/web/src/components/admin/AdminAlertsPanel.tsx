'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { Bell, AlertTriangle, AlertCircle, Info } from 'lucide-react'
import {
  fetchPlatformOverview,
  fetchPlatformNotifications,
  type PlatformAlert,
} from '@/lib/admin-api'
import { ADMIN_CARD } from '@/lib/admin-ui'
import { cn } from '@/lib/utils'

const SEV_ICON = {
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
}

const SEV_COLOR = {
  error: 'text-red-600 dark:text-red-400 bg-red-500/10',
  warning: 'text-amber-600 dark:text-amber-400 bg-amber-500/10',
  info: 'text-primary bg-primary/10',
}

function normalizeSeverity(s?: string): PlatformAlert['severity'] {
  if (s === 'error' || s === 'warning' || s === 'info') return s
  return 'info'
}

function mergeAlerts(
  overviewAlerts: PlatformAlert[],
  notifications: { type: string; severity?: string; message: string; href?: string; tenantId?: string }[],
): PlatformAlert[] {
  const mapped: PlatformAlert[] = [
    ...overviewAlerts,
    ...notifications.map(n => ({
      type: n.type || 'notification',
      severity: normalizeSeverity(n.severity),
      message: n.message,
      href: n.href,
      tenantId: n.tenantId,
    })),
  ]
  const seen = new Set<string>()
  return mapped.filter(a => {
    const key = (a.message || '').trim().toLowerCase()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export default function AdminAlertsPanel() {
  const [open, setOpen] = useState(false)
  const [alerts, setAlerts] = useState<PlatformAlert[]>([])
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    Promise.all([
      fetchPlatformOverview().catch(() => null),
      fetchPlatformNotifications().catch(() => [] as Awaited<ReturnType<typeof fetchPlatformNotifications>>),
    ]).then(([overview, notifications]) => {
      setAlerts(mergeAlerts(overview?.alerts ?? [], Array.isArray(notifications) ? notifications : []))
    })
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
        type="button"
        onClick={() => setOpen(o => !o)}
        className="relative p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg"
      >
        <Bell size={16} />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>
      {open && (
        <div className={cn('absolute right-0 top-full mt-2 w-80 z-50 overflow-hidden', ADMIN_CARD)}>
          <div className="px-4 py-3 border-b border-border">
            <p className="text-sm font-semibold text-foreground">Platform Alerts</p>
            <p className="text-[10px] text-muted-foreground">{count} item{count !== 1 ? 's' : ''} need attention</p>
          </div>
          {count === 0 ? (
            <p className="px-4 py-8 text-sm text-muted-foreground text-center">All clear — no alerts</p>
          ) : (
            <div className="max-h-72 overflow-y-auto divide-y divide-border">
              {alerts.map((a, i) => {
                const Icon = SEV_ICON[a.severity]
                const content = (
                  <div className="flex items-start gap-2.5 px-4 py-3 hover:bg-muted/60">
                    <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0', SEV_COLOR[a.severity])}>
                      <Icon size={13} />
                    </div>
                    <p className="text-xs text-foreground leading-relaxed">{a.message}</p>
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
