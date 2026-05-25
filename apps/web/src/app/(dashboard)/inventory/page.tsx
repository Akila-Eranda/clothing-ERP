"use client";

import { useState, useEffect, useCallback } from "react";
import { AlertTriangle, ArrowUpDown, Package, TrendingDown, BarChart3, RefreshCw, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ColumnDef } from "@tanstack/react-table";
import { ClientSideTable } from "@/components/table/client-side-table";
import { DataTableColumnHeader } from "@/components/table/data-table-column-header";
import { TableActionsRow } from "@/components/table/table-actions-row";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { StockAdjustModal, type InventoryItem } from "@/components/inventory/stock-adjust-modal";
import { CreatePOModal } from "@/components/purchases/create-po-modal";
import { useRouter } from "next/navigation";

function getStockStatus(qty: number) {
  if (qty === 0) return "out_of_stock";
  if (qty <= 5)  return "low_stock";
  return "in_stock";
}

function buildColumns(
  onCreatePO: (item: InventoryItem) => void,
): ColumnDef<InventoryItem>[] {
  return [
    {
      id: "product",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Product" />,
      cell: ({ row }) => (
        <div>
          <p className="text-sm font-medium">{row.original.variant.product.name}</p>
          <p className="text-xs text-muted-foreground">{row.original.variant.name}</p>
        </div>
      ),
    },
    {
      id: "sku",
      header: ({ column }) => <DataTableColumnHeader column={column} title="SKU" />,
      cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.variant.sku}</span>,
    },
    {
      id: "category",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Category" />,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">{row.original.variant.product.category?.name ?? "—"}</span>
      ),
    },
    {
      accessorKey: "quantity",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Stock" />,
      cell: ({ row }) => {
        const qty = row.original.quantity;
        const max = Math.max(qty, (row.original.reorderPoint ?? 5) * 4, 20);
        const pct = Math.min((qty / max) * 100, 100);
        const barColor = qty === 0 ? "bg-red-500" : qty <= 5 ? "bg-amber-500" : "bg-emerald-500";
        return (
          <div className="flex items-center gap-2 min-w-[140px]">
            <span className={`text-sm font-bold w-8 shrink-0 ${qty <= 5 ? "text-amber-500" : ""} ${qty === 0 ? "text-red-500" : ""}`}>
              {qty}
            </span>
            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
              <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      },
    },
    {
      id: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => {
        const s = getStockStatus(row.original.quantity);
        return (
          <Badge variant={s === "out_of_stock" ? "danger" : s === "low_stock" ? "warning" : "success"} className="text-[10px]">
            {s === "out_of_stock" ? "Out of Stock" : s === "low_stock" ? "Low Stock" : "In Stock"}
          </Badge>
        );
      },
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <TableActionsRow
          dropMoreActions={[
            { text: "Create Purchase Order", function: () => onCreatePO(row.original) },
          ]}
        />
      ),
    },
  ];
}

export default function InventoryPage() {
  const router = useRouter();
  const [stock, setStock]           = useState<InventoryItem[]>([]);
  const [lowStock, setLowStock]     = useState<InventoryItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [adjustItem, setAdjustItem] = useState<InventoryItem | null>(null);
  const [poOpen, setPoOpen]         = useState(false);
  const [prefillVariant, setPrefillVariant] = useState<string | undefined>();

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [stockRes, lowRes] = await Promise.all([
        api.get<{ data: InventoryItem[] }>("/inventory?limit=500"),
        api.get<InventoryItem[]>("/inventory/low-stock"),
      ]);
      setStock(stockRes.data?.data ?? (stockRes.data as unknown as InventoryItem[]) ?? []);
      setLowStock((lowRes.data as unknown as InventoryItem[]) ?? []);
    } catch { toast.error("Failed to load inventory"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const totalSKUs  = stock.length;
  const lowCount   = stock.filter((i) => i.quantity > 0 && i.quantity <= 5).length;
  const outCount   = stock.filter((i) => i.quantity === 0).length;
  const invValue   = stock.reduce((s, i) => s + i.quantity * (((i.variant.product as unknown as { costPrice?: number }).costPrice) ?? 0), 0);

  const STATS = [
    { label: "Total SKUs",        value: totalSKUs,                            icon: Package,      color: "text-blue-500",    bg: "bg-blue-500/10" },
    { label: "Inventory Value",   value: `LKR ${(invValue / 100000).toFixed(1)}L`, icon: BarChart3,    color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { label: "Low Stock Items",   value: lowCount,                              icon: TrendingDown, color: "text-amber-500",   bg: "bg-amber-500/10" },
    { label: "Out of Stock",      value: outCount,                              icon: AlertTriangle,color: "text-red-500",     bg: "bg-red-500/10" },
  ];

  const columns = buildColumns(
    (item) => { setPrefillVariant(item.variantId); setPoOpen(true); },
  );

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Inventory Management</h1>
          <p className="text-sm text-muted-foreground">Track stock levels, movements, and alerts</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={fetchAll} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => router.push("/purchases")} className="gap-1.5">
            <ShoppingBag className="h-3.5 w-3.5" /> Purchase Orders
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => setAdjustItem(stock[0] ?? null)}>
            <ArrowUpDown className="h-3.5 w-3.5" /> Stock Adjustment
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {STATS.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${s.bg}`}><s.icon className={`h-5 w-5 ${s.color}`} /></div>
              <div><p className="text-xl font-bold">{s.value}</p><p className="text-xs text-muted-foreground">{s.label}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Main table */}
        <div className="xl:col-span-2">
          <ClientSideTable
            data={stock}
            columns={columns}
            pageCount={Math.ceil(stock.length / 10)}
            searchableColumns={[]}
            filterableColumns={[]}
            isShowExportButtons={{ isShow: true, fileName: "inventory-export" }}
          />
        </div>

        {/* Reorder alerts */}
        <div>
          <Card className="border-amber-500/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Reorder Alerts
                <Badge variant="warning" className="ml-auto text-[10px]">{lowStock.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 max-h-[520px] overflow-y-auto">
              {lowStock.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">All stock levels are healthy</p>
              )}
              {lowStock.map((item) => {
                const reorder = item.reorderPoint ?? 5;
                return (
                  <div key={item.id} className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/10 space-y-2">
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.variant.product.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{item.variant.sku}</p>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <p className={`text-sm font-bold ${item.quantity === 0 ? "text-red-500" : "text-amber-500"}`}>
                          {item.quantity}
                        </p>
                        <p className="text-[10px] text-muted-foreground">/ {reorder} min</p>
                      </div>
                    </div>
                    <Button size="sm" variant="warning" className="w-full h-7 text-xs gap-1.5"
                      onClick={() => { setPrefillVariant(item.variantId); setPoOpen(true); }}>
                      <ShoppingBag className="h-3 w-3" /> Create Purchase Order
                    </Button>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Modals */}
      <StockAdjustModal
        open={!!adjustItem}
        item={adjustItem}
        onClose={() => setAdjustItem(null)}
        onAdjusted={fetchAll}
      />
      <CreatePOModal
        open={poOpen}
        onClose={() => { setPoOpen(false); setPrefillVariant(undefined); }}
        onCreated={() => { setPoOpen(false); setPrefillVariant(undefined); fetchAll(); }}
        prefillVariantId={prefillVariant}
      />
    </div>
  );
}
