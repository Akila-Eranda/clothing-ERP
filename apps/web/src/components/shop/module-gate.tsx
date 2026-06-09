"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
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
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <>{children}</>;
}
