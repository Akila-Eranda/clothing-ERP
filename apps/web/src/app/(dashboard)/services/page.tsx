"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Wrench, Plus, Loader2, RefreshCw, Bell, Users, Hash, Clock,
  Banknote, ClipboardList, Send, CheckCircle2, Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ColumnDef } from "@tanstack/react-table";
import { ClientSideTable } from "@/components/table/client-side-table";
import { DataTableColumnHeader } from "@/components/table/data-table-column-header";
import { OpenRecordButton } from "@/components/table/open-record-button";
import { ModuleGate } from "@/components/shop/module-gate";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { cn, formatNumber } from "@/lib/utils";
import { useShopWorkspace } from "@/lib/use-shop-profile";

interface Service {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  category: string;
  defaultPrice: number;
  durationMinutes: number;
  isActive: boolean;
}
interface Reminder {
  id: string;
  reminderType: string;
  channel: string;
  scheduledFor: string;
  message: string;
  status: string;
  customer: { firstName: string; lastName?: string | null; phone: string };
}
interface FleetCustomer {
  id: string;
  firstName: string;
  lastName?: string | null;
  phone: string;
  totalSpent: number;
  isFleet: boolean;
}
interface Serial {
  id: string;
  serialNumber: string;
  dotCode?: string | null;
  status: string;
  variant: { name: string; product: { name: string; brand?: { name: string } | null } };
}
interface Customer {
  id: string;
  firstName: string;
  lastName?: string | null;
  phone: string;
  isFleet?: boolean;
}
interface VariantOpt {
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
}

type Tab = "services" | "reminders" | "fleet" | "serials";
type CategoryFilter = "ALL" | string;
type ReminderFilter = "ALL" | "PENDING" | "SENT" | "FAILED" | "CANCELLED";
type SerialFilter = "ALL" | "IN_STOCK" | "SOLD" | "CLAIMED";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "services", label: "Service Catalog", icon: Wrench },
  { id: "reminders", label: "Reminders", icon: Bell },
  { id: "fleet", label: "Fleet Customers", icon: Users },
  { id: "serials", label: "Tyre Serials", icon: Hash },
];

const SERVICE_CATEGORIES = [
  { value: "FITTING", label: "Fitting" },
  { value: "BALANCING", label: "Balancing" },
  { value: "ALIGNMENT", label: "Alignment" },
  { value: "MAINTENANCE", label: "Maintenance" },
  { value: "REPAIR", label: "Repair" },
  { value: "GENERAL", label: "General" },
];

const REMINDER_STATUS_CFG: Record<string, { label: string; variant: "success" | "secondary" | "warning" | "danger" | "default" }> = {
  PENDING:   { label: "Pending",   variant: "warning"   },
  SENT:      { label: "Sent",      variant: "success"   },
  FAILED:    { label: "Failed",    variant: "danger"    },
  CANCELLED: { label: "Cancelled", variant: "secondary" },
};

const SERIAL_STATUS_CFG: Record<string, { label: string; variant: "success" | "secondary" | "warning" | "danger" | "default" }> = {
  IN_STOCK: { label: "In Stock", variant: "success"   },
  SOLD:     { label: "Sold",     variant: "default"   },
  CLAIMED:  { label: "Claimed",  variant: "warning"   },
};

const GUIDE = [
  { title: "Service Catalog", desc: "Define fitting, balancing, alignment and other labour prices used on job cards and appointments." },
  { title: "Reminders", desc: "Schedule SMS, WhatsApp or email reminders before service appointments or follow-ups." },
  { title: "Fleet Customers", desc: "Mark corporate fleet accounts for credit terms, bulk quotes and workshop billing." },
  { title: "Tyre Serials", desc: "Track premium tyre serial numbers and DOT codes for warranty and traceability." },
];

function customerName(c: { firstName: string; lastName?: string | null }) {
  return `${c.firstName} ${c.lastName ?? ""}`.trim();
}

