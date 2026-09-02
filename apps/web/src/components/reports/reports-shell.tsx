"use client";

import * as React from "react";
import { Printer, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ReportsSection } from "@/components/reports/reports-config";
import {
  ReportDateFilterBar,
  ReportTabNav,
  ReportsPageHeader,
  SECTION_META,
  type ReportDateRange,
} from "@/components/reports/reports-ui";

export function ReportsShell({
  section,
  branchName,
  range,
  onRangeChange,
  onRefresh,
  loading,
  children,
  className,
  extraActions,
}: {
  section: ReportsSection;
  branchName?: string | null;
  range: ReportDateRange;
  onRangeChange: (r: ReportDateRange) => void;
  onRefresh: () => void;
  loading?: boolean;
  children: React.ReactNode;
  className?: string;
  extraActions?: React.ReactNode;
}) {
  const meta = SECTION_META[section];

  return (
    <div className={cn("reports-hub-page min-h-screen bg-background", className)}>
      <div className="reports-shell-header sticky top-0 z-20 bg-card/95 backdrop-blur-md border-b border-border">
        <div className="page-shell py-4 space-y-4">
          <ReportsPageHeader
            title={meta.title}
            description={meta.description}
            icon={meta.icon}
            branchName={branchName}
            actions={
              <>
                {extraActions}
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => window.print()}
                  className="gap-1.5 h-9 hidden sm:inline-flex"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Print
                </Button>
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={onRefresh}
                  className="gap-1.5 h-9"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
                  Refresh
                </Button>
              </>
            }
          />
          <ReportTabNav active={section} />
        </div>
        <div className="border-t border-border/80 bg-muted/20">
          <div className="page-shell py-3">
            <ReportDateFilterBar
              range={range}
              onRangeChange={onRangeChange}
              onApply={onRefresh}
              loading={loading}
            />
          </div>
        </div>
      </div>

      <div className="page-shell py-6">{children}</div>
    </div>
  );
}
