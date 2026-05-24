"use client";

import {
  AlertTriangle, ArrowUpDown, Package,
  TrendingDown, BarChart3, Download, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ColumnDef } from "@tanstack/react-table";
import { ClientSideTable } from "@/components/table/client-side-table";
import { DataTableColumnHeader } from "@/components/table/data-table-column-header";
import { TableActionsRow } from "@/components/table/table-actions-row";
import { DUMMY_PRODUCTS, DUMMY_LOW_STOCK } from "@/lib/constants";

const STATS = [
  { label: "Total SKUs", value: "2,847", icon: Package, color: "text-blue-500", bg: "bg-blue-500/10" },
  { label: "Inventory Value", value: "₹84.2L", icon: BarChart3, color: "text-emerald-500", bg: "bg-emerald-500/10" },
  { label: "Low Stock Items", value: "32", icon: TrendingDown, color: "text-amber-500", bg: "bg-amber-500/10" },
  { label: "Out of Stock", value: "8", icon: AlertTriangle, color: "text-red-500", bg: "bg-red-500/10" },
];

type InventoryProduct = typeof DUMMY_PRODUCTS[number];

const getStockStatus = (stock: number) =>
  stock === 0 ? "out_of_stock" : stock < 10 ? "low_stock" : "in_stock";

const inventoryColumns: ColumnDef<InventoryProduct>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Product" />,
    cell: ({ row }) => (
      <div>
        <p className="text-sm font-medium">{row.original.name}</p>
        <p className="text-xs text-muted-foreground font-mono">{row.original.sku}</p>
      </div>
    ),
  },
  {
    accessorKey: "category",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Category" />,
    cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.category}</span>,
  },
  {
    accessorKey: "stock",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Stock" />,
    cell: ({ row }) => {
      const pct = Math.min((row.original.stock / 100) * 100, 100);
      const barColor = row.original.stock === 0 ? "bg-red-500" : row.original.stock < 10 ? "bg-amber-500" : "bg-emerald-500";
      return (
        <div className="flex items-center gap-2 min-w-[140px]">
          <span className={`text-sm font-bold w-8 ${row.original.stock < 10 ? "text-amber-500" : ""}`}>
            {row.original.stock}
          </span>
          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
            <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[10px] text-muted-foreground w-7 text-right">{pct.toFixed(0)}%</span>
        </div>
      );
    },
  },
  {
    id: "stockStatus",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    cell: ({ row }) => {
      const s = getStockStatus(row.original.stock);
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
        editAction={{ action: () => console.log("adjust", row.original.id) }}
        dropMoreActions={[
          { text: "Stock Adjustment", function: () => console.log("adjust", row.original.id) },
          { text: "View History",     function: () => console.log("history", row.original.id) },
          { text: "Create PO",        function: () => console.log("po", row.original.id) },
        ]}
      />
    ),
  },
];

export default function InventoryPage() {
  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Inventory Management</h1>
          <p className="text-sm text-muted-foreground">Track stock levels, movements, and alerts</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5"><RefreshCw className="h-3.5 w-3.5" />Sync</Button>
          <Button variant="outline" size="sm" className="gap-1.5"><Download className="h-3.5 w-3.5" />Export</Button>
          <Button variant="gradient" size="sm" className="gap-1.5"><ArrowUpDown className="h-3.5 w-3.5" />Stock Adjustment</Button>
        </div>
      </div>

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
        <div className="xl:col-span-2">
          <ClientSideTable
            data={DUMMY_PRODUCTS}
            columns={inventoryColumns}
            pageCount={Math.ceil(DUMMY_PRODUCTS.length / 10)}
            searchableColumns={[
              { id: "name", title: "Product" },
              { id: "sku",  title: "SKU" },
            ]}
            filterableColumns={[
              {
                id: "category",
                title: "Category",
                options: [
                  { label: "T-Shirts",   value: "T-Shirts" },
                  { label: "Jeans",      value: "Jeans" },
                  { label: "Dresses",    value: "Dresses" },
                  { label: "Shirts",     value: "Shirts" },
                  { label: "Footwear",   value: "Footwear" },
                  { label: "Jackets",    value: "Jackets" },
                  { label: "Activewear", value: "Activewear" },
                  { label: "Ethnic",     value: "Ethnic" },
                ],
              },
            ]}
            isShowExportButtons={{ isShow: true, fileName: "inventory-export" }}
          />
        </div>

        <div className="space-y-4">
          <Card className="border-amber-500/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Reorder Alerts
                <Badge variant="warning" className="ml-auto text-[10px]">{DUMMY_LOW_STOCK.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {DUMMY_LOW_STOCK.map((item) => (
                <div key={item.id} className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/10 space-y-2">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.name}</p>
                      <p className="text-xs text-muted-foreground">{item.variant}</p>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <p className="text-sm font-bold text-amber-500">{item.stock}</p>
                      <p className="text-[10px] text-muted-foreground">/ {item.minStock} min</p>
                    </div>
                  </div>
                  <Progress value={(item.stock / item.minStock) * 100} className="h-1" />
                  <Button size="sm" variant="warning" className="w-full h-7 text-xs">Create Purchase Order</Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
