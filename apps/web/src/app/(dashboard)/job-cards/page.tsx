"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  ClipboardList, Plus, Loader2, RefreshCw, CheckCircle2, Users, Clock,
  Banknote, Wrench, Package, Play, FileCheck,
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
import { cn, formatNumber } from "@/lib/utils";
import { useShopWorkspace } from "@/lib/use-shop-profile";

interface JobLine {
  id: string; lineType: string; description?: string | null; quantity: number; unitPrice: number; total: number;
  serviceCatalog?: { name: string } | null;
  variant?: { name: string; product?: { name: string } } | null;
}
interface JobCard {
  id: string; jobNumber: string; status: string; total: number; createdAt?: string;
  complaintNotes?: string | null; beforeNotes?: string | null; afterNotes?: string | null;
  technicianId?: string | null; customerSignature?: string | null;
  customer: { firstName: string; lastName?: string | null; phone: string };
  customerVehicle?: { registrationNo?: string | null; make?: string | null; model?: string | null } | null;
  lines: JobLine[];
}
interface Customer { id: string; firstName: string; lastName?: string | null; phone: string }
interface Service { id: string; name: string; defaultPrice: number; code: string }
interface UserOpt { id: string; firstName: string; lastName?: string | null }

type StatusFilter = "ALL" | "OPEN" | "IN_PROGRESS" | "WAITING_PARTS" | "COMPLETED" | "INVOICED" | "CANCELLED";

const STATUS_CFG: Record<string, { label: string; variant: "success" | "secondary" | "warning" | "danger" | "default" }> = {
  OPEN:           { label: "Open",           variant: "warning"   },
  IN_PROGRESS:    { label: "In Progress",    variant: "default"   },
  WAITING_PARTS:  { label: "Waiting Parts",  variant: "warning"   },
  COMPLETED:      { label: "Completed",      variant: "success"   },
  INVOICED:       { label: "Invoiced",       variant: "success"   },
  CANCELLED:      { label: "Cancelled",      variant: "danger"    },
};

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "OPEN", label: "Open" },
  { key: "IN_PROGRESS", label: "In Progress" },
  { key: "WAITING_PARTS", label: "Waiting Parts" },
  { key: "COMPLETED", label: "Completed" },
  { key: "INVOICED", label: "Invoiced" },
];

const GUIDE = [
  { title: "Create Job Card", desc: "Select customer, assign a service and technician when a vehicle arrives for work." },
  { title: "Track Progress", desc: "Move jobs from Open → In Progress → Completed as workshop work is done." },
  { title: "Notes & Signature", desc: "Record before/after notes and capture customer signature on completion." },
  { title: "Invoice", desc: "Mark as Invoiced when the job is billed via POS or accounts." },
];

function customerName(j: JobCard) {
  return `${j.customer.firstName} ${j.customer.lastName ?? ""}`.trim();
}

function vehicleLabel(j: JobCard) {
  if (j.customerVehicle?.registrationNo) return j.customerVehicle.registrationNo;
  const mm = [j.customerVehicle?.make, j.customerVehicle?.model].filter(Boolean).join(" ");
  return mm || "—";
}

function lineLabel(l: JobLine) {
  return l.serviceCatalog?.name ?? l.variant?.product?.name ?? l.description ?? l.lineType;
}

function buildColumns(
  onView: (j: JobCard) => void,
  onStatus: (id: string, status: string) => void,
): ColumnDef<JobCard>[] {
  return [
    {
      accessorKey: "jobNumber",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Job #" />,
      cell: ({ row }) => (
        <div className="flex items-center gap-2.5 min-w-[120px]">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <ClipboardList className="h-4 w-4 text-primary" />
          </div>
          <OpenRecordButton onClick={() => onView(row.original)} className="font-mono text-xs" title="View job">
            {row.original.jobNumber}
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
        <span className="text-xs font-mono">{vehicleLabel(row.original)}</span>
      ),
    },
    {
      id: "lines",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Lines" />,
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1.5 text-sm">
          <Package className="h-3.5 w-3.5 text-muted-foreground" />
          {row.original.lines.length}
        </span>
      ),
    },
    {
      accessorKey: "total",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Total" />,
      cell: ({ row }) => (
        <span className="text-sm font-bold">LKR {formatNumber(row.original.total)}</span>
      ),
    },
    {
      id: "complaint",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Work Required" />,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground max-w-[180px] truncate block">
          {row.original.complaintNotes || "—"}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => {
        const cfg = STATUS_CFG[row.original.status] ?? { label: row.original.status, variant: "secondary" as const };
        return <Badge variant={cfg.variant} className="h-6 rounded-full px-2.5 text-[11px] font-semibold inline-flex items-center">{cfg.label}</Badge>;
      },
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const j = row.original;
        return (
          <div className="flex gap-1 flex-wrap justify-end">
            <Button variant="ghost" size="sm" className="h-8 rounded-[10px] px-3 text-xs font-semibold text-primary hover:bg-[hsl(var(--primary-soft))]" onClick={() => onView(j)}>
              View
            </Button>
            {j.status === "OPEN" && (
              <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={() => onStatus(j.id, "IN_PROGRESS")}>
                <Play className="h-3 w-3" /> Start
              </Button>
            )}
            {j.status === "IN_PROGRESS" && (
              <Button size="sm" className="h-7 text-[10px] gap-1" onClick={() => onStatus(j.id, "COMPLETED")}>
                <CheckCircle2 className="h-3 w-3" /> Done
              </Button>
            )}
            {j.status === "COMPLETED" && (
              <Button size="sm" className="h-7 text-[10px] gap-1" onClick={() => onStatus(j.id, "INVOICED")}>
                <FileCheck className="h-3 w-3" /> Invoice
              </Button>
            )}
          </div>
        );
      },
    },
  ];
}

