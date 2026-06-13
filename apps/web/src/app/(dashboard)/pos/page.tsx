"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useUIStore } from "@/stores/ui-store";
import { useAuthStore } from "@/stores/auth-store";
import { isPosOnlyRole } from "@/lib/role-access";

export default function POSPage() {
  const router = useRouter();
  const { openPos } = useUIStore();
  const user = useAuthStore((s) => s.user);

  React.useEffect(() => {
    openPos();
    if (!isPosOnlyRole(user?.role)) {
      router.replace("/dashboard");
    }
  }, [openPos, router, user?.role]);

  return null;
}
