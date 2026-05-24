"use client";

import { useState } from "react";
import { Plus, Upload, Package, AlertTriangle, TrendingUp, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ColumnDef } from "@tanstack/react-table";
import { ClientSideTable } from "@/components/table/client-side-table";
import { DataTableColumnHeader } from "@/components/table/data-table-column-header";
import { TableActionsRow } from "@/components/table/table-actions-row";
import { formatNumber } from "@/lib/utils";
import { DUMMY_PRODUCTS } from "@/lib/constants";
import { AddProductModal } from "@/components/products/add-product-modal";

const STATS = [
  { label: "Total Products",  value: "1,284", icon: Package,       color: "text-blue-500",   bg: "bg-blue-500/10" },
  { label: "Active Listings", value: "1,196", icon: TrendingUp,    color: "text-emerald-500",bg: "bg-emerald-500/10" },
  { label: "Low Stock",       value: "32",    icon: AlertTriangle, color: "text-amber-500",  bg: "bg-amber-500/10" },
  { label: "Top Rated",       value: "48",    icon: Star,          color: "text-violet-500", bg: "bg-violet-500/10" },
];

const STATUS_BADGE: Record<string, "success" | "secondary" | "danger" | "warning"> = {
  active:       "success",
  inactive:     "secondary",
  out_of_stock: "danger",
  low_stock:    "warning",
};

type Product = typeof DUMMY_PRODUCTS[number];

const columns: ColumnDef<Product>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Product" />,
    cell: ({ row }) => (
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
          <Package className="h-4 w-4 text-muted-foreground/50" />
        </div>
        <div>
          <p className="text-sm font-medium">{row.original.name}</p>
          <p className="text-xs text-muted-foreground">{row.original.brand}</p>
        </div>
      </div>
    ),
  },
  {
    accessorKey: "sku",
    header: ({ column }) => <DataTableColumnHeader column={column} title="SKU" />,
    cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.sku}</span>,
  },
  {
    accessorKey: "category",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Category" />,
    cell: ({ row }) => <Badge variant="secondary" className="text-[10px]">{row.original.category}</Badge>,
  },
  {
    accessorKey: "brand",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Brand" />,
    cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.brand}</span>,
  },
  {
    accessorKey: "price",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Price" />,
    cell: ({ row }) => <span className="text-sm font-semibold">₹{formatNumber(row.original.price)}</span>,
  },
  {
    accessorKey: "stock",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Stock" />,
    cell: ({ row }) => (
      <span className={`text-sm font-semibold ${row.original.stock < 10 ? "text-amber-500" : ""}`}>
        {row.original.stock}
      </span>
    ),
  },
  {
    accessorKey: "variants",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Variants" />,
    cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.variants}</span>,
  },
  {
    accessorKey: "status",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    cell: ({ row }) => (
      <Badge variant={STATUS_BADGE[row.original.status] ?? "secondary"} className="text-[10px] capitalize">
        {row.original.status.replace("_", " ")}
      </Badge>
    ),
  },
  {
    id: "actions",
    cell: ({ row }) => (
      <TableActionsRow
        showAction={{ action: () => console.log("view", row.original.id) }}
        editAction={{ action: () => console.log("edit", row.original.id) }}
        deleteAction={{ action: () => console.log("delete", row.original.id) }}
        dropMoreActions={[
          { text: "Duplicate", function: () => console.log("dup", row.original.id) },
          { text: "Manage Variants", function: () => console.log("variants", row.original.id) },
        ]}
      />
    ),
  },
];

export default function ProductsPage() {
  const [modalOpen, setModalOpen] = useState(false);
  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Products</h1>
          <p className="text-sm text-muted-foreground">Manage your product catalog and variants</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5"><Upload className="h-3.5 w-3.5" />Import</Button>
          <Button variant="gradient" size="sm" className="gap-1.5" onClick={() => setModalOpen(true)}><Plus className="h-3.5 w-3.5" />Add Product</Button>
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

      <ClientSideTable
        data={DUMMY_PRODUCTS}
        columns={columns}
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
              { label: "T-Shirts",    value: "T-Shirts" },
              { label: "Jeans",       value: "Jeans" },
              { label: "Dresses",     value: "Dresses" },
              { label: "Shirts",      value: "Shirts" },
              { label: "Footwear",    value: "Footwear" },
              { label: "Jackets",     value: "Jackets" },
              { label: "Activewear",  value: "Activewear" },
              { label: "Ethnic",      value: "Ethnic" },
            ],
          },
          {
            id: "status",
            title: "Status",
            options: [
              { label: "Active",       value: "active" },
              { label: "Inactive",     value: "inactive" },
              { label: "Out of Stock", value: "out_of_stock" },
              { label: "Low Stock",    value: "low_stock" },
            ],
          },
          {
            id: "brand",
            title: "Brand",
            options: [
              { label: "StylePro",       value: "StylePro" },
              { label: "DenimCo",        value: "DenimCo" },
              { label: "FormalEdge",     value: "FormalEdge" },
              { label: "SportsFit",      value: "SportsFit" },
              { label: "WinterWear",     value: "WinterWear" },
              { label: "TraditionPlus",  value: "TraditionPlus" },
            ],
          },
        ]}
        isShowExportButtons={{ isShow: true, fileName: "products-export" }}
      />
      <AddProductModal open={modalOpen} onClose={() => setModalOpen(false)} onCreated={() => setModalOpen(false)} />
    </div>
  );
}
