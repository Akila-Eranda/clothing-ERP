"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Receipt, Search, Filter, Download, Eye, TrendingUp, ShoppingCart, DollarSign, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatNumber } from "@/lib/utils";
import { DUMMY_RECENT_SALES } from "@/lib/constants";

const STATS = [
  { label: "Today's Sales", value: "₹1,28,450", icon: DollarSign, color: "text-emerald-500", bg: "bg-emerald-500/10" },
  { label: "Total Orders", value: "284", icon: ShoppingCart, color: "text-blue-500", bg: "bg-blue-500/10" },
  { label: "Avg Order Value", value: "₹4,523", icon: TrendingUp, color: "text-violet-500", bg: "bg-violet-500/10" },
  { label: "Returns", value: "12", icon: RotateCcw, color: "text-amber-500", bg: "bg-amber-500/10" },
];

export default function SalesPage() {
  const [search, setSearch] = React.useState("");

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Sales</h1>
          <p className="text-sm text-muted-foreground">View and manage all sales transactions</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5"><Download className="h-3.5 w-3.5" />Export</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {STATS.map((s) => (
          <Card key={s.label}><CardContent className="p-4 flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${s.bg}`}><s.icon className={`h-5 w-5 ${s.color}`} /></div>
            <div><p className="text-xl font-bold">{s.value}</p><p className="text-xs text-muted-foreground">{s.label}</p></div>
          </CardContent></Card>
        ))}
      </div>

      <Card>
        <div className="p-4 border-b border-border flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search invoices..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Button variant="outline" size="sm" className="gap-1.5"><Filter className="h-3.5 w-3.5" />Filter</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Invoice</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Customer</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Time</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Amount</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {DUMMY_RECENT_SALES.filter(s => s.customer.toLowerCase().includes(search.toLowerCase())).map((sale, i) => (
                <motion.tr key={sale.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }}
                  className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{sale.id}</td>
                  <td className="px-4 py-3 text-sm font-medium">{sale.customer}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{sale.time}</td>
                  <td className="px-4 py-3 text-right text-sm font-semibold">₹{formatNumber(sale.amount)}</td>
                  <td className="px-4 py-3">
                    <Badge variant={sale.status === "completed" ? "success" : "warning"} className="text-[10px] capitalize">
                      {sale.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Button variant="ghost" size="icon-sm" className="h-7 w-7"><Eye className="h-4 w-4" /></Button>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
