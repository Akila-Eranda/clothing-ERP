"use client";

import { ERP_MODULES, ERP_PRIORITY, INDUSTRY_MODULES, allCapabilities, countByStatus } from "@/lib/erp-capabilities";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useShopProfile } from "@/lib/use-shop-profile";

const STATUS_STYLE = {
  live: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  partial: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  planned: "bg-slate-500/10 text-slate-600 border-slate-500/20",
};

export default function AdvancedErpPage() {
  const profile = useShopProfile();
  const all = allCapabilities();
  const totals = countByStatus(all);
  const industry = INDUSTRY_MODULES.find((m) => m.type === profile.type);

  return (
    <div className="p-6 space-y-8 max-w-[1200px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold">ShopERP Advanced Capabilities</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {profile.emoji} {profile.label} — full feature roadmap & live status
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Live", value: totals.live, color: "text-emerald-600" },
          { label: "Partial", value: totals.partial, color: "text-amber-600" },
          { label: "Planned", value: totals.planned, color: "text-slate-500" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 text-center">
              <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label} features</p>
            </CardContent>
          </Card>
        ))}
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
        {ERP_MODULES.map((mod) => (
          <Card key={mod.title}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">{mod.icon} {mod.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {mod.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between text-xs py-0.5">
                  <span>{item.label}</span>
                  <Badge variant="outline" className={`text-[9px] h-5 ${STATUS_STYLE[item.status]}`}>{item.status}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
