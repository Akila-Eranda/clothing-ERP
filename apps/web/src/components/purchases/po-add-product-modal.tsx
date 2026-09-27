"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { AddProductForm, type CreatedProduct } from "@/components/products/add-product-form";

interface Props {
  open: boolean;
  supplierId?: string;
  onClose: () => void;
  onCreated: (product: CreatedProduct) => void;
}

export function PoAddProductModal({ open, supplierId, onClose, onCreated }: Props) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/60 p-0 sm:p-4">
      <div className="relative flex w-full max-w-7xl flex-col overflow-hidden bg-background shadow-2xl sm:rounded-2xl sm:border">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="flex-1 overflow-y-auto">
          <AddProductForm embedded={{ defaultSupplierId: supplierId, onCreated, onCancel: onClose }} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
