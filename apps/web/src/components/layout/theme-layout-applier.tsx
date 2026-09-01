"use client";

import * as React from "react";
import { useThemeLayoutStore } from "@/stores/theme-layout-store";

/** Applies persisted DreamsPOS-style layout attributes on mount. */
export function ThemeLayoutApplier() {
  const apply = useThemeLayoutStore((s) => s.apply);

  React.useEffect(() => {
    apply();
  }, [apply]);

  return null;
}
