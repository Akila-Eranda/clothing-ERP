"use client";

import { Loading, LoadingCenter, LoadingScreen } from "@/components/ui/loading";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Loader2, PackageCheck, Plus, RefreshCw, ShoppingBag, Zap,
} from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { PageKpiGrid } from "@/components/ui/page-kpi";
import { ClientSideTable, DataTableColumnHeader, OpenRecordButton } from "@/components/table";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useShopWorkspace } from "@/lib/use-shop-profile";
import { getRouteLabels } from "@/lib/shop-vertical";
import { AddGrnModal } from "@/components/purchases/add-grn-modal";
import { GrnDetailsModal } from "@/components/purchases/grn-details-modal";
import { GrnSourceBadge, GrnStatusBadge } from "@/components/purchases/purchase-table-badges";
import { parseApiList } from "@/lib/parse-api-list";

type GrnRow = {
  id: string;
  grnNumber: string;
  source: string;
  status?: string;
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
      setGrns(parseApiList<GrnRow>(grnR.data));
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
        accessorFn: (r) =>
          `${r.grnNumber} ${r.supplier?.name ?? ""} ${r.purchase?.poNumber ?? ""} ${r.source}`.trim(),
        header: ({ column }) => <DataTableColumnHeader column={column} title="GRN #" />,
        cell: ({ row }) => (
          <OpenRecordButton
            onClick={() => setViewId(row.original.id)}
            className="font-mono text-xs"
            title="View GRN"
          >
            {row.original.grnNumber}
          </OpenRecordButton>
        ),
      },
      {
        id: "source",
        accessorKey: "source",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Source" />,
        cell: ({ row }) => <GrnSourceBadge source={row.original.source} />,
      },
      {
        id: "status",
        accessorKey: "status",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => (
          <GrnStatusBadge status={row.original.status ?? "POSTED"} />
        ),
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
            className="h-8 px-3 text-xs"
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
    { label: "Total GRNs", value: grns.length, icon: PackageCheck, color: "text-emerald-600", bg: "bg-emerald-500/10", tint: "bg-card border-border" },
    { label: "Today", value: today, icon: Zap, color: "text-amber-600", bg: "bg-amber-500/10", tint: "bg-card border-border" },
    { label: "From PO", value: fromPo, icon: ShoppingBag, color: "text-blue-600", bg: "bg-primary/10", tint: "border-blue-200/70 bg-gradient-to-br from-blue-50 to-white dark:border-blue-500/20 dark:from-blue-500/10 dark:to-transparent" },
    { label: "Quick / Direct", value: quickOrDirect, icon: PackageCheck, color: "text-violet-600", bg: "bg-slate-500/10", tint: "border-violet-200/70 bg-gradient-to-br from-violet-50 to-white dark:border-violet-500/20 dark:from-violet-500/10 dark:to-transparent" },
  ];

  return (
    <div className="page-shell">
      {/* Header — compact single row */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="min-w-0">
          <h1 className="text-[26px] md:text-3xl font-bold tracking-tight leading-tight">
            {routeLabels["/purchases/grn"] ?? "GRN"}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {profile.emoji} {profile.label} — prefer Receive against PO; Quick GRN only if no PO
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={load}
              disabled={loading}
              className="gap-1.5"
            >
              <RefreshCw className={`h-[18px] w-[18px] ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button
              variant="outline"
              className="gap-1.5"
              onClick={() => setAddOpen(true)}
            >
              <Plus className="h-[18px] w-[18px]" /> Quick GRN (no PO)
            </Button>
          </div>
          <div className="hidden sm:block h-6 w-px bg-slate-200 dark:bg-white/10 mx-0.5" aria-hidden />
          <Button asChild className="gap-1.5">
            <Link href="/purchases">
              <ShoppingBag className="h-[18px] w-[18px]" /> Receive from PO
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats — compact 68px cards */}
      <PageKpiGrid items={STATS} />

      {/* Table — fills remaining viewport */}
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold leading-tight">GRN Documents</h2>
          <p className="text-xs text-muted-foreground">
            All goods receipts — from PO, quick GRN, or direct entry
          </p>
        </div>
        {loading ? (
          <LoadingCenter className="min-h-[200px] py-0 rounded-xl border border-border bg-card shadow-[0_2px_10px_rgba(15,23,42,0.04)]" />
        ) : (
          <ClientSideTable
            data={grns}
            columns={grnColumns}
            searchableColumns={[
              { id: "grnNumber", title: "GRN / supplier / PO" },
            ]}
            filterableColumns={[
              {
                id: "source",
                title: "Source",
                options: [
                  { value: "FROM_PO", label: "From PO" },
                  { value: "QUICK", label: "Quick" },
                  { value: "DIRECT", label: "Direct" },
                ],
              },
              {
                id: "status",
                title: "Status",
                options: [
                  { value: "POSTED", label: "Posted" },
                  { value: "DRAFT", label: "Draft" },
                  { value: "CANCELLED", label: "Cancelled" },
                ],
              },
            ]}
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