"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus, Upload, Download, Package, FileText, TrendingUp, Archive, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ColumnDef } from "@tanstack/react-table";
import { ClientSideTable } from "@/components/table/client-side-table";
import { DataTableColumnHeader } from "@/components/table/data-table-column-header";
import { TableActionsRow } from "@/components/table/table-actions-row";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { AddProductModal, type Product } from "@/components/products/add-product-modal";
import { ViewProductModal } from "@/components/products/view-product-modal";

// ── Status helpers ────────────────────────────────────────────────────────
const STATUS_BADGE: Record<string, "success" | "secondary" | "danger" | "warning"> = {
  ACTIVE:        "success",
  DRAFT:         "warning",
  INACTIVE:      "secondary",
  OUT_OF_STOCK:  "danger",
};

// ── CSV helpers ───────────────────────────────────────────────────────────
const CSV_HEADERS = ["name", "sellingPrice", "costPrice", "mrp", "taxRate", "description", "tags", "status"];

function exportToCsv(products: Product[]) {
  const rows = products.map((p) => [
    `"${p.name.replace(/"/g, '""')}"`,
    p.sellingPrice, p.costPrice, p.mrp, p.taxRate,
    `"${(p.description ?? "").replace(/"/g, '""')}"`,
    `"${p.tags.join("|")}"`,
    p.status,
  ].join(","));
  const csv = [CSV_HEADERS.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = "products-export.csv"; a.click();
  URL.revokeObjectURL(url);
}

async function parseCsvAndImport(
  file: File,
  onProgress: (done: number, total: number) => void,
): Promise<{ success: number; failed: number }> {
  const text = await file.text();
  const lines = text.trim().split("\n");
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const rows = lines.slice(1);
  let success = 0, failed = 0;
  for (let i = 0; i < rows.length; i++) {
    const cols = rows[i].split(",");
    const obj: Record<string, string> = {};
    headers.forEach((h, j) => { obj[h] = (cols[j] ?? "").replace(/^"|"$/g, "").trim(); });
    try {
      await api.post("/products", {
        name: obj.name,
        sellingPrice: parseFloat(obj.sellingprice || obj["selling price"] || "0"),
        costPrice:    parseFloat(obj.costprice    || obj["cost price"]    || "0"),
        mrp:          parseFloat(obj.mrp          || "0"),
        taxRate:      parseFloat(obj.taxrate      || "18"),
        description:  obj.description || undefined,
        tags:         obj.tags ? obj.tags.split("|").filter(Boolean) : [],
        status:       (obj.status?.toUpperCase() as "ACTIVE" | "DRAFT") || "DRAFT",
      });
      success++;
    } catch { failed++; }
    onProgress(i + 1, rows.length);
  }
  return { success, failed };
}

// ── Column builder ────────────────────────────────────────────────────────
function buildColumns(
  onView:   (p: Product) => void,
  onEdit:   (p: Product) => void,
  onDelete: (p: Product) => void,
): ColumnDef<Product>[] {
  return [
    {
      accessorKey: "name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Product" />,
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
            <Package className="h-4 w-4 text-muted-foreground/40" />
          </div>
          <div>
            <p className="text-sm font-medium">{row.original.name}</p>
            <p className="text-xs text-muted-foreground">{row.original.brand?.name ?? "—"}</p>
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
      id: "category",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Category" />,
      cell: ({ row }) => (
        <Badge variant="secondary" className="text-[10px]">{row.original.category?.name ?? "—"}</Badge>
      ),
    },
    {
      accessorKey: "sellingPrice",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Price" />,
      cell: ({ row }) => <span className="text-sm font-semibold">₹{row.original.sellingPrice.toFixed(2)}</span>,
    },
    {
      id: "variants",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Variants" />,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original._count.variants}</span>
      ),
    },
    {
      accessorKey: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => (
        <Badge variant={STATUS_BADGE[row.original.status] ?? "secondary"} className="text-[10px]">
          {row.original.status.replace("_", " ")}
        </Badge>
      ),
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <TableActionsRow
          showAction={  { action: () => onView(row.original) }}
          editAction={  { action: () => onEdit(row.original) }}
          deleteAction={ { action: () => onDelete(row.original) }}
        />
      ),
    },
  ];
}

