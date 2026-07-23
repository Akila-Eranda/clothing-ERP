"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Shield, Zap, Check } from "lucide-react";
import { APP_DESCRIPTION } from "@/lib/constants";
import { AppLogo } from "@/components/brand/app-logo";
import { SHOP_TYPE_LIST, ShopType, getShopProfile } from "@/lib/shop-profiles";
import { getVerticalFeatures } from "@/lib/shop-features";
import { formatTenantSlug } from "@/lib/auth-host";
import { cn } from "@/lib/utils";

interface AuthBrandPanelProps {
  shopType?: ShopType | null;
  tenantName?: string | null;
  tenantSubdomain?: string | null;
  /** True while resolving tenant profile — avoid wrong vertical FOUC */
  loading?: boolean;
}

export function AuthBrandPanel({
  shopType = null,
  tenantName,
  tenantSubdomain,
  loading = false,
}: AuthBrandPanelProps) {
  const resolvedType = shopType ?? ShopType.CLOTHING;
  const profile = getShopProfile(resolvedType);
  const verticalFeatures = getVerticalFeatures(resolvedType).filter((f) => f.live).slice(0, 5);
  const workspaceLabel = tenantName ?? (tenantSubdomain ? formatTenantSlug(tenantSubdomain) : null);
  const isTenant = Boolean(workspaceLabel || tenantSubdomain);
  const showVertical = Boolean(shopType) && !loading;

  return (
    <div className="hidden lg:flex lg:w-1/2 relative flex-col min-h-screen overflow-hidden bg-[#070d1a] text-white">
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(99,102,241,1) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,1) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
        }}
      />
      <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-indigo-600/20 blur-3xl" />
      <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-violet-600/15 blur-3xl" />
      <div className="absolute inset-0 bg-gradient-to-br from-[#0a1628] via-[#0d1f3c]/95 to-[#070d1a]" />

      <div className="relative z-10 flex flex-col flex-1 p-10 xl:p-12 max-w-xl mx-auto w-full">
        {/* Logo */}
        <div className="shrink-0">
          <AppLogo variant="hero" theme="dark" className="items-start" />
        </div>

        {/* Main content — vertically centred */}
        <div className="flex-1 flex flex-col justify-center py-8">
          {isTenant ? (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {tenantSubdomain && (
                <p className="text-xs font-mono text-indigo-300/70">
                  {tenantSubdomain}.shop.hexalyte.com
                </p>
              )}

              <div>
                <h1 className="text-3xl xl:text-4xl font-black leading-tight mb-3">
                  Welcome to{" "}
                  <span className="bg-gradient-to-r from-indigo-400 to-violet-300 bg-clip-text text-transparent">
                    {workspaceLabel ?? "your shop"}
                  </span>
                </h1>
                <p className="text-sm text-slate-400 leading-relaxed">
                  {loading || !showVertical ? (
                    <>Sign in to manage POS, inventory, and reports.</>
                  ) : (
                    <>
                      {profile.emoji}{" "}
                      <span className="text-slate-300 font-medium">{profile.label}</span>
                      {" — "}sign in to manage POS, inventory, and reports.
                    </>
                  )}
                </p>
              </div>

              {loading || !showVertical ? (
                <div className="space-y-2.5" aria-hidden>
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-5 rounded-md bg-white/5 animate-pulse" style={{ width: `${72 - i * 12}%` }} />
                  ))}
                </div>
              ) : (
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-3">
                    Your workspace includes
                  </p>
                  <ul className="space-y-2.5">
                    {verticalFeatures.map((f) => (
                      <li key={f.label} className="flex items-center gap-2.5 text-sm text-slate-300">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-500/20">
                          <Check className="h-3 w-3 text-indigo-300" />
                        </span>
                        {f.label}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div>
                <h1 className="text-3xl xl:text-4xl font-black leading-tight mb-3">
                  One platform for{" "}
                  <span className="bg-gradient-to-r from-indigo-400 to-violet-300 bg-clip-text text-transparent">
                    every shop
                  </span>
                </h1>
                <p className="text-sm text-slate-400 leading-relaxed">
                  {APP_DESCRIPTION}
                </p>
              </div>

              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-3">
                  Supported businesses
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {SHOP_TYPE_LIST.map((p) => (
                    <div
                      key={p.type}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border px-3 py-2",
                        shopType != null && shopType === p.type
                          ? "border-indigo-400/40 bg-indigo-500/10"
                          : "border-white/8 bg-white/[0.03]",
                      )}
                    >
                      <span className="text-base">{p.emoji}</span>
                      <span className="text-xs font-medium text-slate-300 truncate">
                        {p.label.replace(" Shop", "")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <Link
                href="/features"
                className="inline-block text-xs text-indigo-400 hover:text-indigo-300 underline underline-offset-2"
              >
                View all features →
              </Link>
            </motion.div>
          )}
        </div>

        {/* Footer — pinned to bottom */}
        <div className="shrink-0 mt-auto pt-8 flex items-center gap-5 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5 text-emerald-400" /> SSL Secured
          </span>
          <span className="flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-amber-400" /> Cloud hosted
          </span>
        </div>
      </div>
    </div>
  );
}
