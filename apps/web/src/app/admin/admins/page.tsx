"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { UserCog, Plus, UserX, Shield, Users, X } from "lucide-react";
import { toast } from "sonner";
import { ClientSideTable, DataTableColumnHeader } from "@/components/table";
import { Button } from "@/components/ui/button";
import { PageHeader, PageKpiGrid, pageKpi } from "@/components/ui/page-kpi";
import { AdminStatusBadge } from "@/components/admin/admin-badges";
import {
  ADMIN_CARD,
  ADMIN_INPUT,
  ADMIN_MODAL_PANEL,
} from "@/lib/admin-ui";
import {
  adminAuth,
  fetchPlatformAdmins,
  createPlatformAdmin,
  deactivatePlatformAdmin,
  type PlatformAdmin,
} from "@/lib/admin-api";
import { parseApiList } from "@/lib/parse-api-list";

function fmtDate(s?: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-LK", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  });
}

function currentAdminId(): string | null {
  const token = adminAuth.getToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1] || "")) as { sub?: string; id?: string };
    return payload.sub || payload.id || null;
  } catch {
    return null;
  }
}

type FormState = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone: string;
};

const EMPTY_FORM: FormState = {
  email: "",
  password: "",
  firstName: "",
  lastName: "",
  phone: "",
};

export default function AdminsPage() {
  const [rows, setRows] = useState<PlatformAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const selfId = useMemo(() => currentAdminId(), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchPlatformAdmins();
      setRows(parseApiList<PlatformAdmin>(data));
    } catch (e) {
      setRows([]);
      toast.error(e instanceof Error ? e.message : "Failed to load platform admins");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const kpis = useMemo(
    () => [
      pageKpi("Total admins", rows.length, UserCog, "primary"),
      pageKpi(
        "Active",
        rows.filter((r) => String(r.status).toUpperCase() === "ACTIVE").length,
        Shield,
        "success",
      ),
      pageKpi(
        "Inactive",
        rows.filter((r) => String(r.status).toUpperCase() !== "ACTIVE").length,
        Users,
        "neutral",
      ),
    ],
    [rows],
  );

  async function handleCreate() {
    if (!form.email.trim() || !form.password || !form.firstName.trim() || !form.lastName.trim()) {
      toast.error("Email, password, first name, and last name are required");
      return;
    }
    if (form.password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setSaving(true);
    try {
      await createPlatformAdmin({
        email: form.email.trim(),
        password: form.password,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim() || undefined,
      });
      toast.success("Platform admin created");
      setModalOpen(false);
      setForm(EMPTY_FORM);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(admin: PlatformAdmin) {
    if (selfId && admin.id === selfId) {
      toast.error("You cannot deactivate your own admin account");
      return;
    }
    if (!window.confirm(`Deactivate ${admin.email}?`)) return;
    setActionId(admin.id);
    try {
      await deactivatePlatformAdmin(admin.id);
      toast.success("Admin deactivated");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Deactivate failed");
    } finally {
      setActionId(null);
    }
  }

  const columns = useMemo<ColumnDef<PlatformAdmin>[]>(
    () => [
      {
        id: "name",
        accessorFn: (a) =>
          `${a.firstName ?? ""} ${a.lastName ?? ""} ${a.email}`.trim(),
        header: ({ column }) => <DataTableColumnHeader column={column} title="Admin" />,
        cell: ({ row }) => {
          const a = row.original;
          const isSelf = selfId && a.id === selfId;
          return (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-foreground text-background text-[11px] font-bold flex items-center justify-center shrink-0">
                {(a.firstName ?? "?").charAt(0)}
                {(a.lastName ?? "").charAt(0)}
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground">
                  {[a.firstName, a.lastName].filter(Boolean).join(" ") || "—"}
                  {isSelf ? (
                    <span className="ml-1.5 text-[10px] font-medium text-muted-foreground">(you)</span>
                  ) : null}
                </p>
                <p className="text-[11px] text-muted-foreground">{a.email}</p>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: "phone",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Phone" />,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{row.original.phone || "—"}</span>
        ),
      },
      {
        accessorKey: "status",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => <AdminStatusBadge status={row.original.status} />,
      },
      {
        accessorKey: "createdAt",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Joined" />,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {fmtDate(row.original.createdAt)}
          </span>
        ),
      },
      {
        id: "actions",
        enableSorting: false,
        cell: ({ row }) => {
          const a = row.original;
          const isSelf = !!(selfId && a.id === selfId);
          const inactive = String(a.status).toUpperCase() !== "ACTIVE";
          if (inactive) {
            return <span className="text-[11px] text-muted-foreground">—</span>;
          }
          return (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs gap-1 text-amber-700 dark:text-amber-400"
              disabled={isSelf || actionId === a.id}
              title={isSelf ? "Cannot deactivate yourself" : "Deactivate"}
              onClick={() => void handleDeactivate(a)}
            >
              <UserX size={12} />
              Deactivate
            </Button>
          );
        },
      },
    ],
    [actionId, selfId],
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Platform admins"
        description="Manage company admin accounts for the control plane"
        onRefresh={() => void load()}
        refreshing={loading}
        actions={
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              setForm(EMPTY_FORM);
              setModalOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            New admin
          </Button>
        }
      />

      <PageKpiGrid items={kpis} cols={3} loading={loading} />

      <div className={ADMIN_CARD + " p-1"}>
        <ClientSideTable
          data={rows}
          columns={columns}
          searchableColumns={[{ id: "name", title: "Name / email" }]}
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
          isShowExportButtons={{ isShow: true, fileName: "platform-admins-export" }}
        />
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className={`${ADMIN_MODAL_PANEL} max-w-md max-h-[90vh] overflow-y-auto`}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-sm font-bold text-foreground">Create platform admin</h3>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => setModalOpen(false)}>
                <X size={16} />
              </Button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">First name</label>
                  <input
                    className={ADMIN_INPUT}
                    value={form.firstName}
                    onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Last name</label>
                  <input
                    className={ADMIN_INPUT}
                    value={form.lastName}
                    onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Email</label>
                <input
                  type="email"
                  className={ADMIN_INPUT}
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Password</label>
                <input
                  type="password"
                  className={ADMIN_INPUT}
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="Min. 8 characters"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Phone</label>
                <input
                  className={ADMIN_INPUT}
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="Optional"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button type="button" disabled={saving} onClick={() => void handleCreate()}>
                {saving ? "Creating…" : "Create admin"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
