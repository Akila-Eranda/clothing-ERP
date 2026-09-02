"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { isDarkChromeBackground, resolveSidebarLogoOnDark } from "@/lib/logo-theme";
import { useThemeColorsStore } from "@/stores/theme-colors-store";
import { useThemeLayoutStore } from "@/stores/theme-layout-store";

function readAppliedChromeBg(): string {
  if (typeof document === "undefined") return "";
  const root = document.documentElement;
  return (
    root.style.getPropertyValue("--chrome-bg").trim() ||
    getComputedStyle(root).getPropertyValue("--chrome-bg").trim()
  );
}

/** Pick white vs blue sidebar logo from the active sidebar chrome background. */
export function useSidebarLogoOnDark(): boolean {
  const sidebarSkin = useThemeLayoutStore((s) => s.sidebarSkin);
  const colors = useThemeColorsStore();
  const { resolvedTheme } = useTheme();
  const isDarkMode = resolvedTheme === "dark";

  const [onDark, setOnDark] = useState(() =>
    resolveSidebarLogoOnDark(sidebarSkin, colors, isDarkMode),
  );

  useEffect(() => {
    const update = () => {
      const bg = readAppliedChromeBg();
      setOnDark(
        bg
          ? isDarkChromeBackground(bg)
          : resolveSidebarLogoOnDark(sidebarSkin, colors, isDarkMode),
      );
    };

    update();
    const frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [sidebarSkin, colors, isDarkMode]);

  return onDark;
}
