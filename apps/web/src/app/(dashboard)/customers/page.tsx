"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Plus, Search, Phone, Mail, Star, Crown,
  Users, UserCheck, Gift, MoreHorizontal, Eye, Edit, Trash2,
  RefreshCw, Download, Diamond, Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatNumber, getInitials } from "@/lib/utils";
import { AddCustomerModal, type Customer } from "@/components/customers/add-customer-modal";
import { ViewCustomerModal } from "@/components/customers/view-customer-modal";

// ── Tier config ───────────────────────────────────────────────────────────
const TIER_CONF: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  BRONZE:   { label: "Bronze",   color: "text-amber-700",  bg: "bg-amber-700/10",  icon: Star },
  SILVER:   { label: "Silver",   color: "text-slate-400",  bg: "bg-slate-400/10",  icon: Star },
  GOLD:     { label: "Gold",     color: "text-amber-500",  bg: "bg-amber-500/10",  icon: Crown },
  PLATINUM: { label: "Platinum", color: "text-violet-400", bg: "bg-violet-400/10", icon: Crown },
  DIAMOND:  { label: "Diamond",  color: "text-cyan-400",   bg: "bg-cyan-400/10",   icon: Diamond },
};

// ── CSV export ────────────────────────────────────────────────────────────
function exportCsv(customers: Customer[]) {
  const rows = customers.map((c) => [
    `"${c.firstName} ${c.lastName ?? ""}"`, `"${c.phone}"`, `"${c.email ?? ""}"`,
    c.tier, c.totalSpent, c.totalOrders, c.loyaltyPoints, c.walletBalance,
  ].join(","));
  const csv = ["Name,Phone,Email,Tier,TotalSpent,Orders,Points,Wallet", ...rows].join("\n");
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })), download: "customers-export.csv" });
  a.click();
}

