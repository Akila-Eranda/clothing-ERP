"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ClientSideTable } from "@/components/table";
import { Badge } from "@/components/ui/badge";

type Status = "OK" | "MISMATCH" | "NOT_CHECKED" | "DECISION_REQUIRED";
type Check = {
  key: string;
  title: string;
  a: { label: string; source: string; value: number | null };
  b: { label: string; source: string; value: number | null };
  difference: number | null;
  status: Status;
  note?: string;
};
type Report = {
  summary: { total: number; ok: number; mismatch: number; notChecked: number; decisionRequired: number; clean: boolean };
  checks: Check[];
};

const statusClass: Record<Status, string> = {
  OK: "bg-success/10 text-success-text",
  MISMATCH: "bg-destructive/10 text-destructive-text",
  NOT_CHECKED: "bg-slate-500/10 text-slate-700",
  DECISION_REQUIRED: "bg-warning/10 text-warning-text",
};

export function ReconciliationReport() {
  const [report, setReport] = useState<Report | null>(null);
  const [branchId, setBranchId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (branchId) params.set("branchId", branchId);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (status) params.set("status", status);
      const response = await api.get<Report>(`/accounting/reconciliation?${params.toString()}`);
      setReport(response.data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load reconciliation");
    } finally {
      setLoading(false);
    }
  }, [branchId, dateFrom, dateTo, status]);

  useEffect(() => { void load(); }, [load]);

  const columns = useMemo<ColumnDef<Check>[]>(() => [
    { accessorKey: "title", header: "Check" },
    {
      id: "sources",
      header: "Sources",
      cell: ({ row }) => (
        <div className="max-w-[360px] text-xs">
          <div>{row.original.a.label}: {row.original.a.value ?? "—"}</div>
          <div className="text-muted-foreground">{row.original.b.label}: {row.original.b.value ?? "—"}</div>
        </div>
      ),
    },
    { accessorKey: "difference", header: "Difference", cell: ({ row }) => row.original.difference ?? "—" },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <Badge className={statusClass[row.original.status]}>{row.original.status}</Badge>,
    },
    { accessorKey: "note", header: "Reviewer detail", cell: ({ row }) => <span className="text-xs">{row.original.note ?? "—"}</span> },
  ], []);

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-xl font-semibold">Accounting reconciliation</h1>
        <p className="text-sm text-muted-foreground">Read-only source-to-GL checks. No adjustment journals are created.</p>
      </div>
      <div className="flex flex-wrap items-end gap-3 rounded-lg border p-4">
        <label className="text-xs">Branch ID<input className="mt-1 block h-9 rounded-md border px-2 text-sm" value={branchId} onChange={(e) => setBranchId(e.target.value)} placeholder="Optional" /></label>
        <label className="text-xs">From<input type="date" className="mt-1 block h-9 rounded-md border px-2 text-sm" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></label>
        <label className="text-xs">To<input type="date" className="mt-1 block h-9 rounded-md border px-2 text-sm" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></label>
        <label className="text-xs">Status<select className="mt-1 block h-9 rounded-md border px-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option>{(["OK", "MISMATCH", "NOT_CHECKED", "DECISION_REQUIRED"] as Status[]).map((value) => <option key={value}>{value}</option>)}</select></label>
        <Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
      </div>
      {report && <div className="grid grid-cols-2 gap-3 md:grid-cols-6">{Object.entries({ Total: report.summary.total, OK: report.summary.ok, Mismatches: report.summary.mismatch, "Not checked": report.summary.notChecked, "Decisions": report.summary.decisionRequired, Clean: report.summary.clean ? "Yes" : "No" }).map(([label, value]) => <div key={label} className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="text-lg font-semibold">{value}</div></div>)}</div>}
      <ClientSideTable data={report?.checks ?? []} columns={columns} pageCount={1} filterableColumns={[]} isShowExportButtons={{ isShow: true, fileName: "accounting-reconciliation" }} />
    </div>
  );
}
