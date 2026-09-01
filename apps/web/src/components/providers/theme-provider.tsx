"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import type { ThemeProviderProps } from "next-themes";
import { useThemeColorsStore } from "@/stores/theme-colors-store";

function AccentSync() {
  const { resolvedTheme } = useTheme();
  React.useEffect(() => {
    useThemeColorsStore.getState().apply();
  }, [resolvedTheme]);
  React.useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-theme", resolvedTheme === "dark" ? "dark" : "light");
  }, [resolvedTheme]);
  return null;
}

function ThemeColorsBootstrap() {
  const apply = useThemeColorsStore((s) => s.apply);
  React.useEffect(() => {
    apply();
  }, [apply]);
  return null;
}

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider {...props}>
      <AccentSync />
      <ThemeColorsBootstrap />
      {children}
    </NextThemesProvider>
  );
}
