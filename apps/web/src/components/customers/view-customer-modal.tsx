"use client";

import { useState, useEffect } from "react";
import { X, Phone, Mail, MapPin, Star, Crown, Diamond, Gift, Wallet, ShoppingBag, Calendar, Tag, Loader2, Plus, UserCheck, Car } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { getInitials, formatNumber } from "@/lib/utils";
import { useShopProfile } from "@/lib/use-shop-profile";
import { hasShopModule } from "@/lib/shop-vertical";
import type { Customer } from "./add-customer-modal";

interface SaleItem { id: string; invoiceNumber: string; invoiceDate: string; total: number; status: string; _count: { items: number } }
interface LoyaltyTxn { id: string; points: number; type: string; description?: string | null; createdAt: string }
interface WalletTxn  { id: string; amount: number; type: string; description?: string | null; createdAt: string }
interface CreditTxn  { id: string; amount: number; type: string; description?: string | null; createdAt: string; dueDate?: string | null; status?: string; paidAmount?: number }

interface CustomerVehicleRow {
  id: string; registrationNo?: string | null; make?: string | null; model?: string | null;
  year?: number | null; vin?: string | null; notes?: string | null; isPrimary: boolean;
  vehicleModel?: { name: string; brand: { name: string } } | null;
}

interface FullCustomer extends Customer {
  sales: SaleItem[];
  loyaltyTxns: LoyaltyTxn[];
  walletTxns: WalletTxn[];
  creditTxns: CreditTxn[];
  creditDays?: number;
}

interface Props { customerId: string | null; onClose: () => void; onEdit: (c: Customer) => void; }

const TIER_CONF: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  BRONZE:   { label: "Bronze",   color: "text-amber-700",   bg: "bg-amber-700/10",   icon: Star },
  SILVER:   { label: "Silver",   color: "text-slate-400",   bg: "bg-slate-400/10",   icon: Star },
  GOLD:     { label: "Gold",     color: "text-amber-500",   bg: "bg-amber-500/10",   icon: Crown },
  PLATINUM: { label: "Platinum", color: "text-violet-400",  bg: "bg-violet-400/10",  icon: Crown },
  DIAMOND:  { label: "Diamond",  color: "text-cyan-400",    bg: "bg-cyan-400/10",    icon: Diamond },
};

type Tab = "overview" | "purchases" | "loyalty" | "wallet" | "credit" | "vehicles";

