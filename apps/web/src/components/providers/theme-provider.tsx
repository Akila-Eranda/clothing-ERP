"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import type { ThemeProviderProps } from "next-themes";
import { applyAccentPreset, loadStoredAccent } from "@/lib/accent-theme";

function AccentSync() {
  const { resolvedTheme } = useTheme();
  React.useEffect(() => {
    applyAccentPreset(loadStoredAccent());
  }, [resolvedTheme]);
  return null;
}

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider {...props}>
      <AccentSync />
      {children}
    </NextThemesProvider>
  );
}
