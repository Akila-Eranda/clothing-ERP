"use client";

import { useState, useEffect } from "react";
import { X, UserPlus, Loader2, Tag, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { api } from "@/lib/api";

export interface Customer {
  id: string; code: string;
  firstName: string; lastName?: string | null;
  phone: string; email?: string | null;
  gender?: string | null; dateOfBirth?: string | null; anniversary?: string | null;
  address?: string | null; city?: string | null;
  tier: string; loyaltyPoints: number; walletBalance: number;
  creditLimit: number; creditBalance: number;
  totalSpent: number; totalOrders: number;
  isActive: boolean; referralCode?: string | null;
  notes?: string | null; tags: string[];
  createdAt: string; updatedAt: string;
  lastPurchaseAt?: string | null;
}

interface Form {
  firstName: string; lastName: string; phone: string; email: string;
  gender: string; dateOfBirth: string; anniversary: string;
  address: string; city: string; notes: string;
  tags: string[]; tagInput: string; creditLimit: string;
}

const INIT: Form = {
  firstName: "", lastName: "", phone: "", email: "",
  gender: "", dateOfBirth: "", anniversary: "",
  address: "", city: "", notes: "", tags: [], tagInput: "", creditLimit: "",
};

interface Props { open: boolean; onClose: () => void; onSaved: () => void; editCustomer?: Customer; }

function Field({ label, req, children }: { label: string; req?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold">{label}{req && <span className="text-destructive ml-0.5">*</span>}</Label>
      {children}
    </div>
  );
}

export function AddCustomerModal({ open, onClose, onSaved, editCustomer }: Props) {
  const [form, setForm]     = useState<Form>(INIT);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editCustomer) {
      setForm({
        firstName: editCustomer.firstName, lastName: editCustomer.lastName ?? "",
        phone: editCustomer.phone, email: editCustomer.email ?? "",
        gender: editCustomer.gender ?? "", dateOfBirth: editCustomer.dateOfBirth?.split("T")[0] ?? "",
        anniversary: editCustomer.anniversary?.split("T")[0] ?? "",
        address: editCustomer.address ?? "", city: editCustomer.city ?? "",
        notes: editCustomer.notes ?? "", tags: editCustomer.tags ?? [], tagInput: "",
        creditLimit: editCustomer.creditLimit > 0 ? String(editCustomer.creditLimit) : "",
      });
    } else { setForm(INIT); }
  }, [open, editCustomer]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((p) => ({ ...p, [k]: v }));

  const addTag = () => {
    const t = form.tagInput.trim();
    if (t && !form.tags.includes(t)) setForm((p) => ({ ...p, tags: [...p.tags, t], tagInput: "" }));
    else setForm((p) => ({ ...p, tagInput: "" }));
  };

  const removeTag = (t: string) => setForm((p) => ({ ...p, tags: p.tags.filter((x) => x !== t) }));

  const submit = async () => {
    if (!form.firstName.trim()) { toast.error("First name is required"); return; }
    if (!form.phone.trim())     { toast.error("Phone number is required"); return; }
    setLoading(true);
    try {
      const creditLimit = form.creditLimit.trim() ? parseFloat(form.creditLimit) : undefined;
      if (creditLimit !== undefined && (isNaN(creditLimit) || creditLimit < 0)) {
        toast.error("Credit limit must be a valid non-negative number");
        setLoading(false);
        return;
      }
      const payload = {
        firstName: form.firstName.trim(),
        lastName: form.lastName || undefined,
        phone: form.phone.trim(),
        email: form.email || undefined,
        gender: (form.gender as "MALE" | "FEMALE" | "OTHER") || undefined,
        dateOfBirth: form.dateOfBirth || undefined,
        anniversary: form.anniversary || undefined,
        address: form.address || undefined,
        city: form.city || undefined,
        notes: form.notes || undefined,
        tags: form.tags,
        ...(creditLimit !== undefined ? { creditLimit } : {}),
      };
      if (editCustomer) {
        await api.put(`/customers/${editCustomer.id}`, payload);
        toast.success("Customer updated");
      } else {
        await api.post("/customers", payload);
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
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b shrink-0">
          <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <UserPlus className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-bold">{editCustomer ? "Edit Customer" : "Add New Customer"}</h2>
            <p className="text-xs text-muted-foreground">{editCustomer ? `Editing: ${editCustomer.firstName} ${editCustomer.lastName ?? ""}` : "Create a new customer profile"}</p>
          </div>
          <button onClick={onClose} className="ml-auto p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="First Name" req>
              <Input placeholder="e.g. Akila" value={form.firstName} onChange={(e) => set("firstName", e.target.value)} autoFocus />
            </Field>
            <Field label="Last Name">
              <Input placeholder="e.g. Eranda" value={form.lastName} onChange={(e) => set("lastName", e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone" req>
              <Input placeholder="+94 77 123 4567" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </Field>
            <Field label="Email">
              <Input type="email" placeholder="akila@email.com" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Gender">
              <Select value={form.gender} onValueChange={(v) => set("gender", v)}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MALE">Male</SelectItem>
                  <SelectItem value="FEMALE">Female</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Date of Birth">
              <Input type="date" value={form.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} />
            </Field>
            <Field label="Anniversary">
              <Input type="date" value={form.anniversary} onChange={(e) => set("anniversary", e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="City">
              <Input placeholder="Colombo" value={form.city} onChange={(e) => set("city", e.target.value)} />
            </Field>
            <Field label="Address">
              <Input placeholder="123 Main St" value={form.address} onChange={(e) => set("address", e.target.value)} />
            </Field>
          </div>
          <Field label="Notes">
            <Textarea rows={2} placeholder="Internal notes…" value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </Field>
          <Field label="Credit Limit (LKR)">
            <Input type="number" min="0" step="0.01" placeholder="0 = no credit sales" value={form.creditLimit} onChange={(e) => set("creditLimit", e.target.value)} />
          </Field>
          <Field label="Tags">
            <div className="flex gap-1.5">
              <Input placeholder="Add tag…" value={form.tagInput} onChange={(e) => set("tagInput", e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }} />
              <Button type="button" size="sm" variant="outline" onClick={addTag} className="shrink-0"><Plus className="h-3.5 w-3.5" /></Button>
            </div>
            {form.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {form.tags.map((t) => (
                  <Badge key={t} variant="secondary" className="text-xs gap-1 cursor-pointer" onClick={() => removeTag(t)}>
                    <Tag className="h-2.5 w-2.5" />{t}<X className="h-2.5 w-2.5" />
                  </Badge>
                ))}
              </div>
            )}
          </Field>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t bg-muted/10 shrink-0">
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button onClick={submit} disabled={loading} className="gap-1.5 min-w-[130px]">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
            {editCustomer ? "Save Changes" : "Add Customer"}
          </Button>
        </div>
      </div>
    </div>
  );
}
