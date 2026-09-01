"use client";

import * as React from "react";
import Lottie from "lottie-react";
import { cn } from "@/lib/utils";
import loadingAnimation from "@/assets/animations/loading.json";

export type LoadingProps = {
  /** Animation width/height in pixels */
  size?: number;
  className?: string;
  label?: string;
};

export function Loading({ size = 72, className, label }: LoadingProps) {
  return (
    <div
      className={cn("inline-flex flex-col items-center justify-center gap-2", className)}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label ?? "Loading"}
    >
      <Lottie
        animationData={loadingAnimation}
        loop
        style={{ width: size, height: size }}
      />
      {label ? <p className="text-sm text-muted-foreground">{label}</p> : null}
    </div>
  );
}

export function LoadingCenter({
  size = 72,
  className,
  label,
}: LoadingProps & { className?: string }) {
  return (
    <div className={cn("flex w-full items-center justify-center py-12", className)}>
      <Loading size={size} label={label} />
    </div>
  );
}

export function LoadingScreen({ size = 120, className, label }: LoadingProps) {
  return (
    <div
      className={cn(
        "flex min-h-screen w-full items-center justify-center bg-background",
        className,
      )}
    >
      <Loading size={size} label={label} />
    </div>
  );
}
