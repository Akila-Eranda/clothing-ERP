"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2, Briefcase, Clock, CalendarDays, Tag, Plus,
  Loader2, Search, Users, UserCheck, UserX, UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TableStatusBadge } from "@/components/ui/table-status-badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ClientSideTable, DataTableColumnHeader, TableActionsRow } from "@/components/table";
import { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { modalInlineFooterClass } from "@/components/ui/modal-footer";
import { HrPageHeader, HrPageShell, HrStatCards, hrStat } from "@/components/hr/hr-ui";

export type HrmSection = "departments" | "designations" | "shifts" | "holidays" | "leave-types";

const SECTION_META: Record<HrmSection, { title: string; description: string; icon: React.ElementType }> = {
  departments: { title: "Departments", description: "Organize teams and headcount by department", icon: Building2 },
  designations: { title: "Designations", description: "Job titles and roles within departments", icon: Briefcase },
  shifts: { title: "Shifts", description: "Work shift schedules and timings", icon: Clock },
  holidays: { title: "Holidays", description: "Company holiday calendar", icon: CalendarDays },
  "leave-types": { title: "Leave Types", description: "Configure leave categories and annual quotas", icon: Tag },
};

interface Department { id: string; name: string; description?: string | null; isActive: boolean; memberCount?: number; designationCount?: number; createdAt: string }
interface Designation { id: string; name: string; isActive: boolean; memberCount?: number; department?: { id: string; name: string } | null; createdAt: string }
interface Shift { id: string; name: string; startTime: string; endTime: string; weekOff?: string | null; description?: string | null; isActive: boolean; memberCount?: number; createdAt: string }
interface Holiday { id: string; name: string; startDate: string; endDate: string; isActive: boolean; createdAt: string }
interface LeaveType { id: string; name: string; quota: number; isActive: boolean; createdAt: string }
interface HrmStats { total: number; active: number; inactive: number; newJoiners: number; pendingLeaves: number; todayPresent: number }

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-LK", { day: "2-digit", month: "short", year: "numeric" });
}

