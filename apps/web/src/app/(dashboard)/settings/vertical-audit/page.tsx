"use client";

import { useMemo } from "react";
import Link from "next/link";
import { CheckCircle2, XCircle, AlertTriangle, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useShopWorkspace } from "@/lib/use-shop-profile";
import { hasShopModule } from "@/lib/shop-vertical";
import { SHOP_TYPE_LIST, type ShopProfile } from "@/lib/shop-profiles";

type AuditRow = {
  area: string;
  path: string;
  module?: keyof ShopProfile["modules"];
  adapted: boolean;
  note: string;
};

function StatusIcon({ ok }: { ok: boolean }) {
  return ok
    ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
    : <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />;
}

export default function VerticalAuditPage() {
  const { profile, workspace } = useShopWorkspace();
  const showBatch = profile.modules.batch;
  const showExpiry = profile.modules.expiry;

  const rows: AuditRow[] = useMemo(() => [
    { area: "Dashboard", path: "/dashboard", adapted: true, note: "Workspace titles, tips, customer label" },
    { area: "Products list", path: "/products", adapted: true, note: "Dynamic product label" },
    { area: "Add / Edit product", path: "/products/new", adapted: true, note: "Variant attrs, units, expiry/batch gates" },
    { area: "Product detail", path: "/products", adapted: profile.modules.collections, note: profile.modules.collections ? "Collections shown" : "Collections hidden for this type" },
    { area: "POS Terminal", path: "/pos", adapted: true, note: "Generic variant picker (Weight/Grade/Material/Size/Color) by business type" },
    { area: "Sales history", path: "/sales", adapted: true, note: "Generic — works for all types" },
    { area: "Returns", path: "/returns", module: "returns", adapted: hasShopModule(profile, "returns"), note: hasShopModule(profile, "returns") ? "Vertical return reasons + API guarded" : "Hidden — not for this business type" },
    { area: "Customers", path: "/customers", adapted: true, note: "Farmer/CRM title; loyalty column & API gated" },
    { area: "Inventory", path: "/inventory", adapted: true, note: `${showBatch || showExpiry ? "Batch/expiry columns + adjust fields" : "Variant attribute columns by type"}` },
    { area: "Purchase orders", path: "/purchases", adapted: true, note: "Vertical labels, approval workflow, GRN variant columns" },
    { area: "Promotions", path: "/promotions", module: "promotions", adapted: hasShopModule(profile, "promotions"), note: hasShopModule(profile, "promotions") ? "Page + API guarded" : "Hidden for this type" },
    { area: "Brands", path: "/brands", module: "brands", adapted: hasShopModule(profile, "brands"), note: hasShopModule(profile, "brands") ? "Vertical title, labels, placeholders & tips" : "Hidden — not for this business type" },
    { area: "Suppliers", path: "/suppliers", adapted: true, note: "Vertical title, labels, placeholders, tips & detail pages" },
    { area: "Quotations", path: "/quotations", module: "quotations", adapted: hasShopModule(profile, "quotations"), note: hasShopModule(profile, "quotations") ? "ClientSideTable, KPI cards, status filters & detail dialog" : "Hidden — spare parts / hardware only" },
    { area: "Workflows", path: "/workflows", adapted: true, note: "PO approval — all procurement types" },
    { area: "Wallet (customer)", path: "/customers", adapted: true, note: "Wallet tab available for all types" },
    { area: "Loyalty (customer)", path: "/customers", module: "loyalty", adapted: hasShopModule(profile, "loyalty"), note: hasShopModule(profile, "loyalty") ? "Points & tiers" : "Hidden for grocery/hardware/agri" },
    { area: "Settings", path: "/settings", adapted: true, note: "Loyalty POS toggle gated" },
    { area: "ERP Roadmap", path: "/advanced", adapted: true, note: "Industry module matrix" },
  ], [profile, showBatch, showExpiry]);

  const passCount = rows.filter((r) => r.adapted).length;
  const moduleRows = Object.entries(profile.modules) as [keyof typeof profile.modules, boolean][];

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Business Type QA Audit</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Current tenant: {profile.emoji} <strong>{profile.label}</strong> ({profile.labelSi}) — verify each area matches this vertical before production.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Active modules</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {moduleRows.map(([key, on]) => (
            <Badge key={key} variant={on ? "default" : "secondary"} className="gap-1">
              {on ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
              {key}
            </Badge>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Page scan — {passCount}/{rows.length} aligned</CardTitle>
          <Badge variant="outline">{workspace.productLabel} · {workspace.customerLabel}</Badge>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {rows.map((row) => (
              <div key={row.area} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30">
                <StatusIcon ok={row.adapted} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{row.area}</span>
                    <Link href={row.path} className="text-xs text-primary inline-flex items-center gap-0.5 hover:underline">
                      Open <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{row.note}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">All business types — module matrix</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 pr-4">Module</th>
                {SHOP_TYPE_LIST.map((p) => (
                  <th key={p.type} className="text-center py-2 px-2 font-medium">{p.emoji}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(Object.keys(SHOP_TYPE_LIST[0].modules) as (keyof typeof profile.modules)[]).map((mod) => (
                <tr key={mod} className="border-b border-muted/50">
                  <td className="py-2 pr-4 capitalize">{mod}</td>
                  {SHOP_TYPE_LIST.map((p) => (
                    <td key={p.type} className="text-center py-2 px-2">
                      {p.modules[mod] ? "✓" : "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[10px] text-muted-foreground mt-3">
            Columns: {SHOP_TYPE_LIST.map((p) => p.type).join(" · ")}
          </p>
        </CardContent>
      </Card>

      <Card className="border-amber-200 bg-amber-50/50">
        <CardContent className="pt-4 text-xs space-y-2">
          <p className="font-semibold text-amber-900">Production checklist (manual)</p>
          <ul className="list-disc pl-4 text-amber-800 space-y-1">
            <li>Login as each demo tenant (clothing, grocery, hardware, agri) and open this page</li>
            <li>Add a product — confirm variant fields match business (size/color vs weight/grade)</li>
            <li>POS: hold bill, checkout — stock should reserve/release correctly</li>
            <li>Grocery/Agri: expiry & batch fields on product form</li>
            <li>Clothing only: Returns, Loyalty, Collections, Hang tags</li>
            <li>Backend APIs enforce business modules (returns, promotions, loyalty)</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
