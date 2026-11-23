import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold transition-colors leading-tight",
  {
    variants: {
      variant: {
        default: "border-primary/30 bg-primary/10 text-primary-text",
        secondary: "border-border bg-muted text-muted-foreground",
        neutral: "border-border bg-muted/60 text-muted-foreground",
        outline: "border-border bg-transparent text-foreground",
        success: "border-success-border bg-success/10 text-success-text",
        warning: "border-warning-border bg-warning/10 text-warning-text",
        danger: "border-destructive-border bg-destructive/10 text-destructive-text",
        destructive: "border-destructive-border bg-destructive/10 text-destructive-text",
        info: "border-info-border bg-info/10 text-info-text",
        /* backward-compatible soft + legacy solid variants */
        softSuccess: "border-success-border bg-success/10 text-success-text",
        softWarning: "border-warning-border bg-warning/10 text-warning-text",
        softDanger: "border-destructive-border bg-destructive/10 text-destructive-text",
        softInfo: "border-info-border bg-info/10 text-info-text",
        purple: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-400",
        gold: "border-warning-border bg-warning/10 text-warning-text",
        teal: "border-primary/30 bg-primary/10 text-primary-text",
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
