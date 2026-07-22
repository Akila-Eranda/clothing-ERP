"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus, Upload, Package, FileText, TrendingUp, Archive, RefreshCw, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ColumnDef } from "@tanstack/react-table";
import { ClientSideTable, DataTableColumnHeader, TableActionsRow, OpenRecordButton } from "@/components/table";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { parseApiList } from "@/lib/parse-api-list";
import { type Product } from "@/lib/product-types";
import { useShopWorkspace } from "@/lib/use-shop-profile";
import { useReceiptSettings } from "@/lib/use-receipt-settings";
import { getRouteLabels } from "@/lib/shop-vertical";
import { APP_NAME } from "@/lib/constants";
import { resolvePublicAssetUrl } from "@/lib/upload";

const STATUS_BADGE: Record<string, "success" | "secondary" | "danger" | "warning"> = {
  ACTIVE: "success",
  DRAFT: "warning",
  INACTIVE: "secondary",
  OUT_OF_STOCK: "danger",
};

type ProductListRow = {
  rowKey: string;
  productId: string;
  productName: string;
  variantId?: string;
  variantName: string;
  sku: string;
  barcode: string;
  sellingPrice: number;
  costPrice: number;
  mrp: number;
  status: string;
  brandName?: string;
  categoryName?: string;
  isVariant: boolean;
  product: Product;
};

function flattenProducts(products: Product[]): ProductListRow[] {
  const rows: ProductListRow[] = [];
  for (const p of products) {
    const variants = (p.variants ?? []).filter((v) => v.isActive !== false);
    if (variants.length > 0) {
      for (const v of variants) {
        rows.push({
          rowKey: `${p.id}:${v.id}`,
          productId: p.id,
          productName: p.name,
          variantId: v.id,
          variantName: v.name || "Default",
          sku: v.sku || p.sku,
          barcode: v.barcode || p.barcode || p.sku,
          sellingPrice: v.sellingPrice,
          costPrice: v.costPrice,
          mrp: v.mrp,
          status: p.status,
          brandName: p.brand?.name,
          categoryName: p.category?.name,
          isVariant: true,
          product: p,
        });
      }
    } else {
      rows.push({
        rowKey: p.id,
        productId: p.id,
        productName: p.name,
        variantName: "—",
        sku: p.sku,
        barcode: p.barcode || p.sku,
        sellingPrice: p.sellingPrice,
        costPrice: p.costPrice,
        mrp: p.mrp,
        status: p.status,
        brandName: p.brand?.name,
        categoryName: p.category?.name,
        isVariant: false,
        product: p,
      });
    }
  }
  return rows;
}

function printLabels(rows: ProductListRow[], brandName: string) {
  const w = window.open("", "_blank", "width=900,height=700,scrollbars=yes");
  if (!w) { alert("Allow popups to print labels"); return; }
  const labels = rows.slice(0, 200).map((r) => ({
    name: r.productName,
    variant: r.isVariant ? r.variantName : "",
    sku: r.sku,
    barcode: r.barcode,
    price: r.sellingPrice,
  }));
  const html = labels.map((l) => `
    <div class="label">
      <div class="brand">${brandName}</div>
      <div class="pname">${l.name}</div>
      ${l.variant ? `<div class="vname">${l.variant}</div>` : ""}
      <div class="barcode-text">${l.barcode}</div>
      <div class="sku">SKU: ${l.sku}</div>
      <div class="price">LKR ${l.price.toLocaleString()}</div>
    </div>
  `).join("");
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Product Labels</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;background:#fff;padding:8mm}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:4mm}.label{border:1px solid #ccc;border-radius:4px;padding:4mm;text-align:center;page-break-inside:avoid;height:38mm;display:flex;flex-direction:column;justify-content:center;gap:1mm}.brand{font-size:7px;text-transform:uppercase;letter-spacing:1px;color:#888}.pname{font-size:10px;font-weight:900;line-height:1.2}.vname{font-size:8px;color:#555}.barcode-text{font-family:'Courier New',monospace;font-size:14px;font-weight:bold;letter-spacing:2px;border:1px solid #000;padding:2px 4px;margin:2px auto;display:inline-block}.sku{font-size:7px;color:#888}.price{font-size:11px;font-weight:900;color:#1d4ed8}@media print{@page{margin:8mm;size:A4}body{padding:0}}</style></head><body><div class="grid">${html}</div><script>window.onload=()=>{window.print();setTimeout(()=>window.close(),1000)}<\/script></body></html>`);
  w.document.close();
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
        costPrice: parseFloat(obj.costprice || obj["cost price"] || "0"),
        mrp: parseFloat(obj.mrp || "0"),
        taxRate: parseFloat(obj.taxrate || "18"),
        description: obj.description || undefined,
        tags: obj.tags ? obj.tags.split("|").filter(Boolean) : [],
        status: (obj.status?.toUpperCase() as "ACTIVE" | "DRAFT") || "DRAFT",
      });
      success++;
    } catch { failed++; }
    onProgress(i + 1, rows.length);
  }
  return { success, failed };
}

