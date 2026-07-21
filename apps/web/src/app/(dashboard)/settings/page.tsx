"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import {
  Store, Bell, Shield, Palette, CreditCard, GitBranch,
  User, Loader2, Plus, Pencil, Trash2, Check, X, Building2,
  Key, Globe, Phone, Mail, MapPin, Hash, Eye, EyeOff, ClipboardList, RefreshCw, ChevronLeft, ChevronRight,
  Printer, Image, Server, FileText, Upload, MessageCircle,
} from "lucide-react";
import { type ReceiptSettings, RECEIPT_DEFAULTS, notifyReceiptSettingsUpdated, setLocalPosTheme } from "@/lib/use-receipt-settings";
import { receiptThemeColors } from "@/lib/receipt-theme";
import { resolvePublicAssetUrl, uploadFile } from "@/lib/upload";
import { receiptInvoiceBarcodeHtml } from "@/lib/print-tag-document";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { APP_NAME, APP_VERSION } from "@/lib/constants";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import { api } from "@/lib/api";
import { useShopWorkspace, hasShopModule } from "@/lib/use-shop-profile";
import { PayslipSettingsTab } from "@/components/settings/payslip-settings-tab";
import { WhatsappSettingsTab } from "@/components/settings/whatsapp-settings-tab";
import {
  ACCENT_PRESETS,
  type AccentId,
  loadStoredAccent,
  persistAccent,
} from "@/lib/accent-theme";

type Tenant = {
  id: string; name: string; email: string; phone?: string;
  country: string; currency: string; timezone: string; plan: string; status: string;
};
type Branch = {
  id: string; name: string; code: string; address?: string; city?: string;
  state?: string; phone?: string; email?: string; isDefault: boolean;
  _count?: { users: number; inventory: number };
};
type Me = { id: string; firstName: string; lastName: string; email: string; phone?: string };

const TIMEZONES = ["Asia/Colombo","Asia/Kolkata","Asia/Dubai","Asia/Singapore","UTC","Europe/London","America/New_York"];
const CURRENCIES = ["LKR","INR","USD","EUR","GBP","AED","SGD"];
const COUNTRIES = ["LK","IN","US","GB","AE","SG","AU"];

const SETTINGS_TAB_VALUES = [
  "general", "receipt", "whatsapp", "payslip", "profile", "security", "branches",
  "notifications", "appearance", "billing", "audit-log",
] as const;

type SettingsTab = (typeof SETTINGS_TAB_VALUES)[number];

function parseSettingsTab(value: string | null): SettingsTab {
  if (value && SETTINGS_TAB_VALUES.includes(value as SettingsTab)) {
    return value as SettingsTab;
  }
  return "general";
}

interface AuditEntry { id:string; action:string; resource:string; resourceId?:string; userId?:string; user?:{firstName:string;lastName:string;email:string}|null; ipAddress?:string; createdAt:string; oldData?:object; newData?:object; }
interface LoginEntry { id:string; userName:string; email:string; ipAddress?:string; deviceName?:string; userAgent?:string; createdAt:string; lastUsedAt?:string; isActive:boolean; }

interface ReceiptPrintLogEntry {
  id: string;
  printType: string;
  invoiceNumber?: string | null;
  status: string;
  printMode: string;
  printServerUrl?: string | null;
  printerName?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  user?: { firstName: string; lastName: string; email: string } | null;
}

