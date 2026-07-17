"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Primary table cell that opens a record in one click. */
export function OpenRecordButton({
  children,
  onClick,
  className,
  title,
}: {
  children: ReactNode;
  onClick: () => void;
  className?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title ?? "Open"}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "text-left font-semibold text-primary hover:underline underline-offset-2 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 rounded-sm",
        className,
      )}
    >
      {children}
    </button>
  );
}
