"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  Plus, Search, Phone, Mail, Star, Crown, TrendingUp,
  Users, UserCheck, Gift, MoreHorizontal, Eye, Edit, MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatNumber, getInitials } from "@/lib/utils";
import { DUMMY_CUSTOMERS } from "@/lib/constants";

const TIER_CONFIG: Record<string, { color: string; icon: React.ElementType; badge: string }> = {
  bronze: { color: "text-amber-700", icon: Star, badge: "warning" },
  silver: { color: "text-slate-400", icon: Star, badge: "secondary" },
  gold: { color: "text-amber-500", icon: Crown, badge: "gold" },
  platinum: { color: "text-violet-400", icon: Crown, badge: "purple" },
};

const STATS = [
  { label: "Total Customers", value: "4,823", icon: Users, color: "text-blue-500", bg: "bg-blue-500/10" },
  { label: "Active (30d)", value: "1,247", icon: UserCheck, color: "text-emerald-500", bg: "bg-emerald-500/10" },
  { label: "Gold & Platinum", value: "389", icon: Crown, color: "text-amber-500", bg: "bg-amber-500/10" },
  { label: "Loyalty Points", value: "2.4M", icon: Gift, color: "text-violet-500", bg: "bg-violet-500/10" },
];

export default function CustomersPage() {
  const [search, setSearch] = React.useState("");

  const filtered = DUMMY_CUSTOMERS.filter((c) => {
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.phone.includes(q) || c.email?.toLowerCase().includes(q);
  });

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Customers & CRM</h1>
          <p className="text-sm text-muted-foreground">Manage customer relationships and loyalty</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" />
            Bulk Message
          </Button>
          <Button variant="gradient" size="sm" className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Add Customer
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

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, phone, email..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Customers grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((customer, i) => {
          const tierConf = TIER_CONFIG[customer.tier] || TIER_CONFIG.bronze;
          const TierIcon = tierConf.icon;
          return (
            <motion.div
              key={customer.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <Card className="hover:shadow-md transition-shadow group">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-11 w-11">
                        <AvatarFallback className="text-sm font-semibold">
                          {getInitials(customer.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-semibold text-sm">{customer.name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <TierIcon className={`h-3 w-3 ${tierConf.color}`} />
                          <span className={`text-xs font-medium capitalize ${tierConf.color}`}>
                            {customer.tier}
                          </span>
                        </div>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" className="h-7 w-7 opacity-0 group-hover:opacity-100">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem><Eye className="mr-2 h-4 w-4" />View Profile</DropdownMenuItem>
                        <DropdownMenuItem><Edit className="mr-2 h-4 w-4" />Edit</DropdownMenuItem>
                        <DropdownMenuItem><MessageSquare className="mr-2 h-4 w-4" />Send Message</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="space-y-1.5 mb-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Phone className="h-3 w-3 shrink-0" />
                      <span>{customer.phone}</span>
                    </div>
                    {customer.email && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Mail className="h-3 w-3 shrink-0" />
                        <span className="truncate">{customer.email}</span>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-3 border-t border-border">
                    <div className="text-center">
                      <p className="text-sm font-bold">₹{formatNumber(customer.spent)}</p>
                      <p className="text-[10px] text-muted-foreground">Total Spent</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-bold">{customer.orders}</p>
                      <p className="text-[10px] text-muted-foreground">Orders</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-bold text-amber-500">{formatNumber(customer.points)}</p>
                      <p className="text-[10px] text-muted-foreground">Points</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
