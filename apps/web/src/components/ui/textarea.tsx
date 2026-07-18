import * as React from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      className={cn(
        "flex min-h-[42px] w-full rounded-control border border-input bg-white text-foreground px-3 py-2.5 text-sm font-medium shadow-none placeholder:text-muted-foreground placeholder:font-normal transition-all duration-150 focus-visible:outline-none focus-visible:border-primary focus-visible:ring-[4px] focus-visible:ring-[var(--primary-glow)] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-card resize-none",
        className
      )}
      ref={ref}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";

export { Textarea };
