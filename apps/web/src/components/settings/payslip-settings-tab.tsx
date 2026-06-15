"use client";

import * as React from "react";
import { FileText, Loader2, Check, Eye } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  PAYSLIP_DEFAULTS,
  type PayslipSettings,
  usePayslipSettings,
} from "@/lib/use-payslip-settings";
import { type ReceiptSettings } from "@/lib/use-receipt-settings";
import { buildThermalPayslipHtml, PAYSLIP_PREVIEW_SAMPLE } from "@/lib/payslip-print";

interface PayslipSettingsTabProps {
  receiptSettings: ReceiptSettings;
}

export function PayslipSettingsTab({ receiptSettings }: PayslipSettingsTabProps) {
  const { settings, loading, save } = usePayslipSettings();
  const [form, setForm] = React.useState<PayslipSettings>(PAYSLIP_DEFAULTS);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setForm({ ...PAYSLIP_DEFAULTS, ...settings });
  }, [settings]);

  const set = <K extends keyof PayslipSettings>(key: K, value: PayslipSettings[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  async function handleSave() {
    setSaving(true);
    try {
      await save(form);
      toast.success("Payslip template saved");
    } catch {
      toast.error("Failed to save payslip settings");
    } finally {
      setSaving(false);
    }
  }

  function openPreview() {
    const html = buildThermalPayslipHtml(
      PAYSLIP_PREVIEW_SAMPLE,
      new Date().getMonth() + 1,
      new Date().getFullYear(),
      receiptSettings,
      form,
    );
    const w = window.open("", "_blank", "width=420,height=720,scrollbars=yes");
    if (!w) {
      toast.error("Allow popups to preview payslip");
      return;
    }
    w.document.write(html);
    w.document.close();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading payslip settings…
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-sm">Customize printed payslips</p>
            <p className="text-xs text-muted-foreground">
              HR → Payroll → Print uses this template. Printing uses the same store print server as receipts.
            </p>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={openPreview}>
            <Eye className="h-3.5 w-3.5" /> Preview sample
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" /> Header &amp; messages
            </CardTitle>
            <CardDescription>Title, company block and footer text on each payslip</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between py-1">
              <div>
                <p className="text-sm font-medium">Use Receipt Print shop info</p>
                <p className="text-xs text-muted-foreground">Name, address, phone from Receipt Print tab</p>
              </div>
              <Switch checked={form.useReceiptShopInfo} onCheckedChange={(v) => set("useReceiptShopInfo", v)} />
            </div>

            {!form.useReceiptShopInfo && (
              <>
                <div className="space-y-1.5">
                  <Label>Company name</Label>
                  <Input value={form.companyName} onChange={(e) => set("companyName", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Tagline</Label>
                  <Input value={form.tagline} onChange={(e) => set("tagline", e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5 col-span-2">
                    <Label>Address line 1</Label>
                    <Input value={form.address1} onChange={(e) => set("address1", e.target.value)} />
                  </div>
                  <div className="space-y-1.5 col-span-2">
                    <Label>Address line 2</Label>
                    <Input value={form.address2} onChange={(e) => set("address2", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Phone</Label>
                    <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Email</Label>
                    <Input value={form.email} onChange={(e) => set("email", e.target.value)} />
                  </div>
                </div>
              </>
            )}

            <Separator />

            <div className="space-y-1.5">
              <Label>Document title</Label>
              <Input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="PAYSLIP" />
            </div>
            <div className="space-y-1.5">
              <Label>Header message</Label>
              <Input value={form.headerText} onChange={(e) => set("headerText", e.target.value)} placeholder="Confidential — for employee only" />
            </div>
            <div className="space-y-1.5">
              <Label>Footer message</Label>
              <Input value={form.footerText} onChange={(e) => set("footerText", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Thank you line</Label>
              <Input value={form.thankYouText} onChange={(e) => set("thankYouText", e.target.value)} placeholder="THANK YOU!" />
            </div>
            <div className="space-y-1.5">
              <Label>Signature line</Label>
              <Input value={form.signatureLine} onChange={(e) => set("signatureLine", e.target.value)} placeholder="Authorized: ___________________" />
            </div>
            <div className="space-y-1.5">
              <Label>Currency label</Label>
              <Input value={form.currencyLabel} onChange={(e) => set("currencyLabel", e.target.value)} className="w-32" />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Line labels</CardTitle>
              <CardDescription>Rename earnings and deduction rows</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {([
                ["labelEarningsSection", "Earnings section"],
                ["labelDeductionsSection", "Deductions section"],
                ["labelBasicSalary", "Basic salary"],
                ["labelAllowances", "Allowances"],
                ["labelBonus", "Bonus"],
                ["labelDeductions", "Deductions row"],
                ["labelNetPay", "Net pay label"],
              ] as const).map(([key, label]) => (
                <div key={key} className="space-y-1.5">
                  <Label>{label}</Label>
                  <Input value={form[key]} onChange={(e) => set(key, e.target.value)} />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Show / hide &amp; layout</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {([
                { key: "showLogo" as const, label: "Company logo", desc: "Uses payslip logo URL or receipt logo" },
                { key: "showShopContact" as const, label: "Phone & email", desc: "Contact lines under company name" },
                { key: "showPayslipNumber" as const, label: "Payslip number", desc: "PS-YYYY-MM-… reference" },
                { key: "showEmployeeId" as const, label: "Employee ID", desc: "EMP- code on slip" },
                { key: "showDesignation" as const, label: "Designation", desc: "Job title line" },
                { key: "showPayPeriod" as const, label: "Pay period", desc: "Month date range" },
                { key: "showPaidDate" as const, label: "Paid date", desc: "Payment date or Pending" },
              ]).map((item) => (
                <div key={item.key} className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
                  <div>
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                  <Switch checked={form[item.key]} onCheckedChange={(v) => set(item.key, v)} />
                </div>
              ))}

              <div className="grid grid-cols-2 gap-3 pt-3">
                <div className="space-y-1.5">
                  <Label>Paper width</Label>
                  <select
                    value={form.paperWidth}
                    onChange={(e) => set("paperWidth", e.target.value as PayslipSettings["paperWidth"])}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="inherit">Same as receipt</option>
                    <option value="58mm">58 mm</option>
                    <option value="80mm">80 mm</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Font size</Label>
                  <select
                    value={form.fontSize}
                    onChange={(e) => set("fontSize", e.target.value as PayslipSettings["fontSize"])}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="inherit">Same as receipt</option>
                    <option value="small">Small</option>
                    <option value="medium">Medium</option>
                    <option value="large">Large</option>
                  </select>
                </div>
              </div>

              {form.showLogo && (
                <div className="space-y-1.5 pt-2">
                  <Label>Logo URL <span className="text-muted-foreground font-normal">(optional override)</span></Label>
                  <Input
                    value={form.logoUrl}
                    onChange={(e) => set("logoUrl", e.target.value)}
                    placeholder="Leave empty to use receipt logo"
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={openPreview} className="gap-1.5">
          <Eye className="h-3.5 w-3.5" /> Preview
        </Button>
        <Button variant="gradient" onClick={handleSave} disabled={saving} className="gap-1.5">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Save payslip template
        </Button>
      </div>
    </div>
  );
}
