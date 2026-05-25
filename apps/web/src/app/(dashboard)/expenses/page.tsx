"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { TrendingDown, Search, Plus, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const CATEGORIES = ["All", "Payroll", "Rent", "Utilities", "Marketing", "Operations", "Assets", "Logistics"];

const DUMMY_EXPENSES = [
  { id: 1, description: "Staff Salaries - December", amount: 185000, date: "Dec 1, 2024", category: "Payroll", method: "Bank Transfer", ref: "EXP-2024-001" },
  { id: 2, description: "Store Rent - Main Branch", amount: 45000, date: "Dec 1, 2024", category: "Rent", method: "Bank Transfer", ref: "EXP-2024-002" },
  { id: 3, description: "Electricity & Water", amount: 12500, date: "Dec 5, 2024", category: "Utilities", method: "Online", ref: "EXP-2024-003" },
  { id: 4, description: "Google Ads Campaign", amount: 8000, date: "Dec 8, 2024", category: "Marketing", method: "Credit Card", ref: "EXP-2024-004" },
  { id: 5, description: "Packaging Materials", amount: 6200, date: "Dec 10, 2024", category: "Operations", method: "Cash", ref: "EXP-2024-005" },
  { id: 6, description: "Display Fixtures", amount: 15000, date: "Dec 12, 2024", category: "Assets", method: "Bank Transfer", ref: "EXP-2024-006" },
  { id: 7, description: "Courier Charges", amount: 3800, date: "Dec 14, 2024", category: "Logistics", method: "Online", ref: "EXP-2024-007" },
  { id: 8, description: "Internet & Phone", amount: 2400, date: "Dec 15, 2024", category: "Utilities", method: "Auto Debit", ref: "EXP-2024-008" },
];

const CAT_COLORS: Record<string, string> = {
  Payroll: "bg-purple-500/10 text-purple-500",
  Rent: "bg-blue-500/10 text-blue-500",
  Utilities: "bg-cyan-500/10 text-cyan-500",
  Marketing: "bg-pink-500/10 text-pink-500",
  Operations: "bg-amber-500/10 text-amber-500",
  Assets: "bg-emerald-500/10 text-emerald-500",
  Logistics: "bg-orange-500/10 text-orange-500",
};

export default function ExpensesPage() {
  const [search, setSearch] = React.useState("");
  const [cat, setCat] = React.useState("All");

  const filtered = DUMMY_EXPENSES.filter((e) => {
    const matchSearch = e.description.toLowerCase().includes(search.toLowerCase()) || e.ref.toLowerCase().includes(search.toLowerCase());
    const matchCat = cat === "All" || e.category === cat;
    return matchSearch && matchCat;
  });

  const total = filtered.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Expenses</h1>
          <p className="text-muted-foreground text-sm mt-1">Track and manage all business expenses</p>
        </div>
        <Button variant="gradient" className="gap-2">
          <Plus className="h-4 w-4" /> Add Expense
        </Button>
      </div>

      {/* Summary by category */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {["Payroll", "Rent", "Marketing", "Operations"].map((c) => {
          const amt = DUMMY_EXPENSES.filter((e) => e.category === c).reduce((s, e) => s + e.amount, 0);
          return (
            <div key={c} className="rounded-xl border bg-card p-4">
              <p className="text-xs text-muted-foreground">{c}</p>
              <p className="text-xl font-bold mt-1 text-red-500">LKR {amt.toLocaleString()}</p>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search expenses..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${cat === c ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/20">
          <span className="text-sm font-medium text-muted-foreground">{filtered.length} expenses</span>
          <span className="text-sm font-bold text-red-500">Total: LKR {total.toLocaleString()}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/30">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Ref</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Description</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Category</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Method</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Amount</th>
            </tr></thead>
            <tbody>
              {filtered.map((exp, i) => (
                <motion.tr
                  key={exp.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.03 }}
                  className="border-b last:border-0 hover:bg-muted/20 transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{exp.ref}</td>
                  <td className="px-4 py-3 font-medium">{exp.description}</td>
                  <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CAT_COLORS[exp.category] ?? "bg-muted"}`}>{exp.category}</span></td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{exp.date}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{exp.method}</td>
                  <td className="px-4 py-3 text-right font-bold text-red-500">LKR {exp.amount.toLocaleString()}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <TrendingDown className="h-10 w-10 mb-3 opacity-20" />
              <p className="font-medium">No expenses found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
