"use client";

import { TrendingUp, ShoppingCart, DollarSign, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatNumber } from "@/lib/utils";
import { DUMMY_RECENT_SALES } from "@/lib/constants";
import { ColumnDef } from "@tanstack/react-table";
import { ClientSideTable } from "@/components/table/client-side-table";
import { DataTableColumnHeader } from "@/components/table/data-table-column-header";
import { TableActionsRow } from "@/components/table/table-actions-row";

const STATS = [
  { label: "Today's Sales", value: "₹1,28,450", icon: DollarSign, color: "text-emerald-500", bg: "bg-emerald-500/10" },
  { label: "Total Orders", value: "284", icon: ShoppingCart, color: "text-blue-500", bg: "bg-blue-500/10" },
  { label: "Avg Order Value", value: "₹4,523", icon: TrendingUp, color: "text-violet-500", bg: "bg-violet-500/10" },
  { label: "Returns", value: "12", icon: RotateCcw, color: "text-amber-500", bg: "bg-amber-500/10" },
];

type Sale = typeof DUMMY_RECENT_SALES[number];

const columns: ColumnDef<Sale>[] = [
  {
    accessorKey: "id",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Invoice" />,
    cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.id}</span>,
  },
  {
    accessorKey: "customer",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Customer" />,
    cell: ({ row }) => <span className="text-sm font-medium">{row.original.customer}</span>,
  },
  {
    accessorKey: "items",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Items" />,
    cell: ({ row }) => <span className="text-sm">{row.original.items}</span>,
  },
  {
    accessorKey: "method",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Method" />,
    cell: ({ row }) => <span className="capitalize text-sm text-muted-foreground">{row.original.method}</span>,
  },
  {
    accessorKey: "amount",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" />,
    cell: ({ row }) => <span className="text-sm font-semibold">₹{formatNumber(row.original.amount)}</span>,
  },
  {
    accessorKey: "time",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Time" />,
    cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.time}</span>,
  },
  {
    accessorKey: "status",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    cell: ({ row }) => (
      <Badge variant={row.original.status === "completed" ? "success" : "warning"} className="text-[10px] capitalize">
        {row.original.status}
      </Badge>
    ),
  },
  {
    id: "actions",
    cell: ({ row }) => (
      <TableActionsRow
        showAction={{ action: () => console.log("view", row.original.id) }}
        downloadAction={{ action: () => console.log("download", row.original.id) }}
        dropMoreActions={[
          { text: "Print Receipt", function: () => console.log("print", row.original.id) },
          { text: "Refund", function: () => console.log("refund", row.original.id) },
        ]}
      />
    ),
  },
];

export default function SalesPage() {
  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Sales</h1>
          <p className="text-sm text-muted-foreground">View and manage all sales transactions</p>
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {STATS.map((s) => (
          <Card key={s.label}><CardContent className="p-4 flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${s.bg}`}><s.icon className={`h-5 w-5 ${s.color}`} /></div>
            <div><p className="text-xl font-bold">{s.value}</p><p className="text-xs text-muted-foreground">{s.label}</p></div>
          </CardContent></Card>
        ))}
      </div>

      <ClientSideTable
        data={DUMMY_RECENT_SALES}
        columns={columns}
        pageCount={Math.ceil(DUMMY_RECENT_SALES.length / 10)}
        searchableColumns={[
          { id: "customer", title: "Customer" },
          { id: "id", title: "Invoice" },
        ]}
        filterableColumns={[
          {
            id: "status",
            title: "Status",
            options: [
              { label: "Completed", value: "completed" },
              { label: "Refunded", value: "refunded" },
              { label: "Pending", value: "pending" },
            ],
          },
          {
            id: "method",
            title: "Payment Method",
            options: [
              { label: "UPI", value: "upi" },
              { label: "Card", value: "card" },
              { label: "Cash", value: "cash" },
            ],
          },
        ]}
        isShowExportButtons
      />
    </div>
  );
}
