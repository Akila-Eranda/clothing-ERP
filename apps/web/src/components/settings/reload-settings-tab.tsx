"use client";

import * as React from "react";
import { Loader2, Plus, Smartphone, Upload } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type ReloadDenom = {
  id: string;
  faceValue: number;
  isActive: boolean;
  availableCards: number;
};

type ReloadOperator = {
  id: string;
  code: string;
  name: string;
  digitalCommissionPct: number;
  physicalCommissionPct: number;
  isActive: boolean;
  denominations: ReloadDenom[];
};

export function ReloadSettingsTab() {
  const [reloadEnabled, setReloadEnabled] = React.useState(true);
  const [savingToggle, setSavingToggle] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [operators, setOperators] = React.useState<ReloadOperator[]>([]);
  const [savingId, setSavingId] = React.useState<string | null>(null);
  const [newName, setNewName] = React.useState("");
  const [adding, setAdding] = React.useState(false);

  const [importOpId, setImportOpId] = React.useState("");
  const [importDenomId, setImportDenomId] = React.useState("");
  const [importPins, setImportPins] = React.useState("");
  const [importing, setImporting] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [pos, ops] = await Promise.all([
        api.get<{ reloadEnabled?: boolean }>("/tenants/pos-settings"),
        api.get<ReloadOperator[]>("/pos/reload/operators"),
      ]);
      setReloadEnabled(pos.data?.reloadEnabled !== false);
      const list = Array.isArray(ops.data) ? ops.data : [];
      setOperators(list);
      if (!importOpId && list[0]) {
        setImportOpId(list[0].id);
        setImportDenomId(list[0].denominations[0]?.id ?? "");
      }
    } catch (e) {
      toast.error((e as Error).message ?? "Failed to load reload settings");
    } finally {
      setLoading(false);
    }
  }, [importOpId]);

  React.useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const importOperator = operators.find((o) => o.id === importOpId);

  React.useEffect(() => {
    if (!importOperator) return;
    if (!importOperator.denominations.some((d) => d.id === importDenomId)) {
      setImportDenomId(importOperator.denominations[0]?.id ?? "");
    }
  }, [importOperator, importDenomId]);

  const saveToggle = async (v: boolean) => {
    const prev = reloadEnabled;
    setReloadEnabled(v);
    setSavingToggle(true);
    try {
      await api.put("/tenants/pos-settings", { reloadEnabled: v });
      toast.success(v ? "Reload enabled on POS" : "Reload hidden on POS");
    } catch {
      setReloadEnabled(prev);
      toast.error("Failed to save");
    } finally {
      setSavingToggle(false);
    }
  };

  const saveOperator = async (op: ReloadOperator, patch: Partial<ReloadOperator>) => {
    setSavingId(op.id);
    try {
      const r = await api.put<ReloadOperator>(`/pos/reload/operators/${op.id}`, {
        name: patch.name ?? op.name,
        digitalCommissionPct: patch.digitalCommissionPct ?? op.digitalCommissionPct,
        physicalCommissionPct: patch.physicalCommissionPct ?? op.physicalCommissionPct,
        isActive: patch.isActive ?? op.isActive,
      });
      setOperators((list) => list.map((o) => (o.id === op.id ? { ...o, ...r.data, denominations: o.denominations } : o)));
      toast.success(`${op.name} saved`);
    } catch (e) {
      toast.error((e as Error).message ?? "Save failed");
    } finally {
      setSavingId(null);
    }
  };

  const addProvider = async () => {
    if (!newName.trim()) {
      toast.error("Provider name required");
      return;
    }
    setAdding(true);
    try {
      await api.post("/pos/reload/operators", {
        name: newName.trim(),
        digitalCommissionPct: 2,
        physicalCommissionPct: 3,
      });
      setNewName("");
      toast.success("Provider added");
      await load();
    } catch (e) {
      toast.error((e as Error).message ?? "Add failed");
    } finally {
      setAdding(false);
    }
  };

  const importCards = async () => {
    if (!importOpId || !importDenomId || !importPins.trim()) {
      toast.error("Select provider, denomination, and paste PIN codes");
      return;
    }
    setImporting(true);
    try {
      const r = await api.post<{ imported: number; skipped: number }>("/pos/reload/cards/import", {
        operatorId: importOpId,
        denominationId: importDenomId,
        pins: importPins,
      });
      toast.success(`Imported ${r.data.imported} cards${r.data.skipped ? ` (${r.data.skipped} skipped)` : ""}`);
      setImportPins("");
      await load();
    } catch (e) {
      toast.error((e as Error).message ?? "Import failed");
    } finally {
      setImporting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-10">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading reload settings…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-primary" /> POS Reload / Recharge
          </CardTitle>
          <CardDescription>
            Set provider commissions here. POS cashiers only pick provider + amount — commission is applied automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Show Reload on POS sidebar</p>
              <p className="text-xs text-muted-foreground">Digital top-up and physical recharge card sales</p>
            </div>
            <Switch checked={reloadEnabled} disabled={savingToggle} onCheckedChange={(v) => void saveToggle(v)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Providers & commissions</CardTitle>
          <CardDescription>Digital and physical commissions are separate percentages per provider</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {operators.map((op) => (
            <div key={op.id} className="rounded-xl border p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Input
                    className="h-9 w-40 font-semibold"
                    value={op.name}
                    onChange={(e) =>
                      setOperators((list) => list.map((o) => (o.id === op.id ? { ...o, name: e.target.value } : o)))
                    }
                  />
                  <BadgeActive active={op.isActive} />
                  <Switch
                    checked={op.isActive}
                    onCheckedChange={(v) => void saveOperator(op, { isActive: v })}
                  />
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={savingId === op.id}
                  onClick={() => void saveOperator(op, {})}
                >
                  {savingId === op.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Digital reload commission %</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.1}
                    value={op.digitalCommissionPct}
                    onChange={(e) =>
                      setOperators((list) =>
                        list.map((o) =>
                          o.id === op.id ? { ...o, digitalCommissionPct: parseFloat(e.target.value) || 0 } : o,
                        ),
                      )
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Physical card commission %</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.1}
                    value={op.physicalCommissionPct}
                    onChange={(e) =>
                      setOperators((list) =>
                        list.map((o) =>
                          o.id === op.id ? { ...o, physicalCommissionPct: parseFloat(e.target.value) || 0 } : o,
                        ),
                      )
                    }
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Card stock:{" "}
                {op.denominations.reduce((s, d) => s + (d.availableCards || 0), 0)} available ·{" "}
                {op.denominations.map((d) => `${d.faceValue}(${d.availableCards})`).join(" · ") || "no denoms"}
              </p>
            </div>
          ))}

          <div className="flex flex-wrap gap-2 items-end pt-2 border-t">
            <div className="space-y-1.5 flex-1 min-w-[180px]">
              <Label>Add provider</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Provider name" />
            </div>
            <Button onClick={() => void addProvider()} disabled={adding}>
              {adding ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="h-4 w-4" /> Import recharge card PINs
          </CardTitle>
          <CardDescription>Paste one PIN per line (or comma-separated). Sold cards are marked at checkout.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Provider</Label>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={importOpId}
                onChange={(e) => setImportOpId(e.target.value)}
              >
                {operators.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Denomination</Label>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={importDenomId}
                onChange={(e) => setImportDenomId(e.target.value)}
              >
                {(importOperator?.denominations ?? []).map((d) => (
                  <option key={d.id} value={d.id}>LKR {d.faceValue}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>PIN codes</Label>
            <textarea
              className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
              value={importPins}
              onChange={(e) => setImportPins(e.target.value)}
              placeholder={"123456789012\n987654321098"}
            />
          </div>
          <Button onClick={() => void importCards()} disabled={importing}>
            {importing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}
            Import cards
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function BadgeActive({ active }: { active: boolean }) {
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${active ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
      {active ? "Active" : "Off"}
    </span>
  );
}
