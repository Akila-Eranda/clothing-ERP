"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2, Clock, Loader2, Plus, RefreshCw, RotateCcw, Wallet,
} from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { TableStatusBadge } from "@/components/ui/table-status-badge";
import { PageKpiGrid } from "@/components/ui/page-kpi";
import { ClientSideTable, DataTableColumnHeader, OpenRecordButton } from "@/components/table";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { parseApiList } from "@/lib/parse-api-list";
import { AddPurchaseReturnModal } from "@/components/purchases/add-purchase-return-modal";
import { ViewPurchaseReturnModal } from "@/components/purchases/view-purchase-return-modal";

type ReturnRow = {
  id: string;
  returnNumber: string;
  status: string;
  reason?: string | null;
  createdAt: string;
  postedAt?: string | null;
  supplier: { name: string };
  _count: { items: number };
};

export default function PurchaseReturnsPage() {
  const [returns, setReturns] = useState<ReturnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);
  const [postingId, setPostingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: ReturnRow[] }>("/procurement/supplier-returns?limit=200");
      setReturns(parseApiList<ReturnRow>(res.data));
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to load purchase returns");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const postReturn = async (id: string) => {
    setPostingId(id);
    try {
      await api.post(`/procurement/supplier-returns/${id}/post`, {});
      toast.success("Return posted — stock deducted & supplier credited");
      load();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Post failed");
    } finally {
      setPostingId(null);
    }
  };

  const draftCount = returns.filter((r) => r.status === "DRAFT").length;
  const postedCount = returns.filter((r) => r.status === "POSTED").length;

  const STATS = [
    {
      label: "Total Returns",
      value: returns.length,
      icon: RotateCcw,
      color: "text-blue-600",
      bg: "bg-primary/10",
      tint: "bg-card border-border",
    },
    {
      label: "Draft",
      value: draftCount,
      icon: Clock,
      color: "text-amber-600",
      bg: "bg-amber-500/10",
      tint: "bg-card border-border",
    },
    {
      label: "Posted",
      value: postedCount,
      icon: CheckCircle2,
      color: "text-emerald-600",
      bg: "bg-emerald-500/10",
      tint: "bg-card border-border",
    },
    {
      label: "This Month",
      value: returns.filter((r) => {
        const d = new Date(r.createdAt);
        const n = new Date();
        return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
      }).length,
      icon: Wallet,
      color: "text-violet-600",
      bg: "bg-slate-500/10",
      tint: "bg-card border-border",
    },
  ];

  const columns = useMemo<ColumnDef<ReturnRow>[]>(() => [
    {
      id: "returnNumber",
      accessorFn: (r) => `${r.returnNumber} ${r.supplier?.name ?? ""} ${r.reason ?? ""}`.trim(),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Return #" />,
      cell: ({ row }) => (
        <OpenRecordButton onClick={() => setViewId(row.original.id)} className="font-mono text-sm">
          {row.original.returnNumber}
        </OpenRecordButton>
      ),
    },
    {
      id: "supplier",
      accessorFn: (r) => r.supplier?.name ?? "",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Supplier" />,
      cell: ({ row }) => <span className="text-sm font-medium">{row.original.supplier?.name ?? "—"}</span>,
    },
    {
      id: "reason",
      accessorKey: "reason",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Reason" />,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground truncate max-w-[180px] block">
          {row.original.reason ?? "—"}
        </span>
      ),
    },
    {
      id: "lines",
      accessorFn: (r) => r._count?.items ?? 0,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Lines" />,
      cell: ({ row }) => <span className="text-sm">{row.original._count?.items ?? 0}</span>,
    },
    {
      id: "createdAt",
      accessorKey: "createdAt",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Created" />,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {new Date(row.original.createdAt).toLocaleDateString("en-LK", {
            day: "2-digit", month: "short", year: "numeric",
          })}
        </span>
      ),
    },
    {
      id: "status",
      accessorKey: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => <TableStatusBadge status={row.original.status} />,
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => {
        if (row.original.status !== "DRAFT") {
          return (
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setViewId(row.original.id)}>
              View
            </Button>
          );
        }
        const busy = postingId === row.original.id;
        return (
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              disabled={busy}
              onClick={() => postReturn(row.original.id)}
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Post"}
            </Button>
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setViewId(row.original.id)}>
              View
            </Button>
          </div>
        );
      },
    },
  ], [postingId]);

  return (
    <div className="page-shell space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[26px] md:text-3xl font-bold tracking-tight leading-tight">Purchase Returns</h1>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            Return goods to suppliers — draft then post to deduct stock and credit AP
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" onClick={() => void load()} className="gap-1.5">
            <RefreshCw className={`h-[18px] w-[18px] ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button className="gap-1.5" onClick={() => setAddOpen(true)}>
            <Plus className="h-[18px] w-[18px]" /> New Return
          </Button>
        </div>
      </div>

      <PageKpiGrid items={STATS} />

      <div className="rounded-xl border border-amber-200/70 bg-amber-50/50 px-4 py-3 text-xs text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
        <strong>Draft → Post:</strong> Save a return as draft, review items, then post to remove stock from inventory and apply supplier credit against linked PO or invoice.
      </div>

      <ClientSideTable
        data={returns}
        columns={columns}
        searchableColumns={[{ id: "returnNumber", title: "Return / supplier / reason" }]}
        filterableColumns={[
          {
            id: "status",
            title: "Status",
            options: [
              { value: "DRAFT", label: "Draft" },
              { value: "POSTED", label: "Posted" },
              { value: "CANCELLED", label: "Cancelled" },
            ],
          },
        ]}
        isShowExportButtons={{ isShow: true, fileName: "purchase-returns" }}
      />

      <AddPurchaseReturnModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={load}
      />

      <ViewPurchaseReturnModal
        returnId={viewId}
        onClose={() => setViewId(null)}
        onPosted={load}
      />
    </div>
  );
}
