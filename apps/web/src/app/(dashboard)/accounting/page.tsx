"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { BookOpen, TrendingUp, TrendingDown, DollarSign, Plus, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";

const MONTHLY_PL = [
  { month: "Jul", revenue: 420000, expenses: 180000, profit: 240000 },
  { month: "Aug", revenue: 385000, expenses: 162000, profit: 223000 },
  { month: "Sep", revenue: 510000, expenses: 195000, profit: 315000 },
  { month: "Oct", revenue: 475000, expenses: 188000, profit: 287000 },
  { month: "Nov", revenue: 620000, expenses: 215000, profit: 405000 },
  { month: "Dec", revenue: 680000, expenses: 232000, profit: 448000 },
];

const EXPENSES = [
  { id: 1, description: "Staff Salaries", amount: 185000, date: "Dec 1, 2024", category: "Payroll", method: "Bank Transfer" },
  { id: 2, description: "Store Rent", amount: 45000, date: "Dec 1, 2024", category: "Rent", method: "Bank Transfer" },
  { id: 3, description: "Electricity Bill", amount: 12500, date: "Dec 5, 2024", category: "Utilities", method: "Online" },
  { id: 4, description: "Marketing - Google Ads", amount: 8000, date: "Dec 8, 2024", category: "Marketing", method: "Credit Card" },
  { id: 5, description: "Packaging Materials", amount: 6200, date: "Dec 10, 2024", category: "Operations", method: "Cash" },
  { id: 6, description: "Display Fixtures", amount: 15000, date: "Dec 12, 2024", category: "Assets", method: "Bank Transfer" },
];

const ACCOUNTS = [
  { name: "Cash in Hand", type: "Asset", balance: 85420, trend: "up" },
  { name: "Bank - HDFC Current", type: "Asset", balance: 1245000, trend: "up" },
  { name: "Accounts Receivable", type: "Asset", balance: 32500, trend: "down" },
  { name: "Accounts Payable", type: "Liability", balance: -125000, trend: "neutral" },
  { name: "Sales Revenue", type: "Revenue", balance: 680000, trend: "up" },
  { name: "Cost of Goods", type: "Expense", balance: -380000, trend: "neutral" },
];

export default function AccountingPage() {
  const totalRevenue = MONTHLY_PL[MONTHLY_PL.length - 1].revenue;
  const totalExpenses = MONTHLY_PL[MONTHLY_PL.length - 1].expenses;
  const netProfit = MONTHLY_PL[MONTHLY_PL.length - 1].profit;
  const profitMargin = ((netProfit / totalRevenue) * 100).toFixed(1);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Accounting</h1>
          <p className="text-muted-foreground text-sm mt-1">Financial overview and expense management</p>
        </div>
        <Button variant="gradient" className="gap-2">
          <Plus className="h-4 w-4" /> Record Expense
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Monthly Revenue", value: `LKR ${(totalRevenue / 1000).toFixed(0)}K`, icon: TrendingUp, delta: "+12.4%", positive: true },
          { label: "Total Expenses", value: `LKR ${(totalExpenses / 1000).toFixed(0)}K`, icon: TrendingDown, delta: "+4.2%", positive: false },
          { label: "Net Profit", value: `LKR ${(netProfit / 1000).toFixed(0)}K`, icon: DollarSign, delta: "+18.1%", positive: true },
          { label: "Profit Margin", value: `${profitMargin}%`, icon: BookOpen, delta: "+2.3%", positive: true },
        ].map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07 }}
            className="rounded-xl border bg-card p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-muted-foreground">{card.label}</p>
              <card.icon className={`h-4 w-4 ${card.positive ? "text-emerald-500" : "text-red-500"}`} />
            </div>
            <p className="text-2xl font-bold">{card.value}</p>
            <div className={`flex items-center gap-1 mt-1 text-xs font-medium ${card.positive ? "text-emerald-500" : "text-red-500"}`}>
              {card.positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {card.delta} vs last month
            </div>
          </motion.div>
        ))}
      </div>

      <Tabs defaultValue="pl">
        <TabsList>
          <TabsTrigger value="pl">P&L</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="accounts">Chart of Accounts</TabsTrigger>
        </TabsList>

        <TabsContent value="pl" className="mt-4">
          <div className="rounded-xl border bg-card p-6">
            <h3 className="font-semibold mb-4">Revenue vs Expenses (Last 6 Months)</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={MONTHLY_PL} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v) => `LKR ${v / 1000}K`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => [`LKR ${v.toLocaleString()}`, ""]} />
                <Bar dataKey="revenue" name="Revenue" fill="#6366f1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expenses" name="Expenses" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="profit" name="Profit" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </TabsContent>

        <TabsContent value="expenses" className="mt-4">
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="font-semibold">December 2024 Expenses</h3>
              <p className="text-sm font-bold text-red-500">Total: LKR {EXPENSES.reduce((s, e) => s + e.amount, 0).toLocaleString()}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-muted/30">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Description</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Category</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Method</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Amount</th>
                </tr></thead>
                <tbody>
                  {EXPENSES.map((exp) => (
                    <tr key={exp.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-medium">{exp.description}</td>
                      <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-full bg-muted text-xs font-medium">{exp.category}</span></td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{exp.date}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{exp.method}</td>
                      <td className="px-4 py-3 text-right font-bold text-red-500">LKR {exp.amount.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="accounts" className="mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {ACCOUNTS.map((acc, i) => (
              <motion.div
                key={acc.name}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                className="rounded-xl border bg-card p-4"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">{acc.type}</p>
                    <p className="font-semibold mt-1">{acc.name}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    acc.type === "Asset" ? "bg-emerald-500/10 text-emerald-500" :
                    acc.type === "Liability" ? "bg-red-500/10 text-red-500" :
                    acc.type === "Revenue" ? "bg-blue-500/10 text-blue-500" :
                    "bg-amber-500/10 text-amber-500"
                  }`}>{acc.type}</span>
                </div>
                <p className={`text-xl font-bold mt-3 ${acc.balance >= 0 ? "text-foreground" : "text-red-500"}`}>
                  {acc.balance < 0 ? "-" : ""}LKR {Math.abs(acc.balance).toLocaleString()}
                </p>
              </motion.div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
