import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold transition-colors",
  {
    variants: {
      variant: {
        default: "border-primary/30 bg-primary/10 text-primary",
        secondary: "border-border bg-muted text-muted-foreground",
        neutral: "border-border bg-muted/60 text-muted-foreground",
        outline: "border-border bg-transparent text-foreground",
        success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
        warning: "border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-400",
        danger: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400",
        destructive: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400",
        info: "border-primary/30 bg-primary/10 text-primary",
        /* backward-compatible soft + legacy solid variants */
        softSuccess: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
        softWarning: "border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-400",
        softDanger: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400",
        softInfo: "border-primary/30 bg-primary/10 text-primary",
        purple: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-400",
        gold: "border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-400",
        teal: "border-primary/30 bg-primary/10 text-primary",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
