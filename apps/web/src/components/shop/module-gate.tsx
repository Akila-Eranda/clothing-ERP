"use client";

import { LoadingCenter } from "@/components/ui/loading";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useShopProfile } from "@/lib/use-shop-profile";
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
  const profile = useShopProfile();
  const allowed = hasShopModule(profile, module);

  useEffect(() => {
    if (!allowed) router.replace(redirectTo);
  }, [allowed, router, redirectTo]);

  if (!allowed) {
    return (
      <LoadingCenter className="min-h-[40vh] py-0" size={88} />
    );
  }

  return <>{children}</>;
}
