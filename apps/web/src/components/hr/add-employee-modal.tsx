"use client";

import { useState, useEffect } from "react";
import { X, UserCog, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { modalBarFooterClass } from "@/components/ui/modal-footer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { parseApiList } from "@/lib/parse-api-list";

export interface Employee {
  id: string; code: string;
  firstName: string; lastName: string;
  phone: string; email?: string | null;
  designation?: string | null; department?: string | null;
  branchId?: string | null; basicSalary: number;
  gender?: string | null; joiningDate: string;
  dateOfBirth?: string | null; address?: string | null;
  nicNumber?: string | null; epfNumber?: string | null; etfNumber?: string | null;
  employmentType?: string | null;
  bankDetails?: Record<string, string> | null;
  isActive: boolean; createdAt: string;
  branch?: { id: string; name: string } | null;
}

interface Branch { id: string; name: string }
interface DeptOpt { id: string; name: string; isActive?: boolean }
interface DesigOpt { id: string; name: string; isActive?: boolean }
interface ShiftOpt { id: string; name: string; startTime: string; endTime: string; isActive?: boolean }

interface Form {
  firstName: string; lastName: string; phone: string; email: string;
  designation: string; department: string; branchId: string;
  basicSalary: string; gender: string; joiningDate: string;
  dateOfBirth: string; address: string; nicNumber: string;
  epfNumber: string; etfNumber: string; employmentType: string;
  bankName: string; accountNumber: string; bankBranch: string;
  shiftId: string;
}

const INIT: Form = {
  firstName: "", lastName: "", phone: "", email: "",
  designation: "", department: "", branchId: "",
  basicSalary: "", gender: "", joiningDate: new Date().toISOString().split("T")[0],
  dateOfBirth: "", address: "", nicNumber: "",
  epfNumber: "", etfNumber: "", employmentType: "FULL_TIME",
  bankName: "", accountNumber: "", bankBranch: "",
  shiftId: "",
};

interface Props { open: boolean; onClose: () => void; onSaved: () => void; editEmployee?: Employee; }

function F({ label, req, children }: { label: string; req?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold">{label}{req && <span className="text-destructive ml-0.5">*</span>}</Label>
      {children}
    </div>
  );
}

export function AddEmployeeModal({ open, onClose, onSaved, editEmployee }: Props) {
  const [form, setForm] = useState<Form>(INIT);
  const [tab, setTab] = useState("basic");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [departments, setDepartments] = useState<DeptOpt[]>([]);
  const [designations, setDesignations] = useState<DesigOpt[]>([]);
  const [shifts, setShifts] = useState<ShiftOpt[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTab("basic");
    api.get<{ data: Branch[] }>("/branches?limit=100").then((r) => setBranches(parseApiList<Branch>(r.data))).catch(() => {});
    api.get<DeptOpt[]>("/hr/masters/departments").then((r) => setDepartments(Array.isArray(r.data) ? r.data.filter((d) => d.isActive !== false) : [])).catch(() => {});
    api.get<DesigOpt[]>("/hr/masters/designations").then((r) => setDesignations(Array.isArray(r.data) ? r.data.filter((d) => d.isActive !== false) : [])).catch(() => {});
    api.get<ShiftOpt[]>("/hr/masters/shifts").then((r) => setShifts(Array.isArray(r.data) ? r.data.filter((s) => s.isActive !== false) : [])).catch(() => {});
    if (editEmployee) {
      const bank = (editEmployee.bankDetails ?? {}) as Record<string, string>;
      setForm({
        firstName: editEmployee.firstName, lastName: editEmployee.lastName,
        phone: editEmployee.phone, email: editEmployee.email ?? "",
        designation: editEmployee.designation ?? "", department: editEmployee.department ?? "",
        branchId: editEmployee.branchId ?? "",
        basicSalary: String(editEmployee.basicSalary),
        gender: editEmployee.gender ?? "",
        joiningDate: editEmployee.joiningDate?.split("T")[0] ?? INIT.joiningDate,
        dateOfBirth: editEmployee.dateOfBirth?.split("T")[0] ?? "",
        address: editEmployee.address ?? "",
        nicNumber: editEmployee.nicNumber ?? "",
        epfNumber: editEmployee.epfNumber ?? "",
        etfNumber: editEmployee.etfNumber ?? "",
        employmentType: editEmployee.employmentType ?? "FULL_TIME",
        bankName: bank.bankName ?? "",
        accountNumber: bank.accountNumber ?? "",
        bankBranch: bank.branch ?? "",
        shiftId: "",
      });
    } else { setForm(INIT); }
  }, [open, editEmployee]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!form.firstName.trim() || !form.lastName.trim()) { toast.error("Full name is required"); return; }
    if (!form.phone.trim()) { toast.error("Phone is required"); return; }
    if (!form.basicSalary || isNaN(parseFloat(form.basicSalary))) { toast.error("Valid salary is required"); return; }
    setLoading(true);
    try {
      const bankDetails = form.bankName || form.accountNumber || form.bankBranch
        ? { bankName: form.bankName || undefined, accountNumber: form.accountNumber || undefined, branch: form.bankBranch || undefined }
        : undefined;
      const payload = {
        firstName: form.firstName.trim(), lastName: form.lastName.trim(),
        phone: form.phone.trim(), email: form.email || undefined,
        designation: form.designation || undefined, department: form.department || undefined,
        branchId: form.branchId || undefined,
        basicSalary: parseFloat(form.basicSalary),
        gender: (form.gender as "MALE" | "FEMALE" | "OTHER") || undefined,
        joiningDate: form.joiningDate,
        dateOfBirth: form.dateOfBirth || undefined,
        address: form.address || undefined,
        nicNumber: form.nicNumber || undefined,
        epfNumber: form.epfNumber || undefined,
        etfNumber: form.etfNumber || undefined,
        employmentType: form.employmentType || undefined,
        bankDetails,
      };
      let employeeId = editEmployee?.id;
      if (editEmployee) {
        await api.put(`/hr/employees/${editEmployee.id}`, payload);
        toast.success("Employee updated");
      } else {
        const res = await api.post<Employee>("/hr/employees", payload);
        employeeId = res.data?.id;
        toast.success(`${form.firstName} added`);
      }
      if (form.shiftId && employeeId) {
        await api.post("/hr/masters/shifts/assign", {
          employeeId, shiftId: form.shiftId, date: new Date().toISOString().split("T")[0],
        }).catch(() => {});
      }
      onSaved(); onClose();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to save");
    } finally { setLoading(false); }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-xl border overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center gap-3 px-6 py-4 border-b shrink-0">
          <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <UserCog className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-bold">{editEmployee ? "Edit Employee" : "Add Employee"}</h2>
            <p className="text-xs text-muted-foreground">{editEmployee ? `${editEmployee.firstName} ${editEmployee.lastName} · ${editEmployee.code}` : "Create a new employee profile"}</p>
          </div>
          <button onClick={onClose} className="ml-auto p-1.5 rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col min-h-0 px-6 pt-4">
          <TabsList className="w-full grid grid-cols-3 shrink-0">
            <TabsTrigger value="basic" className="text-xs">Basic</TabsTrigger>
            <TabsTrigger value="work" className="text-xs">Work & Pay</TabsTrigger>
            <TabsTrigger value="bank" className="text-xs">Bank & IDs</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto py-4">
            <TabsContent value="basic" className="mt-0 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <F label="First Name" req><Input placeholder="Arun" value={form.firstName} onChange={(e) => set("firstName", e.target.value)} autoFocus /></F>
                <F label="Last Name" req><Input placeholder="Kumar" value={form.lastName} onChange={(e) => set("lastName", e.target.value)} /></F>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <F label="Phone" req><Input placeholder="+94 77 123 4567" value={form.phone} onChange={(e) => set("phone", e.target.value)} /></F>
                <F label="Email"><Input type="email" placeholder="arun@store.com" value={form.email} onChange={(e) => set("email", e.target.value)} /></F>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <F label="Gender">
                  <Select value={form.gender} onValueChange={(v) => set("gender", v)}>
                    <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MALE">Male</SelectItem>
                      <SelectItem value="FEMALE">Female</SelectItem>
                      <SelectItem value="OTHER">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </F>
                <F label="Date of Birth"><Input type="date" value={form.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} /></F>
              </div>
              <F label="Address"><Input placeholder="Full address" value={form.address} onChange={(e) => set("address", e.target.value)} /></F>
            </TabsContent>

            <TabsContent value="work" className="mt-0 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <F label="Designation">
                  <Select value={form.designation || "__none"} onValueChange={(v) => set("designation", v === "__none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">—</SelectItem>
                      {designations.map((d) => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </F>
                <F label="Department">
                  <Select value={form.department || "__none"} onValueChange={(v) => set("department", v === "__none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">—</SelectItem>
                      {departments.map((d) => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </F>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <F label="Branch">
                  <Select value={form.branchId} onValueChange={(v) => set("branchId", v)}>
                    <SelectTrigger><SelectValue placeholder="Select branch…" /></SelectTrigger>
                    <SelectContent>{branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                  </Select>
                </F>
                <F label="Employment Type">
                  <Select value={form.employmentType} onValueChange={(v) => set("employmentType", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FULL_TIME">Full Time</SelectItem>
                      <SelectItem value="PART_TIME">Part Time</SelectItem>
                      <SelectItem value="CONTRACT">Contract</SelectItem>
                      <SelectItem value="INTERN">Intern</SelectItem>
                    </SelectContent>
                  </Select>
                </F>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <F label="Basic Salary (LKR/mo)" req>
                  <Input type="number" min={0} placeholder="35000" value={form.basicSalary} onChange={(e) => set("basicSalary", e.target.value)} />
                </F>
                <F label="Joining Date" req>
                  <Input type="date" value={form.joiningDate} onChange={(e) => set("joiningDate", e.target.value)} />
                </F>
              </div>
              {shifts.length > 0 ? (
                <F label="Assign Shift">
                  <Select value={form.shiftId || "__none"} onValueChange={(v) => set("shiftId", v === "__none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Optional — assign work shift" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">No shift</SelectItem>
                      {shifts.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name} ({s.startTime}–{s.endTime})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </F>
              ) : null}
            </TabsContent>

            <TabsContent value="bank" className="mt-0 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <F label="NIC Number"><Input placeholder="19XXXXXXXXXV" value={form.nicNumber} onChange={(e) => set("nicNumber", e.target.value)} /></F>
                <F label="EPF Number"><Input placeholder="EPF-XXXX" value={form.epfNumber} onChange={(e) => set("epfNumber", e.target.value)} /></F>
              </div>
              <F label="ETF Number"><Input placeholder="ETF-XXXX" value={form.etfNumber} onChange={(e) => set("etfNumber", e.target.value)} /></F>
              <div className="rounded-xl border bg-muted/20 p-3 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Bank Details</p>
                <F label="Bank Name"><Input placeholder="Commercial Bank" value={form.bankName} onChange={(e) => set("bankName", e.target.value)} /></F>
                <div className="grid grid-cols-2 gap-3">
                  <F label="Account Number"><Input placeholder="1234567890" value={form.accountNumber} onChange={(e) => set("accountNumber", e.target.value)} className="font-mono" /></F>
                  <F label="Branch"><Input placeholder="Colombo" value={form.bankBranch} onChange={(e) => set("bankBranch", e.target.value)} /></F>
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>

        <div className={modalBarFooterClass}>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button onClick={submit} disabled={loading} className="gap-1.5 min-w-[130px]">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserCog className="h-3.5 w-3.5" />}
            {editEmployee ? "Save Changes" : "Add Employee"}
          </Button>
        </div>
      </div>
    </div>
  );
}
