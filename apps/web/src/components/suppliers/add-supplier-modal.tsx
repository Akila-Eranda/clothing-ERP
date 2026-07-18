"use client";

import { useState, useEffect } from "react";
import { X, Truck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { modalBarFooterClass } from "@/components/ui/modal-footer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useShopWorkspace } from "@/lib/use-shop-profile";
import { getSupplierPageCopy } from "@/lib/shop-vertical";

export interface Supplier {
  id: string; code?: string | null;
  name: string; phone: string;
  contactPerson?: string | null; email?: string | null;
  address?: string | null; city?: string | null; state?: string | null; pincode?: string | null;
  gstNumber?: string | null; panNumber?: string | null;
  creditDays: number; creditLimit: number; balance: number;
  rating: number; isActive: boolean; notes?: string | null;
  createdAt: string; updatedAt: string;
  _count?: { purchases: number };
}

interface Form {
  name: string; phone: string; contactPerson: string; email: string;
  address: string; city: string; state: string; pincode: string;
  gstNumber: string; creditDays: string; creditLimit: string; notes: string;
}

const INIT: Form = {
  name: "", phone: "", contactPerson: "", email: "",
  address: "", city: "", state: "", pincode: "",
  gstNumber: "", creditDays: "30", creditLimit: "0", notes: "",
};

interface Props { open: boolean; onClose: () => void; onSaved: () => void; editSupplier?: Supplier; }

function F({ label, req, children }: { label: string; req?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold">{label}{req && <span className="text-destructive ml-0.5">*</span>}</Label>
      {children}
    </div>
  );
}

export function AddSupplierModal({ open, onClose, onSaved, editSupplier }: Props) {
  const { profile, workspace } = useShopWorkspace();
  const copy = getSupplierPageCopy(profile, workspace);
  const [form, setForm]       = useState<Form>(INIT);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editSupplier) {
      setForm({
        name: editSupplier.name, phone: editSupplier.phone,
        contactPerson: editSupplier.contactPerson ?? "", email: editSupplier.email ?? "",
        address: editSupplier.address ?? "", city: editSupplier.city ?? "",
        state: editSupplier.state ?? "", pincode: editSupplier.pincode ?? "",
        gstNumber: editSupplier.gstNumber ?? "",
        creditDays: String(editSupplier.creditDays ?? 30),
        creditLimit: String(editSupplier.creditLimit ?? 0),
        notes: editSupplier.notes ?? "",
      });
    } else { setForm(INIT); }
  }, [open, editSupplier]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!form.name.trim()) { toast.error(`${copy.nameLabel} is required`); return; }
    if (!form.phone.trim()) { toast.error("Phone is required"); return; }
    setLoading(true);
    try {
      const payload = {
        name: form.name.trim(), phone: form.phone.trim(),
        contactPerson: form.contactPerson || undefined, email: form.email || undefined,
        address: form.address || undefined, city: form.city || undefined,
        state: form.state || undefined,
        gstNumber: form.gstNumber || undefined,
        creditDays: parseInt(form.creditDays) || 30,
        creditLimit: parseFloat(form.creditLimit) || 0,
      };
      if (editSupplier) {
        await api.put(`/suppliers/${editSupplier.id}`, payload);
        toast.success(`${copy.singular} updated`);
      } else {
        await api.post("/suppliers", payload);
        toast.success(`${form.name} added`);
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
            <Truck className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-bold">{editSupplier ? copy.editModalTitle : copy.addModalTitle}</h2>
            <p className="text-xs text-muted-foreground">{editSupplier ? editSupplier.name : copy.addModalSubtitle}</p>
          </div>
          <button onClick={onClose} className="ml-auto p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <F label={copy.nameLabel} req>
              <Input placeholder={copy.namePlaceholder} value={form.name} onChange={(e) => set("name", e.target.value)} autoFocus />
            </F>
            <F label="Contact Person">
              <Input placeholder="e.g. Rajiv Mehta" value={form.contactPerson} onChange={(e) => set("contactPerson", e.target.value)} />
            </F>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <F label="Phone" req>
              <Input placeholder="+94 77 123 4567" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </F>
            <F label="Email">
              <Input type="email" placeholder="contact@supplier.com" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </F>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <F label="City">
              <Input placeholder="Colombo" value={form.city} onChange={(e) => set("city", e.target.value)} />
            </F>
            <F label="State">
              <Input placeholder="Western" value={form.state} onChange={(e) => set("state", e.target.value)} />
            </F>
            <F label="Pincode">
              <Input placeholder="10100" value={form.pincode} onChange={(e) => set("pincode", e.target.value)} />
            </F>
          </div>
          <F label="Address">
            <Input placeholder="Street address" value={form.address} onChange={(e) => set("address", e.target.value)} />
          </F>
          <div className="grid grid-cols-3 gap-3">
            <F label="GST Number">
              <Input placeholder="27AABCU9603R1ZX" value={form.gstNumber} onChange={(e) => set("gstNumber", e.target.value)} />
            </F>
            <F label="Credit Days">
              <Input type="number" min={0} value={form.creditDays} onChange={(e) => set("creditDays", e.target.value)} />
            </F>
            <F label="Credit Limit (LKR )">
              <Input type="number" min={0} value={form.creditLimit} onChange={(e) => set("creditLimit", e.target.value)} />
            </F>
          </div>
          <F label="Notes">
            <Textarea rows={2} placeholder={copy.notesPlaceholder} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </F>
        </div>

        {/* Footer */}
        <div className={modalBarFooterClass}>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button onClick={submit} disabled={loading} className="gap-1.5 min-w-[130px]">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Truck className="h-3.5 w-3.5" />}
            {editSupplier ? copy.updateButton : copy.addButton}
          </Button>
        </div>
      </div>
    </div>
  );
}
