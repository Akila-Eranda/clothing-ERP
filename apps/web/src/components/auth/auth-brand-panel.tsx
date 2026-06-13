"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Sparkles, Shield, Zap, BarChart3, ShoppingCart, Package, Users, Store,
} from "lucide-react";
import { APP_NAME, APP_DESCRIPTION } from "@/lib/constants";
import { SHOP_TYPE_LIST, ShopType, getShopProfile } from "@/lib/shop-profiles";
import { getVerticalFeatures } from "@/lib/shop-features";
import { formatTenantSlug } from "@/lib/auth-host";
import { cn } from "@/lib/utils";

const HERO_FEATURES = [
  { icon: ShoppingCart, label: "Smart POS", desc: "Fast billing & receipts" },
  { icon: Package, label: "Inventory", desc: "Real-time stock control" },
  { icon: BarChart3, label: "Reports", desc: "Sales & profit insights" },
  { icon: Users, label: "Multi-branch", desc: "Centralised operations" },
];

const STATS = [
  { value: "5+", label: "Shop types" },
  { value: "99.9%", label: "Uptime" },
  { value: "256-bit", label: "SSL secure" },
];

interface AuthBrandPanelProps {
  shopType?: ShopType;
  tenantName?: string | null;
  tenantSubdomain?: string | null;
}

export function AuthBrandPanel({
  shopType = ShopType.CLOTHING,
  tenantName,
  tenantSubdomain,
}: AuthBrandPanelProps) {
  const profile = getShopProfile(shopType);
  const verticalFeatures = getVerticalFeatures(shopType).filter((f) => f.live).slice(0, 6);
  const workspaceLabel = tenantName ?? (tenantSubdomain ? formatTenantSlug(tenantSubdomain) : null);
  const isTenant = Boolean(workspaceLabel);

  return (
    <div className="hidden lg:flex lg:w-[58%] xl:w-[62%] relative flex-col overflow-hidden bg-[#070d1a] text-white">
      {/* Background layers */}
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(99,102,241,1) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,1) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      <div className="absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full bg-indigo-600/20 blur-3xl" />
      <div className="absolute bottom-0 right-0 h-[420px] w-[420px] rounded-full bg-violet-600/15 blur-3xl" />
      <div className="absolute inset-0 bg-gradient-to-br from-[#0a1628] via-[#0d1f3c]/90 to-[#070d1a]" />

      <div className="relative z-10 flex flex-col h-full p-10 xl:p-14">
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/30">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-lg font-black tracking-tight">{APP_NAME}</p>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-indigo-300/80">
              Multi-Shop Retail ERP
            </p>
          </div>
        </motion.div>

        {/* Hero */}
        <div className="my-auto py-10">
          {isTenant ? (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <div className="inline-flex items-center gap-2 rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-200 mb-5">
                <Store className="h-3.5 w-3.5" />
                {tenantSubdomain}.shop.hexalyte.com
              </div>
              <h1 className="text-4xl xl:text-5xl font-black leading-[1.08] mb-4">
                Welcome to<br />
                <span className="text-gradient bg-gradient-to-r from-indigo-400 to-violet-300 bg-clip-text text-transparent">
                  {workspaceLabel}
                </span>
              </h1>
              <p className="text-base text-slate-400 max-w-lg leading-relaxed mb-8">
                {profile.emoji} {profile.label} — sign in to manage POS, stock, customers, and reports from one workspace.
              </p>
              <div className="flex flex-wrap gap-2">
                {verticalFeatures.map((f) => (
                  <span
                    key={f.label}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300"
                  >
                    {f.label}
                  </span>
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <h1 className="text-4xl xl:text-5xl font-black leading-[1.08] mb-4">
                One platform for<br />
                <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-purple-400 bg-clip-text text-transparent">
                  every shop type
                </span>
              </h1>
              <p className="text-base text-slate-400 max-w-lg leading-relaxed mb-8">
                {APP_DESCRIPTION}. Clothing, grocery, hardware, agriculture & spare parts — each with industry-ready tools.
              </p>

              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-3">Supported businesses</p>
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-2.5 mb-8 max-w-xl">
                {SHOP_TYPE_LIST.map((p, i) => (
                  <motion.div
                    key={p.type}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 + i * 0.05 }}
                    className={cn(
                      "flex items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-colors",
                      shopType === p.type
                        ? "border-indigo-400/50 bg-indigo-500/15"
                        : "border-white/8 bg-white/[0.03]",
                    )}
                  >
                    <span className="text-xl">{p.emoji}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{p.label.replace(" Shop", "")}</p>
                      <p className="text-[10px] text-slate-500 truncate">{p.labelSi}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Feature cards */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35 }}
            className="grid grid-cols-2 gap-3 max-w-xl"
          >
            {HERO_FEATURES.map((f, i) => (
              <motion.div
                key={f.label}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 + i * 0.06 }}
                className="flex items-start gap-3 rounded-2xl border border-indigo-500/15 bg-white/[0.04] p-4"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500/15">
                  <f.icon className="h-4 w-4 text-indigo-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{f.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{f.desc}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>

        {/* Footer stats */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mt-auto pt-8 border-t border-indigo-500/15"
        >
          <div className="flex flex-wrap items-center gap-8 mb-4">
            {STATS.map((s) => (
              <div key={s.label}>
                <p className="text-xl font-black">{s.value}</p>
                <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-5 text-xs text-slate-500">
            <span className="flex items-center gap-1.5"><Shield className="h-3.5 w-3.5 text-emerald-400" /> SSL Secured</span>
            <span className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5 text-amber-400" /> Cloud hosted</span>
            {!isTenant && (
              <Link href="/features" className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2">
                View all features →
              </Link>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
