import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control text-sm font-semibold leading-none transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-[4px] focus-visible:ring-[var(--primary-glow)] disabled:pointer-events-none disabled:opacity-50 overflow-visible [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-b from-[hsl(var(--primary-light))] to-[hsl(var(--primary))] text-primary-foreground shadow-[0_1px_2px_rgba(15,23,42,0.24),inset_0_1px_0_rgba(255,255,255,0.18)] hover:from-[hsl(var(--primary))] hover:to-[hsl(var(--primary-hover))] hover:shadow-[0_4px_14px_hsl(var(--primary)/0.35)] hover:-translate-y-px active:translate-y-0 active:scale-[0.98] active:shadow-none",
        outline:
          "border border-slate-200/90 bg-[#F8FAFC] text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)] [&_svg]:text-slate-500 hover:border-slate-300 hover:bg-white hover:text-slate-900 hover:[&_svg]:text-slate-700 hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(15,23,42,0.08)] active:translate-y-0 active:scale-[0.98] dark:border-white/12 dark:bg-white/[0.04] dark:text-foreground dark:shadow-none dark:hover:bg-[hsl(var(--card-hover))] dark:hover:border-white/25 dark:hover:[&_svg]:text-foreground",
        secondary:
          "border border-slate-200/90 bg-[#F8FAFC] text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)] [&_svg]:text-slate-500 hover:bg-white hover:border-slate-300 hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(15,23,42,0.08)] active:translate-y-0 active:scale-[0.98] dark:border-white/12 dark:bg-white/[0.04] dark:text-foreground dark:shadow-none dark:hover:bg-[hsl(var(--card-hover))]",
        ghost: "font-medium hover:bg-[hsl(var(--primary-soft))] hover:text-[hsl(var(--primary-hover))] active:scale-[0.98] dark:hover:bg-white/[0.04]",
        link: "font-medium text-primary underline-offset-4 hover:underline",
        gradient:
          "gradient-primary text-white shadow-button hover:opacity-90 hover:-translate-y-px hover:shadow-[0_4px_14px_hsl(var(--primary)/0.35)] active:translate-y-0 active:scale-[0.98]",
        success:
          "bg-gradient-to-b from-emerald-500 to-emerald-600 text-white shadow-[0_1px_2px_rgba(15,23,42,0.24),inset_0_1px_0_rgba(255,255,255,0.18)] hover:from-emerald-600 hover:to-emerald-700 hover:shadow-[0_4px_14px_rgba(16,185,129,0.35)] hover:-translate-y-px active:translate-y-0 active:scale-[0.98]",
        warning:
          "bg-gradient-to-b from-amber-400 to-amber-500 text-white shadow-[0_1px_2px_rgba(15,23,42,0.24),inset_0_1px_0_rgba(255,255,255,0.18)] hover:from-amber-500 hover:to-amber-600 hover:shadow-[0_4px_14px_rgba(245,158,11,0.35)] hover:-translate-y-px active:translate-y-0 active:scale-[0.98]",
        destructive:
          "bg-white text-[#EF4444] border border-[#FCA5A5] shadow-[0_1px_2px_rgba(15,23,42,0.05)] hover:bg-red-50 hover:border-red-400 hover:-translate-y-px hover:shadow-[0_3px_10px_rgba(239,68,68,0.15)] active:translate-y-0 active:scale-[0.98] dark:bg-destructive dark:text-destructive-foreground dark:border-transparent dark:hover:bg-destructive/90",
      },
      size: {
        default: "h-10 min-h-10 px-4 py-0",
        sm: "h-9 min-h-9 rounded-control px-3 text-xs py-0",
        lg: "h-11 min-h-11 rounded-control px-8 text-base py-0",
        xl: "h-12 min-h-12 rounded-control px-10 text-base font-semibold py-0",
        icon: "h-10 w-10 min-h-10",
        "icon-sm": "h-9 w-9 min-h-9",
        "icon-lg": "h-11 w-11 min-h-11",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size }), className)}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
