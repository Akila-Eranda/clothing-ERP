"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, ArrowRightLeft, Building2, CheckCircle2, Loader2, Package, Plus, RefreshCw, Warehouse,
} from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClientSideTable } from "@/components/table/client-side-table";
import { DataTableColumnHeader } from "@/components/table/data-table-column-header";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import { useBranchStore } from "@/stores/branch-store";
import { useShopWorkspace } from "@/lib/use-shop-profile";

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
  const { profile } = useShopWorkspace();
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
      const res = await api.get<StockRow[]>(`/warehouses/${warehouseId}/stock`);
      setStock(Array.isArray(res.data) ? res.data : []);
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to load stock");
    } finally {
      setStockLoading(false);
    }
  }, []);

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

  const stockColumns = useMemo<ColumnDef<StockRow>[]>(() => [
    {
      id: "product",
      accessorFn: (r) => r.variant.product.name,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Product" />,
      cell: ({ row }) => (
        <div>
          <p className="text-sm font-medium">{row.original.variant.product.name}</p>
          <p className="text-xs text-muted-foreground">{row.original.variant.name}</p>
        </div>
      ),
    },
    {
      id: "sku",
      accessorFn: (r) => r.variant.sku,
      header: ({ column }) => <DataTableColumnHeader column={column} title="SKU" />,
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.variant.sku}</span>,
    },
    {
      id: "qty",
      accessorKey: "quantity",
      header: ({ column }) => <DataTableColumnHeader column={column} title="On Hand" />,
      cell: ({ row }) => <span className="font-bold text-sm">{row.original.quantity}</span>,
    },
    {
      id: "reserved",
      accessorKey: "reservedQty",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Reserved" />,
      cell: ({ row }) => <span className="text-sm">{row.original.reservedQty}</span>,
    },
    {
      id: "avail",
      accessorKey: "availableQty",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Available" />,
      cell: ({ row }) => (
        <span className="font-semibold text-emerald-600">{row.original.availableQty}</span>
      ),
    },
    {
      id: "value",
      accessorKey: "value",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Value" />,
      cell: ({ row }) => <span className="text-xs">LKR {formatNumber(row.original.value)}</span>,
    },
  ], []);

  const transferColumns = useMemo<ColumnDef<TransferRow>[]>(() => [
    {
      id: "when",
      accessorKey: "createdAt",
      header: ({ column }) => <DataTableColumnHeader column={column} title="When" />,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {new Date(row.original.createdAt).toLocaleString("en-LK")}
        </span>
      ),
    },
    {
      id: "route",
      accessorFn: (r) =>
        `${r.fromWarehouse?.name ?? r.fromBranch?.name ?? ""} → ${r.toWarehouse?.name ?? r.toBranch?.name ?? ""}`,
      header: ({ column }) => <DataTableColumnHeader column={column} title="From → To" />,
      cell: ({ row }) => (
        <span className="text-xs">
          <span className="font-medium">{row.original.fromWarehouse?.name ?? row.original.fromBranch?.name ?? "—"}</span>
          {" → "}
          <span className="font-medium">{row.original.toWarehouse?.name ?? row.original.toBranch?.name ?? "—"}</span>
        </span>
      ),
    },
    {
      id: "items",
      accessorFn: (r) => r.items?.length ?? 0,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Items" />,
      cell: ({ row }) => <span className="text-sm">{row.original.items?.length ?? 0} SKU(s)</span>,
    },
    {
      id: "status",
      accessorKey: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => <Badge variant="outline" className="text-[10px]">{row.original.status}</Badge>,
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => {
        const t = row.original;
        return (
          <div className="flex gap-1">
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
          </div>
        );
      },
    },
  ], []);

  const STATS = [
    { label: "Warehouses", value: dash?.totals.warehouses ?? 0, icon: Warehouse, color: "text-blue-500", bg: "bg-blue-500/10" },
    { label: "On Hand Qty", value: formatNumber(dash?.totals.onHandQty ?? 0), icon: Package, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { label: "Stock Value", value: `LKR ${formatNumber(dash?.totals.stockValue ?? 0)}`, icon: CheckCircle2, color: "text-indigo-500", bg: "bg-indigo-500/10" },
    { label: "Open Transfers", value: dash?.totals.openTransfers ?? 0, icon: ArrowRightLeft, color: "text-amber-500", bg: "bg-amber-500/10" },
  ];

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Warehouse</h1>
          <p className="text-sm text-muted-foreground">
            {profile.label} · Multi-warehouse locations, stock & transfers
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowTransfer((v) => !v)} className="gap-1.5">
            <ArrowRightLeft className="h-3.5 w-3.5" /> Transfer
          </Button>
          <Button size="sm" onClick={() => setShowCreate((v) => !v)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Add Warehouse
          </Button>
        </div>
      </div>

      {showCreate && (
        <Card>
          <CardContent className="p-4 flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <label className="text-xs font-semibold">Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9 w-48" placeholder="Backroom" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold">Code</label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} className="h-9 w-32" placeholder="BACK" />
            </div>
            <Button size="sm" onClick={createWarehouse}>Create</Button>
          </CardContent>
        </Card>
      )}

      {showTransfer && (
        <Card>
          <CardContent className="p-4 flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <label className="text-xs font-semibold">From</label>
              <select className="h-9 rounded-md border px-2 text-sm bg-background" value={fromWh} onChange={(e) => setFromWh(e.target.value)}>
                <option value="">Select…</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold">To</label>
              <select className="h-9 rounded-md border px-2 text-sm bg-background" value={toWh} onChange={(e) => setToWh(e.target.value)}>
                <option value="">Select…</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold">Variant ID</label>
              <Input value={variantId} onChange={(e) => setVariantId(e.target.value)} className="h-9 w-56" placeholder="variant cuid" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold">Qty</label>
              <Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} className="h-9 w-20" />
            </div>
            <Button size="sm" onClick={createTransfer}>Create Transfer</Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {STATS.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${s.bg}`}>
                <s.icon className={`h-5 w-5 ${s.color}`} />
              </div>
              <div>
                <p className="text-xl font-bold leading-tight">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="dashboard">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="stock">Warehouse Stock</TabsTrigger>
          <TabsTrigger value="transfers">Transfers</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-4">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
              {(dash?.warehouses ?? warehouses).map((w) => (
                <Card
                  key={w.id}
                  className={`cursor-pointer transition ${selected === w.id ? "ring-2 ring-indigo-500" : ""}`}
                  onClick={() => setSelected(w.id)}
                >
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="p-2 rounded-xl bg-blue-500/10">
                          <Building2 className="h-4 w-4 text-blue-500" />
                        </div>
                        <div>
                          <p className="font-semibold text-sm">{w.name}</p>
                          <p className="text-[10px] font-mono text-muted-foreground">{w.code} · {w.branch?.name}</p>
                        </div>
                      </div>
                      {w.isDefault && <Badge className="text-[10px]">Default</Badge>}
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center pt-1 border-t">
                      <div className="pt-2">
                        <p className="text-sm font-bold">{formatNumber(w.summary?.onHandQty ?? 0)}</p>
                        <p className="text-[10px] text-muted-foreground">On hand</p>
                      </div>
                      <div className="pt-2">
                        <p className="text-sm font-bold text-emerald-600">{formatNumber(w.summary?.availableQty ?? 0)}</p>
                        <p className="text-[10px] text-muted-foreground">Avail</p>
                      </div>
                      <div className="pt-2">
                        <p className="text-sm font-bold flex items-center justify-center gap-1">
                          {(w.summary?.lowStockSkus ?? 0) > 0 && <AlertTriangle className="h-3 w-3 text-amber-500" />}
                          {w.summary?.lowStockSkus ?? 0}
                        </p>
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
          </div>
          {stockLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <ClientSideTable
              data={stock}
              columns={stockColumns}
              pageCount={Math.ceil(stock.length / 10) || 1}
              searchableColumns={[
                { id: "product", title: "Product" },
                { id: "sku", title: "SKU" },
              ]}
              filterableColumns={[]}
              isShowExportButtons={{ isShow: true, fileName: "warehouse-stock" }}
            />
          )}
        </TabsContent>

        <TabsContent value="transfers" className="mt-4">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <ClientSideTable
              data={transfers}
              columns={transferColumns}
              pageCount={Math.ceil(transfers.length / 10) || 1}
              searchableColumns={[
                { id: "route", title: "Route" },
                { id: "status", title: "Status" },
              ]}
              filterableColumns={[]}
              isShowExportButtons={{ isShow: true, fileName: "warehouse-transfers" }}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
