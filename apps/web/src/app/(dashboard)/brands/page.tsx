"use client";

import { Star, Plus, Package, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ColumnDef } from "@tanstack/react-table";
import { ClientSideTable } from "@/components/table/client-side-table";
import { DataTableColumnHeader } from "@/components/table/data-table-column-header";
import { TableActionsRow } from "@/components/table/table-actions-row";

const DUMMY_BRANDS = [
  { id: "BR001", name: "FabricFusion", slug: "fabricfusion", products: 84,  country: "India", website: "fabricfusion.in",    isActive: true,  isFeatured: true  },
  { id: "BR002", name: "UrbanThread",  slug: "urbanthread",  products: 126, country: "India", website: "urbanthread.com",     isActive: true,  isFeatured: true  },
  { id: "BR003", name: "DesiStyle",    slug: "desistyle",    products: 67,  country: "India", website: null,                  isActive: true,  isFeatured: false },
  { id: "BR004", name: "KhakiKraft",   slug: "khakikraft",   products: 43,  country: "India", website: "khakikraft.com",      isActive: true,  isFeatured: false },
  { id: "BR005", name: "SilkRoute",    slug: "silkroute",    products: 92,  country: "India", website: "silkroute.in",        isActive: true,  isFeatured: true  },
  { id: "BR006", name: "CottonCloud",  slug: "cottoncloud",  products: 55,  country: "India", website: null,                  isActive: false, isFeatured: false },
  { id: "BR007", name: "WeaveMaster",  slug: "weavemaster",  products: 38,  country: "India", website: "weavemaster.co.in",   isActive: true,  isFeatured: false },
  { id: "BR008", name: "StitchStar",   slug: "stitchstar",   products: 71,  country: "India", website: null,                  isActive: true,  isFeatured: false },
];

type Brand = typeof DUMMY_BRANDS[number];

const columns: ColumnDef<Brand>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Brand" />,
    cell: ({ row }) => (
      <div className="flex items-center gap-2.5">
        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center shrink-0">
          <span className="text-sm font-black text-primary">{row.original.name[0]}</span>
        </div>
        <div>
          <p className="text-sm font-semibold">{row.original.name}</p>
          <p className="text-[10px] text-muted-foreground font-mono">/{row.original.slug}</p>
        </div>
        {row.original.isFeatured && <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400 shrink-0" />}
      </div>
    ),
  },
  {
    accessorKey: "products",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Products" />,
    cell: ({ row }) => (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium">
        <Package className="h-3.5 w-3.5 text-muted-foreground" />
        {row.original.products}
      </span>
    ),
  },
  {
    accessorKey: "country",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Country" />,
    cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.country}</span>,
  },
  {
    accessorKey: "website",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Website" />,
    cell: ({ row }) => row.original.website ? (
      <a href={`https://${row.original.website}`} target="_blank" rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
        <Globe className="h-3 w-3" />{row.original.website}
      </a>
    ) : <span className="text-xs text-muted-foreground">—</span>,
  },
  {
    accessorKey: "isFeatured",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Featured" />,
    cell: ({ row }) => row.original.isFeatured
      ? <Badge variant="warning" className="text-[10px]">Featured</Badge>
      : <span className="text-xs text-muted-foreground">—</span>,
  },
  {
    accessorKey: "isActive",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    cell: ({ row }) => (
      <Badge variant={row.original.isActive ? "success" : "secondary"} className="text-[10px]">
        {row.original.isActive ? "Active" : "Inactive"}
      </Badge>
    ),
  },
  {
    id: "actions",
    cell: ({ row }) => (
      <TableActionsRow
        editAction={{ action: () => console.log("edit", row.original.id) }}
        deleteAction={{ action: () => console.log("delete", row.original.id) }}
        dropMoreActions={[
          { text: "View Products", function: () => console.log("products", row.original.id) },
          { text: row.original.isActive ? "Deactivate" : "Activate", function: () => console.log("toggle", row.original.id) },
        ]}
      />
    ),
  },
];

export default function BrandsPage() {
  const activeCount   = DUMMY_BRANDS.filter((b) => b.isActive).length;
  const totalProducts = DUMMY_BRANDS.reduce((s, b) => s + b.products, 0);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Brands</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage product brands and manufacturers</p>
        </div>
        <Button variant="gradient" className="gap-2">
          <Plus className="h-4 w-4" /> Add Brand
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Total Brands</p><p className="text-2xl font-bold mt-1">{DUMMY_BRANDS.length}</p></div>
        <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Active</p><p className="text-2xl font-bold mt-1 text-emerald-500">{activeCount}</p></div>
        <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Total Products</p><p className="text-2xl font-bold mt-1 text-primary">{totalProducts}</p></div>
      </div>

      <ClientSideTable
        data={DUMMY_BRANDS}
        columns={columns}
        pageCount={Math.ceil(DUMMY_BRANDS.length / 10)}
        searchableColumns={[
          { id: "name", title: "Brand" },
          { id: "slug", title: "Slug" },
        ]}
        filterableColumns={[
          {
            id: "isActive",
            title: "Status",
            options: [
              { label: "Active",   value: "true"  },
              { label: "Inactive", value: "false" },
            ],
          },
          {
            id: "isFeatured",
            title: "Featured",
            options: [
              { label: "Featured",     value: "true"  },
              { label: "Not Featured", value: "false" },
            ],
          },
        ]}
      />
    </div>
  );
}
