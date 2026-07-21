"use client";

import * as React from "react";
import { Loader2, MessageCircle, QrCode, RefreshCw, Unplug, Wifi } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type WhatsappStatus = {
  status: "disconnected" | "connecting" | "qr" | "connected" | "logged_out" | "error";
  phone?: string | null;
  displayName?: string | null;
  qrDataUrl?: string | null;
  lastError?: string | null;
  connectedAt?: string | null;
  provider?: string;
};

function statusBadgeClass(status?: string | null, connected?: boolean) {
  if (connected) return "border-emerald-500/40 bg-emerald-500/15 text-emerald-400";
  if (status === "qr" || status === "connecting") return "border-amber-500/40 bg-amber-500/15 text-amber-400";
  if (status === "error" || status === "logged_out") return "border-red-500/40 bg-red-500/15 text-red-400";
  return "border-white/15 bg-white/5 text-muted-foreground";
}

const btnBase =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold " +
  "transition-colors disabled:pointer-events-none disabled:opacity-50 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

export function WhatsappSettingsTab() {
  const [status, setStatus] = React.useState<WhatsappStatus | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);

  const refresh = React.useCallback(async () => {
    try {
      const r = await api.get<WhatsappStatus>("/whatsapp/status");
      setStatus(r.data);
    } catch (e) {
      toast.error((e as Error).message ?? "Failed to load WhatsApp status");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  React.useEffect(() => {
    if (!status) return;
    if (status.status !== "qr" && status.status !== "connecting") return;
    const t = setInterval(() => void refresh(), 2000);
    return () => clearInterval(t);
  }, [status?.status, refresh]);

  async function connect() {
    setBusy(true);
    try {
      const r = await api.post<WhatsappStatus>("/whatsapp/connect");
      setStatus(r.data);
      if (r.data?.status === "qr" || r.data?.qrDataUrl) {
        toast.success("Scan the QR with WhatsApp on your phone");
      } else if (r.data?.status === "connected") {
        toast.success("WhatsApp connected");
      } else {
        toast.message("Connecting… QR will appear shortly");
      }
    } catch (e) {
      toast.error((e as Error).message ?? "Connect failed");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      const r = await api.post<WhatsappStatus>("/whatsapp/disconnect");
      setStatus(r.data);
      toast.success("WhatsApp disconnected");
    } catch (e) {
      toast.error((e as Error).message ?? "Disconnect failed");
    } finally {
      setBusy(false);
    }
  }

  const connected = status?.status === "connected";
  const showQr = !connected && Boolean(status?.qrDataUrl);

  return (
    <div className="w-full max-w-3xl space-y-4">
      <section className="rounded-2xl border border-border bg-card overflow-hidden">
        <header className="flex items-start justify-between gap-3 flex-wrap px-5 py-4 border-b border-border/80 bg-muted/25">
          <div className="flex items-start gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/15 text-emerald-500 flex items-center justify-center shrink-0">
              <MessageCircle className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold leading-tight">WhatsApp connect</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Scan QR with your shop WhatsApp. Then send bills &amp; messages from POS.
              </p>
            </div>
          </div>
          <span
            className={cn(
              "inline-flex h-7 items-center rounded-full border px-3 text-[11px] font-semibold capitalize shrink-0",
              statusBadgeClass(status?.status, connected),
            )}
          >
            {connected ? "Connected" : status?.status ?? "…"}
          </span>
        </header>

        <div className="p-5 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : connected ? (
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4 space-y-1">
              <p className="text-sm font-semibold text-emerald-400 flex items-center gap-2">
                <Wifi className="h-4 w-4" /> Linked to WhatsApp
              </p>
              {status?.displayName && <p className="text-sm text-foreground">{status.displayName}</p>}
              {status?.phone && (
                <p className="text-xs font-mono text-muted-foreground">+{status.phone}</p>
              )}
              {status?.connectedAt && (
                <p className="text-[11px] text-muted-foreground">
                  Connected {new Date(status.connectedAt).toLocaleString()}
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-muted/15 p-4 space-y-4">
              <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal pl-4">
                <li>
                  Click <strong className="text-foreground">Show QR</strong>
                </li>
                <li>Open WhatsApp on phone → Linked devices → Link a device</li>
                <li>Scan this QR — shop WhatsApp stays connected to send bills</li>
              </ol>

              {showQr ? (
                <div className="flex flex-col items-center gap-2 py-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={status!.qrDataUrl!}
                    alt="WhatsApp QR"
                    className="h-56 w-56 rounded-xl border border-border bg-white p-2"
                  />
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <QrCode className="h-3.5 w-3.5" /> Waiting for scan…
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/80 bg-background/40 py-10 text-center">
                  {(status?.status === "connecting" || busy) ? (
                    <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
                  ) : (
                    <QrCode className="h-8 w-8 text-muted-foreground/70" />
                  )}
                  <p className="text-sm text-muted-foreground">
                    {status?.status === "connecting" || busy
                      ? "Connecting to WhatsApp… QR appears in a few seconds"
                      : "QR will appear here after you connect"}
                  </p>
                </div>
              )}

              {status?.lastError && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                  {status.lastError}
                </p>
              )}
            </div>
          )}
        </div>

        {!loading && (
          <footer className="flex flex-wrap items-center gap-3 px-5 py-4 border-t border-border/80 bg-muted/20">
            {!connected ? (
              <button
                type="button"
                onClick={() => void connect()}
                disabled={busy}
                className={cn(btnBase, "bg-primary text-primary-foreground hover:bg-primary/90")}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
                Show QR / Connect
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void disconnect()}
                disabled={busy}
                className={cn(
                  btnBase,
                  "border border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/15",
                )}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />}
                Disconnect
              </button>
            )}
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={busy}
              className={cn(
                btnBase,
                "border border-border bg-background text-foreground hover:bg-muted",
              )}
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </footer>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card px-5 py-4">
        <h3 className="text-sm font-semibold">After connect</h3>
        <p className="text-xs text-muted-foreground mt-1">
          From POS checkout you can send the bill to the customer&apos;s WhatsApp number.
        </p>
      </section>
    </div>
  );
}
