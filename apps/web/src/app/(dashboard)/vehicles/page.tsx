"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Car, Plus, Search, Loader2, RefreshCw, Link2, Trash2,
  Building2, Cog, Package, Hash, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ColumnDef } from "@tanstack/react-table";
import { ClientSideTable, DataTableColumnHeader } from "@/components/table";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/utils";

interface VehicleBrand { id: string; name: string; _count?: { models: number } }
interface VehicleModel {
  id: string; name: string; yearFrom?: number | null; yearTo?: number | null;
  engineCapacity?: string | null; brand: { id: string; name: string };
  _count?: { compatibilities: number };
}
interface CompatiblePart {
  compatibilityId: string; notes?: string | null; vehicle: string;
  variant: { id: string; sku: string; name: string; sellingPrice: number };
  product: { id: string; name: string; oemNumber?: string | null };
}
interface VariantOpt { variantId: string; productName: string; variantName: string; sku: string; sellingPrice: number }

type TabKey = "lookup" | "catalog" | "mapping";

const GUIDE = [
  { title: "Part Lookup", desc: "Search by brand, model, year, VIN or part name to find compatible spare parts instantly." },
  { title: "Vehicle Catalog", desc: "Register vehicle brands and models with year range and engine capacity." },
  { title: "Compatibility Map", desc: "Link each part (variant) to the vehicles it fits — e.g. Oil Filter → Toyota Axio 2015." },
  { title: "VIN / Chassis", desc: "Enter a customer VIN to auto-resolve their vehicle and show matching parts." },
];

function yearRange(m: VehicleModel) {
  const from = m.yearFrom ?? "—";
  const to = m.yearTo ?? "—";
  return `${from}–${to}`;
}

function buildBrandColumns(): ColumnDef<VehicleBrand>[] {
  return [
    {
      accessorKey: "name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Brand" />,
      cell: ({ row }) => (
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
            <Building2 className="h-4 w-4 text-blue-500" />
          </div>
          <p className="text-sm font-semibold">{row.original.name}</p>
        </div>
      ),
    },
    {
      id: "models",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Models" />,
      cell: ({ row }) => (
        <span className="text-sm font-bold">{row.original._count?.models ?? 0}</span>
      ),
    },
  ];
}

function buildModelColumns(): ColumnDef<VehicleModel>[] {
  return [
    {
      id: "vehicle",
      accessorFn: (m) => `${m.brand.name} ${m.name} ${m.engineCapacity ?? ""}`.trim(),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Vehicle" />,
      cell: ({ row }) => {
        const m = row.original;
        return (
          <div className="flex items-center gap-2.5 min-w-[160px]">
            <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
              <Car className="h-4 w-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-semibold">{m.brand.name} {m.name}</p>
              <p className="text-[10px] text-muted-foreground">{yearRange(m)}</p>
            </div>
          </div>
        );
      },
    },
    {
      id: "engine",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Engine" />,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">{row.original.engineCapacity ?? "—"}</span>
      ),
    },
    {
      id: "parts",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Mapped Parts" />,
      cell: ({ row }) => (
        <Badge variant={row.original._count?.compatibilities ? "success" : "secondary"} className="h-6 rounded-full px-2.5 text-[11px] font-semibold inline-flex items-center">
          {row.original._count?.compatibilities ?? 0} parts
        </Badge>
      ),
    },
  ];
}

