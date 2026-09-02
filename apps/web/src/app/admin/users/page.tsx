'use client'

import { Suspense, useState, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { UserX, UserCheck, Trash2, Users } from 'lucide-react'
import { ColumnDef } from '@tanstack/react-table'
import { ClientSideTable, DataTableColumnHeader } from '@/components/table'
import { fetchUsers, updateUserStatus, deleteUser, type UserRow } from '@/lib/admin-api'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { parseApiList } from '@/lib/parse-api-list'
import { PageHeader, PageKpiGrid, pageKpi } from '@/components/ui/page-kpi'
import { AdminStatusBadge } from '@/components/admin/admin-badges'
import { ADMIN_MODAL_PANEL } from '@/lib/admin-ui'
import { TableValueBadge } from '@/components/ui/table-status-badge'
import { LoadingCenter } from '@/components/ui/loading'
import { cn } from '@/lib/utils'

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('en-LK', { day: 'numeric', month: 'short', year: '2-digit' })
}

function UsersPageContent() {
  const searchParams = useSearchParams()
  const urlSearch = searchParams.get('search')?.trim() ?? ''
  const urlTenant = searchParams.get('tenant')?.trim() ?? ''
  const defaultSearch = urlSearch || urlTenant

  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<UserRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = { page: '1', limit: '500' }
      if (urlSearch) params.search = urlSearch
      if (urlTenant) params.tenant = urlTenant
      const d = await fetchUsers(params)
      setUsers(parseApiList(d.data))
    } catch {
      setUsers([])
      toast.error('Failed to load users')
    } finally {
      setLoading(false)
    }
  }, [urlSearch, urlTenant])

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
        `${u.firstName ?? ''} ${u.lastName ?? ''} ${u.email ?? ''} ${u.tenant?.name ?? ''} ${u.tenant?.subdomain ?? ''}`.trim(),
      header: ({ column }) => <DataTableColumnHeader column={column} title="User" />,
      cell: ({ row }) => {
        const u = row.original
        return (
          <div className={cn('flex items-center gap-2', actionLoading === u.id && 'opacity-50')}>
            <div className="w-7 h-7 rounded-full bg-foreground text-background text-[11px] font-bold flex items-center justify-center flex-shrink-0">
              {(u.firstName ?? '?').charAt(0)}{(u.lastName ?? '').charAt(0)}
            </div>
            <p className="text-xs font-semibold text-foreground">{u.firstName ?? ''} {u.lastName ?? ''}</p>
          </div>
        )
      },
    },
    {
      accessorKey: 'email',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Email" />,
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.email}</span>,
    },
    {
      id: 'role',
      accessorFn: (u) => u.roles?.map((r) => r.role?.name).filter(Boolean).join(', ') ?? '',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Role" />,
      cell: ({ row }) => {
        const roles = row.original.roles
        if (!roles?.length) return <span className="text-xs text-muted-foreground">—</span>
        return (
          <div className="flex flex-wrap gap-1">
            {roles.map((r, ri) => (
              <TableValueBadge key={r.role?.name ?? ri} label={r.role?.name ?? '—'} variant="secondary" />
            ))}
          </div>
        )
      },
    },
    {
      accessorKey: 'status',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => <AdminStatusBadge status={row.original.status} />,
    },
    {
      id: 'tenant',
      accessorFn: (u) => `${u.tenant?.name ?? ''} ${u.tenant?.subdomain ?? ''}`.trim(),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tenant" />,
      cell: ({ row }) => (
        <div className="text-xs text-muted-foreground">
          {row.original.tenant?.name ?? '—'}
          {row.original.tenant?.subdomain && (
            <span className="block text-[10px] font-mono">{row.original.tenant.subdomain}</span>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'createdAt',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Joined" />,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
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
              className={u.status === 'ACTIVE' ? 'text-amber-500 hover:bg-amber-500/10' : 'text-emerald-500 hover:bg-emerald-500/10'}
              title={u.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
            >
              {u.status === 'ACTIVE' ? <UserX size={13} /> : <UserCheck size={13} />}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setConfirmDelete(u)}
              className="text-red-400 hover:bg-red-500/10"
              title="Delete"
            >
              <Trash2 size={13} />
            </Button>
          </div>
        )
      },
    },
  ], [actionLoading])

  const kpis = [
    pageKpi('Total Users', users.length, Users, 'primary'),
    pageKpi('Active', users.filter((u) => u.status === 'ACTIVE').length, UserCheck, 'success'),
    pageKpi('Inactive', users.filter((u) => u.status !== 'ACTIVE').length, UserX, 'neutral'),
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Users"
        description={loading ? 'Loading…' : `${users.length.toLocaleString()} users`}
        onRefresh={() => void load()}
        refreshing={loading}
      />

      <PageKpiGrid items={kpis} loading={loading} cols={3} />

      <ClientSideTable
        key={`users-${defaultSearch}`}
        data={users}
        columns={columns}
        defaultSearch={defaultSearch}
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
          <div className={cn(ADMIN_MODAL_PANEL, 'max-w-sm')}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-500/10 rounded-xl flex items-center justify-center">
                <Trash2 size={16} className="text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">Delete User</h3>
                <p className="text-xs text-muted-foreground">This action is irreversible</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-5">
              Delete <strong className="text-foreground">{confirmDelete.firstName ?? ''} {confirmDelete.lastName ?? ''}</strong>?
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

export default function UsersPage() {
  return (
    <Suspense fallback={<LoadingCenter className="h-64 py-0" size={88} />}>
      <UsersPageContent />
    </Suspense>
  )
}
