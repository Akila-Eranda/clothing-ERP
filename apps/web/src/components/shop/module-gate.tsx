"use client";

import { LoadingCenter } from "@/components/ui/loading";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useShopProfileState } from "@/lib/use-shop-profile";
import { hasShopModule } from "@/lib/shop-vertical";
import type { ShopProfile } from "@/lib/shop-profiles";

type ShopModule = keyof ShopProfile["modules"];

export function ModuleGate({
  module,
  children,
  redirectTo = "/dashboard",
}: {
  module: ShopModule;
  children: React.ReactNode;
  redirectTo?: string;
}) {
  const router = useRouter();
  const { profile, ready } = useShopProfileState();
  const allowed = hasShopModule(profile, module);

  // Only redirect once the shop type is confirmed; on a fresh session the default profile
  // would otherwise bounce a deep link (e.g. /appointments right after login) to the dashboard.
  useEffect(() => {
    if (ready && !allowed) router.replace(redirectTo);
  }, [ready, allowed, router, redirectTo]);

  if (!allowed) {
    return (
      <LoadingCenter className="min-h-[40vh] py-0" size={88} />
    );
  }

  return <>{children}</>;
}
