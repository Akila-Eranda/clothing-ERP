"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Dashboard route error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <h2 className="text-xl font-bold text-foreground">Something went wrong</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        This screen failed to load. Your cart is kept; unsaved entries on this screen are not. If a payment was being taken, open Sales and check the latest invoice before charging again.
      </p>
      {error.digest && <p className="text-xs text-muted-foreground">Ref: {error.digest}</p>}
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={() => window.location.assign("/sales")}>Check Sales</Button>
        <Button type="button" onClick={reset}>Return to POS</Button>
      </div>
    </div>
  );
}
