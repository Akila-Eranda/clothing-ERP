import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary/10 text-primary hover:bg-primary/15",
        secondary:
          "border-transparent bg-[#F3F6FC] text-muted-foreground hover:bg-[#EEF4FF]",
        destructive:
          "border-transparent bg-red-50 text-red-600 hover:bg-red-100",
        outline: "text-foreground border-border",
        success:
          "border-transparent bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
        warning:
          "border-transparent bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
        danger:
          "border-transparent bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-400",
        info:
          "border-transparent bg-sky-50 text-sky-700 dark:bg-blue-500/15 dark:text-blue-400",
        purple:
          "border-transparent bg-violet-50 text-violet-700 dark:bg-purple-500/15 dark:text-purple-400",
        gold:
          "border-transparent bg-amber-50 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300",
        teal:
          "border-transparent bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-400",
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
