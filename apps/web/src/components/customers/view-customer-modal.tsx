"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  X, Phone, Mail, MapPin, Star, Gift, Wallet, Calendar,
  Tag, Loader2, Plus, UserCheck, Car, User, Hash, Wrench, MessageCircle,
  ShoppingBag, CreditCard, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { cn, formatNumber } from "@/lib/utils";
import { useShopProfile } from "@/lib/use-shop-profile";
import { hasShopModule } from "@/lib/shop-vertical";
import type { Customer } from "./add-customer-modal";

interface SaleLine {
  productName: string;
  variantName?: string | null;
  quantity: number;
  total: number;
}

interface SaleItem {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  total: number;
  amountPaid?: number;
  paymentStatus?: string;
  status: string;
  _count: { items: number };
  items?: SaleLine[];
}

interface LoyaltyTxn { id: string; points: number; type: string; description?: string | null; createdAt: string }
interface WalletTxn { id: string; amount: number; type: string; description?: string | null; createdAt: string }
interface CreditTxn { id: string; amount: number; type: string; description?: string | null; createdAt: string; dueDate?: string | null; status?: string; paidAmount?: number }

interface CustomerVehicleRow {
  id: string; registrationNo?: string | null; make?: string | null; model?: string | null;
  year?: number | null; vin?: string | null; notes?: string | null; isPrimary: boolean;
  vehicleModel?: { name: string; brand: { name: string } } | null;
}

interface CreditSchedule {
  id: string;
  totalAmount: number;
  installmentCount: number;
  status: string;
  startDate: string;
  lines: { sequence: number; dueDate: string; amount: number; paidAmount: number; status: string }[];
}

interface RepairJob {
  id: string;
  jobNumber: string;
  status: string;
  createdAt: string;
  total?: number;
  complaintNotes?: string | null;
}

interface FullCustomer extends Customer {
  sales: SaleItem[];
  loyaltyTxns: LoyaltyTxn[];
  walletTxns: WalletTxn[];
  creditTxns: CreditTxn[];
  creditDays?: number;
  outstandingSales?: SaleItem[];
}

interface Props { customerId: string | null; onClose: () => void; onEdit: (c: Customer) => void; }

type Tab = "overview" | "hire" | "loyalty" | "wallet" | "credit" | "vehicles";

function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-LK", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtMoney(n: number) {
  return `LKR ${formatNumber(n)}`;
}

function saleStatusBadge(sale: SaleItem) {
  const st = (sale.status ?? "").toUpperCase();
  const pay = (sale.paymentStatus ?? "").toUpperCase();
  if (st === "RETURNED" || st === "VOID" || st === "REFUNDED") {
    return { label: "RETURNED", variant: "softDanger" as const };
  }
  if (pay === "PENDING" || pay === "PARTIAL") {
    return { label: "DUE", variant: "softInfo" as const };
  }
  return { label: "PAID", variant: "softSuccess" as const };
}

function saleItemsSummary(sale: SaleItem) {
  const count = sale._count?.items ?? sale.items?.length ?? 0;
  const first = sale.items?.[0];
  if (!first) return `${count} item${count === 1 ? "" : "s"}`;
  const extra = count > 1 ? ` +${count - 1} more` : "";
  return `${first.productName}${first.variantName ? ` (${first.variantName})` : ""}${extra}`;
}

function InfoRow({ icon: Icon, label, value, valueClass }: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="flex items-start gap-2.5 min-w-0">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" strokeWidth={1.75} />
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className={cn("text-sm font-medium break-words", valueClass)}>{value}</p>
      </div>
    </div>
  );
}

function SectionTableHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-t-xl">
      <Icon className="h-4 w-4 shrink-0" />
      <span className="text-xs font-bold uppercase tracking-wide">{title}</span>
    </div>
  );
}

