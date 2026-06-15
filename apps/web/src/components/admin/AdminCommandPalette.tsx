'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Building2, Users, Command, X } from 'lucide-react'
import { fetchTenants, fetchUsers, type TenantRow, type UserRow } from '@/lib/admin-api'

interface Props {
  open: boolean
  onClose: () => void
}

type ResultItem =
  | { type: 'tenant'; data: TenantRow }
  | { type: 'user'; data: UserRow }

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
    if (!q.trim()) { setResults([]); return }
    setLoading(true)
    try {
      const [tenants, users] = await Promise.all([
        fetchTenants({ search: q, limit: '8' }),
        fetchUsers({ search: q, limit: '5' }),
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
    const t = setTimeout(() => search(query), 250)
    return () => clearTimeout(t)
  }, [query, search])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, results.length - 1)) }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)) }
      if (e.key === 'Enter' && results[selected]) navigate(results[selected])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, results, selected, onClose])

  function navigate(item: ResultItem) {
    onClose()
    if (item.type === 'tenant') router.push(`/admin/tenants/${item.data.id}`)
    else router.push(`/admin/users?search=${encodeURIComponent(item.data.email)}`)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
          <Search size={16} className="text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            className="flex-1 text-sm outline-none placeholder-gray-400"
            placeholder="Search tenants, users, subdomains…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <kbd className="hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] text-gray-400 bg-gray-100 rounded border border-gray-200">
            <Command size={10} />K
          </kbd>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={14} /></button>
        </div>
        <div className="max-h-72 overflow-y-auto py-2">
          {loading && <p className="px-4 py-6 text-sm text-gray-400 text-center">Searching…</p>}
          {!loading && query && results.length === 0 && (
            <p className="px-4 py-6 text-sm text-gray-400 text-center">No results for &quot;{query}&quot;</p>
          )}
          {!loading && !query && (
            <p className="px-4 py-6 text-sm text-gray-400 text-center">Type to search tenants and users</p>
          )}
          {results.map((item, i) => (
            <button
              key={`${item.type}-${item.type === 'tenant' ? item.data.id : item.data.id}`}
              onClick={() => navigate(item)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                i === selected ? 'bg-gray-100' : 'hover:bg-gray-50'
              }`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                item.type === 'tenant' ? 'bg-gray-900 text-white' : 'bg-blue-50 text-blue-600'
              }`}>
                {item.type === 'tenant' ? <Building2 size={14} /> : <Users size={14} />}
              </div>
              <div className="min-w-0 flex-1">
                {item.type === 'tenant' ? (
                  <>
                    <p className="text-sm font-medium text-gray-900 truncate">{item.data.name}</p>
                    <p className="text-xs text-gray-500 font-mono truncate">{item.data.subdomain} · {item.data.plan}</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-gray-900 truncate">{item.data.firstName} {item.data.lastName}</p>
                    <p className="text-xs text-gray-500 truncate">{item.data.email}{item.data.tenant ? ` · ${item.data.tenant.name}` : ''}</p>
                  </>
                )}
              </div>
              <span className="text-[10px] text-gray-400 uppercase shrink-0">{item.type}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
