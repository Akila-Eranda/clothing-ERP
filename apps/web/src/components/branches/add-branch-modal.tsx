"use client";

import { useState, useEffect } from "react";
import { X, Building2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { api } from "@/lib/api";

export interface Branch {
  id: string; name: string; code: string;
  address?: string | null; city?: string | null; state?: string | null;
  phone?: string | null; email?: string | null;
  isDefault: boolean; isActive: boolean;
  createdAt: string; updatedAt: string;
  _count?: { users: number; inventory: number };
}

interface Form {
  name: string; code: string; address: string;
  city: string; state: string; phone: string; email: string;
  isDefault: boolean;
}

const INIT: Form = { name: "", code: "", address: "", city: "", state: "", phone: "", email: "", isDefault: false };

interface Props { open: boolean; onClose: () => void; onSaved: () => void; editBranch?: Branch; }

export function AddBranchModal({ open, onClose, onSaved, editBranch }: Props) {
  const [form, setForm]       = useState<Form>(INIT);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editBranch) {
      setForm({
        name: editBranch.name, code: editBranch.code,
        address: editBranch.address ?? "", city: editBranch.city ?? "",
        state: editBranch.state ?? "", phone: editBranch.phone ?? "",
        email: editBranch.email ?? "", isDefault: editBranch.isDefault,
      });
    } else { setForm(INIT); }
  }, [open, editBranch]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!form.name.trim()) { toast.error("Branch name is required"); return; }
    if (!form.code.trim()) { toast.error("Branch code is required"); return; }
    setLoading(true);
    try {
      const payload = {
        name: form.name.trim(), code: form.code.trim().toUpperCase(),
        address: form.address || undefined, city: form.city || undefined,
        state: form.state || undefined, phone: form.phone || undefined,
        email: form.email || undefined, isDefault: form.isDefault,
      };
      if (editBranch) {
        await api.put(`/branches/${editBranch.id}`, payload);
        toast.success("Branch updated");
      } else {
        await api.post("/branches", payload);
        toast.success(`${form.name} created`);
      }
      onSaved(); onClose();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to save");
    } finally { setLoading(false); }
  };

  if (!open) return null;

  const F = ({ label, req, children }: { label: string; req?: boolean; children: React.ReactNode }) => (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold">{label}{req && <span className="text-destructive ml-0.5">*</span>}</Label>
      {children}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-md border overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center gap-3 px-6 py-4 border-b shrink-0">
          <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Building2 className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-bold">{editBranch ? "Edit Branch" : "Add Branch"}</h2>
            <p className="text-xs text-muted-foreground">{editBranch ? editBranch.name : "Create a new store branch"}</p>
          </div>
          <button onClick={onClose} className="ml-auto p-1.5 rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <F label="Branch Name" req>
              <Input placeholder="Main Store - Bandra" value={form.name} onChange={(e) => set("name", e.target.value)} autoFocus />
            </F>
            <F label="Branch Code" req>
              <Input placeholder="HO-001" value={form.code} onChange={(e) => set("code", e.target.value.toUpperCase())} className="font-mono" />
            </F>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <F label="City"><Input placeholder="Mumbai" value={form.city} onChange={(e) => set("city", e.target.value)} /></F>
            <F label="State"><Input placeholder="Maharashtra" value={form.state} onChange={(e) => set("state", e.target.value)} /></F>
          </div>
          <F label="Address"><Input placeholder="123 Main Road, Bandra West" value={form.address} onChange={(e) => set("address", e.target.value)} /></F>
          <div className="grid grid-cols-2 gap-3">
            <F label="Phone"><Input placeholder="+91 22 1234 5678" value={form.phone} onChange={(e) => set("phone", e.target.value)} /></F>
            <F label="Email"><Input type="email" placeholder="branch@store.com" value={form.email} onChange={(e) => set("email", e.target.value)} /></F>
          </div>
          <div className="flex items-center justify-between p-3 rounded-xl border bg-muted/10">
            <div>
              <p className="text-sm font-medium">Default Branch</p>
              <p className="text-xs text-muted-foreground">Set as the primary/HQ branch</p>
            </div>
            <Switch checked={form.isDefault} onCheckedChange={(v) => set("isDefault", v)} />
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t bg-muted/10 shrink-0">
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button onClick={submit} disabled={loading} className="gap-1.5 min-w-[120px]">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Building2 className="h-3.5 w-3.5" />}
            {editBranch ? "Save Changes" : "Add Branch"}
          </Button>
        </div>
      </div>
    </div>
  );
}
