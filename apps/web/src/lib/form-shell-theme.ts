/**
 * Shared form-page shell tokens — works in light and dark mode
 * (uses Tailwind semantic colors: background, foreground, border, muted, etc.)
 */
export const FORM_PAGE = "min-h-screen bg-background text-foreground";

export const FORM_CARD = "rounded-xl border border-border bg-card overflow-hidden shadow-sm";
export const FORM_CARD_HEADER = "border-b border-border";

export const FORM_LABEL = "text-xs font-medium text-muted-foreground";
export const FORM_SUBTITLE = "text-xs text-muted-foreground mt-0.5";
export const FORM_HINT = "text-[11px] text-muted-foreground";

export const FORM_FIELD =
  "rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-orange-500/40 disabled:opacity-50";

export const FORM_ORANGE_BTN = "bg-orange-500 hover:bg-orange-600 text-white border-0 font-semibold";
export const FORM_OUTLINE_BTN = "border-border bg-transparent text-foreground hover:bg-muted";

export const FORM_STEP_BADGE =
  "mt-0.5 h-7 w-7 rounded-full bg-orange-500 text-white text-xs font-bold flex items-center justify-center shrink-0";

export const FORM_HEADER_ICON_WRAP =
  "h-10 w-10 rounded-xl bg-orange-500/15 flex items-center justify-center shrink-0";
export const FORM_HEADER_ICON = "h-5 w-5 text-orange-600 dark:text-orange-400";

export const FORM_STATUS_BADGE =
  "rounded-md border border-orange-500/50 bg-orange-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-600 dark:text-orange-400";

export const FORM_ACCENT_TEXT = "text-orange-600 dark:text-orange-400";
export const FORM_ACCENT_ICON = "h-4 w-4 text-orange-600 dark:text-orange-400";

export const FORM_INNER_PANEL = "rounded-xl border border-border bg-muted/30";
export const FORM_TABLE_WRAP = "rounded-xl border border-border bg-muted/20 overflow-hidden";
export const FORM_TABLE_HEAD = "sticky top-0 z-10 border-b border-border bg-muted/50";
export const FORM_TABLE_HEAD_ROW = "text-[10px] uppercase tracking-wider text-muted-foreground";
export const FORM_TABLE_BODY = "divide-y divide-border";

export const FORM_DROPDOWN =
  "absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-xl";

export const FORM_ROW_HOVER = "hover:bg-muted/50";
export const FORM_ROW_SELECTED = "bg-orange-500/5 ring-1 ring-inset ring-orange-500/30";

export const FORM_THUMB =
  "flex items-center justify-center overflow-hidden rounded-lg bg-muted border border-border";
export const FORM_EMPTY_ICON_WRAP =
  "flex h-12 w-12 items-center justify-center rounded-full bg-muted border border-border";

export const FORM_STICKY_BAR =
  "fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 backdrop-blur";

export const FORM_SCAN_BTN =
  "border-orange-500/40 text-orange-600 dark:text-orange-400 hover:bg-orange-500/10";

export const FORM_TAB_GROUP = "flex rounded-lg border border-border overflow-hidden bg-muted/30";
export const FORM_TAB_ACTIVE = "bg-orange-500 text-white";
export const FORM_TAB_INACTIVE = "text-muted-foreground hover:text-foreground hover:bg-muted";

export const FORM_META_VALUE = "font-medium text-right text-xs truncate max-w-[160px] text-foreground";

/** @deprecated use FORM_PAGE — kept for gradual migration */
export const PO_PAGE = FORM_PAGE;
export const PO_CARD = FORM_CARD;
export const PO_LABEL = FORM_LABEL;
export const PO_FIELD = `${FORM_FIELD} h-10 w-full px-3 text-sm`;
export const PO_ORANGE_BTN = FORM_ORANGE_BTN;
export const PO_OUTLINE_BTN = FORM_OUTLINE_BTN;
