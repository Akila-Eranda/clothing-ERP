"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarRange, Coins, FileDigit, GitBranch, Loader2, Plus, RefreshCw,
  Settings2, ShieldCheck, Trash2,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useShopWorkspace } from "@/lib/use-shop-profile";

type Tab =
  | "fiscal"
  | "currency"
  | "series"
  | "tax"
  | "workflow"
  | "preferences"
  | "mappings";

type FiscalYear = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: string;
  isCurrent: boolean;
  retainedEarningsAccountId?: string | null;
  periods: Array<{ id: string; name: string; status: string }>;
};

type Account = { id: string; code: string; name: string; type: string };

type NumberSeries = {
  id: string;
  key: string;
  name: string;
  prefix: string;
  includeYear: boolean;
  includeMonth: boolean;
  padLength: number;
  resetPolicy: string;
  nextValue: number;
  isActive: boolean;
  description?: string | null;
  preview: string;
};

type TaxRate = {
  id: string;
  code: string;
  name: string;
  rate: number;
  direction: string;
  isDefault: boolean;
  isActive: boolean;
};

type WorkflowDef = {
  id: string;
  key: string;
  name: string;
  isActive: boolean;
  steps: Array<{
    id?: string;
    stepOrder: number;
    name: string;
    approverRole?: string | null;
    isRequired: boolean;
  }>;
};

type Preferences = {
  requireJournalApproval: boolean;
  allowPostDraft: boolean;
  blockPostingClosedPeriod: boolean;
  autoPostEnabled?: boolean;
  repairVatEnabled?: boolean;
  fiscalYearStartMonth: number;
  decimalPlaces: number;
  defaultCashAccountId?: string | null;
  defaultArAccountId?: string | null;
  defaultApAccountId?: string | null;
  defaultSalesAccountId?: string | null;
  defaultPurchaseAccountId?: string | null;
  defaultRetainedEarningsId?: string | null;
};

type MappingRow = {
  key: string;
  label: string;
  accountId: string | null;
  account?: { id: string; code: string; name: string; type: string } | null;
};

type TenantInfo = {
  id: string;
  name: string;
  currency: string;
  country?: string;
  timezone?: string;
};

const CURRENCIES = ["LKR", "INR", "USD", "EUR", "GBP", "AED", "SGD"];
const RESET_POLICIES = ["NEVER", "YEARLY", "MONTHLY", "DAILY"];
const APPROVER_ROLES = [
  "TENANT_ADMIN", "BRANCH_MANAGER", "ACCOUNTANT", "INVENTORY_MANAGER", "CASHIER",
];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function fmt(d?: string | null) {
  if (!d) return "—";
  return String(d).slice(0, 10);
}

export function AccountingSettingsHub() {
  const { profile } = useShopWorkspace();
  const [tab, setTab] = useState<Tab>("fiscal");

  const tabs: { id: Tab; label: string; icon: typeof Settings2 }[] = [
    { id: "fiscal", label: "Fiscal Year", icon: CalendarRange },
    { id: "currency", label: "Currency", icon: Coins },
    { id: "series", label: "Number Series", icon: FileDigit },
    { id: "tax", label: "Tax Settings", icon: Settings2 },
    { id: "workflow", label: "Approval Workflow", icon: GitBranch },
    { id: "preferences", label: "Preferences", icon: ShieldCheck },
    { id: "mappings", label: "GL Mappings", icon: Settings2 },
  ];

  return (
    <div className="space-y-4 p-4 md:p-6 max-w-[1200px] mx-auto">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Accounting Settings</h1>
        <p className="text-sm text-muted-foreground">
          {profile.label} · Fiscal year, currency, number series, tax, approvals, preferences
        </p>
      </div>

      <div className="flex flex-wrap gap-1 border-b pb-px">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "fiscal" && <FiscalPanel />}
      {tab === "currency" && <CurrencyPanel />}
      {tab === "series" && <NumberSeriesPanel />}
      {tab === "tax" && <TaxSettingsPanel />}
      {tab === "workflow" && <WorkflowPanel />}
      {tab === "preferences" && <PreferencesPanel />}
      {tab === "mappings" && <MappingsPanel />}
    </div>
  );
}

