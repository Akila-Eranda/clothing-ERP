/**
 * Shared form-page shell tokens — works in light and dark mode
 * (uses Tailwind semantic colors: background, foreground, border, muted, primary, etc.)
 */
export const FORM_PAGE = "min-h-screen bg-background text-foreground";

export const FORM_CARD = "rounded-xl border border-border bg-card overflow-hidden shadow-sm";
export const FORM_CARD_HEADER = "border-b border-border";

export const FORM_LABEL = "text-xs font-medium text-muted-foreground";
export const FORM_SUBTITLE = "text-xs text-muted-foreground mt-0.5";
export const FORM_HINT = "text-[11px] text-muted-foreground";

export const FORM_FIELD =
  "rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50";

export const FORM_PRIMARY_BTN = "bg-primary hover:bg-primary/90 text-primary-foreground border-0 font-semibold";
/** @deprecated use FORM_PRIMARY_BTN */
export const FORM_ORANGE_BTN = FORM_PRIMARY_BTN;
export const FORM_OUTLINE_BTN = "border-border bg-transparent text-foreground hover:bg-muted";

export const FORM_STEP_BADGE =
  "mt-0.5 h-7 w-7 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shrink-0";

export const FORM_HEADER_ICON_WRAP =
  "h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0";
export const FORM_HEADER_ICON = "h-5 w-5 text-primary";

export const FORM_STATUS_BADGE =
  "rounded-md border border-primary/50 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary";

export const FORM_ACCENT_TEXT = "text-primary";
export const FORM_ACCENT_ICON = "h-4 w-4 text-primary";

export const FORM_INNER_PANEL = "rounded-xl border border-border bg-muted/30";
export const FORM_TABLE_WRAP = "rounded-xl border border-border bg-muted/20 overflow-hidden";
export const FORM_TABLE_HEAD = "sticky top-0 z-10 border-b border-border bg-muted/50";
export const FORM_TABLE_HEAD_ROW = "text-[10px] uppercase tracking-wider text-muted-foreground";
export const FORM_TABLE_BODY = "divide-y divide-border";

export const FORM_DROPDOWN =
  "absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-xl";

export const FORM_ROW_HOVER = "hover:bg-muted/50";
export const FORM_ROW_SELECTED = "bg-primary/5 ring-1 ring-inset ring-primary/30";

export const FORM_THUMB =
  "flex items-center justify-center overflow-hidden rounded-lg bg-muted border border-border";
export const FORM_EMPTY_ICON_WRAP =
  "flex h-12 w-12 items-center justify-center rounded-full bg-muted border border-border";

export const FORM_STICKY_BAR =
  "fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 backdrop-blur";

export const FORM_SCAN_BTN =
  "border-primary/40 text-primary hover:bg-primary/10";

export const FORM_TAB_GROUP = "flex rounded-lg border border-border overflow-hidden bg-muted/30";
export const FORM_TAB_ACTIVE = "bg-primary text-primary-foreground";
export const FORM_TAB_INACTIVE = "text-muted-foreground hover:text-foreground hover:bg-muted";

export const FORM_META_VALUE = "font-medium text-right text-xs truncate max-w-[160px] text-foreground";

export const FORM_LINE_INPUT =
  "h-9 rounded-lg border border-input bg-background px-2.5 text-right text-sm font-medium tabular-nums text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary/50 disabled:cursor-not-allowed disabled:opacity-50";

/** @deprecated use FORM_PAGE — kept for gradual migration */
export const PO_PAGE = FORM_PAGE;
export const PO_CARD = FORM_CARD;
export const PO_LABEL = FORM_LABEL;
export const PO_FIELD = `${FORM_FIELD} h-10 w-full px-3 text-sm`;
export const PO_ORANGE_BTN = FORM_PRIMARY_BTN;
export const PO_OUTLINE_BTN = FORM_OUTLINE_BTN;
