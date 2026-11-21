"use client";

import * as React from "react";
import { shouldBlockBrowserDefault } from "@/lib/browser-key-guard";

/**
 * Stops Microsoft Edge from switching the app into Reading mode when F9 is pressed outside the POS
 * (dashboard, lists, forms, login). Only prevents the browser default: the event still reaches every
 * app handler, so POS shortcuts keep working. See lib/browser-key-guard.ts.
 */
export function BrowserKeyGuard() {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (shouldBlockBrowserDefault(e.key, false)) e.preventDefault();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
  return null;
}
