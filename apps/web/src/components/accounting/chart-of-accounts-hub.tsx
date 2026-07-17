"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown, ChevronRight, Download, FileUp, Loader2, Pencil, Plus, RefreshCw,
  Search, Trash2, TreePine, Upload,
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
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}
    >
      <div className="bg-background rounded-2xl border shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h2 className="text-base font-bold">{edit ? "Edit Account" : "New Account"}</h2>
          <p className="text-xs text-muted-foreground">Chart of Accounts · Phase 01</p>
        </div>
        <div className="p-5 space-y-3">
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
        <div className="flex justify-end gap-2 px-5 py-4 border-t bg-muted/10">
          <Button variant="outline" size="sm" disabled={saving} onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={saving} onClick={save} className="gap-1.5">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {edit ? "Save" : "Create"}
          </Button>
        </div>
      </div>
    </div>
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
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (typeFilter !== "ALL") params.set("type", typeFilter);
      const res = await api.get<{ data: CoaNode[]; total: number }>(
        `/accounting/accounts?${params.toString()}`,
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
  }, [q, typeFilter]);

  useEffect(() => { load(); }, [load]);

  const flat = useMemo(() => flatten(tree), [tree]);

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
    walk(tree);
    return rows;
  }, [tree, expanded]);

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
      const res = await api.post<{ created: number }>("/accounting/accounts/seed-defaults", {});
      toast.success(`Seeded ${res.data?.created ?? 0} default accounts`);
      load();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Seed failed");
    }
  };

  return (
    <div className="p-6 space-y-5 max-w-[1400px] mx-auto">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <TreePine className="h-6 w-6 text-primary" />
            Chart of Accounts
          </h1>
          <p className="text-sm text-muted-foreground">
            {profile.label} · Phase 01 Foundation · Assets, Liabilities, Equity, Income, Expenses
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv} className="gap-1.5">
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
            <span className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-md border text-xs font-medium hover:bg-muted">
              {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              Import
            </span>
          </label>
          {!flat.length && (
            <Button variant="outline" size="sm" onClick={seedDefaults} className="gap-1.5">
              <FileUp className="h-3.5 w-3.5" /> Seed defaults
            </Button>
          )}
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => { setEdit(null); setModalOpen(true); }}
          >
            <Plus className="h-3.5 w-3.5" /> New Account
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search code, name…"
            className="h-9 pl-8"
          />
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
        <Badge variant="secondary" className="text-[10px]">{flat.length} accounts</Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {(Object.keys(TYPE_META) as AccountType[]).map((t) => {
          const count = flat.filter((a) => a.type === t).length;
          const meta = TYPE_META[t];
          return (
            <Card key={t} className="cursor-pointer hover:border-primary/30" onClick={() => setTypeFilter(t)}>
              <CardContent className="p-3">
                <p className={`text-[10px] font-semibold ${meta.color}`}>{meta.label}</p>
                <p className="text-lg font-bold">{count}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="grid grid-cols-12 gap-2 px-4 py-2.5 border-b bg-muted/30 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span className="col-span-2">Code</span>
            <span className="col-span-4">Account</span>
            <span className="col-span-2">Type</span>
            <span className="col-span-2 text-right">Opening</span>
            <span className="col-span-1 text-right">Balance</span>
            <span className="col-span-1" />
          </div>
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : visibleRows.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground space-y-3">
              <p>No accounts yet</p>
              <Button size="sm" variant="outline" onClick={seedDefaults}>Seed default COA</Button>
            </div>
          ) : (
            <div className="divide-y">
              {visibleRows.map((row) => {
                const hasChildren = (row.children?.length ?? 0) > 0;
                const open = expanded.has(row.id);
                const meta = TYPE_META[row.type];
                return (
                  <div
                    key={row.id}
                    className="grid grid-cols-12 gap-2 items-center px-4 py-2.5 hover:bg-muted/40 text-sm"
                  >
                    <div className="col-span-2 font-mono text-xs flex items-center gap-1" style={{ paddingLeft: row.depth * 14 }}>
                      {hasChildren ? (
                        <button type="button" onClick={() => toggle(row.id)} className="p-0.5 rounded hover:bg-muted">
                          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        </button>
                      ) : (
                        <span className="w-4" />
                      )}
                      {row.code}
                    </div>
                    <div className="col-span-4 min-w-0">
                      <p className="font-medium truncate">{row.name}</p>
                      {row.description && (
                        <p className="text-[10px] text-muted-foreground truncate">{row.description}</p>
                      )}
                    </div>
                    <div className="col-span-2">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${meta.bg} ${meta.color}`}>
                        {meta.label}
                      </span>
                      {row.isSystem && (
                        <Badge variant="outline" className="ml-1 text-[9px]">System</Badge>
                      )}
                    </div>
                    <div className="col-span-2 text-right text-xs tabular-nums text-muted-foreground">
                      {formatNumber(row.openingBalance)}
                    </div>
                    <div className={`col-span-1 text-right text-xs font-semibold tabular-nums ${row.balance < 0 ? "text-red-500" : ""}`}>
                      {formatNumber(row.balance)}
                    </div>
                    <div className="col-span-1 flex justify-end gap-1">
                      <button
                        type="button"
                        className="p-1 rounded hover:bg-blue-500/10 hover:text-blue-600"
                        onClick={() => { setEdit(row); setModalOpen(true); }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        className="p-1 rounded hover:bg-red-500/10 hover:text-red-500"
                        onClick={() => remove(row)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
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
