"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Zap, Plus, Tag, Clock, ToggleLeft, ToggleRight, Percent, Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const DUMMY_PROMOS = [
  { id: "PROMO001", name: "Winter Sale 2024", code: "WINTER20", type: "percentage", discount: 20, minOrder: 1000, maxDiscount: 500, uses: 142, maxUses: 500, active: true, expiry: "Dec 31, 2024" },
  { id: "PROMO002", name: "New Year Flash", code: "NY2025", type: "percentage", discount: 30, minOrder: 2000, maxDiscount: 1000, uses: 0, maxUses: 200, active: true, expiry: "Jan 2, 2025" },
  { id: "PROMO003", name: "Flat LKR 200 Off", code: "FLAT200", type: "fixed", discount: 200, minOrder: 800, maxDiscount: 200, uses: 89, maxUses: 1000, active: true, expiry: "Dec 25, 2024" },
  { id: "PROMO004", name: "Buy 3 Get 1 Free", code: "B3G1", type: "bogo", discount: 100, minOrder: 0, maxDiscount: null, uses: 34, maxUses: 300, active: false, expiry: "Dec 15, 2024" },
  { id: "PROMO005", name: "Diwali Special", code: "DIWALI25", type: "percentage", discount: 25, minOrder: 1500, maxDiscount: 750, uses: 421, maxUses: 500, active: false, expiry: "Nov 5, 2024" },
];

export default function PromotionsPage() {
  const [promos, setPromos] = React.useState(DUMMY_PROMOS);

  const toggle = (id: string) => setPromos((prev) => prev.map((p) => p.id === id ? { ...p, active: !p.active } : p));

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Promotions & Coupons</h1>
          <p className="text-muted-foreground text-sm mt-1">Create and manage discount coupons and offers</p>
        </div>
        <Button variant="gradient" className="gap-2">
          <Plus className="h-4 w-4" /> Create Promo
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Active Promos", value: promos.filter((p) => p.active).length, color: "text-emerald-500" },
          { label: "Total Coupons Used", value: promos.reduce((s, p) => s + p.uses, 0), color: "text-blue-500" },
          { label: "Avg Discount", value: "22%", color: "text-amber-500" },
          { label: "Est. Revenue Impact", value: "LKR 42K", color: "text-primary" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {promos.map((promo, i) => (
          <motion.div
            key={promo.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            className={`rounded-xl border bg-card p-5 transition-all ${promo.active ? "border-primary/20" : "opacity-70"}`}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="font-semibold">{promo.name}</p>
                <div className="flex items-center gap-2 mt-1">
                  <code className="px-2 py-0.5 rounded bg-primary/10 text-primary text-xs font-mono font-bold">{promo.code}</code>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    promo.type === "percentage" ? "bg-blue-500/10 text-blue-500" :
                    promo.type === "fixed" ? "bg-emerald-500/10 text-emerald-500" :
                    "bg-purple-500/10 text-purple-500"
                  }`}>
                    {promo.type === "percentage" ? `${promo.discount}% off` : promo.type === "fixed" ? `LKR ${promo.discount} off` : "BOGO"}
                  </span>
                </div>
              </div>
              <button onClick={() => toggle(promo.id)}>
                {promo.active
                  ? <ToggleRight className="h-6 w-6 text-primary" />
                  : <ToggleLeft className="h-6 w-6 text-muted-foreground" />}
              </button>
            </div>

            <div className="space-y-1.5 text-xs text-muted-foreground">
              {promo.minOrder > 0 && <p>Min order: LKR {promo.minOrder.toLocaleString()}</p>}
              {promo.maxDiscount && <p>Max discount: LKR {promo.maxDiscount.toLocaleString()}</p>}
              <div className="flex items-center gap-1"><Clock className="h-3 w-3" /> Expires: {promo.expiry}</div>
            </div>

            {/* Usage bar */}
            <div className="mt-3 pt-3 border-t">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-muted-foreground">{promo.uses} / {promo.maxUses} used</span>
                <span className="font-medium">{Math.round((promo.uses / promo.maxUses) * 100)}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${Math.min((promo.uses / promo.maxUses) * 100, 100)}%` }}
                />
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
