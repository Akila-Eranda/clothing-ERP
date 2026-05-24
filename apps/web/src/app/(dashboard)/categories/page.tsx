"use client";

import { useState, useEffect, useCallback } from "react";
import { Tag, Plus, Package, RefreshCw, FolderTree } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ColumnDef } from "@tanstack/react-table";
import { ClientSideTable } from "@/components/table/client-side-table";
import { DataTableColumnHeader } from "@/components/table/data-table-column-header";
import { TableActionsRow } from "@/components/table/table-actions-row";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { AddCategoryModal, type CategoryItem } from "@/components/categories/add-category-modal";

// ── Column definitions ────────────────────────────────────────────────────
function buildColumns(
  onDelete: (id: string, name: string) => void,
  onAddSub: (parentId: string) => void,
): ColumnDef<CategoryItem>[] {
  return [
    {
      accessorKey: "name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Category" />,
      cell: ({ row }) => (
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            {row.original.parentId
              ? <FolderTree className="h-4 w-4 text-primary/60" />
              : <Tag className="h-4 w-4 text-primary" />}
          </div>
          <div>
            <span className="text-sm font-semibold">{row.original.name}</span>
            {row.original.parentId && (
              <p className="text-[10px] text-muted-foreground">Subcategory</p>
            )}
          </div>
        </div>
      ),
    },
    {
      accessorKey: "slug",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Slug" />,
      cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">/{row.original.slug}</span>,
    },
    {
      id: "products",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Products" />,
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1.5 text-sm font-medium">
          <Package className="h-3.5 w-3.5 text-muted-foreground" />
          {row.original._count.products}
        </span>
      ),
    },
    {
      id: "subcategories",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Subcategories" />,
      cell: ({ row }) => {
        const subs = row.original.children;
        if (!subs.length) return <span className="text-xs text-muted-foreground">—</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {subs.slice(0, 3).map((s) => (
              <span key={s.id} className="px-2 py-0.5 rounded-full bg-muted text-[10px] font-medium text-muted-foreground">{s.name}</span>
            ))}
            {subs.length > 3 && (
              <span className="px-2 py-0.5 rounded-full bg-muted text-[10px] font-medium text-muted-foreground">+{subs.length - 3}</span>
            )}
          </div>
        );
      },
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
          deleteAction={{ action: () => onDelete(row.original.id, row.original.name) }}
          dropMoreActions={[
            { text: "Add Subcategory", function: () => onAddSub(row.original.id) },
          ]}
        />
      ),
    },
  ];
}

// ── Page ─────────────────────────────────────────────────────────────────
export default function CategoriesPage() {
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [modalOpen, setModalOpen]   = useState(false);
  const [subParentId, setSubParentId] = useState<string | undefined>();

  // Flatten tree for table rows (root + children shown flat)
  const flatRows = categories.flatMap((c) => [c, ...c.children]);

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<CategoryItem[]>("/categories");
      setCategories(res.data ?? []);
    } catch {
      toast.error("Failed to load categories");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Delete "${name}"? This may affect products assigned to this category.`)) return;
    try {
      await api.delete(`/categories/${id}`);
      toast.success(`"${name}" deleted`);
      fetchCategories();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Delete failed");
    }
  };

  const handleAddSub = (parentId: string) => {
    setSubParentId(parentId);
    setModalOpen(true);
  };

  const columns = buildColumns(handleDelete, handleAddSub);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Categories</h1>
          <p className="text-muted-foreground text-sm mt-1">Organize products into categories and subcategories</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchCategories} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button variant="gradient" className="gap-2" onClick={() => { setSubParentId(undefined); setModalOpen(true); }}>
            <Plus className="h-4 w-4" /> Add Category
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Total Categories</p>
          <p className="text-2xl font-bold mt-1">{categories.length}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Subcategories</p>
          <p className="text-2xl font-bold mt-1 text-primary">{categories.reduce((s, c) => s + c.children.length, 0)}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Total Products</p>
          <p className="text-2xl font-bold mt-1 text-emerald-500">{flatRows.reduce((s, c) => s + c._count.products, 0)}</p>
        </div>
      </div>

      <ClientSideTable
        data={flatRows}
        columns={columns}
        pageCount={Math.ceil(flatRows.length / 10)}
        searchableColumns={[
          { id: "name", title: "Category" },
          { id: "slug", title: "Slug" },
        ]}
      />

      <AddCategoryModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setSubParentId(undefined); }}
        onCreated={() => { fetchCategories(); setModalOpen(false); setSubParentId(undefined); }}
        categories={categories}
        parentId={subParentId}
      />
    </div>
  );
}