export function HrmMastersHub({ section }: { section: HrmSection }) {
  const meta = SECTION_META[section];
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<HrmStats | null>(null);

  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [weekOff, setWeekOff] = useState("Sunday");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [quota, setQuota] = useState("14");
  const [isActive, setIsActive] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const statsRes = await api.get<HrmStats>("/hr/masters/stats").catch(() => ({ data: null }));
      setStats((statsRes as { data: HrmStats | null }).data ?? null);

      if (section === "departments") {
        const r = await api.get<Department[]>("/hr/masters/departments");
        setDepartments(Array.isArray(r.data) ? r.data : []);
      } else if (section === "designations") {
        const [d, dept] = await Promise.all([
          api.get<Designation[]>("/hr/masters/designations"),
          api.get<Department[]>("/hr/masters/departments"),
        ]);
        setDesignations(Array.isArray(d.data) ? d.data : []);
        setDepartments(Array.isArray(dept.data) ? dept.data : []);
      } else if (section === "shifts") {
        const r = await api.get<Shift[]>("/hr/masters/shifts");
        setShifts(Array.isArray(r.data) ? r.data : []);
      } else if (section === "holidays") {
        const r = await api.get<Holiday[]>("/hr/masters/holidays");
        setHolidays(Array.isArray(r.data) ? r.data : []);
      } else if (section === "leave-types") {
        const r = await api.get<LeaveType[]>("/hr/masters/leave-types");
        setLeaveTypes(Array.isArray(r.data) ? r.data : []);
      }
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [section]);

  useEffect(() => { load(); }, [load]);

  const sectionStats = useMemo(() => {
    const all = {
      departments: [
        hrStat("Departments", departments.length, Building2, "slate"),
        hrStat("Active Staff", stats?.active ?? 0, UserCheck, "emerald"),
        hrStat("Inactive", stats?.inactive ?? 0, UserX, "amber"),
        hrStat("Total Staff", stats?.total ?? 0, Users, "blue"),
      ],
      designations: [
        hrStat("Designations", designations.length, Briefcase, "slate"),
        hrStat("Active Staff", stats?.active ?? 0, UserCheck, "emerald"),
        hrStat("New Joiners", stats?.newJoiners ?? 0, UserPlus, "violet"),
        hrStat("Total Staff", stats?.total ?? 0, Users, "blue"),
      ],
      shifts: [
        hrStat("Shifts", shifts.length, Clock, "slate"),
        hrStat("Present Today", stats?.todayPresent ?? 0, UserCheck, "emerald"),
        hrStat("Active Staff", stats?.active ?? 0, Users, "blue"),
        hrStat("Total Staff", stats?.total ?? 0, Users, "teal"),
      ],
      holidays: [
        hrStat("Holidays", holidays.length, CalendarDays, "slate"),
        hrStat("Pending Leaves", stats?.pendingLeaves ?? 0, Clock, "amber"),
        hrStat("Active Staff", stats?.active ?? 0, UserCheck, "emerald"),
        hrStat("Total Staff", stats?.total ?? 0, Users, "blue"),
      ],
      "leave-types": [
        hrStat("Leave Types", leaveTypes.length, Tag, "slate"),
        hrStat("Pending Leaves", stats?.pendingLeaves ?? 0, Clock, "amber"),
        hrStat("Active Staff", stats?.active ?? 0, UserCheck, "emerald"),
        hrStat("Total Staff", stats?.total ?? 0, Users, "blue"),
      ],
    };
    return all[section];
  }, [section, stats, departments.length, designations.length, shifts.length, holidays.length, leaveTypes.length]);

  const resetForm = () => {
    setEditId(null);
    setName(""); setDescription(""); setDepartmentId("");
    setStartTime("09:00"); setEndTime("17:00"); setWeekOff("Sunday");
    setStartDate(""); setEndDate(""); setQuota("14"); setIsActive(true);
  };

  const openAdd = () => { resetForm(); setModalOpen(true); };
  const openEdit = (row: {
    id: string; name: string; description?: string | null; isActive?: boolean;
    department?: { id: string } | null; startTime?: string; endTime?: string;
    weekOff?: string | null; startDate?: string; endDate?: string; quota?: number;
  }) => {
    setEditId(row.id);
    setName(row.name);
    setDescription(row.description ?? "");
    setIsActive(row.isActive ?? true);
    if (row.department?.id) setDepartmentId(row.department.id);
    if (row.startTime) setStartTime(row.startTime);
    if (row.endTime) setEndTime(row.endTime);
    if (row.weekOff) setWeekOff(row.weekOff);
    if (row.startDate) setStartDate(row.startDate.split("T")[0]);
    if (row.endDate) setEndDate(row.endDate.split("T")[0]);
    if (row.quota != null) setQuota(String(row.quota));
    setModalOpen(true);
  };

  const submit = async () => {
    if (!name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      const base = `/hr/masters`;
      if (section === "departments") {
        const body = { name, description: description || undefined, isActive };
        if (editId) await api.put(`${base}/departments/${editId}`, body);
        else await api.post(`${base}/departments`, body);
      } else if (section === "designations") {
        const body = { name, departmentId: departmentId || undefined, isActive };
        if (editId) await api.put(`${base}/designations/${editId}`, body);
        else await api.post(`${base}/designations`, body);
      } else if (section === "shifts") {
        const body = { name, startTime, endTime, weekOff, description: description || undefined, isActive };
        if (editId) await api.put(`${base}/shifts/${editId}`, body);
        else await api.post(`${base}/shifts`, body);
      } else if (section === "holidays") {
        if (!startDate || !endDate) { toast.error("Start and end dates required"); setSaving(false); return; }
        const body = { name, startDate, endDate, isActive };
        if (editId) await api.put(`${base}/holidays/${editId}`, body);
        else await api.post(`${base}/holidays`, body);
      } else if (section === "leave-types") {
        const body = { name, quota: parseInt(quota, 10) || 0, isActive };
        if (editId) await api.put(`${base}/leave-types/${editId}`, body);
        else await api.post(`${base}/leave-types`, body);
      }
      toast.success(editId ? "Updated successfully" : "Created successfully");
      setModalOpen(false);
      resetForm();
      load();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Deactivate this record?")) return;
    try {
      const paths: Record<HrmSection, string> = {
        departments: `/hr/masters/departments/${id}`,
        designations: `/hr/masters/designations/${id}`,
        shifts: `/hr/masters/shifts/${id}`,
        holidays: `/hr/masters/holidays/${id}`,
        "leave-types": `/hr/masters/leave-types/${id}`,
      };
      await api.delete(paths[section]);
      toast.success("Deactivated");
      load();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Delete failed");
    }
  };

  const addLabel = {
    departments: "Add Department",
    designations: "Add Designation",
    shifts: "Add Shift",
    holidays: "Add Holiday",
    "leave-types": "Add Leave Type",
  }[section];

  const q = search.trim().toLowerCase();
  const filteredDepts = departments.filter((d) => !q || d.name.toLowerCase().includes(q));
  const filteredDesigs = designations.filter((d) => !q || d.name.toLowerCase().includes(q));
  const filteredShifts = shifts.filter((d) => !q || d.name.toLowerCase().includes(q));
  const filteredHolidays = holidays.filter((d) => !q || d.name.toLowerCase().includes(q));
  const filteredLeaveTypes = leaveTypes.filter((d) => !q || d.name.toLowerCase().includes(q));

  const deptCols = useMemo<ColumnDef<Department>[]>(() => [
    { accessorKey: "name", header: ({ column }) => <DataTableColumnHeader column={column} title="Department" />, cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
    { id: "members", header: ({ column }) => <DataTableColumnHeader column={column} title="Members" />, cell: ({ row }) => <span className="tabular-nums font-semibold">{row.original.memberCount ?? 0}</span> },
    { id: "designations", header: ({ column }) => <DataTableColumnHeader column={column} title="Designations" />, cell: ({ row }) => <span className="tabular-nums">{row.original.designationCount ?? 0}</span> },
    { id: "status", header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />, cell: ({ row }) => <TableStatusBadge status={row.original.isActive ? "ACTIVE" : "INACTIVE"} /> },
    { id: "actions", cell: ({ row }) => <TableActionsRow editAction={{ action: () => openEdit(row.original) }} deleteAction={{ action: () => void remove(row.original.id) }} /> },
  ], []);

  const desigCols = useMemo<ColumnDef<Designation>[]>(() => [
    { accessorKey: "name", header: ({ column }) => <DataTableColumnHeader column={column} title="Designation" />, cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
    { id: "dept", header: ({ column }) => <DataTableColumnHeader column={column} title="Department" />, cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.department?.name ?? "—"}</span> },
    { id: "members", header: ({ column }) => <DataTableColumnHeader column={column} title="Members" />, cell: ({ row }) => <span className="tabular-nums font-semibold">{row.original.memberCount ?? 0}</span> },
    { id: "status", header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />, cell: ({ row }) => <TableStatusBadge status={row.original.isActive ? "ACTIVE" : "INACTIVE"} /> },
    { id: "actions", cell: ({ row }) => <TableActionsRow editAction={{ action: () => openEdit(row.original) }} deleteAction={{ action: () => void remove(row.original.id) }} /> },
  ], []);

  const shiftCols = useMemo<ColumnDef<Shift>[]>(() => [
    { accessorKey: "name", header: ({ column }) => <DataTableColumnHeader column={column} title="Shift" />, cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
    { id: "time", header: ({ column }) => <DataTableColumnHeader column={column} title="Time" />, cell: ({ row }) => <span className="text-sm tabular-nums">{row.original.startTime} – {row.original.endTime}</span> },
    { id: "weekOff", header: ({ column }) => <DataTableColumnHeader column={column} title="Week Off" />, cell: ({ row }) => <span className="text-sm">{row.original.weekOff ?? "—"}</span> },
    { id: "members", header: ({ column }) => <DataTableColumnHeader column={column} title="Assigned" />, cell: ({ row }) => <span className="tabular-nums">{row.original.memberCount ?? 0}</span> },
    { id: "status", header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />, cell: ({ row }) => <TableStatusBadge status={row.original.isActive ? "ACTIVE" : "INACTIVE"} /> },
    { id: "actions", cell: ({ row }) => <TableActionsRow editAction={{ action: () => openEdit(row.original) }} deleteAction={{ action: () => void remove(row.original.id) }} /> },
  ], []);

  const holidayCols = useMemo<ColumnDef<Holiday>[]>(() => [
    { accessorKey: "name", header: ({ column }) => <DataTableColumnHeader column={column} title="Holiday" />, cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
    { id: "dates", header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />, cell: ({ row }) => <span className="text-sm whitespace-nowrap">{fmtDate(row.original.startDate)}{row.original.endDate !== row.original.startDate ? ` – ${fmtDate(row.original.endDate)}` : ""}</span> },
    { id: "status", header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />, cell: ({ row }) => <TableStatusBadge status={row.original.isActive ? "ACTIVE" : "INACTIVE"} /> },
    { id: "actions", cell: ({ row }) => <TableActionsRow editAction={{ action: () => openEdit(row.original) }} deleteAction={{ action: () => void remove(row.original.id) }} /> },
  ], []);

  const leaveTypeCols = useMemo<ColumnDef<LeaveType>[]>(() => [
    { accessorKey: "name", header: ({ column }) => <DataTableColumnHeader column={column} title="Leave Type" />, cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
    { accessorKey: "quota", header: ({ column }) => <DataTableColumnHeader column={column} title="Annual Quota" />, cell: ({ row }) => <span className="tabular-nums">{row.original.quota} days</span> },
    { id: "status", header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />, cell: ({ row }) => <TableStatusBadge status={row.original.isActive ? "ACTIVE" : "INACTIVE"} /> },
    { id: "actions", cell: ({ row }) => <TableActionsRow editAction={{ action: () => openEdit(row.original) }} deleteAction={{ action: () => void remove(row.original.id) }} /> },
  ], []);

  return (
    <HrPageShell>
      <HrPageHeader
        title={meta.title}
        description={meta.description}
        onRefresh={load}
        refreshing={loading}
        actions={
          <Button type="button" onClick={openAdd} className="gap-1.5">
            <Plus className="h-[18px] w-[18px]" />
            {addLabel}
          </Button>
        }
      />

      <HrStatCards items={sectionStats} loading={loading && !stats} />

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder={`Search ${meta.title.toLowerCase()}…`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-9 text-sm rounded-[14px] bg-card shadow-[0_2px_10px_rgba(15,23,42,0.04)]"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-20 rounded-xl border bg-card shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {section === "departments" && <ClientSideTable columns={deptCols} data={filteredDepts} isShowExportButtons={{ isShow: true, fileName: "departments" }} />}
          {section === "designations" && <ClientSideTable columns={desigCols} data={filteredDesigs} isShowExportButtons={{ isShow: true, fileName: "designations" }} />}
          {section === "shifts" && <ClientSideTable columns={shiftCols} data={filteredShifts} isShowExportButtons={{ isShow: true, fileName: "shifts" }} />}
          {section === "holidays" && <ClientSideTable columns={holidayCols} data={filteredHolidays} isShowExportButtons={{ isShow: true, fileName: "holidays" }} />}
          {section === "leave-types" && <ClientSideTable columns={leaveTypeCols} data={filteredLeaveTypes} isShowExportButtons={{ isShow: true, fileName: "leave-types" }} />}
        </>
      )}

      <Dialog open={modalOpen} onOpenChange={(o) => { if (!o) { setModalOpen(false); resetForm(); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? `Edit ${meta.title.replace(/s$/, "")}` : addLabel}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
            </div>

            {section === "designations" && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Department</Label>
                <Select value={departmentId || "__none"} onValueChange={(v) => setDepartmentId(v === "__none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">None</SelectItem>
                    {departments.filter((d) => d.isActive).map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {section === "shifts" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label className="text-xs font-semibold">Start Time</Label><Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} /></div>
                  <div className="space-y-1.5"><Label className="text-xs font-semibold">End Time</Label><Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} /></div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Week Off</Label>
                  <Select value={weekOff} onValueChange={setWeekOff}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((d) => (
                        <SelectItem key={d} value={d}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Description</Label>
                  <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional notes" />
                </div>
              </>
            )}

            {section === "holidays" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label className="text-xs font-semibold">Start Date *</Label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
                <div className="space-y-1.5"><Label className="text-xs font-semibold">End Date *</Label><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
              </div>
            )}

            {section === "leave-types" && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Annual Quota (days)</Label>
                <Input type="number" min={0} value={quota} onChange={(e) => setQuota(e.target.value)} />
              </div>
            )}

            {section === "departments" && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Description</Label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
              </div>
            )}

            <div className="flex items-center justify-between rounded-lg border px-4 py-3">
              <div><p className="text-sm font-medium">Active</p><p className="text-xs text-muted-foreground">Visible in dropdowns</p></div>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
          </div>
          <div className={modalInlineFooterClass}>
            <Button variant="outline" onClick={() => { setModalOpen(false); resetForm(); }} disabled={saving}>Cancel</Button>
            <Button onClick={submit} disabled={saving} className="gap-1.5 min-w-[100px]">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {editId ? "Update" : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </HrPageShell>
  );
}
