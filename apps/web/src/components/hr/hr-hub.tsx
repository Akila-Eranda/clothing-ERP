"use client";

import { useState, useEffect, useCallback } from "react";
import {
  UserCog, Plus, Users, Clock, DollarSign, RefreshCw,
  Phone, Mail, CheckCircle2, XCircle, AlertCircle, Loader2,
  CalendarDays, Banknote, ChevronLeft, ChevronRight,
  X, FileText, BarChart3, Printer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { ColumnDef } from "@tanstack/react-table";
import { ClientSideTable } from "@/components/table/client-side-table";
import { DataTableColumnHeader } from "@/components/table/data-table-column-header";
import { TableActionsRow } from "@/components/table/table-actions-row";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { parseApiList } from "@/lib/parse-api-list";
import { AddEmployeeModal, type Employee } from "@/components/hr/add-employee-modal";
import { useReceiptSettings } from "@/lib/use-receipt-settings";
import { usePayslipSettings } from "@/lib/use-payslip-settings";
import { printThermalPayslip } from "@/lib/payslip-print";
import Link from "next/link";

function fmtLkr(value: number | null | undefined) {
  return `LKR ${(value ?? 0).toLocaleString()}`;
}

// ── Types ────────────────────────────────────────────────────────────────
type AttendanceStatus = "PRESENT" | "ABSENT" | "HALF_DAY" | "ON_LEAVE" | "LATE" | "LEAVE" | "HOLIDAY";
interface EmpWithAttendance extends Employee { todayAttendance: { status: AttendanceStatus } | null }
interface LeaveRequest {
  id: string; employeeId: string; startDate: string; endDate: string;
  leaveType: string; reason?: string | null; status: string;
  notes?: string | null; createdAt: string;
  employee: { firstName: string; lastName: string; code: string; department?: string | null; designation?: string | null };
}
interface AttnSummaryRow {
  id: string; firstName: string; lastName: string; code: string;
  designation?: string | null; department?: string | null;
  summary: Record<string, number>;
}
interface Payroll {
  id: string; employeeId: string; month: number; year: number;
  basicSalary: number; allowances: number; bonus: number; deductions: number; netSalary: number;
  isPaid: boolean; paidAt?: string | null;
  employee: { firstName: string; lastName: string; designation?: string | null; code: string };
}

// ── Attendance status config ──────────────────────────────────────────────
const LEAVE_TYPES = ["CASUAL","SICK","ANNUAL","MATERNITY","PATERNITY","OTHER"];

const ATTN_STATUS: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  PRESENT:  { label: "Present",   color: "text-emerald-600", bg: "bg-emerald-500/10", icon: CheckCircle2 },
  ABSENT:   { label: "Absent",    color: "text-red-600",     bg: "bg-red-500/10",     icon: XCircle },
  HALF_DAY: { label: "Half Day",  color: "text-amber-600",   bg: "bg-amber-500/10",   icon: AlertCircle },
  ON_LEAVE: { label: "Leave",     color: "text-violet-600",  bg: "bg-violet-500/10",  icon: CalendarDays },
  LEAVE:    { label: "Leave",     color: "text-violet-600",  bg: "bg-violet-500/10",  icon: CalendarDays },
  LATE:     { label: "Late",      color: "text-blue-600",    bg: "bg-blue-500/10",    icon: Clock },
  HOLIDAY:  { label: "Holiday",   color: "text-sky-600",     bg: "bg-sky-500/10",     icon: CalendarDays },
};

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// ── GenerateAllModal ────────────────────────────────────────────────────
function GenerateAllModal({ month, year, onClose, onDone }: { month: number; year: number; onClose: () => void; onDone: () => void }) {
  const [allowances, setAllowances]     = useState("0");
  const [bonus, setBonus]               = useState("0");
  const [deductAbsent, setDeductAbsent] = useState(false);
  const [perDay, setPerDay]             = useState("0");
  const [loading, setLoading]           = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      const res = await api.post("/hr/employees/payroll/bulk", {
        month, year,
        allowances: parseFloat(allowances) || 0,
        bonus:      parseFloat(bonus)      || 0,
        deductAbsent,
        absentDeduction: parseFloat(perDay) || 0,
      });
      const count = ((res as any).data as any[])?.length ?? 0;
      toast.success(`Payroll generated for ${count} employees`);
      onDone(); onClose();
    } catch (e: unknown) { toast.error((e as Error).message ?? "Failed"); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-background rounded-2xl shadow-2xl border w-full max-w-md overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b">
          <div className="h-9 w-9 rounded-xl bg-emerald-500/10 flex items-center justify-center"><DollarSign className="h-4 w-4 text-emerald-600" /></div>
          <div><h2 className="font-bold text-base">Generate All Payrolls</h2><p className="text-xs text-muted-foreground">{MONTHS[month-1]} {year} · All active employees</p></div>
          <button onClick={onClose} className="ml-auto p-1.5 rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs font-semibold">Allowances (LKR)</Label><Input type="number" min={0} value={allowances} onChange={(e) => setAllowances(e.target.value)} /></div>
            <div className="space-y-1.5"><Label className="text-xs font-semibold">Bonus (LKR)</Label><Input type="number" min={0} value={bonus} onChange={(e) => setBonus(e.target.value)} /></div>
          </div>
          <div className="p-3 rounded-xl border space-y-3">
            <div className="flex items-center justify-between">
              <div><p className="text-sm font-medium">Deduct Absent Days</p><p className="text-xs text-muted-foreground">Auto-deduct based on attendance records</p></div>
              <Switch checked={deductAbsent} onCheckedChange={setDeductAbsent} />
            </div>
            {deductAbsent && <div className="space-y-1.5"><Label className="text-xs font-semibold">Deduction per Absent Day (LKR)</Label><Input type="number" min={0} value={perDay} onChange={(e) => setPerDay(e.target.value)} /></div>}
          </div>
          <p className="text-xs text-amber-600 bg-amber-500/10 rounded-lg px-3 py-2">Existing payroll entries for this month will be overwritten.</p>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t bg-muted/10">
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button onClick={submit} disabled={loading} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 min-w-[140px]">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <DollarSign className="h-3.5 w-3.5" />} Generate All
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── NewLeaveModal ────────────────────────────────────────────────────────
function NewLeaveModal({ employees, onClose, onSaved }: { employees: Employee[]; onClose: () => void; onSaved: () => void }) {
  const [empId, setEmpId]         = useState("");
  const [startDate, setStart]     = useState(new Date().toISOString().split("T")[0]);
  const [endDate, setEnd]         = useState(new Date().toISOString().split("T")[0]);
  const [leaveType, setType]      = useState("CASUAL");
  const [reason, setReason]       = useState("");
  const [loading, setLoading]     = useState(false);

  const days = Math.max(1, Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1);

  const submit = async () => {
    if (!empId) { toast.error("Select an employee"); return; }
    setLoading(true);
    try {
      await api.post("/hr/employees/leaves", { employeeId: empId, startDate, endDate, leaveType, reason: reason || undefined });
      toast.success("Leave request created");
      onSaved(); onClose();
    } catch (e: unknown) { toast.error((e as Error).message ?? "Failed"); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-background rounded-2xl shadow-2xl border w-full max-w-md overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b">
          <div className="h-9 w-9 rounded-xl bg-violet-500/10 flex items-center justify-center"><CalendarDays className="h-4 w-4 text-violet-600" /></div>
          <div><h2 className="font-bold text-base">New Leave Request</h2><p className="text-xs text-muted-foreground">Submit a leave for an employee</p></div>
          <button onClick={onClose} className="ml-auto p-1.5 rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Employee *</Label>
            <Select value={empId} onValueChange={setEmpId}>
              <SelectTrigger><SelectValue placeholder="Select employee…" /></SelectTrigger>
              <SelectContent>{employees.filter((e) => e.isActive).map((e) => <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName} ({e.code})</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Leave Type</Label>
            <Select value={leaveType} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{LEAVE_TYPES.map((t) => <SelectItem key={t} value={t}>{t.charAt(0)+t.slice(1).toLowerCase()} Leave</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs font-semibold">Start Date *</Label><Input type="date" value={startDate} onChange={(e) => setStart(e.target.value)} /></div>
            <div className="space-y-1.5"><Label className="text-xs font-semibold">End Date *</Label><Input type="date" value={endDate} min={startDate} onChange={(e) => setEnd(e.target.value)} /></div>
          </div>
          <p className="text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2 font-medium">Duration: {days} day{days > 1 ? "s" : ""}</p>
          <div className="space-y-1.5"><Label className="text-xs font-semibold">Reason</Label><Input placeholder="Brief reason for leave…" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t bg-muted/10">
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button onClick={submit} disabled={loading || !empId} className="gap-1.5 min-w-[130px]">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarDays className="h-3.5 w-3.5" />} Submit Leave
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Monthly summary columns ──────────────────────────────────────────────
function buildAttnSummaryColumns(): ColumnDef<AttnSummaryRow>[] {
  return [
    { id: "employee", header: ({ column }) => <DataTableColumnHeader column={column} title="Employee" />,
      cell: ({ row }) => <div><p className="font-medium text-sm">{row.original.firstName} {row.original.lastName}</p><p className="text-[10px] text-muted-foreground">{row.original.designation ?? row.original.department ?? "—"}</p></div> },
    { id: "present",  header: ({ column }) => <DataTableColumnHeader column={column} title="Present" />,  cell: ({ row }) => <span className="text-sm font-bold text-emerald-600">{row.original.summary.PRESENT ?? 0}</span> },
    { id: "absent",   header: ({ column }) => <DataTableColumnHeader column={column} title="Absent" />,   cell: ({ row }) => <span className="text-sm font-bold text-red-500">{row.original.summary.ABSENT ?? 0}</span> },
    { id: "halfday",  header: ({ column }) => <DataTableColumnHeader column={column} title="Half Day" />, cell: ({ row }) => <span className="text-sm text-amber-600">{row.original.summary.HALF_DAY ?? 0}</span> },
    { id: "leave",    header: ({ column }) => <DataTableColumnHeader column={column} title="On Leave" />, cell: ({ row }) => <span className="text-sm text-violet-600">{(row.original.summary.ON_LEAVE ?? 0) + (row.original.summary.LEAVE ?? 0)}</span> },
    { id: "late",     header: ({ column }) => <DataTableColumnHeader column={column} title="Late" />,     cell: ({ row }) => <span className="text-sm text-blue-500">{row.original.summary.LATE ?? 0}</span> },
    { id: "pct", header: ({ column }) => <DataTableColumnHeader column={column} title="Att. %" />,
      cell: ({ row }) => {
        const s = row.original.summary;
        const total = (s.PRESENT??0)+(s.ABSENT??0)+(s.HALF_DAY??0)+(s.ON_LEAVE??0)+(s.LATE??0)+(s.LEAVE??0);
        const pct = total > 0 ? Math.round(((s.PRESENT??0)+(s.LATE??0))/total*100) : 0;
        return <span className={`text-sm font-bold ${pct>=90?"text-emerald-600":pct>=75?"text-amber-600":"text-red-500"}`}>{pct}%</span>;
      },
    },
  ];
}

// ── Leave request columns ────────────────────────────────────────────────
function buildLeaveColumns(onUpdate: (id: string, status: string) => void): ColumnDef<LeaveRequest>[] {
  return [
    { id: "employee", header: ({ column }) => <DataTableColumnHeader column={column} title="Employee" />,
      cell: ({ row }) => {
        const emp = row.original.employee;
        if (!emp) return <span className="text-xs text-muted-foreground">—</span>;
        return (
          <div>
            <p className="font-medium text-sm">{emp.firstName} {emp.lastName}</p>
            <p className="text-[10px] text-muted-foreground font-mono">{emp.code ?? "—"}</p>
          </div>
        );
      },
    },
    { accessorKey: "leaveType", header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
      cell: ({ row }) => <Badge variant="secondary" className="text-[10px] uppercase">{row.original.leaveType}</Badge> },
    { id: "dates", header: ({ column }) => <DataTableColumnHeader column={column} title="Period" />,
      cell: ({ row }) => {
        const s = new Date(row.original.startDate), e = new Date(row.original.endDate);
        const d = Math.round((e.getTime()-s.getTime())/86400000)+1;
        return <div><p className="text-xs">{s.toLocaleDateString("en-LK",{day:"2-digit",month:"short"})} – {e.toLocaleDateString("en-LK",{day:"2-digit",month:"short",year:"numeric"})}</p><p className="text-[10px] text-muted-foreground">{d} day{d>1?"s":""}</p></div>;
      },
    },
    { accessorKey: "reason", header: ({ column }) => <DataTableColumnHeader column={column} title="Reason" />,
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.reason ?? "—"}</span> },
    { id: "status", accessorKey: "status", header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => {
        const s = row.original.status;
        const v = s==="APPROVED"?"success":s==="REJECTED"?"danger":"warning";
        return <Badge variant={v as "success"|"danger"|"warning"} className="text-[10px]">{s}</Badge>;
      },
    },
    { id: "actions", cell: ({ row }) => {
        if (row.original.status !== "PENDING") return null;
        return (
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" className="h-7 text-xs text-emerald-600 border-emerald-200 hover:bg-emerald-50 gap-1" onClick={() => onUpdate(row.original.id,"APPROVED")}><CheckCircle2 className="h-3 w-3" /> Approve</Button>
            <Button size="sm" variant="outline" className="h-7 text-xs text-red-500 border-red-200 hover:bg-red-50 gap-1" onClick={() => onUpdate(row.original.id,"REJECTED")}><XCircle className="h-3 w-3" /> Reject</Button>
          </div>
        );
      },
    },
  ];
}

// ── Attendance columns ───────────────────────────────────────────────────
function buildAttnColumns(
  attnMap: Record<string, AttendanceStatus>,
  setAttnMap: React.Dispatch<React.SetStateAction<Record<string, AttendanceStatus>>>,
): ColumnDef<EmpWithAttendance>[] {
  return [
    {
      id: "employee",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Employee" />,
      cell: ({ row }) => (
        <div>
          <p className="font-medium text-sm">{row.original.firstName} {row.original.lastName}</p>
          <p className="text-[10px] text-muted-foreground font-mono">{row.original.code}</p>
        </div>
      ),
    },
    {
      accessorKey: "designation",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Designation" />,
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.designation ?? "—"}</span>,
    },
    {
      id: "branch",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Branch" />,
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.branch?.name ?? "—"}</span>,
    },
    {
      id: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => {
        const status = attnMap[row.original.id] as AttendanceStatus | undefined;
        const conf = status ? ATTN_STATUS[status] : null;
        return conf ? (
          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${conf.bg} ${conf.color}`}>
            <conf.icon className="h-2.5 w-2.5" />{conf.label}
          </span>
        ) : <span className="text-xs text-muted-foreground">—</span>;
      },
    },
    {
      id: "markAs",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Mark As" />,
      cell: ({ row }) => (
        <div className="flex gap-1">
          {(["PRESENT","ABSENT","HALF_DAY","ON_LEAVE","LATE"] as AttendanceStatus[]).map((s) => {
            const c = ATTN_STATUS[s];
            return (
              <button key={s} onClick={() => setAttnMap((p) => ({ ...p, [row.original.id]: s }))}
                className={`text-[9px] font-bold px-1.5 py-1 rounded border transition-all ${
                  attnMap[row.original.id] === s ? `${c.bg} ${c.color} border-current` : "border-border hover:bg-muted"
                }`}>
                {s === "HALF_DAY" ? "H" : s === "ON_LEAVE" ? "L" : s[0]}
              </button>
            );
          })}
        </div>
      ),
    },
  ];
}

// ── Payroll columns ────────────────────────────────────────────────────────
function buildPayrollColumns(
  onMarkPaid: (id: string) => void,
  onPrintPayslip: (p: Payroll) => void,
  printingId: string | null,
): ColumnDef<Payroll>[] {
  return [
    {
      id: "employee",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Employee" />,
      cell: ({ row }) => {
        const emp = row.original.employee;
        if (!emp) return <span className="text-xs text-muted-foreground">—</span>;
        return (
          <div>
            <p className="font-medium text-sm">{emp.firstName} {emp.lastName}</p>
            <p className="text-[10px] text-muted-foreground font-mono">{emp.code ?? "—"}</p>
          </div>
        );
      },
    },
    {
      accessorKey: "basicSalary",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Basic" />,
      cell: ({ row }) => <span className="text-sm">{fmtLkr(row.original.basicSalary)}</span>,
    },
    {
      id: "bonusAllowances",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Bonus + Allow." />,
      cell: ({ row }) => (
        <span className="text-sm text-emerald-600">
          +LKR {((row.original.bonus ?? 0) + (row.original.allowances ?? 0)).toLocaleString()}
        </span>
      ),
    },
    {
      accessorKey: "deductions",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Deductions" />,
      cell: ({ row }) => <span className="text-sm text-red-500">-LKR {(row.original.deductions ?? 0).toLocaleString()}</span>,
    },
    {
      accessorKey: "netSalary",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Net Pay" />,
      cell: ({ row }) => <span className="text-sm font-bold text-primary">{fmtLkr(row.original.netSalary)}</span>,
    },
    {
      id: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => (
        <Badge variant={row.original.isPaid ? "success" : "warning"} className="text-[10px]">
          {row.original.isPaid ? "Paid" : "Pending"}
        </Badge>
      ),
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <div className="flex gap-1.5">
          {!row.original.isPaid && (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => onMarkPaid(row.original.id)}>
              <CheckCircle2 className="h-3 w-3" /> Mark Paid
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1"
            disabled={printingId === row.original.id}
            onClick={() => onPrintPayslip(row.original)}
          >
            {printingId === row.original.id
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <Printer className="h-3 w-3" />}
            Print
          </Button>
        </div>
      ),
    },
  ];
}

// ── Employee columns ──────────────────────────────────────────────────────
function buildEmpColumns(onEdit: (e: Employee) => void, onDeactivate: (e: Employee) => void): ColumnDef<Employee>[] {
  return [
    {
      id: "employee",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Employee" />,
      cell: ({ row }) => {
        const e = row.original;
        const initials = `${e.firstName?.[0] ?? ""}${e.lastName?.[0] ?? ""}`.toUpperCase() || "?";
        return (
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
              {initials}
            </div>
            <div>
              <p className="text-sm font-semibold">{e.firstName} {e.lastName}</p>
              <p className="text-[10px] text-muted-foreground font-mono">{e.code}</p>
            </div>
          </div>
        );
      },
    },
    {
      id: "contact",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Contact" />,
      cell: ({ row }) => (
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5 text-xs font-mono"><Phone className="h-3 w-3 text-muted-foreground" />{row.original.phone}</div>
          {row.original.email && <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Mail className="h-3 w-3" /><span className="truncate max-w-[140px]">{row.original.email}</span></div>}
        </div>
      ),
    },
    {
      accessorKey: "designation",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Role / Dept" />,
      cell: ({ row }) => (
        <div>
          <p className="text-sm">{row.original.designation ?? "—"}</p>
          {row.original.department && <p className="text-[10px] text-muted-foreground">{row.original.department}</p>}
        </div>
      ),
    },
    {
      id: "branch",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Branch" />,
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.branch?.name ?? "—"}</span>,
    },
    {
      accessorKey: "basicSalary",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Salary" />,
      cell: ({ row }) => <span className="text-sm font-semibold">{fmtLkr(row.original.basicSalary)}</span>,
    },
    {
      accessorKey: "joiningDate",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Joined" />,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.joiningDate
            ? new Date(row.original.joiningDate).toLocaleDateString("en-LK", { day: "2-digit", month: "short", year: "numeric" })
            : "—"}
        </span>
      ),
    },
    {
      id: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => (
        <Badge variant={row.original.isActive ? "success" : "secondary"} className="text-[10px]">
          {row.original.isActive ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <TableActionsRow
          editAction={{ action: () => onEdit(row.original) }}
          dropMoreActions={row.original.isActive ? [{ text: "Deactivate", function: () => onDeactivate(row.original) }] : []}
        />
      ),
    },
  ];
}

export type HrSection = "employees" | "attendance" | "payroll" | "leaves";

const SECTION_META: Record<HrSection, { title: string; description: string }> = {
  employees: { title: "Employees", description: "Manage staff profiles and roles" },
  attendance: { title: "Attendance", description: "Daily and monthly attendance tracking" },
  payroll: { title: "Payroll", description: "Generate and pay salaries" },
  leaves: { title: "Leaves", description: "Leave requests and approvals" },
};

export function HrHub({ section }: { section: HrSection }) {
  const today = new Date().toISOString().split("T")[0];
  const now   = new Date();
  const { settings: receiptSettings } = useReceiptSettings();
  const { settings: payslipSettings } = usePayslipSettings();

  // Employees
  const [employees, setEmployees]       = useState<Employee[]>([]);
  const [empLoading, setEmpLoading]     = useState(true);
  const [addOpen, setAddOpen]           = useState(false);
  const [editEmployee, setEditEmployee] = useState<Employee | undefined>();

  // Attendance
  const [attnDate, setAttnDate]         = useState(today);
  const [attnRows, setAttnRows]         = useState<EmpWithAttendance[]>([]);
  const [attnMap, setAttnMap]           = useState<Record<string, AttendanceStatus>>({});
  const [attnLoading, setAttnLoading]   = useState(false);
  const [attnSaving, setAttnSaving]     = useState(false);

  // Attendance – monthly summary
  const [attnView, setAttnView]           = useState<"daily"|"monthly">("daily");
  const [summaryMonth, setSummaryMonth]   = useState(now.toISOString().slice(0,7));
  const [summaryRows, setSummaryRows]     = useState<AttnSummaryRow[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Payroll
  const [payMonth, setPayMonth]       = useState(now.getMonth() + 1);
  const [payYear, setPayYear]         = useState(now.getFullYear());
  const [payrolls, setPayrolls]       = useState<Payroll[]>([]);
  const [payLoading, setPayLoading]   = useState(false);
  const [genEmpId, setGenEmpId]       = useState("");
  const [genAllowances, setGenAllowances] = useState("0");
  const [genBonus, setGenBonus]       = useState("0");
  const [genDeduct, setGenDeduct]     = useState("0");
  const [genLoading, setGenLoading]   = useState(false);
  const [genAllOpen, setGenAllOpen]   = useState(false);
  const [printingPayslipId, setPrintingPayslipId] = useState<string | null>(null);

  // Leaves
  const [leaves, setLeaves]           = useState<LeaveRequest[]>([]);
  const [leaveLoading, setLeaveLoading] = useState(false);
  const [leaveStatus, setLeaveStatus] = useState("ALL");
  const [newLeaveOpen, setNewLeaveOpen] = useState(false);

  // ── Fetch employees ───────────────────────────────────────────────────
  const fetchEmployees = useCallback(async () => {
    setEmpLoading(true);
    try {
      const res = await api.get<{ data: Employee[] }>("/hr/employees?limit=200");
      setEmployees(parseApiList<Employee>(res.data));
    } catch { toast.error("Failed to load employees"); }
    finally { setEmpLoading(false); }
  }, []);

  useEffect(() => { fetchEmployees(); }, [fetchEmployees]);

  const handleDeactivate = async (emp: Employee) => {
    if (!window.confirm(`Deactivate ${emp.firstName}?`)) return;
    try { await api.delete(`/hr/employees/${emp.id}`); toast.success("Employee deactivated"); fetchEmployees(); }
    catch { toast.error("Failed to deactivate employee"); }
  };

  // ── Fetch attendance ──────────────────────────────────────────────────
  const fetchAttendance = useCallback(async () => {
    setAttnLoading(true);
    try {
      const res = await api.get<EmpWithAttendance[]>(`/hr/employees/attendance/daily?date=${attnDate}`);
      const rows = parseApiList<EmpWithAttendance>(res.data);
      setAttnRows(rows);
      const map: Record<string, AttendanceStatus> = {};
      rows.forEach((r) => { if (r.todayAttendance) map[r.id] = r.todayAttendance.status; });
      setAttnMap(map);
    } catch { toast.error("Failed to load attendance"); }
    finally { setAttnLoading(false); }
  }, [attnDate]);

  // ── Fetch monthly attendance summary ─────────────────────────────────
  const fetchMonthlySummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const res = await api.get<AttnSummaryRow[]>(`/hr/employees/attendance/monthly-summary?month=${summaryMonth}`);
      setSummaryRows(parseApiList<AttnSummaryRow>(res.data));
    } catch { toast.error("Failed to load summary"); }
    finally { setSummaryLoading(false); }
  }, [summaryMonth]);

  // ── Fetch leaves ──────────────────────────────────────────────────────
  const fetchLeaves = useCallback(async () => {
    setLeaveLoading(true);
    try {
      const q = leaveStatus !== "ALL" ? `?status=${leaveStatus}` : "";
      const res = await api.get<LeaveRequest[]>(`/hr/employees/leaves${q}`);
      setLeaves(parseApiList<LeaveRequest>(res.data));
    } catch { toast.error("Failed to load leaves"); }
    finally { setLeaveLoading(false); }
  }, [leaveStatus]);

  // ── Fetch payroll ──────────────────────────────────────────────────────
  const fetchPayrolls = useCallback(async () => {
    setPayLoading(true);
    try {
      const res = await api.get<Payroll[]>(`/hr/employees/payroll?month=${payMonth}&year=${payYear}`);
      setPayrolls(parseApiList<Payroll>(res.data));
    } catch { toast.error("Failed to load payroll"); }
    finally { setPayLoading(false); }
  }, [payMonth, payYear]);

  useEffect(() => {
    if (section === "attendance") {
      if (attnView === "daily") void fetchAttendance();
      else void fetchMonthlySummary();
    }
    if (section === "payroll") void fetchPayrolls();
    if (section === "leaves") void fetchLeaves();
  }, [section, attnView, fetchAttendance, fetchMonthlySummary, fetchPayrolls, fetchLeaves]);

  const saveAttendance = async () => {
    const rows = Object.entries(attnMap).map(([employeeId, status]) => ({ employeeId, status }));
    if (!rows.length) { toast.error("Mark at least one employee"); return; }
    setAttnSaving(true);
    try {
      await api.post("/hr/employees/attendance/bulk", { date: attnDate, rows });
      toast.success("Attendance saved");
    } catch { toast.error("Failed to save"); }
    finally { setAttnSaving(false); }
  };

  const generatePayroll = async () => {
    if (!genEmpId) { toast.error("Select employee"); return; }
    setGenLoading(true);
    try {
      await api.post("/hr/employees/payroll", {
        employeeId: genEmpId, month: payMonth, year: payYear,
        allowances: parseFloat(genAllowances) || 0,
        bonus: parseFloat(genBonus) || 0,
        deductions: parseFloat(genDeduct) || 0,
      });
      toast.success("Payroll generated");
      setGenEmpId(""); setGenAllowances("0"); setGenBonus("0"); setGenDeduct("0");
      fetchPayrolls();
    } catch { toast.error("Failed to generate payroll"); }
    finally { setGenLoading(false); }
  };

  const updateLeaveStatus = async (id: string, status: string) => {
    try {
      await api.put(`/hr/employees/leaves/${id}/status`, { status });
      toast.success(status === "APPROVED" ? "Leave approved" : "Leave rejected");
      fetchLeaves();
    } catch { toast.error("Failed to update leave"); }
  };

  const markPaid = async (id: string) => {
    try { await api.put(`/hr/employees/payroll/${id}/paid`, {}); toast.success("Marked as paid — expense recorded"); fetchPayrolls(); }
    catch { toast.error("Failed to mark payroll as paid"); }
  };

  const handlePrintPayslip = async (p: Payroll) => {
    setPrintingPayslipId(p.id);
    try {
      await printThermalPayslip(p, payMonth, payYear, receiptSettings, payslipSettings);
      toast.success("Payslip sent to printer");
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to print payslip");
    } finally {
      setPrintingPayslipId(null);
    }
  };

  // Stats
  const employeeList   = Array.isArray(employees) ? employees : [];
  const leaveList      = Array.isArray(leaves) ? leaves : [];
  const activeCount    = employeeList.filter((e) => e.isActive).length;
  const totalPayroll   = employeeList.reduce((s, e) => s + (e.basicSalary ?? 0), 0);
  const pendingLeaves  = leaveList.filter((l) => l.status === "PENDING").length;
  const STATS = [
    { label: "Total Employees", value: employeeList.length, icon: Users,     color: "text-blue-500",    bg: "bg-blue-500/10" },
    { label: "Active",          value: activeCount,      icon: UserCog,   color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { label: "Monthly Payroll", value: `LKR ${(totalPayroll / 1000).toFixed(0)}K`, icon: DollarSign, color: "text-purple-500", bg: "bg-purple-500/10" },
    { label: "Pending Leaves",  value: pendingLeaves,    icon: FileText,  color: "text-amber-500",   bg: "bg-amber-500/10" },
  ];

  const empColumns         = buildEmpColumns((e) => { setEditEmployee(e); setAddOpen(true); }, handleDeactivate);
  const attnColumns        = buildAttnColumns(attnMap, setAttnMap);
  const attnSummaryColumns = buildAttnSummaryColumns();
  const payrollColumns     = buildPayrollColumns(markPaid, handlePrintPayslip, printingPayslipId);
  const leaveColumns       = buildLeaveColumns(updateLeaveStatus);

  const payrollList = Array.isArray(payrolls) ? payrolls : [];
  const unpaidEmployees = employeeList.filter((e) => e.isActive && !payrollList.find((p) => p.employeeId === e.id));

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">{SECTION_META[section].title}</h1>
          <p className="text-sm text-muted-foreground">{SECTION_META[section].description}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <Button
            variant="outline"
            onClick={() => {
              if (section === "employees") void fetchEmployees();
              else if (section === "attendance") void (attnView === "daily" ? fetchAttendance() : fetchMonthlySummary());
              else if (section === "payroll") void fetchPayrolls();
              else void fetchLeaves();
            }}
            className="h-10 rounded-[12px] gap-1.5 text-sm px-3.5"
          >
            <RefreshCw className={`h-[18px] w-[18px] ${empLoading || attnLoading || payLoading || leaveLoading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          {section === "employees" && (
            <>
              <div className="hidden sm:block h-6 w-px bg-slate-200 dark:bg-white/10 mx-0.5" aria-hidden />
              <Button className="h-10 rounded-[12px] gap-1.5 text-sm px-4" onClick={() => { setEditEmployee(undefined); setAddOpen(true); }}>
                <Plus className="h-[18px] w-[18px]" /> Add Employee
              </Button>
            </>
          )}
        </div>
      </div>

      {section === "employees" && (
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {STATS.map((st) => (
          <Card key={st.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${st.bg}`}><st.icon className={`h-5 w-5 ${st.color}`} /></div>
              <div><p className="text-xl font-bold">{st.value}</p><p className="text-xs text-muted-foreground">{st.label}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>
      )}

        {/* ── Employees ── */}
        {section === "employees" && (
        <div className="mt-0">
          <ClientSideTable
            data={employeeList}
            columns={empColumns}
            pageCount={Math.ceil(employeeList.length / 10)}
            searchableColumns={[{ id: "designation", title: "Role" }]}
            filterableColumns={[{
              id: "isActive", title: "Status",
              options: [{ value: "true", label: "Active" }, { value: "false", label: "Inactive" }],
            }]}
            isShowExportButtons={{ isShow: true, fileName: "employees-export" }}
          />
        </div>
        )}

        {/* ── Attendance ── */}
        {section === "attendance" && (
        <div className="mt-4 space-y-4">
          {/* View toggle */}
          <div className="flex items-center gap-2 border rounded-lg p-1 w-fit bg-muted/30">
            <button onClick={() => setAttnView("daily")}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${attnView==="daily"?"bg-background shadow text-foreground":"text-muted-foreground hover:text-foreground"}`}>Daily</button>
            <button onClick={() => setAttnView("monthly")}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${attnView==="monthly"?"bg-background shadow text-foreground":"text-muted-foreground hover:text-foreground"}`}>Monthly Summary</button>
          </div>

          {attnView === "daily" ? (
            <>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <button onClick={() => { const d = new Date(attnDate); d.setDate(d.getDate()-1); setAttnDate(d.toISOString().split("T")[0]); }}
                    className="p-1.5 rounded-lg border hover:bg-muted"><ChevronLeft className="h-4 w-4" /></button>
                  <Input type="date" value={attnDate} onChange={(e) => setAttnDate(e.target.value)} className="w-40 text-sm" />
                  <button onClick={() => { const d = new Date(attnDate); d.setDate(d.getDate()+1); setAttnDate(d.toISOString().split("T")[0]); }}
                    className="p-1.5 rounded-lg border hover:bg-muted"><ChevronRight className="h-4 w-4" /></button>
                </div>
                <Button size="sm" variant="outline" onClick={fetchAttendance} className="gap-1.5" disabled={attnLoading}>
                  <RefreshCw className={`h-3.5 w-3.5 ${attnLoading ? "animate-spin" : ""}`} /> Load
                </Button>
                <div className="flex gap-1.5 ml-auto flex-wrap">
                  {(["PRESENT","ABSENT","HALF_DAY","ON_LEAVE","LATE"] as const).map((k) => {
                    const v = ATTN_STATUS[k]; const Icon = v.icon;
                    return <span key={k} className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full ${v.bg} ${v.color}`}><Icon className="h-2.5 w-2.5" />{v.label}</span>;
                  })}
                </div>
              </div>
              {attnLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : attnRows.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground border rounded-xl"><Users className="h-8 w-8 mx-auto mb-2 opacity-30" /><p>Click Load to fetch employees for this date</p></div>
              ) : (
                <>
                  <ClientSideTable data={attnRows} columns={attnColumns} pageCount={Math.ceil(attnRows.length/10)} searchableColumns={[{id:"designation",title:"Employee / Role"}]} filterableColumns={[]} isShowExportButtons={{isShow:false,fileName:""}} />
                  <div className="flex justify-between items-center">
                    <div className="flex gap-3 text-xs flex-wrap">
                      {(["PRESENT","ABSENT","HALF_DAY","ON_LEAVE","LATE"] as const).map((k) => {
                        const v = ATTN_STATUS[k]; const Icon = v.icon;
                        const count = Object.values(attnMap).filter((s) => s === k).length;
                        return count > 0 ? <span key={k} className={`inline-flex items-center gap-1 font-semibold ${v.color}`}><Icon className="h-3 w-3" />{count} {v.label}</span> : null;
                      })}
                      <span className="text-muted-foreground">{attnRows.length - Object.keys(attnMap).length} unmarked</span>
                    </div>
                    <Button onClick={saveAttendance} disabled={attnSaving} className="gap-1.5">
                      {attnSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Save Attendance
                    </Button>
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 flex-wrap">
                <Input type="month" value={summaryMonth} onChange={(e) => setSummaryMonth(e.target.value)} className="w-44 text-sm" />
                <Button size="sm" variant="outline" onClick={fetchMonthlySummary} className="gap-1.5" disabled={summaryLoading}>
                  <BarChart3 className={`h-3.5 w-3.5 ${summaryLoading ? "animate-spin" : ""}`} /> Load Summary
                </Button>
              </div>
              {summaryLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : summaryRows.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground border rounded-xl"><BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-30" /><p>Click Load Summary to view monthly attendance</p></div>
              ) : (
                <ClientSideTable data={summaryRows} columns={attnSummaryColumns} pageCount={Math.ceil(summaryRows.length/10)} searchableColumns={[]} filterableColumns={[]} isShowExportButtons={{isShow:true,fileName:`attendance-${summaryMonth}`}} />
              )}
            </>
          )}
        </div>
        )}

        {/* ── Payroll ── */}
        {section === "payroll" && (
        <div className="mt-4 space-y-4">
          {/* Month selector */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <button onClick={() => { if (payMonth === 1) { setPayMonth(12); setPayYear((y) => y-1); } else setPayMonth((m) => m-1); }}
                className="p-1.5 rounded-lg border hover:bg-muted"><ChevronLeft className="h-4 w-4" /></button>
              <div className="flex gap-2">
                <Select value={String(payMonth)} onValueChange={(v) => setPayMonth(parseInt(v))}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={String(i+1)}>{m}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={String(payYear)} onValueChange={(v) => setPayYear(parseInt(v))}>
                  <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[now.getFullYear()-1, now.getFullYear(), now.getFullYear()+1].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <button onClick={() => { if (payMonth === 12) { setPayMonth(1); setPayYear((y) => y+1); } else setPayMonth((m) => m+1); }}
                className="p-1.5 rounded-lg border hover:bg-muted"><ChevronRight className="h-4 w-4" /></button>
            </div>
            <Button size="sm" variant="outline" onClick={fetchPayrolls} className="gap-1.5" disabled={payLoading}>
              <RefreshCw className={`h-3.5 w-3.5 ${payLoading ? "animate-spin" : ""}`} /> Load
            </Button>
            <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 ml-auto" onClick={() => setGenAllOpen(true)}>
              <DollarSign className="h-3.5 w-3.5" /> Generate All
            </Button>
            <Button size="sm" variant="outline" asChild className="gap-1.5">
              <Link href="/settings?tab=payslip">
                <FileText className="h-3.5 w-3.5" /> Customize payslip
              </Link>
            </Button>
          </div>

          {/* Generate for individual */}
          <div className="rounded-xl border bg-muted/10 p-4">
            <p className="text-xs font-semibold mb-3">Generate Payroll for an Employee</p>
            <div className="flex gap-2 flex-wrap items-end">
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Employee</Label>
                <Select value={genEmpId} onValueChange={setGenEmpId}>
                  <SelectTrigger className="w-44 h-8 text-xs"><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {employeeList.filter((e) => e.isActive).map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Allowances (LKR)</Label>
                <Input className="w-24 h-8 text-xs" type="number" min={0} value={genAllowances} onChange={(e) => setGenAllowances(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Bonus (LKR)</Label>
                <Input className="w-24 h-8 text-xs" type="number" min={0} value={genBonus} onChange={(e) => setGenBonus(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Deductions (LKR)</Label>
                <Input className="w-24 h-8 text-xs" type="number" min={0} value={genDeduct} onChange={(e) => setGenDeduct(e.target.value)} />
              </div>
              <Button size="sm" onClick={generatePayroll} disabled={genLoading || !genEmpId} className="gap-1.5">
                {genLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Generate
              </Button>
            </div>
          </div>

          {/* Payroll table */}
          {payLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : payrolls.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground border rounded-xl">
              <DollarSign className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p>No payroll for {MONTHS[payMonth-1]} {payYear} — click Load or Generate All</p>
            </div>
          ) : (
            <>
              <ClientSideTable
                data={payrolls}
                columns={payrollColumns}
                pageCount={Math.ceil(payrolls.length / 10)}
                searchableColumns={[{ id: "employee", title: "Employee" }]}
                filterableColumns={[{
                  id: "isPaid",
                  title: "Status",
                  options: [{ value: "true", label: "Paid" }, { value: "false", label: "Pending" }],
                }]}
                isShowExportButtons={{ isShow: true, fileName: `payroll-${MONTHS[payMonth-1]}-${payYear}` }}
              />
              {/* Totals summary */}
              <div className="rounded-xl border bg-muted/10 p-4 flex flex-wrap gap-6 text-sm">
                <div><p className="text-xs text-muted-foreground">Total Basic</p><p className="font-bold">LKR {payrolls.reduce((s,p) => s+p.basicSalary, 0).toLocaleString()}</p></div>
                <div><p className="text-xs text-muted-foreground">Total Bonus + Allow.</p><p className="font-bold text-emerald-600">+LKR {payrolls.reduce((s,p) => s+p.bonus+p.allowances, 0).toLocaleString()}</p></div>
                <div><p className="text-xs text-muted-foreground">Total Deductions</p><p className="font-bold text-red-500">-LKR {payrolls.reduce((s,p) => s+p.deductions, 0).toLocaleString()}</p></div>
                <div><p className="text-xs text-muted-foreground">Total Net Pay</p><p className="font-bold text-primary">LKR {payrolls.reduce((s,p) => s+p.netSalary, 0).toLocaleString()}</p></div>
                <div className="ml-auto text-right"><p className="text-xs text-muted-foreground">Paid</p><p className="font-bold">{payrolls.filter((p) => p.isPaid).length}/{payrolls.length}</p></div>
              </div>
            </>
          )}
        </div>
        )}

        {/* ── Leaves ── */}
        {section === "leaves" && (
        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1 border rounded-lg p-1 bg-muted/30 text-xs">
              {["ALL","PENDING","APPROVED","REJECTED"].map((s) => (
                <button key={s} onClick={() => { setLeaveStatus(s); }}
                  className={`px-3 py-1.5 rounded-md font-semibold transition-all ${
                    leaveStatus === s ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}>{s}</button>
              ))}
            </div>
            <Button size="sm" variant="outline" onClick={fetchLeaves} className="gap-1.5" disabled={leaveLoading}>
              <RefreshCw className={`h-3.5 w-3.5 ${leaveLoading ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button size="sm" className="gap-1.5 ml-auto" onClick={() => setNewLeaveOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> New Leave Request
            </Button>
          </div>

          {leaveLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : leaves.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground border rounded-xl">
              <CalendarDays className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p>No leave requests found</p>
            </div>
          ) : (
            <>
              <ClientSideTable
                data={leaves} columns={leaveColumns}
                pageCount={Math.ceil(leaves.length / 10)}
                searchableColumns={[]}
                filterableColumns={[{
                  id: "status", title: "Status",
                  options: [{ value: "PENDING", label: "Pending" }, { value: "APPROVED", label: "Approved" }, { value: "REJECTED", label: "Rejected" }],
                }, {
                  id: "leaveType", title: "Type",
                  options: LEAVE_TYPES.map((t) => ({ value: t, label: t.charAt(0)+t.slice(1).toLowerCase() })),
                }]}
                isShowExportButtons={{ isShow: true, fileName: "leave-requests" }}
              />
              <div className="rounded-xl border bg-muted/10 p-4 flex flex-wrap gap-6 text-sm">
                <div><p className="text-xs text-muted-foreground">Total Requests</p><p className="font-bold">{leaves.length}</p></div>
                <div><p className="text-xs text-muted-foreground">Pending</p><p className="font-bold text-amber-600">{leaves.filter((l)=>l.status==="PENDING").length}</p></div>
                <div><p className="text-xs text-muted-foreground">Approved</p><p className="font-bold text-emerald-600">{leaves.filter((l)=>l.status==="APPROVED").length}</p></div>
                <div><p className="text-xs text-muted-foreground">Rejected</p><p className="font-bold text-red-500">{leaves.filter((l)=>l.status==="REJECTED").length}</p></div>
              </div>
            </>
          )}
        </div>
        )}

      {/* Modals */}
      <AddEmployeeModal
        open={addOpen}
        onClose={() => { setAddOpen(false); setEditEmployee(undefined); }}
        onSaved={() => { fetchEmployees(); setAddOpen(false); setEditEmployee(undefined); }}
        editEmployee={editEmployee}
      />
      {genAllOpen && <GenerateAllModal month={payMonth} year={payYear} onClose={() => setGenAllOpen(false)} onDone={fetchPayrolls} />}
      {newLeaveOpen && <NewLeaveModal employees={employeeList} onClose={() => setNewLeaveOpen(false)} onSaved={fetchLeaves} />}
    </div>
  );
}
