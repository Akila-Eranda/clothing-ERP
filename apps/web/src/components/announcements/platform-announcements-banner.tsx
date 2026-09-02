'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Info, Megaphone, X } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

export type TenantAnnouncement = {
  id: string
  title: string
  body: string
  type?: string | null
  dismissible?: boolean
  sentAt?: string | null
}

async function fetchActiveAnnouncements(): Promise<TenantAnnouncement[]> {
  const res = await api.get<TenantAnnouncement[]>('/announcements/active')
  const data = res.data
  return Array.isArray(data) ? data : []
}

async function dismissAnnouncement(id: string): Promise<void> {
  await api.post(`/announcements/${id}/dismiss`)
}

function toneFor(type?: string | null) {
  const t = String(type || 'INFO').toUpperCase()
  if (t === 'CRITICAL' || t === 'ERROR') {
    return {
      wrap: 'border-red-300 bg-red-50 text-red-950 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-100',
      icon: 'text-red-600 dark:text-red-400',
      Icon: AlertTriangle,
    }
  }
  if (t === 'WARNING' || t === 'MAINTENANCE') {
    return {
      wrap: 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100',
      icon: 'text-amber-600 dark:text-amber-400',
      Icon: AlertTriangle,
    }
  }
  return {
    wrap: 'border-sky-300 bg-sky-50 text-sky-950 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-100',
    icon: 'text-sky-600 dark:text-sky-400',
    Icon: Info,
  }
}

export function PlatformAnnouncementsBanner({ className = '' }: { className?: string }) {
  const [items, setItems] = useState<TenantAnnouncement[]>([])
  const [dismissing, setDismissing] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const rows = await fetchActiveAnnouncements()
      setItems(rows)
    } catch {
      setItems([])
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 60_000)
    return () => clearInterval(id)
  }, [load])

  async function onDismiss(id: string) {
    setDismissing(id)
    try {
      await dismissAnnouncement(id)
      setItems((prev) => prev.filter((a) => a.id !== id))
    } catch {
      /* keep banner if dismiss fails */
    } finally {
      setDismissing(null)
    }
  }

  if (items.length === 0) return null

  return (
    <div className={cn('space-y-2', className)}>
      {items.map((item) => {
        const tone = toneFor(item.type)
        const Icon = tone.Icon
        return (
          <div
            key={item.id}
            role="status"
            className={cn(
              'flex items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-sm',
              tone.wrap,
            )}
          >
            <Icon className={cn('h-5 w-5 shrink-0 mt-0.5', tone.icon)} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <Megaphone className={cn('h-3.5 w-3.5', tone.icon)} />
                <p className="font-semibold text-sm leading-tight">{item.title}</p>
              </div>
              <p className="mt-1 text-sm leading-relaxed opacity-90 whitespace-pre-wrap">{item.body}</p>
            </div>
            {item.dismissible !== false && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={dismissing === item.id}
                onClick={() => onDismiss(item.id)}
                className="shrink-0 h-7 w-7 opacity-70 hover:opacity-100"
                aria-label="Dismiss announcement"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        )
      })}
    </div>
  )
}
