"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RefreshCw, Shirt, TrendingUp, AlertTriangle, Package } from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader, PageKpiGrid, pageKpi } from "@/components/ui/page-kpi";
import { ClientSideTable, DataTableColumnHeader } from "@/components/table";
import { LoadingCenter } from "@/components/ui/loading";
import { useBranchContext } from "@/components/branch/branch-provider";
import { useBranchStore } from "@/stores/branch-store";
import { useShopProfile } from "@/lib/use-shop-profile";
import { ShopType } from "@/lib/shop-profiles";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { parseApiList } from "@/lib/parse-api-list";
import { formatNumber, cn } from "@/lib/utils";

type ReorderRow = {
  productName: string;
  variantId: string;
  size?: string | null;
  color?: string | null;
  sku?: string;
  currentStock: number;
  sales30d: number;
  velocity: number;
  daysOfStock?: number | null;
  reorderPoint?: number;
  suggestedQty: number;
  reason: string;
  demandLevel: "HIGH" | "MEDIUM" | "LOW" | string;
};

type BrandOpt = { id: string; name: string };
type CategoryOpt = { id: string; name: string };
type CollectionOpt = { id: string; name: string; season?: string | null };
type SupplierOpt = { id: string; name: string };

export default function FashionReorderPage() {
  const router = useRouter();
  const profile = useShopProfile();
  const allowed = profile.type === ShopType.CLOTHING;
  const { branches } = useBranchContext();
  const activeBranchId = useBranchStore((s) => s.activeBranchId);
  const setBranch = useBranchStore((s) => s.setBranch);
  const branchId = activeBranchId ?? branches[0]?.id ?? "";

  const [rows, setRows] = useState<ReorderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState("30");
  const [size, setSize] = useState("");
  const [color, setColor] = useState("");
  const [season, setSeason] = useState("");
  const [search, setSearch] = useState("");
  const [brandId, setBrandId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [collectionId, setCollectionId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [brands, setBrands] = useState<BrandOpt[]>([]);
  const [categories, setCategories] = useState<CategoryOpt[]>([]);
  const [collections, setCollections] = useState<CollectionOpt[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOpt[]>([]);

  useEffect(() => {
    if (!allowed) router.replace("/reports");
  }, [allowed, router]);

  useEffect(() => {
    if (!allowed) return;
    void (async () => {
      try {
        const [b, c, col, s] = await Promise.all([
          api.get<BrandOpt[] | { data: BrandOpt[] }>("/brands?limit=200").catch(() => ({ data: [] })),
          api.get<CategoryOpt[] | { data: CategoryOpt[] }>("/categories?limit=200").catch(() => ({ data: [] })),
          api.get<CollectionOpt[] | { data: CollectionOpt[] }>("/collections?limit=200").catch(() => ({ data: [] })),
          api.get<SupplierOpt[] | { data: SupplierOpt[] }>("/suppliers?limit=200").catch(() => ({ data: [] })),
        ]);
        setBrands(parseApiList(b.data));
        setCategories(parseApiList(c.data));
        setCollections(parseApiList(col.data));
        setSuppliers(parseApiList(s.data));
      } catch {
        /* optional filters */
      }
    })();
  }, [allowed]);

  const load = useCallback(async () => {
    if (!allowed) return;
    if (!branchId) {
      setRows([]);
      setLoading(false);
      toast.error("Select a branch for reorder suggestions");
      return;
    }
    setLoading(true);
    try {
      const q = new URLSearchParams({ days: days || "30", branchId });
      if (size.trim()) q.set("size", size.trim());
      if (color.trim()) q.set("color", color.trim());
      if (season.trim()) q.set("season", season.trim());
      if (search.trim()) q.set("search", search.trim());
      if (brandId) q.set("brandId", brandId);
      if (categoryId) q.set("categoryId", categoryId);
      if (collectionId) q.set("collectionId", collectionId);
      if (supplierId) q.set("supplierId", supplierId);
      if (from) q.set("from", from);
      if (to) q.set("to", to);
      const res = await api.get<ReorderRow[]>(`/clothing/reorder-suggestions?${q.toString()}`);
      setRows(parseApiList(res.data));
    } catch {
      toast.error("Failed to load reorder suggestions");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [
    allowed,
    branchId,
    days,
    size,
    color,
    season,
    search,
    brandId,
    categoryId,
    collectionId,
    supplierId,
    from,
    to,
  ]);

  useEffect(() => { void load(); }, [load]);

  const columns = useMemo<ColumnDef<ReorderRow>[]>(
    () => [
      {
        id: "product",
        accessorFn: (r) => `${r.productName} ${r.sku ?? ""}`.trim(),
        header: ({ column }) => <DataTableColumnHeader column={column} title="Product" />,
        cell: ({ row }) => (
          <div>
            <p className="text-sm font-medium">{row.original.productName}</p>
            <p className="text-[11px] font-mono text-muted-foreground">{row.original.sku}</p>
          </div>
        ),
      },
      {
        id: "color",
        accessorKey: "color",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Color" />,
        cell: ({ row }) => row.original.color || "—",
      },
      {
        id: "size",
        accessorKey: "size",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Size" />,
        cell: ({ row }) => row.original.size || "—",
      },
      {
        id: "stock",
        accessorKey: "currentStock",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Stock" />,
        cell: ({ row }) => (
          <span className="font-semibold tabular-nums">{formatNumber(row.original.currentStock)}</span>
        ),
      },
      {
        id: "sales",
        accessorKey: "sales30d",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Sales" />,
        cell: ({ row }) => formatNumber(row.original.sales30d),
      },
      {
        id: "velocity",
        accessorKey: "velocity",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Velocity" />,
        cell: ({ row }) => row.original.velocity?.toFixed?.(3) ?? row.original.velocity,
      },
      {
        id: "dos",
        accessorKey: "daysOfStock",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Days stock" />,
        cell: ({ row }) =>
          row.original.daysOfStock == null ? "—" : formatNumber(row.original.daysOfStock),
      },
      {
        id: "suggested",
        accessorKey: "suggestedQty",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Reorder" />,
        cell: ({ row }) => (
          <span className="font-bold text-primary tabular-nums">
            {formatNumber(row.original.suggestedQty)}
          </span>
        ),
      },
      {
        id: "demandLevel",
        accessorKey: "demandLevel",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Demand" />,
        cell: ({ row }) => {
          const d = (row.original.demandLevel || "").toUpperCase();
          return (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                d === "HIGH" && "bg-red-100 text-red-700",
                d === "MEDIUM" && "bg-amber-100 text-amber-700",
                d === "LOW" && "bg-slate-100 text-slate-600",
              )}
            >
              {d || "—"}
            </span>
          );
        },
      },
      {
        id: "reason",
        accessorKey: "reason",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Reason" />,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground line-clamp-2">{row.original.reason}</span>
        ),
      },
    ],
    [],
  );

  const high = rows.filter((r) => (r.demandLevel || "").toUpperCase() === "HIGH").length;
  const suggestedUnits = rows.reduce((s, r) => s + (r.suggestedQty || 0), 0);
  const kpis = [
    pageKpi("Suggestions", rows.length, Package, "slate"),
    pageKpi("High demand", high, AlertTriangle, "danger"),
    pageKpi("Suggested units", suggestedUnits, TrendingUp, "blue"),
    pageKpi("SKU coverage", rows.length, Shirt, "amber"),
  ];

  if (!allowed) {
    return <LoadingCenter className="min-h-[40vh]" size={88} />;
  }

  return (
    <div className="page-shell space-y-4">
      <PageHeader
        title="Fashion Reorder"
        description="Size/color velocity-based reorder suggestions (clothing)"
        onRefresh={() => void load()}
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
                <SelectValue placeholder="Branch" />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button asChild variant="outline" className="gap-1.5">
              <Link href="/reports/fashion">
                <Shirt className="h-4 w-4" /> Analytics
              </Link>
            </Button>
            <Button variant="outline" className="gap-1.5" onClick={() => void load()}>
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> Refresh
            </Button>
          </div>
        }
      />

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 rounded-xl border bg-card p-3">
        <Input placeholder="Search product / SKU" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9" />
        <Input placeholder="Size" value={size} onChange={(e) => setSize(e.target.value)} className="h-9" />
        <Input placeholder="Color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9" />
        <Input placeholder="Season" value={season} onChange={(e) => setSeason(e.target.value)} className="h-9" />
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="h-9"><SelectValue placeholder="Window" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">7 days</SelectItem>
            <SelectItem value="14">14 days</SelectItem>
            <SelectItem value="30">30 days</SelectItem>
            <SelectItem value="60">60 days</SelectItem>
            <SelectItem value="90">90 days</SelectItem>
          </SelectContent>
        </Select>
        <Select value={brandId || "__any__"} onValueChange={(v) => setBrandId(v === "__any__" ? "" : v)}>
          <SelectTrigger className="h-9"><SelectValue placeholder="Brand" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__any__">All brands</SelectItem>
            {brands.map((b) => (
              <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={categoryId || "__any__"} onValueChange={(v) => setCategoryId(v === "__any__" ? "" : v)}>
          <SelectTrigger className="h-9"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__any__">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={collectionId || "__any__"} onValueChange={(v) => setCollectionId(v === "__any__" ? "" : v)}>
          <SelectTrigger className="h-9"><SelectValue placeholder="Collection" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__any__">All collections</SelectItem>
            {collections.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={supplierId || "__any__"} onValueChange={(v) => setSupplierId(v === "__any__" ? "" : v)}>
          <SelectTrigger className="h-9"><SelectValue placeholder="Supplier" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__any__">All suppliers</SelectItem>
            {suppliers.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9" title="From" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9" title="To" />
        <Button className="h-9" onClick={() => void load()}>Apply filters</Button>
      </div>

      <PageKpiGrid items={kpis} loading={loading} />

      <ClientSideTable
        data={rows}
        columns={columns}
        searchableColumns={[
          { id: "product", title: "Product / SKU" },
          { id: "color", title: "Color" },
          { id: "size", title: "Size" },
          { id: "reason", title: "Reason" },
        ]}
        filterableColumns={[
          {
            id: "demandLevel",
            title: "Demand",
            options: [
              { label: "High", value: "HIGH" },
              { label: "Medium", value: "MEDIUM" },
              { label: "Low", value: "LOW" },
            ],
          },
        ]}
        isShowExportButtons={{ isShow: true, fileName: "fashion-reorder" }}
      />
    </div>
  );
}
