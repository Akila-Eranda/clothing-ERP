"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Download, FileUp,
  Loader2, Pencil, Plus, RefreshCw, Search, Trash2, Upload, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import { useShopWorkspace } from "@/lib/use-shop-profile";

type AccountType = "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";

type CoaNode = {
  id: string;
  parentId: string | null;
  code: string;
  name: string;
  type: AccountType;
  description: string | null;
  isSystem: boolean;
  isActive: boolean;
  balance: number;
  openingBalance: number;
  openingBalanceDate?: string | null;
  depth: number;
  children: CoaNode[];
};

const TYPE_META: Record<AccountType, { label: string; color: string; bg: string }> = {
  ASSET: { label: "Assets", color: "text-emerald-600", bg: "bg-emerald-500/10" },
  LIABILITY: { label: "Liabilities", color: "text-red-600", bg: "bg-red-500/10" },
  EQUITY: { label: "Equity", color: "text-blue-600", bg: "bg-blue-500/10" },
  REVENUE: { label: "Income", color: "text-violet-600", bg: "bg-violet-500/10" },
  EXPENSE: { label: "Expenses", color: "text-amber-600", bg: "bg-amber-500/10" },
};

function flatten(nodes: CoaNode[]): CoaNode[] {
  const out: CoaNode[] = [];
  const walk = (list: CoaNode[]) => {
    for (const n of list) {
      out.push(n);
      if (n.children?.length) walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

function filterTree(nodes: CoaNode[], q: string, type: string): CoaNode[] {
  const needle = q.trim().toLowerCase();
  return nodes.flatMap((node) => {
    const children = filterTree(node.children ?? [], q, type);
    const matchesType = type === "ALL" || node.type === type;
    const matchesSearch =
      !needle ||
      node.code.toLowerCase().includes(needle) ||
      node.name.toLowerCase().includes(needle) ||
      node.description?.toLowerCase().includes(needle);

    if ((matchesType && matchesSearch) || children.length > 0) {
      return [{ ...node, children }];
    }
    return [];
  });
}

function AccountFormModal({
  edit,
  parents,
  onClose,
  onSaved,
}: {
  edit?: CoaNode | null;
  parents: CoaNode[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [code, setCode] = useState(edit?.code ?? "");
  const [name, setName] = useState(edit?.name ?? "");
  const [type, setType] = useState<AccountType>(edit?.type ?? "ASSET");
  const [desc, setDesc] = useState(edit?.description ?? "");
  const [parentId, setParentId] = useState(edit?.parentId ?? "");
  const [openingBalance, setOpeningBalance] = useState(
    edit ? String(edit.openingBalance ?? 0) : "0",
  );
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);

  const parentOptions = parents.filter(
    (p) => p.type === type && p.id !== edit?.id && p.isActive,
  );

  const suggestCode = async (t: AccountType, pid: string) => {
    if (edit) return;
    setSuggesting(true);
    try {
      const qs = new URLSearchParams({ type: t });
      if (pid) qs.set("parentId", pid);
      const res = await api.get<{ code: string }>(`/accounting/accounts/next-code?${qs}`);
      if (res.data?.code) setCode(res.data.code);
    } catch {
      /* keep manual */
    } finally {
      setSuggesting(false);
    }
  };

  useEffect(() => {
    if (!edit) void suggestCode(type, parentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    if (!name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      const payload = {
        code: code.trim() || undefined,
        name: name.trim(),
        type,
        description: desc.trim() || undefined,
        parentId: parentId || null,
        openingBalance: parseFloat(openingBalance) || 0,
      };
      if (edit) {
        await api.put(`/accounting/accounts/${edit.id}`, payload);
        toast.success("Account updated");
      } else {
        await api.post("/accounting/accounts", payload);
        toast.success("Account created");
      }
      onSaved();
      onClose();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{edit ? "Edit Account" : "New Account"}</DialogTitle>
          <DialogDescription>
            {edit ? "Update the selected ledger account." : "Add a new ledger account to the chart."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <Select
                value={type}
                onValueChange={(v) => {
                  const t = v as AccountType;
                  setType(t);
                  setParentId("");
                  void suggestCode(t, "");
                }}
              >
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(TYPE_META) as AccountType[]).map((t) => (
                    <SelectItem key={t} value={t}>{TYPE_META[t].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Code</Label>
              <div className="flex gap-1.5">
                <Input value={code} onChange={(e) => setCode(e.target.value)} className="h-9 font-mono" placeholder="Auto" />
                {!edit && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 shrink-0"
                    disabled={suggesting}
                    onClick={() => suggestCode(type, parentId)}
                  >
                    {suggesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Gen"}
                  </Button>
                )}
              </div>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Parent account</Label>
            <Select
              value={parentId || "__none__"}
              onValueChange={(v) => {
                const pid = v === "__none__" ? "" : v;
                setParentId(pid);
                void suggestCode(type, pid);
              }}
            >
              <SelectTrigger className="h-9"><SelectValue placeholder="None (root)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None (root)</SelectItem>
                {parentOptions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.code} — {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Opening balance</Label>
              <Input
                type="number"
                step="0.01"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Description</Label>
              <Input value={desc} onChange={(e) => setDesc(e.target.value)} className="h-9" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" disabled={saving} onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={saving} onClick={save} className="gap-1.5">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {edit ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ChartOfAccountsHub() {
  const { profile } = useShopWorkspace();
  const [tree, setTree] = useState<CoaNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const [edit, setEdit] = useState<CoaNode | null>(null);
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: CoaNode[]; total: number }>(
        "/accounting/accounts?includeInactive=true",
      );
      const data = Array.isArray(res.data) ? (res.data as unknown as CoaNode[]) : (res.data?.data ?? []);
      setTree(data);
      // Expand roots by default
      setExpanded(new Set(data.map((n) => n.id)));
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to load COA");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const flat = useMemo(() => flatten(tree), [tree]);
  const filteredTree = useMemo(() => filterTree(tree, q, typeFilter), [tree, q, typeFilter]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const visibleRows = useMemo(() => {
    const rows: CoaNode[] = [];
    const walk = (nodes: CoaNode[]) => {
      for (const n of nodes) {
        rows.push(n);
        if (n.children?.length && expanded.has(n.id)) walk(n.children);
      }
    };
    walk(filteredTree);
    return rows;
  }, [filteredTree, expanded]);

  const expandAll = () => setExpanded(new Set(flat.map((node) => node.id)));
  const collapseAll = () => setExpanded(new Set());

  const remove = async (node: CoaNode) => {
    if (node.isSystem) { toast.error("System accounts cannot be deleted"); return; }
    if (!window.confirm(`Deactivate ${node.code} — ${node.name}?`)) return;
    try {
      await api.delete(`/accounting/accounts/${node.id}`);
      toast.success("Account deactivated");
      load();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Delete failed");
    }
  };

  const exportCsv = async () => {
    try {
      const res = await api.get<Record<string, string | number>[]>("/accounting/accounts/export");
      const rows = Array.isArray(res.data) ? res.data : [];
      const header = ["code", "name", "type", "parentCode", "description", "openingBalance", "balance"];
      const lines = [
        header.join(","),
        ...rows.map((r) =>
          header
            .map((h) => {
              const v = String(r[h] ?? "");
              return v.includes(",") ? `"${v.replace(/"/g, '""')}"` : v;
            })
            .join(","),
        ),
      ];
      const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `chart-of-accounts-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${rows.length} accounts`);
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Export failed");
    }
  };

  const onImportFile = async (file: File) => {
    setImporting(true);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) throw new Error("CSV needs a header and at least one row");
      const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
      const rows = lines.slice(1).map((line) => {
        const cols = line.match(/("([^"]|"")*"|[^,]*)/g)?.map((c) => c.replace(/^"|"$/g, "").replace(/""/g, '"').trim()) ?? [];
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => { obj[h] = cols[i] ?? ""; });
        return obj;
      });
      const res = await api.post<{ created: number; updated: number }>("/accounting/accounts/import", { rows });
      toast.success(`Import done — ${res.data?.created ?? 0} created, ${res.data?.updated ?? 0} updated`);
      load();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const seedDefaults = async () => {
    try {
      const res = await api.post<{
        accountsCreated: number;
        accountsExisting: number;
        fiscalYearCreated: boolean;
        cashAccountsCreated: number;
      }>("/accounting/bootstrap", {});
      const d = res.data;
      toast.success(
        `Accounting ready — ${d?.accountsCreated ?? 0} new accounts` +
          (d?.fiscalYearCreated ? ", fiscal year created" : "") +
          (d?.cashAccountsCreated ? `, ${d.cashAccountsCreated} cash books` : ""),
      );
      load();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Bootstrap failed");
    }
  };

  const backfillJournals = async () => {
    try {
      const res = await api.post<{
        journalsPosted: number;
        alreadyPostedOrSkipped: number;
        sales: number;
        grns: number;
        expenses: number;
      }>("/accounting/backfill?limit=200", {});
      const d = res.data;
      toast.success(
        `Posted ${d?.journalsPosted ?? 0} journals` +
          (d?.alreadyPostedOrSkipped ? ` (${d.alreadyPostedOrSkipped} already done)` : ""),
      );
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Backfill failed");
    }
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Chart of Accounts</h1>
          <p className="text-sm text-muted-foreground">
            {profile.label} · Organise assets, liabilities, equity, income, and expenses
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => void exportCsv()} className="gap-1.5">
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
          <label className="inline-flex cursor-pointer">
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              disabled={importing}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onImportFile(f);
                e.target.value = "";
              }}
            />
            <span className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border bg-background px-3 text-xs font-medium hover:bg-accent hover:text-accent-foreground">
              {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              Import
            </span>
          </label>
          <Button variant="outline" size="sm" onClick={seedDefaults} className="gap-1.5">
            <FileUp className="h-3.5 w-3.5" /> Auto-setup
          </Button>
          <Button variant="outline" size="sm" onClick={() => void backfillJournals()} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Backfill journals
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => { setEdit(null); setModalOpen(true); }}
          >
            <Plus className="h-3.5 w-3.5" /> New Account
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {(Object.keys(TYPE_META) as AccountType[]).map((t) => {
          const count = flat.filter((a) => a.type === t).length;
          const balance = flat
            .filter((a) => a.type === t)
            .reduce((sum, account) => sum + Number(account.balance || 0), 0);
          const meta = TYPE_META[t];
          return (
            <Card
              key={t}
              className={`cursor-pointer transition-colors hover:border-primary/40 ${
                typeFilter === t ? "border-primary bg-primary/[0.03]" : ""
              }`}
              onClick={() => setTypeFilter((current) => current === t ? "ALL" : t)}
            >
              <CardContent className="p-4">
                <p className={`text-[10px] font-semibold uppercase tracking-wide ${meta.color}`}>{meta.label}</p>
                <div className="mt-1 flex items-end justify-between gap-2">
                  <p className="text-xl font-bold">{count}</p>
                  <p className="truncate text-[10px] tabular-nums text-muted-foreground">
                    {formatNumber(balance)}
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center gap-2 border-b p-3">
            <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search code, name, or description…"
                className="h-9 pl-8 pr-8"
              />
              {q && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setQ("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All types</SelectItem>
                {(Object.keys(TYPE_META) as AccountType[]).map((t) => (
                  <SelectItem key={t} value={t}>{TYPE_META[t].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" variant="ghost" size="sm" className="h-9 gap-1.5" onClick={expandAll}>
              <ChevronsUpDown className="h-3.5 w-3.5" /> Expand
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-9 gap-1.5" onClick={collapseAll}>
              <ChevronsDownUp className="h-3.5 w-3.5" /> Collapse
            </Button>
            <Badge variant="secondary" className="ml-auto text-[10px]">
              {visibleRows.length} of {flat.length}
            </Badge>
          </div>
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : visibleRows.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground space-y-3">
              <p>{flat.length ? "No accounts match your filters." : "No accounts yet."}</p>
              {flat.length ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { setQ(""); setTypeFilter("ALL"); }}
                >
                  Clear filters
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => void seedDefaults()}>Auto-setup accounting</Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-[10px] uppercase tracking-wide text-muted-foreground">
                    <th className="w-[180px] px-4 py-3 text-left font-semibold">Code</th>
                    <th className="px-4 py-3 text-left font-semibold">Account</th>
                    <th className="w-[180px] px-4 py-3 text-left font-semibold">Type</th>
                    <th className="w-[130px] px-4 py-3 text-right font-semibold">Opening</th>
                    <th className="w-[130px] px-4 py-3 text-right font-semibold">Balance</th>
                    <th className="w-[90px] px-4 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => {
                    const hasChildren = (row.children?.length ?? 0) > 0;
                    const open = expanded.has(row.id);
                    const meta = TYPE_META[row.type];
                    return (
                      <tr
                        key={row.id}
                        className={`border-b border-border/40 hover:bg-muted/20 ${
                          !row.isActive ? "opacity-55" : ""
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div
                            className="flex items-center gap-1 font-mono text-xs"
                            style={{ paddingLeft: Math.min(row.depth, 5) * 14 }}
                          >
                            {hasChildren ? (
                              <button
                                type="button"
                                aria-label={open ? `Collapse ${row.name}` : `Expand ${row.name}`}
                                onClick={() => toggle(row.id)}
                                className="rounded p-0.5 hover:bg-muted"
                              >
                                {open
                                  ? <ChevronDown className="h-3.5 w-3.5" />
                                  : <ChevronRight className="h-3.5 w-3.5" />}
                              </button>
                            ) : (
                              <span className="w-4" />
                            )}
                            {row.code}
                          </div>
                        </td>
                        <td className="max-w-[320px] px-4 py-3">
                          <p className="truncate font-medium">{row.name}</p>
                          {row.description && (
                            <p className="truncate text-[10px] text-muted-foreground">{row.description}</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${meta.bg} ${meta.color}`}>
                            {meta.label}
                          </span>
                          {row.isSystem && <Badge variant="outline" className="ml-1 text-[9px]">System</Badge>}
                          {!row.isActive && <Badge variant="secondary" className="ml-1 text-[9px]">Inactive</Badge>}
                        </td>
                        <td className="px-4 py-3 text-right text-xs tabular-nums text-muted-foreground">
                          {formatNumber(row.openingBalance)}
                        </td>
                        <td className={`px-4 py-3 text-right text-xs font-semibold tabular-nums ${
                          row.balance < 0 ? "text-red-500" : ""
                        }`}>
                          {formatNumber(row.balance)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 hover:text-blue-600"
                              aria-label={`Edit ${row.name}`}
                              onClick={() => { setEdit(row); setModalOpen(true); }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 hover:bg-red-500/10 hover:text-red-500"
                              aria-label={`Deactivate ${row.name}`}
                              disabled={row.isSystem || !row.isActive}
                              onClick={() => void remove(row)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
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

      {modalOpen && (
        <AccountFormModal
          edit={edit}
          parents={flat}
          onClose={() => { setModalOpen(false); setEdit(null); }}
          onSaved={load}
        />
      )}
    </div>
  );
}
