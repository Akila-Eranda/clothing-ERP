"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowRightLeft, Building2, Loader2, Package, Plus, RefreshCw, Warehouse,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import { useBranchStore } from "@/stores/branch-store";

interface WarehouseRow {
  id: string;
  name: string;
  code: string;
  address?: string | null;
  isDefault: boolean;
  branchId: string;
  branch?: { id: string; name: string; code: string };
  _count?: { inventory: number };
  summary?: {
    skuCount: number;
    onHandQty: number;
    availableQty: number;
    stockValue: number;
    lowStockSkus: number;
  };
}

interface Dashboard {
  totals: {
    warehouses: number;
    skuCount: number;
    onHandQty: number;
    availableQty: number;
    stockValue: number;
    lowStockSkus: number;
    openTransfers: number;
  };
  warehouses: WarehouseRow[];
}

interface StockRow {
  id: string;
  quantity: number;
  reservedQty: number;
  availableQty: number;
  value: number;
  avgCost: number;
  variant: { sku: string; name: string; product: { name: string } };
}

interface TransferRow {
  id: string;
  status: string;
  createdAt: string;
  notes?: string | null;
  fromBranch?: { name: string; code: string } | null;
  toBranch?: { name: string; code: string } | null;
  fromWarehouse?: { name: string; code: string } | null;
  toWarehouse?: { name: string; code: string } | null;
  items: { requestedQty: number; variant: { sku: string; product: { name: string } } }[];
}