function ReceiptPrintLogCard() {
  const [logs, setLogs] = React.useState<ReceiptPrintLogEntry[]>([]);
  const [loading, setLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<{ data: ReceiptPrintLogEntry[] }>("/tenants/receipt-print/logs?limit=30");
      setLogs(r.data?.data ?? []);
    } catch {
      toast.error("Failed to load print logs");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const statusColor = (s: string) =>
    s === "SUCCESS" ? "text-emerald-600" : s === "FAILED" ? "text-destructive" : "text-amber-600";

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />Print Log
            </CardTitle>
            <CardDescription>Recent receipt print jobs from POS and test prints</CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}
        {!loading && logs.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">No print jobs logged yet</p>
        )}
        {!loading && logs.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="text-left py-2 pr-3">Time</th>
                  <th className="text-left py-2 pr-3">Type</th>
                  <th className="text-left py-2 pr-3">Invoice</th>
                  <th className="text-left py-2 pr-3">Mode</th>
                  <th className="text-left py-2 pr-3">Status</th>
                  <th className="text-left py-2">User</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-border/50 last:border-0">
                    <td className="py-2 pr-3 text-xs whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2 pr-3">{log.printType}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{log.invoiceNumber ?? "—"}</td>
                    <td className="py-2 pr-3 capitalize">{log.printMode}</td>
                    <td className={`py-2 pr-3 font-medium ${statusColor(log.status)}`}>
                      {log.status}
                      {log.errorMessage && (
                        <span className="block text-[10px] text-muted-foreground font-normal truncate max-w-[140px]" title={log.errorMessage}>
                          {log.errorMessage}
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-xs">
                      {log.user ? `${log.user.firstName} ${log.user.lastName}`.trim() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LoginHistoryCard() {
  const [logs, setLogs] = React.useState<LoginEntry[]>([]);
  const [loading, setLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<{ data: LoginEntry[] }>("/audit-logs/login-history?limit=20");
      setLogs(r.data?.data ?? []);
    } catch { toast.error("Failed to load login history"); }
    finally { setLoading(false); }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2"><Shield className="h-4 w-4 text-primary"/>Login History</CardTitle>
            <CardDescription>Recent sign-in sessions for your team</CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}/>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading && <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary"/></div>}
        {!loading && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="text-left py-2 pr-3">User</th>
                  <th className="text-left py-2 pr-3">IP</th>
                  <th className="text-left py-2 pr-3">Device</th>
                  <th className="text-left py-2 pr-3">Signed in</th>
                  <th className="text-left py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="border-b hover:bg-muted/30">
                    <td className="py-2 pr-3">
                      <p className="font-medium text-xs">{l.userName}</p>
                      <p className="text-[10px] text-muted-foreground">{l.email}</p>
                    </td>
                    <td className="py-2 pr-3 text-xs font-mono text-muted-foreground">{l.ipAddress ?? "—"}</td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground truncate max-w-[120px]">{l.deviceName ?? l.userAgent?.slice(0, 30) ?? "—"}</td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground whitespace-nowrap">{new Date(l.createdAt).toLocaleString()}</td>
                    <td className="py-2">
                      <Badge variant={l.isActive ? "success" : "secondary"} className="text-[10px]">{l.isActive ? "Active" : "Ended"}</Badge>
                    </td>
                  </tr>
                ))}
                {!logs.length && <tr><td colSpan={5} className="py-8 text-center text-muted-foreground text-sm">No login sessions recorded yet</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AuditLogTab() {
  const [logs, setLogs] = React.useState<AuditEntry[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [search, setSearch] = React.useState("");
  const [resource, setResource] = React.useState("");

  const load = React.useCallback(async (p=1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page:String(p), limit:"25" });
      if (search) params.set("action", search);
      if (resource) params.set("resource", resource);
      const r = await api.get<{data:AuditEntry[];total:number}>(`/audit-logs?${params}`);
      setLogs(r.data?.data ?? []);
      setTotal(r.data?.total ?? 0);
      setPage(p);
    } catch { toast.error("Failed to load audit logs"); }
    finally { setLoading(false); }
  }, [search, resource]);

  React.useEffect(() => { load(1); }, [load]);

  const totalPages = Math.ceil(total / 25);
  const ACTION_COLORS: Record<string,string> = { CREATE:"bg-emerald-500/15 text-emerald-500", UPDATE:"bg-blue-500/15 text-blue-500", DELETE:"bg-red-500/15 text-red-500", DAY_END:"bg-violet-500/15 text-violet-500" };

  return (
    <TabsContent value="audit-log" className="mt-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><ClipboardList className="h-4 w-4 text-primary"/>Audit Log</CardTitle>
          <CardDescription>System activity and change history</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2 flex-wrap">
            <Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Filter by action..." className="w-48 h-9 text-sm"/>
            <Input value={resource} onChange={e=>setResource(e.target.value)} placeholder="Filter by resource..." className="w-48 h-9 text-sm"/>
            <Button size="sm" variant="outline" onClick={()=>load(1)} disabled={loading}><RefreshCw className={`h-3.5 w-3.5 ${loading?"animate-spin":""}`}/></Button>
          </div>
          {loading&&<div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary"/></div>}
          {!loading&&(
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left py-2 pr-3">Action</th>
                    <th className="text-left py-2 pr-3">Resource</th>
                    <th className="text-left py-2 pr-3">User</th>
                    <th className="text-left py-2 pr-3">IP</th>
                    <th className="text-left py-2">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(l=>(
                    <tr key={l.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="py-2 pr-3"><span className={`text-xs font-bold px-2 py-0.5 rounded-full ${ACTION_COLORS[l.action]??"bg-muted text-muted-foreground"}`}>{l.action}</span></td>
                      <td className="py-2 pr-3 text-sm font-medium">{l.resource}{l.resourceId&&<span className="text-xs text-muted-foreground ml-1">#{l.resourceId.slice(-6)}</span>}</td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground">{l.user?`${l.user.firstName} ${l.user.lastName}`:l.userId?"User":"System"}</td>
                      <td className="py-2 pr-3 text-xs font-mono text-muted-foreground">{l.ipAddress??"-"}</td>
                      <td className="py-2 text-xs text-muted-foreground">{new Date(l.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                  {!logs.length&&<tr><td colSpan={5} className="py-8 text-center text-muted-foreground">No audit logs found</td></tr>}
                </tbody>
              </table>
            </div>
          )}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-muted-foreground">Page {page} of {totalPages} · {total} entries</span>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" disabled={page<=1} onClick={()=>load(page-1)}><ChevronLeft className="h-3.5 w-3.5"/></Button>
                <Button size="sm" variant="outline" disabled={page>=totalPages} onClick={()=>load(page+1)}><ChevronRight className="h-3.5 w-3.5"/></Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </TabsContent>
  );
}

function ReceiptPreview({ s, cashier }: { s: ReceiptSettings; cashier: string }) {
  const fs = s.fontSize === "small" ? "10px" : s.fontSize === "large" ? "14px" : "12px";
  const logoSrc = resolvePublicAssetUrl(s.logoUrl);
  const c = receiptThemeColors(s.receiptTheme);
  const rule = { borderTop: `1px dashed ${c.rule}`, margin: "6px 0" } as const;
  const row = { display: "flex", justifyContent: "space-between", fontSize: "0.85em", color: c.fg } as const;
  return (
    <div style={{ fontFamily: "'Courier New', monospace", fontSize: fs, padding: "12px", background: c.bg, color: c.fg, maxWidth: s.paperWidth === "58mm" ? "220px" : "300px", margin: "0 auto", border: `1px dashed ${c.rule}` }}>
      {logoSrc && <img src={logoSrc} alt="logo" style={{ maxWidth: "80px", display: "block", margin: "0 auto 4px" }} />}
      <div style={{ textAlign: "center", fontWeight: 900, fontSize: "1.3em" }}>{s.shopName || "Shop Name"}</div>
      {s.tagline && <div style={{ textAlign: "center", fontSize: "0.85em", marginBottom: 2, color: c.muted }}>{s.tagline}</div>}
      {s.address1 && <div style={{ textAlign: "center", fontSize: "0.85em", color: c.muted }}>{s.address1}</div>}
      {s.address2 && <div style={{ textAlign: "center", fontSize: "0.85em", color: c.muted }}>{s.address2}</div>}
      {s.phone && <div style={{ textAlign: "center", fontSize: "0.85em", color: c.muted }}>{s.phone}</div>}
      {s.email && <div style={{ textAlign: "center", fontSize: "0.85em", color: c.muted }}>{s.email}</div>}
      {s.website && <div style={{ textAlign: "center", fontSize: "0.85em", color: c.muted }}>{s.website}</div>}
      {s.headerText && <div style={{ textAlign: "center", fontSize: "0.85em", marginTop: 4, fontStyle: "italic", color: c.muted }}>{s.headerText}</div>}
      <div style={rule} />
      <div style={row}><span>Invoice:</span><span><b>INV-00001</b></span></div>
      <div style={row}><span>Date:</span><span>{new Date().toLocaleDateString()}</span></div>
      {s.showCashier && <div style={row}><span>Cashier:</span><span>{cashier || "Admin"}</span></div>}
      {s.showCustomer && <div style={row}><span>Customer:</span><span>Walk-in</span></div>}
      <div style={rule} />
      <div style={{ fontSize: "0.8em", fontWeight: "bold", marginBottom: 2 }}>ITEMS</div>
      <div style={{ fontSize: "0.85em", fontWeight: "bold" }}>Sample T-Shirt (Blue / L)</div>
      <div style={row}><span>2 x LKR 1,500.00</span><span>LKR 3,000.00</span></div>
      <div style={rule} />
      <div style={row}><span>Subtotal</span><span>LKR 3,000.00</span></div>
      {s.showDiscount && <div style={row}><span>Discount</span><span>-LKR 200.00</span></div>}
      {s.showTax && <div style={row}><span>Tax (5%)</span><span>LKR 140.00</span></div>}
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "1.1em", fontWeight: 900, borderTop: `2px solid ${c.rule}`, paddingTop: 4, marginTop: 4, color: c.fg }}><span>TOTAL</span><span>LKR 2,940.00</span></div>
      <div style={rule} />
      <div style={row}><span>Payment</span><span><b>CASH</b></span></div>
      {s.showBarcode && (
        <div
          style={{ textAlign: "center", margin: "8px 0 4px", padding: 6, background: c.barcodePad, borderRadius: 2 }}
          dangerouslySetInnerHTML={{ __html: receiptInvoiceBarcodeHtml("INV-00001", s.paperWidth) }}
        />
      )}
      <div style={{ textAlign: "center", marginTop: 8, fontSize: "0.8em", lineHeight: 1.6, color: c.muted }}>{s.footerText}</div>
    </div>
  );
}

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const { theme, setTheme } = useTheme();
  const [accent, setAccent] = React.useState<AccentId>("blue");
  React.useEffect(() => { setAccent(loadStoredAccent()); }, []);
  const pickAccent = (id: AccentId) => {
    setAccent(id);
    persistAccent(id);
    toast.success(`Accent set to ${ACCENT_PRESETS.find((p) => p.id === id)?.name ?? id}`);
  };
  const { profile } = useShopWorkspace();
  const showLoyalty = hasShopModule(profile, 'loyalty');
  const [activeTab, setActiveTab] = React.useState<SettingsTab>(() =>
    parseSettingsTab(searchParams.get("tab")),
  );

  React.useEffect(() => {
    setActiveTab(parseSettingsTab(searchParams.get("tab")));
  }, [searchParams]);

  const [tenant, setTenant] = React.useState<Tenant | null>(null);
  const [bizForm, setBizForm] = React.useState({ name: "", phone: "", country: "", currency: "", timezone: "" });
  const [bizSaving, setBizSaving] = React.useState(false);

  const [me, setMe] = React.useState<Me | null>(null);
  const [profileForm, setProfileForm] = React.useState({ firstName: "", lastName: "", phone: "" });
  const [profileSaving, setProfileSaving] = React.useState(false);

  const [pwForm, setPwForm] = React.useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [pwSaving, setPwSaving] = React.useState(false);
  const [showPw, setShowPw] = React.useState({ current: false, newPw: false, confirm: false });

  const [receiptForm, setReceiptForm] = React.useState<ReceiptSettings>(RECEIPT_DEFAULTS);
  const [receiptSaving, setReceiptSaving] = React.useState(false);
  const [printServerTesting, setPrintServerTesting] = React.useState(false);
  const [logoUploading, setLogoUploading] = React.useState(false);
  const logoInputRef = React.useRef<HTMLInputElement>(null);

  const [posForm, setPosForm] = React.useState({
    allowNegativeStock: true,
    autoPrint: false,
    roundOff: true,
    loyalty: true,
  });
  const [posSaving, setPosSaving] = React.useState(false);

  const [branches, setBranches] = React.useState<Branch[]>([]);
  const [branchesLoading, setBranchesLoading] = React.useState(false);
  const [branchModal, setBranchModal] = React.useState<{ open: boolean; editing: Branch | null }>({ open: false, editing: null });
  const [branchForm, setBranchForm] = React.useState({ name: "", code: "", address: "", city: "", state: "", phone: "", email: "" });
  const [branchSaving, setBranchSaving] = React.useState(false);

  React.useEffect(() => {
    api.get<Tenant>("/tenants/me").then(r => {
      const t = r.data;
      setTenant(t);
      setBizForm({ name: t.name ?? "", phone: t.phone ?? "", country: t.country ?? "", currency: t.currency ?? "", timezone: t.timezone ?? "" });
    }).catch(() => toast.error("Failed to load business settings"));

    api.get<Me>("/auth/me").then(r => {
      const u = r.data;
      setMe(u);
      setProfileForm({ firstName: u.firstName ?? "", lastName: u.lastName ?? "", phone: u.phone ?? "" });
    }).catch(() => toast.error("Failed to load profile"));

    api.get<ReceiptSettings>("/tenants/receipt-settings").then(r => {
      setReceiptForm({ ...RECEIPT_DEFAULTS, ...r.data });
    }).catch(() => toast.error("Failed to load receipt settings"));

    api.get<{
      allowNegativeStock?: boolean;
      autoPrint?: boolean;
      roundOff?: boolean;
      loyalty?: boolean;
    }>("/tenants/pos-settings").then((r) => {
      setPosForm({
        allowNegativeStock: Boolean(r.data?.allowNegativeStock),
        autoPrint: Boolean(r.data?.autoPrint),
        roundOff: r.data?.roundOff !== false,
        loyalty: r.data?.loyalty !== false,
      });
    }).catch(() => { /* optional */ });

    loadBranches();
  }, []);

  async function saveReceipt() {
    setReceiptSaving(true);
    try {
      await api.put("/tenants/receipt-settings", receiptForm);
      try { localStorage.setItem("receipt_settings_cache", JSON.stringify(receiptForm)); } catch { /* noop */ }
      if (receiptForm.receiptTheme === "light" || receiptForm.receiptTheme === "dark") {
        setLocalPosTheme(receiptForm.receiptTheme);
      }
      notifyReceiptSettingsUpdated();
      toast.success("Receipt settings saved");
    } catch { toast.error("Failed to save receipt settings"); }
    finally { setReceiptSaving(false); }
  }

  async function testPrintServer() {
    setPrintServerTesting(true);
    try {
      await api.post("/tenants/receipt-print/test-server");
      toast.success("Print server connected — test job sent");
    } catch (e) {
      toast.error((e as Error).message ?? "Print server test failed");
    } finally {
      setPrintServerTesting(false);
    }
  }

  async function onLogoFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ["image/png", "image/jpeg", "image/webp", "image/gif"];
    if (!allowed.includes(file.type)) {
      toast.error("Use PNG, JPG, WEBP or GIF");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Logo must be under 2MB");
      return;
    }
    setLogoUploading(true);
    try {
      const uploaded = await uploadFile(file, "receipts");
      setReceiptForm((f) => ({ ...f, logoUrl: uploaded.url }));
      toast.success("Logo uploaded — save settings to apply on receipts");
    } catch (err) {
      toast.error((err as Error).message ?? "Logo upload failed");
    } finally {
      setLogoUploading(false);
      e.target.value = "";
    }
  }

  async function loadBranches() {
    setBranchesLoading(true);
    try {
      const r = await api.get<{ data: Branch[] } | Branch[]>("/branches?limit=50");
      setBranches(Array.isArray(r.data) ? r.data : r.data.data);
    } catch { toast.error("Failed to load branches"); }
    finally { setBranchesLoading(false); }
  }

  async function saveBiz() {
    setBizSaving(true);
    try {
      await api.put("/tenants/me", { companyName: bizForm.name, phone: bizForm.phone, country: bizForm.country, currency: bizForm.currency, timezone: bizForm.timezone });
      toast.success("Business info updated");
    } catch { toast.error("Failed to save"); }
    finally { setBizSaving(false); }
  }

  async function saveProfile() {
    if (!me) return;
    setProfileSaving(true);
    try {
      await api.patch(`/users/${me.id}`, profileForm);
      setMe(prev => prev ? { ...prev, ...profileForm } : prev);
      toast.success("Profile updated");
    } catch { toast.error("Failed to update profile"); }
    finally { setProfileSaving(false); }
  }

  async function changePassword() {
    if (pwForm.newPassword !== pwForm.confirmPassword) { toast.error("Passwords do not match"); return; }
    if (pwForm.newPassword.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    setPwSaving(true);
    try {
      await api.post("/auth/change-password", { currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword });
      setPwForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      toast.success("Password changed successfully");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to change password");
    } finally { setPwSaving(false); }
  }

  function openBranchModal(branch?: Branch) {
    setBranchModal({ open: true, editing: branch ?? null });
    setBranchForm(branch ? { name: branch.name, code: branch.code, address: branch.address ?? "", city: branch.city ?? "", state: branch.state ?? "", phone: branch.phone ?? "", email: branch.email ?? "" } : { name: "", code: "", address: "", city: "", state: "", phone: "", email: "" });
  }

  async function saveBranch() {
    if (!branchForm.name || !branchForm.code) { toast.error("Name and code are required"); return; }
    setBranchSaving(true);
    try {
      if (branchModal.editing) {
        await api.put(`/branches/${branchModal.editing.id}`, branchForm);
        toast.success("Branch updated");
      } else {
        await api.post("/branches", branchForm);
        toast.success("Branch created");
      }
      setBranchModal({ open: false, editing: null });
      loadBranches();
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Failed to save branch"); }
    finally { setBranchSaving(false); }
  }

  async function deleteBranch(id: string) {
    if (!confirm("Delete this branch?")) return;
    try {
      await api.delete(`/branches/${id}`);
      toast.success("Branch deleted");
      loadBranches();
    } catch { toast.error("Cannot delete branch — it may have users or inventory"); }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">Configure your {APP_NAME} workspace · {profile.emoji} {profile.label}</p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(parseSettingsTab(v))}>
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="general" className="gap-1.5"><Store className="h-3.5 w-3.5" />General</TabsTrigger>
          <TabsTrigger value="receipt" className="gap-1.5"><Printer className="h-3.5 w-3.5" />Receipt Print</TabsTrigger>
          <TabsTrigger value="whatsapp" className="gap-1.5"><MessageCircle className="h-3.5 w-3.5" />WhatsApp</TabsTrigger>
          <TabsTrigger value="payslip" className="gap-1.5"><FileText className="h-3.5 w-3.5" />Payslip</TabsTrigger>
          <TabsTrigger value="profile" className="gap-1.5"><User className="h-3.5 w-3.5" />My Profile</TabsTrigger>
          <TabsTrigger value="security" className="gap-1.5"><Shield className="h-3.5 w-3.5" />Security</TabsTrigger>
          <TabsTrigger value="branches" className="gap-1.5"><GitBranch className="h-3.5 w-3.5" />Branches</TabsTrigger>
          <TabsTrigger value="notifications" className="gap-1.5"><Bell className="h-3.5 w-3.5" />Notifications</TabsTrigger>
          <TabsTrigger value="appearance" className="gap-1.5"><Palette className="h-3.5 w-3.5" />Appearance</TabsTrigger>
          <TabsTrigger value="billing" className="gap-1.5"><CreditCard className="h-3.5 w-3.5" />Billing</TabsTrigger>
          <TabsTrigger value="audit-log" className="gap-1.5"><ClipboardList className="h-3.5 w-3.5" />Audit Log</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-6 space-y-6">
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-sm">Business Type QA Audit</p>
                <p className="text-xs text-muted-foreground">Scan all pages for {profile.label} before production go-live</p>
              </div>
              <Button variant="outline" size="sm" asChild>
                <a href="/settings/vertical-audit">Open audit checklist →</a>
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" />Business Information</CardTitle>
              <CardDescription>Details about your business synced from server</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5"><Store className="h-3.5 w-3.5" />Business Name</Label>
                  <Input value={bizForm.name} onChange={e => setBizForm(f => ({ ...f, name: e.target.value }))} placeholder="My Shop Name" />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />Phone</Label>
                  <Input value={bizForm.phone} onChange={e => setBizForm(f => ({ ...f, phone: e.target.value }))} placeholder="+94 77 123 4567" />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5"><Globe className="h-3.5 w-3.5" />Country</Label>
                  <select value={bizForm.country} onChange={e => setBizForm(f => ({ ...f, country: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                    {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5"><Hash className="h-3.5 w-3.5" />Currency</Label>
                  <select value={bizForm.currency} onChange={e => setBizForm(f => ({ ...f, currency: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label className="flex items-center gap-1.5"><Globe className="h-3.5 w-3.5" />Timezone</Label>
                  <select value={bizForm.timezone} onChange={e => setBizForm(f => ({ ...f, timezone: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                    {TIMEZONES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              {tenant && (
                <div className="flex items-center gap-3 pt-1 text-xs text-muted-foreground">
                  <span>Plan: <Badge variant="outline" className="text-xs">{tenant.plan}</Badge></span>
                  <span>Status: <Badge variant={tenant.status === "ACTIVE" ? "default" : "secondary"} className="text-xs">{tenant.status}</Badge></span>
                </div>
              )}
              <Button variant="gradient" size="sm" onClick={saveBiz} disabled={bizSaving}>
                {bizSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Check className="h-3.5 w-3.5 mr-1.5" />}Save Changes
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">POS Configuration</CardTitle>
              <CardDescription>Point of sale terminal settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { key: "autoPrint" as const, label: "Auto-print receipt after sale", desc: "Automatically print receipt on checkout" },
                { key: "roundOff" as const, label: "Round off totals", desc: "Round total amount to nearest unit" },
                { key: "allowNegativeStock" as const, label: "Allow negative stock", desc: "Enable sales even when stock is 0 (inventory can go minus)" },
                ...(showLoyalty ? [{ key: "loyalty" as const, label: "Loyalty points on every sale", desc: "Auto-apply loyalty program" }] : []),
              ].map((s) => (
                <div key={s.key} className="flex items-center justify-between py-0.5">
                  <div>
                    <p className="text-sm font-medium">{s.label}</p>
                    <p className="text-xs text-muted-foreground">{s.desc}</p>
                  </div>
                  <Switch
                    checked={posForm[s.key]}
                    disabled={posSaving}
                    onCheckedChange={(v) => {
                      const next = { ...posForm, [s.key]: v };
                      setPosForm(next);
                      setPosSaving(true);
                      api.put("/tenants/pos-settings", next)
                        .then(() => {
                          if (s.key === "allowNegativeStock") {
                            try { localStorage.setItem("pos_allow_negative_stock", v ? "1" : "0"); } catch { /* noop */ }
                          }
                          toast.success("POS settings saved");
                        })
                        .catch(() => {
                          setPosForm(posForm);
                          toast.error("Failed to save — admin permission required");
                        })
                        .finally(() => setPosSaving(false));
                    }}
                  />
                </div>
              ))}
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                {posSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                {posSaving ? "Saving…" : "Changes save automatically"}
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="receipt" className="mt-6">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* ── Form ── */}
            <div className="space-y-5">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2"><Store className="h-4 w-4 text-primary" />Shop Identity</CardTitle>
                  <CardDescription>Appears at the top of every printed receipt</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5 col-span-2">
                      <Label>Shop Name</Label>
                      <Input value={receiptForm.shopName} onChange={e => setReceiptForm(f => ({ ...f, shopName: e.target.value }))} placeholder="My Shop Name" />
                    </div>
                    <div className="space-y-1.5 col-span-2">
                      <Label>Tagline</Label>
                      <Input value={receiptForm.tagline} onChange={e => setReceiptForm(f => ({ ...f, tagline: e.target.value }))} placeholder="Quality you can feel" />
                    </div>
                    <div className="space-y-2 col-span-2">
                      <Label className="flex items-center gap-1.5">
                        <Image className="h-3.5 w-3.5" />Shop Logo
                      </Label>
                      <div className="flex items-start gap-4 rounded-lg border border-border p-3 bg-muted/20">
                        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border bg-background overflow-hidden">
                          {receiptForm.logoUrl ? (
                            <img
                              src={resolvePublicAssetUrl(receiptForm.logoUrl)}
                              alt="Shop logo"
                              className="max-h-full max-w-full object-contain p-1"
                            />
                          ) : (
                            <Image className="h-8 w-8 text-muted-foreground/50" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0 space-y-2">
                          <input
                            ref={logoInputRef}
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/gif"
                            className="hidden"
                            onChange={onLogoFileSelected}
                          />
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={logoUploading}
                              onClick={() => logoInputRef.current?.click()}
                            >
                              {logoUploading ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                              ) : (
                                <Upload className="h-4 w-4 mr-1.5" />
                              )}
                              {logoUploading ? "Uploading…" : "Upload logo"}
                            </Button>
                            {receiptForm.logoUrl && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setReceiptForm((f) => ({ ...f, logoUrl: "" }))}
                              >
                                <X className="h-4 w-4 mr-1" /> Remove
                              </Button>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            PNG, JPG or WEBP — max 2MB. Displays ~80px wide on printed receipts.
                          </p>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Or paste image URL</Label>
                            <Input
                              value={receiptForm.logoUrl}
                              onChange={(e) => setReceiptForm((f) => ({ ...f, logoUrl: e.target.value }))}
                              placeholder="https://… or /uploads/…"
                              className="h-8 text-xs"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-1.5 col-span-2">
                      <Label className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />Address Line 1</Label>
                      <Input value={receiptForm.address1} onChange={e => setReceiptForm(f => ({ ...f, address1: e.target.value }))} placeholder="123 Main Street, Colombo" />
                    </div>
                    <div className="space-y-1.5 col-span-2">
                      <Label>Address Line 2</Label>
                      <Input value={receiptForm.address2} onChange={e => setReceiptForm(f => ({ ...f, address2: e.target.value }))} placeholder="Western Province, Sri Lanka" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />Phone</Label>
                      <Input value={receiptForm.phone} onChange={e => setReceiptForm(f => ({ ...f, phone: e.target.value }))} placeholder="+94 11 234 5678" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />Email</Label>
                      <Input value={receiptForm.email} onChange={e => setReceiptForm(f => ({ ...f, email: e.target.value }))} placeholder="hello@mystore.com" />
                    </div>
                    <div className="space-y-1.5 col-span-2">
                      <Label className="flex items-center gap-1.5"><Globe className="h-3.5 w-3.5" />Website</Label>
                      <Input value={receiptForm.website} onChange={e => setReceiptForm(f => ({ ...f, website: e.target.value }))} placeholder="www.mystore.com" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Message &amp; Layout</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>Header Message <span className="text-muted-foreground">(below address)</span></Label>
                    <Input value={receiptForm.headerText} onChange={e => setReceiptForm(f => ({ ...f, headerText: e.target.value }))} placeholder="Promotions valid until June 30" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Footer Message <span className="text-muted-foreground">(bottom of receipt)</span></Label>
                    <Input value={receiptForm.footerText} onChange={e => setReceiptForm(f => ({ ...f, footerText: e.target.value }))} placeholder="Thank you for shopping with us!" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Paper Width</Label>
                      <select value={receiptForm.paperWidth} onChange={e => setReceiptForm(f => ({ ...f, paperWidth: e.target.value as "58mm" | "80mm" }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                        <option value="58mm">58 mm (narrow)</option>
                        <option value="80mm">80 mm (standard)</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Font Size</Label>
                      <select value={receiptForm.fontSize} onChange={e => setReceiptForm(f => ({ ...f, fontSize: e.target.value as "small"|"medium"|"large" }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                        <option value="small">Small</option>
                        <option value="medium">Medium</option>
                        <option value="large">Large</option>
                      </select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Receipt theme</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        { value: "light" as const, label: "Light", desc: "Black on white — thermal printer" },
                        { value: "dark" as const, label: "Dark", desc: "White on navy — digital / preview" },
                      ]).map((opt) => {
                        const active = (receiptForm.receiptTheme ?? "light") === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setReceiptForm((f) => ({ ...f, receiptTheme: opt.value }))}
                            className={`rounded-xl border px-3 py-2.5 text-left transition-all ${active ? "border-primary bg-primary/10" : "border-border hover:border-primary/40"}`}
                          >
                            <p className={`text-sm font-semibold ${active ? "text-primary" : ""}`}>{opt.label}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">{opt.desc}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Show / Hide Sections</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  {([
                    { key: "showTax",      label: "Tax line",       desc: "Show tax amount on receipt" },
                    { key: "showDiscount", label: "Discount line",   desc: "Show discount amount" },
                    { key: "showCashier",  label: "Cashier name",    desc: "Show who processed the sale" },
                    { key: "showCustomer", label: "Customer name",   desc: "Show customer if assigned" },
                    { key: "showBarcode",  label: "Invoice barcode", desc: "Print scannable barcode at bottom" },
                  ] as { key: keyof ReceiptSettings; label: string; desc: string }[]).map(item => (
                    <div key={item.key} className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
                      <div>
                        <p className="text-sm font-medium">{item.label}</p>
                        <p className="text-xs text-muted-foreground">{item.desc}</p>
                      </div>
                      <Switch
                        checked={receiptForm[item.key] as boolean}
                        onCheckedChange={v => setReceiptForm(f => ({ ...f, [item.key]: v }))}
                      />
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Server className="h-4 w-4 text-primary" />Store Print Server
                  </CardTitle>
                  <CardDescription>
                    Run the print server on your shop PC (same network as the thermal printer). POS sends jobs through the cloud API to this local server.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between py-1">
                    <div>
                      <p className="text-sm font-medium">Enable store print server</p>
                      <p className="text-xs text-muted-foreground">Send receipts to LAN print server instead of browser only</p>
                    </div>
                    <Switch
                      checked={receiptForm.printServerEnabled}
                      onCheckedChange={(v) => setReceiptForm((f) => ({ ...f, printServerEnabled: v }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Print server URL</Label>
                    <Input
                      value={receiptForm.printServerUrl}
                      onChange={(e) => setReceiptForm((f) => ({ ...f, printServerUrl: e.target.value.trim() }))}
                      placeholder="http://192.168.1.50:9123"
                    />
                    <p className="text-xs text-muted-foreground">
                      Shop PC IP + port — run <code className="text-[11px] bg-muted px-1 rounded">node services/print-server/server.js</code>
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>API key</Label>
                      <Input
                        type="password"
                        value={receiptForm.printServerKey}
                        onChange={(e) => setReceiptForm((f) => ({ ...f, printServerKey: e.target.value }))}
                        placeholder="Same as PRINT_API_KEY on shop PC"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Printer name (optional)</Label>
                      <Input
                        value={receiptForm.printerName}
                        onChange={(e) => setReceiptForm((f) => ({ ...f, printerName: e.target.value }))}
                        placeholder="Counter-1 / Epson TM-T82"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Print mode</Label>
                      <select
                        value={receiptForm.printMode}
                        onChange={(e) => setReceiptForm((f) => ({ ...f, printMode: e.target.value as ReceiptSettings["printMode"] }))}
                        className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="auto">Auto — server first, browser fallback</option>
                        <option value="server">Server only</option>
                        <option value="browser">Browser popup only</option>
                      </select>
                    </div>
                    <div className="flex items-end">
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={testPrintServer}
                        disabled={printServerTesting || !receiptForm.printServerUrl}
                      >
                        {printServerTesting ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                        ) : (
                          <Printer className="h-3.5 w-3.5 mr-1.5" />
                        )}
                        Test print server
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between py-1 border-t border-border pt-3">
                    <div>
                      <p className="text-sm font-medium">Auto-print after sale</p>
                      <p className="text-xs text-muted-foreground">Print receipt automatically when POS checkout completes</p>
                    </div>
                    <Switch
                      checked={receiptForm.autoPrintAfterSale}
                      onCheckedChange={(v) => setReceiptForm((f) => ({ ...f, autoPrintAfterSale: v }))}
                    />
                  </div>
                </CardContent>
              </Card>

              <Button variant="gradient" onClick={saveReceipt} disabled={receiptSaving}>
                {receiptSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Check className="h-3.5 w-3.5 mr-1.5" />}
                Save Receipt Settings
              </Button>
            </div>

            {/* ── Live Preview ── */}
            <div className="space-y-3">
              <Card className="sticky top-6">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2"><Printer className="h-4 w-4 text-primary" />Live Preview</CardTitle>
                  <CardDescription>Updates as you type — this is how your receipt will look</CardDescription>
                </CardHeader>
                <CardContent>
                  <ReceiptPreview s={receiptForm} cashier={me ? `${me.firstName} ${me.lastName}`.trim() : "Admin"} />
                </CardContent>
              </Card>
            </div>
          </div>
          <ReceiptPrintLogCard />
        </TabsContent>

        <TabsContent value="whatsapp" className="mt-6">
          <WhatsappSettingsTab />
        </TabsContent>

        <TabsContent value="payslip">
          <PayslipSettingsTab receiptSettings={receiptForm} />
        </TabsContent>

        <TabsContent value="profile" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><User className="h-4 w-4 text-primary" />Personal Information</CardTitle>
              <CardDescription>Your name and contact details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>First Name</Label>
                  <Input value={profileForm.firstName} onChange={e => setProfileForm(f => ({ ...f, firstName: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Last Name</Label>
                  <Input value={profileForm.lastName} onChange={e => setProfileForm(f => ({ ...f, lastName: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />Email</Label>
                  <Input value={me?.email ?? ""} disabled className="opacity-60" />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />Phone</Label>
                  <Input value={profileForm.phone} onChange={e => setProfileForm(f => ({ ...f, phone: e.target.value }))} placeholder="+94 77 123 4567" />
                </div>
              </div>
              <Button variant="gradient" size="sm" onClick={saveProfile} disabled={profileSaving}>
                {profileSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Check className="h-3.5 w-3.5 mr-1.5" />}Update Profile
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Key className="h-4 w-4 text-primary" />Change Password</CardTitle>
              <CardDescription>Update your login password</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {(["currentPassword","newPassword","confirmPassword"] as const).map((field) => {
                const labels = { currentPassword: "Current Password", newPassword: "New Password", confirmPassword: "Confirm New Password" };
                const showKey = field === "currentPassword" ? "current" : field === "newPassword" ? "newPw" : "confirm";
                return (
                  <div key={field} className="space-y-2">
                    <Label>{labels[field]}</Label>
                    <div className="relative">
                      <Input
                        type={showPw[showKey as keyof typeof showPw] ? "text" : "password"}
                        placeholder="••••••••"
                        value={pwForm[field]}
                        onChange={e => setPwForm(f => ({ ...f, [field]: e.target.value }))}
                        className="pr-9"
                      />
                      <button type="button" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowPw(s => ({ ...s, [showKey]: !s[showKey as keyof typeof showPw] }))}>
                        {showPw[showKey as keyof typeof showPw] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                );
              })}
              {pwForm.newPassword && pwForm.confirmPassword && pwForm.newPassword !== pwForm.confirmPassword && (
                <p className="text-xs text-destructive flex items-center gap-1"><X className="h-3 w-3" />Passwords do not match</p>
              )}
              <Separator />
              <Button variant="gradient" size="sm" onClick={changePassword} disabled={pwSaving || !pwForm.currentPassword || !pwForm.newPassword}>
                {pwSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Shield className="h-3.5 w-3.5 mr-1.5" />}Change Password
              </Button>
            </CardContent>
          </Card>
          <LoginHistoryCard />
        </TabsContent>

        <TabsContent value="branches" className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Branches</h3>
              <p className="text-sm text-muted-foreground">{branches.length} branch{branches.length !== 1 ? "es" : ""} configured</p>
            </div>
            <Button variant="gradient" size="sm" onClick={() => openBranchModal()}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />Add Branch
            </Button>
          </div>

          {branchesLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="grid gap-3">
              {branches.map(b => (
                <Card key={b.id} className="hover:border-primary/40 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                          <GitBranch className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm">{b.name}</p>
                            {b.isDefault && <Badge variant="default" className="text-xs px-1.5 py-0">Default</Badge>}
                          </div>
                          <p className="text-xs text-muted-foreground">Code: {b.code}</p>
                          {(b.city || b.address) && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                              <MapPin className="h-3 w-3" />{[b.address, b.city, b.state].filter(Boolean).join(", ")}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        {b._count && <span className="mr-3">{b._count.users} users · {b._count.inventory} items</span>}
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openBranchModal(b)}><Pencil className="h-3.5 w-3.5" /></Button>
                        {!b.isDefault && <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deleteBranch(b.id)}><Trash2 className="h-3.5 w-3.5" /></Button>}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {branches.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">No branches found</p>}
            </div>
          )}

          {branchModal.open && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
              <Card className="w-full max-w-lg">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{branchModal.editing ? "Edit Branch" : "New Branch"}</CardTitle>
                    <button onClick={() => setBranchModal({ open: false, editing: null })} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Branch Name *</Label>
                      <Input value={branchForm.name} onChange={e => setBranchForm(f => ({ ...f, name: e.target.value }))} placeholder="Main Store" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Code *</Label>
                      <Input value={branchForm.code} onChange={e => setBranchForm(f => ({ ...f, code: e.target.value }))} placeholder="HO-001" />
                    </div>
                    <div className="space-y-1.5 col-span-2">
                      <Label>Address</Label>
                      <Input value={branchForm.address} onChange={e => setBranchForm(f => ({ ...f, address: e.target.value }))} placeholder="123, Main Street" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>City</Label>
                      <Input value={branchForm.city} onChange={e => setBranchForm(f => ({ ...f, city: e.target.value }))} placeholder="Colombo" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>State / Province</Label>
                      <Input value={branchForm.state} onChange={e => setBranchForm(f => ({ ...f, state: e.target.value }))} placeholder="Western" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Phone</Label>
                      <Input value={branchForm.phone} onChange={e => setBranchForm(f => ({ ...f, phone: e.target.value }))} placeholder="+94 11 234 5678" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Email</Label>
                      <Input value={branchForm.email} onChange={e => setBranchForm(f => ({ ...f, email: e.target.value }))} placeholder="branch@store.com" />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button variant="gradient" size="sm" onClick={saveBranch} disabled={branchSaving} className="flex-1">
                      {branchSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Check className="h-3.5 w-3.5 mr-1.5" />}
                      {branchModal.editing ? "Update" : "Create"} Branch
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setBranchModal({ open: false, editing: null })}>Cancel</Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="notifications" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Bell className="h-4 w-4 text-primary" />Notification Preferences</CardTitle>
              <CardDescription>Choose what notifications you receive</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              {[
                { label: "Low stock alerts", desc: "Alert when products fall below minimum stock", default: true },
                { label: "New sale notifications", desc: "Notify on every new sale", default: true },
                { label: "Daily sales summary", desc: "Receive end-of-day summary report", default: false },
                { label: "Customer birthday reminders", desc: "Get reminded of customer birthdays", default: true },
                { label: "Payment due alerts", desc: "Alert on overdue supplier payments", default: true },
                { label: "System health alerts", desc: "Notify on backup failures or sync errors", default: false },
                { label: "New purchase orders", desc: "Notify when purchase orders are created", default: true },
                { label: "Return & exchange alerts", desc: "Notify when returns or exchanges are processed", default: false },
              ].map((n) => (
                <div key={n.label} className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
                  <div>
                    <p className="text-sm font-medium">{n.label}</p>
                    <p className="text-xs text-muted-foreground">{n.desc}</p>
                  </div>
                  <Switch defaultChecked={n.default} />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="appearance" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Palette className="h-4 w-4 text-primary" />Theme & Display</CardTitle>
              <CardDescription>Choose light, dark, or follow the system</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3">
                {(["light","dark","system"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTheme(t)}
                    className={`p-4 rounded-[18px] border-2 text-sm font-medium transition-all capitalize flex flex-col items-center gap-2 ${theme === t ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/50"}`}
                  >
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${t === "dark" ? "bg-[#080C14]" : t === "light" ? "bg-white border" : "bg-gradient-to-br from-white to-[#080C14]"}`} />
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                    {theme === t && <Check className="h-3.5 w-3.5" />}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Palette className="h-4 w-4 text-primary" />Accent color</CardTitle>
              <CardDescription>Single brand accent for buttons, links, and active nav — Hexalyte presets</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {ACCENT_PRESETS.map((p) => {
                  const selected = accent === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => pickAccent(p.id)}
                      className={`flex items-center gap-3 rounded-[18px] border-2 p-3 text-left transition-all ${
                        selected ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                      }`}
                    >
                      <span
                        className="h-9 w-9 shrink-0 rounded-full ring-2 ring-white shadow-sm"
                        style={{ background: `linear-gradient(135deg, ${p.hex}, ${p.lightHex})` }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-foreground">{p.name}</span>
                        <span className="block text-[11px] font-mono text-muted-foreground">{p.hex}</span>
                      </span>
                      {selected && <Check className="h-4 w-4 text-primary shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="billing" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><CreditCard className="h-4 w-4 text-primary" />Subscription Plan</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="p-5 rounded-xl gradient-primary text-white mb-5">
                <p className="text-xs font-semibold opacity-70 uppercase tracking-wide">Current Plan</p>
                <p className="text-3xl font-bold mt-1">{tenant?.plan ?? "Enterprise"}</p>
                <p className="text-sm opacity-70 mt-1">Full access · All features unlocked</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm mb-4">
                {["Unlimited products & variants", "All POS terminals", "AI insights & analytics", "Multi-branch support", "Priority support", "API access", "Advanced reports", "Custom roles & permissions"].map((f) => (
                  <div key={f} className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                    {f}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <AuditLogTab />
      </Tabs>

      <p className="text-xs text-muted-foreground text-center">{APP_NAME} v{APP_VERSION} · Enterprise Edition</p>
    </div>
  );
}