export function ViewCustomerModal({ customerId, onClose, onEdit }: Props) {
  const router = useRouter();
  const profile = useShopProfile();
  const showLoyalty = hasShopModule(profile, "loyalty");
  const showVehicles = hasShopModule(profile, "vehicles");
  const showWorkshop = hasShopModule(profile, "workshop");

  const [customer, setCustomer] = useState<FullCustomer | null>(null);
  const [vehicles, setVehicles] = useState<CustomerVehicleRow[]>([]);
  const [schedules, setSchedules] = useState<CreditSchedule[]>([]);
  const [repairs, setRepairs] = useState<RepairJob[]>([]);
  const [vehForm, setVehForm] = useState({ registrationNo: "", make: "", model: "", year: "" });
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(false);
  const [pointsInput, setPointsInput] = useState("");
  const [walletInput, setWalletInput] = useState("");
  const [creditPayInput, setCreditPayInput] = useState("");
  const [creditLimitInput, setCreditLimitInput] = useState("");
  const [creditDaysInput, setCreditDaysInput] = useState("7");
  const [creditPayMode, setCreditPayMode] = useState<"7" | "14" | "custom" | "salary">("7");
  const [creditSalaryDate, setCreditSalaryDate] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const applyCreditDaysToForm = (days: number) => {
    if (days === 7) { setCreditPayMode("7"); setCreditDaysInput("7"); }
    else if (days === 14) { setCreditPayMode("14"); setCreditDaysInput("14"); }
    else { setCreditPayMode("custom"); setCreditDaysInput(String(days)); }
    setCreditSalaryDate("");
  };

  const loadCustomer = async (id: string) => {
    const r = await api.get<FullCustomer>(`/customers/${id}`);
    setCustomer(r.data);
    setCreditLimitInput(r.data.creditLimit > 0 ? String(r.data.creditLimit) : "");
    applyCreditDaysToForm(r.data.creditDays ?? 7);
    return r.data;
  };

  useEffect(() => {
    if (!customerId) { setCustomer(null); return; }
    setLoading(true);
    setTab("overview");
    loadCustomer(customerId)
      .then(async (c) => {
        const tasks: Promise<void>[] = [
          api.get<CreditSchedule[]>(`/customers/credit/schedules?customerId=${c.id}`)
            .then((res) => setSchedules(Array.isArray(res.data) ? res.data : []))
            .catch(() => setSchedules([])),
        ];
        if (showWorkshop) {
          tasks.push(
            api.get<RepairJob[]>("/workshop/job-cards")
              .then((res) => {
                const rows = Array.isArray(res.data) ? res.data : [];
                setRepairs(rows.filter((j) => (j as RepairJob & { customerId?: string }).customerId === c.id));
              })
              .catch(() => setRepairs([])),
          );
        } else {
          setRepairs([]);
        }
        await Promise.all(tasks);
      })
      .catch(() => toast.error("Failed to load customer"))
      .finally(() => setLoading(false));
  }, [customerId, showWorkshop]);

  useEffect(() => {
    if (tab !== "vehicles" || !customerId) return;
    api.get<CustomerVehicleRow[]>(`/spare-parts/customers/${customerId}/vehicles`)
      .then((r) => setVehicles(Array.isArray(r.data) ? r.data : []))
      .catch(() => setVehicles([]));
  }, [tab, customerId]);

  const customerSchedules = useMemo(() => schedules, [schedules]);

  const stats = useMemo(() => {
    if (!customer) return { purchases: 0, salesValue: 0, repairs: 0, repairValue: 0, outstanding: 0 };
    const salesValue = customer.sales.reduce((s, x) => s + (x.total ?? 0), 0);
    const repairValue = repairs.reduce((s, x) => s + (x.total ?? 0), 0);
    return {
      purchases: customer.sales.length,
      salesValue,
      repairs: repairs.length,
      repairValue,
      outstanding: customer.creditBalance,
    };
  }, [customer, repairs]);

  const fullName = customer ? `${customer.firstName} ${customer.lastName ?? ""}`.trim() : "";
  const hasOutstanding = (customer?.creditBalance ?? 0) > 0;
  const addressLine = [customer?.address, customer?.city].filter(Boolean).join(", ") || "—";

  const reloadCustomer = async () => {
    if (!customerId) return;
    await loadCustomer(customerId);
  };

  const addVehicle = async () => {
    if (!customer || !vehForm.registrationNo.trim()) { toast.error("Vehicle number required"); return; }
    setActionLoading(true);
    try {
      await api.post("/spare-parts/customer-vehicles", {
        customerId: customer.id,
        registrationNo: vehForm.registrationNo.trim(),
        make: vehForm.make.trim() || undefined,
        model: vehForm.model.trim() || undefined,
        year: vehForm.year ? parseInt(vehForm.year, 10) : undefined,
        isPrimary: vehicles.length === 0,
      });
      toast.success("Vehicle added");
      setVehForm({ registrationNo: "", make: "", model: "", year: "" });
      const r = await api.get<CustomerVehicleRow[]>(`/spare-parts/customers/${customer.id}/vehicles`);
      setVehicles(Array.isArray(r.data) ? r.data : []);
    } catch (e: unknown) { toast.error((e as Error).message); }
    finally { setActionLoading(false); }
  };

  const addPoints = async () => {
    const pts = parseInt(pointsInput, 10);
    if (!customer || isNaN(pts) || pts === 0) return;
    setActionLoading(true);
    try {
      await api.post(`/customers/${customer.id}/loyalty/add`, { points: pts, description: "Manual adjustment" });
      toast.success(`${pts > 0 ? "+" : ""}${pts} points added`);
      setPointsInput("");
      setCustomer((c) => c ? { ...c, loyaltyPoints: c.loyaltyPoints + pts } : c);
    } catch { toast.error("Failed to add loyalty points"); }
    finally { setActionLoading(false); }
  };

  const topupWallet = async () => {
    const amt = parseFloat(walletInput);
    if (!customer || isNaN(amt) || amt <= 0) return;
    setActionLoading(true);
    try {
      await api.post(`/customers/${customer.id}/wallet/topup`, { amount: amt, description: "Manual top-up" });
      toast.success(`LKR ${amt} added to wallet`);
      setWalletInput("");
      setCustomer((c) => c ? { ...c, walletBalance: c.walletBalance + amt } : c);
    } catch { toast.error("Failed to top up wallet"); }
    finally { setActionLoading(false); }
  };

  const receiveCreditPayment = async (amount?: number) => {
    const amt = amount ?? parseFloat(creditPayInput);
    if (!customer || isNaN(amt) || amt <= 0) return;
    setActionLoading(true);
    try {
      const res = await api.post<{ appliedToCredit?: number; advanceToWallet?: number }>(`/customers/${customer.id}/credit/payment`, {
        amount: amt,
        description: "Credit payment received",
        paymentMethod: "CASH",
      });
      const applied = res.data?.appliedToCredit ?? Math.min(amt, customer.creditBalance);
      const advance = res.data?.advanceToWallet ?? 0;
      toast.success(advance > 0 ? `Settled LKR ${applied} · Advance LKR ${advance} → wallet` : `LKR ${applied} credit payment received`);
      setCreditPayInput("");
      await reloadCustomer();
    } catch (e: unknown) { toast.error((e as Error).message ?? "Failed to record payment"); }
    finally { setActionLoading(false); }
  };

  const applyWalletToCredit = async () => {
    if (!customer || customer.creditBalance <= 0 || customer.walletBalance <= 0) return;
    const amt = Math.min(customer.creditBalance, customer.walletBalance);
    setActionLoading(true);
    try {
      await api.post(`/customers/${customer.id}/credit/payment`, {
        amount: amt,
        description: "Credit settled from wallet advance",
        applyFromWallet: true,
      });
      toast.success(`Applied LKR ${amt} from wallet to credit`);
      await reloadCustomer();
    } catch (e: unknown) { toast.error((e as Error).message ?? "Failed to apply wallet"); }
    finally { setActionLoading(false); }
  };

  const saveCreditLimit = async () => {
    const limit = parseFloat(creditLimitInput);
    if (!customer || isNaN(limit) || limit < 0) { toast.error("Enter a valid credit limit"); return; }
    setActionLoading(true);
    try {
      await api.put(`/customers/${customer.id}/credit/limit`, { creditLimit: limit });
      toast.success("Credit limit updated");
      await reloadCustomer();
    } catch (e: unknown) { toast.error((e as Error).message ?? "Failed to update credit limit"); }
    finally { setActionLoading(false); }
  };

  const saveCreditDays = async () => {
    if (!customer) return;
    let days: number;
    if (creditPayMode === "7") days = 7;
    else if (creditPayMode === "14") days = 14;
    else if (creditPayMode === "custom") {
      days = parseInt(creditDaysInput, 10);
      if (isNaN(days) || days < 0) { toast.error("Enter valid custom pay days"); return; }
    } else {
      if (!creditSalaryDate.trim()) { toast.error("Select salary due date"); return; }
      const target = new Date(creditSalaryDate);
      if (isNaN(target.getTime())) { toast.error("Invalid salary due date"); return; }
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      target.setHours(0, 0, 0, 0);
      days = Math.max(0, Math.round((target.getTime() - today.getTime()) / 86400000));
    }
    setActionLoading(true);
    try {
      await api.put(`/customers/${customer.id}/credit/days`, { creditDays: days });
      toast.success("Payment terms updated");
      await reloadCustomer();
    } catch (e: unknown) { toast.error((e as Error).message ?? "Failed to update credit days"); }
    finally { setActionLoading(false); }
  };

  const sendWhatsAppReminder = () => {
    if (!customer) return;
    const digits = customer.phone.replace(/\D/g, "");
    const intl = digits.startsWith("94") ? digits : `94${digits.replace(/^0/, "")}`;
    const msg = encodeURIComponent(
      `Hello ${customer.firstName}, your outstanding balance is ${fmtMoney(customer.creditBalance)}. Please settle at your earliest convenience.`,
    );
    window.open(`https://wa.me/${intl}?text=${msg}`, "_blank", "noopener,noreferrer");
  };

  if (!customerId) return null;

  const MAIN_TABS: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "hire", label: `Hire Purchase (${customerSchedules.length})` },
  ];

  const EXTRA_TABS: { id: Tab; label: string }[] = [
    ...(showLoyalty ? [{ id: "loyalty" as Tab, label: "Loyalty" }] : []),
    { id: "wallet", label: "Wallet" },
    { id: "credit", label: "Credit" },
    ...(showVehicles ? [{ id: "vehicles" as Tab, label: `Vehicles (${vehicles.length})` }] : []),
  ];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-6xl border overflow-hidden max-h-[94vh] flex flex-col">
        {/* Header */}
        <div className="px-5 sm:px-6 pt-5 pb-0 border-b shrink-0 bg-card/50">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : customer ? (
            <>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold leading-tight">
                      Customer Details <span className="text-muted-foreground font-semibold">( {fullName} )</span>
                    </h2>
                    <p className="text-sm text-muted-foreground mt-0.5">{customer.phone}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {hasOutstanding && (
                    <Badge variant="softDanger" className="h-7 rounded-full px-3 text-xs font-bold">
                      Outstanding
                    </Badge>
                  )}
                  <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 mt-4 pb-3">
                {MAIN_TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={cn(
                      "px-4 py-2 rounded-lg text-sm font-semibold transition-colors",
                      tab === t.id
                        ? "bg-primary/10 text-primary border border-primary/20"
                        : "text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {t.label}
                  </button>
                ))}
                {EXTRA_TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                      tab === t.id ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/70",
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {!customer && !loading && (
            <p className="text-center text-muted-foreground py-16">Customer not found</p>
          )}

          {customer && tab === "overview" && (
            <div className="p-5 sm:p-6 space-y-5">
              <div className="grid grid-cols-1 xl:grid-cols-[1fr_240px] gap-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 rounded-xl border bg-card p-5">
                  <InfoRow icon={Calendar} label="Since" value={fmtDate(customer.createdAt)} />
                  <InfoRow icon={User} label="Customer name" value={fullName} />
                  <InfoRow icon={Phone} label="Phone" value={customer.phone} />
                  <InfoRow icon={MapPin} label="Address" value={addressLine} />
                  <InfoRow icon={Mail} label="Email" value={customer.email || "—"} />
                  <InfoRow icon={Star} label="Loyalty" value={`${formatNumber(customer.loyaltyPoints)} pts`} />
                  <InfoRow icon={Hash} label="Customer ID" value={<span className="font-mono text-xs">{customer.id.slice(0, 8)}</span>} />
                  <InfoRow
                    icon={Wallet}
                    label="Credit status"
                    value={hasOutstanding ? "Has outstanding" : "Clear"}
                    valueClass={hasOutstanding ? "text-red-600 font-semibold" : "text-emerald-600"}
                  />
                </div>

                <div className="rounded-xl border bg-card p-4 h-fit">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-semibold">Quick totals</p>
                    <span className="text-[10px] font-bold text-muted-foreground">LKR</span>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Purchases</span><span className="font-semibold tabular-nums">{stats.purchases}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Repairs</span><span className="font-semibold tabular-nums">{stats.repairs}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Sales value</span><span className="font-semibold tabular-nums">{fmtMoney(stats.salesValue)}</span></div>
                    <div className="flex justify-between pt-2 border-t font-bold">
                      <span>Outstanding</span>
                      <span className={cn("tabular-nums", hasOutstanding && "text-red-600")}>{fmtMoney(stats.outstanding)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-5">
                <div className="space-y-5 min-w-0">
                  <div className="rounded-xl border overflow-hidden bg-card">
                    <SectionTableHeader icon={ShoppingBag} title="Sales History" />
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/30 text-[10px] uppercase tracking-wide text-muted-foreground">
                            {["#", "Invoice", "Date", "Items", "Status", "Total"].map((h, i) => (
                              <th key={h} className={cn("px-3 py-2.5 font-semibold", i >= 4 ? "text-right" : "text-left")}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {customer.sales.length === 0 ? (
                            <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground text-sm">No sales yet</td></tr>
                          ) : customer.sales.map((sale, i) => {
                            const badge = saleStatusBadge(sale);
                            return (
                              <tr key={sale.id} className="hover:bg-muted/20">
                                <td className="px-3 py-3 text-muted-foreground text-xs">{i + 1}</td>
                                <td className="px-3 py-3 font-mono text-xs font-semibold">{sale.invoiceNumber}</td>
                                <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(sale.invoiceDate)}</td>
                                <td className="px-3 py-3 text-xs max-w-[200px]">
                                  <span className="line-clamp-2">{saleItemsSummary(sale)}</span>
                                </td>
                                <td className="px-3 py-3 text-right">
                                  <Badge variant={badge.variant} className="h-5 rounded-full px-2 text-[10px] font-bold">{badge.label}</Badge>
                                </td>
                                <td className="px-3 py-3 text-right font-bold tabular-nums whitespace-nowrap">{fmtMoney(sale.total)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {showWorkshop && (
                    <div className="rounded-xl border overflow-hidden bg-card">
                      <SectionTableHeader icon={Wrench} title="Repair History" />
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-muted/30 text-[10px] uppercase tracking-wide text-muted-foreground">
                              {["#", "Job #", "Date", "Status", "Total"].map((h, i) => (
                                <th key={h} className={cn("px-3 py-2.5 font-semibold", i >= 3 ? "text-right" : "text-left")}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {repairs.length === 0 ? (
                              <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground text-sm">No repairs yet</td></tr>
                            ) : repairs.map((job, i) => (
                              <tr key={job.id} className="hover:bg-muted/20">
                                <td className="px-3 py-3 text-muted-foreground text-xs">{i + 1}</td>
                                <td className="px-3 py-3 font-mono text-xs font-semibold">{job.jobNumber}</td>
                                <td className="px-3 py-3 text-xs text-muted-foreground">{fmtDate(job.createdAt)}</td>
                                <td className="px-3 py-3 text-right">
                                  <Badge variant="outline" className="h-5 text-[10px]">{job.status}</Badge>
                                </td>
                                <td className="px-3 py-3 text-right font-bold tabular-nums">{fmtMoney(job.total ?? 0)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-xl border bg-card p-4 h-fit space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">Summary</p>
                    <p className={cn("font-bold tabular-nums", hasOutstanding && "text-red-600")}>{fmtMoney(stats.outstanding)}</p>
                  </div>
                  <div className="space-y-2 text-sm border-t pt-3">
                    <div className="flex justify-between"><span className="text-muted-foreground">Purchases</span><span>{stats.purchases}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Sales value</span><span className="tabular-nums">{fmtMoney(stats.salesValue)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Repairs</span><span>{stats.repairs}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Repair value</span><span className="tabular-nums">{fmtMoney(stats.repairValue)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Loyalty points</span><span>{formatNumber(customer.loyaltyPoints)} pts</span></div>
                  </div>
                  <p className="text-sm font-bold text-red-600 border-t pt-3">
                    Outstanding: {fmtMoney(stats.outstanding)}
                  </p>
                  {hasOutstanding && (
                    <Button
                      className="w-full gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                      onClick={() => void receiveCreditPayment(customer.creditBalance)}
                      disabled={actionLoading}
                    >
                      {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
                      Pay now
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-xl border bg-card p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">Customer note</p>
                  <p className="text-sm text-muted-foreground min-h-[48px]">{customer.notes?.trim() || "—"}</p>
                </div>
                <div className="rounded-xl border bg-card p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">Contact</p>
                  <p className="text-sm flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-muted-foreground" />{customer.phone}</p>
                  <p className="text-sm flex items-center gap-2 mt-1"><Mail className="h-3.5 w-3.5 text-muted-foreground" />{customer.email || "—"}</p>
                </div>
              </div>
            </div>
          )}

          {customer && tab === "hire" && (
            <div className="p-5 sm:p-6 space-y-4">
              {customerSchedules.length === 0 ? (
                <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
                  <CreditCard className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="font-medium">No hire purchase plans</p>
                  <p className="text-sm mt-1">Installment schedules will appear here</p>
                </div>
              ) : customerSchedules.map((sch) => (
                <div key={sch.id} className="rounded-xl border bg-card overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/20">
                    <div>
                      <p className="font-semibold text-sm">{fmtMoney(sch.totalAmount)} · {sch.installmentCount} installments</p>
                      <p className="text-xs text-muted-foreground">Started {fmtDate(sch.startDate)}</p>
                    </div>
                    <Badge variant={sch.status === "ACTIVE" ? "softSuccess" : "secondary"}>{sch.status}</Badge>
                  </div>
                  <div className="divide-y">
                    {sch.lines.map((line) => (
                      <div key={line.sequence} className="flex items-center justify-between px-4 py-2.5 text-sm">
                        <span className="text-muted-foreground">#{line.sequence} · Due {fmtDate(line.dueDate)}</span>
                        <div className="text-right">
                          <p className="font-semibold tabular-nums">{fmtMoney(line.amount)}</p>
                          <p className="text-[10px] text-muted-foreground">{line.status}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {customer && showLoyalty && tab === "loyalty" && (
            <div className="p-5 sm:p-6 space-y-4">
              <div className="rounded-xl border bg-amber-500/5 p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Current Points</p>
                  <p className="text-3xl font-black text-amber-500">{formatNumber(customer.loyaltyPoints)}</p>
                </div>
                <Gift className="h-10 w-10 text-amber-500/30" />
              </div>
              <div className="flex gap-2">
                <Input type="number" placeholder="Add / deduct points…" value={pointsInput}
                  onChange={(e) => setPointsInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addPoints()} />
                <Button onClick={addPoints} disabled={actionLoading || !pointsInput} className="gap-1.5 shrink-0">
                  {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Apply
                </Button>
              </div>
              <div className="space-y-2">
                {customer.loyaltyTxns.map((txn) => (
                  <div key={txn.id} className="flex items-center justify-between p-2.5 rounded-lg border text-sm">
                    <div>
                      <p className="font-medium text-xs">{txn.description ?? txn.type}</p>
                      <p className="text-[10px] text-muted-foreground">{fmtDate(txn.createdAt)}</p>
                    </div>
                    <span className={`font-bold text-sm ${txn.points > 0 ? "text-emerald-500" : "text-red-500"}`}>
                      {txn.points > 0 ? "+" : ""}{txn.points}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {customer && tab === "wallet" && (
            <div className="p-5 sm:p-6 space-y-4">
              <div className="rounded-xl border bg-emerald-500/5 p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Wallet Balance</p>
                  <p className="text-3xl font-black text-emerald-500">{fmtMoney(customer.walletBalance)}</p>
                </div>
                <Wallet className="h-10 w-10 text-emerald-500/30" />
              </div>
              <div className="flex gap-2">
                <Input type="number" min={1} step={0.01} placeholder="Top-up amount (LKR)…" value={walletInput}
                  onChange={(e) => setWalletInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && topupWallet()} />
                <Button variant="success" onClick={topupWallet} disabled={actionLoading || !walletInput} className="gap-1.5 shrink-0">
                  {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Top Up
                </Button>
              </div>
              <div className="space-y-2">
                {(customer.walletTxns ?? []).map((txn) => (
                  <div key={txn.id} className="flex items-center justify-between p-2.5 rounded-lg border text-sm">
                    <div>
                      <p className="font-medium text-xs">{txn.description ?? txn.type}</p>
                      <p className="text-[10px] text-muted-foreground">{fmtDate(txn.createdAt)}</p>
                    </div>
                    <span className={`font-bold text-sm ${txn.amount > 0 ? "text-emerald-500" : "text-red-500"}`}>
                      {txn.amount > 0 ? "+" : ""}{fmtMoney(txn.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {customer && tab === "credit" && (
            <div className="p-5 sm:p-6 space-y-4">
              <div className="rounded-xl border bg-amber-500/5 p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Outstanding Credit</p>
                  <p className="text-3xl font-black text-amber-500">{fmtMoney(customer.creditBalance)}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Limit: {fmtMoney(customer.creditLimit)} · Available: {fmtMoney(Math.max(0, customer.creditLimit - customer.creditBalance))}
                  </p>
                </div>
                <UserCheck className="h-10 w-10 text-amber-500/30" />
              </div>
              <div className="rounded-xl border p-3 space-y-2">
                <p className="text-xs font-semibold">Credit Limit</p>
                <div className="flex gap-2">
                  <Input type="number" min={0} step={0.01} placeholder="Credit limit (LKR)…" value={creditLimitInput}
                    onChange={(e) => setCreditLimitInput(e.target.value)} />
                  <Button onClick={saveCreditLimit} disabled={actionLoading} variant="outline" className="shrink-0">Save</Button>
                </div>
              </div>
              <div className="rounded-xl border p-3 space-y-2">
                <p className="text-xs font-semibold">Pay days / Salary due</p>
                <div className="flex flex-wrap gap-1.5">
                  {([["7", "7 days"], ["14", "14 days"], ["custom", "Custom"], ["salary", "Salary date"]] as const).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => {
                        setCreditPayMode(mode);
                        if (mode === "7") setCreditDaysInput("7");
                        if (mode === "14") setCreditDaysInput("14");
                      }}
                      className={cn(
                        "h-8 px-2.5 rounded-lg text-[11px] font-bold border transition-colors",
                        creditPayMode === mode ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-input hover:bg-muted",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {creditPayMode === "custom" && (
                  <Input type="number" min={0} step={1} placeholder="Custom days" value={creditDaysInput}
                    onChange={(e) => setCreditDaysInput(e.target.value)} />
                )}
                {creditPayMode === "salary" && (
                  <Input type="date" value={creditSalaryDate} onChange={(e) => setCreditSalaryDate(e.target.value)} />
                )}
                <Button onClick={saveCreditDays} disabled={actionLoading} variant="outline" className="w-full">Save payment terms</Button>
              </div>
              <div className="flex gap-2">
                <Input type="number" min={0.01} step={0.01} placeholder="Payment / advance (LKR)…" value={creditPayInput}
                  onChange={(e) => setCreditPayInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && receiveCreditPayment()} />
                <Button variant="warning" onClick={() => receiveCreditPayment()} disabled={actionLoading || !creditPayInput} className="gap-1.5 shrink-0">
                  {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Receive
                </Button>
              </div>
              {customer.creditBalance > 0 && customer.walletBalance > 0 && (
                <Button variant="outline" size="sm" disabled={actionLoading} onClick={applyWalletToCredit} className="w-full gap-1.5">
                  <Wallet className="h-3.5 w-3.5" />
                  Apply wallet advance to credit ({fmtMoney(Math.min(customer.creditBalance, customer.walletBalance))})
                </Button>
              )}
              <div className="space-y-2">
                {(customer.creditTxns ?? []).length === 0 && (
                  <p className="text-center text-muted-foreground py-6 text-sm">No credit transactions yet</p>
                )}
                {(customer.creditTxns ?? []).map((txn) => (
                  <div key={txn.id} className="flex items-center justify-between p-2.5 rounded-lg border text-sm">
                    <div>
                      <p className="font-medium text-xs">{txn.description ?? txn.type}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {fmtDate(txn.createdAt)}
                        {txn.dueDate ? ` · Due ${fmtDate(txn.dueDate)}` : ""}
                        {txn.status ? ` · ${txn.status}` : ""}
                      </p>
                    </div>
                    <span className={`font-bold text-sm ${txn.type === "PAYMENT" ? "text-emerald-500" : "text-amber-500"}`}>
                      {txn.type === "PAYMENT" ? "-" : "+"}{fmtMoney(txn.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {customer && tab === "vehicles" && (
            <div className="p-5 sm:p-6 space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Vehicle no (ABC-1234)" value={vehForm.registrationNo} onChange={(e) => setVehForm((f) => ({ ...f, registrationNo: e.target.value }))} />
                <Input placeholder="Year" value={vehForm.year} onChange={(e) => setVehForm((f) => ({ ...f, year: e.target.value }))} />
                <Input placeholder="Make (Toyota)" value={vehForm.make} onChange={(e) => setVehForm((f) => ({ ...f, make: e.target.value }))} />
                <Input placeholder="Model (Axio)" value={vehForm.model} onChange={(e) => setVehForm((f) => ({ ...f, model: e.target.value }))} />
              </div>
              <Button size="sm" onClick={addVehicle} disabled={actionLoading} className="gap-1">
                <Car className="h-3.5 w-3.5" /> Add Vehicle
              </Button>
              {vehicles.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No vehicles registered</p>
              ) : vehicles.map((v) => (
                <div key={v.id} className="flex items-center justify-between p-3 rounded-lg border text-sm">
                  <div>
                    <p className="font-semibold">{v.registrationNo ?? "—"} {v.isPrimary && <Badge variant="secondary" className="ml-1 text-[10px]">Primary</Badge>}</p>
                    <p className="text-muted-foreground text-xs">
                      {v.vehicleModel ? `${v.vehicleModel.brand.name} ${v.vehicleModel.name}` : `${v.make ?? ""} ${v.model ?? ""}`.trim() || "—"}
                      {v.year ? ` · ${v.year}` : ""}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {customer && (
          <div className="shrink-0 border-t bg-card/80 px-5 sm:px-6 py-4 flex flex-wrap items-center justify-end gap-2">
            <Button variant="outline" className="gap-1.5 text-primary border-primary/30" onClick={() => router.push("/pos")}>
              <Tag className="h-3.5 w-3.5" /> New Sale
            </Button>
            {hasOutstanding && (
              <Button
                variant="outline"
                className="gap-1.5 text-emerald-700 border-emerald-300 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/10"
                onClick={() => { setTab("credit"); setCreditPayInput(String(customer.creditBalance)); }}
              >
                <Wallet className="h-3.5 w-3.5" /> Pay Outstanding
              </Button>
            )}
            {hasOutstanding && (
              <Button variant="outline" className="gap-1.5 text-sky-700 border-sky-300 bg-sky-50 hover:bg-sky-100 dark:bg-sky-500/10" onClick={sendWhatsAppReminder}>
                <MessageCircle className="h-3.5 w-3.5" /> Send WhatsApp Reminder
              </Button>
            )}
            <Button variant="outline" onClick={() => { onEdit(customer); onClose(); }} className="gap-1.5">
              <FileText className="h-3.5 w-3.5" /> Edit
            </Button>
            <Button variant="secondary" onClick={onClose}>Close</Button>
          </div>
        )}
      </div>
    </div>
  );
}
