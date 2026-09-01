import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const solidBadge =
  "border text-white dark:text-white";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          cn(solidBadge, "border-primary/80 bg-primary dark:border-primary dark:bg-primary"),
        secondary:
          cn(solidBadge, "border-slate-600 bg-slate-600 dark:border-slate-500 dark:bg-slate-600"),
        destructive:
          cn(solidBadge, "border-red-700 bg-red-600 dark:border-red-500 dark:bg-red-600"),
        outline:
          "border-border bg-background text-foreground shadow-none dark:border-border dark:bg-card/60 dark:text-foreground",
        softSuccess:
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/15 dark:text-emerald-400",
        softWarning:
          "border-amber-500/35 bg-amber-500/10 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-400",
        softDanger:
          "border-red-500/30 bg-red-500/10 text-red-700 dark:border-red-500/25 dark:bg-red-500/15 dark:text-red-400",
        softInfo:
          "border-sky-500/30 bg-sky-500/10 text-sky-800 dark:border-sky-500/25 dark:bg-sky-500/15 dark:text-sky-400",
        success:
          cn(solidBadge, "border-emerald-700 bg-emerald-600 dark:border-emerald-500 dark:bg-emerald-600"),
        warning:
          cn(solidBadge, "border-orange-700 bg-orange-600 dark:border-orange-500 dark:bg-orange-600"),
        danger:
          cn(solidBadge, "border-rose-700 bg-rose-600 dark:border-rose-500 dark:bg-rose-600"),
        info:
          cn(solidBadge, "border-cyan-700 bg-cyan-600 dark:border-cyan-500 dark:bg-cyan-600"),
        purple:
          cn(solidBadge, "border-violet-700 bg-violet-600 dark:border-violet-500 dark:bg-violet-600"),
        gold:
          cn(solidBadge, "border-amber-700 bg-amber-600 dark:border-amber-500 dark:bg-amber-600"),
        teal:
          cn(solidBadge, "border-teal-700 bg-teal-600 dark:border-teal-500 dark:bg-teal-600"),
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
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
