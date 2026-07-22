"use client";

import { useState, useEffect, useCallback } from "react";
import { Tag, Plus, Package, RefreshCw, FolderTree, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ColumnDef } from "@tanstack/react-table";
import { ClientSideTable, DataTableColumnHeader, TableActionsRow } from "@/components/table";
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
      id: "name",
      accessorFn: (c) => `${c.name} ${c.slug ?? ""}`.trim(),
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
  const subCount = categories.reduce((s, c) => s + c.children.length, 0);
  const productCount = flatRows.reduce((s, c) => s + c._count.products, 0);
  const STATS = [
    { label: "Categories", value: categories.length, icon: Tag, color: "text-slate-600 dark:text-slate-300", bg: "bg-slate-500/15", tint: "border-slate-200/70 bg-gradient-to-br from-slate-50 to-white dark:border-slate-500/20 dark:from-slate-500/10 dark:to-transparent" },
    { label: "Subcategories", value: subCount, icon: FolderTree, color: "text-blue-600", bg: "bg-blue-500/15", tint: "border-blue-200/70 bg-gradient-to-br from-blue-50 to-white dark:border-blue-500/20 dark:from-blue-500/10 dark:to-transparent" },
    { label: "Products", value: productCount, icon: Package, color: "text-emerald-600", bg: "bg-emerald-500/15", tint: "border-emerald-200/70 bg-gradient-to-br from-emerald-50 to-white dark:border-emerald-500/20 dark:from-emerald-500/10 dark:to-transparent" },
    { label: "Active roots", value: categories.filter((c) => c.isActive).length, icon: Layers, color: "text-violet-600", bg: "bg-violet-500/15", tint: "border-violet-200/70 bg-gradient-to-br from-violet-50 to-white dark:border-violet-500/20 dark:from-violet-500/10 dark:to-transparent" },
  ];

  return (
    <div className="page-shell">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="min-w-0">
          <h1 className="text-[26px] md:text-3xl font-bold tracking-tight leading-tight">Categories</h1>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">Organize products into categories and subcategories</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <Button variant="outline" onClick={() => void fetchCategories()} className="gap-1.5">
            <RefreshCw className={`h-[18px] w-[18px] ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <div className="hidden sm:block h-6 w-px bg-slate-200 dark:bg-white/10 mx-0.5" aria-hidden />
          <Button className="gap-1.5" onClick={() => { setSubParentId(undefined); setModalOpen(true); }}>
            <Plus className="h-[18px] w-[18px]" /> Add Category
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {STATS.map((s) => (
          <Card
            key={s.label}
            className={`rounded-[18px] shadow-[0_2px_10px_rgba(15,23,42,0.04)] hover:-translate-y-0.5 hover:shadow-[0_4px_14px_rgba(15,23,42,0.07)] transition-all duration-150 ${s.tint}`}
          >
            <CardContent className="h-[68px] p-4 flex items-center gap-3">
              <div className={`h-9 w-9 rounded-[12px] flex items-center justify-center shrink-0 ${s.bg}`}>
                <s.icon className={`h-[18px] w-[18px] ${s.color}`} strokeWidth={1.75} />
              </div>
              <div className="min-w-0">
                <p className="text-[22px] font-bold leading-none tabular-nums truncate">{s.value}</p>
                <p className="text-[11px] text-muted-foreground font-medium mt-1 truncate">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <ClientSideTable
          data={flatRows}
          columns={columns}
          searchableColumns={[
            { id: "name", title: "Category / slug" },
          ]}
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
          isShowExportButtons={{ isShow: true, fileName: "categories-export" }}
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
