"use client";

import * as React from "react";
import { Loader2, RefreshCw, Wallet, Landmark, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatNumber, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuthStore } from "@/stores/auth-store";
import { bypassesWorkflowApproval } from "@/lib/workflow-access";

interface CashierWallet {
  id: string;
  status: "OPEN" | "CLOSED" | "PENDING_APPROVAL";
  cashierName: string;
  cashierEmail?: string;
  counterName?: string | null;
  openingTime: string;
  closingTime?: string | null;
  openingCash: number;
  actualCash?: number | null;
  expectedCash: number;
  amountToClear: number;
  summary: { cashSales: number; cashReceived: number; cashExpenses: number; cashRefunds: number };
}

interface WalletsResponse {
  mainCash: { id: string; name: string; code: string; balance: number };
  wallets: CashierWallet[];
  totalToClear: number;
}

const MANAGER_ROLES = ["BRANCH_MANAGER", "ACCOUNTANT", "INVENTORY_MANAGER"];

function lkr(n: number) {
  return `LKR ${formatNumber(n)}`;
}

function fmtTime(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-LK", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function CashierWalletsPanel() {
  const { user } = useAuthStore();
  const canClear = bypassesWorkflowApproval(user?.role) || MANAGER_ROLES.includes(String(user?.role ?? ""));
  const [data, setData] = React.useState<WalletsResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [counted, setCounted] = React.useState<Record<string, string>>({});
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<WalletsResponse>("/cash/wallets");
      setData(r.data);
      setCounted({});
    } catch (e: unknown) {
      toast.error((e as Error).message || "Failed to load cashier wallets");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  const clearOne = async (w: CashierWallet) => {
    const raw = counted[w.id];
    const countedCash = raw != null && raw !== "" ? parseFloat(raw) : undefined;
    if (countedCash != null && (!Number.isFinite(countedCash) || countedCash < 0)) {
      toast.error("Enter a valid counted amount");
      return;
    }
    const amount = countedCash ?? w.amountToClear;
    if (!window.confirm(`Clear ${w.cashierName}'s wallet and move ${lkr(amount)} to ${data?.mainCash.name ?? "Main Cash"}?`)) return;
    setBusyId(w.id);
    try {
      await api.post(`/cash/wallets/${w.id}/clear`, countedCash != null ? { countedCash } : {});
      toast.success(`${w.cashierName}: ${lkr(amount)} moved to ${data?.mainCash.name ?? "Main Cash"}`);
      await load();
    } catch (e: unknown) {
      toast.error((e as Error).message || "Failed to clear wallet");
    } finally {
      setBusyId(null);
    }
  };

  const clearAll = async () => {
    if (!data || data.wallets.length === 0) return;
    if (!window.confirm(`Day end: clear all ${data.wallets.length} cashier wallets and move ${lkr(data.totalToClear)} to ${data.mainCash.name}?`)) return;
    setBusyId("ALL");
    try {
      const r = await api.post<{ cleared: number; total: number }>("/cash/wallets/clear-all", {});
      toast.success(`${r.data.cleared} wallet(s) cleared · ${lkr(r.data.total)} moved to ${data.mainCash.name}`);
      await load();
    } catch (e: unknown) {
      toast.error((e as Error).message || "Failed to clear wallets");
      await load();
    } finally {
      setBusyId(null);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const wallets = data?.wallets ?? [];

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
              <Landmark className="h-5 w-5 text-emerald-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{data?.mainCash.name ?? "Main Cash"}</p>
              <p className="text-lg font-bold tabular-nums">{lkr(data?.mainCash.balance ?? 0)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Wallet className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Cash in cashier wallets</p>
              <p className="text-lg font-bold tabular-nums">{lkr(data?.totalToClear ?? 0)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex h-full items-center justify-between gap-2 p-4">
            <div>
              <p className="text-xs text-muted-foreground">Wallets to clear</p>
              <p className="text-lg font-bold tabular-nums">{wallets.length}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="icon" onClick={() => void load()} disabled={loading || busyId !== null} aria-label="Refresh">
                <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              </Button>
              {canClear && (
                <Button onClick={() => void clearAll()} disabled={wallets.length === 0 || busyId !== null} className="gap-1.5">
                  {busyId === "ALL" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Day End · Clear All
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Cashier Wallets</CardTitle>
          <p className="text-xs text-muted-foreground">
            Each cashier collects cash into their own wallet. At day end, clear the wallets to move the cash into {data?.mainCash.name ?? "Main Cash"}.
            {!canClear && " Only an admin or manager can clear wallets."}
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {wallets.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-muted-foreground">
              All cashier wallets are cleared.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="border-b bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 text-left">Cashier</th>
                    <th className="px-3 py-2.5 text-left">Status</th>
                    <th className="px-3 py-2.5 text-right">Opening</th>
                    <th className="px-3 py-2.5 text-right">Cash sales</th>
                    <th className="px-3 py-2.5 text-right">Out</th>
                    <th className="px-3 py-2.5 text-right">In wallet</th>
                    <th className="px-3 py-2.5 text-right">Counted</th>
                    <th className="px-4 py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {wallets.map((w) => {
                    const out = w.summary.cashExpenses + w.summary.cashRefunds;
                    return (
                      <tr key={w.id} className="hover:bg-muted/20">
                        <td className="px-4 py-3">
                          <p className="font-semibold">{w.cashierName}</p>
                          <p className="text-xs text-muted-foreground">
                            Opened {fmtTime(w.openingTime)}
                            {w.counterName ? ` · ${w.counterName}` : ""}
                          </p>
                        </td>
                        <td className="px-3 py-3">
                          <Badge
                            variant="secondary"
                            className={cn(
                              "text-[10px]",
                              w.status === "OPEN" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                              w.status === "PENDING_APPROVAL" && "bg-amber-500/10 text-amber-700 dark:text-amber-400",
                            )}
                          >
                            {w.status === "OPEN" ? "Open" : w.status === "CLOSED" ? "Closed" : "Pending approval"}
                          </Badge>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">{formatNumber(w.openingCash)}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{formatNumber(w.summary.cashSales + w.summary.cashReceived)}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-rose-600">{out > 0 ? `−${formatNumber(out)}` : "0.00"}</td>
                        <td className="px-3 py-3 text-right font-bold tabular-nums">{formatNumber(w.amountToClear)}</td>
                        <td className="px-3 py-3 text-right">
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            placeholder={formatNumber(w.amountToClear)}
                            value={counted[w.id] ?? ""}
                            onChange={(e) => setCounted((p) => ({ ...p, [w.id]: e.target.value }))}
                            disabled={!canClear || busyId !== null}
                            className="ml-auto h-9 w-32 text-right tabular-nums"
                          />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            size="sm"
                            onClick={() => void clearOne(w)}
                            disabled={!canClear || busyId !== null}
                            className="gap-1.5"
                          >
                            {busyId === w.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Landmark className="h-3.5 w-3.5" />}
                            Clear to Main Cash
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
