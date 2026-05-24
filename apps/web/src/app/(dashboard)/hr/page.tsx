"use client";

import { useState, useEffect, useCallback } from "react";
import {
  UserCog, Plus, Users, Clock, DollarSign, RefreshCw,
  Phone, Mail, CheckCircle2, XCircle, AlertCircle, Loader2,
  CalendarDays, Banknote, ChevronLeft, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ColumnDef } from "@tanstack/react-table";
import { ClientSideTable } from "@/components/table/client-side-table";
import { DataTableColumnHeader } from "@/components/table/data-table-column-header";
import { TableActionsRow } from "@/components/table/table-actions-row";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { AddEmployeeModal, type Employee } from "@/components/hr/add-employee-modal";

// ── Types ────────────────────────────────────────────────────────────────
type AttendanceStatus = "PRESENT" | "ABSENT" | "HALF_DAY" | "ON_LEAVE" | "LATE";
interface EmpWithAttendance extends Employee { todayAttendance: { status: AttendanceStatus } | null }
interface Payroll {
  id: string; employeeId: string; month: number; year: number;
  basicSalary: number; allowances: number; bonus: number; deductions: number; netSalary: number;
  isPaid: boolean; paidAt?: string | null;
  employee: { firstName: string; lastName: string; designation?: string | null; code: string };
}

