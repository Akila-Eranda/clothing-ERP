"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Loader2, PackageCheck, Plus, RefreshCw, ShoppingBag, Zap,
} from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ClientSideTable } from "@/components/table/client-side-table";
import { DataTableColumnHeader } from "@/components/table/data-table-column-header";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useShopWorkspace } from "@/lib/use-shop-profile";
import { getRouteLabels } from "@/lib/shop-vertical";
import { AddGrnModal } from "@/components/purchases/add-grn-modal";
import { GrnDetailsModal } from "@/components/purchases/grn-details-modal";

type GrnRow = {
  id: string;
  grnNumber: string;
  source: string;
  receivedAt: string;
  supplier: { name: string };
  purchase?: { poNumber: string; id?: string } | null;
  _count: { items: number };
};

export default function GrnPage() {
  const { profile, workspace } = useShopWorkspace();
  const routeLabels = getRouteLabels(workspace, profile);

  const [loading, setLoading] = useState(true);
  const [grns, setGrns] = useState<GrnRow[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const grnR = await api.get<{ data: GrnRow[] }>("/procurement/grn?limit=200");
      setGrns(grnR.data?.data ?? []);
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to load GRNs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const grnColumns = useMemo<ColumnDef<GrnRow>[]>(
    () => [
      {
        id: "grnNumber",
        accessorKey: "grnNumber",
        header: ({ column }) => <DataTableColumnHeader column={column} title="GRN #" />,
        cell: ({ row }) => (
          <button
            type="button"
            onClick={() => setViewId(row.original.id)}
            className="font-mono text-xs font-semibold text-emerald-700 hover:underline"
          >
            {row.original.grnNumber}
          </button>
        ),
      },
      {
        id: "source",
        accessorKey: "source",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Source" />,
        cell: ({ row }) => {
          const src = row.original.source;
          const label =
            src === "FROM_PO" ? "From PO"
              : src === "QUICK" ? "Quick"
                : src === "DIRECT" ? "Direct"
                  : src;
          return <Badge variant="outline" className="text-[10px]">{label}</Badge>;
        },
      },
      {
        id: "supplier",
        accessorFn: (r) => r.supplier?.name ?? "",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Supplier" />,
        cell: ({ row }) => (
          <span className="text-sm font-medium">{row.original.supplier?.name ?? "—"}</span>
        ),
      },
      {
        id: "po",
        accessorFn: (r) => r.purchase?.poNumber ?? "",
        header: ({ column }) => <DataTableColumnHeader column={column} title="PO" />,
        cell: ({ row }) =>
          row.original.purchase?.poNumber ? (
            <Link
              href={`/purchases/${row.original.purchase.id ?? ""}`}
              className="font-mono text-xs text-blue-500 hover:underline font-semibold"
            >
              {row.original.purchase.poNumber}
            </Link>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
      {
        id: "lines",
        accessorFn: (r) => r._count?.items ?? 0,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Lines" />,
        cell: ({ row }) => (
          <span className="text-sm">{row.original._count?.items ?? 0} items</span>
        ),
      },
      {
        id: "receivedAt",
        accessorKey: "receivedAt",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Received" />,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {new Date(row.original.receivedAt).toLocaleString("en-LK", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        ),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setViewId(row.original.id)}
          >
            View
          </Button>
        ),
      },
    ],
    [],
  );

  const fromPo = grns.filter((g) => g.source === "FROM_PO" || g.purchase?.poNumber).length;
  const quickOrDirect = grns.filter((g) => g.source === "QUICK" || g.source === "DIRECT" || !g.purchase?.poNumber).length;
  const today = grns.filter((g) => {
    const d = new Date(g.receivedAt);
    const n = new Date();
    return d.toDateString() === n.toDateString();
  }).length;

  const STATS = [
    { label: "Total GRNs", value: grns.length, icon: PackageCheck, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { label: "Today", value: today, icon: Zap, color: "text-amber-500", bg: "bg-amber-500/10" },
    { label: "From PO", value: fromPo, icon: ShoppingBag, color: "text-blue-500", bg: "bg-blue-500/10" },
    { label: "Quick / Direct", value: quickOrDirect, icon: PackageCheck, color: "text-violet-500", bg: "bg-violet-500/10" },
  ];

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header — same pattern as Purchase Orders */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">{routeLabels["/purchases/grn"] ?? "GRN"}</h1>
          <p className="text-sm text-muted-foreground">
            {profile.emoji} {profile.label} — prefer Receive against PO; Quick GRN only if no PO
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button size="sm" asChild className="gap-1.5">
            <Link href="/purchases">
              <ShoppingBag className="h-3.5 w-3.5" /> Receive from PO
            </Link>
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Quick GRN (no PO)
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {STATS.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${s.bg}`}>
                <s.icon className={`h-5 w-5 ${s.color}`} />
              </div>
              <div>
                <p className="text-xl font-bold leading-tight">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Workflow hint — PO first */}
      <div className="rounded-xl border bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200/60 dark:border-emerald-900 p-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 uppercase tracking-wide">Best practice</p>
          <div className="flex items-center gap-1.5 mt-1.5 text-xs font-medium text-muted-foreground flex-wrap">
            {["PO Ordered", "→ Receive Items", "→ GRN (FROM_PO)", "→ Stock Updated"].map((s) => (
              <span key={s} className="bg-background/80 px-2.5 py-1 rounded-full border text-foreground/80">{s}</span>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground max-w-sm">
          <span className="font-semibold text-foreground">Receive from PO</span> is the default.
          Use <span className="font-semibold text-foreground">Quick GRN (no PO)</span> only for walk-in cash purchases.
        </p>
      </div>

      {/* Table */}
      <div className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">GRN Documents</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            All goods receipts — from PO, quick GRN, or direct entry
          </p>
        </div>
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ClientSideTable
            data={grns}
            columns={grnColumns}
            pageCount={Math.ceil(grns.length / 10) || 1}
            searchableColumns={[
              { id: "grnNumber", title: "GRN #" },
              { id: "supplier", title: "Supplier" },
              { id: "source", title: "Source" },
              { id: "po", title: "PO" },
            ]}
            filterableColumns={[]}
            isShowExportButtons={{ isShow: true, fileName: "grn-documents" }}
          />
        )}
      </div>

      <AddGrnModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={load}
      />
      <GrnDetailsModal
        grnId={viewId}
        onClose={() => setViewId(null)}
      />
    </div>
  );
}