export default function WarehousePage() {
  const activeBranchId = useBranchStore((s) => s.activeBranchId);
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [stock, setStock] = useState<StockRow[]>([]);
  const [transfers, setTransfers] = useState<TransferRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [stockLoading, setStockLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [fromWh, setFromWh] = useState("");
  const [toWh, setToWh] = useState("");
  const [variantId, setVariantId] = useState("");
  const [qty, setQty] = useState("1");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = activeBranchId ? `?branchId=${activeBranchId}` : "";
      const [dashRes, listRes, trRes] = await Promise.all([
        api.get<Dashboard>(`/warehouses/dashboard${q}`),
        api.get<WarehouseRow[]>(`/warehouses${q}`),
        api.get<TransferRow[]>(`/warehouses/transfers${q}`),
      ]);
      setDash(dashRes.data ?? null);
      const list = Array.isArray(listRes.data) ? listRes.data : [];
      setWarehouses(list);
      setSelected((prev) => prev || list[0]?.id || "");
      setTransfers(Array.isArray(trRes.data) ? trRes.data : []);
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to load warehouses");
    } finally {
      setLoading(false);
    }
  }, [activeBranchId]);

  const loadStock = useCallback(async (warehouseId: string) => {
    if (!warehouseId) return;
    setStockLoading(true);
    try {
      const q = search ? `?search=${encodeURIComponent(search)}` : "";
      const res = await api.get<StockRow[]>(`/warehouses/${warehouseId}/stock${q}`);
      setStock(Array.isArray(res.data) ? res.data : []);
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to load stock");
    } finally {
      setStockLoading(false);
    }
  }, [search]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (selected) loadStock(selected); }, [selected, loadStock]);

  const createWarehouse = async () => {
    if (!activeBranchId) {
      toast.error("Select a branch first");
      return;
    }
    if (!name.trim() || !code.trim()) {
      toast.error("Name and code are required");
      return;
    }
    try {
      await api.post("/warehouses", {
        branchId: activeBranchId,
        name: name.trim(),
        code: code.trim().toUpperCase(),
      });
      toast.success("Warehouse created");
      setShowCreate(false);
      setName("");
      setCode("");
      await load();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Create failed");
    }
  };

  const createTransfer = async () => {
    if (!fromWh || !toWh || !variantId.trim() || !qty) {
      toast.error("From, to, variant, and qty are required");
      return;
    }
    try {
      await api.post("/warehouses/transfers", {
        fromWarehouseId: fromWh,
        toWarehouseId: toWh,
        items: [{ variantId: variantId.trim(), requestedQty: parseInt(qty, 10) }],
      });
      toast.success("Transfer created (pending approval)");
      setShowTransfer(false);
      setVariantId("");
      setQty("1");
      await load();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Transfer failed");
    }
  };

  const updateTransfer = async (id: string, status: string) => {
    try {
      await api.put(`/inventory/transfers/${id}/status`, { status });
      toast.success(`Transfer ${status.toLowerCase().replace("_", " ")}`);
      await load();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Update failed");
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6" /> Warehouse
          </h1>
          <p className="text-sm text-muted-foreground">
            Multi-warehouse locations · transfers · stock · dashboard
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setShowTransfer((v) => !v)} className="gap-1.5">
            <ArrowRightLeft className="h-3.5 w-3.5" /> Transfer
          </Button>
          <Button size="sm" onClick={() => setShowCreate((v) => !v)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Add Warehouse
          </Button>
          <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      {showCreate && (
        <Card>
          <CardContent className="p-4 flex flex-wrap gap-2 items-end">
            <div>
              <label className="text-[10px] uppercase text-muted-foreground">Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9 w-48" placeholder="Backroom" />
            </div>
            <div>
              <label className="text-[10px] uppercase text-muted-foreground">Code</label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} className="h-9 w-32" placeholder="BACK" />
            </div>
            <Button size="sm" onClick={createWarehouse}>Create</Button>
          </CardContent>
        </Card>
      )}

      {showTransfer && (
        <Card>
          <CardContent className="p-4 flex flex-wrap gap-2 items-end">
            <div>
              <label className="text-[10px] uppercase text-muted-foreground">From</label>
              <select className="h-9 rounded-md border px-2 text-sm bg-background" value={fromWh} onChange={(e) => setFromWh(e.target.value)}>
                <option value="">Select…</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase text-muted-foreground">To</label>
              <select className="h-9 rounded-md border px-2 text-sm bg-background" value={toWh} onChange={(e) => setToWh(e.target.value)}>
                <option value="">Select…</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase text-muted-foreground">Variant ID</label>
              <Input value={variantId} onChange={(e) => setVariantId(e.target.value)} className="h-9 w-56" placeholder="variant cuid" />
            </div>
            <div>
              <label className="text-[10px] uppercase text-muted-foreground">Qty</label>
              <Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} className="h-9 w-20" />
            </div>
            <Button size="sm" onClick={createTransfer}>Create Transfer</Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {[
          { label: "Warehouses", value: dash?.totals.warehouses ?? 0, icon: Warehouse },
          { label: "On hand qty", value: dash?.totals.onHandQty ?? 0, icon: Package },
          { label: "Stock value", value: dash?.totals.stockValue ?? 0, prefix: "LKR " },
          { label: "Open transfers", value: dash?.totals.openTransfers ?? 0, icon: ArrowRightLeft },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <p className="text-2xl font-bold">
                {s.prefix ?? ""}{formatNumber(s.value)}
              </p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="dashboard">
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="stock">Warehouse Stock</TabsTrigger>
          <TabsTrigger value="transfers">Transfers</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-4">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
              {(dash?.warehouses ?? warehouses).map((w) => (
                <Card
                  key={w.id}
                  className={`cursor-pointer transition ${selected === w.id ? "ring-2 ring-primary" : ""}`}
                  onClick={() => setSelected(w.id)}
                >
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-sm">{w.name}</p>
                      {w.isDefault && <Badge className="text-[10px]">Default</Badge>}
                    </div>
                    <p className="text-[10px] font-mono text-muted-foreground">{w.code} · {w.branch?.name}</p>
                    <div className="grid grid-cols-3 gap-2 text-center pt-1">
                      <div>
                        <p className="text-sm font-bold">{formatNumber(w.summary?.onHandQty ?? 0)}</p>
                        <p className="text-[10px] text-muted-foreground">On hand</p>
                      </div>
                      <div>
                        <p className="text-sm font-bold">{formatNumber(w.summary?.availableQty ?? 0)}</p>
                        <p className="text-[10px] text-muted-foreground">Avail</p>
                      </div>
                      <div>
                        <p className="text-sm font-bold">{w.summary?.lowStockSkus ?? 0}</p>
                        <p className="text-[10px] text-muted-foreground">Low</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="stock" className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <select
              className="h-9 rounded-md border px-2 text-sm bg-background"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
              ))}
            </select>
            <Input
              placeholder="Search SKU / product…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 max-w-xs"
            />
            <Button variant="outline" size="sm" onClick={() => loadStock(selected)}>Search</Button>
          </div>
          {stockLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (
            <div className="rounded-xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    {["Product", "SKU", "On hand", "Reserved", "Available", "Value"].map((h) => (
                      <th key={h} className="text-left px-3 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stock.length === 0 ? (
                    <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground text-sm">No stock in this warehouse</td></tr>
                  ) : stock.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="px-3 py-2.5 text-xs font-medium">{r.variant.product.name}</td>
                      <td className="px-3 py-2.5 font-mono text-xs">{r.variant.sku}</td>
                      <td className="px-3 py-2.5 font-bold">{r.quantity}</td>
                      <td className="px-3 py-2.5 text-xs">{r.reservedQty}</td>
                      <td className="px-3 py-2.5 text-emerald-600 font-semibold">{r.availableQty}</td>
                      <td className="px-3 py-2.5 text-xs">LKR {formatNumber(r.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="transfers" className="mt-4">
          <div className="rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  {["When", "From → To", "Items", "Status", "Actions"].map((h) => (
                    <th key={h} className="text-left px-3 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {transfers.length === 0 ? (
                  <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground text-sm">No warehouse transfers yet</td></tr>
                ) : transfers.map((t) => (
                  <tr key={t.id} className="border-t">
                    <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(t.createdAt).toLocaleString("en-LK")}
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      <span className="font-medium">{t.fromWarehouse?.name ?? t.fromBranch?.name ?? "—"}</span>
                      {" → "}
                      <span className="font-medium">{t.toWarehouse?.name ?? t.toBranch?.name ?? "—"}</span>
                    </td>
                    <td className="px-3 py-2.5 text-xs">{t.items?.length ?? 0} SKU(s)</td>
                    <td className="px-3 py-2.5"><Badge variant="outline" className="text-[10px]">{t.status}</Badge></td>
                    <td className="px-3 py-2.5 space-x-1">
                      {t.status === "PENDING" && (
                        <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => updateTransfer(t.id, "IN_TRANSIT")}>
                          Dispatch
                        </Button>
                      )}
                      {t.status === "IN_TRANSIT" && (
                        <Button size="sm" className="h-7 text-[10px]" onClick={() => updateTransfer(t.id, "RECEIVED")}>
                          Receive
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
