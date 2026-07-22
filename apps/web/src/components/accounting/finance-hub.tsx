"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import {
  BookOpen,
  Building2,
  CheckCircle2,
  FileCheck,
  Landmark,
  Loader2,
  Plus,
  RefreshCw,
  Scale,
  Wallet,
} from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClientSideTable, DataTableColumnHeader } from "@/components/table";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import { useShopWorkspace } from "@/lib/use-shop-profile";
import { ChequesHub } from "@/components/accounting/cheques-hub";

type AgingBuckets = Record<string, { count: number; amount: number }>;

export type APData = {
  total: number;
  invoiceDueTotal?: number;
  purchaseOrderDueTotal?: number;
  buckets?: AgingBuckets;
  suppliers: { id: string; name: string; balance: number }[];
  unpaidPurchaseOrders: { poNumber: string; balanceDue: number; supplier: { name: string } }[];
};

export type ARData = {
  total: number;
  count: number;
  buckets?: AgingBuckets;
  customers: {
    id: string;
    code: string;
    firstName: string;
    lastName: string;
    phone: string;
    creditBalance: number;
    creditLimit: number;
    bucket?: string;
    daysPastDue?: number;
  }[];
};

export type BankAccount = {
  id: string;
  code: string;
  name: string;
  type: string;
  bankName?: string | null;
  currentBalance: number;
  currency: string;
};

export type Cheque = {
  id: string;
  chequeNumber: string;
  direction: string;
  status: string;
  amount: number;
  partyName?: string | null;
  bankName?: string | null;
  dueDate?: string | null;
  bankAccount?: { name: string; code: string } | null;
};

export type CashBookEntry = {
  entryDate: string;
  type: string;
  description: string;
  debit: number;
  credit: number;
  balanceAfter?: number;
};

export type Recon = {
  id: string;
  statementDate: string;
  statementBalance: number;
  systemBalance: number;
  difference: number;
  status: string;
  bankAccount?: { name: string; code: string };
};

const BUCKET_LABELS: Record<string, string> = {
  current: "Current",
  "1_30": "1–30",
  "31_60": "31–60",
  "61_90": "61–90",
  "90_plus": "90+",
};

export const FINANCE_SECTION_LINKS = [
  { href: "/accounting/finance/payable", label: "Payable", description: "Supplier balances & AP aging", icon: Scale, color: "text-amber-500", bg: "bg-amber-500/10" },
  { href: "/accounting/finance/receivable", label: "Receivable", description: "Customer credit & AR aging", icon: Wallet, color: "text-emerald-500", bg: "bg-emerald-500/10" },
  { href: "/accounting/finance/cash-book", label: "Cash Book", description: "Daily cash movements", icon: BookOpen, color: "text-indigo-500", bg: "bg-indigo-500/10" },
  { href: "/accounting/finance/banks", label: "Banks", description: "Bank accounts & balances", icon: Landmark, color: "text-blue-500", bg: "bg-blue-500/10" },
  { href: "/accounting/finance/cheques", label: "Cheques", description: "Register & track cheques", icon: FileCheck, color: "text-violet-500", bg: "bg-violet-500/10" },
  { href: "/accounting/finance/reconciliation", label: "Reconciliation", description: "Match bank statements", icon: Building2, color: "text-slate-500", bg: "bg-slate-500/10" },
] as const;