function buildColumns(
  onView: (p: Product) => void,
  onEdit: (p: Product) => void,
  onDelete: (p: Product) => void,
): ColumnDef<ProductListRow>[] {
  return [
    {
      id: "productName",
      accessorFn: (r) =>
        `${r.productName} ${r.variantName} ${r.sku} ${r.barcode} ${r.brandName ?? ""} ${r.categoryName ?? ""}`.trim(),
      size: 280,
      minSize: 200,
      maxSize: 360,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Product" />,
      cell: ({ row }) => {
        const img = row.original.product.images?.[0];
        const src = img ? resolvePublicAssetUrl(img) : "";
        return (
          <div className="flex min-w-0 max-w-[280px] items-center gap-3">
            <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-muted flex items-center justify-center">
              {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <Package className="h-4 w-4 text-muted-foreground/40" />
              )}
            </div>
            <div className="min-w-0 flex-1 overflow-hidden">
              <OpenRecordButton
                onClick={() => onView(row.original.product)}
                title={row.original.productName}
                className="block w-full truncate text-sm font-medium"
              >
                {row.original.productName}
              </OpenRecordButton>
              <p className="truncate text-xs text-muted-foreground" title={row.original.brandName}>
                {row.original.brandName ?? "—"}
              </p>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "variantName",
      size: 110,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Variant" />,
      cell: ({ row }) => (
        <div className="whitespace-nowrap">
          {row.original.isVariant ? (
            <Badge variant="secondary" className="h-6 rounded-full px-2.5 text-[11px] font-semibold inline-flex items-center">
              {row.original.variantName}
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "sku",
      size: 130,
      header: ({ column }) => <DataTableColumnHeader column={column} title="SKU" />,
      cell: ({ row }) => (
        <span className="block max-w-[140px] truncate font-mono text-xs text-muted-foreground" title={row.original.sku}>
          {row.original.sku}
        </span>
      ),
    },
    {
      accessorKey: "barcode",
      size: 140,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Barcode" />,
      cell: ({ row }) => (
        <span className="block max-w-[150px] truncate font-mono text-xs text-muted-foreground" title={row.original.barcode}>
          {row.original.barcode || "—"}
        </span>
      ),
    },
    {
      id: "category",
      size: 130,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Category" />,
      cell: ({ row }) => (
        <Badge
          variant="secondary"
          className="h-6 max-w-[140px] truncate rounded-full px-2.5 text-[11px] font-semibold inline-flex items-center"
          title={row.original.categoryName}
        >
          {row.original.categoryName ?? "—"}
        </Badge>
      ),
    },
    {
      accessorKey: "sellingPrice",
      size: 110,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Selling" />,
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm font-semibold text-blue-600">
          LKR {row.original.sellingPrice.toFixed(2)}
        </span>
      ),
    },
    {
      accessorKey: "status",
      size: 100,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => (
        <Badge variant={STATUS_BADGE[row.original.status] ?? "secondary"} className="h-6 rounded-full px-2.5 text-[11px] font-semibold inline-flex items-center">
          {row.original.status.replace("_", " ")}
        </Badge>
      ),
    },
    {
      id: "actions",
      size: 56,
      cell: ({ row }) => (
        <TableActionsRow
          showAction={{ action: () => onView(row.original.product) }}
          editAction={{ action: () => onEdit(row.original.product) }}
          deleteAction={{ action: () => onDelete(row.original.product) }}
        />
      ),
    },
  ];
}

export default function ProductsPage() {
  const router = useRouter();
  const { profile, workspace } = useShopWorkspace();
  const { settings: receiptSettings } = useReceiptSettings();
  const routeLabels = getRouteLabels(workspace, profile);
  const printLabel = routeLabels.printTags ?? "Print Tags";
  const brandName = receiptSettings.shopName || APP_NAME;
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: Product[] }>("/products?limit=10000");
      setProducts(parseApiList<Product>(res.data));
    } catch { toast.error("Failed to load products"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const listRows = useMemo(() => flattenProducts(products), [products]);

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

  const total = products.length;
  const active = products.filter((p) => p.status === "ACTIVE").length;
  const drafts = products.filter((p) => p.status === "DRAFT").length;
  const inactive = products.filter((p) => p.status === "INACTIVE" || p.status === "OUT_OF_STOCK").length;

  const STATS = [
    { label: `Total ${workspace.productLabel}`, value: total, icon: Package, color: "text-blue-600", bg: "bg-blue-500/15", tint: "border-blue-200/70 bg-gradient-to-br from-blue-50 to-white dark:border-blue-500/20 dark:from-blue-500/10 dark:to-transparent" },
    { label: "Active", value: active, icon: TrendingUp, color: "text-emerald-600", bg: "bg-emerald-500/15", tint: "border-emerald-200/70 bg-gradient-to-br from-emerald-50 to-white dark:border-emerald-500/20 dark:from-emerald-500/10 dark:to-transparent" },
    { label: "Drafts", value: drafts, icon: FileText, color: "text-amber-600", bg: "bg-amber-500/15", tint: "border-amber-200/70 bg-gradient-to-br from-amber-50 to-white dark:border-amber-500/20 dark:from-amber-500/10 dark:to-transparent" },
    { label: "Inactive / OOS", value: inactive, icon: Archive, color: "text-rose-600", bg: "bg-rose-500/15", tint: "border-rose-200/70 bg-gradient-to-br from-rose-50 to-white dark:border-rose-500/20 dark:from-rose-500/10 dark:to-transparent" },
  ];

  const columns = buildColumns(
    (p) => router.push(`/products/${p.id}`),
    (p) => router.push(`/products/${p.id}/edit`),
    handleDelete,
  );

  return (
    <div className="page-shell">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="min-w-0">
          <h1 className="text-[26px] md:text-3xl font-bold tracking-tight leading-tight">{workspace.productLabel}</h1>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            Each variant shows as its own row · same product barcode · separate selling prices
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <Button variant="outline" onClick={() => fetch()} className="gap-1.5">
            <RefreshCw className={`h-[18px] w-[18px] ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="outline" onClick={() => printLabels(listRows, brandName)} className="gap-1.5" disabled={!listRows.length}>
            <Tag className="h-[18px] w-[18px]" />
            {printLabel}
          </Button>
          <Button variant="outline" onClick={() => importRef.current?.click()} disabled={importing} className="gap-1.5">
            <Upload className="h-[18px] w-[18px]" />
            Import CSV
          </Button>
          <input ref={importRef} type="file" accept=".csv" className="hidden" onChange={handleImport} />
          <div className="hidden sm:block h-6 w-px bg-slate-200 dark:bg-white/10 mx-0.5" aria-hidden />
          <Button onClick={() => router.push("/products/new")} className="gap-1.5">
            <Plus className="h-[18px] w-[18px]" />
            Add New
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
                <p className="text-[22px] font-bold leading-none tabular-nums">{s.value}</p>
                <p className="text-[11px] text-muted-foreground font-medium mt-1 truncate">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <ClientSideTable
          data={listRows}
          columns={columns}
          searchableColumns={[
            { id: "productName", title: "Product / SKU / barcode" },
          ]}
          filterableColumns={[
            {
              id: "status",
              title: "Status",
              options: [
                { value: "ACTIVE", label: "Active" },
                { value: "DRAFT", label: "Draft" },
                { value: "INACTIVE", label: "Inactive" },
              ],
            },
          ]}
          isShowExportButtons={{ isShow: true, fileName: "products-variants" }}
        />
    </div>
  );
}