function buildServiceColumns(onView: (s: Service) => void): ColumnDef<Service>[] {
  return [
    {
      accessorKey: "code",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Code" />,
      cell: ({ row }) => (
        <div className="flex items-center gap-2.5 min-w-[100px]">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Wrench className="h-4 w-4 text-primary" />
          </div>
          <OpenRecordButton onClick={() => onView(row.original)} className="font-mono text-xs" title="View service">
            {row.original.code}
          </OpenRecordButton>
        </div>
      ),
    },
    {
      accessorKey: "name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Service" />,
      cell: ({ row }) => (
        <div>
          <OpenRecordButton onClick={() => onView(row.original)} className="text-sm" title="View service">
            {row.original.name}
          </OpenRecordButton>
          {row.original.description && (
            <p className="text-[10px] text-muted-foreground truncate max-w-[200px]">{row.original.description}</p>
          )}
        </div>
      ),
    },
    {
      accessorKey: "category",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Category" />,
      cell: ({ row }) => <Badge variant="secondary" className="h-6 rounded-full px-2.5 text-[11px] font-semibold inline-flex items-center">{row.original.category}</Badge>,
    },
    {
      accessorKey: "durationMinutes",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Duration" />,
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" /> {row.original.durationMinutes} min
        </span>
      ),
    },
    {
      accessorKey: "defaultPrice",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Price" />,
      cell: ({ row }) => (
        <span className="text-sm font-bold">LKR {formatNumber(row.original.defaultPrice)}</span>
      ),
    },
    {
      accessorKey: "isActive",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => (
        <Badge variant={row.original.isActive ? "success" : "secondary"} className="h-6 rounded-full px-2.5 text-[11px] font-semibold inline-flex items-center">
          {row.original.isActive ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <Button variant="ghost" size="sm" className="h-8 rounded-[10px] px-3 text-xs font-semibold text-primary hover:bg-[hsl(var(--primary-soft))]" onClick={() => onView(row.original)}>
          View
        </Button>
      ),
    },
  ];
}

function buildReminderColumns(onSend: (id: string) => void): ColumnDef<Reminder>[] {
  return [
    {
      id: "customer",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Customer" />,
      cell: ({ row }) => (
        <div>
          <p className="text-sm font-medium">{customerName(row.original.customer)}</p>
          <p className="text-[10px] text-muted-foreground font-mono">{row.original.customer.phone}</p>
        </div>
      ),
    },
    {
      accessorKey: "channel",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Channel" />,
      cell: ({ row }) => <Badge variant="outline" className="h-6 rounded-full px-2.5 text-[11px] font-semibold inline-flex items-center">{row.original.channel}</Badge>,
    },
    {
      accessorKey: "scheduledFor",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Scheduled" />,
      cell: ({ row }) => (
        <span className="text-xs">{new Date(row.original.scheduledFor).toLocaleString("en-LK")}</span>
      ),
    },
    {
      id: "message",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Message" />,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground max-w-[220px] truncate block">{row.original.message}</span>
      ),
    },
    {
      accessorKey: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => {
        const cfg = REMINDER_STATUS_CFG[row.original.status] ?? { label: row.original.status, variant: "secondary" as const };
        return <Badge variant={cfg.variant} className="h-6 rounded-full px-2.5 text-[11px] font-semibold inline-flex items-center">{cfg.label}</Badge>;
      },
    },
    {
      id: "actions",
      cell: ({ row }) => (
        row.original.status === "PENDING" ? (
          <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={() => onSend(row.original.id)}>
            <Send className="h-3 w-3" /> Send
          </Button>
        ) : null
      ),
    },
  ];
}

function buildFleetColumns(onToggle: (id: string, isFleet: boolean) => void): ColumnDef<Customer>[] {
  return [
    {
      id: "name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Customer" />,
      cell: ({ row }) => (
        <div>
          <p className="text-sm font-medium">{customerName(row.original)}</p>
          <p className="text-[10px] text-muted-foreground font-mono">{row.original.phone}</p>
        </div>
      ),
    },
    {
      id: "fleet",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fleet" />,
      cell: ({ row }) => (
        <Badge variant={row.original.isFleet ? "success" : "secondary"} className="h-6 rounded-full px-2.5 text-[11px] font-semibold inline-flex items-center">
          {row.original.isFleet ? "Fleet Account" : "Retail"}
        </Badge>
      ),
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <Button
          size="sm"
          variant={row.original.isFleet ? "default" : "outline"}
          className="h-7 text-[10px]"
          onClick={() => onToggle(row.original.id, !!row.original.isFleet)}
        >
          {row.original.isFleet ? "Remove Fleet" : "Mark Fleet"}
        </Button>
      ),
    },
  ];
}

