"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Star, Plus, Package, Upload, Download, RefreshCw, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ColumnDef } from "@tanstack/react-table";
import { ClientSideTable } from "@/components/table/client-side-table";
import { DataTableColumnHeader } from "@/components/table/data-table-column-header";
import { TableActionsRow } from "@/components/table/table-actions-row";
import { OpenRecordButton } from "@/components/table/open-record-button";
import { ModuleGate } from "@/components/shop/module-gate";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useShopWorkspace } from "@/lib/use-shop-profile";
import { getBrandPageCopy, type BrandPageCopy } from "@/lib/shop-vertical";
import { AddBrandModal, type BrandItem } from "@/components/brands/add-brand-modal";

// ── CSV helpers ───────────────────────────────────────────────────────────
function exportToCsv(brands: BrandItem[], fileName: string) {
  const headers = ["name", "description", "logo", "isActive", "products"];
  const rows = brands.map((b) => [
    `"${b.name.replace(/"/g, '""')}"`,
    `"${(b.description ?? "").replace(/"/g, '""')}"`,
    `"${b.logo ?? ""}"`,
    b.isActive,
    b._count.products,
  ].join(","));
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = `${fileName}.csv`; a.click();
  URL.revokeObjectURL(url);
}

async function parseCsvAndImport(file: File, onProgress: (d: number, t: number) => void) {
  const text    = await file.text();
  const lines   = text.trim().split("\n");
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const rows    = lines.slice(1);
  let success = 0, failed = 0;
  for (let i = 0; i < rows.length; i++) {
    const cols = rows[i].split(",");
    const obj: Record<string, string> = {};
    headers.forEach((h, j) => { obj[h] = (cols[j] ?? "").replace(/^"|"$/g, "").trim(); });
    try {
      await api.post("/brands", { name: obj.name, description: obj.description || undefined, logo: obj.logo || undefined });
      success++;
    } catch { failed++; }
    onProgress(i + 1, rows.length);
  }
  return { success, failed };
}

// ── Column builder ────────────────────────────────────────────────────────
function buildColumns(
  copy: BrandPageCopy,
  productLabel: string,
  onEdit:   (b: BrandItem) => void,
  onDelete: (b: BrandItem) => void,
): ColumnDef<BrandItem>[] {
  return [
    {
      accessorKey: "name",
      header: ({ column }) => <DataTableColumnHeader column={column} title={copy.singular} />,
      cell: ({ row }) => {
        const b = row.original;
        return (
          <div className="flex items-center gap-2.5">
            {b.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={b.logo} alt={b.name} className="h-8 w-8 rounded-lg object-contain border bg-muted/30 shrink-0"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            ) : (
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center shrink-0">
                <span className="text-sm font-black text-primary">{b.name[0]}</span>
              </div>
            )}
            <div>
              <OpenRecordButton onClick={() => onEdit(b)} className="text-sm" title="Edit brand">
                {b.name}
              </OpenRecordButton>
              <p className="text-[10px] text-muted-foreground font-mono">/{b.slug}</p>
            </div>
          </div>
        );
      },
    },
    {
      id: "products",
      header: ({ column }) => <DataTableColumnHeader column={column} title={productLabel} />,
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1.5 text-sm font-medium">
          <Package className="h-3.5 w-3.5 text-muted-foreground" />
          {row.original._count.products}
        </span>
      ),
    },
    {
      accessorKey: "description",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Description" />,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground line-clamp-1 max-w-[200px]">
          {row.original.description ?? "—"}
        </span>
      ),
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
          editAction={  { action: () => onEdit(row.original) }}
          deleteAction={ { action: () => onDelete(row.original) }}
        />
      ),
    },
  ];
}

