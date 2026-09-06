"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus, Shirt, Package, Loader2, Search, X, CheckCircle2,
} from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader, PageKpiGrid, pageKpi } from "@/components/ui/page-kpi";
import { ClientSideTable, DataTableColumnHeader } from "@/components/table";
import { ModuleGate } from "@/components/shop/module-gate";
import { useBranchContext } from "@/components/branch/branch-provider";
import { useBranchStore } from "@/stores/branch-store";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { parseApiList } from "@/lib/parse-api-list";
import { formatNumber } from "@/lib/utils";
import { modalInlineFooterClass } from "@/components/ui/modal-footer";

type BundleComponent = {
  variantId: string;
  quantity: number;
  componentVariant?: {
    id: string;
    sku?: string;
    size?: string | null;
    color?: string | null;
    product?: { name?: string };
  };
};

type BundleRow = {
  id: string;
  name: string;
  sku?: string | null;
  sellingPrice?: number;
  description?: string | null;
  bundleComponents?: BundleComponent[];
  _count?: { bundleComponents?: number };
};

type CompDraft = { variantId: string; quantity: number; label: string; sku?: string };

export default function OutfitsPage() {
  const { branches } = useBranchContext();
  const activeBranchId = useBranchStore((s) => s.activeBranchId);
  const setBranch = useBranchStore((s) => s.setBranch);
  const branchId = activeBranchId ?? branches[0]?.id ?? "";

  const [rows, setRows] = useState<BundleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [components, setComponents] = useState<CompDraft[]>([]);
  const [searchQ, setSearchQ] = useState("");
  const [hits, setHits] = useState<{ id: string; label: string; sku: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [availability, setAvailability] = useState<Record<string, number | null>>({});

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<BundleRow[]>("/clothing/bundles");
      setRows(parseApiList(res.data));
    } catch {
      toast.error("Failed to load outfits");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchList(); }, [fetchList]);

  useEffect(() => {
    if (!branchId || rows.length === 0) {
      setAvailability({});
      return;
    }
    let cancelled = false;
    (async () => {
      const next: Record<string, number | null> = {};
      await Promise.all(
        rows.slice(0, 40).map(async (b) => {
          try {
            const res = await api.get<{ availableQty?: number; quantity?: number }>(
              `/clothing/bundles/${b.id}/availability?branchId=${encodeURIComponent(branchId)}`,
            );
            next[b.id] = res.data?.availableQty ?? res.data?.quantity ?? 0;
          } catch {
            next[b.id] = null;
          }
        }),
      );
      if (!cancelled) setAvailability(next);
    })();
    return () => { cancelled = true; };
  }, [branchId, rows]);

  const openCreate = () => {
    setName("");
    setSku("");
    setSellingPrice("");
    setComponents([]);
    setHits([]);
    setSearchQ("");
    setModalOpen(true);
  };

  const searchComponents = async () => {
    if (!searchQ.trim()) return;
    setSearching(true);
    try {
      try {
        const res = await api.get<{ id: string; sku: string; product?: { name: string }; size?: string; color?: string }>(
          `/pos/barcode/${encodeURIComponent(searchQ.trim())}`,
        );
        if (res.data?.id) {
          const v = res.data;
          setHits([{
            id: v.id,
            sku: v.sku,
            label: `${v.product?.name ?? "Variant"} · ${[v.size, v.color].filter(Boolean).join(" / ") || v.sku}`,
          }]);
          return;
        }
      } catch { /* fall through */ }

      const pRes = await api.get(`/products?search=${encodeURIComponent(searchQ.trim())}&limit=8`);
      const products = parseApiList<{ id: string; name: string; variants?: { id: string; sku: string; size?: string; color?: string }[] }>(pRes.data);
      const list: { id: string; label: string; sku: string }[] = [];
      for (const p of products) {
        for (const v of p.variants ?? []) {
          list.push({
            id: v.id,
            sku: v.sku,
            label: `${p.name} · ${[v.size, v.color].filter(Boolean).join(" / ") || v.sku}`,
          });
        }
      }
      setHits(list.slice(0, 24));
      if (!list.length) toast.error("No variants found");
    } catch {
      toast.error("Search failed");
    } finally {
      setSearching(false);
    }
  };

  const addComponent = (hit: { id: string; label: string; sku: string }) => {
    if (components.some((c) => c.variantId === hit.id)) {
      toast.message("Already added");
      return;
    }
    setComponents((p) => [...p, { variantId: hit.id, quantity: 1, label: hit.label, sku: hit.sku }]);
  };

  const save = async () => {
    if (!name.trim()) { toast.error("Name required"); return; }
    if (components.length === 0) { toast.error("Add at least one component"); return; }
    setSaving(true);
    try {
      await api.post("/clothing/bundles", {
        name: name.trim(),
        sku: sku.trim() || undefined,
        sellingPrice: sellingPrice ? Number(sellingPrice) : undefined,
        components: components.map((c) => ({ variantId: c.variantId, quantity: c.quantity })),
      });
      toast.success("Outfit created");
      setModalOpen(false);
      await fetchList();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Create failed");
    } finally {
      setSaving(false);
    }
  };

  const columns = useMemo<ColumnDef<BundleRow>[]>(
    () => [
      {
        id: "name",
        accessorFn: (b) => `${b.name} ${b.sku ?? ""}`.trim(),
        header: ({ column }) => <DataTableColumnHeader column={column} title="Outfit" />,
        cell: ({ row }) => {
          const b = row.original;
          return (
            <div>
              <p className="text-sm font-semibold">{b.name}</p>
              {b.sku ? <p className="text-[10px] font-mono text-muted-foreground">{b.sku}</p> : null}
            </div>
          );
        },
      },
      {
        id: "components",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Pieces" />,
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1.5 text-sm">
            <Package className="h-3.5 w-3.5 text-muted-foreground" />
            {row.original._count?.bundleComponents ?? row.original.bundleComponents?.length ?? 0}
          </span>
        ),
      },
      {
        accessorKey: "sellingPrice",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Price" />,
        cell: ({ row }) => (
          <span className="tabular-nums text-sm">
            {row.original.sellingPrice != null ? `LKR ${formatNumber(row.original.sellingPrice)}` : "—"}
          </span>
        ),
      },
      {
        id: "availability",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Avail." />,
        cell: ({ row }) => {
          if (!branchId) return <span className="text-xs text-muted-foreground">—</span>;
          const v = availability[row.original.id];
          if (v === undefined) return <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />;
          if (v === null) return <span className="text-xs text-muted-foreground">n/a</span>;
          return (
            <span className={`text-sm font-medium tabular-nums ${v > 0 ? "text-emerald-600" : "text-red-500"}`}>
              {v}
            </span>
          );
        },
      },
    ],
    [availability, branchId],
  );

  const kpis = [
    pageKpi("Outfits", rows.length, Shirt, "slate"),
    pageKpi("With stock", Object.values(availability).filter((v) => (v ?? 0) > 0).length, CheckCircle2, "emerald"),
    pageKpi("Pieces avg", rows.length ? Math.round(rows.reduce((s, r) => s + (r._count?.bundleComponents ?? r.bundleComponents?.length ?? 0), 0) / rows.length) : 0, Package, "blue"),
  ];

  return (
    <ModuleGate module="outfits">
      <div className="page-shell space-y-4">
        <PageHeader
          title="Outfits"
          description="Bundled look sets sold as one SKU"
          onRefresh={() => void fetchList()}
          refreshing={loading}
          actions={
            <div className="flex items-center gap-2">
              <Select
                value={branchId || undefined}
                onValueChange={(id) => {
                  const b = branches.find((x) => x.id === id);
                  setBranch(id, b?.name ?? null);
                }}
              >
                <SelectTrigger className="w-[180px] h-9">
                  <SelectValue placeholder="Branch (avail.)" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button className="gap-1.5" onClick={openCreate}>
                <Plus className="h-4 w-4" /> New outfit
              </Button>
            </div>
          }
        />

        <PageKpiGrid items={kpis} loading={loading} />

        <ClientSideTable
          data={rows}
          columns={columns}
          searchableColumns={[{ id: "name", title: "Name / SKU" }]}
        />

        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Create outfit</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5 col-span-2">
                  <Label>Name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Weekend Casual Set" />
                </div>
                <div className="space-y-1.5">
                  <Label>SKU</Label>
                  <Input value={sku} onChange={(e) => setSku(e.target.value)} className="font-mono" />
                </div>
                <div className="space-y-1.5">
                  <Label>Selling price</Label>
                  <Input type="number" min={0} value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Component variants</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Scan / search product…"
                    value={searchQ}
                    onChange={(e) => setSearchQ(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") void searchComponents(); }}
                  />
                  <Button variant="outline" onClick={() => void searchComponents()} disabled={searching} className="gap-1.5 shrink-0">
                    {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    Find
                  </Button>
                </div>
                {hits.length > 0 && (
                  <div className="rounded-lg border divide-y max-h-32 overflow-y-auto">
                    {hits.map((h) => (
                      <button key={h.id} type="button" className="w-full text-left px-3 py-2 text-xs hover:bg-muted/40" onClick={() => addComponent(h)}>
                        {h.label}
                        <span className="block font-mono text-muted-foreground">{h.sku}</span>
                      </button>
                    ))}
                  </div>
                )}
                {components.length > 0 && (
                  <div className="rounded-lg border divide-y">
                    {components.map((c, idx) => (
                      <div key={c.variantId} className="flex items-center gap-2 px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{c.label}</p>
                          <p className="text-[10px] font-mono text-muted-foreground">{c.sku}</p>
                        </div>
                        <Input
                          type="number"
                          min={0.001}
                          step={1}
                          className="w-16 h-7 text-xs"
                          value={c.quantity}
                          onChange={(e) => setComponents((p) => p.map((x, i) => i === idx ? { ...x, quantity: Number(e.target.value) || 1 } : x))}
                        />
                        <button type="button" onClick={() => setComponents((p) => p.filter((_, i) => i !== idx))} className="p-1 text-muted-foreground hover:text-red-500">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className={modalInlineFooterClass}>
                <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
                <Button onClick={() => void save()} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </ModuleGate>
  );
}