function buildPartColumns(
  onDelete?: (id: string) => void,
  deleting?: string | null,
): ColumnDef<CompatiblePart>[] {
  return [
    {
      id: "product",
      accessorFn: (r) =>
        `${r.product.name} ${r.variant.name} ${r.variant.sku} ${r.vehicle} ${r.product.oemNumber ?? ""}`.trim(),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Part" />,
      cell: ({ row }) => (
        <div className="min-w-[160px]">
          <p className="text-sm font-semibold">{row.original.product.name}</p>
          <p className="text-[10px] text-muted-foreground">{row.original.variant.name}</p>
        </div>
      ),
    },
    {
      id: "sku",
      header: ({ column }) => <DataTableColumnHeader column={column} title="SKU" />,
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.variant.sku}</span>,
    },
    {
      id: "vehicle",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fits Vehicle" />,
      cell: ({ row }) => <span className="text-xs font-medium">{row.original.vehicle}</span>,
    },
    {
      id: "oem",
      header: ({ column }) => <DataTableColumnHeader column={column} title="OEM" />,
      cell: ({ row }) => (
        <span className="text-xs font-mono text-muted-foreground">{row.original.product.oemNumber ?? "—"}</span>
      ),
    },
    {
      id: "price",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Price" />,
      cell: ({ row }) => (
        <span className="text-sm font-bold">LKR {formatNumber(row.original.variant.sellingPrice)}</span>
      ),
    },
    ...(onDelete ? [{
      id: "actions",
      header: () => <span className="text-xs font-semibold">Actions</span>,
      cell: ({ row }: { row: { original: CompatiblePart } }) => (
        <Button
          size="sm"
          variant="ghost"
          className="h-8 text-red-500 hover:text-red-600 hover:bg-red-50"
          disabled={deleting === row.original.compatibilityId}
          onClick={() => onDelete(row.original.compatibilityId)}
        >
          {deleting === row.original.compatibilityId
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Trash2 className="h-3.5 w-3.5" />}
        </Button>
      ),
    } as ColumnDef<CompatiblePart>] : []),
  ];
}

