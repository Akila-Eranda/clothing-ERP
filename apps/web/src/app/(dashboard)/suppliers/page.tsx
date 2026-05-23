"use client";

import * as React from "react";
import { Truck, Plus, Search, Phone, Mail, MapPin, Star, MoreHorizontal, Eye, Edit } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatNumber } from "@/lib/utils";

const DUMMY_SUPPLIERS = [
  { id: "1", name: "TextileCo India", category: "Fabrics", contact: "Rajiv Mehta", phone: "+91 98001 12345", email: "rajiv@textileco.com", city: "Surat", rating: 4.8, orders: 124, balance: 0 },
  { id: "2", name: "DenimWorld", category: "Denim", contact: "Sneha Joshi", phone: "+91 97002 23456", email: "sneha@denimworld.com", city: "Ahmedabad", rating: 4.5, orders: 89, balance: 25000 },
  { id: "3", name: "FashionKnits", category: "Knitwear", contact: "Arjun Patel", phone: "+91 96003 34567", email: "arjun@fashionknits.com", city: "Ludhiana", rating: 4.2, orders: 67, balance: 0 },
  { id: "4", name: "ShoeFactory", category: "Footwear", contact: "Priya Kapoor", phone: "+91 95004 45678", email: "priya@shoefactory.com", city: "Agra", rating: 4.6, orders: 45, balance: 12000 },
];

export default function SuppliersPage() {
  const [search, setSearch] = React.useState("");
  const filtered = DUMMY_SUPPLIERS.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) || s.category.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Suppliers</h1>
          <p className="text-sm text-muted-foreground">Manage your vendor relationships and purchase orders</p>
        </div>
        <Button variant="gradient" size="sm" className="gap-1.5"><Plus className="h-3.5 w-3.5" />Add Supplier</Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search suppliers..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((s, i) => (
          <motion.div key={s.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className="hover:shadow-md transition-shadow group">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-semibold">{s.name}</p>
                    <Badge variant="secondary" className="text-[10px] mt-1">{s.category}</Badge>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" className="h-7 w-7 opacity-0 group-hover:opacity-100">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem><Eye className="mr-2 h-4 w-4" />View</DropdownMenuItem>
                      <DropdownMenuItem><Edit className="mr-2 h-4 w-4" />Edit</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="space-y-1.5 text-xs text-muted-foreground mb-3">
                  <div className="flex items-center gap-2"><Phone className="h-3 w-3" />{s.phone}</div>
                  <div className="flex items-center gap-2"><Mail className="h-3 w-3" />{s.email}</div>
                  <div className="flex items-center gap-2"><MapPin className="h-3 w-3" />{s.city}</div>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-3 border-t border-border">
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-0.5">
                      <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
                      <span className="text-sm font-bold">{s.rating}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">Rating</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold">{s.orders}</p>
                    <p className="text-[10px] text-muted-foreground">Orders</p>
                  </div>
                  <div className="text-center">
                    <p className={`text-sm font-bold ${s.balance > 0 ? "text-amber-500" : "text-emerald-500"}`}>
                      {s.balance > 0 ? `₹${formatNumber(s.balance)}` : "Clear"}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Balance</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
