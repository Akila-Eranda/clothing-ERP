import { cn } from "@/lib/utils";

/** Shared DreamsPOS / header-matched button spacing for page headers / hubs. */
export const HEX_BTN = "gap-[0.4375rem] text-[0.8125rem] font-semibold px-3.5 h-9";

/** Section tab bar wrapper (Accounting hubs, etc.). */
export const HEX_SECTION_TABS =
  "hex-section-tabs flex flex-wrap gap-1.5 p-1 rounded-lg border border-border bg-muted/40 w-fit max-w-full";

/** Compact segment control (date presets, chart period, HR toggles). */
export const HEX_SEGMENT = "hex-segment-control";

export function hexTabActive(active: boolean) {
  return active ? "is-active" : undefined;
}

export function hexTabButton(active: boolean) {
  return cn(hexTabActive(active));
}
