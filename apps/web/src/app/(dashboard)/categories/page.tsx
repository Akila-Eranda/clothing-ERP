"use client";

import { useState, useEffect, useCallback } from "react";
import { Tag, Plus, Package, RefreshCw } from "lucide-react";
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
        <Badge variant={row.original.isActive ? "success" : "secondary"} className="h-6 rounded-full px-2.5 text-[11px] font-semibold inline-flex items-center">
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

  // Only root categories in the table; subcategories shown as chips inside each row
  const flatRows = categories;

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
    <div className="p-4 md:p-5 space-y-4 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="min-w-0">
          <h1 className="text-[26px] md:text-3xl font-bold tracking-tight leading-tight">Categories</h1>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">Organize products into categories and subcategories</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <Button variant="outline" onClick={fetchCategories} className="h-10 rounded-[12px] gap-1.5 text-sm">
            <RefreshCw className={`h-[18px] w-[18px] ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button variant="gradient" className="h-10 rounded-[12px] gap-1.5 text-sm" onClick={() => { setSubParentId(undefined); setModalOpen(true); }}>
            <Plus className="h-[18px] w-[18px]" /> Add Category
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-[18px] border bg-card h-[68px] p-4 flex flex-col justify-center shadow-[0_2px_10px_rgba(15,23,42,0.04)] hover:-translate-y-0.5 hover:shadow-[0_4px_14px_rgba(15,23,42,0.07)] transition-all duration-150 border-slate-200/70 bg-gradient-to-br from-slate-50 to-white dark:border-slate-500/20 dark:from-slate-500/10 dark:to-transparent">
          <p className="text-[22px] font-bold leading-none tabular-nums">{categories.length}</p>
          <p className="text-[11px] text-muted-foreground font-medium mt-1 truncate">Total Categories</p>
        </div>
        <div className="rounded-[18px] border bg-card h-[68px] p-4 flex flex-col justify-center shadow-[0_2px_10px_rgba(15,23,42,0.04)] hover:-translate-y-0.5 hover:shadow-[0_4px_14px_rgba(15,23,42,0.07)] transition-all duration-150 border-blue-200/70 bg-gradient-to-br from-blue-50 to-white dark:border-blue-500/20 dark:from-blue-500/10 dark:to-transparent">
          <p className="text-[22px] font-bold leading-none tabular-nums text-primary">{categories.reduce((s, c) => s + c.children.length, 0)}</p>
          <p className="text-[11px] text-muted-foreground font-medium mt-1 truncate">Subcategories</p>
        </div>
        <div className="rounded-[18px] border bg-card h-[68px] p-4 flex flex-col justify-center shadow-[0_2px_10px_rgba(15,23,42,0.04)] hover:-translate-y-0.5 hover:shadow-[0_4px_14px_rgba(15,23,42,0.07)] transition-all duration-150 border-emerald-200/70 bg-gradient-to-br from-emerald-50 to-white dark:border-emerald-500/20 dark:from-emerald-500/10 dark:to-transparent">
          <p className="text-[22px] font-bold leading-none tabular-nums text-emerald-600">{flatRows.reduce((s, c) => s + c._count.products, 0)}</p>
          <p className="text-[11px] text-muted-foreground font-medium mt-1 truncate">Total Products</p>
        </div>
      </div>

      <div className="overflow-y-auto" style={{ height: "calc(100vh - 240px)" }}>
        <ClientSideTable
          data={flatRows}
          columns={columns}
          pageCount={Math.ceil(flatRows.length / 10)}
          searchableColumns={[
            { id: "name", title: "Category" },
            { id: "slug", title: "Slug" },
          ]}
        />
      </div>

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
