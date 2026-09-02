'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search, Building2, Users, Command, X, LifeBuoy,
  LayoutDashboard, Megaphone, Rocket, Lightbulb, Shield, Settings,
} from 'lucide-react'
import { fetchTenants, fetchUsers, type TenantRow, type UserRow } from '@/lib/admin-api'
import { ADMIN_MODAL_PANEL } from '@/lib/admin-ui'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onClose: () => void
}

type ResultItem =
  | { type: 'tenant'; data: TenantRow }
  | { type: 'user'; data: UserRow }

const QUICK_LINKS = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/tenants', label: 'Tenants', icon: Building2 },
  { href: '/admin/support', label: 'Support', icon: LifeBuoy },
  { href: '/admin/announcements', label: 'Announcements', icon: Megaphone },
  { href: '/admin/releases', label: 'Releases', icon: Rocket },
  { href: '/admin/suggestions', label: 'Suggestions', icon: Lightbulb },
  { href: '/admin/admins', label: 'Admins', icon: Shield },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
] as const

export default function AdminCommandPalette({ open, onClose }: Props) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ResultItem[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(0)

  useEffect(() => {
    if (open) {
      setQuery('')
      setResults([])
      setSelected(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  const search = useCallback(async (q: string) => {
    const trimmed = q.trim()
    if (!trimmed) { setResults([]); return }
    if (trimmed.toLowerCase().startsWith('support:')) {
      setResults([])
      return
    }

    setLoading(true)
    try {
      const [tenants, users] = await Promise.all([
        fetchTenants({ search: trimmed, limit: '8' }),
        fetchUsers({ search: trimmed, limit: '5' }),
      ])
      const items: ResultItem[] = [
        ...tenants.data.map(t => ({ type: 'tenant' as const, data: t })),
        ...users.data.map(u => ({ type: 'user' as const, data: u })),
      ]
      setResults(items)
      setSelected(0)
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setSelected(0)
  }, [query])

  useEffect(() => {
    const t = setTimeout(() => search(query), 250)
    return () => clearTimeout(t)
  }, [query, search])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      const trimmed = query.trim()
      if (trimmed.toLowerCase().startsWith('support:') && e.key === 'Enter') {
        e.preventDefault()
        const term = trimmed.slice('support:'.length).trim()
        onClose()
        router.push(term ? `/admin/support?search=${encodeURIComponent(term)}` : '/admin/support')
        return
      }
      if (!trimmed) {
        if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, QUICK_LINKS.length - 1)) }
        if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)) }
        if (e.key === 'Enter' && QUICK_LINKS[selected]) {
          onClose()
          router.push(QUICK_LINKS[selected].href)
        }
        return
      }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, results.length - 1)) }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)) }
      if (e.key === 'Enter' && results[selected]) navigate(results[selected])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, results, selected, onClose, query, router])

  function navigate(item: ResultItem) {
    onClose()
    if (item.type === 'tenant') router.push(`/admin/tenants/${item.data.id}`)
    else router.push(`/admin/users?search=${encodeURIComponent(item.data.email)}`)
  }

  function goSupport(tenantId: string, e: React.MouseEvent) {
    e.stopPropagation()
    onClose()
    router.push(`/admin/support?tenant=${tenantId}`)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className={cn('relative w-full max-w-lg overflow-hidden', ADMIN_MODAL_PANEL, 'p-0')}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search size={16} className="text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            className="flex-1 text-sm outline-none bg-transparent text-foreground placeholder:text-muted-foreground"
            placeholder="Search tenants, users… or support:query"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <kbd className="hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] text-muted-foreground bg-muted rounded border border-border">
            <Command size={10} />K
          </kbd>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} className="text-muted-foreground">
            <X size={14} />
          </Button>
        </div>
        <div className="max-h-72 overflow-y-auto py-2">
          {loading && <p className="px-4 py-6 text-sm text-muted-foreground text-center">Searching…</p>}
          {!loading && query.trim().toLowerCase().startsWith('support:') && (
            <p className="px-4 py-6 text-sm text-muted-foreground text-center">
              Press Enter to open Support{query.trim().slice('support:'.length).trim() ? ` for “${query.trim().slice('support:'.length).trim()}”` : ''}
            </p>
          )}
          {!loading && query && !query.trim().toLowerCase().startsWith('support:') && results.length === 0 && (
            <p className="px-4 py-6 text-sm text-muted-foreground text-center">No results for &quot;{query}&quot;</p>
          )}
          {!loading && !query && (
            <div className="py-1">
              <p className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Quick links
              </p>
              {QUICK_LINKS.map((link, i) => {
                const Icon = link.icon
                return (
                  <button
                    key={link.href}
                    type="button"
                    onClick={() => { onClose(); router.push(link.href) }}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                      i === selected ? 'bg-muted' : 'hover:bg-muted/60',
                    )}
                  >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-muted text-muted-foreground">
                      <Icon size={14} />
                    </div>
                    <span className="text-sm font-medium text-foreground">{link.label}</span>
                  </button>
                )
              })}
            </div>
          )}
          {results.map((item, i) => (
            <div
              key={`${item.type}-${item.data.id}`}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                i === selected ? 'bg-muted' : 'hover:bg-muted/60',
              )}
            >
              <button
                type="button"
                onClick={() => navigate(item)}
                className="flex items-center gap-3 min-w-0 flex-1 text-left"
              >
                <div className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                  item.type === 'tenant' ? 'bg-foreground text-background' : 'bg-primary/10 text-primary',
                )}>
                  {item.type === 'tenant' ? <Building2 size={14} /> : <Users size={14} />}
                </div>
                <div className="min-w-0 flex-1">
                  {item.type === 'tenant' ? (
                    <>
                      <p className="text-sm font-medium text-foreground truncate">{item.data.name}</p>
                      <p className="text-xs text-muted-foreground font-mono truncate">{item.data.subdomain} · {item.data.plan}</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-foreground truncate">{item.data.firstName} {item.data.lastName}</p>
                      <p className="text-xs text-muted-foreground truncate">{item.data.email}{item.data.tenant ? ` · ${item.data.tenant.name}` : ''}</p>
                    </>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground uppercase shrink-0">{item.type}</span>
              </button>
              {item.type === 'tenant' && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  title="Open in Support"
                  className="text-muted-foreground shrink-0"
                  onClick={e => goSupport(item.data.id, e)}
                >
                  <LifeBuoy size={14} />
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
