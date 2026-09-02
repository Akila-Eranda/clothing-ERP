"use client";

import { useState, useEffect, useCallback } from "react";
import { Building2, MapPin, Phone, Mail, Users, Package, Plus, RefreshCw, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TableStatusBadge } from "@/components/ui/table-status-badge";
import { PageKpiGrid } from "@/components/ui/page-kpi";
import { ColumnDef } from "@tanstack/react-table";
import { ClientSideTable, DataTableColumnHeader, TableActionsRow, OpenRecordButton } from "@/components/table";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { AddBranchModal, type Branch } from "@/components/branches/add-branch-modal";
import { parseApiList } from "@/lib/parse-api-list";

// ── Columns ───────────────────────────────────────────────────────────────
function buildColumns(
  onEdit:   (b: Branch) => void,
  onDelete: (b: Branch) => void,
): ColumnDef<Branch>[] {
  return [
    {
      accessorKey: "name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Branch" />,
      cell: ({ row }) => {
        const b = row.original;
        return (
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Building2 className="h-4 w-4 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <OpenRecordButton onClick={() => onEdit(b)} className="text-sm" title="Edit branch">
                  {b.name}
                </OpenRecordButton>
                {b.isDefault && (
                  <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                    <Star className="h-2 w-2" />HQ
                  </span>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground font-mono">{b.code}</p>
            </div>
          </div>
        );
      },
    },
    {
      id: "location",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Location" />,
      cell: ({ row }) => {
        const b = row.original;
        const loc = [b.city, b.state].filter(Boolean).join(", ");
        return (
          <div className="space-y-0.5">
            {loc && <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><MapPin className="h-3 w-3 shrink-0" />{loc}</div>}
            {b.address && <p className="text-[10px] text-muted-foreground truncate max-w-[180px]">{b.address}</p>}
          </div>
        );
      },
    },
    {
      id: "contact",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Contact" />,
      cell: ({ row }) => {
        const b = row.original;
        return (
          <div className="space-y-0.5">
            {b.phone && <div className="flex items-center gap-1.5 text-xs font-mono"><Phone className="h-3 w-3 text-muted-foreground" />{b.phone}</div>}
            {b.email && <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Mail className="h-3 w-3" /><span className="truncate max-w-[140px]">{b.email}</span></div>}
          </div>
        );
      },
    },
    {
      id: "staff",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Staff" />,
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5 text-sm">
          <Users className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-semibold">{row.original._count?.users ?? 0}</span>
        </div>
      ),
    },
    {
      id: "inventory",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Stock Items" />,
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5 text-sm">
          <Package className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-semibold">{(row.original._count?.inventory ?? 0).toLocaleString()}</span>
        </div>
      ),
    },
    {
      id: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => (
        <TableStatusBadge status={row.original.isActive ? "ACTIVE" : "INACTIVE"} />
      ),
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <TableActionsRow
          editAction={{ action: () => onEdit(row.original) }}
          deleteAction={{ action: () => onDelete(row.original) }}
        />
      ),
    },
  ];
}

// ── Page ─────────────────────────────────────────────────────────────────
export default function BranchesPage() {
  const [branches, setBranches]       = useState<Branch[]>([]);
  const [loading, setLoading]         = useState(true);
  const [addOpen, setAddOpen]         = useState(false);
  const [editBranch, setEditBranch]   = useState<Branch | undefined>();

  const fetchBranches = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: Branch[] }>("/branches?limit=100");
      setBranches(parseApiList<Branch>(res.data));
    } catch { toast.error("Failed to load branches"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchBranches(); }, [fetchBranches]);

  const handleDelete = async (b: Branch) => {
    if (!window.confirm(`Delete "${b.name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/branches/${b.id}`);
      toast.success("Branch deleted");
      fetchBranches();
    } catch (e: unknown) { toast.error((e as Error).message ?? "Delete failed"); }
  };

  const totalStaff = branches.reduce((s, b) => s + (b._count?.users ?? 0), 0);
  const totalStock = branches.reduce((s, b) => s + (b._count?.inventory ?? 0), 0);
  const activeCount = branches.filter((b) => b.isActive).length;

  const STATS = [
    { label: "Total Branches",  value: branches.length,          icon: Building2, color: "text-blue-600",    bg: "bg-primary/10", tint: "border-blue-200/70 bg-gradient-to-br from-blue-50 to-white dark:border-blue-500/20 dark:from-blue-500/10 dark:to-transparent" },
    { label: "Active Branches", value: activeCount,              icon: Building2, color: "text-emerald-600", bg: "bg-emerald-500/10", tint: "bg-card border-border" },
    { label: "Total Staff",     value: totalStaff,               icon: Users,     color: "text-violet-600",  bg: "bg-slate-500/10", tint: "border-violet-200/70 bg-gradient-to-br from-violet-50 to-white dark:border-violet-500/20 dark:from-violet-500/10 dark:to-transparent" },
    { label: "Stock Items",     value: totalStock.toLocaleString(), icon: Package, color: "text-amber-600",   bg: "bg-amber-500/10", tint: "bg-card border-border" },
  ];

  const columns = buildColumns(
    (b) => { setEditBranch(b); setAddOpen(true); },
    handleDelete,
  );

  return (
    <div className="page-shell">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="min-w-0">
          <h1 className="text-[26px] md:text-3xl font-bold tracking-tight leading-tight">Branches</h1>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">Manage all store locations and branches</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <Button variant="outline" onClick={fetchBranches} className="gap-1.5">
            <RefreshCw className={`h-[18px] w-[18px] ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <div className="hidden sm:block h-6 w-px bg-slate-200 dark:bg-white/10 mx-0.5" aria-hidden />
          <Button className="gap-1.5" onClick={() => { setEditBranch(undefined); setAddOpen(true); }}>
            <Plus className="h-[18px] w-[18px]" /> Add Branch
          </Button>
        </div>
      </div>

      {/* Stats */}
      <PageKpiGrid items={STATS} />

      {/* Table */}
      <ClientSideTable
          data={branches}
          columns={columns}
          searchableColumns={[{ id: "name", title: "Branch Name" }]}
          filterableColumns={[{
            id: "isActive", title: "Status",
            options: [{ value: "true", label: "Active" }, { value: "false", label: "Inactive" }],
          }]}
          isShowExportButtons={{ isShow: true, fileName: "branches-export" }}
        />

      {/* Modal */}
      <AddBranchModal
        open={addOpen}
        onClose={() => { setAddOpen(false); setEditBranch(undefined); }}
        onSaved={() => { fetchBranches(); setAddOpen(false); setEditBranch(undefined); }}
        editBranch={editBranch}
      />
    </div>
  );
}