// ── Attendance status config ──────────────────────────────────────────────
const ATTN_STATUS: Record<AttendanceStatus, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  PRESENT:  { label: "Present",   color: "text-emerald-600", bg: "bg-emerald-500/10", icon: CheckCircle2 },
  ABSENT:   { label: "Absent",    color: "text-red-600",     bg: "bg-red-500/10",     icon: XCircle },
  HALF_DAY: { label: "Half Day",  color: "text-amber-600",   bg: "bg-amber-500/10",   icon: AlertCircle },
  ON_LEAVE: { label: "Leave",     color: "text-violet-600",  bg: "bg-violet-500/10",  icon: CalendarDays },
  LATE:     { label: "Late",      color: "text-blue-600",    bg: "bg-blue-500/10",    icon: Clock },
};

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// ── Employee columns ──────────────────────────────────────────────────────
function buildEmpColumns(onEdit: (e: Employee) => void, onDeactivate: (e: Employee) => void): ColumnDef<Employee>[] {
  return [
    {
      id: "employee",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Employee" />,
      cell: ({ row }) => {
        const e = row.original;
        const initials = `${e.firstName[0]}${e.lastName[0]}`.toUpperCase();
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
      cell: ({ row }) => <span className="text-sm font-semibold">₹{row.original.basicSalary.toLocaleString()}</span>,
    },
    {
      accessorKey: "joiningDate",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Joined" />,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {new Date(row.original.joiningDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
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

// ── Page ─────────────────────────────────────────────────────────────────
export default function HRPage() {
  const today = new Date().toISOString().split("T")[0];
  const now   = new Date();

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

  // Payroll
  const [payMonth, setPayMonth]   = useState(now.getMonth() + 1);
  const [payYear, setPayYear]     = useState(now.getFullYear());
  const [payrolls, setPayrolls]   = useState<Payroll[]>([]);
  const [payLoading, setPayLoading] = useState(false);
  const [genEmpId, setGenEmpId]   = useState("");
  const [genBonus, setGenBonus]   = useState("0");
  const [genDeduct, setGenDeduct] = useState("0");
  const [genLoading, setGenLoading] = useState(false);

  // ── Fetch employees ───────────────────────────────────────────────────
  const fetchEmployees = useCallback(async () => {
    setEmpLoading(true);
    try {
      const res = await api.get<{ data: Employee[] }>("/hr/employees?limit=200");
      setEmployees(res.data?.data ?? (res.data as unknown as Employee[]) ?? []);
    } catch { toast.error("Failed to load employees"); }
    finally { setEmpLoading(false); }
  }, []);

  useEffect(() => { fetchEmployees(); }, [fetchEmployees]);

  const handleDeactivate = async (emp: Employee) => {
    if (!window.confirm(`Deactivate ${emp.firstName}?`)) return;
    try { await api.delete(`/hr/employees/${emp.id}`); toast.success("Employee deactivated"); fetchEmployees(); }
    catch { toast.error("Failed"); }
  };

  // ── Fetch attendance ──────────────────────────────────────────────────
  const fetchAttendance = useCallback(async () => {
    setAttnLoading(true);
    try {
      const res = await api.get<EmpWithAttendance[]>(`/hr/employees/attendance/daily?date=${attnDate}`);
      const rows = (res.data as unknown as EmpWithAttendance[]) ?? [];
      setAttnRows(rows);
      const map: Record<string, AttendanceStatus> = {};
      rows.forEach((r) => { if (r.todayAttendance) map[r.id] = r.todayAttendance.status; });
      setAttnMap(map);
    } catch { toast.error("Failed to load attendance"); }
    finally { setAttnLoading(false); }
  }, [attnDate]);

  // ── Fetch payroll ──────────────────────────────────────────────────────
  const fetchPayrolls = useCallback(async () => {
    setPayLoading(true);
    try {
      const res = await api.get<Payroll[]>(`/hr/employees/payroll?month=${payMonth}&year=${payYear}`);
      setPayrolls((res.data as unknown as Payroll[]) ?? []);
    } catch { toast.error("Failed to load payroll"); }
    finally { setPayLoading(false); }
  }, [payMonth, payYear]);

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
        bonus: parseFloat(genBonus) || 0, deductions: parseFloat(genDeduct) || 0,
      });
      toast.success("Payroll generated");
      setGenEmpId(""); setGenBonus("0"); setGenDeduct("0");
      fetchPayrolls();
    } catch { toast.error("Failed"); }
    finally { setGenLoading(false); }
  };

  const markPaid = async (id: string) => {
    try { await api.put(`/hr/employees/payroll/${id}/paid`, {}); toast.success("Marked as paid"); fetchPayrolls(); }
    catch { toast.error("Failed"); }
  };

  // Stats
  const activeCount  = employees.filter((e) => e.isActive).length;
  const totalPayroll = employees.reduce((s, e) => s + e.basicSalary, 0);
  const STATS = [
    { label: "Total Employees", value: employees.length, icon: Users,    color: "text-blue-500",   bg: "bg-blue-500/10" },
    { label: "Active",          value: activeCount,      icon: UserCog,  color: "text-emerald-500",bg: "bg-emerald-500/10" },
    { label: "Monthly Payroll", value: `₹${(totalPayroll / 1000).toFixed(0)}K`, icon: DollarSign, color: "text-purple-500", bg: "bg-purple-500/10" },
    { label: "Departments",     value: [...new Set(employees.map((e) => e.department).filter(Boolean))].length, icon: Banknote, color: "text-amber-500", bg: "bg-amber-500/10" },
  ];

  const empColumns = buildEmpColumns(
    (e) => { setEditEmployee(e); setAddOpen(true); },
    handleDeactivate,
  );

  const unpaidEmployees = employees.filter((e) => e.isActive && !payrolls.find((p) => p.employeeId === e.id));

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">HR & Payroll</h1>
          <p className="text-sm text-muted-foreground">Manage employees, attendance and salary</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchEmployees} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${empLoading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => { setEditEmployee(undefined); setAddOpen(true); }}>
            <Plus className="h-3.5 w-3.5" /> Add Employee
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {STATS.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${s.bg}`}><s.icon className={`h-5 w-5 ${s.color}`} /></div>
              <div><p className="text-xl font-bold">{s.value}</p><p className="text-xs text-muted-foreground">{s.label}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="employees">
        <TabsList>
          <TabsTrigger value="employees">Employees</TabsTrigger>
          <TabsTrigger value="attendance" onClick={fetchAttendance}>Attendance</TabsTrigger>
          <TabsTrigger value="payroll" onClick={fetchPayrolls}>Payroll</TabsTrigger>
        </TabsList>

        {/* ── Employees ── */}
        <TabsContent value="employees" className="mt-4">
          <ClientSideTable
            data={employees}
            columns={empColumns}
            pageCount={Math.ceil(employees.length / 10)}
            searchableColumns={[{ id: "designation", title: "Role" }]}
            filterableColumns={[{
              id: "isActive", title: "Status",
              options: [{ value: "true", label: "Active" }, { value: "false", label: "Inactive" }],
            }]}
            isShowExportButtons={{ isShow: true, fileName: "employees-export" }}
          />
        </TabsContent>

        {/* ── Attendance ── */}
        <TabsContent value="attendance" className="mt-4 space-y-4">
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
              {Object.entries(ATTN_STATUS).map(([k, v]) => {
                const Icon = v.icon;
                return (
                  <span key={k} className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full ${v.bg} ${v.color}`}>
                    <Icon className="h-2.5 w-2.5" />{v.label}
                  </span>
                );
              })}
            </div>
          </div>

          {attnLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : attnRows.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p>Click Load to fetch employees for this date</p>
            </div>
          ) : (
            <>
              <div className="rounded-xl border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30">
                    <tr>
                      {["Employee", "Designation", "Branch", "Status", "Mark As"].map((h) => (
                        <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {attnRows.map((emp) => {
                      const status = attnMap[emp.id] as AttendanceStatus | undefined;
                      const conf = status ? ATTN_STATUS[status] : null;
                      return (
                        <tr key={emp.id} className="border-t hover:bg-muted/20">
                          <td className="px-4 py-2.5">
                            <p className="font-medium">{emp.firstName} {emp.lastName}</p>
                            <p className="text-[10px] text-muted-foreground font-mono">{emp.code}</p>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">{emp.designation ?? "—"}</td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">{emp.branch?.name ?? "—"}</td>
                          <td className="px-4 py-2.5">
                            {conf ? (
                              <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${conf.bg} ${conf.color}`}>
                                <conf.icon className="h-2.5 w-2.5" />{conf.label}
                              </span>
                            ) : <span className="text-xs text-muted-foreground">—</span>}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex gap-1">
                              {(["PRESENT","ABSENT","HALF_DAY","ON_LEAVE","LATE"] as AttendanceStatus[]).map((s) => {
                                const c = ATTN_STATUS[s];
                                return (
                                  <button key={s} onClick={() => setAttnMap((p) => ({ ...p, [emp.id]: s }))}
                                    className={`text-[9px] font-bold px-1.5 py-1 rounded border transition-all ${
                                      attnMap[emp.id] === s ? `${c.bg} ${c.color} border-current` : "border-border hover:bg-muted"
                                    }`}>
                                    {s === "HALF_DAY" ? "H" : s === "ON_LEAVE" ? "L" : s[0]}
                                  </button>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-between items-center">
                <p className="text-xs text-muted-foreground">
                  {Object.values(attnMap).filter((s) => s === "PRESENT").length} present ·{" "}
                  {Object.values(attnMap).filter((s) => s === "ABSENT").length} absent ·{" "}
                  {attnRows.length - Object.keys(attnMap).length} unmarked
                </p>
                <Button onClick={saveAttendance} disabled={attnSaving} className="gap-1.5">
                  {attnSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Save Attendance
                </Button>
              </div>
            </>
          )}
        </TabsContent>

        {/* ── Payroll ── */}
        <TabsContent value="payroll" className="mt-4 space-y-4">
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
          </div>

          {/* Generate for individual */}
          <div className="rounded-xl border bg-muted/10 p-4">
            <p className="text-xs font-semibold mb-3">Generate Payroll for an Employee</p>
            <div className="flex gap-2 flex-wrap items-end">
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Employee</Label>
                <Select value={genEmpId} onValueChange={setGenEmpId}>
                  <SelectTrigger className="w-48 h-8 text-xs"><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {unpaidEmployees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Bonus (₹)</Label>
                <Input className="w-24 h-8 text-xs" type="number" min={0} value={genBonus} onChange={(e) => setGenBonus(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Deductions (₹)</Label>
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
              <p>No payroll generated for {MONTHS[payMonth-1]} {payYear}</p>
            </div>
          ) : (
            <>
              <div className="rounded-xl border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30">
                    <tr>
                      {["Employee", "Basic", "Bonus", "Deductions", "Net Pay", "Status", ""].map((h) => (
                        <th key={h} className={`px-4 py-2.5 text-xs font-semibold text-muted-foreground ${h ? "text-left" : ""}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {payrolls.map((p) => (
                      <tr key={p.id} className="border-t hover:bg-muted/20">
                        <td className="px-4 py-3">
                          <p className="font-medium">{p.employee.firstName} {p.employee.lastName}</p>
                          <p className="text-[10px] text-muted-foreground font-mono">{p.employee.code}</p>
                        </td>
                        <td className="px-4 py-3">₹{p.basicSalary.toLocaleString()}</td>
                        <td className="px-4 py-3 text-emerald-600">+₹{(p.bonus + p.allowances).toLocaleString()}</td>
                        <td className="px-4 py-3 text-red-500">-₹{p.deductions.toLocaleString()}</td>
                        <td className="px-4 py-3 font-bold text-primary">₹{p.netSalary.toLocaleString()}</td>
                        <td className="px-4 py-3">
                          <Badge variant={p.isPaid ? "success" : "warning"} className="text-[10px]">
                            {p.isPaid ? "Paid" : "Pending"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          {!p.isPaid && (
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => markPaid(p.id)}>
                              <CheckCircle2 className="h-3 w-3" /> Mark Paid
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t bg-muted/30 font-bold">
                      <td className="px-4 py-3">Total</td>
                      <td className="px-4 py-3">₹{payrolls.reduce((s,p) => s+p.basicSalary, 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-emerald-600">+₹{payrolls.reduce((s,p) => s+p.bonus+p.allowances, 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-red-500">-₹{payrolls.reduce((s,p) => s+p.deductions, 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-primary">₹{payrolls.reduce((s,p) => s+p.netSalary, 0).toLocaleString()}</td>
                      <td colSpan={2} className="px-4 py-3 text-xs text-muted-foreground">
                        {payrolls.filter((p) => p.isPaid).length}/{payrolls.length} paid
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Modal */}
      <AddEmployeeModal
        open={addOpen}
        onClose={() => { setAddOpen(false); setEditEmployee(undefined); }}
        onSaved={() => { fetchEmployees(); setAddOpen(false); setEditEmployee(undefined); }}
        editEmployee={editEmployee}
      />
    </div>
  );
}
