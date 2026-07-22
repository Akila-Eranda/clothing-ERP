"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Calendar, Plus, Loader2, RefreshCw, LogIn, Users, Clock, Wrench,
  CheckCircle2, ClipboardList, Car,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { modalInlineFooterClass } from "@/components/ui/modal-footer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ColumnDef } from "@tanstack/react-table";
import { ClientSideTable, DataTableColumnHeader, OpenRecordButton } from "@/components/table";
import { ModuleGate } from "@/components/shop/module-gate";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useShopWorkspace } from "@/lib/use-shop-profile";

interface Appointment {
  id: string;
  appointmentNumber: string;
  status: string;
  scheduledAt: string;
  durationMinutes: number;
  serviceTypes: string[];
  notes?: string | null;
  customer: { firstName: string; lastName?: string | null; phone: string };
  customerVehicle?: { registrationNo?: string | null; make?: string | null; model?: string | null } | null;
  jobCard?: { id: string; jobNumber: string; status: string } | null;
}
interface Customer { id: string; firstName: string; lastName?: string | null; phone: string }
interface Service { id: string; name: string }

type StatusFilter = "ALL" | "SCHEDULED" | "CONFIRMED" | "CHECKED_IN" | "IN_SERVICE" | "COMPLETED" | "NO_SHOW" | "CANCELLED";

const STATUS_CFG: Record<string, { label: string; variant: "success" | "secondary" | "warning" | "danger" | "default" }> = {
  SCHEDULED:  { label: "Scheduled",  variant: "secondary" },
  CONFIRMED:  { label: "Confirmed",  variant: "warning"   },
  CHECKED_IN: { label: "Checked In", variant: "default"   },
  IN_SERVICE: { label: "In Service", variant: "warning"   },
  COMPLETED:  { label: "Completed",  variant: "success"   },
  NO_SHOW:    { label: "No Show",    variant: "danger"    },
  CANCELLED:  { label: "Cancelled",  variant: "danger"    },
};

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "SCHEDULED", label: "Scheduled" },
  { key: "CONFIRMED", label: "Confirmed" },
  { key: "CHECKED_IN", label: "Checked In" },
  { key: "IN_SERVICE", label: "In Service" },
  { key: "COMPLETED", label: "Completed" },
  { key: "CANCELLED", label: "Cancelled" },
];

const GUIDE = [
  { title: "Book Slot", desc: "Schedule tyre fitting, balancing or alignment for a customer at a specific date and time." },
  { title: "Confirm", desc: "Mark appointments as Confirmed once the customer acknowledges the booking." },
  { title: "Check In", desc: "When the vehicle arrives, check in to automatically create a linked job card." },
  { title: "Complete", desc: "Close the appointment when workshop work is finished or cancel if rescheduled." },
];

function customerName(a: Appointment) {
  return `${a.customer.firstName} ${a.customer.lastName ?? ""}`.trim();
}

function vehicleLabel(a: Appointment) {
  if (a.customerVehicle?.registrationNo) return a.customerVehicle.registrationNo;
  const mm = [a.customerVehicle?.make, a.customerVehicle?.model].filter(Boolean).join(" ");
  return mm || "—";
}

function fmtDateTime(d: string) {
  return new Date(d).toLocaleString("en-LK", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function buildColumns(
  onView: (a: Appointment) => void,
  onStatus: (id: string, status: string) => void,
  onCheckIn: (id: string) => void,
): ColumnDef<Appointment>[] {
  return [
    {
      accessorKey: "appointmentNumber",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Appt #" />,
      cell: ({ row }) => (
        <div className="flex items-center gap-2.5 min-w-[120px]">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Calendar className="h-4 w-4 text-primary" />
          </div>
          <OpenRecordButton onClick={() => onView(row.original)} className="font-mono text-xs" title="View appointment">
            {row.original.appointmentNumber}
          </OpenRecordButton>
        </div>
      ),
    },
    {
      id: "customer",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Customer" />,
      cell: ({ row }) => (
        <div>
          <p className="text-sm font-medium">{customerName(row.original)}</p>
          <p className="text-[10px] text-muted-foreground font-mono">{row.original.customer.phone}</p>
        </div>
      ),
    },
    {
      id: "vehicle",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Vehicle" />,
      cell: ({ row }) => (
        <span className="text-xs font-mono inline-flex items-center gap-1">
          <Car className="h-3 w-3 text-muted-foreground" />
          {vehicleLabel(row.original)}
        </span>
      ),
    },
    {
      accessorKey: "scheduledAt",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Scheduled" />,
      cell: ({ row }) => <span className="text-xs">{fmtDateTime(row.original.scheduledAt)}</span>,
    },
    {
      id: "services",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Services" />,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground max-w-[160px] truncate block">
          {row.original.serviceTypes.length ? row.original.serviceTypes.join(", ") : "—"}
        </span>
      ),
    },
    {
      id: "job",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Job Card" />,
      cell: ({ row }) => (
        row.original.jobCard ? (
          <span className="text-xs font-mono text-emerald-600">{row.original.jobCard.jobNumber}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )
      ),
    },
    {
      accessorKey: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => {
        const cfg = STATUS_CFG[row.original.status] ?? { label: row.original.status.replace(/_/g, " "), variant: "secondary" as const };
        return <Badge variant={cfg.variant} className="h-6 rounded-full px-2.5 text-[11px] font-semibold inline-flex items-center">{cfg.label}</Badge>;
      },
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const a = row.original;
        return (
          <div className="flex gap-1 flex-wrap justify-end">
            <Button variant="ghost" size="sm" className="h-8 rounded-[10px] px-3 text-xs font-semibold text-primary hover:bg-[hsl(var(--primary-soft))]" onClick={() => onView(a)}>
              View
            </Button>
            {a.status === "SCHEDULED" && (
              <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => onStatus(a.id, "CONFIRMED")}>
                Confirm
              </Button>
            )}
            {(a.status === "SCHEDULED" || a.status === "CONFIRMED") && !a.jobCard && (
              <Button size="sm" className="h-7 text-[10px] gap-1" onClick={() => onCheckIn(a.id)}>
                <LogIn className="h-3 w-3" /> Check In
              </Button>
            )}
          </div>
        );
      },
    },
  ];
}

