"use client";

import * as React from "react";

type SlotProps = { children: React.ReactNode; className?: string };

/**
 * Shared three-column body for Classic + Retail 1–5.
 * Top bar, checkout, modals, and all business logic live in pos-overlay.tsx (parent).
 */
export function PosLayoutShell({ children }: { children: React.ReactNode }) {
  return <div className="pos-main-row flex flex-1 min-h-0 overflow-hidden">{children}</div>;
}

export function PosLayoutSidebarPanel({ children, className }: SlotProps) {
  return <div className={className}>{children}</div>;
}

export function PosLayoutCenterPanel({ children }: SlotProps) {
  return <div className="pos-center-panel flex-1 min-w-0 overflow-hidden">{children}</div>;
}
