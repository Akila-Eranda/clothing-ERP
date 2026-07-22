"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Download, Eye, Loader2, LogIn, Printer, RefreshCw, Shield, Trash2, Pencil, Plus,
} from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ClientSideTable, DataTableColumnHeader } from "@/components/table";
import { toast } from "sonner";
import { api, logClientAuditEvent } from "@/lib/api";
import { useShopWorkspace } from "@/lib/use-shop-profile";

type AuditUser = { firstName?: string; lastName?: string | null; email?: string | null };

type AuditRow = {
  id: string;
  action: string;
  resource: string;
  resourceId?: string | null;
  userId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string;
  oldData?: Record<string, unknown> | null;
  newData?: Record<string, unknown> | null;
  user?: AuditUser | null;
};

type Summary = {
  days: number;
  total: number;
  byAction: Record<string, number>;
};

const ACTION_FILTERS = [
  "ALL", "CREATE", "UPDATE", "DELETE", "LOGIN", "LOGOUT", "LOGIN_FAILED",
  "APPROVE", "REJECT", "PRINT", "EXPORT",
] as const;

const ACTION_STYLES: Record<string, string> = {
  CREATE: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  UPDATE: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  DELETE: "bg-red-500/15 text-red-600 border-red-500/30",
  LOGIN: "bg-teal-500/15 text-teal-600 border-teal-500/30",
  LOGOUT: "bg-slate-500/15 text-slate-600 border-slate-500/30",
  LOGIN_FAILED: "bg-orange-500/15 text-orange-600 border-orange-500/30",
  APPROVE: "bg-violet-500/15 text-violet-600 border-violet-500/30",
  REJECT: "bg-rose-500/15 text-rose-600 border-rose-500/30",
  PRINT: "bg-cyan-500/15 text-cyan-600 border-cyan-500/30",
  EXPORT: "bg-indigo-500/15 text-indigo-600 border-indigo-500/30",
  DAY_END: "bg-amber-500/15 text-amber-600 border-amber-500/30",
};

function actionBadge(action: string) {
  const key = action?.toUpperCase?.() ?? action;
  const cls = ACTION_STYLES[key] ?? "bg-muted text-muted-foreground";
  return (
    <Badge variant="outline" className={`text-[10px] font-mono ${cls}`}>
      {action || "—"}
    </Badge>
  );
}

function userLabel(row: AuditRow) {
  const u = row.user;
  if (!u) return row.userId ? "User" : "System";
  const name = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
  return name || u.email || "User";
}

