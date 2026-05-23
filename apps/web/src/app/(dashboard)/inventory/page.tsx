"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  Warehouse, Search, Filter, AlertTriangle, ArrowUpDown, Package,
  TrendingDown, TrendingUp, BarChart3, Download, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatNumber } from "@/lib/utils";
import { DUMMY_PRODUCTS, DUMMY_LOW_STOCK } from "@/lib/constants";

const STATS = [
  { label: "Total SKUs", value: "2,847", icon: Package, color: "text-blue-500", bg: "bg-blue-500/10" },
  { label: "Inventory Value", value: "₹84.2L", icon: BarChart3, color: "text-emerald-500", bg: "bg-emerald-500/10" },
  { label: "Low Stock Items", value: "32", icon: TrendingDown, color: "text-amber-500", bg: "bg-amber-500/10" },
  { label: "Out of Stock", value: "8", icon: AlertTriangle, color: "text-red-500", bg: "bg-red-500/10" },
];

export default function InventoryPage() {
  const [search, setSearch] = React.useState("");

  const filtered = DUMMY_PRODUCTS.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.sku.toLowerCase().includes(search.toLowerCase())
  );

  const getStockPercent = (stock: number, max = 100) => Math.min((stock / max) * 100, 100);
  const getStockColor = (stock: number) => {
    if (stock === 0) return "bg-red-500";
    if (stock < 10) return "bg-amber-500";
    return "bg-emerald-500";
  };

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Inventory Management</h1>
          <p className="text-sm text-muted-foreground">Track stock levels, movements, and alerts</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            Sync
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5">
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>
          <Button variant="gradient" size="sm" className="gap-1.5">
            <ArrowUpDown className="h-3.5 w-3.5" />
            Stock Adjustment
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {STATS.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${s.bg}`}>
                <s.icon className={`h-5 w-5 ${s.color}`} />
              </div>
              <div>
                <p className="text-xl font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Inventory Table */}
        <div className="xl:col-span-2 space-y-4">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search inventory..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Filter className="h-3.5 w-3.5" />
              Filter
            </Button>
          </div>

          <Card>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Product</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Stock</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground min-w-[120px]">Level</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((product, i) => (
                    <motion.tr
                      key={product.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.03 }}
                      className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm font-medium">{product.name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{product.sku}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`text-sm font-bold ${product.stock < 10 ? "text-amber-500" : ""}`}>
                          {product.stock}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full ${getStockColor(product.stock)}`}
                              style={{ width: `${getStockPercent(product.stock)}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-muted-foreground w-8 text-right">
                            {getStockPercent(product.stock).toFixed(0)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={product.stock === 0 ? "danger" : product.stock < 10 ? "warning" : "success"}
                          className="text-[10px] capitalize"
                        >
                          {product.stock === 0 ? "Out of Stock" : product.stock < 10 ? "Low Stock" : "In Stock"}
                        </Badge>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* Low Stock Alerts panel */}
        <div className="space-y-4">
          <Card className="border-amber-500/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Reorder Alerts
                <Badge variant="warning" className="ml-auto text-[10px]">
                  {DUMMY_LOW_STOCK.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {DUMMY_LOW_STOCK.map((item) => (
                <div key={item.id} className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/10 space-y-2">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.name}</p>
                      <p className="text-xs text-muted-foreground">{item.variant}</p>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <p className="text-sm font-bold text-amber-500">{item.stock}</p>
                      <p className="text-[10px] text-muted-foreground">/ {item.minStock} min</p>
                    </div>
                  </div>
                  <Progress value={(item.stock / item.minStock) * 100} className="h-1" />
                  <Button size="sm" variant="warning" className="w-full h-7 text-xs">
                    Create Purchase Order
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