// ── Page ─────────────────────────────────────────────────────────────────
export default function BrandsPage() {
  const { profile, workspace } = useShopWorkspace();
  const copy = useMemo(() => getBrandPageCopy(profile, workspace), [profile, workspace]);

  const [brands, setBrands]       = useState<BrandItem[]>([]);
  const [loading, setLoading]     = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editBrand, setEditBrand] = useState<BrandItem | undefined>();
  const [importing, setImporting] = useState(false);
  const importRef                 = useRef<HTMLInputElement>(null);

  const fetchBrands = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<BrandItem[]>("/brands");
      setBrands(res.data ?? []);
    } catch { toast.error(`Failed to load ${copy.plural.toLowerCase()}`); }
    finally { setLoading(false); }
  }, [copy.plural]);

  useEffect(() => { fetchBrands(); }, [fetchBrands]);

  const handleDelete = async (b: BrandItem) => {
    if (!window.confirm(copy.deleteConfirm(b.name, workspace.productLabel))) return;
    try {
      await api.delete(`/brands/${b.id}`);
      toast.success(`"${b.name}" deleted`);
      fetchBrands();
    } catch (e: unknown) { toast.error((e as Error).message ?? "Delete failed"); }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    e.target.value = "";
    setImporting(true);
    const tid = toast.loading(`Importing ${copy.plural.toLowerCase()}…`);
    try {
      const { success, failed } = await parseCsvAndImport(file, (done, total) => {
        toast.loading(`Importing… ${done}/${total}`, { id: tid });
      });
      toast.success(`Import complete: ${success} added, ${failed} failed`, { id: tid });
      fetchBrands();
    } catch { toast.error("Import failed", { id: tid }); }
    finally { setImporting(false); }
  };

  const activeCount   = brands.filter((b) => b.isActive).length;
  const inactiveCount = brands.length - activeCount;
  const totalProducts = brands.reduce((s, b) => s + b._count.products, 0);

  const columns = buildColumns(
    copy,
    workspace.productLabel,
    (b) => { setEditBrand(b); setModalOpen(true); },
    handleDelete,
  );

  return (
    <ModuleGate module="brands">
      <div className="space-y-6 p-6 w-full">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <span>{profile.emoji}</span> {copy.pageTitle}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">{copy.subtitle}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={fetchBrands} className="gap-1.5">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportToCsv(brands, copy.csvFileName)} disabled={!brands.length} className="gap-1.5">
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => importRef.current?.click()} disabled={importing} className="gap-1.5">
              <Upload className="h-3.5 w-3.5" /> Import CSV
            </Button>
            <input ref={importRef} type="file" accept=".csv" className="hidden" onChange={handleImport} />
            <Button variant="gradient" className="gap-2" onClick={() => { setEditBrand(undefined); setModalOpen(true); }}>
              <Plus className="h-4 w-4" /> {copy.addButton}
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">Total {copy.plural}</p>
            <p className="text-2xl font-bold mt-1">{brands.length}</p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">Active</p>
            <p className="text-2xl font-bold mt-1 text-emerald-500">{activeCount}</p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">Inactive</p>
            <p className="text-2xl font-bold mt-1 text-muted-foreground">{inactiveCount}</p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">Total {workspace.productLabel}</p>
            <p className="text-2xl font-bold mt-1 text-primary">{totalProducts}</p>
          </div>
        </div>

        {/* Table */}
        <ClientSideTable
          data={brands}
          columns={columns}
          pageCount={Math.ceil(brands.length / 10)}
          searchableColumns={[
            { id: "name", title: copy.singular },
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
          ]}
          isShowExportButtons={{ isShow: true, fileName: copy.csvFileName }}
        />

        {/* Tips */}
        <div className="grid md:grid-cols-3 gap-3">
          {copy.tips.map((tip) => (
            <Card key={tip} className="border-dashed">
              <CardContent className="p-4 flex gap-3 items-start">
                <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                  <Lightbulb className="h-4 w-4 text-amber-500" />
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{tip}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <AddBrandModal
          open={modalOpen}
          onClose={() => { setModalOpen(false); setEditBrand(undefined); }}
          onSaved={() => { fetchBrands(); setModalOpen(false); setEditBrand(undefined); }}
          editBrand={editBrand}
          copy={copy}
        />
      </div>
    </ModuleGate>
  );
}
