"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Building2, MapPin, Phone, Users, Package, TrendingUp, Plus, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const DUMMY_BRANCHES = [
  { id: "B001", name: "Main Store - Bandra", code: "HO-001", city: "Mumbai", state: "Maharashtra", phone: "+91 22 1234 5678", staff: 12, stock: 1842, monthlyRevenue: 680000, isHQ: true, manager: "Arun Kumar" },
  { id: "B002", name: "Andheri Branch", code: "BR-002", city: "Mumbai", state: "Maharashtra", phone: "+91 22 9876 5432", staff: 8, stock: 1124, monthlyRevenue: 425000, isHQ: false, manager: "Priya Singh" },
  { id: "B003", name: "Pune Branch", code: "BR-003", city: "Pune", state: "Maharashtra", phone: "+91 20 1234 5678", staff: 6, stock: 896, monthlyRevenue: 310000, isHQ: false, manager: "Vikram Joshi" },
  { id: "B004", name: "Nashik Outlet", code: "BR-004", city: "Nashik", state: "Maharashtra", phone: "+91 253 123 4567", staff: 4, stock: 612, monthlyRevenue: 185000, isHQ: false, manager: "Sunita Patil" },
];

export default function BranchesPage() {
  const [search, setSearch] = React.useState("");
  const filtered = DUMMY_BRANCHES.filter((b) =>
    b.name.toLowerCase().includes(search.toLowerCase()) || b.city.toLowerCase().includes(search.toLowerCase())
  );

  const totalRevenue = DUMMY_BRANCHES.reduce((s, b) => s + b.monthlyRevenue, 0);
  const totalStaff = DUMMY_BRANCHES.reduce((s, b) => s + b.staff, 0);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Branches</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage all store locations and branches</p>
        </div>
        <Button variant="gradient" className="gap-2">
          <Plus className="h-4 w-4" /> Add Branch
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Branches", value: DUMMY_BRANCHES.length },
          { label: "Total Staff", value: totalStaff },
          { label: "Total Stock", value: DUMMY_BRANCHES.reduce((s, b) => s + b.stock, 0).toLocaleString() },
          { label: "Combined Revenue", value: `₹${(totalRevenue / 1000).toFixed(0)}K` },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className="text-2xl font-bold mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="relative max-w-sm">
        <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search branches..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((branch, i) => (
          <motion.div
            key={branch.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07 }}
            className="rounded-xl border bg-card p-5 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">{branch.name}</p>
                    {branch.isHQ && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-primary/10 text-primary">HQ</span>}
                  </div>
                  <p className="text-xs text-muted-foreground font-mono">{branch.code}</p>
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm"><MoreHorizontal className="h-4 w-4" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>View Details</DropdownMenuItem>
                  <DropdownMenuItem>Edit Branch</DropdownMenuItem>
                  <DropdownMenuItem>View Inventory</DropdownMenuItem>
                  <DropdownMenuItem>View Sales</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span>{branch.city}, {branch.state}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Phone className="h-3.5 w-3.5 shrink-0" />
                <span>{branch.phone}</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t">
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                  <Users className="h-3.5 w-3.5" />
                </div>
                <p className="text-lg font-bold">{branch.staff}</p>
                <p className="text-[10px] text-muted-foreground">Staff</p>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                  <Package className="h-3.5 w-3.5" />
                </div>
                <p className="text-lg font-bold">{branch.stock.toLocaleString()}</p>
                <p className="text-[10px] text-muted-foreground">Stock</p>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                  <TrendingUp className="h-3.5 w-3.5" />
                </div>
                <p className="text-lg font-bold text-primary">₹{(branch.monthlyRevenue / 1000).toFixed(0)}K</p>
                <p className="text-[10px] text-muted-foreground">Revenue</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
