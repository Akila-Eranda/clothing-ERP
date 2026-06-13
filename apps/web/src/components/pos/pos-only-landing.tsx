"use client";

import { ShoppingCart, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/constants";

interface PosOnlyLandingProps {
  shopLabel?: string;
  onOpenPos: () => void;
  onLogout: () => void;
}

export function PosOnlyLanding({ shopLabel, onOpenPos, onLogout }: PosOnlyLandingProps) {
  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center px-6 text-white"
      style={{ background: "linear-gradient(160deg,#070d1a 0%,#0f1f3c 50%,#070d1a 100%)" }}
    >
      <div className="max-w-sm w-full text-center space-y-6">
        <div
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl"
          style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}
        >
          <ShoppingCart className="h-8 w-8" />
        </div>
        <div>
          <p className="text-xs uppercase tracking-widest text-indigo-300/80 mb-2">{APP_NAME} POS</p>
          <h1 className="text-2xl font-bold">{shopLabel ?? "Point of Sale"}</h1>
          <p className="text-sm text-slate-400 mt-2">Open the register to start selling.</p>
        </div>
        <div className="flex flex-col gap-2">
          <Button
            size="lg"
            className="w-full h-12 text-base font-semibold"
            onClick={onOpenPos}
          >
            Open POS Terminal
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="w-full h-11 border-slate-600 bg-transparent text-slate-300 hover:bg-white/5 hover:text-white"
            onClick={onLogout}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
