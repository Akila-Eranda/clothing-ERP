"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus, Star, Crown,
  Users, Gift, Eye, Edit, Trash2,
  RefreshCw, Download, Diamond, Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ColumnDef } from "@tanstack/react-table";
import { ClientSideTable } from "@/components/table/client-side-table";
import { DataTableColumnHeader } from "@/components/table/data-table-column-header";
import { TableActionsRow } from "@/components/table/table-actions-row";
import { toast } from "sonner";
import { useShopWorkspace, hasShopModule } from "@/lib/use-shop-profile";
import { ShopType } from "@/lib/shop-profiles";
import { api } from "@/lib/api";
import { formatNumber, getInitials } from "@/lib/utils";
import { AddCustomerModal, type Customer } from "@/components/customers/add-customer-modal";
import { ViewCustomerModal } from "@/components/customers/view-customer-modal";

// ── Tier config ───────────────────────────────────────────────────────────
const TIER_CONF: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  BRONZE:   { label: "Bronze",   color: "text-amber-700",  bg: "bg-amber-700/10",  icon: Star },
  SILVER:   { label: "Silver",   color: "text-slate-400",  bg: "bg-slate-400/10",  icon: Star },
  GOLD:     { label: "Gold",     color: "text-amber-500",  bg: "bg-amber-500/10",  icon: Crown },
  PLATINUM: { label: "Platinum", color: "text-violet-400", bg: "bg-violet-400/10", icon: Crown },
  DIAMOND:  { label: "Diamond",  color: "text-cyan-400",   bg: "bg-cyan-400/10",   icon: Diamond },
};

// ── CSV export ────────────────────────────────────────────────────────────
function exportCsv(customers: Customer[]) {
  const rows = customers.map((c) => [
    `"${c.firstName} ${c.lastName ?? ""}"`, `"${c.phone}"`, `"${c.email ?? ""}"`,
    c.tier, c.totalSpent, c.totalOrders, c.loyaltyPoints, c.walletBalance,
  ].join(","));
  const csv = ["Name,Phone,Email,Tier,TotalSpent,Orders,Points,Wallet", ...rows].join("\n");
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })), download: "customers-export.csv" });
  a.click();
}

// ── Column builder ────────────────────────────────────────────────────────
function buildColumns(
  onView:   (c: Customer) => void,
  onEdit:   (c: Customer) => void,
  onDelete: (c: Customer) => void,
  opts: { showLoyalty: boolean; customerLabel: string },
): ColumnDef<Customer>[] {
  const cols: ColumnDef<Customer>[] = [
    {
      id: "customer",
      header: ({ column }) => <DataTableColumnHeader column={column} title={opts.customerLabel.replace(/s$/, '')} />,
      cell: ({ row }) => {
        const c = row.original;
        const name = `${c.firstName} ${c.lastName ?? ""}`.trim();
        const tierConf = TIER_CONF[c.tier] ?? TIER_CONF.BRONZE;
        const TierIcon = tierConf.icon;
        return (
          <div className="flex items-center gap-2.5">
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarFallback className="text-xs font-bold">{getInitials(name)}</AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-semibold">{name}</p>
              <div className={`inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full mt-0.5 ${tierConf.bg} ${tierConf.color}`}>
                <TierIcon className="h-2 w-2" />{tierConf.label}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "phone",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Phone" />,
      cell: ({ row }) => <span className="text-sm font-mono">{row.original.phone}</span>,
    },
    {
      accessorKey: "email",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Email" />,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground truncate max-w-[160px] block">
          {row.original.email ?? "—"}
        </span>
      ),
    },
    {
      accessorKey: "totalSpent",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Total Spent" />,
      cell: ({ row }) => <span className="text-sm font-semibold">LKR {formatNumber(row.original.totalSpent)}</span>,
    },
    {
      accessorKey: "totalOrders",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Orders" />,
      cell: ({ row }) => <span className="text-sm">{row.original.totalOrders}</span>,
    },
  ];
  if (opts.showLoyalty) {
    cols.push({
      accessorKey: "loyaltyPoints",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Points" />,
      cell: ({ row }) => (
        <span className="text-sm font-semibold text-amber-500">{formatNumber(row.original.loyaltyPoints)}</span>
      ),
    });
  }
  cols.push(
    {
      accessorKey: "walletBalance",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Wallet" />,
      cell: ({ row }) => (
        <span className={`text-sm font-semibold ${row.original.walletBalance > 0 ? "text-emerald-500" : "text-muted-foreground"}`}>
          LKR {formatNumber(row.original.walletBalance)}
        </span>
      ),
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <TableActionsRow
          showAction={{ action: () => onView(row.original), tooltip: "View Profile" }}
          editAction={{ action: () => onEdit(row.original) }}
          deleteAction={{ action: () => onDelete(row.original) }}
        />
      ),
    },
  );
  return cols;
}

