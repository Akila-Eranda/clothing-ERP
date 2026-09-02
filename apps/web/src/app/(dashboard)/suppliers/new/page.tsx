"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Truck, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useShopWorkspace } from "@/lib/use-shop-profile";
import { getSupplierPageCopy } from "@/lib/shop-vertical";
import { cn } from "@/lib/utils";
import {
  FORM_PAGE, FORM_CARD, FORM_CARD_HEADER, FORM_FIELD, FORM_LABEL,
  FORM_ORANGE_BTN, FORM_OUTLINE_BTN, FORM_HEADER_ICON_WRAP, FORM_HEADER_ICON,
  FORM_STATUS_BADGE, FORM_SUBTITLE,
} from "@/lib/form-shell-theme";

// ── Types ────────────────────────────────────────────────────────────────
interface Form {
  name: string; contactPerson: string; phone: string; email: string;
  address: string; city: string; state: string; pincode: string;
  gstNumber: string; panNumber: string;
  creditDays: string; creditLimit: string;
  isActive: boolean; notes: string;
}
const INIT: Form = {
  name: "", contactPerson: "", phone: "", email: "",
  address: "", city: "", state: "", pincode: "",
  gstNumber: "", panNumber: "",
  creditDays: "30", creditLimit: "0",
  isActive: true, notes: "",
};

