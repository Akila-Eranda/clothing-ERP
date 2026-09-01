"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import type { ThemeProviderProps } from "next-themes";
import { useThemeColorsStore } from "@/stores/theme-colors-store";

function AccentSync() {
  const { resolvedTheme, theme, setTheme } = useTheme();
  React.useEffect(() => {
    if (theme === "system") {
      setTheme(resolvedTheme === "dark" ? "dark" : "light");
    }
  }, [theme, resolvedTheme, setTheme]);
  React.useEffect(() => {
    useThemeColorsStore.getState().apply();
  }, [resolvedTheme]);
  React.useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-theme", resolvedTheme === "dark" ? "dark" : "light");
  }, [resolvedTheme]);
  React.useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      useThemeColorsStore.getState().apply();
    });
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
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