type FinanceHubContextValue = {
  loading: boolean;
  load: () => Promise<void>;
  ap: APData | null;
  ar: ARData | null;
  banks: BankAccount[];
  cheques: Cheque[];
  cashBook: { opening: number; closing: number; source: string; entries: CashBookEntry[] } | null;
  recons: Recon[];
  cbStart: string;
  setCbStart: (v: string) => void;
  cbEnd: string;
  setCbEnd: (v: string) => void;
  baCode: string;
  setBaCode: (v: string) => void;
  baName: string;
  setBaName: (v: string) => void;
  baBank: string;
  setBaBank: (v: string) => void;
  baOpen: string;
  setBaOpen: (v: string) => void;
  baBusy: boolean;
  createBank: () => Promise<void>;
  chDir: string;
  setChDir: (v: string) => void;
  chNum: string;
  setChNum: (v: string) => void;
  chAmt: string;
  setChAmt: (v: string) => void;
  chParty: string;
  setChParty: (v: string) => void;
  chBankId: string;
  setChBankId: (v: string) => void;
  chBusy: boolean;
  createCheque: () => Promise<void>;
  setChequeStatus: (id: string, status: string, bankAccountId?: string) => Promise<void>;
  rcBankId: string;
  setRcBankId: (v: string) => void;
  rcDate: string;
  setRcDate: (v: string) => void;
  rcBal: string;
  setRcBal: (v: string) => void;
  rcBusy: boolean;
  startRecon: () => Promise<void>;
  completeRecon: (id: string) => Promise<void>;
  apColumns: ColumnDef<APData["suppliers"][number]>[];
  arColumns: ColumnDef<ARData["customers"][number]>[];
  cashColumns: ColumnDef<CashBookEntry & { id: string }>[];
  bankColumns: ColumnDef<BankAccount>[];
  chequeColumns: ColumnDef<Cheque>[];
  reconColumns: ColumnDef<Recon>[];
  cashRows: (CashBookEntry & { id: string })[];
};

const FinanceHubContext = createContext<FinanceHubContextValue | null>(null);

export function useFinanceHub() {
  const ctx = useContext(FinanceHubContext);
  if (!ctx) throw new Error("useFinanceHub must be used within FinanceHubProvider");
  return ctx;
}

