"use client";

import * as React from "react";
import { Loader2, MessageCircle, QrCode, RefreshCw, Unplug, Wifi } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type WhatsappStatus = {
  status: "disconnected" | "connecting" | "qr" | "connected" | "logged_out" | "error";
  phone?: string | null;
  displayName?: string | null;
  qrDataUrl?: string | null;
  lastError?: string | null;
  connectedAt?: string | null;
  provider?: string;
};

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

  // Poll while waiting for QR / connect
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
    <div className="space-y-4 max-w-2xl">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageCircle className="h-4 w-4 text-emerald-600" />
                WhatsApp connect
              </CardTitle>
              <CardDescription className="mt-1">
                Scan QR with your shop WhatsApp. Then send bills &amp; messages from POS.
              </CardDescription>
            </div>
            <Badge
              variant="outline"
              className={
                connected
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                  : status?.status === "qr" || status?.status === "connecting"
                    ? "border-amber-300 bg-amber-50 text-amber-800"
                    : "border-slate-200 bg-slate-50 text-slate-600"
              }
            >
              {connected ? "Connected" : status?.status ?? "…"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : (
            <>
              {connected ? (
                <div className="rounded-xl border bg-emerald-50/60 border-emerald-100 p-4 space-y-1">
                  <p className="text-sm font-semibold text-emerald-900 flex items-center gap-2">
                    <Wifi className="h-4 w-4" /> Linked to WhatsApp
                  </p>
                  {status?.displayName && (
                    <p className="text-sm text-emerald-800">{status.displayName}</p>
                  )}
                  {status?.phone && (
                    <p className="text-xs font-mono text-emerald-700">+{status.phone}</p>
                  )}
                  {status?.connectedAt && (
                    <p className="text-[11px] text-emerald-600/80">
                      Connected {new Date(status.connectedAt).toLocaleString()}
                    </p>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border p-4 space-y-3">
                  <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal pl-4">
                    <li>Click <strong>Show QR</strong></li>
                    <li>Open WhatsApp on phone → Linked devices → Link a device</li>
                    <li>Scan this QR — shop WhatsApp stays connected to send bills</li>
                  </ol>
                  {(status?.status === "qr" || status?.qrDataUrl) && status.qrDataUrl ? (
                    <div className="flex flex-col items-center gap-2 py-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={status.qrDataUrl}
                        alt="WhatsApp QR"
                        className="h-56 w-56 rounded-lg border bg-white p-2 shadow-sm"
                      />
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <QrCode className="h-3.5 w-3.5" /> Waiting for scan…
                      </p>
                    </div>
                  ) : null}
                  {status?.lastError && (
                    <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                      {status.lastError}
                    </p>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {!connected ? (
                  <Button onClick={() => void connect()} disabled={busy} className="gap-2">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
                    Show QR / Connect
                  </Button>
                ) : (
                  <Button variant="destructive" onClick={() => void disconnect()} disabled={busy} className="gap-2">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />}
                    Disconnect
                  </Button>
                )}
                <Button variant="outline" onClick={() => void refresh()} disabled={busy} className="gap-2">
                  <RefreshCw className="h-4 w-4" /> Refresh
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">After connect</CardTitle>
          <CardDescription>
            From POS checkout you can send the bill to the customer&apos;s WhatsApp number.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