export function ViewCustomerModal({ customerId, onClose, onEdit }: Props) {
  const profile = useShopProfile();
  const showLoyalty = hasShopModule(profile, "loyalty");
  const showVehicles = hasShopModule(profile, "vehicles");
  const [customer, setCustomer]   = useState<FullCustomer | null>(null);
  const [vehicles, setVehicles]     = useState<CustomerVehicleRow[]>([]);
  const [vehForm, setVehForm]       = useState({ registrationNo: "", make: "", model: "", year: "" });
  const [tab, setTab]             = useState<Tab>("overview");
  const [loading, setLoading]     = useState(false);
  const [pointsInput, setPointsInput] = useState("");
  const [walletInput, setWalletInput] = useState("");
  const [creditPayInput, setCreditPayInput] = useState("");
  const [creditLimitInput, setCreditLimitInput] = useState("");
  const [creditDaysInput, setCreditDaysInput] = useState("30");
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (!customerId) { setCustomer(null); return; }
    setLoading(true); setTab("overview");
    api.get<FullCustomer>(`/customers/${customerId}`)
      .then((r) => {
        setCustomer(r.data);
        setCreditLimitInput(r.data.creditLimit > 0 ? String(r.data.creditLimit) : "");
        setCreditDaysInput(String(r.data.creditDays ?? 30));
      })
      .catch(() => toast.error("Failed to load customer"))
      .finally(() => setLoading(false));
  }, [customerId]);

  useEffect(() => {
    if (tab !== "vehicles" || !customerId) return;
    api.get<CustomerVehicleRow[]>(`/spare-parts/customers/${customerId}/vehicles`)
      .then((r) => setVehicles(Array.isArray(r.data) ? r.data : []))
      .catch(() => setVehicles([]));
  }, [tab, customerId]);

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

  const reloadCustomer = async () => {
    if (!customerId) return;
    const r = await api.get<FullCustomer>(`/customers/${customerId}`);
    setCustomer(r.data);
    setCreditLimitInput(r.data.creditLimit > 0 ? String(r.data.creditLimit) : "");
    setCreditDaysInput(String(r.data.creditDays ?? 30));
  };

  const receiveCreditPayment = async () => {
    const amt = parseFloat(creditPayInput);
    if (!customer || isNaN(amt) || amt <= 0) return;
    setActionLoading(true);
    try {
      const res = await api.post<{
        appliedToCredit?: number;
        advanceToWallet?: number;
      }>(`/customers/${customer.id}/credit/payment`, {
        amount: amt,
        description: "Credit payment received",
        paymentMethod: "CASH",
      });
      const applied = res.data?.appliedToCredit ?? Math.min(amt, customer.creditBalance);
      const advance = res.data?.advanceToWallet ?? 0;
      if (advance > 0) {
        toast.success(`Settled LKR ${applied} · Advance LKR ${advance} → wallet`);
      } else {
        toast.success(`LKR ${applied} credit payment received`);
      }
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
    const days = parseInt(creditDaysInput, 10);
    if (!customer || isNaN(days) || days < 0) { toast.error("Enter valid credit days"); return; }
    setActionLoading(true);
    try {
      await api.put(`/customers/${customer.id}/credit/days`, { creditDays: days });
      toast.success("Payment terms updated");
      await reloadCustomer();
    } catch (e: unknown) { toast.error((e as Error).message ?? "Failed to update credit days"); }
    finally { setActionLoading(false); }
  };

  if (!customerId) return null;

  const tierConf = customer ? (TIER_CONF[customer.tier] ?? TIER_CONF.BRONZE) : TIER_CONF.BRONZE;
  const TierIcon = tierConf.icon;

  const TABS: { id: Tab; label: string }[] = [
    { id: "overview",  label: "Overview" },
    { id: "purchases", label: `Purchases${customer ? ` (${customer.sales.length})` : ""}` },
    ...(showLoyalty ? [{ id: "loyalty" as Tab, label: "Loyalty" }] : []),
    ...(showVehicles ? [{ id: "vehicles" as Tab, label: `Vehicles${vehicles.length ? ` (${vehicles.length})` : ""}` }] : []),
    { id: "wallet",    label: "Wallet" },
    { id: "credit",    label: "Credit" },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-2xl border overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b shrink-0">
          {loading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : customer ? (
            <div className="flex items-start gap-4">
              <Avatar className="h-14 w-14 shrink-0">
                <AvatarFallback className="text-lg font-bold">
                  {getInitials(`${customer.firstName} ${customer.lastName ?? ""}`)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-bold">{customer.firstName} {customer.lastName ?? ""}</h2>
                  <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${tierConf.bg} ${tierConf.color}`}>
                    <TierIcon className="h-2.5 w-2.5" />{tierConf.label}
                  </span>
                  {!customer.isActive && <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
                </div>
                <p className="text-xs text-muted-foreground font-mono mt-0.5">{customer.code} {customer.referralCode ? `· Ref: ${customer.referralCode}` : ""}</p>
                <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{customer.phone}</span>
                  {customer.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{customer.email}</span>}
                  {customer.city && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{customer.city}</span>}
                </div>
                {customer.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {customer.tags.map((t) => (
                      <span key={t} className="inline-flex items-center gap-0.5 text-[10px] bg-muted/50 px-1.5 py-0.5 rounded-full">
                        <Tag className="h-2 w-2" />{t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" variant="outline" onClick={() => { onEdit(customer); onClose(); }}>Edit</Button>
                <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors"><X className="h-4 w-4" /></button>
              </div>
            </div>
          ) : null}

          {/* Tabs */}
          {customer && (
            <div className="flex gap-1 mt-4">
              {TABS.map((t) => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${tab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {!customer && !loading && <p className="text-center text-muted-foreground py-12">Customer not found</p>}

          {customer && tab === "overview" && (
            <div className="space-y-4">
              {/* KPI row */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Total Spent", value: `LKR ${formatNumber(customer.totalSpent)}`, icon: ShoppingBag, color: "text-primary" },
                  { label: "Orders",      value: customer.totalOrders, icon: ShoppingBag, color: "text-blue-500" },
                  ...(showLoyalty ? [{ label: "Loyalty Pts", value: formatNumber(customer.loyaltyPoints), icon: Gift, color: "text-amber-500" }] : []),
                ].map((k) => (
                  <div key={k.label} className="rounded-xl border bg-card p-3 text-center">
                    <p className={`text-xl font-black ${k.color}`}>{k.value}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{k.label}</p>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border bg-card p-3 text-center">
                  <p className="text-xl font-black text-emerald-500">LKR {formatNumber(customer.walletBalance)}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Wallet Balance</p>
                </div>
                <div className="rounded-xl border bg-card p-3 text-center">
                  <p className={`text-xl font-black ${customer.creditBalance > 0 ? "text-amber-500" : "text-muted-foreground"}`}>
                    LKR {formatNumber(customer.creditBalance)}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Credit Due {customer.creditLimit > 0 ? `(limit ${formatNumber(customer.creditLimit)})` : ""}
                  </p>
                </div>
              </div>
              <div className="rounded-xl border bg-card p-3 text-center">
                <p className="text-xl font-black">{customer.lastPurchaseAt ? new Date(customer.lastPurchaseAt).toLocaleDateString("en-LK", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Last Purchase</p>
              </div>
              {customer.notes && (
                <div className="rounded-xl border bg-muted/20 p-3">
                  <p className="text-xs font-semibold mb-1">Notes</p>
                  <p className="text-xs text-muted-foreground">{customer.notes}</p>
                </div>
              )}
              {(customer.dateOfBirth || customer.anniversary) && (
                <div className="flex gap-3">
                  {customer.dateOfBirth && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" /> DOB: {new Date(customer.dateOfBirth).toLocaleDateString("en-LK", { day: "2-digit", month: "short", year: "numeric" })}
                    </div>
                  )}
                  {customer.anniversary && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" /> Anniversary: {new Date(customer.anniversary).toLocaleDateString("en-LK", { day: "2-digit", month: "short", year: "numeric" })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {customer && tab === "purchases" && (
            <div className="space-y-2">
              {customer.sales.length === 0 && <p className="text-center text-muted-foreground py-12 text-sm">No purchases yet</p>}
              {customer.sales.map((sale) => (
                <div key={sale.id} className="flex items-center justify-between p-3 rounded-xl border hover:bg-muted/20 transition-colors">
                  <div>
                    <p className="text-sm font-semibold font-mono">{sale.invoiceNumber}</p>
                    <p className="text-xs text-muted-foreground">{new Date(sale.invoiceDate).toLocaleDateString("en-LK")} · {sale._count.items} items</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold">LKR {formatNumber(sale.total)}</p>
                    <Badge variant="success" className="text-[9px]">{sale.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}

          {customer && showLoyalty && tab === "loyalty" && (
            <div className="space-y-4">
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
                      <p className="text-[10px] text-muted-foreground">{new Date(txn.createdAt).toLocaleDateString("en-LK")}</p>
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
            <div className="space-y-4">
              <div className="rounded-xl border bg-emerald-500/5 p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Wallet Balance</p>
                  <p className="text-3xl font-black text-emerald-500">LKR {formatNumber(customer.walletBalance)}</p>
                </div>
                <Wallet className="h-10 w-10 text-emerald-500/30" />
              </div>
              <div className="flex gap-2">
                <Input type="number" min={1} step={0.01} placeholder="Top-up amount (LKR )…" value={walletInput}
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
                      <p className="text-[10px] text-muted-foreground">{new Date(txn.createdAt).toLocaleDateString("en-LK")}</p>
                    </div>
                    <span className={`font-bold text-sm ${txn.amount > 0 ? "text-emerald-500" : "text-red-500"}`}>
                      {txn.amount > 0 ? "+" : ""}LKR {formatNumber(txn.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {customer && tab === "credit" && (
            <div className="space-y-4">
              <div className="rounded-xl border bg-amber-500/5 p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Outstanding Credit</p>
                  <p className="text-3xl font-black text-amber-500">LKR {formatNumber(customer.creditBalance)}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Limit: LKR {formatNumber(customer.creditLimit)} · Available: LKR {formatNumber(Math.max(0, customer.creditLimit - customer.creditBalance))}
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
                <p className="text-xs font-semibold">Payment Terms (days)</p>
                <div className="flex gap-2">
                  <Input type="number" min={0} step={1} placeholder="e.g. 30" value={creditDaysInput}
                    onChange={(e) => setCreditDaysInput(e.target.value)} />
                  <Button onClick={saveCreditDays} disabled={actionLoading} variant="outline" className="shrink-0">Save</Button>
                </div>
                <p className="text-[10px] text-muted-foreground">Due date = sale date + credit days</p>
              </div>
              <div className="flex gap-2">
                  <Input type="number" min={0.01} step={0.01} placeholder="Payment / advance (LKR)…" value={creditPayInput}
                    onChange={(e) => setCreditPayInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && receiveCreditPayment()} />
                  <Button variant="warning" onClick={receiveCreditPayment} disabled={actionLoading || !creditPayInput} className="gap-1.5 shrink-0">
                    {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Receive
                  </Button>
                </div>
              {customer.creditBalance > 0 && customer.walletBalance > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={actionLoading}
                  onClick={applyWalletToCredit}
                  className="w-full gap-1.5"
                >
                  <Wallet className="h-3.5 w-3.5" />
                  Apply wallet advance to credit (LKR {formatNumber(Math.min(customer.creditBalance, customer.walletBalance))})
                </Button>
              )}
              <p className="text-[10px] text-muted-foreground">
                Overpay settles outstanding first; excess goes to wallet as prepaid advance.
              </p>
              <div className="space-y-2">
                {(customer.creditTxns ?? []).length === 0 && (
                  <p className="text-center text-muted-foreground py-6 text-sm">No credit transactions yet</p>
                )}
                {(customer.creditTxns ?? []).map((txn) => (
                  <div key={txn.id} className="flex items-center justify-between p-2.5 rounded-lg border text-sm">
                    <div>
                      <p className="font-medium text-xs">{txn.description ?? txn.type}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(txn.createdAt).toLocaleDateString("en-LK")}
                        {txn.dueDate ? ` · Due ${new Date(txn.dueDate).toLocaleDateString("en-LK")}` : ""}
                        {txn.status ? ` · ${txn.status}` : ""}
                      </p>
                    </div>
                    <span className={`font-bold text-sm ${txn.type === "PAYMENT" ? "text-emerald-500" : "text-amber-500"}`}>
                      {txn.type === "PAYMENT" ? "-" : "+"}LKR {formatNumber(txn.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {customer && tab === "vehicles" && (
            <div className="space-y-4">
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
      </div>
    </div>
  );
}
