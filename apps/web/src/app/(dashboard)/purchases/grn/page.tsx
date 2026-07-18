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
import { OpenRecordButton } from "@/components/table/open-record-button";
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
        cell: ({ row }) => {
          const src = row.original.source;
          const label =
            src === "FROM_PO" ? "From PO"
              : src === "QUICK" ? "Quick"
                : src === "DIRECT" ? "Direct"
                  : src;
          return (
            <Badge
              variant="outline"
              className="h-6 rounded-full px-2.5 text-[11px] font-semibold inline-flex items-center"
            >
              {label}
            </Badge>
          );
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
            variant="ghost"
            size="sm"
            className="h-8 rounded-[10px] px-3 text-xs font-semibold text-primary hover:bg-[hsl(var(--primary-soft))]"
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
    { label: "Total GRNs", value: grns.length, icon: PackageCheck, color: "text-emerald-600", bg: "bg-emerald-500/15", tint: "border-emerald-200/70 bg-gradient-to-br from-emerald-50 to-white dark:border-emerald-500/20 dark:from-emerald-500/10 dark:to-transparent" },
    { label: "Today", value: today, icon: Zap, color: "text-amber-600", bg: "bg-amber-500/15", tint: "border-amber-200/70 bg-gradient-to-br from-amber-50 to-white dark:border-amber-500/20 dark:from-amber-500/10 dark:to-transparent" },
    { label: "From PO", value: fromPo, icon: ShoppingBag, color: "text-blue-600", bg: "bg-blue-500/15", tint: "border-blue-200/70 bg-gradient-to-br from-blue-50 to-white dark:border-blue-500/20 dark:from-blue-500/10 dark:to-transparent" },
    { label: "Quick / Direct", value: quickOrDirect, icon: PackageCheck, color: "text-violet-600", bg: "bg-violet-500/15", tint: "border-violet-200/70 bg-gradient-to-br from-violet-50 to-white dark:border-violet-500/20 dark:from-violet-500/10 dark:to-transparent" },
  ];

  return (
    <div className="p-4 md:p-5 space-y-4 max-w-[1600px] mx-auto">
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
          <Button
            variant="outline"
            onClick={load}
            disabled={loading}
            className="h-10 rounded-[12px] gap-1.5 text-sm"
          >
            <RefreshCw className={`h-[18px] w-[18px] ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button
            variant="outline"
            className="h-10 rounded-[12px] gap-1.5 text-sm"
            onClick={() => setAddOpen(true)}
          >
            <Plus className="h-[18px] w-[18px]" /> Quick GRN (no PO)
          </Button>
          <Button asChild className="h-10 rounded-[12px] gap-1.5 text-sm">
            <Link href="/purchases">
              <ShoppingBag className="h-[18px] w-[18px]" /> Receive from PO
            </Link>
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
                <p className="text-[22px] font-bold leading-none tabular-nums">{s.value}</p>
                <p className="text-[11px] text-muted-foreground font-medium mt-1 truncate">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Table — fills remaining viewport */}
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold leading-tight">GRN Documents</h2>
          <p className="text-xs text-muted-foreground">
            All goods receipts — from PO, quick GRN, or direct entry
          </p>
        </div>
        {loading ? (
          <div
            className="flex items-center justify-center rounded-[18px] border border-border bg-card shadow-[0_2px_10px_rgba(15,23,42,0.04)]"
            style={{ height: "calc(100vh - 240px)" }}
          >
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="overflow-y-auto" style={{ height: "calc(100vh - 240px)" }}>
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
          </div>
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
