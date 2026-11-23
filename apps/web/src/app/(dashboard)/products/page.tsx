"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { PlusCircle, Upload, Package, FileText, TrendingUp, Archive, RefreshCw, Tag, Download, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TableStatusBadge, TableValueBadge } from "@/components/ui/table-status-badge";
import { PageKpiGrid } from "@/components/ui/page-kpi";
import { ColumnDef } from "@tanstack/react-table";
import { ClientSideTable, DataTableColumnHeader, TableActionsRow, OpenRecordButton } from "@/components/table";
import { toast } from "sonner";
import { HEX_BTN } from "@/lib/app-button-classes";
import { api, tokenStorage } from "@/lib/api";
import { permissionsFromToken } from "@/lib/bank-account";
import { parseApiList } from "@/lib/parse-api-list";
import { type Product } from "@/lib/product-types";
import { useShopWorkspace } from "@/lib/use-shop-profile";
import { useReceiptSettings } from "@/lib/use-receipt-settings";
import { getRouteLabels } from "@/lib/shop-vertical";
import { APP_NAME } from "@/lib/constants";
import { resolvePublicAssetUrl } from "@/lib/upload";
import { buildProductCsvTemplate, canImportProducts, PRODUCT_CSV_HEADERS } from "@/lib/product-csv";
import { downloadFile } from "@/lib/upload";
import { ProductImportDialog } from "@/components/products/product-import-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

function ProductListThumb({ src }: { src: string }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [src]);
  if (!src || broken) {
    return <Package className="h-4 w-4 text-muted-foreground/40" />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className="h-full w-full object-cover"
      loading="lazy"
      onError={() => setBroken(true)}
    />
  );
}

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

function downloadCsv(fileName: string, csv: string, opts: { bom?: boolean } = {}) {
  // Optional BOM so Excel opens UTF-8 (Sinhala / Tamil names) correctly
  const blob = new Blob([opts.bom ? "﻿" + csv : csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
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
              <ProductListThumb src={src} />
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
            <TableValueBadge label={row.original.variantName} />
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
        row.original.categoryName ? (
          <TableValueBadge label={row.original.categoryName} className="max-w-[140px] truncate" />
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )
      ),
    },
    {
      accessorKey: "sellingPrice",
      size: 110,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Selling" />,
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm font-semibold text-primary">
          LKR {row.original.sellingPrice.toFixed(2)}
        </span>
      ),
    },
    {
      accessorKey: "status",
      size: 100,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => <TableStatusBadge status={row.original.status} />,
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
  const [importFile, setImportFile] = useState<File | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  // Import menu only for users the API will accept (products:create + products:update). Read after mount
  // (the token lives in localStorage) so server and first client render match.
  const [canImport, setCanImport] = useState(false);
  useEffect(() => { setCanImport(canImportProducts(permissionsFromToken(tokenStorage.getAccess()))); }, []);

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

  // Excel / CSV import: the file is checked on the server and shown in a preview before anything is saved.
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) setImportFile(file);
  };

  const downloadExcelTemplate = async () => {
    try {
      await downloadFile("/products/import/template.xlsx", "product-import-template.xlsx");
    } catch (err: unknown) {
      toast.error((err as Error).message || "Could not download the Excel template");
    }
  };

  const total = products.length;
  const active = products.filter((p) => p.status === "ACTIVE").length;
  const drafts = products.filter((p) => p.status === "DRAFT").length;
  const inactive = products.filter((p) => p.status === "INACTIVE" || p.status === "OUT_OF_STOCK").length;

  const STATS = [
    { label: `Total ${workspace.productLabel}`, value: total, icon: Package, color: "text-primary-text", bg: "bg-primary/15", tint: "bg-card border-border" },
    { label: "Active", value: active, icon: TrendingUp, color: "text-success-text", bg: "bg-success/10", tint: "bg-card border-border" },
    { label: "Drafts", value: drafts, icon: FileText, color: "text-warning-text", bg: "bg-warning/10", tint: "bg-card border-border" },
    { label: "Inactive / OOS", value: inactive, icon: Archive, color: "text-destructive-text", bg: "bg-destructive/15", tint: "bg-card border-border" },
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
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <Button variant="outline" onClick={() => fetch()} className="gap-1.5">
            <RefreshCw className={`h-[18px] w-[18px] ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="outline" onClick={() => printLabels(listRows, brandName)} className="gap-1.5" disabled={!listRows.length}>
            <Tag className="h-[18px] w-[18px]" />
            {printLabel}
          </Button>
          {canImport && (<>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={!!importFile} className="gap-1.5">
                <Upload className="h-[18px] w-[18px]" />
                Import CSV / Excel
                <ChevronDown className="h-4 w-4 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuItem onClick={() => importRef.current?.click()}>
                <Upload className="h-3.5 w-3.5 mr-2" /> Upload Excel or CSV file
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => downloadCsv("products-import-template.csv", buildProductCsvTemplate())}>
                <Download className="h-3.5 w-3.5 mr-2" /> Download template
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void downloadExcelTemplate()}>
                <Download className="h-3.5 w-3.5 mr-2" /> Download Excel template
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[11px] font-normal leading-snug text-muted-foreground">
                CSV import format: <span className="font-mono">{PRODUCT_CSV_HEADERS.join(", ")}</span>
                {" "}— tags separated by <span className="font-mono">|</span>, status: ACTIVE or DRAFT.
                {" "}Optional: sku, barcode, category, brand, unit, openingStock, reorderLevel. Every row is checked and shown before import.
              </DropdownMenuLabel>
            </DropdownMenuContent>
          </DropdownMenu>
          <input ref={importRef} type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={handleImport} aria-label="Product import file" />
          <ProductImportDialog file={importFile} onClose={() => setImportFile(null)} onImported={() => void fetch()} />
          </>)}
          <div className="hidden sm:block h-6 w-px bg-slate-200 dark:bg-white/10 mx-0.5" aria-hidden />
          <Button onClick={() => router.push("/products/new")} className={HEX_BTN}>
            <PlusCircle className="h-[18px] w-[18px]" />
            Add New
          </Button>
        </div>
      </div>

      <PageKpiGrid items={STATS} />

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
