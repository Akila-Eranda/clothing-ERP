"use client";

import { useCallback, useEffect, useState } from "react";
import {
  FileSpreadsheet, FileText, Loader2, Printer, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { api, tokenStorage, logClientAuditEvent } from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import { useShopWorkspace } from "@/lib/use-shop-profile";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

type ReportId =
  | "trial-balance"
  | "profit-loss"
  | "balance-sheet"
  | "cash-flow"
  | "general-ledger"
  | "customer-statement"
  | "supplier-statement"
  | "vat";

const REPORTS: Array<{ id: ReportId; name: string; needsPeriod: boolean; needsParty?: "customer" | "supplier" }> = [
  { id: "trial-balance", name: "Trial Balance", needsPeriod: false },
  { id: "profit-loss", name: "Profit & Loss", needsPeriod: true },
  { id: "balance-sheet", name: "Balance Sheet", needsPeriod: false },
  { id: "cash-flow", name: "Cash Flow", needsPeriod: true },
  { id: "general-ledger", name: "General Ledger", needsPeriod: true },
  { id: "customer-statement", name: "Customer Statement", needsPeriod: true, needsParty: "customer" },
  { id: "supplier-statement", name: "Supplier Statement", needsPeriod: true, needsParty: "supplier" },
  { id: "vat", name: "VAT Report", needsPeriod: true },
];

type AccountOpt = { id: string; code: string; name: string };
type PartyOpt = { id: string; name: string; code?: string | null };

function monthStart() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), 1).toISOString().slice(0, 10);
}
function today() {
  return new Date().toISOString().slice(0, 10);
}

function buildQuery(params: Record<string, string | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) q.set(k, v);
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

