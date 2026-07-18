import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-[42px] w-full rounded-control border border-input bg-white text-foreground px-3 py-2 text-sm font-medium shadow-none transition-all duration-150 ease-out file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground placeholder:font-normal focus-visible:outline-none focus-visible:border-primary focus-visible:ring-[4px] focus-visible:ring-[var(--primary-glow)] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-card dark:shadow-none",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
