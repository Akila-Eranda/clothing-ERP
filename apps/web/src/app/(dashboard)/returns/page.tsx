"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { RotateCcw, Search, Plus, CheckCircle, Clock, XCircle, Package, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";

const DUMMY_RETURNS = [
  { id: "RET-001", saleId: "INV-2024-1891", customer: "Priya Sharma", items: 2, amount: 2800, status: "approved", date: "Dec 18, 2024", reason: "Size mismatch" },
  { id: "RET-002", saleId: "INV-2024-1756", customer: "Rahul Verma", items: 1, amount: 1500, status: "pending", date: "Dec 17, 2024", reason: "Defective product" },
  { id: "RET-003", saleId: "INV-2024-1643", customer: "Anjali Mehta", items: 3, amount: 4200, status: "completed", date: "Dec 16, 2024", reason: "Wrong item delivered" },
  { id: "RET-004", saleId: "INV-2024-1590", customer: "Suresh Kumar", items: 1, amount: 999, status: "rejected", date: "Dec 15, 2024", reason: "Personal preference" },
  { id: "RET-005", saleId: "INV-2024-1501", customer: "Deepa Nair", items: 2, amount: 3600, status: "pending", date: "Dec 14, 2024", reason: "Color not as expected" },
];

const STATUS_CONFIG = {
  approved: { label: "Approved", icon: CheckCircle, color: "text-emerald-500", bg: "bg-emerald-500/10 border-emerald-500/20" },
  pending: { label: "Pending", icon: Clock, color: "text-amber-500", bg: "bg-amber-500/10 border-amber-500/20" },
  completed: { label: "Completed", icon: CheckCircle, color: "text-blue-500", bg: "bg-blue-500/10 border-blue-500/20" },
  rejected: { label: "Rejected", icon: XCircle, color: "text-red-500", bg: "bg-red-500/10 border-red-500/20" },
} as const;

export default function ReturnsPage() {
  const [search, setSearch] = React.useState("");
  const [filter, setFilter] = React.useState("all");

  const filtered = DUMMY_RETURNS.filter((r) => {
    const matchSearch = r.customer.toLowerCase().includes(search.toLowerCase()) ||
      r.saleId.toLowerCase().includes(search.toLowerCase()) || r.id.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "all" || r.status === filter;
    return matchSearch && matchFilter;
  });

  const stats = [
    { label: "Total Returns", value: DUMMY_RETURNS.length, color: "text-foreground" },
    { label: "Pending", value: DUMMY_RETURNS.filter((r) => r.status === "pending").length, color: "text-amber-500" },
    { label: "Approved", value: DUMMY_RETURNS.filter((r) => r.status === "approved").length, color: "text-emerald-500" },
    { label: "Total Refunded", value: `₹${DUMMY_RETURNS.filter((r) => r.status === "completed").reduce((s, r) => s + r.amount, 0).toLocaleString()}`, color: "text-blue-500" },
  ];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Returns & Refunds</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage product returns and process refunds</p>
        </div>
        <Button variant="gradient" className="gap-2">
          <Plus className="h-4 w-4" /> New Return
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search returns..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1.5">
          {["all", "pending", "approved", "completed", "rejected"].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${filter === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Return ID</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Sale Invoice</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Customer</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Reason</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">Items</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Amount</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((ret, i) => {
                const cfg = STATUS_CONFIG[ret.status as keyof typeof STATUS_CONFIG];
                const Icon = cfg.icon;
                return (
                  <motion.tr
                    key={ret.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="border-b last:border-0 hover:bg-muted/20 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono font-medium text-primary">{ret.id}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{ret.saleId}</td>
                    <td className="px-4 py-3 font-medium">{ret.customer}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs max-w-[160px] truncate">{ret.reason}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1 text-xs">
                        <Package className="h-3.5 w-3.5 text-muted-foreground" />{ret.items}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-bold">₹{ret.amount.toLocaleString()}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.color}`}>
                        <Icon className="h-3 w-3" />{cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Button variant="ghost" size="icon-sm">
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <RotateCcw className="h-10 w-10 mb-3 opacity-20" />
              <p className="font-medium">No returns found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
