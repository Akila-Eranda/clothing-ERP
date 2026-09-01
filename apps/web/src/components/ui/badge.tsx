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
          cn(solidBadge, "border-blue-700 bg-blue-600 dark:border-blue-500 dark:bg-blue-600"),
        secondary:
          cn(solidBadge, "border-slate-600 bg-slate-600 dark:border-slate-500 dark:bg-slate-600"),
        destructive:
          cn(solidBadge, "border-red-700 bg-red-600 dark:border-red-500 dark:bg-red-600"),
        outline:
          cn(solidBadge, "border-indigo-700 bg-indigo-600 dark:border-indigo-500 dark:bg-indigo-600"),
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