// ── Page ─────────────────────────────────────────────────────────────────
export default function CustomersPage() {
  const { profile, workspace } = useShopWorkspace();
  const showLoyalty = hasShopModule(profile, 'loyalty');
  const customerTitle = profile.type === ShopType.AGRICULTURE
    ? `${workspace.customerLabel} & Accounts`
    : `${workspace.customerLabel} & CRM`;
  const [customers, setCustomers]       = useState<Customer[]>([]);
  const [loading, setLoading]           = useState(true);
  const [addOpen, setAddOpen]           = useState(false);
  const [editCustomer, setEditCustomer] = useState<Customer | undefined>();
  const [viewId, setViewId]             = useState<string | null>(null);
  const [segments, setSegments]         = useState<{ key: string; label: string; count: number }[]>([]);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const [res, segRes] = await Promise.all([
        api.get<{ data: Customer[] }>("/customers?limit=500"),
        api.get<{ segments: { key: string; label: string; count: number }[] }>("/customers/segments"),
      ]);
      setCustomers(res.data?.data ?? (res.data as unknown as Customer[]) ?? []);
      setSegments(segRes.data?.segments ?? []);
    } catch { toast.error("Failed to load customers"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  const handleDelete = async (c: Customer) => {
    if (!window.confirm(`Delete ${c.firstName}? This cannot be undone.`)) return;
    try {
      await api.delete(`/customers/${c.id}`);
      toast.success("Customer deleted");
      fetchCustomers();
    } catch (e: unknown) { toast.error((e as Error).message ?? "Delete failed"); }
  };

  // stats
  const totalPoints = customers.reduce((s, c) => s + c.loyaltyPoints, 0);
  const totalWallet = customers.reduce((s, c) => s + c.walletBalance, 0);
  const premium     = customers.filter((c) => ["GOLD","PLATINUM","DIAMOND"].includes(c.tier)).length;

  const STATS = [
    { label: `Total ${workspace.customerLabel}`, value: customers.length, icon: Users, color: "text-blue-500", bg: "bg-blue-500/10" },
    ...(showLoyalty ? [
      { label: "Gold+ Members", value: premium, icon: Crown, color: "text-amber-500", bg: "bg-amber-500/10" },
      { label: "Loyalty Points", value: formatNumber(totalPoints), icon: Gift, color: "text-violet-500", bg: "bg-violet-500/10" },
    ] : []),
    { label: "Wallet Balance", value: `LKR ${formatNumber(totalWallet)}`, icon: Wallet, color: "text-emerald-500", bg: "bg-emerald-500/10" },
  ];

  const columns = buildColumns(
    (c) => setViewId(c.id),
    (c) => { setEditCustomer(c); setAddOpen(true); },
    handleDelete,
    { showLoyalty, customerLabel: workspace.customerLabel },
  );

  return (
    <div className="page-shell">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">{customerTitle}</h1>
          <p className="text-sm text-muted-foreground">
            Manage {workspace.customerLabel.toLowerCase()}{showLoyalty ? ' relationships and loyalty' : ' accounts and credit'}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={fetchCustomers} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportCsv(customers)} disabled={!customers.length} className="gap-1.5">
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => { setEditCustomer(undefined); setAddOpen(true); }}>
            <Plus className="h-3.5 w-3.5" /> Add {workspace.customerLabel.replace(/s$/, '')}
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

      {segments.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
          {segments.map((s) => (
            <Card key={s.key}>
              <CardContent className="p-3 text-center">
                <p className="text-lg font-bold">{s.count}</p>
                <p className="text-[10px] text-muted-foreground leading-tight">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Table */}
      <ClientSideTable
        data={customers}
        columns={columns}
        pageCount={Math.ceil(customers.length / 10)}
        searchableColumns={[
          { id: "phone", title: "Phone" },
          { id: "email", title: "Email" },
        ]}
        filterableColumns={[
          {
            id: "tier",
            title: "Tier",
            options: Object.entries(TIER_CONF).map(([v, c]) => ({ value: v, label: c.label })),
          },
        ]}
        isShowExportButtons={{ isShow: true, fileName: "customers-export" }}
      />

      {/* Modals */}
      <AddCustomerModal
        open={addOpen}
        onClose={() => { setAddOpen(false); setEditCustomer(undefined); }}
        onSaved={() => { fetchCustomers(); setAddOpen(false); setEditCustomer(undefined); }}
        editCustomer={editCustomer}
      />
      <ViewCustomerModal
        customerId={viewId}
        onClose={() => setViewId(null)}
        onEdit={(c) => { setEditCustomer(c); setAddOpen(true); }}
      />
    </div>
  );
}