// ── Page ─────────────────────────────────────────────────────────────────
export default function ProductsPage() {
  const router = useRouter();
  const [products, setProducts]     = useState<Product[]>([]);
  const [loading, setLoading]       = useState(true);
  const [addOpen, setAddOpen]       = useState(false);
  const [viewProduct, setViewProduct] = useState<Product | null>(null);
  const [editProduct, setEditProduct] = useState<Product | undefined>();
  const [importing, setImporting]   = useState(false);
  const importRef                   = useRef<HTMLInputElement>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: Product[] }>("/products?limit=500");
      setProducts(res.data?.data ?? (res.data as unknown as Product[]) ?? []);
    } catch { toast.error("Failed to load products"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const handleDelete = async (p: Product) => {
    if (!window.confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/products/${p.id}`);
      toast.success(`"${p.name}" deleted`);
      fetch();
    } catch (e: unknown) { toast.error((e as Error).message ?? "Delete failed"); }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    e.target.value = "";
    setImporting(true);
    const tid = toast.loading("Importing products…");
    try {
      const { success, failed } = await parseCsvAndImport(file, (done, total) => {
        toast.loading(`Importing… ${done}/${total}`, { id: tid });
      });
      toast.success(`Import complete: ${success} added, ${failed} failed`, { id: tid });
      fetch();
    } catch { toast.error("Import failed", { id: tid }); }
    finally { setImporting(false); }
  };

  // Stats
  const total    = products.length;
  const active   = products.filter((p) => p.status === "ACTIVE").length;
  const drafts   = products.filter((p) => p.status === "DRAFT").length;
  const inactive = products.filter((p) => p.status === "INACTIVE" || p.status === "OUT_OF_STOCK").length;

  const STATS = [
    { label: "Total Products",   value: total,    icon: Package,   color: "text-blue-500",    bg: "bg-blue-500/10" },
    { label: "Active",           value: active,   icon: TrendingUp,color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { label: "Drafts",           value: drafts,   icon: FileText,  color: "text-amber-500",   bg: "bg-amber-500/10" },
    { label: "Inactive / OOS",   value: inactive, icon: Archive,   color: "text-rose-500",    bg: "bg-rose-500/10" },
  ];

  const columns = buildColumns(
    (p) => router.push(`/products/${p.id}`),
    (p) => { setEditProduct(p); setAddOpen(true); },
    handleDelete,
  );

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Products</h1>
          <p className="text-sm text-muted-foreground">Manage your product catalog and variants</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => fetch()} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportToCsv(products)} className="gap-1.5" disabled={!products.length}>
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => importRef.current?.click()} disabled={importing} className="gap-1.5">
            <Upload className="h-3.5 w-3.5" /> Import CSV
          </Button>
          <input ref={importRef} type="file" accept=".csv" className="hidden" onChange={handleImport} />
          <Button size="sm" className="gap-1.5" onClick={() => router.push("/products/new")}>
            <Plus className="h-3.5 w-3.5" /> Add Product
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

      {/* Table */}
      <ClientSideTable
        data={products}
        columns={columns}
        pageCount={Math.ceil(products.length / 10)}
        searchableColumns={[
          { id: "name", title: "Product" },
          { id: "sku",  title: "SKU" },
        ]}
        filterableColumns={[
          {
            id: "status",
            title: "Status",
            options: [
              { label: "Active",       value: "ACTIVE" },
              { label: "Draft",        value: "DRAFT" },
              { label: "Inactive",     value: "INACTIVE" },
              { label: "Out of Stock", value: "OUT_OF_STOCK" },
            ],
          },
        ]}
        isShowExportButtons={{ isShow: true, fileName: "products-export" }}
      />

      {/* Import CSV template hint */}
      <p className="text-[11px] text-muted-foreground">
        CSV import format: <span className="font-mono">{CSV_HEADERS.join(", ")}</span>
        {" "}— tags separated by <span className="font-mono">|</span>, status: ACTIVE or DRAFT
      </p>

      {/* Modals */}
      <AddProductModal
        open={addOpen}
        onClose={() => { setAddOpen(false); setEditProduct(undefined); }}
        onCreated={() => { setAddOpen(false); setEditProduct(undefined); fetch(); }}
        editProduct={editProduct}
      />
      <ViewProductModal
        product={viewProduct}
        onClose={() => setViewProduct(null)}
        onEdit={(p) => { setViewProduct(null); setEditProduct(p); setAddOpen(true); }}
      />
    </div>
  );
}
