"use client";

import * as React from "react";
import { Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolvePublicAssetUrl } from "@/lib/upload";

export function getCardBg(c = "", light = false) {
  if (light) {
    const m: Record<string, string> = {
      black: "#E2E8F0",
      white: "#F1F5F9",
      navy: "#DBEAFE",
      maroon: "#FCE7F3",
      red: "#FEE2E2",
      blue: "#DBEAFE",
      "sky blue": "#E0F2FE",
      beige: "#F5F5F4",
      green: "#DCFCE7",
      gray: "#F1F5F9",
      pink: "#FCE7F3",
      yellow: "#EDE9FE",
    };
    return m[c.toLowerCase()] ?? "var(--pos-thumb)";
  }
  const m: Record<string, string> = {
    black: "linear-gradient(135deg,#1a1a2e,#16213e)",
    white: "linear-gradient(135deg,#e8eaf6,#c5cae9)",
    navy: "linear-gradient(135deg,#1a237e,#283593)",
    maroon: "linear-gradient(135deg,#4a0010,#880e4f)",
    red: "linear-gradient(135deg,#b71c1c,#c62828)",
    blue: "linear-gradient(135deg,#0d47a1,#1565c0)",
    "sky blue": "linear-gradient(135deg,#0277bd,#0288d1)",
    beige: "linear-gradient(135deg,#8d6e63,#a1887f)",
    green: "linear-gradient(135deg,#1b5e20,#2e7d32)",
    gray: "linear-gradient(135deg,#37474f,#455a64)",
    pink: "linear-gradient(135deg,#880e4f,#ad1457)",
    yellow: "linear-gradient(135deg,#7c3aed,#9333ea)",
  };
  return m[c.toLowerCase()] ?? "linear-gradient(135deg,#1a237e,#283593)";
}

export function posImageSrc(url?: string | null) {
  return url ? resolvePublicAssetUrl(url) : null;
}

export function PosProductThumb({
  url,
  name,
  className,
  fallbackBg,
  iconClassName = "h-5 w-5",
  light = false,
}: {
  url?: string | null;
  name: string;
  className?: string;
  fallbackBg?: string;
  iconClassName?: string;
  light?: boolean;
}) {
  const src = posImageSrc(url);
  const [broken, setBroken] = React.useState(false);
  React.useEffect(() => {
    setBroken(false);
  }, [src]);
  if (src && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        className={cn("object-cover", className)}
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <div
      className={cn("flex items-center justify-center", className)}
      style={{ background: fallbackBg || (light ? "var(--pos-thumb)" : undefined) }}
    >
      <Package
        className={cn(iconClassName)}
        style={{ color: light ? "var(--pos-thumb-icon)" : "rgba(255,255,255,0.25)" }}
      />
    </div>
  );
}
