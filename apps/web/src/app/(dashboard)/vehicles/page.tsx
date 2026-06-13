"use client";

import { useState, useEffect, useCallback } from "react";
import { Car, Plus, Search, Loader2, RefreshCw, Link2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { api } from "@/lib/api";

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

export default function VehiclesPage() {
  const [brands, setBrands] = useState<VehicleBrand[]>([]);
  const [models, setModels] = useState<VehicleModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchBrandId, setSearchBrandId] = useState("");
  const [searchModelId, setSearchModelId] = useState("");
  const [searchYear, setSearchYear] = useState("");
  const [searchVin, setSearchVin] = useState("");
  const [searchText, setSearchText] = useState("");
  const [parts, setParts] = useState<CompatiblePart[]>([]);
  const [searching, setSearching] = useState(false);
  const [newBrand, setNewBrand] = useState("");
  const [modelForm, setModelForm] = useState({ brandId: "", name: "", yearFrom: "", yearTo: "", engineCapacity: "" });
  const [mapForm, setMapForm] = useState({ vehicleModelId: "", variantId: "", notes: "" });
  const [variants, setVariants] = useState<VariantOpt[]>([]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [b, m] = await Promise.all([
        api.get<VehicleBrand[]>("/spare-parts/vehicle-brands"),
        api.get<VehicleModel[]>("/spare-parts/vehicle-models"),
      ]);
      setBrands(Array.isArray(b.data) ? b.data : []);
      setModels(Array.isArray(m.data) ? m.data : []);
    } catch { toast.error("Failed to load vehicle data"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => {
    api.get<VariantOpt[]>("/pos/products").then((r) => setVariants(Array.isArray(r.data) ? r.data : [])).catch(() => {});
  }, []);

  const runSearch = async () => {
    setSearching(true);
    try {
      const q = new URLSearchParams();
      if (searchBrandId) q.set("brandId", searchBrandId);
      if (searchModelId) q.set("modelId", searchModelId);
      if (searchYear) q.set("year", searchYear);
      if (searchVin) q.set("vin", searchVin);
      if (searchText) q.set("search", searchText);
      const res = await api.get<{ parts: CompatiblePart[] }>(`/spare-parts/compatible-parts?${q}`);
      setParts(res.data?.parts ?? []);
    } catch (e: unknown) { toast.error((e as Error).message ?? "Search failed"); }
    finally { setSearching(false); }
  };

  const addBrand = async () => {
    if (!newBrand.trim()) return;
    try {
      await api.post("/spare-parts/vehicle-brands", { name: newBrand.trim() });
      toast.success("Brand added"); setNewBrand(""); fetchAll();
    } catch (e: unknown) { toast.error((e as Error).message); }
  };

  const addModel = async () => {
    if (!modelForm.brandId || !modelForm.name.trim()) { toast.error("Brand and model name required"); return; }
    try {
      await api.post("/spare-parts/vehicle-models", {
        brandId: modelForm.brandId, name: modelForm.name.trim(),
        yearFrom: modelForm.yearFrom ? parseInt(modelForm.yearFrom, 10) : undefined,
        yearTo: modelForm.yearTo ? parseInt(modelForm.yearTo, 10) : undefined,
        engineCapacity: modelForm.engineCapacity || undefined,
      });
      toast.success("Model added");
      setModelForm({ brandId: "", name: "", yearFrom: "", yearTo: "", engineCapacity: "" });
      fetchAll();
    } catch (e: unknown) { toast.error((e as Error).message); }
  };

  const addMapping = async () => {
    if (!mapForm.vehicleModelId || !mapForm.variantId) { toast.error("Select vehicle model and part"); return; }
    try {
      await api.post("/spare-parts/compatibilities", mapForm);
      toast.success("Compatibility mapped"); setMapForm({ vehicleModelId: "", variantId: "", notes: "" }); fetchAll();
    } catch (e: unknown) { toast.error((e as Error).message); }
  };

  const filteredModels = searchBrandId ? models.filter((m) => m.brand.id === searchBrandId) : models;

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Car className="h-6 w-6 text-primary" /> Vehicle Compatibility</h1>
          <p className="text-sm text-muted-foreground">Map spare parts to vehicle make, model, year & engine — search by VIN/chassis</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchAll} className="gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <Tabs defaultValue="search">
        <TabsList>
          <TabsTrigger value="search">Part Lookup</TabsTrigger>
          <TabsTrigger value="brands">Brands & Models</TabsTrigger>
          <TabsTrigger value="mapping">Compatibility Mapping</TabsTrigger>
        </TabsList>

        <TabsContent value="search" className="mt-4 space-y-4">
          <Card><CardContent className="p-4 grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <div className="space-y-1"><Label className="text-xs">Brand</Label>
              <Select value={searchBrandId} onValueChange={(v) => { setSearchBrandId(v === "all" ? "" : v); setSearchModelId(""); }}>
                <SelectTrigger><SelectValue placeholder="All brands" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All brands</SelectItem>
                  {brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label className="text-xs">Model</Label>
              <Select value={searchModelId} onValueChange={(v) => setSearchModelId(v === "all" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="All models" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All models</SelectItem>
                  {filteredModels.map((m) => <SelectItem key={m.id} value={m.id}>{m.brand.name} {m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label className="text-xs">Year</Label>
              <Input type="number" placeholder="2015" value={searchYear} onChange={(e) => setSearchYear(e.target.value)} />
            </div>
            <div className="space-y-1"><Label className="text-xs">VIN / Chassis</Label>
              <Input placeholder="VIN or chassis no." value={searchVin} onChange={(e) => setSearchVin(e.target.value)} />
            </div>
            <div className="space-y-1 md:col-span-2"><Label className="text-xs">Part search</Label>
              <Input placeholder="Oil filter, brake pad, OEM no..." value={searchText} onChange={(e) => setSearchText(e.target.value)} />
            </div>
          </CardContent></Card>
          <Button onClick={runSearch} disabled={searching} className="gap-1.5">
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Find Compatible Parts
          </Button>
          <div className="grid gap-2">
            {parts.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground text-sm">Search to find compatible parts for a vehicle</p>
            ) : parts.map((p) => (
              <div key={p.compatibilityId} className="flex items-center justify-between p-3 rounded-xl border hover:bg-muted/30">
                <div>
                  <p className="font-medium text-sm">{p.product.name}</p>
                  <p className="text-xs text-muted-foreground">{p.variant.sku} · {p.vehicle}{p.product.oemNumber ? ` · OEM ${p.product.oemNumber}` : ""}</p>
                </div>
                <Badge variant="secondary">LKR {p.variant.sellingPrice.toLocaleString()}</Badge>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="brands" className="mt-4 grid xl:grid-cols-2 gap-4">
          <Card><CardContent className="p-4 space-y-3">
            <h3 className="font-semibold text-sm">Vehicle Brands ({brands.length})</h3>
            <div className="flex gap-2">
              <Input placeholder="Toyota, Honda..." value={newBrand} onChange={(e) => setNewBrand(e.target.value)} />
              <Button size="sm" onClick={addBrand}><Plus className="h-4 w-4" /></Button>
            </div>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {brands.map((b) => (
                <div key={b.id} className="flex justify-between py-1.5 border-b text-sm">
                  <span>{b.name}</span><span className="text-muted-foreground text-xs">{b._count?.models ?? 0} models</span>
                </div>
              ))}
            </div>
          </CardContent></Card>
          <Card><CardContent className="p-4 space-y-3">
            <h3 className="font-semibold text-sm">Add Vehicle Model</h3>
            <Select value={modelForm.brandId} onValueChange={(v) => setModelForm((f) => ({ ...f, brandId: v }))}>
              <SelectTrigger><SelectValue placeholder="Select brand" /></SelectTrigger>
              <SelectContent>{brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
            </Select>
            <Input placeholder="Model name (Axio, Vezel...)" value={modelForm.name} onChange={(e) => setModelForm((f) => ({ ...f, name: e.target.value }))} />
            <div className="grid grid-cols-3 gap-2">
              <Input placeholder="Year from" type="number" value={modelForm.yearFrom} onChange={(e) => setModelForm((f) => ({ ...f, yearFrom: e.target.value }))} />
              <Input placeholder="Year to" type="number" value={modelForm.yearTo} onChange={(e) => setModelForm((f) => ({ ...f, yearTo: e.target.value }))} />
              <Input placeholder="Engine (1500cc)" value={modelForm.engineCapacity} onChange={(e) => setModelForm((f) => ({ ...f, engineCapacity: e.target.value }))} />
            </div>
            <Button size="sm" onClick={addModel} className="gap-1"><Plus className="h-3.5 w-3.5" /> Add Model</Button>
            <div className="space-y-1 max-h-48 overflow-y-auto pt-2">
              {models.map((m) => (
                <div key={m.id} className="text-xs py-1 border-b">
                  <span className="font-medium">{m.brand.name} {m.name}</span>
                  <span className="text-muted-foreground ml-2">
                    {m.yearFrom ?? "—"}–{m.yearTo ?? "—"}{m.engineCapacity ? ` · ${m.engineCapacity}` : ""} · {m._count?.compatibilities ?? 0} parts
                  </span>
                </div>
              ))}
            </div>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="mapping" className="mt-4">
          <Card><CardContent className="p-4 space-y-3 max-w-xl">
            <h3 className="font-semibold text-sm flex items-center gap-2"><Link2 className="h-4 w-4" /> Map Part → Vehicle</h3>
            <Select value={mapForm.vehicleModelId} onValueChange={(v) => setMapForm((f) => ({ ...f, vehicleModelId: v }))}>
              <SelectTrigger><SelectValue placeholder="Vehicle model" /></SelectTrigger>
              <SelectContent>{models.map((m) => <SelectItem key={m.id} value={m.id}>{m.brand.name} {m.name}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={mapForm.variantId} onValueChange={(v) => setMapForm((f) => ({ ...f, variantId: v }))}>
              <SelectTrigger><SelectValue placeholder="Spare part / variant" /></SelectTrigger>
              <SelectContent>{variants.map((v) => <SelectItem key={v.variantId} value={v.variantId}>{v.productName} — {v.sku}</SelectItem>)}</SelectContent>
            </Select>
            <Input placeholder="Notes (optional)" value={mapForm.notes} onChange={(e) => setMapForm((f) => ({ ...f, notes: e.target.value }))} />
            <Button onClick={addMapping} className="gap-1"><Link2 className="h-4 w-4" /> Save Mapping</Button>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
