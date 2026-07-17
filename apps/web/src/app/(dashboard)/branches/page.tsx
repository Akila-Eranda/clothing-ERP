"use client";

import { useState, useEffect, useCallback } from "react";
import { Building2, MapPin, Phone, Mail, Users, Package, Plus, RefreshCw, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ColumnDef } from "@tanstack/react-table";
import { ClientSideTable } from "@/components/table/client-side-table";
import { DataTableColumnHeader } from "@/components/table/data-table-column-header";
import { TableActionsRow } from "@/components/table/table-actions-row";
import { OpenRecordButton } from "@/components/table/open-record-button";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { AddBranchModal, type Branch } from "@/components/branches/add-branch-modal";

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
        <Badge variant={row.original.isActive ? "success" : "secondary"} className="text-[10px]">
          {row.original.isActive ? "Active" : "Inactive"}
        </Badge>
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
      setBranches(res.data?.data ?? (res.data as unknown as Branch[]) ?? []);
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
    { label: "Total Branches",  value: branches.length,          icon: Building2, color: "text-blue-500",    bg: "bg-blue-500/10" },
    { label: "Active Branches", value: activeCount,              icon: Building2, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { label: "Total Staff",     value: totalStaff,               icon: Users,     color: "text-violet-500",  bg: "bg-violet-500/10" },
    { label: "Stock Items",     value: totalStock.toLocaleString(), icon: Package, color: "text-amber-500",   bg: "bg-amber-500/10" },
  ];

  const columns = buildColumns(
    (b) => { setEditBranch(b); setAddOpen(true); },
    handleDelete,
  );

  return (
    <div className="page-shell">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Branches</h1>
          <p className="text-sm text-muted-foreground">Manage all store locations and branches</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchBranches} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => { setEditBranch(undefined); setAddOpen(true); }}>
            <Plus className="h-3.5 w-3.5" /> Add Branch
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {STATS.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${s.bg}`}><s.icon className={`h-5 w-5 ${s.color}`} /></div>
              <div><p className="text-xl font-bold">{s.value}</p><p className="text-xs text-muted-foreground">{s.label}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Table */}
      <ClientSideTable
        data={branches}
        columns={columns}
        pageCount={Math.ceil(branches.length / 10)}
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