function F({ label, req, children }: { label: string; req?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className={FORM_LABEL}>{label}{req && <span className="text-destructive ml-0.5">*</span>}</Label>
      {children}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────
export default function NewSupplierPage() {
  const router  = useRouter();
  const { profile, workspace } = useShopWorkspace();
  const copy = getSupplierPageCopy(profile, workspace);
  const [form, setForm]     = useState<Form>(INIT);
  const [loading, setLoading] = useState(false);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((p) => ({ ...p, [k]: v }));

  const sp = parseFloat(form.creditLimit || "0");
  const cd = parseInt(form.creditDays || "30");

  const submit = async () => {
    if (!form.name.trim()) { toast.error(`${copy.nameLabel} is required`); return; }
    if (!form.phone.trim()) { toast.error("Phone is required"); return; }
    setLoading(true);
    try {
      await api.post("/suppliers", {
        name:          form.name.trim(),
        contactPerson: form.contactPerson || undefined,
        phone:         form.phone.trim(),
        email:         form.email || undefined,
        address:       form.address || undefined,
        city:          form.city || undefined,
        state:         form.state || undefined,
        pincode:       form.pincode || undefined,
        gstNumber:     form.gstNumber || undefined,
        notes:         form.notes || undefined,
        creditDays:    cd,
        creditLimit:   sp,
      });
      toast.success(`"${form.name}" added!`);
      router.push("/suppliers");
    } catch (e: unknown) {
      toast.error((e as Error).message ?? `Failed to create ${copy.singular.toLowerCase()}`);
    } finally { setLoading(false); }
  };

  return (
    <div className={cn(FORM_PAGE, "h-full flex flex-col pb-8")}>
      <div className={cn("px-4 sm:px-6 py-4 shrink-0", FORM_CARD_HEADER)}>
        <button
          type="button"
          onClick={() => router.push("/suppliers")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors font-medium mb-4"
        >
          <ArrowLeft className="h-4 w-4" /> {copy.backLabel}
        </button>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className={FORM_HEADER_ICON_WRAP}>
                <Truck className={FORM_HEADER_ICON} />
              </div>
              <span className={FORM_STATUS_BADGE}>
                {form.isActive ? "Active" : "Inactive"}
              </span>
            </div>
            <p className={cn("text-sm mt-1.5 ml-12 sm:ml-[3.25rem]", FORM_SUBTITLE)}>
              {profile.label} · New {copy.singular}
            </p>
          </div>

          <Button
            size="sm"
            disabled={loading}
            onClick={submit}
            className={cn("gap-1.5 h-9 shrink-0", FORM_ORANGE_BTN)}
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {copy.saveButton}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
      <div className="p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5 lg:gap-6 items-start">

        {/* ══ LEFT COLUMN ══ */}
        <div className="space-y-5">

          <div className={cn(FORM_CARD, "p-6 space-y-4")}>
            <h2 className="font-semibold text-base border-b border-border pb-2">Basic Information</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <F label={copy.nameLabel} req>
                  <Input placeholder={copy.namePlaceholder} value={form.name} onChange={(e) => set("name", e.target.value)} className={cn(FORM_FIELD, "h-10")} />
                </F>
              </div>
              <div className="space-y-1.5">
                <F label="Contact Person">
                  <Input placeholder="e.g. Kamal Perera" value={form.contactPerson} onChange={(e) => set("contactPerson", e.target.value)} className={cn(FORM_FIELD, "h-10")} />
                </F>
              </div>
              <div className="space-y-1.5">
                <F label="Phone" req>
                  <Input placeholder="+94 77 123 4567" value={form.phone} onChange={(e) => set("phone", e.target.value)} className={cn(FORM_FIELD, "h-10")} />
                </F>
              </div>
              <div className="space-y-1.5">
                <F label="Email">
                  <Input type="email" placeholder="contact@supplier.com" value={form.email} onChange={(e) => set("email", e.target.value)} className={cn(FORM_FIELD, "h-10")} />
                </F>
              </div>
            </div>
          </div>

          {/* Address */}
          <div className={cn(FORM_CARD, "p-6 space-y-4")}>
            <h2 className="font-semibold text-base border-b pb-2">Address</h2>
            <div className="col-span-2 space-y-1.5">
              <F label="Street Address">
                <Input placeholder="No. 123, Main Street" value={form.address} onChange={(e) => set("address", e.target.value)} />
              </F>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <F label="City">
                <Input placeholder="Colombo" value={form.city} onChange={(e) => set("city", e.target.value)} />
              </F>
              <F label="State / Province">
                <Input placeholder="Western" value={form.state} onChange={(e) => set("state", e.target.value)} />
              </F>
              <F label="Postal Code">
                <Input placeholder="10100" value={form.pincode} onChange={(e) => set("pincode", e.target.value)} />
              </F>
            </div>
          </div>

          {/* Business / Tax */}
          <div className={cn(FORM_CARD, "p-6 space-y-4")}>
            <h2 className="font-semibold text-base border-b border-border pb-2">Business Details</h2>
            <div className="grid grid-cols-2 gap-4">
              <F label="GST / VAT Number">
                <Input placeholder="e.g. 27AABCU9603R1ZX" value={form.gstNumber} onChange={(e) => set("gstNumber", e.target.value)} />
              </F>
              <F label="PAN / BRN Number">
                <Input placeholder="e.g. AABCU9603R" value={form.panNumber} onChange={(e) => set("panNumber", e.target.value)} />
              </F>
            </div>
          </div>

        </div>
        {/* ══ END LEFT COLUMN ══ */}

        {/* ══ RIGHT SIDEBAR ══ */}
        <div className="space-y-4 lg:sticky lg:top-6">

          {/* Status */}
          <div className={cn(FORM_CARD, "p-5 space-y-3")}>
            <h3 className="font-semibold text-sm border-b border-border pb-2">Status</h3>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{copy.activeLabel}</p>
                <p className="text-xs text-muted-foreground">{form.isActive ? copy.activeHint : "Disabled"}</p>
              </div>
              <Switch checked={form.isActive} onCheckedChange={(v) => set("isActive", v)} />
            </div>
          </div>

          {/* Credit Terms */}
          <div className={cn(FORM_CARD, "p-5 space-y-3")}>
            <h3 className="font-semibold text-sm border-b border-border pb-2">Credit Terms (LKR)</h3>
            <F label="Credit Days">
              <Input type="number" min={0} value={form.creditDays} onChange={(e) => set("creditDays", e.target.value)} />
            </F>
            <F label="Credit Limit">
              <Input type="number" min={0} placeholder="0.00" value={form.creditLimit} onChange={(e) => set("creditLimit", e.target.value)} />
            </F>
            {sp > 0 && (
              <p className="text-xs text-muted-foreground">
                Max credit: <strong className="text-violet-500">LKR {sp.toLocaleString("en-LK")}</strong> over <strong>{cd}</strong> days
              </p>
            )}
          </div>

          {/* Notes */}
          <div className={cn(FORM_CARD, "p-5 space-y-2")}>
            <h3 className="font-semibold text-sm border-b border-border pb-2">Notes</h3>
            <Textarea rows={3} placeholder={copy.notesPlaceholder} value={form.notes}
              onChange={(e) => set("notes", e.target.value)} />
          </div>

          {/* Summary */}
          <div className={cn(FORM_CARD, "p-5 space-y-2 text-sm")}>
            <h3 className="font-semibold text-sm border-b border-border pb-2">Summary</h3>
            {[
              ["Name",    form.name    || <span className="text-muted-foreground italic">Not set</span>],
              ["Phone",   form.phone   || <span className="text-muted-foreground italic">Not set</span>],
              ["City",    form.city    || <span className="text-muted-foreground italic">—</span>],
              ["Credit",  sp > 0 ? `LKR ${sp.toLocaleString("en-LK")}` : "None"],
              ["Status",  form.isActive ? "Active" : "Inactive"],
            ].map(([label, val]) => (
              <div key={String(label)} className="flex justify-between gap-2">
                <span className="text-muted-foreground shrink-0">{label}</span>
                <span className="font-medium text-right truncate">{val as React.ReactNode}</span>
              </div>
            ))}
          </div>

          <div className={cn(FORM_CARD, "p-5")}>
            <Button variant="ghost" className="w-full text-muted-foreground hover:text-foreground" onClick={() => router.push("/suppliers")}>
              Cancel
            </Button>
          </div>

        </div>
        {/* ══ END SIDEBAR ══ */}

      </div>
      </div>
    </div>
  );
}
