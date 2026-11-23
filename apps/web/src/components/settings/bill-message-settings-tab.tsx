"use client";

import * as React from "react";
import { Loader2, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

type TemplateInfo = {
  template: string;
  isDefault: boolean;
  defaultTemplate: string;
  placeholders: { key: string; description: string }[];
  maxLength: number;
};

/**
 * Settings → Bill message: the text sent to customers (WhatsApp, "Copy bill message", "Share") built from a
 * template with {placeholders}. The preview is rendered by the server with sample data, so what you see is
 * exactly what customers get. Admins only (the API refuses others).
 */
export function BillMessageSettingsTab() {
  const [info, setInfo] = React.useState<TemplateInfo | null>(null);
  const [text, setText] = React.useState("");
  const [preview, setPreview] = React.useState("");
  const [previewError, setPreviewError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const area = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    api.get<TemplateInfo>("/tenants/bill-message-template")
      .then((r) => { setInfo(r.data); setText(r.data.template); })
      .catch((e: unknown) => toast.error((e as Error).message || "Could not load the bill message template"));
  }, []);

  // Live preview (debounced), rendered by the API with sample data.
  React.useEffect(() => {
    if (!info) return;
    let alive = true;
    const t = setTimeout(() => {
      api.post<{ message: string }>("/tenants/bill-message-template/preview", { template: text })
        .then((r) => { if (alive) { setPreview(r.data.message); setPreviewError(null); } })
        .catch((e: unknown) => { if (alive) setPreviewError((e as Error).message || "Preview failed"); });
    }, 350);
    return () => { alive = false; clearTimeout(t); };
  }, [text, info]);

  const insert = (key: string) => {
    const el = area.current;
    const token = `{${key}}`;
    if (!el) { setText((v) => v + token); return; }
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    const next = text.slice(0, start) + token + text.slice(end);
    setText(next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + token.length, start + token.length); });
  };

  const save = async (value: string | null) => {
    setSaving(true);
    try {
      const r = await api.put<TemplateInfo>("/tenants/bill-message-template", { template: value });
      setInfo(r.data);
      setText(r.data.template);
      toast.success(value === null ? "Default bill message restored" : "Bill message saved");
    } catch (e) {
      toast.error((e as Error).message || "Could not save — admin permission required");
    } finally {
      setSaving(false);
    }
  };

  if (!info) {
    return <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;
  }
  const dirty = text !== info.template;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Customer bill message</CardTitle>
          <CardDescription>
            Sent on WhatsApp after a sale and used by &quot;Copy bill message&quot; / &quot;Share on WhatsApp&quot;. Click a placeholder to insert it.
            A line whose placeholders are all empty (for example no shop phone) is left out.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-1.5" aria-label="Placeholders">
            {info.placeholders.map((p) => (
              <button
                key={p.key}
                type="button"
                title={p.description}
                onClick={() => insert(p.key)}
                className="rounded-md border px-2 py-1 font-mono text-[11px] hover:bg-muted"
              >
                {`{${p.key}}`}
              </button>
            ))}
          </div>
          <Label htmlFor="bill-template" className="sr-only">Bill message template</Label>
          <textarea
            id="bill-template"
            ref={area}
            value={text}
            maxLength={info.maxLength}
            onChange={(e) => setText(e.target.value)}
            rows={18}
            spellCheck={false}
            className="w-full rounded-lg border bg-background p-3 font-mono text-xs leading-relaxed outline-none focus:ring-2 focus:ring-primary/30"
          />
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{text.length} / {info.maxLength}</span>
            <span>{info.isDefault ? "Using the default message" : "Custom message"}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={saving || !dirty || !text.trim()} onClick={() => void save(text)} className="gap-1.5">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
            </Button>
            <Button size="sm" variant="outline" disabled={saving || info.isDefault && !dirty} onClick={() => void save(null)} className="gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" /> Restore default
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preview</CardTitle>
          <CardDescription>Sample invoice and customer. Real messages use the actual items, payment and the customer&apos;s current credit balance.</CardDescription>
        </CardHeader>
        <CardContent>
          {previewError ? (
            <p role="alert" className="text-sm text-destructive-text">{previewError}</p>
          ) : (
            <pre data-testid="bill-message-preview" className="whitespace-pre-wrap break-words rounded-lg border bg-muted/40 p-3 text-xs leading-relaxed">{preview}</pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
