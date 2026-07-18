"use client";

import { useState, useEffect } from "react";
import { X, UserCog, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { modalBarFooterClass } from "@/components/ui/modal-footer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { api } from "@/lib/api";

export interface Employee {
  id: string; code: string;
  firstName: string; lastName: string;
  phone: string; email?: string | null;
  designation?: string | null; department?: string | null;
  branchId?: string | null; basicSalary: number;
  gender?: string | null; joiningDate: string;
  isActive: boolean; createdAt: string;
  branch?: { id: string; name: string } | null;
}

interface Branch { id: string; name: string }

interface Form {
  firstName: string; lastName: string; phone: string; email: string;
  designation: string; department: string; branchId: string;
  basicSalary: string; gender: string; joiningDate: string;
}

const INIT: Form = {
  firstName: "", lastName: "", phone: "", email: "",
  designation: "", department: "", branchId: "",
  basicSalary: "", gender: "", joiningDate: new Date().toISOString().split("T")[0],
};

const DEPARTMENTS = ["Management", "Sales", "Operations", "Finance", "Warehouse", "Logistics", "HR", "IT", "Marketing"];

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
  const [form, setForm]       = useState<Form>(INIT);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    api.get<{ data: Branch[] }>("/branches?limit=100").then((r) => setBranches(r.data?.data ?? (r.data as unknown as Branch[]) ?? [])).catch(() => {});
    if (editEmployee) {
      setForm({
        firstName: editEmployee.firstName, lastName: editEmployee.lastName,
        phone: editEmployee.phone, email: editEmployee.email ?? "",
        designation: editEmployee.designation ?? "", department: editEmployee.department ?? "",
        branchId: editEmployee.branchId ?? "",
        basicSalary: String(editEmployee.basicSalary),
        gender: editEmployee.gender ?? "",
        joiningDate: editEmployee.joiningDate?.split("T")[0] ?? INIT.joiningDate,
      });
    } else { setForm(INIT); }
  }, [open, editEmployee]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!form.firstName.trim() || !form.lastName.trim()) { toast.error("Full name is required"); return; }
    if (!form.phone.trim())     { toast.error("Phone is required"); return; }
    if (!form.basicSalary || isNaN(parseFloat(form.basicSalary))) { toast.error("Valid salary is required"); return; }
    setLoading(true);
    try {
      const payload = {
        firstName: form.firstName.trim(), lastName: form.lastName.trim(),
        phone: form.phone.trim(), email: form.email || undefined,
        designation: form.designation || undefined, department: form.department || undefined,
        branchId: form.branchId || undefined,
        basicSalary: parseFloat(form.basicSalary),
        gender: (form.gender as "MALE" | "FEMALE" | "OTHER") || undefined,
        joiningDate: form.joiningDate,
      };
      if (editEmployee) {
        await api.put(`/hr/employees/${editEmployee.id}`, payload);
        toast.success("Employee updated");
      } else {
        await api.post("/hr/employees", payload);
        toast.success(`${form.firstName} added`);
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
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-lg border overflow-hidden max-h-[90vh] flex flex-col">
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

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <F label="First Name" req><Input placeholder="Arun" value={form.firstName} onChange={(e) => set("firstName", e.target.value)} autoFocus /></F>
            <F label="Last Name" req><Input placeholder="Kumar" value={form.lastName} onChange={(e) => set("lastName", e.target.value)} /></F>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <F label="Phone" req><Input placeholder="+91 98001 11111" value={form.phone} onChange={(e) => set("phone", e.target.value)} /></F>
            <F label="Email"><Input type="email" placeholder="arun@store.com" value={form.email} onChange={(e) => set("email", e.target.value)} /></F>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <F label="Designation"><Input placeholder="Branch Manager" value={form.designation} onChange={(e) => set("designation", e.target.value)} /></F>
            <F label="Department">
              <Select value={form.department} onValueChange={(v) => set("department", v)}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>{DEPARTMENTS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
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
          </div>
          <div className="grid grid-cols-2 gap-3">
            <F label="Basic Salary (LKR/mo)" req>
              <Input type="number" min={0} placeholder="35000" value={form.basicSalary} onChange={(e) => set("basicSalary", e.target.value)} />
            </F>
            <F label="Joining Date" req>
              <Input type="date" value={form.joiningDate} onChange={(e) => set("joiningDate", e.target.value)} />
            </F>
          </div>
        </div>

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
