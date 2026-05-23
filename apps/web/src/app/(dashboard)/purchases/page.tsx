"use client";

import * as React from "react";
import { ShoppingBag, Plus, Search, FileText, Clock, CheckCircle2, XCircle, Download } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatNumber } from "@/lib/utils";

const DUMMY_POS = [
  { id: "PO-2024-001", supplier: "TextileCo India", items: 5, amount: 125000, date: "Dec 10, 2024", status: "received", dueDate: "Dec 15, 2024" },
  { id: "PO-2024-002", supplier: "DenimWorld", items: 3, amount: 87500, date: "Dec 8, 2024", status: "pending", dueDate: "Dec 18, 2024" },
  { id: "PO-2024-003", supplier: "FashionKnits", items: 8, amount: 64200, date: "Dec 5, 2024", status: "in_transit", dueDate: "Dec 14, 2024" },
  { id: "PO-2024-004", supplier: "ShoeFactory", items: 2, amount: 156000, date: "Dec 1, 2024", status: "received", dueDate: "Dec 10, 2024" },
  { id: "PO-2024-005", supplier: "TextileCo India", items: 6, amount: 98000, date: "Nov 28, 2024", status: "cancelled", dueDate: "Dec 8, 2024" },
];

const STATUS_CONFIG: Record<string, { label: string; variant: string; icon: React.ElementType }> = {
  pending: { label: "Pending", variant: "warning", icon: Clock },
  in_transit: { label: "In Transit", variant: "info", icon: ShoppingBag },
  received: { label: "Received", variant: "success", icon: CheckCircle2 },
  cancelled: { label: "Cancelled", variant: "danger", icon: XCircle },
};

export default function PurchasesPage() {
  const [search, setSearch] = React.useState("");
  const filtered = DUMMY_POS.filter(p => p.supplier.toLowerCase().includes(search.toLowerCase()) || p.id.includes(search));

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Purchase Orders</h1>
          <p className="text-sm text-muted-foreground">Manage supplier purchase orders and deliveries</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5"><Download className="h-3.5 w-3.5" />Export</Button>
          <Button variant="gradient" size="sm" className="gap-1.5"><Plus className="h-3.5 w-3.5" />New PO</Button>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search POs..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                {["PO Number", "Supplier", "Items", "Amount", "Date", "Due Date", "Status"].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((po, i) => {
                const conf = STATUS_CONFIG[po.status];
                const StatusIcon = conf.icon;
                return (
                  <motion.tr key={po.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }}
                    className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-blue-500 font-semibold">{po.id}</td>
                    <td className="px-4 py-3 text-sm font-medium">{po.supplier}</td>
                    <td className="px-4 py-3 text-sm">{po.items} items</td>
                    <td className="px-4 py-3 text-sm font-semibold">₹{formatNumber(po.amount)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{po.date}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{po.dueDate}</td>
                    <td className="px-4 py-3">
                      <Badge variant={conf.variant as any} className="text-[10px] gap-1">
                        <StatusIcon className="h-3 w-3" />{conf.label}
                      </Badge>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
