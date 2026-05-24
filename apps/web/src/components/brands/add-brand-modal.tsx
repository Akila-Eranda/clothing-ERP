"use client";

import { useState, useEffect } from "react";
import { X, Star, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { api } from "@/lib/api";

export interface BrandItem {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  logo?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count: { products: number };
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editBrand?: BrandItem;
}

interface Form { name: string; description: string; logo: string; isActive: boolean; }
const INIT: Form = { name: "", description: "", logo: "", isActive: true };

export function AddBrandModal({ open, onClose, onSaved, editBrand }: Props) {
  const [form, setForm]   = useState<Form>(INIT);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (editBrand) {
      setForm({ name: editBrand.name, description: editBrand.description ?? "", logo: editBrand.logo ?? "", isActive: editBrand.isActive });
    } else {
      setForm(INIT);
    }
  }, [editBrand, open]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((p) => ({ ...p, [k]: v }));
  const handleClose = () => { setForm(INIT); onClose(); };

  const submit = async () => {
    if (!form.name.trim()) { toast.error("Brand name is required"); return; }
    setLoading(true);
    try {
      if (editBrand) {
        await api.put(`/brands/${editBrand.id}`, { name: form.name.trim(), description: form.description || undefined, logo: form.logo || undefined });
        toast.success(`"${form.name}" updated`);
      } else {
        await api.post("/brands", { name: form.name.trim(), description: form.description || undefined, logo: form.logo || undefined });
        toast.success(`"${form.name}" created`);
      }
      onSaved();
      handleClose();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? (editBrand ? "Update failed" : "Create failed"));
    } finally { setLoading(false); }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-md border overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b">
          <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Star className="h-4.5 w-4.5 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-bold">{editBrand ? "Edit Brand" : "Add New Brand"}</h2>
            <p className="text-xs text-muted-foreground">{editBrand ? `Editing: ${editBrand.name}` : "Create a new product brand"}</p>
          </div>
          <button onClick={handleClose} className="ml-auto p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Brand Name <span className="text-destructive">*</span></Label>
            <Input placeholder="e.g. FabricFusion" value={form.name} onChange={(e) => set("name", e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Logo URL <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input placeholder="https://example.com/logo.png" value={form.logo} onChange={(e) => set("logo", e.target.value)} />
            {form.logo && (
              <div className="mt-2 flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={form.logo} alt="logo preview" className="h-10 w-10 rounded-lg object-contain border bg-muted/30" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                <span className="text-xs text-muted-foreground">Logo preview</span>
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea placeholder="Brief description of this brand..." rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} />
          </div>
          <div className="flex items-center justify-between rounded-xl border px-4 py-3 bg-muted/20">
            <div>
              <p className="text-sm font-semibold">Active</p>
              <p className="text-xs text-muted-foreground">Brand visible in catalog and product forms</p>
            </div>
            <Switch checked={form.isActive} onCheckedChange={(v) => set("isActive", v)} />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t bg-muted/10">
          <Button variant="outline" onClick={handleClose} disabled={loading}>Cancel</Button>
          <Button onClick={submit} disabled={loading} className="gap-1.5 min-w-[120px]">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Star className="h-3.5 w-3.5" />}
            {editBrand ? "Save Changes" : "Add Brand"}
          </Button>
        </div>
      </div>
    </div>
  );
}
