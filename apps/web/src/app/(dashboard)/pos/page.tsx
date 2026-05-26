"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useUIStore } from "@/stores/ui-store";

export default function POSPage() {
  const router = useRouter();
  const { openPos } = useUIStore();
  React.useEffect(() => { openPos(); router.replace("/dashboard"); }, [openPos, router]);
  return null;
}
