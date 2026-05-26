"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Shield, Plus, MoreHorizontal, CheckCircle, XCircle,
  User, RefreshCw, Search, Trash2, Key,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { api } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Role { id: string; name: string; type: string; isSystem: boolean; description?: string; permissions: { permission: { id: string; resource: string; action: string } }[]; _count: { users: number } }
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
const EMPTY_ROLE = { name: "", description: "" };

// ── Page ──────────────────────────────────────────────────────────────────────
export default function UsersPage() {
  const [users, setUsers]             = useState<AppUser[]>([]);
  const [roles, setRoles]             = useState<Role[]>([]);
  const [branches, setBranches]       = useState<Branch[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState("");

  const [userModal, setUserModal]     = useState(false);
  const [roleModal, setRoleModal]     = useState(false);
  const [roleAssignModal, setRoleAssignModal] = useState<AppUser | null>(null);
  const [selectedRoleId, setSelectedRoleId]  = useState("");

  const [userForm, setUserForm]       = useState({ ...EMPTY_USER });
  const [roleForm, setRoleForm]       = useState({ ...EMPTY_ROLE });
  const [saving, setSaving]           = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [uRes, rRes, bRes] = await Promise.all([
        api.get<PaginatedUsers>("/users?limit=100"),
        api.get<Role[]>("/roles"),
        api.get<Branch[]>("/branches"),
      ]);
      setUsers(Array.isArray(uRes.data?.data) ? uRes.data.data : []);
      setRoles(Array.isArray(rRes.data) ? rRes.data : []);
      setBranches(Array.isArray(bRes.data) ? bRes.data : []);
    } catch { toast.error("Failed to load data"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── User actions ──────────────────────────────────────────────────────────
  const handleCreateUser = async () => {
    if (!userForm.firstName || !userForm.email || !userForm.password) {
      toast.error("First name, email and password required"); return;
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

  // ── Role actions ──────────────────────────────────────────────────────────
  const handleCreateRole = async () => {
    if (!roleForm.name) { toast.error("Role name required"); return; }
    setSaving(true);
    try {
      await api.post("/roles", { name: roleForm.name, description: roleForm.description });
      toast.success("Role created");
      setRoleModal(false);
      setRoleForm({ ...EMPTY_ROLE });
      loadAll();
    } catch (e: unknown) {
      const msg = (e as { data?: { message?: string } })?.data?.message;
      toast.error(msg ?? "Failed to create role");
    } finally { setSaving(false); }
  };

  const handleDeleteRole = async (id: string) => {
    if (!confirm("Delete this role?")) return;
    try {
      await api.delete(`/roles/${id}`);
      setRoles((prev) => prev.filter((r) => r.id !== id));
      toast.success("Role deleted");
    } catch { toast.error("Cannot delete — role may be in use"); }
  };

  // ── Filtered users ────────────────────────────────────────────────────────
  const filtered = useMemo(() => users.filter((u) => {
    const q = search.toLowerCase();
    return `${u.firstName} ${u.lastName}`.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  }), [users, search]);

  const activeCount = users.filter((u) => u.status === "ACTIVE").length;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Users & Roles</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage staff access and role-based permissions</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadAll} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="gradient" className="gap-2" onClick={() => { setUserForm({ ...EMPTY_USER }); setUserModal(true); }}>
            <Plus className="h-4 w-4" /> Invite User
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Users",   value: users.length,                   color: "text-foreground" },
          { label: "Active",        value: activeCount,                    color: "text-emerald-500" },
          { label: "Inactive",      value: users.length - activeCount,     color: "text-muted-foreground" },
          { label: "Total Roles",   value: roles.length,                   color: "text-primary" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">Users ({users.length})</TabsTrigger>
          <TabsTrigger value="roles">Roles ({roles.length})</TabsTrigger>
        </TabsList>

        {/* ── Users Tab ──────────────────────────────────────────────────── */}
        <TabsContent value="users" className="mt-4 space-y-3">
          <div className="relative max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Search users…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-8 text-sm" />
          </div>

          <div className="rounded-xl border bg-card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/30">
                  {["User","Role","Branch","Status","Joined",""].map((h, i) => (
                    <th key={h + i} className={`px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide ${i >= 4 ? "text-right" : "text-left"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i}><td colSpan={6} className="px-4 py-3"><div className="h-6 rounded bg-muted animate-pulse" /></td></tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">No users found</td></tr>
                ) : filtered.map((u) => {
                  const initials = `${u.firstName[0] ?? ""}${u.lastName?.[0] ?? ""}`.toUpperCase();
                  const primaryRole = u.roles?.[0]?.role;
                  const isActive = u.status === "ACTIVE";
                  return (
                    <tr key={u.id} className="hover:bg-muted/40 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">{initials}</div>
                          <div>
                            <p className="text-sm font-medium">{u.firstName} {u.lastName}</p>
                            <p className="text-xs text-muted-foreground">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {primaryRole ? (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${ROLE_COLORS[primaryRole.type] ?? ROLE_COLORS.CUSTOM}`}>
                            {primaryRole.name}
                          </span>
                        ) : <span className="text-xs text-muted-foreground">No role</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{u.branch?.name ?? "—"}</td>
                      <td className="px-4 py-3">
                        {isActive
                          ? <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium"><CheckCircle className="h-3.5 w-3.5" />Active</span>
                          : <span className="flex items-center gap-1 text-xs text-muted-foreground"><XCircle className="h-3.5 w-3.5" />Inactive</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(u.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm"><MoreHorizontal className="h-3.5 w-3.5" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem onClick={() => { setRoleAssignModal(u); setSelectedRoleId(u.roles?.[0]?.role?.id ?? ""); }}>
                              <Key className="h-3.5 w-3.5 mr-2" /> Change Role
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleToggleStatus(u)}>
                              {isActive ? <><XCircle className="h-3.5 w-3.5 mr-2" />Deactivate</> : <><CheckCircle className="h-3.5 w-3.5 mr-2" />Activate</>}
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive" onClick={() => handleDeleteUser(u.id)}>
                              <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* ── Roles Tab ──────────────────────────────────────────────────── */}
        <TabsContent value="roles" className="mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {roles.map((role) => (
              <div key={role.id} className="rounded-xl border bg-card p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Shield className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{role.name}</p>
                      {role.isSystem
                        ? <span className="text-[10px] text-muted-foreground">System role</span>
                        : <span className="text-[10px] text-primary">Custom role</span>}
                    </div>
                  </div>
                  {!role.isSystem && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm"><MoreHorizontal className="h-3.5 w-3.5" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem className="text-destructive" onClick={() => handleDeleteRole(role.id)}>
                          <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete Role
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
                {role.description && <p className="text-xs text-muted-foreground mb-2">{role.description}</p>}
                <div className="flex items-center justify-between text-sm pt-3 border-t">
                  <span className="text-muted-foreground flex items-center gap-1 text-xs">
                    <User className="h-3.5 w-3.5" /> {role._count?.users ?? 0} users
                  </span>
                  <span className="text-xs font-medium">{role.permissions?.length ?? 0} perms</span>
                </div>
              </div>
            ))}
            <button
              onClick={() => { setRoleForm({ ...EMPTY_ROLE }); setRoleModal(true); }}
              className="rounded-xl border-2 border-dashed border-border bg-card/50 p-4 flex flex-col items-center justify-center gap-2 hover:border-primary/50 hover:bg-primary/5 transition-colors min-h-[120px]">
              <Plus className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm font-medium text-muted-foreground">Create Custom Role</p>
            </button>
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
              <div><Label className="text-xs mb-1.5 block">Role</Label>
                <Select value={userForm.roleId} onValueChange={(v) => setUserForm((f) => ({ ...f, roleId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                  <SelectContent>{roles.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
                </Select></div>
              <div><Label className="text-xs mb-1.5 block">Branch</Label>
                <Select value={userForm.branchId} onValueChange={(v) => setUserForm((f) => ({ ...f, branchId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                  <SelectContent>{branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                </Select></div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => setUserModal(false)} disabled={saving}>Cancel</Button>
              <Button variant="gradient" onClick={handleCreateUser} disabled={saving}>{saving ? "Creating…" : "Create User"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Create Role Modal ─────────────────────────────────────────────── */}
      <Dialog open={roleModal} onOpenChange={setRoleModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Create Custom Role</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label className="text-xs mb-1.5 block">Role Name *</Label>
              <Input value={roleForm.name} onChange={(e) => setRoleForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Store Supervisor" /></div>
            <div><Label className="text-xs mb-1.5 block">Description</Label>
              <Input value={roleForm.description} onChange={(e) => setRoleForm((f) => ({ ...f, description: e.target.value }))} placeholder="Optional description" /></div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => setRoleModal(false)} disabled={saving}>Cancel</Button>
              <Button variant="gradient" onClick={handleCreateRole} disabled={saving}>{saving ? "Creating…" : "Create Role"}</Button>
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
            <div><Label className="text-xs mb-1.5 block">Select New Role</Label>
              <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
                <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                <SelectContent>{roles.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
              </Select></div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => setRoleAssignModal(null)} disabled={saving}>Cancel</Button>
              <Button variant="gradient" onClick={handleAssignRole} disabled={saving || !selectedRoleId}>{saving ? "Saving…" : "Assign Role"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