function AppointmentDetailDialog({
  appt,
  onClose,
  onStatus,
  onCheckIn,
}: {
  appt: Appointment | null;
  onClose: () => void;
  onStatus: (id: string, status: string) => void;
  onCheckIn: (id: string) => void;
}) {
  if (!appt) return null;
  const cfg = STATUS_CFG[appt.status] ?? { label: appt.status, variant: "secondary" as const };

  return (
    <Dialog open={!!appt} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <Calendar className="h-5 w-5 text-primary" />
            {appt.appointmentNumber}
            <Badge variant={cfg.variant} className="text-[10px]">{cfg.label}</Badge>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Customer</p>
              <p className="font-medium">{customerName(appt)}</p>
              <p className="text-xs font-mono text-muted-foreground">{appt.customer.phone}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Vehicle</p>
              <p className="font-mono">{vehicleLabel(appt)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Scheduled</p>
              <p>{fmtDateTime(appt.scheduledAt)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Duration</p>
              <p>{appt.durationMinutes} minutes</p>
            </div>
          </div>
          {appt.serviceTypes.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Services</p>
              <div className="flex flex-wrap gap-1">
                {appt.serviceTypes.map((s) => (
                  <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>
                ))}
              </div>
            </div>
          )}
          {appt.notes && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Notes</p>
              <p className="text-muted-foreground whitespace-pre-wrap">{appt.notes}</p>
            </div>
          )}
          {appt.jobCard && (
            <div className="rounded-lg border bg-emerald-500/5 p-3">
              <p className="text-xs text-muted-foreground mb-1">Linked job card</p>
              <p className="font-mono font-semibold text-emerald-700">{appt.jobCard.jobNumber}</p>
              <p className="text-xs text-muted-foreground">{appt.jobCard.status.replace(/_/g, " ")}</p>
            </div>
          )}
          <div className="flex flex-wrap gap-2 justify-between pt-2 border-t">
            <div className="flex gap-2 flex-wrap">
              {appt.status === "SCHEDULED" && (
                <Button size="sm" variant="outline" onClick={() => onStatus(appt.id, "CONFIRMED")}>Confirm</Button>
              )}
              {(appt.status === "SCHEDULED" || appt.status === "CONFIRMED") && !appt.jobCard && (
                <Button size="sm" className="gap-1" onClick={() => onCheckIn(appt.id)}>
                  <LogIn className="h-3.5 w-3.5" /> Check In
                </Button>
              )}
              {["SCHEDULED", "CONFIRMED"].includes(appt.status) && (
                <Button size="sm" variant="destructive" onClick={() => onStatus(appt.id, "CANCELLED")}>Cancel</Button>
              )}
              {["CHECKED_IN", "IN_SERVICE"].includes(appt.status) && (
                <Button size="sm" onClick={() => onStatus(appt.id, "COMPLETED")}>Complete</Button>
              )}
              {appt.jobCard && (
                <Button size="sm" variant="outline" asChild>
                  <Link href="/job-cards">View Job Card</Link>
                </Button>
              )}
            </div>
            <Button size="sm" variant="outline" onClick={onClose}>Close</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function AppointmentsPage() {
  const { profile } = useShopWorkspace();
  const [items, setItems] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [createOpen, setCreateOpen] = useState(false);
  const [viewAppt, setViewAppt] = useState<Appointment | null>(null);
  const [form, setForm] = useState({
    customerId: "", scheduledAt: "", durationMinutes: "60", serviceTypes: [] as string[], notes: "",
  });
  const [saving, setSaving] = useState(false);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<Appointment[]>("/workshop/appointments");
      setItems(Array.isArray(res.data) ? res.data : []);
    } catch { toast.error("Failed to load appointments"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);
  useEffect(() => {
    api.get<{ data: Customer[] }>("/customers?limit=200").then((r) => setCustomers(r.data?.data ?? [])).catch(() => {});
    api.get<Service[]>("/workshop/services").then((r) => setServices(Array.isArray(r.data) ? r.data : [])).catch(() => {});
  }, []);

  const resetForm = () => setForm({ customerId: "", scheduledAt: "", durationMinutes: "60", serviceTypes: [], notes: "" });

  const createAppt = async () => {
    if (!form.customerId || !form.scheduledAt) { toast.error("Customer and date/time required"); return; }
    setSaving(true);
    try {
      await api.post("/workshop/appointments", {
        customerId: form.customerId,
        scheduledAt: new Date(form.scheduledAt).toISOString(),
        durationMinutes: parseInt(form.durationMinutes, 10) || 60,
        serviceTypes: form.serviceTypes,
        notes: form.notes || undefined,
      });
      toast.success("Appointment booked");
      resetForm();
      setCreateOpen(false);
      fetchItems();
    } catch (e: unknown) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };

  const updateStatus = useCallback(async (id: string, status: string) => {
    try {
      await api.put(`/workshop/appointments/${id}`, { status });
      toast.success("Appointment updated");
      fetchItems();
      setViewAppt((prev) => (prev?.id === id ? null : prev));
    } catch (e: unknown) { toast.error((e as Error).message); }
  }, [fetchItems]);

  const checkIn = useCallback(async (id: string) => {
    try {
      await api.put(`/workshop/appointments/${id}`, { status: "CHECKED_IN" });
      toast.success("Checked in — job card created");
      fetchItems();
      setViewAppt((prev) => (prev?.id === id ? null : prev));
    } catch (e: unknown) { toast.error((e as Error).message); }
  }, [fetchItems]);

  const toggleService = (name: string) => {
    setForm((f) => ({
      ...f,
      serviceTypes: f.serviceTypes.includes(name)
        ? f.serviceTypes.filter((s) => s !== name)
        : [...f.serviceTypes, name],
    }));
  };

  const displayed = useMemo(
    () => statusFilter === "ALL" ? items : items.filter((a) => a.status === statusFilter),
    [items, statusFilter],
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todayCount = items.filter((a) => {
    const d = new Date(a.scheduledAt);
    return d >= today && d < tomorrow && !["CANCELLED", "NO_SHOW"].includes(a.status);
  }).length;

  const STATS = [
    { label: "Total Bookings", value: items.length, icon: Calendar, color: "text-blue-600", bg: "bg-blue-500/15", tint: "border-blue-200/70 bg-gradient-to-br from-blue-50 to-white dark:border-blue-500/20 dark:from-blue-500/10 dark:to-transparent" },
    { label: "Today", value: todayCount, icon: Clock, color: "text-amber-600", bg: "bg-amber-500/15", tint: "border-amber-200/70 bg-gradient-to-br from-amber-50 to-white dark:border-amber-500/20 dark:from-amber-500/10 dark:to-transparent" },
    { label: "Confirmed", value: items.filter((a) => a.status === "CONFIRMED").length, icon: CheckCircle2, color: "text-violet-600", bg: "bg-violet-500/15", tint: "border-violet-200/70 bg-gradient-to-br from-violet-50 to-white dark:border-violet-500/20 dark:from-violet-500/10 dark:to-transparent" },
    { label: "Completed", value: items.filter((a) => a.status === "COMPLETED").length, icon: Wrench, color: "text-emerald-600", bg: "bg-emerald-500/15", tint: "border-emerald-200/70 bg-gradient-to-br from-emerald-50 to-white dark:border-emerald-500/20 dark:from-emerald-500/10 dark:to-transparent" },
  ];

  const columns = useMemo(
    () => buildColumns(setViewAppt, updateStatus, checkIn),
    [updateStatus, checkIn],
  );

  return (
    <ModuleGate module="appointments">
      <div className="p-4 md:p-5 space-y-4 max-w-[1600px] mx-auto">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="min-w-0">
            <h1 className="text-[26px] md:text-3xl font-bold tracking-tight leading-tight flex items-center gap-2">
              <span>{profile.emoji}</span> Appointments
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              Book tyre fitting, balancing, alignment & workshop service slots
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" onClick={fetchItems} className="h-10 rounded-[12px] gap-1.5 text-sm px-3.5">
                <RefreshCw className={`h-[18px] w-[18px] ${loading ? "animate-spin" : ""}`} /> Refresh
              </Button>
              <Button variant="outline" className="h-10 rounded-[12px] gap-1.5 text-sm px-3.5" asChild>
                <Link href="/customers"><Users className="h-[18px] w-[18px]" /> Customers</Link>
              </Button>
              <Button variant="outline" className="h-10 rounded-[12px] gap-1.5 text-sm px-3.5" asChild>
                <Link href="/job-cards"><ClipboardList className="h-[18px] w-[18px]" /> Job Cards</Link>
              </Button>
              <Button variant="outline" className="h-10 rounded-[12px] gap-1.5 text-sm px-3.5" asChild>
                <Link href="/services"><Wrench className="h-[18px] w-[18px]" /> Services</Link>
              </Button>
            </div>
            <div className="hidden sm:block h-6 w-px bg-slate-200 dark:bg-white/10 mx-0.5" aria-hidden />
            <Button className="h-10 rounded-[12px] gap-1.5 text-sm px-4" onClick={() => { resetForm(); setCreateOpen(true); }}>
              <Plus className="h-[18px] w-[18px]" /> Book Appointment
            </Button>
          </div>
        </div>

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
                  <p className="text-[22px] font-bold leading-none tabular-nums">{loading && typeof s.value === "number" ? "—" : s.value}</p>
                  <p className="text-[11px] text-muted-foreground font-medium mt-1 truncate">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Status:</span>
          {STATUS_FILTERS.map((f) => {
            const count = f.key === "ALL" ? items.length : items.filter((a) => a.status === f.key).length;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setStatusFilter(f.key)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                  statusFilter === f.key
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:border-primary/40",
                )}
              >
                {f.label} ({count})
              </button>
            );
          })}
        </div>

        {displayed.length === 0 && !loading ? (
          <Card className="border-dashed rounded-[18px]">
            <CardContent className="p-10 flex flex-col items-center text-center gap-3">
              <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Calendar className="h-7 w-7 text-primary" />
              </div>
              <h3 className="font-semibold">No appointments scheduled</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Book a slot when customers call ahead for tyre fitting, balancing, alignment or other workshop services.
              </p>
              <Button className="gap-1.5 mt-2" onClick={() => { resetForm(); setCreateOpen(true); }}>
                <Plus className="h-4 w-4" /> Book Appointment
              </Button>
            </CardContent>
          </Card>
        ) : (
          <ClientSideTable
            data={displayed}
            columns={columns}
            pageCount={Math.ceil(displayed.length / 10)}
            searchableColumns={[
              { id: "appointmentNumber", title: "Appt #" },
            ]}
            filterableColumns={[
              {
                id: "status",
                title: "Status",
                options: STATUS_FILTERS.filter((f) => f.key !== "ALL").map((f) => ({
                  label: f.label,
                  value: f.key,
                })),
              },
            ]}
            isShowExportButtons={{ isShow: true, fileName: "appointments-export" }}
          />
        )}

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

        <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) resetForm(); }}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Book Appointment</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Customer</Label>
                <Select value={form.customerId || undefined} onValueChange={(v) => setForm((f) => ({ ...f, customerId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.firstName} {c.lastName ?? ""} · {c.phone}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Date & time</Label>
                  <Input type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm((f) => ({ ...f, scheduledAt: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Duration (minutes)</Label>
                  <Input type="number" min={15} value={form.durationMinutes} onChange={(e) => setForm((f) => ({ ...f, durationMinutes: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Services</Label>
                {services.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">
                    No services yet — load defaults from{" "}
                    <Link href="/services" className="text-primary underline">Workshop Services</Link>.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {services.map((s) => (
                      <Button
                        key={s.id}
                        type="button"
                        size="sm"
                        variant={form.serviceTypes.includes(s.name) ? "default" : "outline"}
                        onClick={() => toggleService(s.name)}
                      >
                        {s.name}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Notes (optional)</Label>
                <Textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Customer requests morning slot…" />
              </div>
              <div className={modalInlineFooterClass}>
                <Button variant="outline" onClick={() => { setCreateOpen(false); resetForm(); }}>Cancel</Button>
                <Button onClick={createAppt} disabled={saving || !form.customerId || !form.scheduledAt} className="gap-1.5">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calendar className="h-4 w-4" />}
                  Book Appointment
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <AppointmentDetailDialog
          appt={viewAppt}
          onClose={() => setViewAppt(null)}
          onStatus={updateStatus}
          onCheckIn={checkIn}
        />
      </div>
    </ModuleGate>
  );
}
