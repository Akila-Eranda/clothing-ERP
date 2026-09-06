"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Plus, RefreshCw, Layers, CheckCircle2, Ban, Package, Archive,
  TrendingUp, Search, X, Loader2,
} from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TableStatusBadge } from "@/components/ui/table-status-badge";
import { PageHeader, PageKpiGrid } from "@/components/ui/page-kpi";
import { ClientSideTable, DataTableColumnHeader, TableActionsRow, OpenRecordButton } from "@/components/table";
import { ModuleGate } from "@/components/shop/module-gate";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { parseApiList } from "@/lib/parse-api-list";
import { formatNumber } from "@/lib/utils";
import { CLOTHING_SEASONS } from "@/lib/clothing-fashion";
import { modalInlineFooterClass } from "@/components/ui/modal-footer";

type CollectionProduct = {
  productId: string;
  product?: { id: string; name: string; sellingPrice?: number; images?: string[] };
};

type CollectionRow = {
  id: string;
  name: string;
  code?: string | null;
  season?: string | null;
  year?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
  description?: string | null;
  isActive: boolean;
  products?: CollectionProduct[];
  _count?: { products: number };
};

type Performance = {
  collectionId: string;
  name?: string;
  unitsSold: number;
  revenue: number;
  remainingStock: number;
  sellThroughPct: number;
  productCount?: number;
};

type CollectionForm = {
  name: string;
  code: string;
  season: string;
  year: string;
  startsAt: string;
  endsAt: string;
  description: string;
  isActive: boolean;
};

const EMPTY_FORM: CollectionForm = {
  name: "",
  code: "",
  season: "",
  year: String(new Date().getFullYear()),
  startsAt: "",
  endsAt: "",
  description: "",
  isActive: true,
};

function toDateInput(v?: string | null) {
  if (!v) return "";
  return v.slice(0, 10);
}

function buildColumns(
  onEdit: (c: CollectionRow) => void,
  onView: (c: CollectionRow) => void,
  onArchive: (c: CollectionRow) => void,
): ColumnDef<CollectionRow>[] {
  return [
    {
      id: "name",
      accessorFn: (c) => `${c.name} ${c.code ?? ""}`.trim(),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Collection" />,
      cell: ({ row }) => {
        const c = row.original;
        return (
          <div>
            <OpenRecordButton onClick={() => onView(c)} className="text-sm" title="View collection">
              {c.name}
            </OpenRecordButton>
            {c.code ? <p className="text-[10px] text-muted-foreground font-mono">{c.code}</p> : null}
          </div>
        );
      },
    },
    {
      accessorKey: "season",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Season" />,
      cell: ({ row }) => (
        <span className="text-sm">{row.original.season ?? "—"}</span>
      ),
    },
    {
      accessorKey: "year",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Year" />,
      cell: ({ row }) => (
        <span className="text-sm tabular-nums">{row.original.year ?? "—"}</span>
      ),
    },
    {
      id: "window",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Window" />,
      cell: ({ row }) => {
        const c = row.original;
        if (!c.startsAt && !c.endsAt) return <span className="text-muted-foreground text-xs">—</span>;
        return (
          <span className="text-xs text-muted-foreground tabular-nums">
            {toDateInput(c.startsAt) || "…"} → {toDateInput(c.endsAt) || "…"}
          </span>
        );
      },
    },
    {
      id: "products",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Products" />,
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1.5 text-sm font-medium">
          <Package className="h-3.5 w-3.5 text-muted-foreground" />
          {row.original._count?.products ?? row.original.products?.length ?? 0}
        </span>
      ),
    },
    {
      accessorKey: "isActive",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => (
        <TableStatusBadge status={row.original.isActive ? "ACTIVE" : "INACTIVE"} />
      ),
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <TableActionsRow
          editAction={{ action: () => onEdit(row.original) }}
          deleteAction={
            row.original.isActive
              ? { action: () => onArchive(row.original) }
              : undefined
          }
        />
      ),
    },
  ];
}

