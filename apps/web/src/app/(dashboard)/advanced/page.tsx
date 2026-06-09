"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ERP_MODULES, ERP_PRIORITY, INDUSTRY_MODULES, allCapabilities, countByStatus, type CapabilityStatus } from "@/lib/erp-capabilities";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useShopProfile } from "@/lib/use-shop-profile";
import { ExternalLink, Filter } from "lucide-react";

const STATUS_STYLE: Record<CapabilityStatus, string> = {
  live: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  partial: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  planned: "bg-slate-500/10 text-slate-600 border-slate-500/20",
};

const MODULE_LINKS: Record<string, string> = {
  inventory: "/inventory",
  pos: "/pos",
  purchases: "/purchases",
  crm: "/customers",
  analytics: "/analytics",
  accounting: "/accounting",
  hr: "/hr",
  security: "/settings",
  saas: "/features",
  workflow: "/workflows",
};

const FEATURE_LINKS: Record<string, string> = {
  "pos-billing": "/pos",
  "pos-hold": "/pos",
  "pos-park": "/pos",
  "pos-split-pay": "/pos",
  "pos-split-bill": "/pos",
  "pos-cust-discount": "/pos",
  "pos-promo-engine": "/promotions",
  "pos-voucher": "/promotions",
  "pos-store-credit": "/customers",
  "pos-partial-pay": "/pos",
  "inv-ledger": "/inventory",
  "inv-batch": "/inventory",
  "po-approval": "/purchases",
  "crm-wallet": "/customers",
  "crm-loyalty-tiers": "/customers",
  "wf-po": "/workflows",
};

type Filter = "all" | CapabilityStatus;

export default function AdvancedErpPage() {
  const profile = useShopProfile();
  const all = allCapabilities();
  const totals = countByStatus(all);
  const industry = INDUSTRY_MODULES.find((m) => m.type === profile.type);
  const [filter, setFilter] = useState<Filter>("all");
  const livePct = Math.round((totals.live / all.length) * 100);

  const filteredModules = useMemo(() => ERP_MODULES.map((mod) => ({
    ...mod,
    items: mod.items.filter((item) => filter === "all" || item.status === filter),
  })).filter((mod) => mod.items.length > 0), [filter]);

  return (
    <div className="p-6 space-y-8 max-w-[1200px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">ShopERP Advanced Capabilities</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {profile.emoji} {profile.label} — {livePct}% features live in production
          </p>
        </div>
        <Link href="/settings/vertical-audit" className="text-sm text-primary hover:underline inline-flex items-center gap-1">
          Vertical QA audit <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="rounded-xl border bg-card p-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="font-medium">Overall readiness</span>
          <span className="text-muted-foreground">{totals.live} / {all.length} live</span>
        </div>
        <div className="h-2.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${livePct}%` }} />
        </div>
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span className="text-emerald-600">{totals.live} live</span>
          <span className="text-amber-600">{totals.partial} partial</span>
          <span>{totals.planned} planned</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Live", value: totals.live, color: "text-emerald-600", key: "live" as const },
          { label: "Partial", value: totals.partial, color: "text-amber-600", key: "partial" as const },
          { label: "Planned", value: totals.planned, color: "text-slate-500", key: "planned" as const },
        ].map((s) => (
          <button key={s.label} type="button" onClick={() => setFilter(filter === s.key ? "all" : s.key)}>
            <Card className={`transition-all ${filter === s.key ? "ring-2 ring-primary" : "hover:bg-muted/30"}`}>
              <CardContent className="p-4 text-center">
                <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label} features</p>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Filter className="h-4 w-4" />
        Filter: <Badge variant="outline">{filter === "all" ? "All features" : filter}</Badge>
        {filter !== "all" && (
          <button type="button" className="text-primary text-xs" onClick={() => setFilter("all")}>Clear</button>
        )}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Development Priority</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {ERP_PRIORITY.map((p) => (
            <div key={p.rank} className="flex items-center justify-between py-1.5 border-b last:border-0">
              <span className="text-sm"><span className="text-muted-foreground mr-2">#{p.rank}</span>{p.label}</span>
              <Badge className={STATUS_STYLE[p.status]}>{p.status}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      {industry && (
        <Card>
          <CardHeader><CardTitle className="text-base">{industry.emoji} Your Industry Modules</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {industry.items.map((item) => (
              <Badge key={item.label} className={STATUS_STYLE[item.status]}>{item.label}</Badge>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredModules.map((mod) => (
          <Card key={mod.title}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between gap-2">
                <span>{mod.icon} {mod.title}</span>
                {MODULE_LINKS[mod.items[0]?.module] && (
                  <Link href={MODULE_LINKS[mod.items[0].module]} className="text-[10px] text-primary font-normal inline-flex items-center gap-0.5">
                    Open <ExternalLink className="h-3 w-3" />
                  </Link>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {mod.items.map((item) => {
                const href = FEATURE_LINKS[item.id] ?? MODULE_LINKS[item.module];
                return (
                  <div key={item.id} className="flex items-center justify-between text-xs py-0.5 group">
                    {href ? (
                      <Link href={href} className="hover:text-primary transition-colors flex items-center gap-1">
                        {item.label}
                        <ExternalLink className="h-2.5 w-2.5 opacity-0 group-hover:opacity-60" />
                      </Link>
                    ) : (
                      <span>{item.label}</span>
                    )}
                    <Badge variant="outline" className={`text-[9px] h-5 capitalize ${STATUS_STYLE[item.status]}`}>{item.status}</Badge>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
