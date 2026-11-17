"use client";

/**
 * Manager PIN approval dialog (mounted once, in the root layout). Opened by `withManagerApproval`
 * (lib/cash-approval) when the API refuses a cash action with MANAGER_APPROVAL_REQUIRED.
 *
 * The manager types THEIR OWN PIN; it is sent once to POST /cash/manager-approval and cleared from state
 * straight after. The returned approval token is handed to the waiting action and never stored here.
 * Sits above the POS shell (z-[200]); the POS overlays go up to z-[150].
 */
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Loader2, ShieldCheck, X } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  approvalErrorText,
  ApprovalRequest,
  ManagerApproval,
  registerManagerApprovalHost,
  sanitizePinInput,
} from "@/lib/cash-approval";

type Pending = { req: ApprovalRequest; resolve: (a: ManagerApproval | null) => void };

export function ManagerApprovalHost() {
  const [pending, setPending] = React.useState<Pending | null>(null);
  const [pin, setPin] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [locked, setLocked] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const pendingRef = React.useRef<Pending | null>(null);

  React.useEffect(
    () =>
      registerManagerApprovalHost(
        (req) =>
          new Promise<ManagerApproval | null>((resolve) => {
            pendingRef.current?.resolve(null); // a new request replaces any open one
            const next = { req, resolve };
            pendingRef.current = next;
            setPin("");
            setError(null);
            setLocked(false);
            setPending(next);
          }),
      ),
    [],
  );

  const finish = React.useCallback((result: ManagerApproval | null) => {
    const p = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    setPin("");
    setBusy(false);
    p?.resolve(result);
  }, []);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (busy || locked) return;
    const entered = sanitizePinInput(pin);
    if (entered.length !== 4) {
      setError("Enter the manager's 4-digit PIN.");
      return;
    }
    setBusy(true);
    setError(null);
    setPin(""); // the PIN is not kept in state while the request runs
    try {
      const res = await api.post<{ approvalToken: string; expiresInSeconds: number; manager?: { name?: string } }>(
        "/cash/manager-approval",
        { pin: entered },
      );
      const d = res.data;
      if (!d?.approvalToken) throw new Error("Could not check the PIN. Try again.");
      finish({
        token: d.approvalToken,
        managerName: d.manager?.name ?? "Manager",
        expiresAt: Date.now() + (d.expiresInSeconds ?? 300) * 1000,
      });
    } catch (err) {
      const status = (err as { status?: number }).status;
      setLocked(status === 429);
      setError(approvalErrorText(err));
      setBusy(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  const open = !!pending;
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => { if (!o && !busy) finish(null); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-1/2 z-[201] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-xl"
          onOpenAutoFocus={(e) => { e.preventDefault(); inputRef.current?.focus(); }}
          aria-describedby="manager-approval-reason"
        >
          <DialogPrimitive.Close
            className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100 disabled:pointer-events-none"
            disabled={busy}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </DialogPrimitive.Close>
          <form onSubmit={submit} className="space-y-4" autoComplete="off">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <DialogPrimitive.Title className="text-lg font-semibold">Manager approval</DialogPrimitive.Title>
            </div>
            <div id="manager-approval-reason" className="space-y-1 text-sm">
              {pending?.req.action && <p className="font-medium">{pending.req.action}</p>}
              <p className="text-muted-foreground">{pending?.req.message}</p>
              <p className="text-muted-foreground">
                A manager must enter their own PIN. Being logged in as a manager on this terminal is not an approval.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="manager-approval-pin">Manager PIN</Label>
              <Input
                id="manager-approval-pin"
                ref={inputRef}
                type="password"
                inputMode="numeric"
                pattern="\d*"
                maxLength={4}
                autoComplete="off"
                name="manager-approval-pin"
                data-lpignore="true"
                value={pin}
                onChange={(e) => setPin(sanitizePinInput(e.target.value))}
                disabled={busy || locked}
                className="text-center text-2xl tracking-[0.6em]"
                aria-invalid={!!error}
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => finish(null)} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" variant="success" disabled={busy || locked || pin.length !== 4}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Approve"}
              </Button>
            </div>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
