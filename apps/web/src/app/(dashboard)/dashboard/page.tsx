"use client";

import { DreamsDashboard } from "@/components/dashboard/dreams-dashboard";

export default function DashboardPage() {
  return (
    <div className="page-shell !p-3 sm:!p-4 md:!p-5 max-w-[1600px] mx-auto">
      <DreamsDashboard />
    </div>
  );
}
