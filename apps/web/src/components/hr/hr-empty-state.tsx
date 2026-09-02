"use client";

import React from "react";
import { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { HR_CARD_CLASS } from "@/components/hr/hr-ui";

export function HrEmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center shadow-[0_2px_10px_rgba(15,23,42,0.04)]",
        className,
      )}
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-[14px] bg-primary/10">
        <Icon className="h-6 w-6 text-primary" strokeWidth={1.75} />
      </div>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{description}</p>
      {actionLabel && onAction ? (
        <Button type="button" size="sm" className="mt-5 gap-1.5" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