// ── Page ─────────────────────────────────────────────────────────────────
export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [tierFilter, setTierFilter] = useState("ALL");
  const [addOpen, setAddOpen]     = useState(false);
  const [editCustomer, setEditCustomer] = useState<Customer | undefined>();
  const [viewId, setViewId]       = useState<string | null>(null);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: Customer[] }>("/customers?limit=500");
      setCustomers(res.data?.data ?? (res.data as unknown as Customer[]) ?? []);
    } catch { toast.error("Failed to load customers"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  const handleDelete = async (c: Customer) => {
    if (!window.confirm(`Delete ${c.firstName}? This cannot be undone.`)) return;
    try {
      await api.delete(`/customers/${c.id}`);
      toast.success("Customer deleted");
      fetchCustomers();
    } catch (e: unknown) { toast.error((e as Error).message ?? "Delete failed"); }
  };

  // filter
  const filtered = customers.filter((c) => {
    const q = search.toLowerCase();
    const matchSearch = !q || `${c.firstName} ${c.lastName ?? ""}`.toLowerCase().includes(q) ||
      c.phone.includes(q) || c.email?.toLowerCase().includes(q);
    const matchTier = tierFilter === "ALL" || c.tier === tierFilter;
    return matchSearch && matchTier;
  });

  // stats
  const totalPoints  = customers.reduce((s, c) => s + c.loyaltyPoints, 0);
  const totalWallet  = customers.reduce((s, c) => s + c.walletBalance, 0);
  const premium      = customers.filter((c) => ["GOLD","PLATINUM","DIAMOND"].includes(c.tier)).length;
  const STATS = [
    { label: "Total Customers",  value: customers.length,           icon: Users,    color: "text-blue-500",    bg: "bg-blue-500/10" },
    { label: "Gold+ Members",    value: premium,                    icon: Crown,    color: "text-amber-500",   bg: "bg-amber-500/10" },
    { label: "Loyalty Points",   value: formatNumber(totalPoints),  icon: Gift,     color: "text-violet-500",  bg: "bg-violet-500/10" },
    { label: "Wallet Balance",   value: `₹${formatNumber(totalWallet)}`, icon: Wallet, color: "text-emerald-500", bg: "bg-emerald-500/10" },
  ];

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Customers & CRM</h1>
          <p className="text-sm text-muted-foreground">Manage customer relationships and loyalty</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={fetchCustomers} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportCsv(customers)} disabled={!customers.length} className="gap-1.5">
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => { setEditCustomer(undefined); setAddOpen(true); }}>
            <Plus className="h-3.5 w-3.5" /> Add Customer
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {STATS.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${s.bg}`}><s.icon className={`h-5 w-5 ${s.color}`} /></div>
              <div><p className="text-xl font-bold">{s.value}</p><p className="text-xs text-muted-foreground">{s.label}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search + filter bar */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search name, phone, email…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={tierFilter} onValueChange={setTierFilter}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Tiers</SelectItem>
            {Object.entries(TIER_CONF).map(([v, c]) => (
              <SelectItem key={v} value={v}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground self-center">{filtered.length} customers</span>
      </div>

      {/* Customer cards */}
      {filtered.length === 0 && !loading && (
        <div className="text-center py-16 text-muted-foreground">
          <UserCheck className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No customers found</p>
          <p className="text-sm mt-1">Try adjusting your search or add a new customer</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((customer, i) => {
          const tierConf = TIER_CONF[customer.tier] ?? TIER_CONF.BRONZE;
          const TierIcon = tierConf.icon;
          const name = `${customer.firstName} ${customer.lastName ?? ""}`.trim();
          return (
            <motion.div key={customer.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
              <Card className="hover:shadow-md transition-shadow group cursor-pointer" onClick={() => setViewId(customer.id)}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-11 w-11 shrink-0">
                        <AvatarFallback className="text-sm font-semibold">{getInitials(name)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-semibold text-sm">{name}</p>
                        <div className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full mt-0.5 ${tierConf.bg} ${tierConf.color}`}>
                          <TierIcon className="h-2.5 w-2.5" />{tierConf.label}
                        </div>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon-sm" className="h-7 w-7 opacity-0 group-hover:opacity-100">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenuItem onClick={() => setViewId(customer.id)}>
                          <Eye className="mr-2 h-4 w-4" />View Profile
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { setEditCustomer(customer); setAddOpen(true); }}>
                          <Edit className="mr-2 h-4 w-4" />Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => handleDelete(customer)}>
                          <Trash2 className="mr-2 h-4 w-4" />Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="space-y-1 mb-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Phone className="h-3 w-3 shrink-0" />{customer.phone}
                    </div>
                    {customer.email && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Mail className="h-3 w-3 shrink-0" /><span className="truncate">{customer.email}</span>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-3 border-t">
                    <div className="text-center">
                      <p className="text-sm font-bold">₹{formatNumber(customer.totalSpent)}</p>
                      <p className="text-[10px] text-muted-foreground">Spent</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-bold">{customer.totalOrders}</p>
                      <p className="text-[10px] text-muted-foreground">Orders</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-bold text-amber-500">{formatNumber(customer.loyaltyPoints)}</p>
                      <p className="text-[10px] text-muted-foreground">Points</p>
                    </div>
                  </div>

                  {customer.walletBalance > 0 && (
                    <div className="mt-2 pt-2 border-t flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                      <Wallet className="h-3 w-3" />Wallet: ₹{formatNumber(customer.walletBalance)}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Modals */}
      <AddCustomerModal
        open={addOpen}
        onClose={() => { setAddOpen(false); setEditCustomer(undefined); }}
        onSaved={() => { fetchCustomers(); setAddOpen(false); setEditCustomer(undefined); }}
        editCustomer={editCustomer}
      />
      <ViewCustomerModal
        customerId={viewId}
        onClose={() => setViewId(null)}
        onEdit={(c) => { setEditCustomer(c); setAddOpen(true); }}
      />
    </div>
  );
}
