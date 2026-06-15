"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Banknote, PlayCircle, StopCircle, History, AlertTriangle,
  RefreshCw, Loader2, CheckCircle2, ArrowDownCircle, ArrowUpCircle,
  Printer, FileText,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { DenominationInput, denominationTotal } from "@/components/cash/denomination-input";
import { useAuthStore } from "@/stores/auth-store";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "open", label: "Cash Open", icon: PlayCircle },
  { id: "close", label: "Cash Close", icon: StopCircle },
  { id: "history", label: "Cash History", icon: History },
  { id: "variance", label: "Variance Report", icon: AlertTriangle },
  { id: "movements", label: "Cash In / Out", icon: ArrowUpCircle },
] as const;

type TabId = (typeof TABS)[number]["id"];

interface CashRegister {
  id: string;
  openingCash: number;
  openingTime: string;
  closingTime?: string | null;
  expectedCash?: number | null;
  actualCash?: number | null;
  variance?: number | null;
  status: "OPEN" | "CLOSED" | "PENDING_APPROVAL";
  cashierName?: string;
  denominationCount?: Record<string, number>;
  summary?: {
    openingCash: number;
    cashSales: number;
    cashReceived: number;
    cashExpenses: number;
    cashRefunds: number;
    expectedCash: number;
  };
  cashier?: { firstName: string; lastName: string };
  branch?: { name: string };
}

const VARIANCE_THRESHOLD = 500;