export function FinanceHubProvider({ children }: { children: ReactNode }) {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

  const [loading, setLoading] = useState(true);
  const [ap, setAp] = useState<APData | null>(null);
  const [ar, setAr] = useState<ARData | null>(null);
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [cheques, setCheques] = useState<Cheque[]>([]);
  const [cashBook, setCashBook] = useState<{ opening: number; closing: number; source: string; entries: CashBookEntry[] } | null>(null);
  const [recons, setRecons] = useState<Recon[]>([]);
  const [cbStart, setCbStart] = useState(monthStart);
  const [cbEnd, setCbEnd] = useState(today);

  const [baCode, setBaCode] = useState("");
  const [baName, setBaName] = useState("");
  const [baBank, setBaBank] = useState("");
  const [baOpen, setBaOpen] = useState("0");
  const [baBusy, setBaBusy] = useState(false);

  const [chDir, setChDir] = useState("RECEIVED");
  const [chNum, setChNum] = useState("");
  const [chAmt, setChAmt] = useState("");
  const [chParty, setChParty] = useState("");
  const [chBankId, setChBankId] = useState("");
  const [chBusy, setChBusy] = useState(false);

  const [rcBankId, setRcBankId] = useState("");
  const [rcDate, setRcDate] = useState(today);
  const [rcBal, setRcBal] = useState("");
  const [rcBusy, setRcBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [apR, arR, bankR, chR, cbR, rcR] = await Promise.all([
        api.get<APData>("/accounting/accounts-payable"),
        api.get<ARData>("/accounting/accounts-receivable"),
        api.get<BankAccount[]>("/accounting/bank-accounts"),
        api.get<{ data: Cheque[] }>("/accounting/cheques?limit=50"),
        api.get<{ opening: number; closing: number; source: string; entries: CashBookEntry[] }>(
          `/accounting/cash-book?startDate=${cbStart}&endDate=${cbEnd}`,
        ),
        api.get<Recon[]>("/accounting/bank-reconciliations"),
      ]);
      setAp(apR.data ?? null);
      setAr(arR.data ?? null);
      setBanks(Array.isArray(bankR.data) ? bankR.data : []);
      setCheques(chR.data?.data ?? []);
      setCashBook(cbR.data ?? null);
      setRecons(Array.isArray(rcR.data) ? rcR.data : []);
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to load finance data");
    } finally {
      setLoading(false);
    }
  }, [cbStart, cbEnd]);

  useEffect(() => {
    load();
  }, [load]);

  const createBank = async () => {
    if (!baCode || !baName) {
      toast.error("Code and name required");
      return;
    }
    setBaBusy(true);
    try {
      await api.post("/accounting/bank-accounts", {
        code: baCode,
        name: baName,
        bankName: baBank || undefined,
        openingBalance: parseFloat(baOpen) || 0,
      });
      toast.success("Bank account created");
      setBaCode("");
      setBaName("");
      setBaBank("");
      setBaOpen("0");
      load();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Create failed");
    } finally {
      setBaBusy(false);
    }
  };

  const createCheque = async () => {
    if (!chNum || !chAmt) {
      toast.error("Cheque number and amount required");
      return;
    }
    setChBusy(true);
    try {
      await api.post("/accounting/cheques", {
        direction: chDir,
        chequeNumber: chNum,
        amount: parseFloat(chAmt),
        partyName: chParty || undefined,
        bankAccountId: chBankId || undefined,
      });
      toast.success("Cheque registered");
      setChNum("");
      setChAmt("");
      setChParty("");
      load();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Cheque failed");
    } finally {
      setChBusy(false);
    }
  };

  const setChequeStatus = async (id: string, status: string, bankAccountId?: string) => {
    try {
      await api.put(`/accounting/cheques/${id}/status`, { status, bankAccountId });
      toast.success(`Cheque marked ${status}`);
      load();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Status update failed");
    }
  };

  const startRecon = async () => {
    if (!rcBankId || rcBal === "") {
      toast.error("Select account and statement balance");
      return;
    }
    setRcBusy(true);
    try {
      await api.post("/accounting/bank-reconciliations", {
        bankAccountId: rcBankId,
        statementDate: rcDate,
        statementBalance: parseFloat(rcBal),
      });
      toast.success("Reconciliation started");
      setRcBal("");
      load();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Recon failed");
    } finally {
      setRcBusy(false);
    }
  };

  const completeRecon = async (id: string) => {
    try {
      await api.post(`/accounting/bank-reconciliations/${id}/complete`, { matchedTxnIds: [] });
      toast.success("Reconciliation completed");
      load();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Complete failed");
    }
  };

  const apColumns = useMemo<ColumnDef<APData["suppliers"][number]>[]>(
    () => [
      {
        id: "name",
        accessorKey: "name",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Supplier" />,
        cell: ({ row }) => <span className="text-sm font-medium">{row.original.name}</span>,
      },
      {
        id: "balance",
        accessorKey: "balance",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Balance" />,
        cell: ({ row }) => (
          <span className="text-sm font-semibold tabular-nums">LKR {formatNumber(row.original.balance)}</span>
        ),
      },
    ],
    [],
  );

  const arColumns = useMemo<ColumnDef<ARData["customers"][number]>[]>(
    () => [
      {
        id: "customer",
        accessorFn: (c) => `${c.firstName} ${c.lastName}`,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Customer" />,
        cell: ({ row }) => (
          <div>
            <p className="text-sm font-medium">
              {row.original.firstName} {row.original.lastName}
            </p>
            <p className="text-xs text-muted-foreground">
              {row.original.code} · {row.original.phone}
            </p>
          </div>
        ),
      },
      {
        id: "bucket",
        accessorFn: (c) => c.bucket ?? "",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Bucket" />,
        cell: ({ row }) => (
          <Badge variant="outline" className="text-[10px]">
            {BUCKET_LABELS[row.original.bucket ?? ""] ?? row.original.bucket ?? "—"}
          </Badge>
        ),
      },
      {
        id: "credit",
        accessorKey: "creditBalance",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Credit" />,
        cell: ({ row }) => (
          <span className="text-sm font-semibold tabular-nums">LKR {formatNumber(row.original.creditBalance)}</span>
        ),
      },
    ],
    [],
  );

  const cashColumns = useMemo<ColumnDef<CashBookEntry & { id: string }>[]>(
    () => [
      {
        id: "date",
        accessorKey: "entryDate",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {String(row.original.entryDate).slice(0, 10)}
          </span>
        ),
      },
      {
        id: "type",
        accessorKey: "type",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
        cell: ({ row }) => <Badge variant="secondary" className="text-[9px]">{row.original.type}</Badge>,
      },
      {
        id: "description",
        accessorKey: "description",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Description" />,
        cell: ({ row }) => <span className="text-sm">{row.original.description}</span>,
      },
      {
        id: "debit",
        accessorKey: "debit",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Debit" />,
        cell: ({ row }) => (
          <span className="text-sm tabular-nums text-emerald-600">
            {row.original.debit ? formatNumber(row.original.debit) : "—"}
          </span>
        ),
      },
      {
        id: "credit",
        accessorKey: "credit",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Credit" />,
        cell: ({ row }) => (
          <span className="text-sm tabular-nums text-rose-600">
            {row.original.credit ? formatNumber(row.original.credit) : "—"}
          </span>
        ),
      },
      {
        id: "balance",
        accessorKey: "balanceAfter",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Balance" />,
        cell: ({ row }) => (
          <span className="text-sm font-semibold tabular-nums">{formatNumber(row.original.balanceAfter ?? 0)}</span>
        ),
      },
    ],
    [],
  );

  const bankColumns = useMemo<ColumnDef<BankAccount>[]>(
    () => [
      {
        id: "account",
        accessorKey: "name",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Account" />,
        cell: ({ row }) => (
          <div>
            <p className="text-sm font-medium">{row.original.name}</p>
            <p className="text-xs text-muted-foreground">
              {row.original.code}
              {row.original.bankName ? ` · ${row.original.bankName}` : ""}
            </p>
          </div>
        ),
      },
      {
        id: "type",
        accessorKey: "type",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
        cell: ({ row }) => <Badge variant="outline" className="text-[10px]">{row.original.type}</Badge>,
      },
      {
        id: "balance",
        accessorKey: "currentBalance",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Balance" />,
        cell: ({ row }) => (
          <span className="text-sm font-semibold tabular-nums">LKR {formatNumber(row.original.currentBalance)}</span>
        ),
      },
    ],
    [],
  );

  const chequeColumns = useMemo<ColumnDef<Cheque>[]>(
    () => [
      {
        id: "cheque",
        accessorKey: "chequeNumber",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Cheque" />,
        cell: ({ row }) => (
          <div>
            <p className="text-sm font-medium font-mono">{row.original.chequeNumber}</p>
            <p className="text-xs text-muted-foreground">{row.original.direction}</p>
          </div>
        ),
      },
      {
        id: "party",
        accessorFn: (c) => c.partyName ?? "",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Party" />,
        cell: ({ row }) => <span className="text-sm">{row.original.partyName ?? "—"}</span>,
      },
      {
        id: "status",
        accessorKey: "status",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => <Badge variant="outline" className="text-[10px]">{row.original.status}</Badge>,
      },
      {
        id: "amount",
        accessorKey: "amount",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" />,
        cell: ({ row }) => (
          <span className="text-sm font-semibold tabular-nums">LKR {formatNumber(row.original.amount)}</span>
        ),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const c = row.original;
          return (
            <div className="flex flex-wrap gap-1">
              {c.status !== "DEPOSITED" && c.status !== "CLEARED" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => setChequeStatus(c.id, "DEPOSITED", c.bankAccount ? undefined : chBankId || banks[0]?.id)}
                >
                  Deposit
                </Button>
              )}
              {c.status !== "CLEARED" && c.status !== "BOUNCED" && (
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setChequeStatus(c.id, "CLEARED", banks[0]?.id)}>
                  Clear
                </Button>
              )}
              {c.status !== "BOUNCED" && c.status !== "CLEARED" && (
                <Button size="sm" variant="outline" className="h-7 text-xs text-red-600" onClick={() => setChequeStatus(c.id, "BOUNCED")}>
                  Bounce
                </Button>
              )}
            </div>
          );
        },
      },
    ],
    [banks, chBankId],
  );

  const reconColumns = useMemo<ColumnDef<Recon>[]>(
    () => [
      {
        id: "account",
        accessorFn: (r) => r.bankAccount?.name ?? "",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Account" />,
        cell: ({ row }) => <span className="text-sm font-medium">{row.original.bankAccount?.name ?? "—"}</span>,
      },
      {
        id: "date",
        accessorKey: "statementDate",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{String(row.original.statementDate).slice(0, 10)}</span>
        ),
      },
      {
        id: "statement",
        accessorKey: "statementBalance",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Statement" />,
        cell: ({ row }) => <span className="text-sm tabular-nums">{formatNumber(row.original.statementBalance)}</span>,
      },
      {
        id: "system",
        accessorKey: "systemBalance",
        header: ({ column }) => <DataTableColumnHeader column={column} title="System" />,
        cell: ({ row }) => <span className="text-sm tabular-nums">{formatNumber(row.original.systemBalance)}</span>,
      },
      {
        id: "diff",
        accessorKey: "difference",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Diff" />,
        cell: ({ row }) => <span className="text-sm font-semibold tabular-nums">{formatNumber(row.original.difference)}</span>,
      },
      {
        id: "status",
        accessorKey: "status",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => <Badge variant="outline" className="text-[10px]">{row.original.status}</Badge>,
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) =>
          row.original.status === "DRAFT" ? (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => completeRecon(row.original.id)}>
              Complete
            </Button>
          ) : null,
      },
    ],
    [],
  );

  const cashRows = useMemo(
    () => (cashBook?.entries ?? []).map((e, i) => ({ ...e, id: `cb-${i}` })),
    [cashBook],
  );

  const value: FinanceHubContextValue = {
    loading,
    load,
    ap,
    ar,
    banks,
    cheques,
    cashBook,
    recons,
    cbStart,
    setCbStart,
    cbEnd,
    setCbEnd,
    baCode,
    setBaCode,
    baName,
    setBaName,
    baBank,
    setBaBank,
    baOpen,
    setBaOpen,
    baBusy,
    createBank,
    chDir,
    setChDir,
    chNum,
    setChNum,
    chAmt,
    setChAmt,
    chParty,
    setChParty,
    chBankId,
    setChBankId,
    chBusy,
    createCheque,
    setChequeStatus,
    rcBankId,
    setRcBankId,
    rcDate,
    setRcDate,
    rcBal,
    setRcBal,
    rcBusy,
    startRecon,
    completeRecon,
    apColumns,
    arColumns,
    cashColumns,
    bankColumns,
    chequeColumns,
    reconColumns,
    cashRows,
  };

  return <FinanceHubContext.Provider value={value}>{children}</FinanceHubContext.Provider>;
}

