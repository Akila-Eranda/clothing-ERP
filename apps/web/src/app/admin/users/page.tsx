'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { RefreshCw, UserX, UserCheck, Trash2, Users } from 'lucide-react'
import { ColumnDef } from '@tanstack/react-table'
import { ClientSideTable, DataTableColumnHeader } from '@/components/table'
import { fetchUsers, updateUserStatus, deleteUser, type UserRow } from '@/lib/admin-api'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

const STATUS_BADGE: Record<string, string> = {
  ACTIVE:    'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-50 text-green-700',
  INACTIVE:  'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-500',
  SUSPENDED: 'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700',
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('en-LK', { day: 'numeric', month: 'short', year: '2-digit' })
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<UserRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await fetchUsers({ page: '1', limit: '500' })
      setUsers(d.data ?? [])
    } catch {
      setUsers([])
      toast.error('Failed to load users')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function toggleStatus(u: UserRow) {
    setActionLoading(u.id)
    const next = u.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
    try {
      await updateUserStatus(u.id, next)
      await load()
    } catch {
      toast.error('Failed to update user status')
    }
    setActionLoading(null)
  }

  async function handleDelete() {
    if (!confirmDelete) return
    setActionLoading(confirmDelete.id)
    try {
      await deleteUser(confirmDelete.id)
      setConfirmDelete(null)
      await load()
    } catch {
      toast.error('Failed to delete user')
    }
    setActionLoading(null)
  }

  const columns = useMemo<ColumnDef<UserRow>[]>(() => [
    {
      id: 'name',
      accessorFn: (u) =>
        `${u.firstName ?? ''} ${u.lastName ?? ''} ${u.email ?? ''} ${u.tenant?.name ?? ''}`.trim(),
      header: ({ column }) => <DataTableColumnHeader column={column} title="User" />,
      cell: ({ row }) => {
        const u = row.original
        return (
          <div className={`flex items-center gap-2 ${actionLoading === u.id ? 'opacity-50' : ''}`}>
            <div className="w-7 h-7 rounded-full bg-gray-900 text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">
              {(u.firstName ?? '?').charAt(0)}{(u.lastName ?? '').charAt(0)}
            </div>
            <p className="text-xs font-semibold text-gray-900">{u.firstName ?? ''} {u.lastName ?? ''}</p>
          </div>
        )
      },
    },
    {
      accessorKey: 'email',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Email" />,
      cell: ({ row }) => <span className="text-xs text-gray-600">{row.original.email}</span>,
    },
    {
      id: 'role',
      accessorFn: (u) => u.roles?.map((r) => r.role?.name).filter(Boolean).join(', ') ?? '',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Role" />,
      cell: ({ row }) => {
        const roles = row.original.roles
        if (!roles?.length) return <span className="text-xs text-gray-400">—</span>
        return (
          <div className="flex flex-wrap gap-1">
            {roles.map((r, ri) => (
              <span key={r.role?.name ?? ri} className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-600">
                {r.role?.name ?? '—'}
              </span>
            ))}
          </div>
        )
      },
    },
    {
      accessorKey: 'status',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => (
        <span className={STATUS_BADGE[row.original.status] ?? STATUS_BADGE.INACTIVE}>{row.original.status}</span>
      ),
    },
    {
      id: 'tenant',
      accessorFn: (u) => u.tenant?.name ?? '',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tenant" />,
      cell: ({ row }) => <span className="text-xs text-gray-500">{row.original.tenant?.name ?? '—'}</span>,
    },
    {
      accessorKey: 'createdAt',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Joined" />,
      cell: ({ row }) => (
        <span className="text-xs text-gray-500 whitespace-nowrap">
          {row.original.createdAt ? fmtDate(row.original.createdAt) : '—'}
        </span>
      ),
    },
    {
      id: 'actions',
      enableSorting: false,
      cell: ({ row }) => {
        const u = row.original
        return (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => void toggleStatus(u)}
              className={u.status === 'ACTIVE' ? 'text-amber-500 hover:bg-amber-50' : 'text-green-500 hover:bg-green-50'}
              title={u.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
            >
              {u.status === 'ACTIVE' ? <UserX size={13} /> : <UserCheck size={13} />}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setConfirmDelete(u)}
              className="text-red-400 hover:bg-red-50"
              title="Delete"
            >
              <Trash2 size={13} />
            </Button>
          </div>
        )
      },
    },
  ], [actionLoading])

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-base font-bold text-gray-900">Users</h1>
          <p className="text-sm text-gray-500">{loading ? 'Loading…' : `${users.length.toLocaleString()} users`}</p>
        </div>
        <div className="ml-auto flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Users', value: users.length, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Active', value: users.filter((u) => u.status === 'ACTIVE').length, icon: UserCheck, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'Inactive', value: users.filter((u) => u.status !== 'ACTIVE').length, icon: UserX, color: 'text-gray-600', bg: 'bg-gray-100' },
        ].map((k) => (
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

      <ClientSideTable
        data={users}
        columns={columns}
        searchableColumns={[
          { id: 'name', title: 'User / email / tenant' },
        ]}
        filterableColumns={[
          {
            id: 'status',
            title: 'Status',
            options: [
              { value: 'ACTIVE', label: 'Active' },
              { value: 'INACTIVE', label: 'Inactive' },
              { value: 'SUSPENDED', label: 'Suspended' },
            ],
          },
        ]}
        isShowExportButtons={{ isShow: true, fileName: 'admin-users-export' }}
      />

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
              <Button type="button" variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
              <Button type="button" variant="danger" onClick={() => void handleDelete()}>Delete</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