export default function CollectionsPage() {
  const [rows, setRows] = useState<CollectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<CollectionRow | null>(null);
  const [detail, setDetail] = useState<CollectionRow | null>(null);
  const [perf, setPerf] = useState<Performance | null>(null);
  const [perfLoading, setPerfLoading] = useState(false);
  const [form, setForm] = useState<CollectionForm>({ ...EMPTY_FORM });
  const [productQuery, setProductQuery] = useState("");
  const [productHits, setProductHits] = useState<{ id: string; name: string }[]>([]);
  const [searchingProducts, setSearchingProducts] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<CollectionRow[]>("/collections");
      setRows(parseApiList(res.data));
    } catch {
      toast.error("Failed to load collections");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setModalOpen(true);
  };

  const openEdit = (c: CollectionRow) => {
    setEditing(c);
    setForm({
      name: c.name,
      code: c.code ?? "",
      season: c.season ?? "",
      year: c.year != null ? String(c.year) : String(new Date().getFullYear()),
      startsAt: toDateInput(c.startsAt),
      endsAt: toDateInput(c.endsAt),
      description: c.description ?? "",
      isActive: c.isActive,
    });
    setModalOpen(true);
  };

  const openDetail = async (c: CollectionRow) => {
    setDetailOpen(true);
    setPerf(null);
    setProductQuery("");
    setProductHits([]);
    try {
      const res = await api.get<CollectionRow>(`/collections/${c.id}`);
      setDetail(res.data);
    } catch {
      setDetail(c);
      toast.error("Failed to load collection detail");
    }
    setPerfLoading(true);
    try {
      const res = await api.get<Performance>(`/collections/${c.id}/performance`);
      setPerf(res.data);
    } catch {
      setPerf(null);
    } finally {
      setPerfLoading(false);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        code: form.code.trim() || undefined,
        season: form.season || undefined,
        year: form.year ? Number(form.year) : undefined,
        startsAt: form.startsAt || undefined,
        endsAt: form.endsAt || undefined,
        description: form.description.trim() || undefined,
        isActive: form.isActive,
      };
      if (editing) {
        await api.put(`/collections/${editing.id}`, payload);
        toast.success("Collection updated");
      } else {
        await api.post("/collections", payload);
        toast.success("Collection created");
      }
      setModalOpen(false);
      void fetchList();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (c: CollectionRow) => {
    if (!window.confirm(`Archive "${c.name}"? It will be marked inactive.`)) return;
    try {
      await api.put(`/collections/${c.id}`, { isActive: false });
      toast.success("Collection archived");
      void fetchList();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Archive failed");
    }
  };

  const searchProducts = async (q: string) => {
    setProductQuery(q);
    if (q.trim().length < 2) {
      setProductHits([]);
      return;
    }
    setSearchingProducts(true);
    try {
      const res = await api.get<{ data?: { id: string; name: string }[] } | { id: string; name: string }[]>(
        `/products?limit=25&search=${encodeURIComponent(q.trim())}`,
      );
      setProductHits(parseApiList(res.data));
    } catch {
      setProductHits([]);
    } finally {
      setSearchingProducts(false);
    }
  };

  const assignProduct = async (productId: string) => {
    if (!detail) return;
    setAssigning(true);
    try {
      const res = await api.post<CollectionRow>(`/collections/${detail.id}/products`, {
        productIds: [productId],
      });
      setDetail(res.data);
      toast.success("Product assigned");
      void fetchList();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Assign failed");
    } finally {
      setAssigning(false);
    }
  };

  const removeProduct = async (productId: string) => {
    if (!detail) return;
    try {
      await api.delete(`/collections/${detail.id}/products/${productId}`);
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              products: (prev.products ?? []).filter((p) => p.productId !== productId),
              _count: {
                products: Math.max(0, (prev._count?.products ?? prev.products?.length ?? 1) - 1),
              },
            }
          : prev,
      );
      toast.success("Product removed");
      void fetchList();
      const res = await api.get<Performance>(`/collections/${detail.id}/performance`);
      setPerf(res.data);
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Remove failed");
    }
  };

  const activeCount = rows.filter((r) => r.isActive).length;
  const productTotal = rows.reduce((s, r) => s + (r._count?.products ?? r.products?.length ?? 0), 0);

  const columns = useMemo(
    () => buildColumns(openEdit, (c) => void openDetail(c), (c) => void handleArchive(c)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const STATS = [
    {
      label: "Collections",
      value: rows.length,
      icon: Layers,
      color: "text-slate-600 dark:text-slate-300",
      bg: "bg-slate-500/15",
      tint: "bg-card border-border",
    },
    {
      label: "Active",
      value: activeCount,
      icon: CheckCircle2,
      color: "text-emerald-600",
      bg: "bg-emerald-500/10",
      tint: "bg-card border-border",
    },
    {
      label: "Archived",
      value: rows.length - activeCount,
      icon: Ban,
      color: "text-muted-foreground",
      bg: "bg-muted",
      tint: "bg-card border-border",
    },
    {
      label: "Products linked",
      value: productTotal,
      icon: Package,
      color: "text-blue-600",
      bg: "bg-primary/10",
      tint: "bg-card border-border",
    },
  ];

  const assignedIds = new Set((detail?.products ?? []).map((p) => p.productId));

  return (
    <ModuleGate module="collections">
      <div className="page-shell space-y-4">
        <PageHeader
          title="Collections"
          description="Seasonal ranges and fashion collections — assign products and track sell-through"
          onRefresh={() => void fetchList()}
          refreshing={loading}
          actions={
            <Button className="gap-1.5" onClick={openCreate}>
              <Plus className="h-[18px] w-[18px]" />
              New collection
            </Button>
          }
        />

        <PageKpiGrid items={STATS} loading={loading} />

        <ClientSideTable
          data={rows}
          columns={columns}
          searchableColumns={[{ id: "name", title: "Name / code" }]}
          filterableColumns={[
            {
              id: "isActive",
              title: "Status",
              options: [
                { label: "Active", value: "true" },
                { label: "Inactive", value: "false" },
              ],
            },
          ]}
          isShowExportButtons={{ isShow: true, fileName: "collections" }}
        />

        {/* Create / Edit */}
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? "Edit collection" : "New collection"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-1">
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <Label className="text-xs mb-1.5 block">Name *</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Summer Essentials 2026"
                  />
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">Code</Label>
                  <Input
                    value={form.code}
                    onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                    placeholder="SUM26"
                    className="font-mono"
                  />
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">Year</Label>
                  <Input
                    type="number"
                    value={form.year}
                    onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))}
                  />
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">Season</Label>
                  <Select
                    value={form.season || "_none"}
                    onValueChange={(v) => setForm((f) => ({ ...f, season: v === "_none" ? "" : v }))}
                  >
                    <SelectTrigger><SelectValue placeholder="Select season" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">No season</SelectItem>
                      {CLOTHING_SEASONS.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                  <Label className="text-xs">Active</Label>
                  <Switch
                    checked={form.isActive}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
                  />
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">Starts</Label>
                  <Input
                    type="date"
                    value={form.startsAt}
                    onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
                  />
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">Ends</Label>
                  <Input
                    type="date"
                    value={form.endsAt}
                    onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs mb-1.5 block">Description</Label>
                  <Textarea
                    rows={2}
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    className="resize-none"
                  />
                </div>
              </div>
            </div>
            <div className={modalInlineFooterClass}>
              <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button onClick={() => void handleSave()} disabled={saving} className="gap-1.5">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {editing ? "Update" : "Create"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Detail / assign / performance */}
        <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {detail?.name ?? "Collection"}
                {detail && !detail.isActive ? (
                  <span className="text-xs font-normal text-muted-foreground">(archived)</span>
                ) : null}
              </DialogTitle>
            </DialogHeader>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { label: "Units sold", value: perfLoading ? "…" : formatNumber(perf?.unitsSold ?? 0), icon: TrendingUp },
                { label: "Revenue", value: perfLoading ? "…" : `LKR ${formatNumber(perf?.revenue ?? 0)}`, icon: TrendingUp },
                { label: "Stock left", value: perfLoading ? "…" : formatNumber(perf?.remainingStock ?? 0), icon: Package },
                { label: "Sell-through", value: perfLoading ? "…" : `${perf?.sellThroughPct ?? 0}%`, icon: Archive },
              ].map((k) => (
                <div key={k.label} className="rounded-xl border border-border bg-card p-3">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{k.label}</p>
                  <p className="text-sm font-bold mt-0.5 tabular-nums">{k.value}</p>
                </div>
              ))}
            </div>

            <div className="space-y-2 pt-2">
              <Label className="text-xs font-semibold">Assign products</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Search products…"
                  value={productQuery}
                  onChange={(e) => void searchProducts(e.target.value)}
                />
              </div>
              {searchingProducts ? (
                <p className="text-xs text-muted-foreground">Searching…</p>
              ) : productHits.length > 0 ? (
                <ul className="rounded-lg border border-border divide-y max-h-36 overflow-auto">
                  {productHits.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span className="truncate">{p.name}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs shrink-0"
                        disabled={assignedIds.has(p.id) || assigning}
                        onClick={() => void assignProduct(p.id)}
                      >
                        {assignedIds.has(p.id) ? "Added" : "Add"}
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Products ({detail?.products?.length ?? 0})
              </p>
              {(detail?.products ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center border border-dashed rounded-xl">
                  No products in this collection yet
                </p>
              ) : (
                <ul className="rounded-xl border border-border divide-y">
                  {(detail?.products ?? []).map((cp) => (
                    <li key={cp.productId} className="flex items-center justify-between gap-2 px-3 py-2.5">
                      <span className="text-sm truncate">{cp.product?.name ?? cp.productId}</span>
                      <button
                        type="button"
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => void removeProduct(cp.productId)}
                        title="Remove"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className={modalInlineFooterClass}>
              <Button variant="outline" onClick={() => detail && openEdit(detail)}>Edit</Button>
              <Button variant="secondary" onClick={() => setDetailOpen(false)}>Close</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </ModuleGate>
  );
}
