"use client";

import * as React from "react";
import { Loader2, MessageCircle, QrCode, RefreshCw, Unplug, Wifi } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

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
  if (connected) {
    return "border-emerald-500/30 bg-emerald-500/15 text-emerald-400";
  }
  if (status === "qr" || status === "connecting") {
    return "border-amber-500/30 bg-amber-500/15 text-amber-400";
  }
  if (status === "error" || status === "logged_out") {
    return "border-red-500/30 bg-red-500/15 text-red-400";
  }
  return "border-border bg-muted/50 text-muted-foreground";
}

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
      toast.success("Scan the QR with WhatsApp on your phone");
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

  return (
    <div className="w-full space-y-4">
      <Card className="rounded-[18px] shadow-[0_2px_10px_rgba(15,23,42,0.04)] overflow-hidden">
        <div className="flex items-start justify-between gap-3 flex-wrap px-5 py-4 border-b bg-muted/30">
          <div className="flex items-start gap-3 min-w-0">
            <div className="h-10 w-10 rounded-[12px] bg-emerald-500/15 text-emerald-500 flex items-center justify-center shrink-0">
              <MessageCircle className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold leading-tight">WhatsApp connect</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Scan QR with your shop WhatsApp. Then send bills &amp; messages from POS.
              </p>
            </div>
          </div>
          <Badge
            variant="outline"
            className={`h-7 rounded-full px-3 text-[11px] font-semibold capitalize shrink-0 ${statusBadgeClass(status?.status, connected)}`}
          >
            {connected ? "Connected" : status?.status ?? "…"}
          </Badge>
        </div>

        <div className="p-5 space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-10 justify-center">
              <Loader2 className="h-[18px] w-[18px] animate-spin" /> Loading…
            </div>
          ) : (
            <>
              {connected ? (
                <div className="rounded-[14px] border border-emerald-500/25 bg-emerald-500/10 p-4 space-y-1">
                  <p className="text-sm font-semibold text-emerald-400 flex items-center gap-2">
                    <Wifi className="h-4 w-4" /> Linked to WhatsApp
                  </p>
                  {status?.displayName && (
                    <p className="text-sm text-foreground">{status.displayName}</p>
                  )}
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
                <div className="rounded-[14px] border bg-muted/20 p-4 space-y-3">
                  <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal pl-4">
                    <li>Click <strong className="text-foreground">Show QR</strong></li>
                    <li>Open WhatsApp on phone → Linked devices → Link a device</li>
                    <li>Scan this QR — shop WhatsApp stays connected to send bills</li>
                  </ol>
                  {(status?.status === "qr" || status?.qrDataUrl) && status.qrDataUrl ? (
                    <div className="flex flex-col items-center gap-2 py-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={status.qrDataUrl}
                        alt="WhatsApp QR"
                        className="h-56 w-56 rounded-[14px] border bg-white p-2 shadow-sm"
                      />
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <QrCode className="h-3.5 w-3.5" /> Waiting for scan…
                      </p>
                    </div>
                  ) : null}
                  {status?.lastError && (
                    <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-[12px] px-3 py-2">
                      {status.lastError}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {!loading && (
          <div className="flex flex-wrap items-center gap-2 px-5 py-4 border-t bg-muted/20">
            {!connected ? (
              <Button
                type="button"
                onClick={() => void connect()}
                disabled={busy}
                className="h-10 min-h-10 rounded-[12px] px-4 gap-1.5 shrink-0"
              >
                {busy ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <QrCode className="h-[18px] w-[18px]" />}
                Show QR / Connect
              </Button>
            ) : (
              <Button
                type="button"
                variant="destructive"
                onClick={() => void disconnect()}
                disabled={busy}
                className="h-10 min-h-10 rounded-[12px] px-4 gap-1.5 shrink-0"
              >
                {busy ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <Unplug className="h-[18px] w-[18px]" />}
                Disconnect
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              onClick={() => void refresh()}
              disabled={busy}
              className="h-10 min-h-10 rounded-[12px] px-4 gap-1.5 shrink-0"
            >
              <RefreshCw className="h-[18px] w-[18px]" />
              Refresh
            </Button>
          </div>
        )}
      </Card>

      <Card className="rounded-[18px] shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
        <div className="px-5 py-4">
          <h3 className="text-sm font-semibold">After connect</h3>
          <p className="text-xs text-muted-foreground mt-1">
            From POS checkout you can send the bill to the customer&apos;s WhatsApp number.
          </p>
        </div>
      </Card>
    </div>
  );
}