function FiscalPanel() {
  const [years, setYears] = useState<FiscalYear[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [fyOpen, setFyOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editReId, setEditReId] = useState("");
  const [fyName, setFyName] = useState(`${new Date().getFullYear()}`);
  const [fyStart, setFyStart] = useState(`${new Date().getFullYear()}-01-01`);
  const [fyEnd, setFyEnd] = useState(`${new Date().getFullYear()}-12-31`);

  const selected = years.find((y) => y.id === selectedId) ?? years[0] ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [fyRes, coaRes] = await Promise.all([
        api.get<FiscalYear[]>("/accounting/fiscal-years"),
        api.get<{ data?: Account[] } | Account[]>("/accounting/accounts?flat=true"),
      ]);
      const list = Array.isArray(fyRes.data) ? fyRes.data : [];
      setYears(list);
      setSelectedId((prev) => {
        if (prev && list.some((y) => y.id === prev)) return prev;
        return (list.find((y) => y.isCurrent) ?? list[0])?.id ?? "";
      });
      const raw = coaRes.data;
      const flat = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
      setAccounts(flat.filter((a) => a.type === "EQUITY" || a.type === "LIABILITY" || a.type === "ASSET"));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load fiscal years");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!selected) return;
    setEditName(selected.name);
    setEditReId(selected.retainedEarningsAccountId ?? "");
  }, [selected]);

  const createFy = async () => {
    setBusy(true);
    try {
      await api.post("/accounting/fiscal-years", {
        name: fyName,
        startDate: fyStart,
        endDate: fyEnd,
        setCurrent: true,
      });
      toast.success("Fiscal year created");
      setFyOpen(false);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  };

  const saveFy = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await api.put(`/accounting/fiscal-years/${selected.id}`, {
        name: editName,
        retainedEarningsAccountId: editReId || null,
        setCurrent: true,
      });
      toast.success("Fiscal year saved");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-muted-foreground">
          Configure the current fiscal year and retained earnings account.
        </p>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" onClick={() => setFyOpen(true)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Create fiscal year
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/accounting/periods">Open period management</Link>
          </Button>
        </div>
      </div>

      <Dialog open={fyOpen} onOpenChange={setFyOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create fiscal year</DialogTitle>
            <DialogDescription>Creates monthly periods and can set this year as current.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Name</Label>
              <Input className="h-9" value={fyName} onChange={(e) => setFyName(e.target.value)} disabled={busy} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Start</Label>
              <Input type="date" className="h-9" value={fyStart} onChange={(e) => setFyStart(e.target.value)} disabled={busy} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">End</Label>
              <Input type="date" className="h-9" value={fyEnd} onChange={(e) => setFyEnd(e.target.value)} disabled={busy} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button size="sm" className="gap-1" disabled={busy} onClick={() => void createFy()}>
              <Plus className="h-3.5 w-3.5" /> Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {selected && (
        <Card>
          <CardContent className="p-4 space-y-3 max-w-xl">
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={selected.id} onValueChange={setSelectedId}>
                <SelectTrigger className="h-9 w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {years.map((y) => (
                    <SelectItem key={y.id} value={y.id}>
                      {y.name}{y.isCurrent ? " (current)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Badge variant="outline" className="text-[10px]">{selected.status}</Badge>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Name</Label>
              <Input className="h-9" value={editName} onChange={(e) => setEditName(e.target.value)} disabled={selected.status === "CLOSED"} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Start</Label>
                <Input className="h-9 font-mono" value={fmt(selected.startDate)} disabled />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">End</Label>
                <Input className="h-9 font-mono" value={fmt(selected.endDate)} disabled />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Retained Earnings account</Label>
              <Select value={editReId || "__auto__"} onValueChange={(v) => setEditReId(v === "__auto__" ? "" : v)}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Auto-detect" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__auto__">Auto-detect</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.code} — {a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              {selected.periods?.length ?? 0} periods · open:{" "}
              {selected.periods?.filter((p) => p.status === "OPEN").length ?? 0}
            </p>
            <Button size="sm" disabled={busy || selected.status === "CLOSED"} onClick={() => void saveFy()}>
              Save & set current
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function CurrencyPanel() {
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [currency, setCurrency] = useState("LKR");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<TenantInfo>("/tenants/me");
      setTenant(res.data ?? null);
      setCurrency(res.data?.currency || "LKR");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load currency");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    setBusy(true);
    try {
      await api.put("/tenants/me", { currency });
      toast.success("Currency updated");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-4 max-w-md">
        <div>
          <h3 className="text-sm font-semibold">Base currency</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Single-currency ledger for {tenant?.name ?? "this shop"}. Multi-currency FX is not enabled.
          </p>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Currency</Label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" disabled={busy} onClick={() => void save()}>Save currency</Button>
      </CardContent>
    </Card>
  );
}

function NumberSeriesPanel() {
  const [rows, setRows] = useState<NumberSeries[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Partial<NumberSeries>>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<NumberSeries[]>("/accounting/settings/number-series");
      const list = Array.isArray(res.data) ? res.data : [];
      setRows(list);
      setDrafts({});
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load number series");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const draftOf = (r: NumberSeries) => ({ ...r, ...drafts[r.key] });

  const save = async (key: string) => {
    const d = drafts[key];
    if (!d) return;
    setBusyKey(key);
    try {
      await api.put(`/accounting/settings/number-series/${key}`, {
        prefix: d.prefix,
        includeYear: d.includeYear,
        includeMonth: d.includeMonth,
        padLength: d.padLength,
        resetPolicy: d.resetPolicy,
        nextValue: d.nextValue,
        isActive: d.isActive,
      });
      toast.success(`${key} updated`);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusyKey(null);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Document prefixes and next sequence. Journals use the JOURNAL series automatically.
        </p>
        <Button size="sm" variant="outline" className="gap-1" onClick={() => void load()}>
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>
      {rows.map((r) => {
        const d = draftOf(r);
        const dirty = !!drafts[r.key];
        return (
          <Card key={r.key}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="text-sm font-semibold">{r.name}</p>
                  <p className="text-[11px] text-muted-foreground font-mono">{r.key}</p>
                </div>
                <Badge variant="outline" className="font-mono text-[10px]">{d.preview ?? r.preview}</Badge>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Prefix</Label>
                  <Input
                    className="h-9 font-mono"
                    value={d.prefix ?? ""}
                    onChange={(e) => setDrafts((prev) => ({
                      ...prev,
                      [r.key]: { ...draftOf(r), prefix: e.target.value.toUpperCase() },
                    }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Pad length</Label>
                  <Input
                    type="number"
                    className="h-9"
                    value={d.padLength ?? 5}
                    onChange={(e) => setDrafts((prev) => ({
                      ...prev,
                      [r.key]: { ...draftOf(r), padLength: parseInt(e.target.value, 10) || 5 },
                    }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Next value</Label>
                  <Input
                    type="number"
                    className="h-9"
                    value={d.nextValue ?? 1}
                    onChange={(e) => setDrafts((prev) => ({
                      ...prev,
                      [r.key]: { ...draftOf(r), nextValue: parseInt(e.target.value, 10) || 1 },
                    }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Reset</Label>
                  <Select
                    value={d.resetPolicy ?? "YEARLY"}
                    onValueChange={(v) => setDrafts((prev) => ({
                      ...prev,
                      [r.key]: { ...draftOf(r), resetPolicy: v },
                    }))}
                  >
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {RESET_POLICIES.map((p) => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={!!d.includeYear}
                    onChange={(e) => setDrafts((prev) => ({
                      ...prev,
                      [r.key]: { ...draftOf(r), includeYear: e.target.checked },
                    }))}
                  />
                  Year
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={!!d.includeMonth}
                    onChange={(e) => setDrafts((prev) => ({
                      ...prev,
                      [r.key]: { ...draftOf(r), includeMonth: e.target.checked },
                    }))}
                  />
                  Month
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={d.isActive !== false}
                    onChange={(e) => setDrafts((prev) => ({
                      ...prev,
                      [r.key]: { ...draftOf(r), isActive: e.target.checked },
                    }))}
                  />
                  Active
                </label>
                <Button
                  size="sm"
                  className="ml-auto h-8"
                  disabled={!dirty || busyKey === r.key}
                  onClick={() => void save(r.key)}
                >
                  {busyKey === r.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function TaxSettingsPanel() {
  const [rates, setRates] = useState<TaxRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [rate, setRate] = useState("18");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<TaxRate[]>("/accounting/tax-rates?includeInactive=true");
      setRates(Array.isArray(res.data) ? res.data : []);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load tax rates");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const seed = async () => {
    setBusy(true);
    try {
      const res = await api.post<{ created: number; message?: string }>("/accounting/tax-rates/seed-defaults");
      toast.success(res.data?.message ?? `Created ${res.data?.created ?? 0} rates`);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Seed failed");
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    if (!code || !name) {
      toast.error("Code and name required");
      return;
    }
    setBusy(true);
    try {
      await api.post("/accounting/tax-rates", {
        code, name, rate: parseFloat(rate) || 0, direction: "BOTH",
      });
      toast.success("Tax rate created");
      setCode("");
      setName("");
      setRateOpen(false);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (r: TaxRate) => {
    try {
      await api.put(`/accounting/tax-rates/${r.id}`, { isActive: !r.isActive });
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-muted-foreground">Tax master used for VAT and invoices.</p>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void seed()}>Seed defaults</Button>
          <Button size="sm" onClick={() => setRateOpen(true)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Add rate
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/accounting/vat">VAT returns & reports</Link>
          </Button>
        </div>
      </div>

      <Dialog open={rateOpen} onOpenChange={setRateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add tax rate</DialogTitle>
            <DialogDescription>Code, name, and percentage for VAT / invoices.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Code</Label>
              <Input className="h-9" value={code} onChange={(e) => setCode(e.target.value)} placeholder="VAT18" disabled={busy} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Name</Label>
              <Input className="h-9" value={name} onChange={(e) => setName(e.target.value)} placeholder="VAT 18%" disabled={busy} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Rate %</Label>
              <Input className="h-9" value={rate} onChange={(e) => setRate(e.target.value)} disabled={busy} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button size="sm" disabled={busy} onClick={() => void create()}>Add rate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : (
        <div className="rounded-lg border divide-y">
          {rates.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <div>
                <p className="font-medium">{r.code} · {r.name}</p>
                <p className="text-[11px] text-muted-foreground">{r.rate}% · {r.direction}</p>
              </div>
              <div className="flex items-center gap-2">
                {r.isDefault && <Badge className="text-[10px]">Default</Badge>}
                <Badge variant={r.isActive ? "default" : "secondary"} className="text-[10px]">
                  {r.isActive ? "Active" : "Inactive"}
                </Badge>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => void toggle(r)}>
                  {r.isActive ? "Disable" : "Enable"}
                </Button>
              </div>
            </div>
          ))}
          {!rates.length && (
            <p className="text-sm text-muted-foreground text-center py-8">No tax rates — seed defaults to start</p>
          )}
        </div>
      )}
    </div>
  );
}

function WorkflowPanel() {
  const [defs, setDefs] = useState<WorkflowDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<WorkflowDef[]>("/workflows/definitions");
      setDefs(Array.isArray(res.data) ? res.data : []);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load workflows");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const updateStep = (key: string, idx: number, patch: Partial<WorkflowDef["steps"][0]>) => {
    setDefs((prev) => prev.map((d) => {
      if (d.key !== key) return d;
      const steps = d.steps.map((s, i) => (i === idx ? { ...s, ...patch } : s));
      return { ...d, steps };
    }));
  };

  const addStep = (key: string) => {
    setDefs((prev) => prev.map((d) => {
      if (d.key !== key) return d;
      return {
        ...d,
        steps: [
          ...d.steps,
          { stepOrder: d.steps.length + 1, name: `Step ${d.steps.length + 1}`, approverRole: "BRANCH_MANAGER", isRequired: true },
        ],
      };
    }));
  };

  const removeStep = (key: string, idx: number) => {
    setDefs((prev) => prev.map((d) => {
      if (d.key !== key) return d;
      const steps = d.steps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, stepOrder: i + 1 }));
      return { ...d, steps };
    }));
  };

  const save = async (def: WorkflowDef) => {
    setBusyKey(def.key);
    try {
      await api.put(`/workflows/definitions/${def.key}`, {
        name: def.name,
        isActive: def.isActive,
        steps: def.steps.map((s, i) => ({
          name: s.name,
          approverRole: s.approverRole,
          stepOrder: i + 1,
          isRequired: s.isRequired,
        })),
      });
      toast.success(`${def.name} saved`);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusyKey(null);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-muted-foreground">
          Configure approval steps and roles. Journal approval is controlled under Preferences.
        </p>
        <Button asChild size="sm" variant="outline">
          <Link href="/workflows">Open task inbox</Link>
        </Button>
      </div>
      {defs.map((d) => {
        const open = expanded === d.key;
        return (
          <Card key={d.key}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <button type="button" className="text-left" onClick={() => setExpanded(open ? null : d.key)}>
                  <p className="text-sm font-semibold">{d.name}</p>
                  <p className="text-[11px] text-muted-foreground font-mono">{d.key} · {d.steps.length} steps</p>
                </button>
                <div className="flex items-center gap-2">
                  <Badge variant={d.isActive ? "default" : "secondary"} className="text-[10px]">
                    {d.isActive ? "Active" : "Inactive"}
                  </Badge>
                  <Button size="sm" variant="outline" className="h-8" onClick={() => setExpanded(open ? null : d.key)}>
                    {open ? "Collapse" : "Edit"}
                  </Button>
                </div>
              </div>
              {open && (
                <div className="space-y-3 border-t pt-3">
                  <div className="space-y-1 max-w-md">
                    <Label className="text-xs">Display name</Label>
                    <Input
                      className="h-9"
                      value={d.name}
                      onChange={(e) => setDefs((prev) => prev.map((x) => (x.key === d.key ? { ...x, name: e.target.value } : x)))}
                    />
                  </div>
                  {d.steps.map((s, idx) => (
                    <div key={idx} className="grid sm:grid-cols-3 gap-2 items-end">
                      <div className="space-y-1">
                        <Label className="text-xs">Step {idx + 1}</Label>
                        <Input
                          className="h-9"
                          value={s.name}
                          onChange={(e) => updateStep(d.key, idx, { name: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Approver role</Label>
                        <Select
                          value={s.approverRole || "BRANCH_MANAGER"}
                          onValueChange={(v) => updateStep(d.key, idx, { approverRole: v })}
                        >
                          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {APPROVER_ROLES.map((r) => (
                              <SelectItem key={r} value={r}>{r}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-9"
                          disabled={d.steps.length <= 1}
                          onClick={() => removeStep(d.key, idx)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => addStep(d.key)}>
                      <Plus className="h-3.5 w-3.5" /> Add step
                    </Button>
                    <Button size="sm" className="h-8" disabled={busyKey === d.key} onClick={() => void save(d)}>
                      {busyKey === d.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save workflow"}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function PreferencesPanel() {
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, aRes] = await Promise.all([
        api.get<Preferences>("/accounting/settings/preferences"),
        api.get<{ data?: Account[] } | Account[]>("/accounting/accounts?flat=true"),
      ]);
      setPrefs(pRes.data ?? null);
      const raw = aRes.data;
      const flat = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
      setAccounts(flat);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load preferences");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!prefs) return;
    setBusy(true);
    try {
      await api.put("/accounting/settings/preferences", prefs);
      toast.success("Preferences saved");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const accountSelect = (
    label: string,
    value: string | null | undefined,
    onChange: (v: string | null) => void,
    types?: string[],
  ) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Select value={value || "__none__"} onValueChange={(v) => onChange(v === "__none__" ? null : v)}>
        <SelectTrigger className="h-9"><SelectValue placeholder="Not set" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">Not set</SelectItem>
          {accounts
            .filter((a) => !types || types.includes(a.type))
            .map((a) => (
              <SelectItem key={a.id} value={a.id}>{a.code} — {a.name}</SelectItem>
            ))}
        </SelectContent>
      </Select>
    </div>
  );

  if (loading || !prefs) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="text-sm font-semibold">Journal & posting</h3>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={prefs.requireJournalApproval}
              onChange={(e) => setPrefs({ ...prefs, requireJournalApproval: e.target.checked })}
            />
            <span>
              Require journal approval
              <span className="block text-xs text-muted-foreground">Submit goes to pending unless admin bypass</span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={prefs.allowPostDraft}
              onChange={(e) => setPrefs({ ...prefs, allowPostDraft: e.target.checked })}
            />
            <span>
              Allow direct post without approval
              <span className="block text-xs text-muted-foreground">Non-admins can post journals immediately</span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={prefs.blockPostingClosedPeriod}
              onChange={(e) => setPrefs({ ...prefs, blockPostingClosedPeriod: e.target.checked })}
            />
            <span>
              Block posting in closed / locked periods
              <span className="block text-xs text-muted-foreground">Recommended for compliance</span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={prefs.autoPostEnabled !== false}
              onChange={(e) => setPrefs({ ...prefs, autoPostEnabled: e.target.checked })}
            />
            <span>
              Auto-post commerce events
              <span className="block text-xs text-muted-foreground">
                When off, events stay queued until Sync → Process
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={prefs.repairVatEnabled === true}
              onChange={(e) => setPrefs({ ...prefs, repairVatEnabled: e.target.checked })}
            />
            <span>
              Split 18% VAT on repair journals
              <span className="block text-xs text-muted-foreground">
                Off = full amount to Repair Income (default)
              </span>
            </span>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="text-sm font-semibold">Defaults</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Fiscal year start month</Label>
              <Select
                value={String(prefs.fiscalYearStartMonth)}
                onValueChange={(v) => setPrefs({ ...prefs, fiscalYearStartMonth: parseInt(v, 10) })}
              >
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => (
                    <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Decimal places</Label>
              <Select
                value={String(prefs.decimalPlaces)}
                onValueChange={(v) => setPrefs({ ...prefs, decimalPlaces: parseInt(v, 10) })}
              >
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[0, 1, 2, 3, 4].map((n) => (
                    <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {accountSelect("Default cash", prefs.defaultCashAccountId, (v) => setPrefs({ ...prefs, defaultCashAccountId: v }), ["ASSET"])}
            {accountSelect("Default AR", prefs.defaultArAccountId, (v) => setPrefs({ ...prefs, defaultArAccountId: v }), ["ASSET"])}
            {accountSelect("Default AP", prefs.defaultApAccountId, (v) => setPrefs({ ...prefs, defaultApAccountId: v }), ["LIABILITY"])}
            {accountSelect("Default sales", prefs.defaultSalesAccountId, (v) => setPrefs({ ...prefs, defaultSalesAccountId: v }), ["REVENUE"])}
            {accountSelect("Default purchases", prefs.defaultPurchaseAccountId, (v) => setPrefs({ ...prefs, defaultPurchaseAccountId: v }), ["EXPENSE", "ASSET"])}
            {accountSelect("Retained earnings", prefs.defaultRetainedEarningsId, (v) => setPrefs({ ...prefs, defaultRetainedEarningsId: v }), ["EQUITY"])}
          </div>
        </CardContent>
      </Card>

      <Button size="sm" disabled={busy} onClick={() => void save()}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save preferences"}
      </Button>
    </div>
  );
}

function MappingsPanel() {
  const [rows, setRows] = useState<MappingRow[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [mRes, aRes] = await Promise.all([
        api.get<MappingRow[]>("/accounting/settings/mappings"),
        api.get<{ data?: Account[] } | Account[]>("/accounting/accounts?flat=true"),
      ]);
      const list = Array.isArray(mRes.data) ? mRes.data : [];
      setRows(list);
      const next: Record<string, string> = {};
      for (const r of list) {
        if (r.accountId) next[r.key] = r.accountId;
      }
      setDraft(next);
      const raw = aRes.data;
      setAccounts(Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : []);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load mappings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const seed = async () => {
    setBusy(true);
    try {
      await api.post("/accounting/settings/mappings/seed", {});
      toast.success("Default mappings seeded");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Seed failed");
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      const mappings = Object.entries(draft)
        .filter(([, accountId]) => !!accountId)
        .map(([key, accountId]) => ({ key, accountId }));
      await api.put("/accounting/settings/mappings", { mappings });
      toast.success("Mappings saved");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 justify-between items-center">
        <p className="text-sm text-muted-foreground">
          Map commerce posting keys to GL accounts. Missing keys fall back to default codes.
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void seed()}>
            Seed defaults
          </Button>
          <Button size="sm" disabled={busy} onClick={() => void save()}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save mappings"}
          </Button>
        </div>
      </div>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/70 text-xs text-muted-foreground text-left">
              <tr>
                <th className="p-3">Key</th>
                <th className="p-3">Label</th>
                <th className="p-3">Account</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-t">
                  <td className="p-3 font-mono text-xs">{r.key}</td>
                  <td className="p-3">{r.label}</td>
                  <td className="p-3 min-w-[240px]">
                    <Select
                      value={draft[r.key] || "__none__"}
                      onValueChange={(v) =>
                        setDraft((d) => {
                          const next = { ...d };
                          if (v === "__none__") delete next[r.key];
                          else next[r.key] = v;
                          return next;
                        })
                      }
                    >
                      <SelectTrigger className="h-9"><SelectValue placeholder="Not set" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Not set</SelectItem>
                        {accounts.map((a) => (
                          <SelectItem key={a.id} value={a.id}>{a.code} — {a.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
