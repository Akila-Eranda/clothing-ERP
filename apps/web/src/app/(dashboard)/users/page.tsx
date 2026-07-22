"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Shield, Plus, MoreHorizontal, CheckCircle, XCircle,
  User, RefreshCw, Trash2, Key, Loader2,
} from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { modalInlineFooterClass } from "@/components/ui/modal-footer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { api, tokenStorage } from "@/lib/api";
import { ClientSideTable, DataTableColumnHeader, OpenRecordButton } from "@/components/table";
// ── Types ─────────────────────────────────────────────────────────────────────
interface Role {
  id: string;
  tenantId?: string | null;
  name: string;
  type: string;
  isSystem: boolean;
  description?: string;
  permissions: { permission: { id: string; resource: string; action: string } }[];
  _count: { users: number };
}
interface UserRole { role: Role }
interface Branch { id: string; name: string }
interface AppUser { id: string; firstName: string; lastName: string; email: string; status: string; phone?: string; branch?: Branch | null; roles: UserRole[]; createdAt: string; lastLoginAt?: string | null }
interface PaginatedUsers { data: AppUser[]; meta: { total: number } }

const ROLE_COLORS: Record<string, string> = {
  SUPER_ADMIN:    "bg-red-500/10 text-red-600 border-red-500/20",
  TENANT_ADMIN:   "bg-purple-500/10 text-purple-600 border-purple-500/20",
  BRANCH_MANAGER: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  CASHIER:        "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  STAFF:          "bg-amber-500/10 text-amber-600 border-amber-500/20",
  CUSTOM:         "bg-slate-500/10 text-slate-600 border-slate-500/20",
};

const EMPTY_USER = { firstName: "", lastName: "", email: "", password: "", phone: "", branchId: "", roleId: "" };

function parseList<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object" && "data" in payload) {
    const inner = (payload as { data: unknown }).data;
    if (Array.isArray(inner)) return inner as T[];
  }
  return [];
}

function roleLabel(role: Role): string {
  if (role.type === "BRANCH_MANAGER") return "Manager";
  return role.name;
}

const INVITE_ROLE_ORDER: Record<string, number> = {
  CASHIER: 0,
  BRANCH_MANAGER: 1,
  STAFF: 2,
  INVENTORY_MANAGER: 3,
  ACCOUNTANT: 4,
  HR_MANAGER: 5,
  VIEWER: 6,
  CUSTOM: 7,
  TENANT_ADMIN: 8,
};

/** Assignable staff roles for this tenant (excludes platform super-admin type). */
function assignableRoles(roles: Role[], tenantId?: string | null): Role[] {
  return roles
    .filter((r) => {
      if (tenantId && r.tenantId && r.tenantId !== tenantId) return false;
      if (tenantId && !r.tenantId) return false;
      return r.type !== "SUPER_ADMIN";
    })
    .sort((a, b) => (INVITE_ROLE_ORDER[a.type] ?? 99) - (INVITE_ROLE_ORDER[b.type] ?? 99));
}

