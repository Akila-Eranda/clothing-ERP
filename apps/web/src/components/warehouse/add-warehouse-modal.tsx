"use client";

import { useState, useEffect } from "react";
import { X, Warehouse, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { modalBarFooterClass } from "@/components/ui/modal-footer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { api } from "@/lib/api";

export interface WarehouseRecord {
  id: string;
  name: string;
  code: string;
  address?: string | null;
  isDefault: boolean;
  isActive?: boolean;
  branchId: string;
  branch?: { id: string; name: string; code: string };
  _count?: { inventory: number };
  summary?: {
    skuCount: number;
    onHandQty: number;
    availableQty: number;
    stockValue: number;
    lowStockSkus: number;
  };
}

interface Form {
  name: string;
  code: string;
  address: string;
  isDefault: boolean;
}

const INIT: Form = { name: "", code: "", address: "", isDefault: false };

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  branchId: string | null;
  editWarehouse?: WarehouseRecord;
}

function Field({ label, req, children }: { label: string; req?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold">
        {label}{req && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}

export function AddWarehouseModal({ open, onClose, onSaved, branchId, editWarehouse }: Props) {
  const [form, setForm] = useState<Form>(INIT);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editWarehouse) {
      setForm({
        name: editWarehouse.name,
        code: editWarehouse.code,
        address: editWarehouse.address ?? "",
        isDefault: editWarehouse.isDefault,
      });
    } else {
      setForm(INIT);
    }
  }, [open, editWarehouse]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!form.name.trim()) { toast.error("Warehouse name is required"); return; }
    if (!form.code.trim()) { toast.error("Warehouse code is required"); return; }
    if (!editWarehouse && !branchId) { toast.error("Select a branch first"); return; }

    setLoading(true);
    try {
      if (editWarehouse) {
        await api.put(`/warehouses/${editWarehouse.id}`, {
          name: form.name.trim(),
          code: form.code.trim().toUpperCase(),
          address: form.address.trim() || undefined,
          isDefault: form.isDefault,
        });
        toast.success("Warehouse updated");
      } else {
        await api.post("/warehouses", {
          branchId,
          name: form.name.trim(),
          code: form.code.trim().toUpperCase(),
          address: form.address.trim() || undefined,
          isDefault: form.isDefault,
        });
        toast.success(`"${form.name}" created`);
      }
      onSaved();
      onClose();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to save warehouse");
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-md border overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center gap-3 px-6 py-4 border-b shrink-0">
          <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Warehouse className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-bold">{editWarehouse ? "Edit Warehouse" : "Add Warehouse"}</h2>
            <p className="text-xs text-muted-foreground">
              {editWarehouse ? editWarehouse.name : "Create a storage location for this branch"}
            </p>
          </div>
          <button type="button" onClick={onClose} className="ml-auto p-1.5 rounded-lg hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <Field label="Name" req>
            <Input
              placeholder="e.g. Backroom / Main Store"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              maxLength={80}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Code" req>
              <Input
                placeholder="e.g. BACK"
                value={form.code}
                onChange={(e) => set("code", e.target.value.toUpperCase())}
                className="font-mono"
                maxLength={24}
                disabled={!!editWarehouse?.isDefault}
              />
            </Field>
            <Field label="Address">
              <Input
                placeholder="Optional"
                value={form.address}
                onChange={(e) => set("address", e.target.value)}
              />
            </Field>
          </div>
          <div className="flex items-center justify-between rounded-xl border px-3 py-2.5">
            <div>
              <p className="text-sm font-medium">Default warehouse</p>
              <p className="text-xs text-muted-foreground">Used when stock is received without a location</p>
            </div>
            <Switch checked={form.isDefault} onCheckedChange={(v) => set("isDefault", v)} />
          </div>
        </div>

        <div className={modalBarFooterClass}>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button onClick={submit} disabled={loading} className="min-w-[120px] gap-1.5">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Warehouse className="h-3.5 w-3.5" />}
            {editWarehouse ? "Update" : "Create"}
          </Button>
        </div>
      </div>
    </div>
  );
}