export default function CashManagementPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = (searchParams.get("tab") as TabId) || "open";
  const { user } = useAuthStore();

  const [loading, setLoading] = React.useState(true);
  const [active, setActive] = React.useState<CashRegister | null>(null);
  const [openingCash, setOpeningCash] = React.useState("");
  const [openingNotes, setOpeningNotes] = React.useState("");
  const [opening, setOpening] = React.useState(false);
  const [denominations, setDenominations] = React.useState<Record<string, number>>({});
  const [closeNotes, setCloseNotes] = React.useState("");
  const [closing, setClosing] = React.useState(false);
  const [history, setHistory] = React.useState<CashRegister[]>([]);
  const [varianceReport, setVarianceReport] = React.useState<{
    totalShifts: number;
    totalVariance: number;
    overCount: number;
    shortCount: number;
    pendingApproval: number;
    registers: CashRegister[];
  } | null>(null);
  const [movementType, setMovementType] = React.useState<"DEPOSIT" | "WITHDRAWAL" | "EXPENSE">("DEPOSIT");
  const [movementAmount, setMovementAmount] = React.useState("");
  const [movementDesc, setMovementDesc] = React.useState("");
  const [moving, setMoving] = React.useState(false);

  const setTab = (id: TabId) => router.push(`/cash?tab=${id}`);

  const loadActive = React.useCallback(async () => {
    try {
      const res = await api.get<CashRegister | null>("/cash/active");
      setActive(res.data ?? null);
    } catch {
      setActive(null);
    }
  }, []);

  const loadHistory = React.useCallback(async () => {
    try {
      const res = await api.get<{ data: CashRegister[] }>("/cash/history?limit=50");
      setHistory((res.data as { data?: CashRegister[] })?.data ?? []);
    } catch {
      toast.error("Failed to load cash history");
    }
  }, []);

  const loadVariance = React.useCallback(async () => {
    try {
      const res = await api.get<typeof varianceReport>("/cash/variance-report?days=30");
      setVarianceReport(res.data ?? null);
    } catch {
      toast.error("Failed to load variance report");
    }
  }, []);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    await loadActive();
    if (tab === "history") await loadHistory();
    if (tab === "variance") await loadVariance();
    setLoading(false);
  }, [tab, loadActive, loadHistory, loadVariance]);

  React.useEffect(() => { void refresh(); }, [refresh]);

  const handleOpenShift = async () => {
    const amount = parseFloat(openingCash);
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error("Enter a valid opening amount");
      return;
    }
    setOpening(true);
    try {
      await api.post("/cash/open", { openingCash: amount, notes: openingNotes || undefined });
      toast.success("Shift started");
      setOpeningCash("");
      setOpeningNotes("");
      await loadActive();
      setTab("close");
    } catch (e: unknown) {
      toast.error((e as Error).message || "Failed to open shift");
    } finally {
      setOpening(false);
    }
  };

  const handleCloseShift = async () => {
    if (!active) return;
    const actual = denominationTotal(denominations);
    if (actual <= 0) {
      toast.error("Enter physical cash count");
      return;
    }
    setClosing(true);
    try {
      const res = await api.post<{ needsApproval?: boolean; variance?: number }>(
        `/cash/${active.id}/close`,
        { actualCash: actual, denominations, notes: closeNotes || undefined },
      );
      const needsApproval = res.data?.needsApproval;
      const variance = res.data?.variance ?? 0;
      if (needsApproval) {
        toast.warning(`Shift closed — variance LKR ${formatNumber(Math.abs(variance))} pending manager approval`);
      } else {
        toast.success("Shift closed successfully");
      }
      setDenominations({});
      setCloseNotes("");
      await refresh();
    } catch (e: unknown) {
      toast.error((e as Error).message || "Failed to close shift");
    } finally {
      setClosing(false);
    }
  };

  const handleMovement = async () => {
    if (!active) {
      toast.error("Open a shift first");
      return;
    }
    const amount = parseFloat(movementAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setMoving(true);
    try {
      await api.post(`/cash/${active.id}/movements`, {
        type: movementType,
        amount,
        description: movementDesc || undefined,
      });
      toast.success(movementType === "DEPOSIT" ? "Cash in recorded" : "Cash out recorded");
      setMovementAmount("");
      setMovementDesc("");
      await loadActive();
    } catch (e: unknown) {
      toast.error((e as Error).message || "Failed to record movement");
    } finally {
      setMoving(false);
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await api.put(`/cash/${id}/approve`);
      toast.success("Variance approved");
      await refresh();
    } catch (e: unknown) {
      toast.error((e as Error).message || "Approval failed");
    }
  };

  const cashierName = active?.cashierName
    ?? (user ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() : "Cashier");
  const today = new Date().toLocaleDateString("en-LK", { day: "2-digit", month: "2-digit", year: "numeric" });
  const summary = active?.summary;
  const actualTotal = denominationTotal(denominations);
  const expected = summary?.expectedCash ?? active?.expectedCash ?? 0;
  const variancePreview = actualTotal > 0 ? actualTotal - expected : 0;
  const needsApprovalPreview = Math.abs(variancePreview) > VARIANCE_THRESHOLD;

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-card border-b px-6 py-4 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-600 rounded-xl p-2.5"><Banknote className="h-5 w-5 text-white" /></div>
            <div>
              <h1 className="text-lg font-bold">Cash Management</h1>
              <p className="text-xs text-muted-foreground">Daily cash close · shift control · variance tracking</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => void refresh()} className="h-9 w-9 p-0">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
        <div className="flex gap-1 mt-4 overflow-x-auto pb-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors",
                tab === t.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80",
              )}
            >
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-6 py-6 max-w-4xl mx-auto space-y-6">
        {tab === "open" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <PlayCircle className="h-4 w-4 text-emerald-600" /> Opening Cash
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {active?.status === "OPEN" ? (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    <span className="font-semibold text-emerald-700 dark:text-emerald-400">Shift is open</span>
                  </div>
                  <p className="text-sm text-muted-foreground">Opened with LKR {formatNumber(active.openingCash)} at {new Date(active.openingTime).toLocaleTimeString()}</p>
                  <Button className="mt-3" size="sm" onClick={() => setTab("close")}>Go to Cash Close</Button>
                </div>
              ) : active?.status === "PENDING_APPROVAL" ? (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                  <p className="font-semibold text-amber-700">Previous shift pending manager approval</p>
                  <p className="text-sm text-muted-foreground mt-1">Contact your manager before starting a new shift.</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div><span className="text-muted-foreground">Cashier</span><p className="font-semibold">{cashierName}</p></div>
                    <div><span className="text-muted-foreground">Date</span><p className="font-semibold">{today}</p></div>
                  </div>
                  <div className="space-y-2">
                    <Label>Opening amount (LKR)</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="10,000.00"
                      value={openingCash}
                      onChange={(e) => setOpeningCash(e.target.value)}
                      className="text-lg font-semibold h-12"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Notes (optional)</Label>
                    <Textarea value={openingNotes} onChange={(e) => setOpeningNotes(e.target.value)} rows={2} />
                  </div>
                  <Button onClick={() => void handleOpenShift()} disabled={opening} className="w-full h-11 gap-2">
                    {opening ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                    Start Shift
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {tab === "close" && (
          !active || active.status !== "OPEN" ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              <StopCircle className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No open shift. Start a shift from Cash Open first.</p>
              <Button className="mt-4" size="sm" onClick={() => setTab("open")}>Cash Open</Button>
            </CardContent></Card>
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader><CardTitle className="text-base">Daily Cash Close</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {[
                    ["Opening Cash", summary?.openingCash ?? active.openingCash],
                    ["Cash Sales", summary?.cashSales ?? 0],
                    ["Cash Received", summary?.cashReceived ?? 0],
                    ["Cash Expenses", summary?.cashExpenses ?? 0],
                  ].map(([label, val]) => (
                    <div key={String(label)} className="flex justify-between py-1 border-b border-dashed">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-semibold tabular-nums">LKR {formatNumber(Number(val))}</span>
                    </div>
                  ))}
                  <div className="flex justify-between py-2 font-bold text-base">
                    <span>Expected Cash</span>
                    <span className="text-primary tabular-nums">LKR {formatNumber(expected)}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">Physical Count</CardTitle></CardHeader>
                <CardContent>
                  <DenominationInput value={denominations} onChange={setDenominations} />
                  {actualTotal > 0 && (
                    <div className="mt-4 space-y-2 rounded-xl bg-muted/50 p-3 text-sm">
                      <div className="flex justify-between"><span>Expected</span><span className="tabular-nums">{formatNumber(expected)}</span></div>
                      <div className="flex justify-between"><span>Actual</span><span className="tabular-nums">{formatNumber(actualTotal)}</span></div>
                      <div className={cn("flex justify-between font-bold", variancePreview < 0 ? "text-red-600" : variancePreview > 0 ? "text-emerald-600" : "")}>
                        <span>Variance</span>
                        <span className="tabular-nums">{variancePreview >= 0 ? "+" : ""}{formatNumber(variancePreview)}</span>
                      </div>
                      {needsApprovalPreview && (
                        <Badge variant="outline" className="mt-2 border-amber-500 text-amber-600">
                          🟡 Pending Approval — variance &gt; LKR {VARIANCE_THRESHOLD}
                        </Badge>
                      )}
                    </div>
                  )}
                  <Textarea className="mt-4" placeholder="Closing notes (optional)" value={closeNotes} onChange={(e) => setCloseNotes(e.target.value)} rows={2} />
                  <div className="flex gap-2 mt-4">
                    <Button variant="outline" size="sm" className="gap-1.5 flex-1"><Printer className="h-3.5 w-3.5" />Print</Button>
                    <Button variant="outline" size="sm" className="gap-1.5 flex-1"><FileText className="h-3.5 w-3.5" />PDF</Button>
                  </div>
                  <Button
                    onClick={() => void handleCloseShift()}
                    disabled={closing || actualTotal <= 0}
                    className="w-full mt-3 h-11 gap-2 bg-red-600 hover:bg-red-700"
                  >
                    {closing ? <Loader2 className="h-4 w-4 animate-spin" /> : <StopCircle className="h-4 w-4" />}
                    Close Shift
                  </Button>
                </CardContent>
              </Card>
            </div>
          )
        )}

        {tab === "history" && (
          <Card>
            <CardHeader><CardTitle className="text-base">Cash History</CardTitle></CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No closed shifts yet</p>
              ) : (
                <div className="space-y-2">
                  {history.map((h) => (
                    <div key={h.id} className="flex items-center justify-between p-3 rounded-xl border text-sm">
                      <div>
                        <p className="font-semibold">{h.cashierName ?? "Cashier"} · {h.branch?.name ?? "Branch"}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(h.openingTime).toLocaleString("en-LK")}
                          {h.closingTime && ` → ${new Date(h.closingTime).toLocaleTimeString("en-LK")}`}
                        </p>
                      </div>
                      <div className="text-right">
                        <Badge variant={h.status === "PENDING_APPROVAL" ? "outline" : "secondary"} className="mb-1">
                          {h.status.replace("_", " ")}
                        </Badge>
                        <p className="tabular-nums font-semibold">
                          {h.variance != null && (
                            <span className={h.variance < 0 ? "text-red-600" : h.variance > 0 ? "text-emerald-600" : ""}>
                              {h.variance >= 0 ? "+" : ""}{formatNumber(h.variance)}
                            </span>
                          )}
                        </p>
                        {h.status === "PENDING_APPROVAL" && (
                          <Button size="sm" variant="outline" className="mt-1 h-7 text-xs" onClick={() => void handleApprove(h.id)}>
                            Approve
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {tab === "variance" && varianceReport && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                ["Total Shifts", varianceReport.totalShifts],
                ["Net Variance", varianceReport.totalVariance],
                ["Over", varianceReport.overCount],
                ["Short", varianceReport.shortCount],
              ].map(([label, val]) => (
                <Card key={String(label)}><CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-xl font-bold tabular-nums">{typeof val === "number" ? formatNumber(val) : val}</p>
                </CardContent></Card>
              ))}
            </div>
            <Card>
              <CardHeader><CardTitle className="text-base">Recent variances (30 days)</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {varianceReport.registers.map((r) => (
                  <div key={r.id} className="flex justify-between p-3 rounded-lg border text-sm">
                    <span>{r.cashierName} · {r.closingTime ? new Date(r.closingTime).toLocaleDateString("en-LK") : "—"}</span>
                    <span className={cn("font-bold tabular-nums", (r.variance ?? 0) < 0 ? "text-red-600" : "text-emerald-600")}>
                      {(r.variance ?? 0) >= 0 ? "+" : ""}{formatNumber(r.variance ?? 0)}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        )}

        {tab === "movements" && (
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><ArrowDownCircle className="h-4 w-4" /> Cash In / Cash Out</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {!active || active.status !== "OPEN" ? (
                <p className="text-muted-foreground text-sm">Open a shift to record cash movements.</p>
              ) : (
                <>
                  <div className="flex gap-2">
                    {(["DEPOSIT", "WITHDRAWAL", "EXPENSE"] as const).map((t) => (
                      <Button key={t} size="sm" variant={movementType === t ? "default" : "outline"} onClick={() => setMovementType(t)}>
                        {t === "DEPOSIT" ? "Cash In" : t === "WITHDRAWAL" ? "Cash Out" : "Petty Expense"}
                      </Button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5"><Label>Amount (LKR)</Label><Input type="number" value={movementAmount} onChange={(e) => setMovementAmount(e.target.value)} /></div>
                    <div className="space-y-1.5"><Label>Description</Label><Input value={movementDesc} onChange={(e) => setMovementDesc(e.target.value)} placeholder="Reason..." /></div>
                  </div>
                  <Button onClick={() => void handleMovement()} disabled={moving} className="gap-2">
                    {moving ? <Loader2 className="h-4 w-4 animate-spin" /> : movementType === "DEPOSIT" ? <ArrowDownCircle className="h-4 w-4" /> : <ArrowUpCircle className="h-4 w-4" />}
                    Record
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
