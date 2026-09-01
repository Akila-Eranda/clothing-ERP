"use client";

import {
  Banknote,
  CreditCard,
  Loader2,
  PauseCircle,
  RefreshCw,
  ShoppingCart,
  Smartphone,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  itemCount: number;
  checkoutLoading: boolean;
  pendingApproval: boolean;
  onHoldBill: () => void;
  onOpenHeldBills: () => void;
  onOpenOrders: () => void;
  onClearCart: () => void;
  onOpenCheckout: () => void;
  onPayCash: () => void;
  onOpenReload: () => void;
};

/** Retail theme 3×2 cart actions — wired to Hexalyte POS handlers. */
export function PosRetailCartActions({
  itemCount,
  checkoutLoading,
  pendingApproval,
  onHoldBill,
  onOpenHeldBills,
  onOpenOrders,
  onClearCart,
  onOpenCheckout,
  onPayCash,
  onOpenReload,
}: Props) {
  const disabled = itemCount === 0 || checkoutLoading || pendingApproval;

  const cells: {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    className: string;
    onClick: () => void;
    disabled?: boolean;
  }[] = [
    { label: "Hold", icon: PauseCircle, className: "pos-retail-btn-orange", onClick: onHoldBill, disabled: itemCount === 0 },
    { label: "Held Bills", icon: ShoppingCart, className: "pos-retail-btn-secondary", onClick: onOpenHeldBills },
    { label: "Clear", icon: Trash2, className: "pos-retail-btn-info", onClick: onClearCart },
    { label: "Reload", icon: Smartphone, className: "pos-retail-btn-indigo", onClick: onOpenReload },
    {
      label: "Payment",
      icon: CreditCard,
      className: "pos-retail-btn-cyan",
      onClick: onOpenCheckout,
      disabled,
    },
    { label: "Orders", icon: RefreshCw, className: "pos-retail-btn-danger", onClick: onOpenOrders },
  ];

  return (
    <div className="pos-retail-action-grid px-3 pb-2">
      <div className="grid grid-cols-3 gap-2">
        {cells.map((cell) => (
          <button
            key={cell.label}
            type="button"
            disabled={cell.disabled}
            onClick={cell.onClick}
            className={cn(
              "pos-retail-action-btn flex flex-col items-center justify-center gap-1 py-2.5 px-1 rounded-md text-[11px] font-semibold transition-opacity",
              cell.className,
            )}
          >
            <cell.icon className="h-4 w-4 shrink-0" />
            {cell.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onPayCash}
        disabled={disabled}
        className="pos-retail-action-btn pos-retail-btn-pay mt-2 w-full flex items-center justify-center gap-2 py-3 rounded-md text-sm font-bold"
      >
        {checkoutLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
        Cash Payment
      </button>
    </div>
  );
}
