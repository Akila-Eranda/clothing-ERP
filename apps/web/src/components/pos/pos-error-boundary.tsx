"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

interface Props {
  children: React.ReactNode;
}
interface State {
  error: Error | null;
}

/** Catches render errors inside the POS overlay and offers a recoverable fallback. */
export class PosErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("POS render error:", error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        role="alert"
        className="fixed inset-0 z-[200] flex items-center justify-center p-4"
        style={{ background: "rgba(2, 6, 23, 0.9)" }}
      >
        <div className="w-full max-w-md space-y-3 rounded-2xl border border-border bg-card p-6 text-center shadow-2xl">
          <h2 className="text-lg font-bold text-foreground">The POS hit a problem</h2>
          <p className="text-sm text-muted-foreground">
            Your cart is kept. Anything open on screen (payment panel, Payment Complete screen, unsaved
            customer or dialog entries) is not. If a payment was being taken, open Sales and check the
            latest invoice first. Do not charge the customer again until you have confirmed whether the
            sale was saved.
          </p>
          <p className="break-words rounded border border-border bg-muted p-2 text-left font-mono text-xs">
            {this.state.error.message || String(this.state.error)}
          </p>
          <div className="flex justify-center gap-2">
            <Button type="button" variant="outline" onClick={() => window.location.assign("/sales")}>
              Check Sales
            </Button>
            <Button type="button" onClick={this.reset}>Return to POS</Button>
          </div>
        </div>
      </div>
    );
  }
}
