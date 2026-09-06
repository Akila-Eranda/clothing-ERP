"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Shirt, Layers, Palette, Ruler, TrendingUp, Package } from "lucide-react";
import { PageHeader, PageKpiGrid, pageKpi } from "@/components/ui/page-kpi";
import { ClientSideTable, DataTableColumnHeader } from "@/components/table";
import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { parseApiList } from "@/lib/parse-api-list";
import { formatNumber } from "@/lib/utils";
import { useShopProfile, hasShopModule } from "@/lib/use-shop-profile";
import { ShopType } from "@/lib/shop-profiles";
import { LoadingCenter } from "@/components/ui/loading";
import { useBranchStore } from "@/stores/branch-store";

type CollectionRow = {
  id: string;
  name: string;
  season?: string | null;
  year?: number | null;
  isActive: boolean;
  _count?: { products: number };
};

type Perf = {
  collectionId: string;
  name?: string;
  unitsSold: number;
  revenue: number;
  remainingStock: number;
  sellThroughPct: number;
};

type SizeRow = { size: string; units: number; revenue: number };
type ColorRow = { color: string; units: number; revenue: number };

type SaleItemLike = {
  quantity?: number;
  total?: number;
  size?: string | null;
  color?: string | null;
  variant?: { size?: string | null; color?: string | null } | null;
  productName?: string;
};

type SaleLike = {
  items?: SaleItemLike[];
  status?: string;
};

function aggregateAttr(items: SaleItemLike[], key: "size" | "color"): { label: string; units: number; revenue: number }[] {
  const map = new Map<string, { units: number; revenue: number }>();
  for (const it of items) {
    const label = (it[key] ?? it.variant?.[key] ?? "").toString().trim() || "Unknown";
    const cur = map.get(label) ?? { units: 0, revenue: 0 };
    cur.units += Number(it.quantity ?? 0);
    cur.revenue += Number(it.total ?? 0);
    map.set(label, cur);
  }
  return [...map.entries()]
    .map(([label, v]) => ({ label, ...v }))
    .sort((a, b) => b.units - a.units);
}

