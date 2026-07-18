import * as React from "react";
import { cn } from "@/lib/utils";

/** Shared button sizing for every modal / dialog footer. */
export const modalFooterButtonClass =
  "[&_button]:!h-10 [&_button]:!min-h-10 [&_button]:!rounded-[12px] [&_button]:!text-sm [&_button]:!leading-none " +
  "[&_button]:!gap-1.5 [&_button]:!px-3.5 [&_button]:!py-0 " +
  "[&_button_svg]:!size-[18px] [&_button_svg]:!shrink-0";

/** Radix DialogFooter layout (Cancel left → primary right). */
export const modalDialogFooterClass = cn(
  "flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end overflow-visible pt-2",
  modalFooterButtonClass,
);

/** Full-width footer bar used by custom overlay modals. */
export const modalBarFooterClass = cn(
  "flex items-center justify-end gap-2 px-6 py-4 border-t bg-muted/10 shrink-0 overflow-visible",
  modalFooterButtonClass,
);

/** Inline footer inside page-level dialog panels (border-t, no side padding). */
export const modalInlineFooterClass = cn(
  "flex items-center justify-end gap-2 pt-3 border-t overflow-visible",
  modalFooterButtonClass,
);

export function ModalFooter({
  className,
  bar = false,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { bar?: boolean }) {
  return (
    <div
      className={cn(bar ? modalBarFooterClass : modalDialogFooterClass, className)}
      {...props}
    />
  );
}
