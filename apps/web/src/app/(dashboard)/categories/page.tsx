"use client";

import { Tag, Plus, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ColumnDef } from "@tanstack/react-table";
import { ClientSideTable } from "@/components/table/client-side-table";
import { DataTableColumnHeader } from "@/components/table/data-table-column-header";
import { TableActionsRow } from "@/components/table/table-actions-row";

const DUMMY_CATEGORIES = [
  { id: "C001", name: "Men's Wear",    slug: "mens-wear",    products: 124, subcategories: ["T-Shirts", "Jeans", "Formal Shirts", "Shorts"] },
  { id: "C002", name: "Women's Wear", slug: "womens-wear",  products: 186, subcategories: ["Tops", "Sarees", "Kurtis", "Dresses"] },
  { id: "C003", name: "Kids' Wear",   slug: "kids-wear",    products: 72,  subcategories: ["Boys", "Girls", "Infants"] },
  { id: "C004", name: "Accessories",  slug: "accessories",  products: 54,  subcategories: ["Belts", "Wallets", "Bags", "Scarves"] },
  { id: "C005", name: "Footwear",     slug: "footwear",     products: 38,  subcategories: ["Casual", "Formal", "Sports"] },
  { id: "C006", name: "Ethnic Wear",  slug: "ethnic-wear",  products: 93,  subcategories: ["Kurtas", "Sherwanis", "Lehengas"] },
];

type Category = typeof DUMMY_CATEGORIES[number];

const columns: ColumnDef<Category>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Category" />,
    cell: ({ row }) => (
      <div className="flex items-center gap-2.5">
        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Tag className="h-4 w-4 text-primary" />
        </div>
        <span className="text-sm font-semibold">{row.original.name}</span>
      </div>
    ),
  },
  {
    accessorKey: "slug",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Slug" />,
    cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">/{row.original.slug}</span>,
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
    accessorKey: "subcategories",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Subcategories" />,
    cell: ({ row }) => (
      <div className="flex flex-wrap gap-1">
        {row.original.subcategories.slice(0, 3).map((sub) => (
          <span key={sub} className="px-2 py-0.5 rounded-full bg-muted text-[10px] font-medium text-muted-foreground">{sub}</span>
        ))}
        {row.original.subcategories.length > 3 && (
          <span className="px-2 py-0.5 rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
            +{row.original.subcategories.length - 3}
          </span>
        )}
      </div>
    ),
  },
  {
    id: "actions",
    cell: ({ row }) => (
      <TableActionsRow
        editAction={{ action: () => console.log("edit", row.original.id) }}
        deleteAction={{ action: () => console.log("delete", row.original.id) }}
        dropMoreActions={[
          { text: "Add Subcategory", function: () => console.log("sub", row.original.id) },
          { text: "View Products",   function: () => console.log("products", row.original.id) },
        ]}
      />
    ),
  },
];

export default function CategoriesPage() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Categories</h1>
          <p className="text-muted-foreground text-sm mt-1">Organize products into categories and subcategories</p>
        </div>
        <Button variant="gradient" className="gap-2">
          <Plus className="h-4 w-4" /> Add Category
        </Button>
      </div>

      <ClientSideTable
        data={DUMMY_CATEGORIES}
        columns={columns}
        pageCount={Math.ceil(DUMMY_CATEGORIES.length / 10)}
        searchableColumns={[
          { id: "name", title: "Category" },
          { id: "slug", title: "Slug" },
        ]}
      />
    </div>
  );
}
