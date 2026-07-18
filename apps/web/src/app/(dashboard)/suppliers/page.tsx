"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Truck, Plus, Phone, Mail, MapPin, Users, ShoppingBag, RefreshCw, CreditCard, Lightbulb } from "lucide-react";
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
import { useShopWorkspace } from "@/lib/use-shop-profile";
import { getSupplierPageCopy, type SupplierPageCopy } from "@/lib/shop-vertical";
import { OpenRecordButton } from "@/components/table/open-record-button";

// ── Column builder ────────────────────────────────────────────────────────
function buildColumns(
  copy: SupplierPageCopy,
  onView:   (s: Supplier) => void,
  onEdit:   (s: Supplier) => void,
  onDelete: (s: Supplier) => void,
): ColumnDef<Supplier>[] {
  return [
    {
      accessorKey: "name",
      header: ({ column }) => <DataTableColumnHeader column={column} title={copy.singular} />,
      cell: ({ row }) => {
        const s = row.original;
        return (
          <div>
            <OpenRecordButton onClick={() => onView(s)} className="text-sm">
              {s.name}
            </OpenRecordButton>
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
            {bal > 0 ? `LKR ${formatNumber(bal)}` : "Clear"}
          </span>
        );
      },
    },
    {
      id: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => (
        <Badge variant={row.original.isActive ? "success" : "secondary"} className="h-6 rounded-full px-2.5 text-[11px] font-semibold inline-flex items-center">
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
  const { profile, workspace } = useShopWorkspace();
  const copy = useMemo(() => getSupplierPageCopy(profile, workspace), [profile, workspace]);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading]     = useState(true);

  const fetchSuppliers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: Supplier[] }>("/suppliers?limit=200");
      setSuppliers(res.data?.data ?? (res.data as unknown as Supplier[]) ?? []);
    } catch { toast.error(`Failed to load ${copy.plural.toLowerCase()}`); }
    finally { setLoading(false); }
  }, [copy.plural]);

  useEffect(() => { fetchSuppliers(); }, [fetchSuppliers]);

  const handleDelete = async (s: Supplier) => {
    if (!window.confirm(copy.deleteConfirm(s.name))) return;
    try {
      await api.delete(`/suppliers/${s.id}`);
      toast.success(`${copy.singular} deleted`);
      fetchSuppliers();
    } catch (e: unknown) { toast.error((e as Error).message ?? "Delete failed"); }
  };

  const activeCount = suppliers.filter((s) => s.isActive).length;
  const totalCredit = suppliers.reduce((sum, s) => sum + (s.creditLimit ?? 0), 0);
  const outstanding = suppliers.reduce((sum, s) => sum + (s.balance ?? 0), 0);

  const STATS = [
    { label: `Total ${copy.plural}`, value: suppliers.length, icon: Truck,       color: "text-blue-600",    bg: "bg-blue-500/15", tint: "border-blue-200/70 bg-gradient-to-br from-blue-50 to-white dark:border-blue-500/20 dark:from-blue-500/10 dark:to-transparent" },
    { label: "Active",               value: activeCount,      icon: Users,       color: "text-emerald-600", bg: "bg-emerald-500/15", tint: "border-emerald-200/70 bg-gradient-to-br from-emerald-50 to-white dark:border-emerald-500/20 dark:from-emerald-500/10 dark:to-transparent" },
    { label: "Credit Limit",         value: `LKR ${formatNumber(totalCredit)}`, icon: CreditCard, color: "text-violet-600", bg: "bg-violet-500/15", tint: "border-violet-200/70 bg-gradient-to-br from-violet-50 to-white dark:border-violet-500/20 dark:from-violet-500/10 dark:to-transparent" },
    { label: "Outstanding",          value: `LKR ${formatNumber(outstanding)}`, icon: ShoppingBag, color: "text-amber-600", bg: "bg-amber-500/15", tint: "border-amber-200/70 bg-gradient-to-br from-amber-50 to-white dark:border-amber-500/20 dark:from-amber-500/10 dark:to-transparent" },
  ];

  const columns = buildColumns(
    copy,
    (s) => router.push(`/suppliers/${s.id}`),
    (s) => router.push(`/suppliers/${s.id}/edit`),
    handleDelete,
  );

  return (
    <div className="p-4 md:p-5 space-y-4 max-w-[1600px] mx-auto">
      {/* Header — compact single row */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="min-w-0">
          <h1 className="text-[26px] md:text-3xl font-bold tracking-tight leading-tight flex items-center gap-2">
            <span>{profile.emoji}</span> {copy.pageTitle}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{copy.subtitle}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <Button variant="outline" onClick={fetchSuppliers} className="h-10 rounded-[12px] gap-1.5 text-sm">
            <RefreshCw className={`h-[18px] w-[18px] ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button className="h-10 rounded-[12px] gap-1.5 text-sm" onClick={() => router.push("/suppliers/new")}>
            <Plus className="h-[18px] w-[18px]" /> {copy.addButton}
          </Button>
        </div>
      </div>

      {/* Stats — compact 68px cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {STATS.map((s) => (
          <Card
            key={s.label}
            className={`rounded-[18px] shadow-[0_2px_10px_rgba(15,23,42,0.04)] hover:-translate-y-0.5 hover:shadow-[0_4px_14px_rgba(15,23,42,0.07)] transition-all duration-150 ${s.tint}`}
          >
            <CardContent className="h-[68px] p-4 flex items-center gap-3">
              <div className={`h-9 w-9 rounded-[12px] flex items-center justify-center shrink-0 ${s.bg}`}>
                <s.icon className={`h-[18px] w-[18px] ${s.color}`} strokeWidth={1.75} />
              </div>
              <div className="min-w-0">
                <p className={`${typeof s.value === "string" ? "text-lg" : "text-[22px]"} font-bold leading-none tabular-nums truncate`}>{s.value}</p>
                <p className="text-[11px] text-muted-foreground font-medium mt-1 truncate">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Table — fills remaining viewport */}
      <div className="overflow-y-auto" style={{ height: "calc(100vh - 240px)" }}>
        <ClientSideTable
          data={suppliers}
          columns={columns}
          pageCount={Math.ceil(suppliers.length / 10)}
          searchableColumns={[{ id: "name", title: copy.nameLabel }]}
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
          isShowExportButtons={{ isShow: true, fileName: copy.csvFileName }}
        />
      </div>

      {/* Tips */}
      <div className="grid md:grid-cols-3 gap-3">
        {copy.tips.map((tip) => (
          <Card key={tip} className="rounded-[18px] border border-dashed border-border shadow-none bg-muted/40">
            <CardContent className="p-4 flex gap-3 items-start">
              <div className="h-9 w-9 rounded-[12px] bg-amber-50 flex items-center justify-center shrink-0">
                <Lightbulb className="h-4 w-4 text-amber-600" />
              </div>
              <p className="text-sm font-normal text-muted-foreground leading-relaxed">{tip}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
