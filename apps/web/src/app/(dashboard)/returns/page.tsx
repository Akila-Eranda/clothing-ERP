"use client";

import { Plus, CheckCircle, Clock, XCircle, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ColumnDef } from "@tanstack/react-table";
import { ClientSideTable } from "@/components/table/client-side-table";
import { DataTableColumnHeader } from "@/components/table/data-table-column-header";
import { TableActionsRow } from "@/components/table/table-actions-row";

const DUMMY_RETURNS = [
  { id: "RET-001", saleId: "INV-2024-1891", customer: "Priya Sharma", items: 2, amount: 2800, status: "approved", date: "Dec 18, 2024", reason: "Size mismatch" },
  { id: "RET-002", saleId: "INV-2024-1756", customer: "Rahul Verma", items: 1, amount: 1500, status: "pending", date: "Dec 17, 2024", reason: "Defective product" },
  { id: "RET-003", saleId: "INV-2024-1643", customer: "Anjali Mehta", items: 3, amount: 4200, status: "completed", date: "Dec 16, 2024", reason: "Wrong item delivered" },
  { id: "RET-004", saleId: "INV-2024-1590", customer: "Suresh Kumar", items: 1, amount: 999, status: "rejected", date: "Dec 15, 2024", reason: "Personal preference" },
  { id: "RET-005", saleId: "INV-2024-1501", customer: "Deepa Nair", items: 2, amount: 3600, status: "pending", date: "Dec 14, 2024", reason: "Color not as expected" },
];

const STATUS_CONFIG = {
  approved: { label: "Approved", icon: CheckCircle, variant: "success" },
  pending:  { label: "Pending",  icon: Clock,        variant: "warning" },
  completed:{ label: "Completed",icon: CheckCircle,  variant: "default" },
  rejected: { label: "Rejected", icon: XCircle,      variant: "danger"  },
} as const;

type Return = typeof DUMMY_RETURNS[number];

const columns: ColumnDef<Return>[] = [
  {
    accessorKey: "id",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Return ID" />,
    cell: ({ row }) => <span className="font-mono text-xs font-medium text-primary">{row.original.id}</span>,
  },
  {
    accessorKey: "saleId",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Invoice" />,
    cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.saleId}</span>,
  },
  {
    accessorKey: "customer",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Customer" />,
    cell: ({ row }) => <span className="text-sm font-medium">{row.original.customer}</span>,
  },
  {
    accessorKey: "reason",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Reason" />,
    cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.reason}</span>,
  },
  {
    accessorKey: "items",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Items" />,
    cell: ({ row }) => (
      <span className="inline-flex items-center gap-1 text-xs">
        <Package className="h-3.5 w-3.5 text-muted-foreground" />{row.original.items}
      </span>
    ),
  },
  {
    accessorKey: "amount",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" />,
    cell: ({ row }) => <span className="text-sm font-bold">₹{row.original.amount.toLocaleString()}</span>,
  },
  {
    accessorKey: "date",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
    cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.date}</span>,
  },
  {
    accessorKey: "status",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    cell: ({ row }) => {
      const cfg = STATUS_CONFIG[row.original.status as keyof typeof STATUS_CONFIG];
      const Icon = cfg.icon;
      return (
        <Badge variant={cfg.variant as "success" | "warning" | "default" | "danger"} className="text-[10px] gap-1">
          <Icon className="h-3 w-3" />{cfg.label}
        </Badge>
      );
    },
  },
  {
    id: "actions",
    cell: ({ row }) => (
      <TableActionsRow
        showAction={{ action: () => console.log("view", row.original.id) }}
        editAction={{ action: () => console.log("edit", row.original.id) }}
        dropMoreActions={[
          { text: "Approve", function: () => console.log("approve", row.original.id) },
          { text: "Reject",  function: () => console.log("reject",  row.original.id) },
          { text: "Process Refund", function: () => console.log("refund", row.original.id) },
        ]}
      />
    ),
  },
];

const stats = [
  { label: "Total Returns",  value: DUMMY_RETURNS.length,                                                                                  color: "text-foreground" },
  { label: "Pending",        value: DUMMY_RETURNS.filter((r) => r.status === "pending").length,                                            color: "text-amber-500" },
  { label: "Approved",       value: DUMMY_RETURNS.filter((r) => r.status === "approved").length,                                           color: "text-emerald-500" },
  { label: "Total Refunded", value: `₹${DUMMY_RETURNS.filter((r) => r.status === "completed").reduce((s, r) => s + r.amount, 0).toLocaleString()}`, color: "text-blue-500" },
];

export default function ReturnsPage() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Returns & Refunds</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage product returns and process refunds</p>
        </div>
        <Button variant="gradient" className="gap-2">
          <Plus className="h-4 w-4" /> New Return
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <ClientSideTable
        data={DUMMY_RETURNS}
        columns={columns}
        pageCount={Math.ceil(DUMMY_RETURNS.length / 10)}
        searchableColumns={[
          { id: "customer", title: "Customer" },
          { id: "id",       title: "Return ID" },
          { id: "saleId",   title: "Invoice" },
        ]}
        filterableColumns={[
          {
            id: "status",
            title: "Status",
            options: [
              { label: "Pending",   value: "pending" },
              { label: "Approved",  value: "approved" },
              { label: "Completed", value: "completed" },
              { label: "Rejected",  value: "rejected" },
            ],
          },
        ]}
        isShowExportButtons={{ isShow: true, fileName: "returns-export" }}
      />
    </div>
  );
}
