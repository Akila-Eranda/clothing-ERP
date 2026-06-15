'use client'

import { useState, useEffect, useCallback } from 'react'
import { AlertTriangle } from 'lucide-react'
import { fetchPlatformMaintenanceStatus, type PlatformMaintenanceStatus } from '@/lib/platform-status'

export function useMaintenanceStatus(pollMs = 60_000) {
  const [status, setStatus] = useState<PlatformMaintenanceStatus | null>(null)

  const refresh = useCallback(async () => {
    try {
      const s = await fetchPlatformMaintenanceStatus(true)
      setStatus(s)
    } catch {
      setStatus(null)
    }
  }, [])

  useEffect(() => {
    refresh()
    if (pollMs <= 0) return
    const id = setInterval(refresh, pollMs)
    return () => clearInterval(id)
  }, [refresh, pollMs])

  return { status, refresh, isMaintenance: !!status?.enabled }
}

interface MaintenanceBannerProps {
  className?: string
  compact?: boolean
}

export function MaintenanceBanner({ className = '', compact = false }: MaintenanceBannerProps) {
  const { status } = useMaintenanceStatus()

  if (!status?.enabled) return null

  return (
    <div
      className={`flex items-start gap-3 border border-amber-300 bg-amber-50 text-amber-900 ${
        compact ? 'px-4 py-2.5 text-xs' : 'px-4 py-3 text-sm'
      } ${className}`}
      role="alert"
    >
      <AlertTriangle className={`shrink-0 text-amber-600 ${compact ? 'h-4 w-4 mt-0' : 'h-5 w-5 mt-0.5'}`} />
      <div className="min-w-0">
        <p className={`font-semibold ${compact ? 'text-xs' : 'text-sm'}`}>
          Maintenance Mode is ON
        </p>
        <p className={`mt-0.5 text-amber-800/90 ${compact ? 'text-[11px] leading-snug' : 'text-sm leading-relaxed'}`}>
          {status.message}
        </p>
      </div>
    </div>
  )
}
