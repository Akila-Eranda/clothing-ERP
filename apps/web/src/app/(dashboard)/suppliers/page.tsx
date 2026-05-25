"use client";

import { useState, useEffect, useCallback } from "react";
import { Truck, Plus, Phone, Mail, MapPin, Users, ShoppingBag, RefreshCw, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ColumnDef } from "@tanstack/react-table";
import { ClientSideTable } from "@/components/table/client-side-table";
import { DataTableColumnHeader } from "@/components/table/data-table-column-header";
import { TableActionsRow } from "@/components/table/table-actions-row";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import { type Supplier } from "@/components/suppliers/add-supplier-modal";
import { useRouter } from "next/navigation";

// ── Column builder ────────────────────────────────────────────────────────
function buildColumns(
  onView:   (s: Supplier) => void,
  onEdit:   (s: Supplier) => void,
  onDelete: (s: Supplier) => void,
): ColumnDef<Supplier>[] {
  return [
    {
      accessorKey: "name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Supplier" />,
      cell: ({ row }) => {
        const s = row.original;
        return (
          <div>
            <p className="text-sm font-semibold">{s.name}</p>
            {s.contactPerson && (
              <p className="text-xs text-muted-foreground">{s.contactPerson}</p>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "phone",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Contact" />,
      cell: ({ row }) => {
        const s = row.original;
        return (
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5 text-xs">
              <Phone className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="font-mono">{s.phone}</span>
            </div>
            {s.email && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Mail className="h-3 w-3 shrink-0" />
                <span className="truncate max-w-[160px]">{s.email}</span>
              </div>
            )}
          </div>
        );
      },
    },
    {
      id: "location",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Location" />,
      cell: ({ row }) => {
        const s = row.original;
        const loc = [s.city, s.state].filter(Boolean).join(", ");
        return loc ? (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0" />{loc}
          </div>
        ) : <span className="text-xs text-muted-foreground">—</span>;
      },
    },
    {
      id: "purchases",
      header: ({ column }) => <DataTableColumnHeader column={column} title="POs" />,
      cell: ({ row }) => (
        <span className="text-sm font-medium">{row.original._count?.purchases ?? 0}</span>
      ),
    },
    {
      accessorKey: "creditDays",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Credit Days" />,
      cell: ({ row }) => (
        <span className="text-sm">{row.original.creditDays ?? 0} days</span>
      ),
    },
    {
      accessorKey: "balance",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Balance" />,
      cell: ({ row }) => {
        const bal = row.original.balance ?? 0;
        return (
          <span className={`text-sm font-semibold ${bal > 0 ? "text-amber-500" : "text-emerald-500"}`}>
            {bal > 0 ? `₹${formatNumber(bal)}` : "Clear"}
          </span>
        );
      },
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
          showAction={{ action: () => onView(row.original) }}
          editAction={{ action: () => onEdit(row.original) }}
          deleteAction={{ action: () => onDelete(row.original) }}
        />
      ),
    },
  ];
}

// ── Page ─────────────────────────────────────────────────────────────────
export default function SuppliersPage() {
  const router = useRouter();
  const [suppliers, setSuppliers]       = useState<Supplier[]>([]);
  const [loading, setLoading]           = useState(true);
  const fetchSuppliers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: Supplier[] }>("/suppliers?limit=200");
      setSuppliers(res.data?.data ?? (res.data as unknown as Supplier[]) ?? []);
    } catch { toast.error("Failed to load suppliers"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchSuppliers(); }, [fetchSuppliers]);

  const handleDelete = async (s: Supplier) => {
    if (!window.confirm(`Delete "${s.name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/suppliers/${s.id}`);
      toast.success("Supplier deleted");
      fetchSuppliers();
    } catch (e: unknown) { toast.error((e as Error).message ?? "Delete failed"); }
  };

  const activeCount = suppliers.filter((s) => s.isActive).length;
  const totalCredit = suppliers.reduce((sum, s) => sum + (s.creditLimit ?? 0), 0);
  const outstanding = suppliers.reduce((sum, s) => sum + (s.balance ?? 0), 0);

  const STATS = [
    { label: "Total Suppliers",  value: suppliers.length, icon: Truck,       color: "text-blue-500",    bg: "bg-blue-500/10" },
    { label: "Active",           value: activeCount,      icon: Users,       color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { label: "Credit Limit",     value: `LKR ${formatNumber(totalCredit)}`, icon: CreditCard, color: "text-violet-500", bg: "bg-violet-500/10" },
    { label: "Outstanding",      value: `LKR ${formatNumber(outstanding)}`, icon: ShoppingBag, color: "text-amber-500", bg: "bg-amber-500/10" },
  ];

  const columns = buildColumns(
    (s) => router.push(`/suppliers/${s.id}`),
    (s) => router.push(`/suppliers/${s.id}/edit`),
    handleDelete,
  );

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Suppliers</h1>
          <p className="text-sm text-muted-foreground">Manage vendor relationships and purchase orders</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={fetchSuppliers} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => router.push("/suppliers/new")}>
            <Plus className="h-3.5 w-3.5" /> Add Supplier
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
        data={suppliers}
        columns={columns}
        pageCount={Math.ceil(suppliers.length / 10)}
        searchableColumns={[{ id: "name", title: "Supplier Name" }]}
        filterableColumns={[
          {
            id: "isActive",
            title: "Status",
            options: [
              { value: "true",  label: "Active" },
              { value: "false", label: "Inactive" },
            ],
          },
        ]}
        isShowExportButtons={{ isShow: true, fileName: "suppliers-export" }}
      />

    </div>
  );
}