function buildSerialColumns(): ColumnDef<Serial>[] {
  return [
    {
      accessorKey: "serialNumber",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Serial #" />,
      cell: ({ row }) => (
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Hash className="h-4 w-4 text-primary" />
          </div>
          <span className="font-mono text-xs font-semibold">{row.original.serialNumber}</span>
        </div>
      ),
    },
    {
      id: "product",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tyre" />,
      cell: ({ row }) => (
        <div>
          <p className="text-sm font-medium">{row.original.variant.product.name}</p>
          <p className="text-[10px] text-muted-foreground">{row.original.variant.name}</p>
        </div>
      ),
    },
    {
      accessorKey: "dotCode",
      header: ({ column }) => <DataTableColumnHeader column={column} title="DOT" />,
      cell: ({ row }) => (
        <span className="font-mono text-xs">{row.original.dotCode || "—"}</span>
      ),
    },
    {
      accessorKey: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => {
        const cfg = SERIAL_STATUS_CFG[row.original.status] ?? { label: row.original.status, variant: "secondary" as const };
        return <Badge variant={cfg.variant} className="h-6 rounded-full px-2.5 text-[11px] font-semibold inline-flex items-center">{cfg.label}</Badge>;
      },
    },
  ];
}

function ServiceDetailDialog({ service, onClose }: { service: Service | null; onClose: () => void }) {
  if (!service) return null;
  return (
    <Dialog open={!!service} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-primary" /> {service.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div><p className="text-xs text-muted-foreground">Code</p><p className="font-mono font-semibold">{service.code}</p></div>
            <div><p className="text-xs text-muted-foreground">Category</p><p>{service.category}</p></div>
            <div><p className="text-xs text-muted-foreground">Price</p><p className="font-bold text-primary">LKR {formatNumber(service.defaultPrice)}</p></div>
            <div><p className="text-xs text-muted-foreground">Duration</p><p>{service.durationMinutes} minutes</p></div>
          </div>
          {service.description && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Description</p>
              <p className="text-muted-foreground">{service.description}</p>
            </div>
          )}
          <div className="flex justify-end pt-2 border-t">
            <Button variant="outline" onClick={onClose}>Close</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ServicesPage() {
  const { profile } = useShopWorkspace();
  const [tab, setTab] = useState<Tab>("services");
  const [services, setServices] = useState<Service[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [serials, setSerials] = useState<Serial[]>([]);
  const [variants, setVariants] = useState<VariantOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("ALL");
  const [reminderFilter, setReminderFilter] = useState<ReminderFilter>("ALL");
  const [serialFilter, setSerialFilter] = useState<SerialFilter>("ALL");
  const [createServiceOpen, setCreateServiceOpen] = useState(false);
  const [createReminderOpen, setCreateReminderOpen] = useState(false);
  const [createSerialOpen, setCreateSerialOpen] = useState(false);
  const [viewService, setViewService] = useState<Service | null>(null);
  const [saving, setSaving] = useState(false);

  const [serviceForm, setServiceForm] = useState({
    code: "", name: "", category: "FITTING", defaultPrice: "", durationMinutes: "30", description: "",
  });
  const [remForm, setRemForm] = useState({ customerId: "", scheduledFor: "", message: "", channel: "SMS" });
  const [serialForm, setSerialForm] = useState({ variantId: "", serialNumber: "", dotCode: "" });

  const loadCustomers = useCallback(async () => {
    try {
      const [custRes, fleetRes] = await Promise.all([
        api.get<{ data: Customer[] }>("/customers?limit=200"),
        api.get<FleetCustomer[]>("/workshop/fleet-customers"),
      ]);
      const fleetIds = new Set((Array.isArray(fleetRes.data) ? fleetRes.data : []).filter((f) => f.isFleet).map((f) => f.id));
      const list = custRes.data?.data ?? [];
      setCustomers(list.map((c) => ({ ...c, isFleet: fleetIds.has(c.id) || c.isFleet })));
    } catch { /* optional */ }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === "services") {
        const r = await api.get<Service[]>("/workshop/services");
        setServices(Array.isArray(r.data) ? r.data : []);
      } else if (tab === "reminders") {
        const r = await api.get<Reminder[]>("/workshop/reminders");
        setReminders(Array.isArray(r.data) ? r.data : []);
      } else if (tab === "fleet") {
        await loadCustomers();
      } else {
        const r = await api.get<Serial[]>("/workshop/tyre-serials");
        setSerials(Array.isArray(r.data) ? r.data : []);
      }
    } catch { toast.error("Failed to load data"); }
    finally { setLoading(false); }
  }, [tab, loadCustomers]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    loadCustomers();
    api.get<VariantOpt[]>("/pos/products").then((r) => setVariants(Array.isArray(r.data) ? r.data : [])).catch(() => {});
  }, [loadCustomers]);

  const seedServices = async () => {
    try {
      await api.post("/workshop/services/seed-defaults");
      toast.success("Default services loaded");
      load();
    } catch (e: unknown) { toast.error((e as Error).message); }
  };

  const createService = async () => {
    if (!serviceForm.code || !serviceForm.name) { toast.error("Code and name required"); return; }
    setSaving(true);
    try {
      await api.post("/workshop/services", {
        code: serviceForm.code.toUpperCase(),
        name: serviceForm.name,
        category: serviceForm.category,
        defaultPrice: Number(serviceForm.defaultPrice) || 0,
        durationMinutes: Number(serviceForm.durationMinutes) || 30,
        description: serviceForm.description || undefined,
      });
      toast.success("Service added");
      setServiceForm({ code: "", name: "", category: "FITTING", defaultPrice: "", durationMinutes: "30", description: "" });
      setCreateServiceOpen(false);
      load();
    } catch (e: unknown) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };

  const createReminder = async () => {
    if (!remForm.customerId || !remForm.scheduledFor || !remForm.message) {
      toast.error("Fill all reminder fields"); return;
    }
    setSaving(true);
    try {
      await api.post("/workshop/reminders", {
        customerId: remForm.customerId,
        scheduledFor: new Date(remForm.scheduledFor).toISOString(),
        message: remForm.message,
        channel: remForm.channel,
        reminderType: "SERVICE_DUE",
      });
      toast.success("Reminder scheduled");
      setRemForm({ customerId: "", scheduledFor: "", message: "", channel: "SMS" });
      setCreateReminderOpen(false);
      load();
    } catch (e: unknown) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };

  const sendReminder = useCallback(async (id: string) => {
    try {
      await api.post(`/workshop/reminders/${id}/send`);
      toast.success("Reminder sent");
      load();
    } catch (e: unknown) { toast.error((e as Error).message); }
  }, [load]);

  const addSerial = async () => {
    if (!serialForm.variantId || !serialForm.serialNumber) { toast.error("Variant and serial required"); return; }
    setSaving(true);
    try {
      await api.post("/workshop/tyre-serials", serialForm);
      toast.success("Serial registered");
      setSerialForm({ variantId: "", serialNumber: "", dotCode: "" });
      setCreateSerialOpen(false);
      load();
    } catch (e: unknown) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };

  const toggleFleet = useCallback(async (id: string, isFleet: boolean) => {
    try {
      await api.put(`/workshop/fleet-customers/${id}`, { isFleet: !isFleet });
      toast.success(isFleet ? "Removed from fleet" : "Marked as fleet customer");
      loadCustomers();
    } catch (e: unknown) { toast.error((e as Error).message); }
  }, [loadCustomers]);

  const displayedServices = useMemo(
    () => categoryFilter === "ALL" ? services : services.filter((s) => s.category === categoryFilter),
    [services, categoryFilter],
  );
  const displayedReminders = useMemo(
    () => reminderFilter === "ALL" ? reminders : reminders.filter((r) => r.status === reminderFilter),
    [reminders, reminderFilter],
  );
  const displayedSerials = useMemo(
    () => serialFilter === "ALL" ? serials : serials.filter((s) => s.status === serialFilter),
    [serials, serialFilter],
  );
  const fleetCustomers = useMemo(() => customers.filter((c) => c.isFleet), [customers]);

  const serviceCategories = useMemo(() => {
    const cats = new Set(services.map((s) => s.category));
    return ["ALL", ...Array.from(cats).sort()];
  }, [services]);

  const avgPrice = services.length
    ? services.reduce((s, x) => s + x.defaultPrice, 0) / services.length
    : 0;
  const pendingReminders = reminders.filter((r) => r.status === "PENDING").length;
  const inStockSerials = serials.filter((s) => s.status === "IN_STOCK").length;

  const STATS = useMemo(() => {
    if (tab === "services") {
      return [
        { label: "Total Services", value: services.length, icon: Wrench, color: "text-blue-600", bg: "bg-blue-500/15", tint: "border-blue-200/70 bg-gradient-to-br from-blue-50 to-white dark:border-blue-500/20 dark:from-blue-500/10 dark:to-transparent" },
        { label: "Active", value: services.filter((s) => s.isActive).length, icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-500/15", tint: "border-emerald-200/70 bg-gradient-to-br from-emerald-50 to-white dark:border-emerald-500/20 dark:from-emerald-500/10 dark:to-transparent" },
        { label: "Categories", value: new Set(services.map((s) => s.category)).size, icon: Package, color: "text-violet-600", bg: "bg-violet-500/15", tint: "border-violet-200/70 bg-gradient-to-br from-violet-50 to-white dark:border-violet-500/20 dark:from-violet-500/10 dark:to-transparent" },
        { label: "Avg. Price", value: `LKR ${formatNumber(Math.round(avgPrice))}`, icon: Banknote, color: "text-amber-600", bg: "bg-amber-500/15", tint: "border-amber-200/70 bg-gradient-to-br from-amber-50 to-white dark:border-amber-500/20 dark:from-amber-500/10 dark:to-transparent" },
      ];
    }
    if (tab === "reminders") {
      return [
        { label: "Total Reminders", value: reminders.length, icon: Bell, color: "text-blue-600", bg: "bg-blue-500/15", tint: "border-blue-200/70 bg-gradient-to-br from-blue-50 to-white dark:border-blue-500/20 dark:from-blue-500/10 dark:to-transparent" },
        { label: "Pending", value: pendingReminders, icon: Clock, color: "text-amber-600", bg: "bg-amber-500/15", tint: "border-amber-200/70 bg-gradient-to-br from-amber-50 to-white dark:border-amber-500/20 dark:from-amber-500/10 dark:to-transparent" },
        { label: "Sent", value: reminders.filter((r) => r.status === "SENT").length, icon: Send, color: "text-emerald-600", bg: "bg-emerald-500/15", tint: "border-emerald-200/70 bg-gradient-to-br from-emerald-50 to-white dark:border-emerald-500/20 dark:from-emerald-500/10 dark:to-transparent" },
        { label: "Failed", value: reminders.filter((r) => r.status === "FAILED").length, icon: Bell, color: "text-red-600", bg: "bg-red-500/15", tint: "border-red-200/70 bg-gradient-to-br from-red-50 to-white dark:border-red-500/20 dark:from-red-500/10 dark:to-transparent" },
      ];
    }
    if (tab === "fleet") {
      return [
        { label: "Fleet Accounts", value: fleetCustomers.length, icon: Users, color: "text-blue-600", bg: "bg-blue-500/15", tint: "border-blue-200/70 bg-gradient-to-br from-blue-50 to-white dark:border-blue-500/20 dark:from-blue-500/10 dark:to-transparent" },
        { label: "Retail Customers", value: customers.length - fleetCustomers.length, icon: Users, color: "text-violet-600", bg: "bg-violet-500/15", tint: "border-violet-200/70 bg-gradient-to-br from-violet-50 to-white dark:border-violet-500/20 dark:from-violet-500/10 dark:to-transparent" },
        { label: "Total Customers", value: customers.length, icon: Users, color: "text-emerald-600", bg: "bg-emerald-500/15", tint: "border-emerald-200/70 bg-gradient-to-br from-emerald-50 to-white dark:border-emerald-500/20 dark:from-emerald-500/10 dark:to-transparent" },
        { label: "Fleet %", value: customers.length ? `${Math.round((fleetCustomers.length / customers.length) * 100)}%` : "0%", icon: Banknote, color: "text-amber-600", bg: "bg-amber-500/15", tint: "border-amber-200/70 bg-gradient-to-br from-amber-50 to-white dark:border-amber-500/20 dark:from-amber-500/10 dark:to-transparent" },
      ];
    }
    return [
      { label: "Total Serials", value: serials.length, icon: Hash, color: "text-blue-600", bg: "bg-blue-500/15", tint: "border-blue-200/70 bg-gradient-to-br from-blue-50 to-white dark:border-blue-500/20 dark:from-blue-500/10 dark:to-transparent" },
      { label: "In Stock", value: inStockSerials, icon: Package, color: "text-emerald-600", bg: "bg-emerald-500/15", tint: "border-emerald-200/70 bg-gradient-to-br from-emerald-50 to-white dark:border-emerald-500/20 dark:from-emerald-500/10 dark:to-transparent" },
      { label: "Sold", value: serials.filter((s) => s.status === "SOLD").length, icon: CheckCircle2, color: "text-violet-600", bg: "bg-violet-500/15", tint: "border-violet-200/70 bg-gradient-to-br from-violet-50 to-white dark:border-violet-500/20 dark:from-violet-500/10 dark:to-transparent" },
      { label: "Claimed", value: serials.filter((s) => s.status === "CLAIMED").length, icon: Hash, color: "text-amber-600", bg: "bg-amber-500/15", tint: "border-amber-200/70 bg-gradient-to-br from-amber-50 to-white dark:border-amber-500/20 dark:from-amber-500/10 dark:to-transparent" },
    ];
  }, [tab, services, reminders, customers, fleetCustomers, serials, avgPrice, pendingReminders, inStockSerials]);

  const serviceColumns = useMemo(() => buildServiceColumns(setViewService), []);
  const reminderColumns = useMemo(() => buildReminderColumns(sendReminder), [sendReminder]);
  const fleetColumns = useMemo(() => buildFleetColumns(toggleFleet), [toggleFleet]);
  const serialColumns = useMemo(() => buildSerialColumns(), []);

  const primaryAction = () => {
    if (tab === "services") setCreateServiceOpen(true);
    else if (tab === "reminders") setCreateReminderOpen(true);
    else if (tab === "serials") setCreateSerialOpen(true);
  };

  const primaryLabel = tab === "services" ? "Add Service" : tab === "reminders" ? "Schedule Reminder" : tab === "serials" ? "Register Serial" : null;

  return (
    <ModuleGate module="workshop">
      <div className="p-4 md:p-5 space-y-4 max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="min-w-0">
            <h1 className="text-[26px] md:text-3xl font-bold tracking-tight leading-tight flex items-center gap-2">
              <span>{profile.emoji}</span> Workshop Services
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              Service catalog, reminders, fleet accounts & premium tyre serial tracking
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <Button variant="outline" onClick={load} className="h-10 rounded-[12px] gap-1.5 text-sm">
              <RefreshCw className={`h-[18px] w-[18px] ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button variant="outline" className="h-10 rounded-[12px] gap-1.5 text-sm" asChild>
              <Link href="/job-cards"><ClipboardList className="h-[18px] w-[18px]" /> Job Cards</Link>
            </Button>
            <Button variant="outline" className="h-10 rounded-[12px] gap-1.5 text-sm" asChild>
              <Link href="/appointments"><Clock className="h-[18px] w-[18px]" /> Appointments</Link>
            </Button>
            {tab === "services" && services.length === 0 && (
              <Button variant="outline" onClick={seedServices} className="h-10 rounded-[12px] gap-1.5 text-sm">
                <Package className="h-[18px] w-[18px]" /> Load Defaults
              </Button>
            )}
            {primaryLabel && (
              <Button className="h-10 rounded-[12px] gap-1.5 text-sm" onClick={primaryAction}>
                <Plus className="h-[18px] w-[18px]" /> {primaryLabel}
              </Button>
            )}
          </div>
        </div>

        {/* Section tabs */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Section:</span>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors inline-flex items-center gap-1.5",
                tab === t.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:border-primary/40",
              )}
            >
              <t.icon className="h-3 w-3" /> {t.label}
            </button>
          ))}
        </div>

        {/* KPI stats */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          {STATS.map((s) => (
            <Card
              key={s.label}
              className={`rounded-[18px] shadow-[0_2px_10px_rgba(15,23,42,0.04)] hover:-translate-y-0.5 hover:shadow-[0_4px_14px_rgba(15,23,42,0.07)] transition-all duration-150 ${s.tint}`}
            >
              <CardContent className="h-[68px] p-4 flex items-center gap-3">
                <div className={`h-9 w-9 rounded-[12px] flex items-center justify-center shrink-0 ${s.bg}`}>
                  <s.icon className={`h-[18px] w-[18px] ${s.color}`} strokeWidth={1.75} />
                </div>
                <div className="min-w-0">
                  <p className={`${typeof s.value === "string" ? "text-lg" : "text-[22px]"} font-bold leading-none tabular-nums`}>
                    {loading && typeof s.value === "number" ? "—" : s.value}
                  </p>
                  <p className="text-[11px] text-muted-foreground font-medium mt-1 truncate">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Sub-filters */}
        {tab === "services" && serviceCategories.length > 1 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Category:</span>
            {serviceCategories.map((cat) => {
              const count = cat === "ALL" ? services.length : services.filter((s) => s.category === cat).length;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                    categoryFilter === cat
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:border-primary/40",
                  )}
                >
                  {cat === "ALL" ? "All" : cat} ({count})
                </button>
              );
            })}
          </div>
        )}

        {tab === "reminders" && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Status:</span>
            {(["ALL", "PENDING", "SENT", "FAILED", "CANCELLED"] as ReminderFilter[]).map((key) => {
              const count = key === "ALL" ? reminders.length : reminders.filter((r) => r.status === key).length;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setReminderFilter(key)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                    reminderFilter === key
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:border-primary/40",
                  )}
                >
                  {key === "ALL" ? "All" : REMINDER_STATUS_CFG[key]?.label ?? key} ({count})
                </button>
              );
            })}
          </div>
        )}

        {tab === "serials" && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Status:</span>
            {(["ALL", "IN_STOCK", "SOLD", "CLAIMED"] as SerialFilter[]).map((key) => {
              const count = key === "ALL" ? serials.length : serials.filter((s) => s.status === key).length;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSerialFilter(key)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                    serialFilter === key
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:border-primary/40",
                  )}
                >
                  {key === "ALL" ? "All" : SERIAL_STATUS_CFG[key]?.label ?? key} ({count})
                </button>
              );
            })}
          </div>
        )}

        {/* Tables */}
        {tab === "services" && (
          displayedServices.length === 0 && !loading ? (
            <Card className="border-dashed rounded-[18px]">
              <CardContent className="p-10 flex flex-col items-center text-center gap-3">
                <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Wrench className="h-7 w-7 text-primary" />
                </div>
                <h3 className="font-semibold">No workshop services yet</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  Load the default tyre shop services (fitting, balancing, alignment…) or add your own labour prices.
                </p>
                <div className="flex gap-2 mt-2">
                  <Button variant="outline" className="gap-1.5" onClick={seedServices}>
                    <Package className="h-4 w-4" /> Load Defaults
                  </Button>
                  <Button className="gap-1.5" onClick={() => setCreateServiceOpen(true)}>
                    <Plus className="h-4 w-4" /> Add Service
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <ClientSideTable
              data={displayedServices}
              columns={serviceColumns}
              pageCount={Math.ceil(displayedServices.length / 10)}
              searchableColumns={[
                { id: "code", title: "Code" },
                { id: "name", title: "Service" },
              ]}
              isShowExportButtons={{ isShow: true, fileName: "workshop-services-export" }}
            />
          )
        )}

        {tab === "reminders" && (
          displayedReminders.length === 0 && !loading ? (
            <Card className="border-dashed rounded-[18px]">
              <CardContent className="p-10 flex flex-col items-center text-center gap-3">
                <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Bell className="h-7 w-7 text-primary" />
                </div>
                <h3 className="font-semibold">No reminders scheduled</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  Send SMS, WhatsApp or email reminders before appointments or service due dates.
                </p>
                <Button className="gap-1.5 mt-2" onClick={() => setCreateReminderOpen(true)}>
                  <Plus className="h-4 w-4" /> Schedule Reminder
                </Button>
              </CardContent>
            </Card>
          ) : (
            <ClientSideTable
              data={displayedReminders}
              columns={reminderColumns}
              pageCount={Math.ceil(displayedReminders.length / 10)}
              searchableColumns={[{ id: "message", title: "Message" }]}
              isShowExportButtons={{ isShow: true, fileName: "service-reminders-export" }}
            />
          )
        )}

        {tab === "fleet" && (
          customers.length === 0 && !loading ? (
            <Card className="border-dashed rounded-[18px]">
              <CardContent className="p-10 flex flex-col items-center text-center gap-3">
                <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Users className="h-7 w-7 text-primary" />
                </div>
                <h3 className="font-semibold">No customers yet</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  Add customers first, then mark fleet accounts for bulk workshop billing.
                </p>
                <Button className="gap-1.5 mt-2" asChild>
                  <Link href="/customers"><Plus className="h-4 w-4" /> Go to Customers</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <ClientSideTable
              data={customers}
              columns={fleetColumns}
              pageCount={Math.ceil(customers.length / 10)}
              searchableColumns={[{ id: "name", title: "Customer" }]}
              isShowExportButtons={{ isShow: true, fileName: "fleet-customers-export" }}
            />
          )
        )}

        {tab === "serials" && (
          displayedSerials.length === 0 && !loading ? (
            <Card className="border-dashed rounded-[18px]">
              <CardContent className="p-10 flex flex-col items-center text-center gap-3">
                <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Hash className="h-7 w-7 text-primary" />
                </div>
                <h3 className="font-semibold">No tyre serials registered</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  Register premium tyre serial numbers and DOT codes for warranty traceability.
                </p>
                <Button className="gap-1.5 mt-2" onClick={() => setCreateSerialOpen(true)}>
                  <Plus className="h-4 w-4" /> Register Serial
                </Button>
              </CardContent>
            </Card>
          ) : (
            <ClientSideTable
              data={displayedSerials}
              columns={serialColumns}
              pageCount={Math.ceil(displayedSerials.length / 10)}
              searchableColumns={[{ id: "serialNumber", title: "Serial #" }]}
              isShowExportButtons={{ isShow: true, fileName: "tyre-serials-export" }}
            />
          )
        )}

        {/* Guide */}
        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
          {GUIDE.map((g) => (
            <Card key={g.title} className="border-dashed">
              <CardContent className="p-4 space-y-1">
                <p className="text-sm font-semibold">{g.title}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{g.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Create service dialog */}
        <Dialog open={createServiceOpen} onOpenChange={setCreateServiceOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Add Workshop Service</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Code</Label>
                  <Input placeholder="FIT" value={serviceForm.code} onChange={(e) => setServiceForm((f) => ({ ...f, code: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Category</Label>
                  <Select value={serviceForm.category} onValueChange={(v) => setServiceForm((f) => ({ ...f, category: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SERVICE_CATEGORIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Service name</Label>
                <Input placeholder="Tyre Fitting" value={serviceForm.name} onChange={(e) => setServiceForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Default price (LKR)</Label>
                  <Input type="number" min={0} value={serviceForm.defaultPrice} onChange={(e) => setServiceForm((f) => ({ ...f, defaultPrice: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Duration (minutes)</Label>
                  <Input type="number" min={1} value={serviceForm.durationMinutes} onChange={(e) => setServiceForm((f) => ({ ...f, durationMinutes: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Description (optional)</Label>
                <Textarea rows={2} value={serviceForm.description} onChange={(e) => setServiceForm((f) => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button variant="outline" onClick={() => setCreateServiceOpen(false)}>Cancel</Button>
                <Button onClick={createService} disabled={saving || !serviceForm.code || !serviceForm.name} className="gap-1.5">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
                  Add Service
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Create reminder dialog */}
        <Dialog open={createReminderOpen} onOpenChange={setCreateReminderOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Schedule Reminder</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Customer</Label>
                <Select value={remForm.customerId || undefined} onValueChange={(v) => setRemForm((f) => ({ ...f, customerId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{customerName(c)} · {c.phone}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Scheduled for</Label>
                <Input type="datetime-local" value={remForm.scheduledFor} onChange={(e) => setRemForm((f) => ({ ...f, scheduledFor: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Channel</Label>
                <Select value={remForm.channel} onValueChange={(v) => setRemForm((f) => ({ ...f, channel: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SMS">SMS</SelectItem>
                    <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                    <SelectItem value="EMAIL">Email</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Message</Label>
                <Textarea rows={3} placeholder="Hi, your service appointment is tomorrow at 10:00 AM…" value={remForm.message} onChange={(e) => setRemForm((f) => ({ ...f, message: e.target.value }))} />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button variant="outline" onClick={() => setCreateReminderOpen(false)}>Cancel</Button>
                <Button onClick={createReminder} disabled={saving} className="gap-1.5">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
                  Schedule
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Create serial dialog */}
        <Dialog open={createSerialOpen} onOpenChange={setCreateSerialOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Register Tyre Serial</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Tyre variant</Label>
                <Select value={serialForm.variantId || undefined} onValueChange={(v) => setSerialForm((f) => ({ ...f, variantId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select tyre" /></SelectTrigger>
                  <SelectContent>
                    {variants.map((v) => (
                      <SelectItem key={v.variantId} value={v.variantId}>{v.productName} — {v.variantName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Serial number</Label>
                <Input placeholder="TYR-SN-001" value={serialForm.serialNumber} onChange={(e) => setSerialForm((f) => ({ ...f, serialNumber: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">DOT code (optional)</Label>
                <Input placeholder="2524" value={serialForm.dotCode} onChange={(e) => setSerialForm((f) => ({ ...f, dotCode: e.target.value }))} />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button variant="outline" onClick={() => setCreateSerialOpen(false)}>Cancel</Button>
                <Button onClick={addSerial} disabled={saving} className="gap-1.5">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Hash className="h-4 w-4" />}
                  Register
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <ServiceDetailDialog service={viewService} onClose={() => setViewService(null)} />
      </div>
    </ModuleGate>
  );
}