async function downloadExport(path: string, fallbackName: string) {
  const token = tokenStorage.getAccess();
  const tenant = tokenStorage.getTenant();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (tenant) headers["X-Tenant-Id"] = tenant;
  const res = await fetch(`${API_BASE}${path}`, { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || `Export failed (${res.status})`);
  }
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition");
  const match = cd?.match(/filename="?([^"]+)"?/);
  const filename = match?.[1] || fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function FinancialReportsHub() {
  useShopWorkspace();
  const [reportId, setReportId] = useState<ReportId>("trial-balance");
  const [start, setStart] = useState(monthStart());
  const [end, setEnd] = useState(today());
  const [accountId, setAccountId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [accounts, setAccounts] = useState<AccountOpt[]>([]);
  const [customers, setCustomers] = useState<PartyOpt[]>([]);
  const [suppliers, setSuppliers] = useState<PartyOpt[]>([]);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const meta = REPORTS.find((r) => r.id === reportId)!;

  useEffect(() => {
    void (async () => {
      try {
        const [aRes, cRes, sRes] = await Promise.all([
          api.get<AccountOpt[] | { flat?: AccountOpt[] }>("/accounting/accounts?flat=true"),
          api.get<{ data?: PartyOpt[] } | PartyOpt[]>("/customers?limit=200"),
          api.get<{ data?: PartyOpt[] } | PartyOpt[]>("/suppliers?limit=200"),
        ]);
        const accts = Array.isArray(aRes.data)
          ? aRes.data
          : Array.isArray((aRes.data as { flat?: AccountOpt[] })?.flat)
            ? (aRes.data as { flat: AccountOpt[] }).flat
            : [];
        setAccounts(accts.map((a) => ({ id: a.id, code: a.code, name: a.name })));

        const rawC = cRes.data as { data?: PartyOpt[] } | PartyOpt[];
        const custs = Array.isArray(rawC) ? rawC : Array.isArray(rawC?.data) ? rawC.data : [];
        setCustomers(custs);

        const rawS = sRes.data as { data?: PartyOpt[] } | PartyOpt[];
        const sups = Array.isArray(rawS) ? rawS : Array.isArray(rawS?.data) ? rawS.data : [];
        setSuppliers(sups);
      } catch {
        /* optional lists */
      }
    })();
  }, []);

  const queryParams = useCallback(() => {
    return {
      startDate: meta.needsPeriod ? start : undefined,
      endDate: meta.needsPeriod ? end : undefined,
      accountId: reportId === "general-ledger" ? accountId || undefined : undefined,
      customerId: reportId === "customer-statement" ? customerId || undefined : undefined,
      supplierId: reportId === "supplier-statement" ? supplierId || undefined : undefined,
    };
  }, [meta.needsPeriod, start, end, reportId, accountId, customerId, supplierId]);

  const load = useCallback(async () => {
    if (reportId === "customer-statement" && !customerId) {
      toast.error("Select a customer");
      return;
    }
    if (reportId === "supplier-statement" && !supplierId) {
      toast.error("Select a supplier");
      return;
    }
    setLoading(true);
    try {
      const q = buildQuery(queryParams());
      const res = await api.get<Record<string, unknown>>(`/accounting/reports/${reportId}${q}`);
      setData(res.data ?? null);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to generate report");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [reportId, customerId, supplierId, queryParams]);

  useEffect(() => {
    if (reportId === "customer-statement" || reportId === "supplier-statement") return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId]);

  const doExport = async (format: "pdf" | "xlsx") => {
    setExporting(true);
    try {
      const q = buildQuery({ ...queryParams(), format });
      await downloadExport(
        `/accounting/reports/${reportId}/export${q}`,
        `${reportId}.${format === "xlsx" ? "xlsx" : "pdf"}`,
      );
      toast.success(`${format.toUpperCase()} downloaded`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const doPrint = () => {
    void logClientAuditEvent({
      action: "PRINT",
      resource: "financial_report",
      resourceId: reportId,
      metadata: { start, end, accountId, customerId, supplierId },
    });
    window.print();
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="print:hidden">
        <h1 className="text-xl font-bold tracking-tight">Financial Reports</h1>
        <p className="text-sm text-muted-foreground">
          Trial balance, P&amp;L, balance sheet, cash flow, GL, statements, and VAT — PDF, Excel, and print
        </p>
      </div>

      <Card className="print:hidden">
        <CardContent className="p-4 space-y-3">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">Report</Label>
              <Select value={reportId} onValueChange={(v) => { setReportId(v as ReportId); setData(null); }}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REPORTS.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {meta.needsPeriod && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">From</Label>
                  <Input type="date" className="h-9" value={start} onChange={(e) => setStart(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">To</Label>
                  <Input type="date" className="h-9" value={end} onChange={(e) => setEnd(e.target.value)} />
                </div>
              </>
            )}
            {reportId === "general-ledger" && (
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">Account (optional)</Label>
                <Select value={accountId || "__all"} onValueChange={(v) => setAccountId(v === "__all" ? "" : v)}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="All accounts" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all">All with activity</SelectItem>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.code} — {a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {meta.needsParty === "customer" && (
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">Customer</Label>
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select customer" /></SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {meta.needsParty === "supplier" && (
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">Supplier</Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select supplier" /></SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="h-9 gap-1.5" disabled={loading} onClick={() => void load()}>
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Generate
            </Button>
            <Button size="sm" variant="outline" className="h-9 gap-1.5" disabled={!data || exporting} onClick={() => void doExport("pdf")}>
              <FileText className="h-3.5 w-3.5" /> PDF
            </Button>
            <Button size="sm" variant="outline" className="h-9 gap-1.5" disabled={!data || exporting} onClick={() => void doExport("xlsx")}>
              <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
            </Button>
            <Button size="sm" variant="secondary" className="h-9 gap-1.5" disabled={!data} onClick={doPrint}>
              <Printer className="h-3.5 w-3.5" /> Print
            </Button>
          </div>
        </CardContent>
      </Card>

      <div id="financial-report-print" className="print:p-0">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : data ? (
          <ReportView reportId={reportId} data={data} />
        ) : (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              Select filters and click Generate
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function ReportView({ reportId, data }: { reportId: ReportId; data: Record<string, unknown> }) {
  const title = REPORTS.find((r) => r.id === reportId)?.name ?? reportId;

  return (
    <Card>
      <CardContent className="p-4 md:p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2 border-b pb-3">
          <div>
            <h2 className="text-lg font-bold">{title}</h2>
            <p className="text-xs text-muted-foreground">
              Generated {String(data.generatedAt ?? "").slice(0, 19).replace("T", " ")}
              {data.source ? ` · Source: ${String(data.source)}` : ""}
            </p>
          </div>
          {typeof data.balanced === "boolean" && (
            <Badge className={data.balanced ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>
              {data.balanced ? "Balanced" : "Out of balance"}
            </Badge>
          )}
        </div>

        {reportId === "trial-balance" && <TrialBalanceTable data={data} />}
        {reportId === "profit-loss" && <ProfitLossView data={data} />}
        {reportId === "balance-sheet" && <BalanceSheetView data={data} />}
        {reportId === "cash-flow" && <CashFlowView data={data} />}
        {reportId === "general-ledger" && <GeneralLedgerView data={data} />}
        {reportId === "vat" && <VatView data={data} />}
        {(reportId === "customer-statement" || reportId === "supplier-statement") && (
          <StatementView data={data} />
        )}
      </CardContent>
    </Card>
  );
}

function TrialBalanceTable({ data }: { data: Record<string, unknown> }) {
  const rows = (data.rows as Array<{ code: string; name: string; type: string; debit: number; credit: number }>) ?? [];
  return (
    <div className="space-y-3">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-[10px] uppercase text-muted-foreground">
            <th className="text-left py-2">Code</th>
            <th className="text-left py-2">Account</th>
            <th className="text-left py-2">Type</th>
            <th className="text-right py-2">Debit</th>
            <th className="text-right py-2">Credit</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.code} className="border-b border-border/40">
              <td className="py-1.5 font-mono text-xs">{r.code}</td>
              <td className="py-1.5">{r.name}</td>
              <td className="py-1.5 text-xs text-muted-foreground">{r.type}</td>
              <td className="py-1.5 text-right tabular-nums">{r.debit ? formatNumber(r.debit) : "—"}</td>
              <td className="py-1.5 text-right tabular-nums">{r.credit ? formatNumber(r.credit) : "—"}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-semibold border-t">
            <td colSpan={3} className="py-2">Totals</td>
            <td className="py-2 text-right tabular-nums">{formatNumber(Number(data.totalDebit) || 0)}</td>
            <td className="py-2 text-right tabular-nums">{formatNumber(Number(data.totalCredit) || 0)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function ProfitLossView({ data }: { data: Record<string, unknown> }) {
  const revenue = data.revenue as { lines: Array<{ code: string; name: string; amount: number }>; total: number };
  const expenses = data.expenses as { lines: Array<{ code: string; name: string; amount: number }>; total: number };
  return (
    <div className="space-y-4">
      <SectionTable title="Revenue" lines={revenue?.lines ?? []} total={revenue?.total ?? 0} />
      <SectionTable title="Expenses" lines={expenses?.lines ?? []} total={expenses?.total ?? 0} />
      <div className="flex justify-between items-center border-t pt-3">
        <span className="font-semibold">Net Profit / (Loss)</span>
        <span className={`text-xl font-bold tabular-nums ${(Number(data.netProfit) || 0) >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
          LKR {formatNumber(Number(data.netProfit) || 0)}
        </span>
      </div>
    </div>
  );
}

function BalanceSheetView({ data }: { data: Record<string, unknown> }) {
  const assets = data.assets as { lines: Array<{ code: string; name: string; balance: number }>; total: number };
  const liabilities = data.liabilities as { lines: Array<{ code: string; name: string; balance: number }>; total: number };
  const equity = data.equity as { lines: Array<{ code: string; name: string; balance: number }>; total: number };
  return (
    <div className="grid md:grid-cols-2 gap-6">
      <SectionBalance title="Assets" lines={assets?.lines ?? []} total={assets?.total ?? 0} />
      <div className="space-y-4">
        <SectionBalance title="Liabilities" lines={liabilities?.lines ?? []} total={liabilities?.total ?? 0} />
        <SectionBalance title="Equity" lines={equity?.lines ?? []} total={equity?.total ?? 0} />
        <div className="flex justify-between font-semibold border-t pt-2 text-sm">
          <span>Total L+E</span>
          <span className="tabular-nums">{formatNumber(Number(data.totalLiabilitiesEquity) || 0)}</span>
        </div>
      </div>
    </div>
  );
}

function CashFlowView({ data }: { data: Record<string, unknown> }) {
  const buckets = data.buckets as { operating: number; investing: number; financing: number; netChange: number } | undefined;
  const rows = (data.data as Array<{ date: string; inflow: number; outflow: number }>) ?? [];
  return (
    <div className="space-y-4">
      {buckets && (
        <div className="grid sm:grid-cols-4 gap-3">
          {[
            { label: "Operating", value: buckets.operating },
            { label: "Investing", value: buckets.investing },
            { label: "Financing", value: buckets.financing },
            { label: "Net change", value: buckets.netChange },
          ].map((c) => (
            <div key={c.label} className="rounded-lg border p-3">
              <p className="text-[10px] uppercase text-muted-foreground">{c.label}</p>
              <p className="font-bold tabular-nums mt-1">{formatNumber(c.value)}</p>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-6 text-sm">
        <span>Inflow: <strong className="tabular-nums">{formatNumber(Number(data.totalInflow) || 0)}</strong></span>
        <span>Outflow: <strong className="tabular-nums">{formatNumber(Number(data.totalOutflow) || 0)}</strong></span>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-[10px] uppercase text-muted-foreground">
            <th className="text-left py-2">Date</th>
            <th className="text-right py-2">Inflow</th>
            <th className="text-right py-2">Outflow</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.date} className="border-b border-border/40">
              <td className="py-1.5">{r.date}</td>
              <td className="py-1.5 text-right tabular-nums text-emerald-700">{formatNumber(r.inflow)}</td>
              <td className="py-1.5 text-right tabular-nums text-rose-700">{formatNumber(r.outflow)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GeneralLedgerView({ data }: { data: Record<string, unknown> }) {
  const ledgers = (data.ledgers as Array<{
    code: string;
    name: string;
    openingBalance: number;
    closingBalance: number;
    entries: Array<{ date: string; entryNumber: string; description: string; debit: number; credit: number; balance: number }>;
  }>) ?? [];
  return (
    <div className="space-y-6">
      {ledgers.map((led) => (
        <div key={led.code}>
          <h3 className="font-semibold text-sm mb-1">
            {led.code} — {led.name}
          </h3>
          <p className="text-xs text-muted-foreground mb-2">
            Opening {formatNumber(led.openingBalance)} → Closing {formatNumber(led.closingBalance)}
          </p>
          <table className="w-full text-sm mb-2">
            <thead>
              <tr className="border-b text-[10px] uppercase text-muted-foreground">
                <th className="text-left py-1">Date</th>
                <th className="text-left py-1">JE</th>
                <th className="text-left py-1">Description</th>
                <th className="text-right py-1">Debit</th>
                <th className="text-right py-1">Credit</th>
                <th className="text-right py-1">Balance</th>
              </tr>
            </thead>
            <tbody>
              {led.entries.map((e, i) => (
                <tr key={`${e.entryNumber}-${i}`} className="border-b border-border/40">
                  <td className="py-1">{e.date}</td>
                  <td className="py-1 font-mono text-xs">{e.entryNumber}</td>
                  <td className="py-1">{e.description}</td>
                  <td className="py-1 text-right tabular-nums">{e.debit ? formatNumber(e.debit) : "—"}</td>
                  <td className="py-1 text-right tabular-nums">{e.credit ? formatNumber(e.credit) : "—"}</td>
                  <td className="py-1 text-right tabular-nums font-medium">{formatNumber(e.balance)}</td>
                </tr>
              ))}
              {!led.entries.length && (
                <tr><td colSpan={6} className="py-3 text-center text-muted-foreground">No movements</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ))}
      {!ledgers.length && <p className="text-sm text-muted-foreground">No ledger activity</p>}
    </div>
  );
}

function VatView({ data }: { data: Record<string, unknown> }) {
  const byRate = (data.outputByRate as Array<{ taxRate: number; taxAmount: number; lineTotal: number }>) ?? [];
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-3 gap-3">
        {[
          { label: "Output VAT", value: data.outputVat },
          { label: "Input VAT", value: data.inputVat },
          { label: "Net VAT", value: data.netVat },
        ].map((c) => (
          <div key={c.label} className="rounded-lg border p-3">
            <p className="text-[10px] uppercase text-muted-foreground">{c.label}</p>
            <p className="text-lg font-bold tabular-nums mt-1">LKR {formatNumber(Number(c.value) || 0)}</p>
          </div>
        ))}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-[10px] uppercase text-muted-foreground">
            <th className="text-left py-2">Rate</th>
            <th className="text-right py-2">Line total</th>
            <th className="text-right py-2">Tax</th>
          </tr>
        </thead>
        <tbody>
          {byRate.map((r) => (
            <tr key={r.taxRate} className="border-b border-border/40">
              <td className="py-1.5">{r.taxRate}%</td>
              <td className="py-1.5 text-right tabular-nums">{formatNumber(r.lineTotal)}</td>
              <td className="py-1.5 text-right tabular-nums">{formatNumber(r.taxAmount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatementView({ data }: { data: Record<string, unknown> }) {
  const entries = (data.entries as Array<{
    date?: string;
    description?: string;
    debit?: number;
    credit?: number;
    balance?: number;
    type?: string;
  }>) ?? (data.lines as typeof data.entries) ?? [];
  const list = Array.isArray(entries) ? entries : [];
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">{String(data.documentTitle ?? "Statement")}</p>
      {(data.openingBalance != null || data.closingBalance != null) && (
        <div className="flex gap-6 text-sm">
          {data.openingBalance != null && <span>Opening: <strong className="tabular-nums">{formatNumber(Number(data.openingBalance))}</strong></span>}
          {data.closingBalance != null && <span>Closing: <strong className="tabular-nums">{formatNumber(Number(data.closingBalance))}</strong></span>}
        </div>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-[10px] uppercase text-muted-foreground">
            <th className="text-left py-2">Date</th>
            <th className="text-left py-2">Description</th>
            <th className="text-right py-2">Debit</th>
            <th className="text-right py-2">Credit</th>
            <th className="text-right py-2">Balance</th>
          </tr>
        </thead>
        <tbody>
          {list.map((e, i) => (
            <tr key={i} className="border-b border-border/40">
              <td className="py-1.5">{String(e.date ?? "").slice(0, 10)}</td>
              <td className="py-1.5">{e.description ?? e.type ?? "—"}</td>
              <td className="py-1.5 text-right tabular-nums">{e.debit ? formatNumber(e.debit) : "—"}</td>
              <td className="py-1.5 text-right tabular-nums">{e.credit ? formatNumber(e.credit) : "—"}</td>
              <td className="py-1.5 text-right tabular-nums font-medium">{e.balance != null ? formatNumber(e.balance) : "—"}</td>
            </tr>
          ))}
          {!list.length && (
            <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">No entries</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function SectionTable({
  title,
  lines,
  total,
}: {
  title: string;
  lines: Array<{ code: string; name: string; amount: number }>;
  total: number;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold mb-2">{title}</h3>
      <table className="w-full text-sm">
        <tbody>
          {lines.map((l) => (
            <tr key={l.code} className="border-b border-border/40">
              <td className="py-1 font-mono text-xs w-20">{l.code}</td>
              <td className="py-1">{l.name}</td>
              <td className="py-1 text-right tabular-nums">{formatNumber(l.amount)}</td>
            </tr>
          ))}
          <tr className="font-medium">
            <td colSpan={2} className="py-2">Total {title}</td>
            <td className="py-2 text-right tabular-nums">{formatNumber(total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function SectionBalance({
  title,
  lines,
  total,
}: {
  title: string;
  lines: Array<{ code: string; name: string; balance: number }>;
  total: number;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold mb-2">{title}</h3>
      <table className="w-full text-sm">
        <tbody>
          {lines.map((l) => (
            <tr key={l.code + l.name} className="border-b border-border/40">
              <td className="py-1 font-mono text-xs w-16">{l.code}</td>
              <td className="py-1">{l.name}</td>
              <td className="py-1 text-right tabular-nums">{formatNumber(l.balance)}</td>
            </tr>
          ))}
          <tr className="font-semibold">
            <td colSpan={2} className="py-2">Total {title}</td>
            <td className="py-2 text-right tabular-nums">{formatNumber(total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
