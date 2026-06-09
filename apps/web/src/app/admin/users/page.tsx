'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, RefreshCw, UserX, UserCheck, Trash2, Users } from 'lucide-react'
import { fetchUsers, updateUserStatus, deleteUser, type UserRow } from '@/lib/admin-api'
import { toast } from 'sonner'

const STATUS_BADGE: Record<string, string> = {
  ACTIVE:    'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-50 text-green-700',
  INACTIVE:  'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-500',
  SUSPENDED: 'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700',
}
function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('en-LK', { day: 'numeric', month: 'short', year: '2-digit' })
}

const PER_PAGE = 25

export default function UsersPage() {
  const [users, setUsers]       = useState<UserRow[]>([])
  const [total, setTotal]       = useState(0)
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [page, setPage]         = useState(1)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<UserRow | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback((params: { search?: string; page?: number } = {}) => {
    setLoading(true)
    const p: Record<string, string> = { page: String(params.page ?? page), limit: String(PER_PAGE) }
    const s = params.search ?? search
    if (s) p.search = s
    fetchUsers(p)
      .then(d => { setUsers(d.data ?? []); setTotal(d.total ?? 0) })
      .catch((e: unknown) => { setUsers([]); setTotal(0); toast.error('Failed to load users') })
      .finally(() => setLoading(false))
  }, [search, page])

  useEffect(() => { load() }, [])

  function handleSearch(v: string) {
    setSearch(v); setPage(1)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => load({ search: v, page: 1 }), 350)
  }

  async function toggleStatus(u: UserRow) {
    setActionLoading(u.id)
    const next = u.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
    try { await updateUserStatus(u.id, next); load() } catch { toast.error('Failed to update user status') }
    setActionLoading(null)
  }

  async function handleDelete() {
    if (!confirmDelete) return
    setActionLoading(confirmDelete.id)
    try { await deleteUser(confirmDelete.id); setConfirmDelete(null); load() } catch { toast.error('Failed to delete user') }
    setActionLoading(null)
  }

  const totalPages = Math.ceil(total / PER_PAGE)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-base font-bold text-gray-900">Users</h1>
          <p className="text-sm text-gray-500">{loading ? 'Loading…' : `${total.toLocaleString()} users`}</p>
        </div>
        <div className="ml-auto flex gap-2">
          <button onClick={() => load()} disabled={loading} className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 bg-white text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-50">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Users',  value: total,                                                        icon: Users,     color: 'text-blue-600',  bg: 'bg-blue-50'  },
          { label: 'Active',       value: users.filter(u => u.status === 'ACTIVE').length,              icon: UserCheck, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'Inactive',     value: users.filter(u => u.status !== 'ACTIVE').length,              icon: UserX,     color: 'text-gray-600',  bg: 'bg-gray-100' },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl ${k.bg} flex items-center justify-center flex-shrink-0`}>
              <k.icon size={15} className={k.color} />
            </div>
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wide">{k.label}</p>
              <p className="text-xl font-bold text-gray-900">{k.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 max-w-md">
        <Search size={14} className="text-gray-400" />
        <input
          className="bg-transparent text-sm text-gray-700 placeholder-gray-400 outline-none flex-1"
          placeholder="Search name or email…"
          value={search}
          onChange={e => handleSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['User','Email','Role','Status','Tenant','Joined','Actions'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading && (
                <tr><td colSpan={7} className="px-4 py-12 text-center">
                  <RefreshCw size={18} className="animate-spin mx-auto text-gray-300" />
                </td></tr>
              )}
              {!loading && users.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-400">No users found.</td></tr>
              )}
              {!loading && users.map(u => (
                <tr key={u.id} className={`hover:bg-gray-50 transition-colors ${actionLoading === u.id ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-gray-900 text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                        {(u.firstName ?? '?').charAt(0)}{(u.lastName ?? '').charAt(0)}
                      </div>
                      <p className="text-xs font-semibold text-gray-900">{u.firstName ?? ''} {u.lastName ?? ''}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">{u.email}</td>
                  <td className="px-4 py-3">
                    {u.roles?.length ? u.roles.map((r, ri) => (
                      <span key={r.role?.name ?? ri} className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-600 mr-1">
                        {r.role?.name ?? '—'}
                      </span>
                    )) : '—'}
                  </td>
                  <td className="px-4 py-3"><span className={STATUS_BADGE[u.status] ?? STATUS_BADGE.INACTIVE}>{u.status}</span></td>
                  <td className="px-4 py-3 text-xs text-gray-500">{u.tenant?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{u.createdAt ? fmtDate(u.createdAt) : '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => toggleStatus(u)}
                        className={`p-1.5 rounded-lg transition-colors ${u.status === 'ACTIVE' ? 'text-amber-500 hover:bg-amber-50' : 'text-green-500 hover:bg-green-50'}`}
                        title={u.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                      >
                        {u.status === 'ACTIVE' ? <UserX size={13} /> : <UserCheck size={13} />}
                      </button>
                      <button
                        onClick={() => setConfirmDelete(u)}
                        className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg"
                        title="Delete"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-500">Page {page} of {totalPages}</p>
            <div className="flex gap-1">
              <button onClick={() => { setPage(p => p - 1); load({ page: page - 1 }) }} disabled={page === 1}
                className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-30">Prev</button>
              <button onClick={() => { setPage(p => p + 1); load({ page: page + 1 }) }} disabled={page === totalPages}
                className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-30">Next</button>
            </div>
          </div>
        )}
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                <Trash2 size={16} className="text-red-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900">Delete User</h3>
                <p className="text-xs text-gray-500">This action is irreversible</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-5">
              Delete <strong>{confirmDelete.firstName ?? ''} {confirmDelete.lastName ?? ''}</strong>?
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={handleDelete} className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