export function AuditTrailHub() {
  const { profile } = useShopWorkspace();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [action, setAction] = useState<string>("ALL");
  const [resource, setResource] = useState("");
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [detail, setDetail] = useState<AuditRow | null>(null);
  const limit = 50;

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(limit) });
      if (action !== "ALL") params.set("action", action);
      if (resource.trim()) params.set("resource", resource.trim());
      if (search.trim()) params.set("search", search.trim());
      if (startDate && endDate) {
        params.set("startDate", startDate);
        params.set("endDate", endDate);
      }
      const [listRes, sumRes] = await Promise.all([
        api.get<{ data: AuditRow[]; total: number }>(`/audit-logs?${params}`),
        api.get<Summary>("/audit-logs/summary?days=30"),
      ]);
      setRows(listRes.data?.data ?? []);
      setTotal(listRes.data?.total ?? 0);
      setPage(p);
      setSummary(sumRes.data ?? null);
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to load audit trail");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [action, resource, search, startDate, endDate]);

  useEffect(() => { void load(1); }, [load]);

  const chips = useMemo(() => {
    const by = summary?.byAction ?? {};
    return [
      { key: "CREATE", label: "Create", icon: Plus, n: by.CREATE ?? 0 },
      { key: "UPDATE", label: "Update", icon: Pencil, n: by.UPDATE ?? 0 },
      { key: "DELETE", label: "Delete", icon: Trash2, n: by.DELETE ?? 0 },
      { key: "LOGIN", label: "Login", icon: LogIn, n: (by.LOGIN ?? 0) + (by.LOGIN_FAILED ?? 0) },
      { key: "APPROVE", label: "Approvals", icon: Shield, n: (by.APPROVE ?? 0) + (by.REJECT ?? 0) },
      { key: "PRINT", label: "Print", icon: Printer, n: by.PRINT ?? 0 },
      { key: "EXPORT", label: "Export", icon: Download, n: by.EXPORT ?? 0 },
    ];
  }, [summary]);

  const columns = useMemo<ColumnDef<AuditRow>[]>(() => [
    {
      id: "when",
      accessorKey: "createdAt",
      header: ({ column }) => <DataTableColumnHeader column={column} title="When" />,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {new Date(row.original.createdAt).toLocaleString("en-LK")}
        </span>
      ),
    },
    {
      id: "action",
      accessorKey: "action",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Action" />,
      cell: ({ row }) => actionBadge(row.original.action),
    },
    {
      id: "resource",
      accessorFn: (r) => `${r.resource ?? ""} ${r.resourceId ?? ""}`,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Resource" />,
      cell: ({ row }) => (
        <div>
          <p className="text-sm font-medium">{row.original.resource ?? "—"}</p>
          {row.original.resourceId && (
            <p className="text-[10px] font-mono text-muted-foreground truncate max-w-[180px]">
              {row.original.resourceId}
            </p>
          )}
        </div>
      ),
    },
    {
      id: "user",
      accessorFn: (r) => userLabel(r),
      header: ({ column }) => <DataTableColumnHeader column={column} title="User" />,
      cell: ({ row }) => {
        const u = row.original.user;
        return (
          <div>
            <p className="text-sm">{userLabel(row.original)}</p>
            <p className="text-[10px] text-muted-foreground">{u?.email ?? ""}</p>
          </div>
        );
      },
    },
    {
      id: "ip",
      accessorKey: "ipAddress",
      header: ({ column }) => <DataTableColumnHeader column={column} title="IP" />,
      cell: ({ row }) => (
        <span className="text-xs font-mono text-muted-foreground">
          {row.original.ipAddress ?? "—"}
        </span>
      ),
    },
    {
      id: "detail",
      enableSorting: false,
      header: () => <span className="text-xs">Detail</span>,
      cell: ({ row }) => (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2"
          onClick={() => setDetail(row.original)}
        >
          <Eye className="h-3.5 w-3.5" />
        </Button>
      ),
    },
  ], []);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const onExportAudit = async () => {
    try {
      await logClientAuditEvent({
        action: "EXPORT",
        resource: "audit_trail",
        metadata: { actionFilter: action, resource, search },
      });
      toast.success("Export logged");
    } catch {
      /* table export still proceeds via ClientSideTable */
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            Audit Trail
          </h1>
          <p className="text-sm text-muted-foreground">
            {profile.label} · Create, Update, Delete, Login, Approvals, Print, Export
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => load(page)} className="gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {chips.map((c) => (
          <Card
            key={c.key}
            className={`cursor-pointer transition-colors ${action === c.key ? "border-primary" : ""}`}
            onClick={() => setAction((prev) => (prev === c.key ? "ALL" : c.key))}
          >
            <CardContent className="p-3 flex items-center gap-2">
              <c.icon className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{c.label}</p>
                <p className="text-lg font-semibold leading-none">{c.n}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Action</Label>
              <Select value={action} onValueChange={setAction}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACTION_FILTERS.map((a) => (
                    <SelectItem key={a} value={a}>{a === "ALL" ? "All actions" : a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Resource</Label>
              <Input
                className="h-9"
                placeholder="e.g. products, Auth"
                value={resource}
                onChange={(e) => setResource(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Search</Label>
              <Input
                className="h-9"
                placeholder="IP, id, action…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Input type="date" className="h-9" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input type="date" className="h-9" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {loading && !rows.length ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <ClientSideTable
          fillHeight={false}
            data={rows}
            columns={columns}
            pageCount={1}
            searchableColumns={[
              { id: "action", title: "Action" },
              { id: "resource", title: "Resource" },
              { id: "user", title: "User" },
            ]}
            filterableColumns={[]}
            isShowExportButtons={{ isShow: true, fileName: "audit-trail" }}
          />
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">
              Page {page} of {totalPages} · {total} entries
              {summary ? ` · ${summary.total} in last ${summary.days}d` : ""}
            </span>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" disabled={page <= 1 || loading} onClick={() => load(page - 1)}>
                Prev
              </Button>
              <Button size="sm" variant="outline" disabled={page >= totalPages || loading} onClick={() => load(page + 1)}>
                Next
              </Button>
              <Button size="sm" variant="secondary" className="gap-1" onClick={() => void onExportAudit()}>
                <Download className="h-3.5 w-3.5" /> Log export
              </Button>
            </div>
          </div>
        </>
      )}

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              {detail && actionBadge(detail.action)}
              <span>{detail?.resource}</span>
            </DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-muted-foreground">When</p>
                  <p>{new Date(detail.createdAt).toLocaleString("en-LK")}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">User</p>
                  <p>{userLabel(detail)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Resource ID</p>
                  <p className="font-mono break-all">{detail.resourceId ?? "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">IP</p>
                  <p className="font-mono">{detail.ipAddress ?? "—"}</p>
                </div>
              </div>
              {detail.oldData && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Before</p>
                  <pre className="text-[11px] bg-muted/50 rounded-md p-2 overflow-x-auto">
                    {JSON.stringify(detail.oldData, null, 2)}
                  </pre>
                </div>
              )}
              {detail.newData && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">After / payload</p>
                  <pre className="text-[11px] bg-muted/50 rounded-md p-2 overflow-x-auto">
                    {JSON.stringify(detail.newData, null, 2)}
                  </pre>
                </div>
              )}
              {detail.userAgent && (
                <p className="text-[10px] text-muted-foreground break-all">{detail.userAgent}</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
