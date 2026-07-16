"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ReportsHub, REPORTS_TABS, reportsPath, type ReportsSection } from "@/components/reports/reports-hub";

export default function ReportsOverviewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab");

  useEffect(() => {
    if (tab && REPORTS_TABS.some((t) => t.value === tab) && tab !== "overview") {
      router.replace(reportsPath(tab as ReportsSection));
    }
  }, [tab, router]);

  return <ReportsHub section="overview" />;
}