export default function VehiclesPage() {
  const [brands, setBrands] = useState<VehicleBrand[]>([]);
  const [models, setModels] = useState<VehicleModel[]>([]);
  const [allMappings, setAllMappings] = useState<CompatiblePart[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("lookup");
  const [searchBrandId, setSearchBrandId] = useState("");
  const [searchModelId, setSearchModelId] = useState("");
  const [searchYear, setSearchYear] = useState("");
  const [searchVin, setSearchVin] = useState("");
  const [searchText, setSearchText] = useState("");
  const [parts, setParts] = useState<CompatiblePart[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [newBrand, setNewBrand] = useState("");
  const [modelForm, setModelForm] = useState({ brandId: "", name: "", yearFrom: "", yearTo: "", engineCapacity: "" });
  const [mapForm, setMapForm] = useState({ vehicleModelId: "", variantId: "", notes: "" });
  const [variants, setVariants] = useState<VariantOpt[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [savingBrand, setSavingBrand] = useState(false);
  const [savingModel, setSavingModel] = useState(false);
  const [savingMap, setSavingMap] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [b, m, mapRes] = await Promise.all([
        api.get<VehicleBrand[]>("/spare-parts/vehicle-brands"),
        api.get<VehicleModel[]>("/spare-parts/vehicle-models"),
        api.get<{ parts: CompatiblePart[] }>("/spare-parts/compatible-parts"),
      ]);
      setBrands(Array.isArray(b.data) ? b.data : []);
      setModels(Array.isArray(m.data) ? m.data : []);
      setAllMappings(mapRes.data?.parts ?? []);
    } catch {
      toast.error("Failed to load vehicle data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => {
    api.get<VariantOpt[]>("/pos/products").then((r) => setVariants(Array.isArray(r.data) ? r.data : [])).catch(() => {});
  }, []);

  const runSearch = async () => {
    setSearching(true);
    setHasSearched(true);
    try {
      const q = new URLSearchParams();
      if (searchBrandId) q.set("brandId", searchBrandId);
      if (searchModelId) q.set("modelId", searchModelId);
      if (searchYear) q.set("year", searchYear);
      if (searchVin) q.set("vin", searchVin);
      if (searchText) q.set("search", searchText);
      const res = await api.get<{ parts: CompatiblePart[] }>(`/spare-parts/compatible-parts?${q}`);
      setParts(res.data?.parts ?? []);
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Search failed");
    } finally {
      setSearching(false);
    }
  };

  const addBrand = async () => {
    if (!newBrand.trim()) return;
    setSavingBrand(true);
    try {
      await api.post("/spare-parts/vehicle-brands", { name: newBrand.trim() });
      toast.success("Brand added");
      setNewBrand("");
      fetchAll();
    } catch (e: unknown) {
      toast.error((e as Error).message);
    } finally {
      setSavingBrand(false);
    }
  };

  const addModel = async () => {
    if (!modelForm.brandId || !modelForm.name.trim()) {
      toast.error("Brand and model name required");
      return;
    }
    setSavingModel(true);
    try {
      await api.post("/spare-parts/vehicle-models", {
        brandId: modelForm.brandId,
        name: modelForm.name.trim(),
        yearFrom: modelForm.yearFrom ? parseInt(modelForm.yearFrom, 10) : undefined,
        yearTo: modelForm.yearTo ? parseInt(modelForm.yearTo, 10) : undefined,
        engineCapacity: modelForm.engineCapacity || undefined,
      });
      toast.success("Model added");
      setModelForm({ brandId: "", name: "", yearFrom: "", yearTo: "", engineCapacity: "" });
      fetchAll();
    } catch (e: unknown) {
      toast.error((e as Error).message);
    } finally {
      setSavingModel(false);
    }
  };

  const addMapping = async () => {
    if (!mapForm.vehicleModelId || !mapForm.variantId) {
      toast.error("Select vehicle model and part");
      return;
    }
    setSavingMap(true);
    try {
      await api.post("/spare-parts/compatibilities", mapForm);
      toast.success("Compatibility mapped");
      setMapForm({ vehicleModelId: "", variantId: "", notes: "" });
      fetchAll();
    } catch (e: unknown) {
      toast.error((e as Error).message);
    } finally {
      setSavingMap(false);
    }
  };

  const removeMapping = async (id: string) => {
    setDeleting(id);
    try {
      await api.delete(`/spare-parts/compatibilities/${id}`);
      toast.success("Mapping removed");
      fetchAll();
      if (hasSearched) runSearch();
    } catch (e: unknown) {
      toast.error((e as Error).message);
    } finally {
      setDeleting(null);
    }
  };

  const filteredModels = searchBrandId ? models.filter((m) => m.brand.id === searchBrandId) : models;
  const totalMappings = allMappings.length;
  const modelsWithParts = models.filter((m) => (m._count?.compatibilities ?? 0) > 0).length;

  const TABS: { key: TabKey; label: string }[] = [
    { key: "lookup", label: "Part Lookup" },
    { key: "catalog", label: "Brands & Models" },
    { key: "mapping", label: "Compatibility Mapping" },
  ];

  const STATS = [
    { label: "Vehicle Brands", value: brands.length, icon: Building2, color: "text-blue-600", bg: "bg-blue-500/15", tint: "border-blue-200/70 bg-gradient-to-br from-blue-50 to-white dark:border-blue-500/20 dark:from-blue-500/10 dark:to-transparent" },
    { label: "Vehicle Models", value: models.length, icon: Car, color: "text-emerald-600", bg: "bg-emerald-500/15", tint: "border-emerald-200/70 bg-gradient-to-br from-emerald-50 to-white dark:border-emerald-500/20 dark:from-emerald-500/10 dark:to-transparent" },
    { label: "Part Mappings", value: totalMappings, icon: Link2, color: "text-violet-600", bg: "bg-violet-500/15", tint: "border-violet-200/70 bg-gradient-to-br from-violet-50 to-white dark:border-violet-500/20 dark:from-violet-500/10 dark:to-transparent" },
    { label: "Models w/ Parts", value: modelsWithParts, icon: Package, color: "text-amber-600", bg: "bg-amber-500/15", tint: "border-amber-200/70 bg-gradient-to-br from-amber-50 to-white dark:border-amber-500/20 dark:from-amber-500/10 dark:to-transparent" },
  ];

  const brandColumns = useMemo(() => buildBrandColumns(), []);
  const modelColumns = useMemo(() => buildModelColumns(), []);
  const partColumns = useMemo(() => buildPartColumns(), []);
  const mappingColumns = useMemo(() => buildPartColumns(removeMapping, deleting), [deleting]);

  return (
    <div className="page-shell">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="min-w-0">
          <h1 className="text-[26px] md:text-3xl font-bold tracking-tight leading-tight">Vehicle Compatibility</h1>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            Map spare parts to vehicles — search by make, model, year, VIN or part name
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" onClick={fetchAll} className="gap-1.5">
              <RefreshCw className={`h-[18px] w-[18px] ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button variant="outline" className="gap-1.5" asChild>
              <Link href="/products"><ExternalLink className="h-[18px] w-[18px]" /> Parts Catalog</Link>
            </Button>
          </div>
          <div className="hidden sm:block h-6 w-px bg-slate-200 dark:bg-white/10 mx-0.5" aria-hidden />
          <Button className="gap-1.5" onClick={() => setActiveTab("mapping")}>
            <Plus className="h-[18px] w-[18px]" /> New Mapping
          </Button>
        </div>
      </div>

      {/* KPI stats */}
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
                <p className="text-[22px] font-bold leading-none tabular-nums">{loading ? "—" : s.value}</p>
                <p className="text-[11px] text-muted-foreground font-medium mt-1 truncate">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tab pills */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">View:</span>
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActiveTab(t.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === t.key
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted/60 text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Part Lookup */}
      {activeTab === "lookup" && (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Search className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Find Compatible Parts</p>
                  <p className="text-[11px] text-muted-foreground">Filter by vehicle details or search part name / OEM number</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Brand</Label>
                  <Select value={searchBrandId || "all"} onValueChange={(v) => { setSearchBrandId(v === "all" ? "" : v); setSearchModelId(""); }}>
                    <SelectTrigger><SelectValue placeholder="All brands" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All brands</SelectItem>
                      {brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Model</Label>
                  <Select value={searchModelId || "all"} onValueChange={(v) => setSearchModelId(v === "all" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="All models" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All models</SelectItem>
                      {filteredModels.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.brand.name} {m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Year</Label>
                  <Input type="number" placeholder="e.g. 2015" value={searchYear} onChange={(e) => setSearchYear(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">VIN / Chassis</Label>
                  <Input placeholder="VIN or chassis number" value={searchVin} onChange={(e) => setSearchVin(e.target.value)} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs font-semibold">Part name or OEM</Label>
                  <Input placeholder="Oil filter, brake pad, OEM number..." value={searchText} onChange={(e) => setSearchText(e.target.value)} />
                </div>
              </div>
              <Button onClick={runSearch} disabled={searching} className="gap-1.5">
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Search Compatible Parts
              </Button>
            </CardContent>
          </Card>

          {searching ? (
            <div className="flex items-center justify-center py-12 rounded-xl border bg-card">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !hasSearched ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-10 gap-3">
                <div className="p-4 rounded-2xl bg-blue-500/10">
                  <Car className="h-10 w-10 text-blue-500" />
                </div>
                <p className="text-base font-semibold">Search for compatible parts</p>
                <p className="text-sm text-muted-foreground text-center max-w-md">
                  Select a vehicle brand and model, or enter a VIN, then search to see all mapped spare parts.
                </p>
              </CardContent>
            </Card>
          ) : parts.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-10 gap-3">
                <div className="p-4 rounded-2xl bg-amber-500/10">
                  <Package className="h-10 w-10 text-amber-500" />
                </div>
                <p className="text-base font-semibold">No matching parts</p>
                <p className="text-sm text-muted-foreground text-center max-w-sm">
                  No compatibility mappings found. Add a mapping in the Compatibility tab.
                </p>
                <Button size="sm" variant="outline" className="mt-2 gap-1.5" onClick={() => setActiveTab("mapping")}>
                  <Link2 className="h-3.5 w-3.5" /> Add Mapping
                </Button>
              </CardContent>
            </Card>
          ) : (
            <ClientSideTable
              data={parts}
              columns={partColumns}
              searchableColumns={[{ id: "product", title: "Part / SKU / vehicle" }]}
              filterableColumns={[]}
              isShowExportButtons={{ isShow: true, fileName: "compatible-parts" }}
            />
          )}
        </div>
      )}

      {/* Brands & Models */}
      {activeTab === "catalog" && (
        <div className="space-y-4">
          <div className="grid xl:grid-cols-2 gap-3">
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-blue-500" />
                  <p className="text-sm font-semibold">Add Vehicle Brand</p>
                </div>
                <div className="flex gap-2">
                  <Input placeholder="Toyota, Honda, Nissan..." value={newBrand} onChange={(e) => setNewBrand(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addBrand()} />
                  <Button size="sm" onClick={addBrand} disabled={savingBrand} className="shrink-0 gap-1">
                    {savingBrand ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Add
                  </Button>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Cog className="h-4 w-4 text-emerald-600" />
                  <p className="text-sm font-semibold">Add Vehicle Model</p>
                </div>
                <Select value={modelForm.brandId} onValueChange={(v) => setModelForm((f) => ({ ...f, brandId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select brand" /></SelectTrigger>
                  <SelectContent>{brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                </Select>
                <Input placeholder="Model name — Axio, Vezel, Corolla..." value={modelForm.name} onChange={(e) => setModelForm((f) => ({ ...f, name: e.target.value }))} />
                <div className="grid grid-cols-3 gap-2">
                  <Input placeholder="Year from" type="number" value={modelForm.yearFrom} onChange={(e) => setModelForm((f) => ({ ...f, yearFrom: e.target.value }))} />
                  <Input placeholder="Year to" type="number" value={modelForm.yearTo} onChange={(e) => setModelForm((f) => ({ ...f, yearTo: e.target.value }))} />
                  <Input placeholder="1500cc" value={modelForm.engineCapacity} onChange={(e) => setModelForm((f) => ({ ...f, engineCapacity: e.target.value }))} />
                </div>
                <Button size="sm" onClick={addModel} disabled={savingModel} className="gap-1">
                  {savingModel ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  Add Model
                </Button>
              </CardContent>
            </Card>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-10 rounded-xl border bg-card">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid xl:grid-cols-2 gap-3">
              <div className="space-y-2">
                <h2 className="text-sm font-semibold">Brands ({brands.length})</h2>
                <ClientSideTable
                  data={brands}
                  columns={brandColumns}
                  searchableColumns={[{ id: "name", title: "Brand" }]}
                  filterableColumns={[]}
                  isShowExportButtons={{ isShow: true, fileName: "vehicle-brands" }}
                />
              </div>
              <div className="space-y-2">
                <h2 className="text-sm font-semibold">Models ({models.length})</h2>
                <ClientSideTable
                  data={models}
                  columns={modelColumns}
                  searchableColumns={[{ id: "vehicle", title: "Model / brand" }]}
                  filterableColumns={[]}
                  isShowExportButtons={{ isShow: true, fileName: "vehicle-models" }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Compatibility Mapping */}
      {activeTab === "mapping" && (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4 space-y-3 max-w-2xl">
              <div className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-violet-500" />
                <div>
                  <p className="text-sm font-semibold">Map Part to Vehicle</p>
                  <p className="text-[11px] text-muted-foreground">Example: Oil Filter → Toyota Axio 2015</p>
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Vehicle Model</Label>
                  <Select value={mapForm.vehicleModelId} onValueChange={(v) => setMapForm((f) => ({ ...f, vehicleModelId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                    <SelectContent>
                      {models.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.brand.name} {m.name} ({yearRange(m)})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Spare Part</Label>
                  <Select value={mapForm.variantId} onValueChange={(v) => setMapForm((f) => ({ ...f, variantId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select part variant" /></SelectTrigger>
                    <SelectContent>
                      {variants.map((v) => (
                        <SelectItem key={v.variantId} value={v.variantId}>{v.productName} — {v.sku}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input placeholder="Fitment notes, position, etc." value={mapForm.notes} onChange={(e) => setMapForm((f) => ({ ...f, notes: e.target.value }))} />
              </div>
              <Button onClick={addMapping} disabled={savingMap} className="gap-1.5">
                {savingMap ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                Save Compatibility Mapping
              </Button>
            </CardContent>
          </Card>

          <div className="space-y-2">
            <h2 className="text-sm font-semibold">All Mappings ({allMappings.length})</h2>
            {loading ? (
              <div className="flex items-center justify-center py-10 rounded-xl border bg-card">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : allMappings.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12 gap-2">
                  <Hash className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">No part-to-vehicle mappings yet</p>
                </CardContent>
              </Card>
            ) : (
              <ClientSideTable
                data={allMappings}
                columns={mappingColumns}
                searchableColumns={[{ id: "product", title: "Part / SKU / vehicle" }]}
                filterableColumns={[]}
                isShowExportButtons={{ isShow: true, fileName: "vehicle-mappings" }}
              />
            )}
          </div>
        </div>
      )}

      {/* Guide */}
      <div className="flex flex-wrap gap-2">
        {GUIDE.map((g) => (
          <div
            key={g.title}
            title={g.desc}
            className="inline-flex items-center gap-2 h-9 px-3 rounded-xl border bg-card text-xs font-medium max-w-full"
          >
            <Car className="h-3.5 w-3.5 text-emerald-600 shrink-0" strokeWidth={1.75} />
            <span className="font-semibold text-foreground shrink-0">{g.title}</span>
            <span className="text-muted-foreground truncate hidden sm:inline">{g.desc}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
