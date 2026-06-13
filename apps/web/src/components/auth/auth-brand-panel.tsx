"use client";

import Link from "next/link";
import { Sparkles, Shield, Zap, Globe } from "lucide-react";
import { APP_NAME, APP_DESCRIPTION } from "@/lib/constants";
import { ShopType, getShopProfile } from "@/lib/shop-profiles";
import { getVerticalFeatures } from "@/lib/shop-features";
import { ShopFeatureList } from "@/components/shop/shop-feature-list";
import { formatTenantSlug } from "@/lib/auth-host";

const TRUST_ITEMS = [
  { icon: Shield, label: "256-bit SSL" },
  { icon: Zap, label: "99.9% uptime" },
  { icon: Globe, label: "Cloud hosted" },
];

interface AuthBrandPanelProps {
  shopType?: ShopType;
  tenantName?: string | null;
  tenantSubdomain?: string | null;
  headline?: string;
  subheadline?: string;
}

export function AuthBrandPanel({
  shopType = ShopType.CLOTHING,
  tenantName,
  tenantSubdomain,
  headline,
  subheadline,
}: AuthBrandPanelProps) {
  const profile = getShopProfile(shopType);
  const features = getVerticalFeatures(shopType);
  const workspaceLabel = tenantName ?? (tenantSubdomain ? formatTenantSlug(tenantSubdomain) : null);

  const title = headline ?? (workspaceLabel ? `Sign in to ${workspaceLabel}` : "Your shop, one platform");
  const description =
    subheadline ??
    (workspaceLabel
      ? `${profile.emoji} ${profile.label} workspace — POS, inventory, reports & more.`
      : APP_DESCRIPTION);

  return (
    <div className="hidden lg:flex lg:w-[420px] xl:w-[460px] shrink-0 flex-col justify-between p-10 bg-gradient-to-br from-primary via-violet-600 to-purple-700 text-white relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: "radial-gradient(circle at 20% 50%, white 1px, transparent 1px)",
          backgroundSize: "30px 30px",
        }}
      />
      <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
      <div className="absolute -bottom-32 -left-16 h-72 w-72 rounded-full bg-purple-900/30 blur-3xl" />

      <div className="relative">
        <div className="flex items-center gap-3 mb-10">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <span className="text-xl font-black tracking-wide uppercase">{APP_NAME}</span>
            {workspaceLabel && (
              <p className="text-xs text-white/60 mt-0.5 font-medium truncate max-w-[280px]">
                {tenantSubdomain ? `${tenantSubdomain}.shop.hexalyte.com` : workspaceLabel}
              </p>
            )}
          </div>
        </div>

        <h2 className="text-3xl font-bold leading-tight mb-3">{title}</h2>
        <p className="text-white/70 text-sm leading-relaxed mb-6">{description}</p>

        <p className="text-xs font-semibold uppercase tracking-wider text-white/50 mb-3">
          {workspaceLabel ? "Your workspace includes" : "Platform features"}
        </p>
        <ShopFeatureList features={features.slice(0, 8)} compact variant="on-dark" />

        {!workspaceLabel && (
          <Link
            href="/features"
            className="inline-block mt-6 text-xs text-white/60 hover:text-white underline underline-offset-2"
          >
            View all business types & common features →
          </Link>
        )}
      </div>

      <div className="relative space-y-4">
        <div className="flex flex-wrap gap-4 pt-6 border-t border-white/15">
          {TRUST_ITEMS.map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-2 text-xs text-white/70">
              <Icon className="h-3.5 w-3.5 text-white/90" />
              {label}
            </div>
          ))}
        </div>
        <p className="text-xs text-white/50">© {new Date().getFullYear()} {APP_NAME} · Multi-Shop Retail Platform</p>
      </div>
    </div>
  );
}
