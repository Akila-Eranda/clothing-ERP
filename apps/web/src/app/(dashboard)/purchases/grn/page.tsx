"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Loader2, PackageCheck, RefreshCw, ShoppingBag, Zap,
} from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ClientSideTable } from "@/components/table/client-side-table";
import { DataTableColumnHeader } from "@/components/table/data-table-column-header";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useShopWorkspace } from "@/lib/use-shop-profile";

type GrnRow = {
  id: string;
  grnNumber: string;
  source: string;
  receivedAt: string;
  supplier: { name: string };
  purchase?: { poNumber: string; id?: string } | null;
  _count: { items: number };
};

type Supplier = { id: string; name: string };
type VariantOpt = { id: string; sku: string; name: string; costPrice: number; product: { name: string } };

export default function GrnPage() {
  const { profile } = useShopWorkspace();
  const [loading, setLoading] = useState(true);
  const [grns, setGrns] = useState<GrnRow[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const [qgSupplier, setQgSupplier] = useState("");
  const [qgSku, setQgSku] = useState("");
  const [qgQty, setQgQty] = useState("1");
  const [qgCost, setQgCost] = useState("");
  const [qgVariant, setQgVariant] = useState<VariantOpt | null>(null);
  const [qgBusy, setQgBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [grnR, supR] = await Promise.all([
        api.get<{ data: GrnRow[] }>("/procurement/grn?limit=100"),
        api.get<{ data: Supplier[] }>("/suppliers?limit=100"),
      ]);
      setGrns(grnR.data?.data ?? []);
      setSuppliers(supR.data?.data ?? []);
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to load GRN data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const lookupSku = async () => {
    if (!qgSku.trim()) return;
    try {
      const barcode = await api.get<{
        id: string;
        sku: string;
        name: string;
        costPrice?: number;
        productName?: string;
        product?: { name: string };
      }>(`/pos/barcode/${encodeURIComponent(qgSku.trim())}`);
      const v = barcode.data;
      if (!v?.id) {
        toast.error("SKU / barcode not found");
        setQgVariant(null);
        return;
      }
      const found: VariantOpt = {
        id: v.id,
        sku: v.sku,
        name: v.name,
        costPrice: v.costPrice ?? 0,
        product: { name: v.productName ?? v.product?.name ?? "Product" },
      };
      setQgVariant(found);
      setQgCost(String(found.costPrice || 0));
      toast.success(`${found.product.name} — ${found.name}`);
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Lookup failed");
    }
  };

  const submitQuickGrn = async () => {
    if (!qgSupplier) {
      toast.error("Select supplier");
      return;
    }
    if (!qgVariant) {
      toast.error("Lookup a product first");
      return;
    }
    const qty = parseInt(qgQty, 10);
    const cost = parseFloat(qgCost);
    if (!qty || qty < 1 || isNaN(cost)) {
      toast.error("Enter valid qty and cost");
      return;
    }
    setQgBusy(true);
    try {
      const res = await api.post<{ grnNumber: string }>("/procurement/grn/quick", {
        supplierId: qgSupplier,
        lines: [{ variantId: qgVariant.id, quantity: qty, unitCost: cost }],
      });
      toast.success(`Quick GRN posted: ${res.data?.grnNumber ?? "OK"}`);
      setQgSku("");
      setQgVariant(null);
      setQgQty("1");
      setQgCost("");
      load();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Quick GRN failed");
    } finally {
      setQgBusy(false);
    }
  };

  const grnColumns = useMemo<ColumnDef<GrnRow>[]>(
    () => [
      {
        id: "grnNumber",
        accessorKey: "grnNumber",
        header: ({ column }) => <DataTableColumnHeader column={column} title="GRN #" />,
        cell: ({ row }) => <span className="font-mono text-xs font-medium">{row.original.grnNumber}</span>,
      },
      {
        id: "source",
        accessorKey: "source",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Source" />,
        cell: ({ row }) => <Badge variant="outline" className="text-[10px]">{row.original.source}</Badge>,
      },
      {
        id: "supplier",
        accessorFn: (r) => r.supplier?.name ?? "",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Supplier" />,
        cell: ({ row }) => <span className="text-sm">{row.original.supplier?.name ?? "—"}</span>,
      },
      {
        id: "po",
        accessorFn: (r) => r.purchase?.poNumber ?? "",
        header: ({ column }) => <DataTableColumnHeader column={column} title="PO" />,
        cell: ({ row }) =>
          row.original.purchase?.poNumber ? (
            <Link
              href={`/purchases/${row.original.purchase.id ?? ""}`}
              className="font-mono text-xs text-indigo-600 hover:underline"
            >
              {row.original.purchase.poNumber}
            </Link>
          ) : (
            <span className="font-mono text-xs text-muted-foreground">—</span>
          ),
      },
      {
        id: "lines",
        accessorFn: (r) => r._count?.items ?? 0,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Lines" />,
        cell: ({ row }) => <span className="text-sm">{row.original._count?.items ?? 0}</span>,
      },
      {
        id: "receivedAt",
        accessorKey: "receivedAt",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Received" />,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {new Date(row.original.receivedAt).toLocaleString("en-LK")}
          </span>
        ),
      },
    ],
    [],
  );

  const fromPo = grns.filter((g) => g.purchase?.poNumber).length;
  const quickOrDirect = grns.filter((g) => !g.purchase?.poNumber).length;
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
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">GRN</h1>
          <p className="text-sm text-muted-foreground">
            {profile.label} · Receive stock against PO or post a quick goods receipt
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button variant="outline" size="sm" asChild className="gap-1.5">
            <Link href="/purchases">
              <ShoppingBag className="h-3.5 w-3.5" /> Purchase Orders
            </Link>
          </Button>
        </div>
      </div>

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

      <div className="grid lg:grid-cols-[minmax(280px,360px)_1fr] gap-4 items-start">
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-amber-500/10">
                <Zap className="h-4 w-4 text-amber-500" />
              </div>
              <div>
                <h2 className="font-semibold text-sm">Quick GRN</h2>
                <p className="text-xs text-muted-foreground">Walk-in stock without a PO</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Supplier</label>
              <select
                className="w-full h-9 rounded-md border bg-background px-3 text-sm"
                value={qgSupplier}
                onChange={(e) => setQgSupplier(e.target.value)}
              >
                <option value="">Select supplier…</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Scan / enter SKU or barcode"
                value={qgSku}
                onChange={(e) => setQgSku(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && lookupSku()}
                className="h-9"
              />
              <Button variant="outline" onClick={lookupSku} className="shrink-0">Lookup</Button>
            </div>
            {qgVariant && (
              <p className="text-xs text-emerald-600 font-medium">
                {qgVariant.product.name} — {qgVariant.name} ({qgVariant.sku})
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Qty</label>
                <Input type="number" min={1} value={qgQty} onChange={(e) => setQgQty(e.target.value)} className="h-9" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Unit Cost</label>
                <Input type="number" min={0} value={qgCost} onChange={(e) => setQgCost(e.target.value)} className="h-9" />
              </div>
            </div>
            <Button onClick={submitQuickGrn} disabled={qgBusy} className="gap-1.5 w-full">
              {qgBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PackageCheck className="h-3.5 w-3.5" />}
              Post Quick GRN
            </Button>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              PO receive කරන්න නම්{" "}
              <Link href="/purchases" className="text-indigo-600 hover:underline font-medium">
                Purchase Orders
              </Link>{" "}
              page එකේ ordered PO එකක් open කර Receive Items use කරන්න.
            </p>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold">GRN Documents</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              All goods receipts — from PO receive, quick GRN, or direct entry
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
      </div>
    </div>
  );
}