function JobDetailDialog({
  job,
  onClose,
  onSave,
  onStatus,
}: {
  job: JobCard | null;
  onClose: () => void;
  onSave: (id: string, afterNotes: string, signature: string) => void;
  onStatus: (id: string, status: string) => void;
}) {
  const [afterNotes, setAfterNotes] = useState("");
  const [signature, setSignature] = useState("");

  useEffect(() => {
    if (job) {
      setAfterNotes(job.afterNotes ?? "");
      setSignature(job.customerSignature ?? "");
    }
  }, [job]);

  if (!job) return null;

  const cfg = STATUS_CFG[job.status] ?? { label: job.status, variant: "secondary" as const };

  return (
    <Dialog open={!!job} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            {job.jobNumber}
            <Badge variant={cfg.variant} className="text-[10px] ml-1">{cfg.label}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-muted/30">
            <div>
              <p className="text-[10px] uppercase text-muted-foreground font-semibold">Customer</p>
              <p className="font-medium">{customerName(job)}</p>
              <p className="text-xs text-muted-foreground font-mono">{job.customer.phone}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-muted-foreground font-semibold">Vehicle</p>
              <p className="font-medium font-mono">{vehicleLabel(job)}</p>
            </div>
          </div>

          {job.complaintNotes && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">Complaint / Work Required</p>
              <p className="text-sm">{job.complaintNotes}</p>
            </div>
          )}

          {job.beforeNotes && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">Before Notes</p>
              <p className="text-sm">{job.beforeNotes}</p>
            </div>
          )}

          <div className="border rounded-lg divide-y">
            {job.lines.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground text-center">No line items</p>
            ) : job.lines.map((l) => (
              <div key={l.id} className="p-3 flex justify-between items-center gap-2">
                <div>
                  <p className="font-medium text-sm">{lineLabel(l)}</p>
                  <p className="text-[10px] text-muted-foreground">{l.lineType} · Qty {l.quantity}</p>
                </div>
                <span className="font-semibold text-sm">LKR {formatNumber(l.total)}</span>
              </div>
            ))}
            <div className="p-3 flex justify-between items-center bg-muted/20">
              <span className="font-semibold">Total</span>
              <span className="font-bold text-primary">LKR {formatNumber(job.total)}</span>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t">
            <div className="space-y-1">
              <Label className="text-xs">After-service notes</Label>
              <Textarea rows={2} value={afterNotes} onChange={(e) => setAfterNotes(e.target.value)} placeholder="Condition after work completed…" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Customer signature (name)</Label>
              <Input value={signature} onChange={(e) => setSignature(e.target.value)} placeholder="Customer name as signature" />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 justify-between pt-2 border-t">
            <div className="flex gap-2 flex-wrap">
              {job.status === "OPEN" && (
                <Button size="sm" variant="outline" className="gap-1" onClick={() => onStatus(job.id, "IN_PROGRESS")}>
                  <Play className="h-3.5 w-3.5" /> Start Job
                </Button>
              )}
              {job.status === "IN_PROGRESS" && (
                <Button size="sm" className="gap-1" onClick={() => onStatus(job.id, "COMPLETED")}>
                  <CheckCircle2 className="h-3.5 w-3.5" /> Mark Complete
                </Button>
              )}
              {job.status === "COMPLETED" && (
                <Button size="sm" className="gap-1" onClick={() => onStatus(job.id, "INVOICED")}>
                  <FileCheck className="h-3.5 w-3.5" /> Mark Invoiced
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={onClose}>Close</Button>
              <Button size="sm" onClick={() => onSave(job.id, afterNotes, signature)}>Save Notes</Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function JobCardsPage() {
  const { profile } = useShopWorkspace();
  const [jobs, setJobs] = useState<JobCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [createOpen, setCreateOpen] = useState(false);
  const [viewJob, setViewJob] = useState<JobCard | null>(null);
  const [form, setForm] = useState({ customerId: "", complaintNotes: "", serviceId: "", technicianId: "" });
  const [saving, setSaving] = useState(false);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<JobCard[]>("/workshop/job-cards");
      setJobs(Array.isArray(res.data) ? res.data : []);
    } catch { toast.error("Failed to load job cards"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);
  useEffect(() => {
    api.get<{ data: Customer[] }>("/customers?limit=200").then((r) => setCustomers(r.data?.data ?? [])).catch(() => {});
    api.get<Service[]>("/workshop/services").then((r) => setServices(Array.isArray(r.data) ? r.data : [])).catch(() => {});
    api.get<{ data: UserOpt[] }>("/users?limit=50").then((r) => setUsers(r.data?.data ?? [])).catch(() => {});
  }, []);

  const resetForm = () => setForm({ customerId: "", complaintNotes: "", serviceId: "", technicianId: "" });

  const createJob = async () => {
    if (!form.customerId) { toast.error("Select a customer"); return; }
    setSaving(true);
    try {
      const svc = services.find((s) => s.id === form.serviceId);
      await api.post("/workshop/job-cards", {
        customerId: form.customerId,
        technicianId: form.technicianId || undefined,
        complaintNotes: form.complaintNotes || undefined,
        lines: svc ? [{
          lineType: "SERVICE",
          serviceCatalogId: svc.id,
          description: svc.name,
          quantity: 1,
          unitPrice: svc.defaultPrice,
        }] : [],
      });
      toast.success("Job card created");
      resetForm();
      setCreateOpen(false);
      fetchJobs();
    } catch (e: unknown) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };

  const updateStatus = useCallback(async (id: string, status: string) => {
    try {
      await api.put(`/workshop/job-cards/${id}`, { status });
      toast.success("Job card updated");
      fetchJobs();
      setViewJob((prev) => (prev?.id === id ? null : prev));
    } catch (e: unknown) { toast.error((e as Error).message); }
  }, [fetchJobs]);

  const saveDetails = useCallback(async (id: string, afterNotes: string, signature: string) => {
    try {
      await api.put(`/workshop/job-cards/${id}`, { afterNotes, customerSignature: signature });
      toast.success("Notes saved");
      fetchJobs();
      setViewJob(null);
    } catch (e: unknown) { toast.error((e as Error).message); }
  }, [fetchJobs]);

  const displayed = useMemo(
    () => statusFilter === "ALL" ? jobs : jobs.filter((j) => j.status === statusFilter),
    [jobs, statusFilter],
  );

  const openCount = jobs.filter((j) => j.status === "OPEN").length;
  const activeCount = jobs.filter((j) => j.status === "IN_PROGRESS").length;
  const totalValue = jobs.reduce((s, j) => s + j.total, 0);

  const STATS = [
    { label: "Total Jobs",     value: jobs.length,                        icon: ClipboardList, color: "text-blue-600",    bg: "bg-blue-500/15", tint: "border-blue-200/70 bg-gradient-to-br from-blue-50 to-white dark:border-blue-500/20 dark:from-blue-500/10 dark:to-transparent" },
    { label: "Open",           value: openCount,                          icon: Clock,         color: "text-amber-600",   bg: "bg-amber-500/15", tint: "border-amber-200/70 bg-gradient-to-br from-amber-50 to-white dark:border-amber-500/20 dark:from-amber-500/10 dark:to-transparent" },
    { label: "In Progress",    value: activeCount,                        icon: Wrench,        color: "text-violet-600",  bg: "bg-violet-500/15", tint: "border-violet-200/70 bg-gradient-to-br from-violet-50 to-white dark:border-violet-500/20 dark:from-violet-500/10 dark:to-transparent" },
    { label: "Workshop Value", value: `LKR ${formatNumber(totalValue)}`,  icon: Banknote,      color: "text-emerald-600", bg: "bg-emerald-500/15", tint: "border-emerald-200/70 bg-gradient-to-br from-emerald-50 to-white dark:border-emerald-500/20 dark:from-emerald-500/10 dark:to-transparent" },
  ];

  const columns = useMemo(
    () => buildColumns((j) => setViewJob(j), updateStatus),
    [updateStatus],
  );

  return (
    <ModuleGate module="workshop">
      <div className="p-4 md:p-5 space-y-4 max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="min-w-0">
            <h1 className="text-[26px] md:text-3xl font-bold tracking-tight leading-tight flex items-center gap-2">
              <span>{profile.emoji}</span> Job Cards
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              Workshop jobs — fitting, balancing, alignment & repairs
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" onClick={fetchJobs} className="gap-1.5">
                <RefreshCw className={`h-[18px] w-[18px] ${loading ? "animate-spin" : ""}`} /> Refresh
              </Button>
              <Button variant="outline" className="gap-1.5" asChild>
                <Link href="/customers"><Users className="h-[18px] w-[18px]" /> Customers</Link>
              </Button>
              <Button variant="outline" className="gap-1.5" asChild>
                <Link href="/appointments"><Clock className="h-[18px] w-[18px]" /> Appointments</Link>
              </Button>
            </div>
            <div className="hidden sm:block h-6 w-px bg-slate-200 dark:bg-white/10 mx-0.5" aria-hidden />
            <Button className="gap-1.5" onClick={() => { resetForm(); setCreateOpen(true); }}>
              <Plus className="h-[18px] w-[18px]" /> New Job Card
            </Button>
          </div>
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

        {/* Status filter pills */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Status:</span>
          {STATUS_FILTERS.map((f) => {
            const count = f.key === "ALL" ? jobs.length : jobs.filter((j) => j.status === f.key).length;
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

        {/* Table */}
        {displayed.length === 0 && !loading ? (
          <Card className="border-dashed rounded-[18px]">
            <CardContent className="p-10 flex flex-col items-center text-center gap-3">
              <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                <ClipboardList className="h-7 w-7 text-primary" />
              </div>
              <h3 className="font-semibold">No job cards yet</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Create a job card when a customer arrives for tyre fitting, balancing, alignment or other workshop services.
              </p>
              <Button className="gap-1.5 mt-2" onClick={() => { resetForm(); setCreateOpen(true); }}>
                <Plus className="h-4 w-4" /> New Job Card
              </Button>
            </CardContent>
          </Card>
        ) : (
          <ClientSideTable
            data={displayed}
            columns={columns}
            searchableColumns={[
              { id: "jobNumber", title: "Job #" },
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
            isShowExportButtons={{ isShow: true, fileName: "job-cards-export" }}
          />
        )}

        {/* Guide */}
        <div className="flex flex-wrap gap-2">
          {GUIDE.map((g) => (
            <div
              key={g.title}
              title={g.desc}
              className="inline-flex items-center gap-2 h-9 px-3 rounded-xl border bg-card text-xs font-medium max-w-full"
            >
              <span className="font-semibold text-foreground shrink-0">{g.title}</span>
              <span className="text-muted-foreground truncate hidden sm:inline">{g.desc}</span>
            </div>
          ))}
        </div>

        {/* Create dialog */}
        <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) resetForm(); }}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>New Job Card</DialogTitle>
            </DialogHeader>
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
              <div className="space-y-1">
                <Label className="text-xs">Service (optional)</Label>
                <Select value={form.serviceId || undefined} onValueChange={(v) => setForm((f) => ({ ...f, serviceId: v }))}>
                  <SelectTrigger><SelectValue placeholder={services.length ? "Select service" : "Load services first"} /></SelectTrigger>
                  <SelectContent>
                    {services.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name} — LKR {formatNumber(s.defaultPrice)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {services.length === 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    No services yet — go to <Link href="/services" className="text-primary underline">Workshop Services</Link> and load defaults.
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Technician</Label>
                <Select value={form.technicianId || undefined} onValueChange={(v) => setForm((f) => ({ ...f, technicianId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Assign technician (optional)" /></SelectTrigger>
                  <SelectContent>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.firstName} {u.lastName ?? ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Complaint / work required</Label>
                <Textarea
                  rows={3}
                  value={form.complaintNotes}
                  onChange={(e) => setForm((f) => ({ ...f, complaintNotes: e.target.value }))}
                  placeholder="e.g. Front tyres worn, need balancing after replacement"
                />
              </div>
              <div className={modalInlineFooterClass}>
                <Button type="button" variant="outline" onClick={() => { setCreateOpen(false); resetForm(); }}>
                  Cancel
                </Button>
                <Button type="button" onClick={createJob} disabled={saving || !form.customerId} className="gap-1.5">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}
                  Create Job Card
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <JobDetailDialog
          job={viewJob}
          onClose={() => setViewJob(null)}
          onSave={saveDetails}
          onStatus={updateStatus}
        />
      </div>
    </ModuleGate>
  );
}
