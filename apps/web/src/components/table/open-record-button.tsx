"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Primary table cell that opens a record in one click — no underline clutter. */
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
        "inline-block max-w-full truncate text-left font-semibold text-primary",
        "hover:text-primary/80 transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 rounded-md",
        "decoration-none no-underline",
        className,
      )}
    >
      {children}
    </button>
  );
}
