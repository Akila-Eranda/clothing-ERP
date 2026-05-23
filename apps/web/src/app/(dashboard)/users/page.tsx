"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Shield, Search, Plus, MoreHorizontal, CheckCircle, XCircle, User, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const DUMMY_USERS = [
  { id: "U001", name: "Arun Kumar", email: "arun@demo.com", role: "Branch Manager", roleType: "BRANCH_MANAGER", status: "active", lastLogin: "2 hours ago", branch: "Main Store" },
  { id: "U002", name: "Sunita Patel", email: "sunita@demo.com", role: "Cashier", roleType: "CASHIER", status: "active", lastLogin: "30 min ago", branch: "Main Store" },
  { id: "U003", name: "Vikram Singh", email: "vikram@demo.com", role: "Inventory Manager", roleType: "STAFF", status: "active", lastLogin: "1 day ago", branch: "Andheri" },
  { id: "U004", name: "Pooja Reddy", email: "pooja@demo.com", role: "Cashier", roleType: "CASHIER", status: "active", lastLogin: "3 hours ago", branch: "Pune Branch" },
  { id: "U005", name: "Kiran Mehta", email: "kiran@demo.com", role: "Accountant", roleType: "STAFF", status: "inactive", lastLogin: "5 days ago", branch: "Main Store" },
];

const DUMMY_ROLES = [
  { id: "R001", name: "Super Admin", type: "SUPER_ADMIN", users: 1, permissions: 42, isSystem: true },
  { id: "R002", name: "Tenant Admin", type: "TENANT_ADMIN", users: 1, permissions: 38, isSystem: true },
  { id: "R003", name: "Branch Manager", type: "BRANCH_MANAGER", users: 3, permissions: 28, isSystem: true },
  { id: "R004", name: "Cashier", type: "CASHIER", users: 8, permissions: 12, isSystem: true },
  { id: "R005", name: "Inventory Staff", type: "STAFF", users: 4, permissions: 10, isSystem: false },
  { id: "R006", name: "Accountant", type: "STAFF", users: 2, permissions: 8, isSystem: false },
];

const ROLE_COLORS: Record<string, string> = {
  SUPER_ADMIN: "bg-red-500/10 text-red-500 border-red-500/20",
  TENANT_ADMIN: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  BRANCH_MANAGER: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  CASHIER: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  STAFF: "bg-amber-500/10 text-amber-500 border-amber-500/20",
};

export default function UsersPage() {
  const [search, setSearch] = React.useState("");

  const filteredUsers = DUMMY_USERS.filter((u) =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.role.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Users & Roles</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage staff access and role-based permissions</p>
        </div>
        <Button variant="gradient" className="gap-2">
          <Plus className="h-4 w-4" /> Invite User
        </Button>
      </div>

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">Users ({DUMMY_USERS.length})</TabsTrigger>
          <TabsTrigger value="roles">Roles ({DUMMY_ROLES.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-4 space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search users..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          <div className="rounded-xl border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/30">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">User</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Role</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Branch</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Last Login</th>
                <th className="px-4 py-3" />
              </tr></thead>
              <tbody>
                {filteredUsers.map((user, i) => (
                  <motion.tr
                    key={user.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="border-b last:border-0 hover:bg-muted/20 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                          {user.name.split(" ").map((n) => n[0]).join("")}
                        </div>
                        <div>
                          <p className="font-medium">{user.name}</p>
                          <p className="text-xs text-muted-foreground">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${ROLE_COLORS[user.roleType] ?? "bg-muted"}`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{user.branch}</td>
                    <td className="px-4 py-3 text-center">
                      {user.status === "active"
                        ? <CheckCircle className="h-4 w-4 text-emerald-500 inline" />
                        : <XCircle className="h-4 w-4 text-muted-foreground inline" />}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{user.lastLogin}</td>
                    <td className="px-4 py-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm"><MoreHorizontal className="h-3.5 w-3.5" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>Edit User</DropdownMenuItem>
                          <DropdownMenuItem>Change Role</DropdownMenuItem>
                          <DropdownMenuItem>Reset Password</DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive">{user.status === "active" ? "Deactivate" : "Activate"}</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="roles" className="mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {DUMMY_ROLES.map((role, i) => (
              <motion.div
                key={role.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                className="rounded-xl border bg-card p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Shield className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{role.name}</p>
                      {role.isSystem && <span className="text-[10px] text-muted-foreground">System role</span>}
                    </div>
                  </div>
                  {!role.isSystem && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm"><MoreHorizontal className="h-3.5 w-3.5" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>Edit Permissions</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive">Delete Role</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
                <div className="flex items-center justify-between text-sm mt-3 pt-3 border-t">
                  <span className="text-muted-foreground flex items-center gap-1"><User className="h-3.5 w-3.5" /> {role.users} users</span>
                  <span className="font-medium">{role.permissions} permissions</span>
                </div>
              </motion.div>
            ))}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: DUMMY_ROLES.length * 0.06 }}
              className="rounded-xl border-2 border-dashed border-border bg-card/50 p-4 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
            >
              <Plus className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm font-medium text-muted-foreground">Create Custom Role</p>
            </motion.div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