function AgingStrip({ buckets }: { buckets?: AgingBuckets }) {
  if (!buckets) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
      {Object.entries(BUCKET_LABELS).map(([key, label]) => (
        <Card key={key}>
          <CardContent className="p-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="text-sm font-bold tabular-nums mt-0.5">LKR {formatNumber(buckets[key]?.amount ?? 0)}</p>
            <p className="text-[10px] text-muted-foreground">{buckets[key]?.count ?? 0} items</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function FinancePageShell({
  title,
  subtitle,
  children,
  showStats = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  showStats?: boolean;
}) {
  const { profile } = useShopWorkspace();
  const { loading, load, ap, ar, banks, cashBook } = useFinanceHub();

  const stats = [
    {
      label: "Accounts Payable",
      value: `LKR ${formatNumber(ap?.total ?? 0)}`,
      icon: Scale,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
    },
    {
      label: "Accounts Receivable",
      value: `LKR ${formatNumber(ar?.total ?? 0)}`,
      icon: Wallet,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
    },
    {
      label: "Bank Balances",
      value: `LKR ${formatNumber(banks.reduce((s, b) => s + b.currentBalance, 0))}`,
      icon: Landmark,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
    },
    {
      label: "Cash Book Closing",
      value: `LKR ${formatNumber(cashBook?.closing ?? 0)}`,
      icon: CheckCircle2,
      color: "text-indigo-500",
      bg: "bg-indigo-500/10",
    },
  ];

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="text-sm text-muted-foreground">
            {subtitle ?? `${profile.label} · AP / AR aging, cash book, banks, cheques & reconciliation`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => load()} disabled={loading} className="gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {showStats && (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {stats.map((s) => (
            <Card key={s.label}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${s.bg}`}>
                  <s.icon className={`h-5 w-5 ${s.color}`} />
                </div>
                <div>
                  <p className="text-xl font-bold leading-tight">{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {children}
    </div>
  );
}

export function FinanceOverviewContent() {
  const { ap, ar, banks, cashBook } = useFinanceHub();

  const stats = [
    { label: "Accounts Payable", value: `LKR ${formatNumber(ap?.total ?? 0)}`, icon: Scale, color: "text-amber-500", bg: "bg-amber-500/10" },
    { label: "Accounts Receivable", value: `LKR ${formatNumber(ar?.total ?? 0)}`, icon: Wallet, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { label: "Bank Balances", value: `LKR ${formatNumber(banks.reduce((s, b) => s + b.currentBalance, 0))}`, icon: Landmark, color: "text-blue-500", bg: "bg-blue-500/10" },
    { label: "Cash Book Closing", value: `LKR ${formatNumber(cashBook?.closing ?? 0)}`, icon: CheckCircle2, color: "text-indigo-500", bg: "bg-indigo-500/10" },
  ];

  return (
    <>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${s.bg}`}>
                <s.icon className={`h-5 w-5 ${s.color}`} />
              </div>
              <div>
                <p className="text-xl font-bold leading-tight">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {FINANCE_SECTION_LINKS.map((section) => (
          <Link key={section.href} href={section.href} className="group">
            <Card className="h-full transition-colors hover:border-indigo-300 hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20">
              <CardContent className="p-4 flex items-start gap-3">
                <div className={`p-2.5 rounded-xl ${section.bg}`}>
                  <section.icon className={`h-5 w-5 ${section.color}`} />
                </div>
                <div>
                  <p className="text-sm font-semibold group-hover:text-indigo-600">{section.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{section.description}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}

export function PayableSection() {
  const { loading, ap, apColumns } = useFinanceHub();
  return (
    <div className="space-y-4">
      <AgingStrip buckets={ap?.buckets} />
      {loading && !ap ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <ClientSideTable
          fillHeight={false}
          data={ap?.suppliers ?? []}
          columns={apColumns}
          pageCount={Math.ceil((ap?.suppliers?.length ?? 0) / 10) || 1}
          searchableColumns={[{ id: "name", title: "Supplier" }]}
          filterableColumns={[]}
          isShowExportButtons={{ isShow: true, fileName: "accounts-payable" }}
        />
      )}
    </div>
  );
}

export function ReceivableSection() {
  const { loading, ar, arColumns } = useFinanceHub();
  return (
    <div className="space-y-4">
      <AgingStrip buckets={ar?.buckets} />
      {loading && !ar ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <ClientSideTable
          fillHeight={false}
          data={ar?.customers ?? []}
          columns={arColumns}
          pageCount={Math.ceil((ar?.customers?.length ?? 0) / 10) || 1}
          searchableColumns={[
            { id: "customer", title: "Customer" },
            { id: "bucket", title: "Bucket" },
          ]}
          filterableColumns={[]}
          isShowExportButtons={{ isShow: true, fileName: "accounts-receivable" }}
        />
      )}
    </div>
  );
}

export function CashBookSection() {
  const { load, cashBook, cashRows, cashColumns, cbStart, setCbStart, cbEnd, setCbEnd } = useFinanceHub();
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold">From</label>
            <Input type="date" value={cbStart} onChange={(e) => setCbStart(e.target.value)} className="w-40 h-9" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold">To</label>
            <Input type="date" value={cbEnd} onChange={(e) => setCbEnd(e.target.value)} className="w-40 h-9" />
          </div>
          <Button size="sm" onClick={() => load()} className="h-9 gap-1.5">
            <BookOpen className="h-3.5 w-3.5" /> Load
          </Button>
          <Badge variant="secondary" className="text-[10px]">{cashBook?.source ?? "—"}</Badge>
          <span className="text-sm text-muted-foreground ml-auto">
            Opening {formatNumber(cashBook?.opening ?? 0)} → Closing {formatNumber(cashBook?.closing ?? 0)}
          </span>
        </CardContent>
      </Card>
      <ClientSideTable
          fillHeight={false}
        data={cashRows}
        columns={cashColumns}
        pageCount={Math.ceil(cashRows.length / 10) || 1}
        searchableColumns={[
          { id: "description", title: "Description" },
          { id: "type", title: "Type" },
        ]}
        filterableColumns={[]}
        isShowExportButtons={{ isShow: true, fileName: "cash-book" }}
      />
    </div>
  );
}

export function BanksSection() {
  const {
    baCode, setBaCode, baName, setBaName, baBank, setBaBank, baOpen, setBaOpen,
    baBusy, createBank, banks, bankColumns,
  } = useFinanceHub();

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-blue-500/10">
              <Plus className="h-4 w-4 text-blue-500" />
            </div>
            <h3 className="text-sm font-semibold">New bank account</h3>
          </div>
          <div className="grid sm:grid-cols-4 gap-3 items-end">
            <div className="space-y-1">
              <label className="text-xs font-semibold">Code</label>
              <Input value={baCode} onChange={(e) => setBaCode(e.target.value)} className="h-9" placeholder="MAIN" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold">Name</label>
              <Input value={baName} onChange={(e) => setBaName(e.target.value)} className="h-9" placeholder="Operating" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold">Bank name</label>
              <Input value={baBank} onChange={(e) => setBaBank(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold">Opening balance</label>
              <Input type="number" value={baOpen} onChange={(e) => setBaOpen(e.target.value)} className="h-9" />
            </div>
          </div>
          <Button size="sm" onClick={createBank} disabled={baBusy} className="gap-1.5">
            {baBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Create
          </Button>
        </CardContent>
      </Card>
      <ClientSideTable
          fillHeight={false}
        data={banks}
        columns={bankColumns}
        pageCount={Math.ceil(banks.length / 10) || 1}
        searchableColumns={[
          { id: "account", title: "Account" },
          { id: "type", title: "Type" },
        ]}
        filterableColumns={[]}
        isShowExportButtons={{ isShow: true, fileName: "bank-accounts" }}
      />
    </div>
  );
}

export function ChequesSection() {
  return <ChequesHub />;
}

export function ReconciliationSection() {
  const {
    rcBankId, setRcBankId, rcDate, setRcDate, rcBal, setRcBal,
    rcBusy, startRecon, banks, recons, reconColumns,
  } = useFinanceHub();

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="text-sm font-semibold">Start reconciliation</h3>
          <div className="grid sm:grid-cols-4 gap-3 items-end">
            <div className="space-y-1">
              <label className="text-xs font-semibold">Bank account</label>
              <Select value={rcBankId || "_none"} onValueChange={(v) => setRcBankId(v === "_none" ? "" : v)}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Bank account" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Select account</SelectItem>
                  {banks.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name} ({formatNumber(b.currentBalance)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold">Statement date</label>
              <Input type="date" value={rcDate} onChange={(e) => setRcDate(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold">Statement balance</label>
              <Input type="number" value={rcBal} onChange={(e) => setRcBal(e.target.value)} className="h-9" />
            </div>
            <Button onClick={startRecon} disabled={rcBusy} className="h-9 gap-1.5">
              {rcBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Building2 className="h-3.5 w-3.5" />}
              Start
            </Button>
          </div>
        </CardContent>
      </Card>
      <ClientSideTable
          fillHeight={false}
        data={recons}
        columns={reconColumns}
        pageCount={Math.ceil(recons.length / 10) || 1}
        searchableColumns={[
          { id: "account", title: "Account" },
          { id: "status", title: "Status" },
        ]}
        filterableColumns={[]}
        isShowExportButtons={{ isShow: true, fileName: "bank-reconciliations" }}
      />
    </div>
  );
}