/** Roles shown when inviting day-to-day staff (not another shop admin). */
function inviteStaffRoles(roles: Role[], tenantId?: string | null): Role[] {
  return assignableRoles(roles, tenantId).filter(
    (r) => r.type !== "TENANT_ADMIN" && r.type !== "SUPER_ADMIN",
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function UsersPage() {
  const [users, setUsers]             = useState<AppUser[]>([]);
  const [roles, setRoles]             = useState<Role[]>([]);
  const [branches, setBranches]       = useState<Branch[]>([]);
  const [loading, setLoading]         = useState(true);

  const [userModal, setUserModal]     = useState(false);
  const [roleAssignModal, setRoleAssignModal] = useState<AppUser | null>(null);
  const [selectedRoleId, setSelectedRoleId]  = useState("");

  const [userForm, setUserForm]       = useState({ ...EMPTY_USER });
  const [saving, setSaving]           = useState(false);

  const tenantId = tokenStorage.getTenant();
  const staffRoles = useMemo(() => inviteStaffRoles(roles, tenantId), [roles, tenantId]);
  const allAssignableRoles = useMemo(() => assignableRoles(roles, tenantId), [roles, tenantId]);
  const tenantRoleCards = useMemo(
    () => roles.filter((r) => !tenantId || r.tenantId === tenantId),
    [roles, tenantId],
  );

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [uRes, rRes, bRes] = await Promise.all([
        api.get<PaginatedUsers>("/users?limit=100"),
        api.get<Role[]>("/roles"),
        api.get<Branch[]>("/branches"),
      ]);
      setUsers(parseList<AppUser>(uRes.data?.data ?? uRes.data));
      setRoles(parseList<Role>(rRes.data));
      setBranches(parseList<Branch>(bRes.data));
    } catch { toast.error("Failed to load data"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── User actions ──────────────────────────────────────────────────────────
  const handleCreateUser = async () => {
    if (!userForm.firstName || !userForm.email || !userForm.password) {
      toast.error("First name, email and password required"); return;
    }
    if (!userForm.roleId) {
      toast.error("Select a role for this user"); return;
    }
    setSaving(true);
    try {
      await api.post("/users", {
        firstName: userForm.firstName, lastName: userForm.lastName,
        email: userForm.email, password: userForm.password,
        phone: userForm.phone || undefined,
        branchId: userForm.branchId || undefined,
        roleIds: userForm.roleId ? [userForm.roleId] : undefined,
      });
      toast.success("User created successfully");
      setUserModal(false);
      setUserForm({ ...EMPTY_USER });
      loadAll();
    } catch (e: unknown) {
      const msg = (e as { data?: { message?: string } })?.data?.message;
      toast.error(msg ?? "Failed to create user");
    } finally { setSaving(false); }
  };

  const handleToggleStatus = async (u: AppUser) => {
    const newStatus = u.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    try {
      await api.patch(`/users/${u.id}/status`, { status: newStatus });
      setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, status: newStatus } : x));
      toast.success(`User ${newStatus === "ACTIVE" ? "activated" : "deactivated"}`);
    } catch { toast.error("Failed to update status"); }
  };

  const handleDeleteUser = async (id: string) => {
    if (!confirm("Delete this user? This cannot be undone.")) return;
    try {
      await api.delete(`/users/${id}`);
      setUsers((prev) => prev.filter((x) => x.id !== id));
      toast.success("User deleted");
    } catch { toast.error("Failed to delete user"); }
  };

  const handleAssignRole = async () => {
    if (!roleAssignModal || !selectedRoleId) return;
    setSaving(true);
    try {
      await api.patch(`/users/${roleAssignModal.id}/roles`, { roleIds: [selectedRoleId] });
      toast.success("Role updated");
      setRoleAssignModal(null);
      loadAll();
    } catch { toast.error("Failed to assign role"); }
    finally { setSaving(false); }
  };

  // ── Columns ───────────────────────────────────────────────────────────────
  const columns = useMemo<ColumnDef<AppUser>[]>(
    () => [
      {
        id: "user",
        accessorFn: (u) => `${u.firstName} ${u.lastName} ${u.email}`,
        header: ({ column }) => <DataTableColumnHeader column={column} title="User" />,
        cell: ({ row }) => {
          const u = row.original;
          const initials = `${u.firstName[0] ?? ""}${u.lastName?.[0] ?? ""}`.toUpperCase();
          return (
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                {initials}
              </div>
              <div>
                <OpenRecordButton
                  onClick={() => {
                    setRoleAssignModal(u);
                    setSelectedRoleId(u.roles?.[0]?.role?.id ?? "");
                  }}
                  className="text-sm"
                  title="Change role"
                >
                  {u.firstName} {u.lastName}
                </OpenRecordButton>
                <p className="text-xs text-muted-foreground">{u.email}</p>
              </div>
            </div>
          );
        },
      },
      {
        id: "role",
        accessorFn: (u) => u.roles?.[0]?.role?.name ?? "",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Role" />,
        cell: ({ row }) => {
          const primaryRole = row.original.roles?.[0]?.role;
          return primaryRole ? (
            <span
              className={`h-6 rounded-full px-2.5 text-[11px] font-semibold inline-flex items-center border ${
                ROLE_COLORS[primaryRole.type] ?? ROLE_COLORS.CUSTOM
              }`}
            >
              {primaryRole.name}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">No role</span>
          );
        },
      },
      {
        id: "branch",
        accessorFn: (u) => u.branch?.name ?? "",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Branch" />,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{row.original.branch?.name ?? "—"}</span>
        ),
      },
      {
        id: "status",
        accessorKey: "status",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) =>
          row.original.status === "ACTIVE" ? (
            <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
              <CheckCircle className="h-3.5 w-3.5" />
              Active
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <XCircle className="h-3.5 w-3.5" />
              Inactive
            </span>
          ),
      },
      {
        id: "joined",
        accessorFn: (u) => new Date(u.createdAt).toLocaleDateString(),
        header: ({ column }) => <DataTableColumnHeader column={column} title="Joined" />,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {new Date(row.original.createdAt).toLocaleDateString()}
          </span>
        ),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const u = row.original;
          const isActive = u.status === "ACTIVE";
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem
                  onClick={() => {
                    setRoleAssignModal(u);
                    setSelectedRoleId(u.roles?.[0]?.role?.id ?? "");
                  }}
                >
                  <Key className="h-3.5 w-3.5 mr-2" /> Change Role
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void handleToggleStatus(u)}>
                  {isActive ? (
                    <>
                      <XCircle className="h-3.5 w-3.5 mr-2" />
                      Deactivate
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-3.5 w-3.5 mr-2" />
                      Activate
                    </>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem className="text-destructive" onClick={() => void handleDeleteUser(u.id)}>
                  <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [],
  );

  const activeCount = users.filter((u) => u.status === "ACTIVE").length;

  return (
    <div className="page-shell">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="min-w-0">
          <h1 className="text-[26px] md:text-3xl font-bold tracking-tight leading-tight">Users & Roles</h1>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">Manage staff access and role-based permissions</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <Button variant="outline" onClick={loadAll} className="gap-1.5">
            <RefreshCw className={`h-[18px] w-[18px] ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <div className="hidden sm:block h-6 w-px bg-slate-200 dark:bg-white/10 mx-0.5" aria-hidden />
          <Button className="gap-1.5" onClick={() => {
            setUserForm({
              ...EMPTY_USER,
              roleId: staffRoles[0]?.id ?? "",
            });
            setUserModal(true);
          }}>
            <Plus className="h-[18px] w-[18px]" /> Invite User
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Total Users",   value: users.length,                   color: "text-foreground",        tint: "border-blue-200/70 bg-gradient-to-br from-blue-50 to-white dark:border-blue-500/20 dark:from-blue-500/10 dark:to-transparent" },
          { label: "Active",        value: activeCount,                    color: "text-emerald-600",       tint: "border-emerald-200/70 bg-gradient-to-br from-emerald-50 to-white dark:border-emerald-500/20 dark:from-emerald-500/10 dark:to-transparent" },
          { label: "Inactive",      value: users.length - activeCount,     color: "text-muted-foreground",  tint: "border-blue-200/70 bg-gradient-to-br from-blue-50 to-white dark:border-blue-500/20 dark:from-blue-500/10 dark:to-transparent" },
          { label: "Total Roles",   value: tenantRoleCards.length,         color: "text-primary",           tint: "border-blue-200/70 bg-gradient-to-br from-blue-50 to-white dark:border-blue-500/20 dark:from-blue-500/10 dark:to-transparent" },
        ].map((s) => (
          <div key={s.label} className={`rounded-[18px] border bg-card h-[68px] px-4 py-2 flex flex-col justify-center overflow-hidden shadow-[0_2px_10px_rgba(15,23,42,0.04)] hover:-translate-y-0.5 hover:shadow-[0_4px_14px_rgba(15,23,42,0.07)] transition-all duration-150 ${s.tint}`}>
            <p className={`text-[22px] font-bold leading-none tabular-nums ${s.color}`}>{s.value}</p>
            <p className="text-[11px] text-muted-foreground font-medium mt-1 truncate">{s.label}</p>
          </div>
        ))}
      </div>

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">Users ({users.length})</TabsTrigger>
          <TabsTrigger value="roles">Roles ({tenantRoleCards.length})</TabsTrigger>
        </TabsList>

        {/* ── Users Tab ──────────────────────────────────────────────────── */}
        <TabsContent value="users" className="mt-4 space-y-3">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ClientSideTable
              data={users}
              columns={columns}
              searchableColumns={[
                { id: "user", title: "User / email" },
              ]}
              filterableColumns={[
                {
                  id: "status",
                  title: "Status",
                  options: [
                    { value: "ACTIVE", label: "Active" },
                    { value: "INACTIVE", label: "Inactive" },
                  ],
                },
              ]}
              isShowExportButtons={{ isShow: true, fileName: "users" }}
            />
          )}
        </TabsContent>

        {/* ── Roles Tab (read-only) ──────────────────────────────────────── */}
        <TabsContent value="roles" className="mt-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Roles configured for your shop only — other tenants&apos; roles are not shown.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {tenantRoleCards.map((role) => (
              <div key={role.id} className="rounded-[18px] border bg-card p-4 shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
                <div className="flex items-start gap-2 mb-3">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Shield className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm">{role.name}</p>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${ROLE_COLORS[role.type] ?? ROLE_COLORS.CUSTOM}`}>
                        {role.isSystem ? "System" : "Custom"}
                      </span>
                    </div>
                    {role.description && (
                      <p className="text-xs text-muted-foreground mt-1">{role.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm pt-3 border-t">
                  <span className="text-muted-foreground flex items-center gap-1 text-xs">
                    <User className="h-3.5 w-3.5" /> {role._count?.users ?? 0} users
                  </span>
                  <span className="text-xs font-medium">{role.permissions?.length ?? 0} permissions</span>
                </div>
              </div>
            ))}
            {tenantRoleCards.length === 0 && !loading && (
              <div className="col-span-full rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                No assignable roles found. Contact your administrator.
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Create User Modal ─────────────────────────────────────────────── */}
      <Dialog open={userModal} onOpenChange={setUserModal}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Invite User</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs mb-1.5 block">First Name *</Label>
                <Input value={userForm.firstName} onChange={(e) => setUserForm((f) => ({ ...f, firstName: e.target.value }))} placeholder="First name" /></div>
              <div><Label className="text-xs mb-1.5 block">Last Name</Label>
                <Input value={userForm.lastName} onChange={(e) => setUserForm((f) => ({ ...f, lastName: e.target.value }))} placeholder="Last name" /></div>
            </div>
            <div><Label className="text-xs mb-1.5 block">Email *</Label>
              <Input type="email" value={userForm.email} onChange={(e) => setUserForm((f) => ({ ...f, email: e.target.value }))} placeholder="user@example.com" /></div>
            <div><Label className="text-xs mb-1.5 block">Password *</Label>
              <Input type="password" value={userForm.password} onChange={(e) => setUserForm((f) => ({ ...f, password: e.target.value }))} placeholder="Min 8 characters" /></div>
            <div><Label className="text-xs mb-1.5 block">Phone</Label>
              <Input value={userForm.phone} onChange={(e) => setUserForm((f) => ({ ...f, phone: e.target.value }))} placeholder="Optional" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1.5 block">Role *</Label>
                <Select
                  value={userForm.roleId}
                  onValueChange={(v) => setUserForm((f) => ({ ...f, roleId: v }))}
                  disabled={staffRoles.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={staffRoles.length ? "Select role" : "No roles available"} />
                  </SelectTrigger>
                  <SelectContent>
                    {staffRoles.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {roleLabel(r)}
                        {r.description ? ` — ${r.description}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Cashier, Manager, and other staff roles for your shop
                </p>
              </div>
              <div><Label className="text-xs mb-1.5 block">Branch</Label>
                <Select value={userForm.branchId} onValueChange={(v) => setUserForm((f) => ({ ...f, branchId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                  <SelectContent>{branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                </Select></div>
            </div>
            <div className={modalInlineFooterClass}>
              <Button variant="outline" onClick={() => setUserModal(false)} disabled={saving}>Cancel</Button>
              <Button
                variant="gradient"
                onClick={handleCreateUser}
                disabled={saving || !userForm.roleId || staffRoles.length === 0}
              >
                {saving ? "Creating…" : "Create User"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Assign Role Modal ─────────────────────────────────────────────── */}
      <Dialog open={!!roleAssignModal} onOpenChange={(o) => { if (!o) setRoleAssignModal(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Change Role — {roleAssignModal?.firstName} {roleAssignModal?.lastName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label className="text-xs mb-1.5 block">Select Role</Label>
              <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
                <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                <SelectContent>
                  {allAssignableRoles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{roleLabel(r)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1">Existing roles only</p>
            </div>
            <div className={modalInlineFooterClass}>
              <Button variant="outline" onClick={() => setRoleAssignModal(null)} disabled={saving}>Cancel</Button>
              <Button variant="gradient" onClick={handleAssignRole} disabled={saving || !selectedRoleId}>{saving ? "Saving…" : "Assign Role"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