export default function FashionAnalyticsPage() {
  const router = useRouter();
  const profile = useShopProfile();
  const branchId = useBranchStore((s) => s.activeBranchId);
  const allowed =
    profile.type === ShopType.CLOTHING || hasShopModule(profile, "collections");

  const [loading, setLoading] = useState(true);
  const [collections, setCollections] = useState<CollectionRow[]>([]);
  const [perfs, setPerfs] = useState<Perf[]>([]);
  const [sizeRows, setSizeRows] = useState<SizeRow[]>([]);
  const [colorRows, setColorRows] = useState<ColorRow[]>([]);

  useEffect(() => {
    if (!allowed) router.replace("/reports");
  }, [allowed, router]);

  const load = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    try {
      const fashionQs = branchId ? `?branchId=${encodeURIComponent(branchId)}` : "";
      const [fashionRes, colRes] = await Promise.allSettled([
        api.get<{
          sizeSales?: SizeRow[];
          colorSales?: ColorRow[];
          sellThrough?: number;
          topVariants?: unknown[];
          deadStock?: unknown[];
        }>(`/reports/fashion-analytics${fashionQs}`),
        hasShopModule(profile, "collections")
          ? api.get<CollectionRow[]>("/collections")
          : Promise.resolve({ data: [] as CollectionRow[] }),
      ]);

      const cols =
        colRes.status === "fulfilled" ? parseApiList<CollectionRow>(colRes.value.data) : [];
      setCollections(cols);

      if (fashionRes.status === "fulfilled" && fashionRes.value.data) {
        const d = fashionRes.value.data;
        setSizeRows(d.sizeSales ?? []);
        setColorRows(d.colorSales ?? []);
      } else {
        setSizeRows([]);
        setColorRows([]);
      }

      if (cols.length > 0) {
        const perfResults = await Promise.allSettled(
          cols.slice(0, 12).map((c) => api.get<Perf>(`/collections/${c.id}/performance`)),
        );
        setPerfs(
          perfResults.flatMap((r) => (r.status === "fulfilled" ? [r.value.data] : [])),
        );
      } else {
        setPerfs([]);
      }
    } catch {
      toast.error("Failed to load fashion analytics");
    } finally {
      setLoading(false);
    }
  }, [allowed, profile, branchId]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalUnits = perfs.reduce((s, p) => s + (p.unitsSold ?? 0), 0);
  const totalRevenue = perfs.reduce((s, p) => s + (p.revenue ?? 0), 0);
  const avgSellThrough =
    perfs.length > 0
      ? Math.round((perfs.reduce((s, p) => s + (p.sellThroughPct ?? 0), 0) / perfs.length) * 10) / 10
      : 0;

  const kpis = [
    { ...pageKpi("Collections", collections.length, Layers, "slate"), href: "/collections" },
    pageKpi("Units sold", totalUnits || sizeRows.reduce((s, r) => s + r.units, 0), Package, "blue"),
    pageKpi("Collection revenue", `LKR ${formatNumber(totalRevenue)}`, TrendingUp, "emerald"),
    pageKpi("Avg sell-through", `${avgSellThrough}%`, Shirt, "amber"),
  ];

  const sizeCols = useMemo<ColumnDef<SizeRow>[]>(
    () => [
      {
        accessorKey: "size",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Size" />,
      },
      {
        accessorKey: "units",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Units" />,
        cell: ({ row }) => <span className="tabular-nums">{formatNumber(row.original.units)}</span>,
      },
      {
        accessorKey: "revenue",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Revenue" />,
        cell: ({ row }) => (
          <span className="tabular-nums">LKR {formatNumber(row.original.revenue)}</span>
        ),
      },
    ],
    [],
  );

  const colorCols = useMemo<ColumnDef<ColorRow>[]>(
    () => [
      {
        accessorKey: "color",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Color" />,
      },
      {
        accessorKey: "units",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Units" />,
        cell: ({ row }) => <span className="tabular-nums">{formatNumber(row.original.units)}</span>,
      },
      {
        accessorKey: "revenue",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Revenue" />,
        cell: ({ row }) => (
          <span className="tabular-nums">LKR {formatNumber(row.original.revenue)}</span>
        ),
      },
    ],
    [],
  );

  const collCols = useMemo<ColumnDef<Perf>[]>(
    () => [
      {
        accessorKey: "name",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Collection" />,
        cell: ({ row }) => (
          <Link href="/collections" className="text-sm font-medium text-primary hover:underline">
            {row.original.name ?? row.original.collectionId}
          </Link>
        ),
      },
      {
        accessorKey: "unitsSold",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Units" />,
        cell: ({ row }) => <span className="tabular-nums">{formatNumber(row.original.unitsSold)}</span>,
      },
      {
        accessorKey: "revenue",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Revenue" />,
        cell: ({ row }) => (
          <span className="tabular-nums">LKR {formatNumber(row.original.revenue)}</span>
        ),
      },
      {
        accessorKey: "sellThroughPct",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Sell-through" />,
        cell: ({ row }) => <span className="tabular-nums">{row.original.sellThroughPct}%</span>,
      },
    ],
    [],
  );

  if (!allowed) {
    return <LoadingCenter className="min-h-[40vh]" size={88} />;
  }

  return (
    <div className="page-shell space-y-4">
      <PageHeader
        title="Fashion Analytics"
        description="Size-wise and color-wise sales plus collection sell-through (clothing)"
        onRefresh={() => void load()}
        refreshing={loading}
        actions={
          <div className="flex items-center gap-2">
            {hasShopModule(profile, "collections") ? (
              <Button asChild variant="outline" className="gap-1.5">
                <Link href="/collections">
                  <Layers className="h-4 w-4" />
                  Collections
                </Link>
              </Button>
            ) : null}
            {profile.type === ShopType.CLOTHING ? (
              <Button asChild variant="outline" className="gap-1.5">
                <Link href="/reports/fashion-reorder">
                  <Package className="h-4 w-4" />
                  Reorder
                </Link>
              </Button>
            ) : null}
          </div>
        }
      />

      <PageKpiGrid items={kpis} loading={loading} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Ruler className="h-4 w-4 text-muted-foreground" />
            Size-wise sales
          </div>
          <ClientSideTable
            data={sizeRows}
            columns={sizeCols}
            searchableColumns={[{ id: "size", title: "Size" }]}
          />
          {sizeRows.length === 0 && !loading ? (
            <p className="text-xs text-muted-foreground px-1">
              Placeholder — size breakdown appears when sale items include size attributes.
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Palette className="h-4 w-4 text-muted-foreground" />
            Color-wise sales
          </div>
          <ClientSideTable
            data={colorRows}
            columns={colorCols}
            searchableColumns={[{ id: "color", title: "Color" }]}
          />
          {colorRows.length === 0 && !loading ? (
            <p className="text-xs text-muted-foreground px-1">
              Placeholder — color breakdown appears when sale items include color attributes.
            </p>
          ) : null}
        </div>
      </div>

      {hasShopModule(profile, "collections") ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Layers className="h-4 w-4 text-muted-foreground" />
            Collection performance
          </div>
          <ClientSideTable data={perfs} columns={collCols} />
        </div>
      ) : null}
    </div>
  );
}
