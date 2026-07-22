"use client";

import * as React from "react";
import { Loader2, Monitor, Pencil, Plus, Power, PowerOff } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export type PosCounterRow = {
  id: string;
  name: string;
  code: string;
  sortOrder: number;
  isActive: boolean;
};

export function PosCountersPanel() {
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [rows, setRows] = React.useState<PosCounterRow[]>([]);
  const [name, setName] = React.useState("");
  const [code, setCode] = React.useState("");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editName, setEditName] = React.useState("");
  const [editCode, setEditCode] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<PosCounterRow[]>("/cash/counters?all=1");
      setRows(Array.isArray(res.data) ? res.data : []);
    } catch (e: unknown) {
      toast.error((e as Error).message || "Failed to load counters");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Enter counter name");
      return;
    }
    setSaving(true);
    try {
      await api.post("/cash/counters", {
        name: trimmed,
        code: code.trim() || undefined,
      });
      toast.success("Counter created");
      setName("");
      setCode("");
      await load();
    } catch (e: unknown) {
      toast.error((e as Error).message || "Failed to create counter");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (row: PosCounterRow) => {
    setEditingId(row.id);
    setEditName(row.name);
    setEditCode(row.code);
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    const trimmed = editName.trim();
    if (!trimmed) {
      toast.error("Enter counter name");
      return;
    }
    setSaving(true);
    try {
      await api.put(`/cash/counters/${editingId}`, {
        name: trimmed,
        code: editCode.trim() || undefined,
      });
      toast.success("Counter updated");
      setEditingId(null);
      await load();
    } catch (e: unknown) {
      toast.error((e as Error).message || "Failed to update counter");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (row: PosCounterRow) => {
    setSaving(true);
    try {
      if (row.isActive) {
        await api.delete(`/cash/counters/${row.id}`);
        toast.success(`${row.name} deactivated`);
      } else {
        await api.put(`/cash/counters/${row.id}`, { isActive: true });
        toast.success(`${row.name} activated`);
      }
      await load();
    } catch (e: unknown) {
      toast.error((e as Error).message || "Failed to update counter");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card className="card-hover">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Plus className="h-4 w-4 text-emerald-600" /> Add cashier counter
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Create counters for each POS till (e.g. Counter 1, Counter 2). Cashiers select one when starting a shift.
          </p>
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Name</Label>
            <Input
              placeholder="Counter 4"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleCreate();
                }
              }}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Code (optional)</Label>
            <Input
              placeholder="Auto (C4, C5…)"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
          </div>
          <Button
            variant="success"
            size="lg"
            onClick={() => void handleCreate()}
            disabled={saving}
            className="w-full h-11 rounded-xl gap-2"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create counter
          </Button>
        </CardContent>
      </Card>

      <Card className="card-hover">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Monitor className="h-4 w-4 text-emerald-600" /> Branch counters
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-10 flex justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No counters yet. Create one on the left.</p>
          ) : (
            <ul className="space-y-2">
              {rows.map((row) => (
                <li
                  key={row.id}
                  className={cn(
                    "rounded-xl border p-3 space-y-2",
                    !row.isActive && "opacity-60 bg-muted/30",
                  )}
                >
                  {editingId === row.id ? (
                    <div className="space-y-2">
                      <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
                      <Input
                        value={editCode}
                        onChange={(e) => setEditCode(e.target.value.toUpperCase())}
                        placeholder="Code"
                      />
                      <div className="flex gap-2">
                        <Button variant="success" size="sm" className="h-9 px-4 rounded-xl" onClick={() => void handleSaveEdit()} disabled={saving}>
                          Save
                        </Button>
                        <Button size="sm" variant="outline" className="h-9 px-4 rounded-xl" onClick={() => setEditingId(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-sm truncate">{row.name}</p>
                          <Badge variant="secondary" className="text-[10px] font-mono">
                            {row.code}
                          </Badge>
                          <Badge variant={row.isActive ? "success" : "secondary"} className="text-[10px]">
                            {row.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                      </div>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="shrink-0"
                        onClick={() => startEdit(row)}
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="shrink-0"
                        onClick={() => void toggleActive(row)}
                        disabled={saving}
                        title={row.isActive ? "Deactivate" : "Activate"}
                      >
                        {row.isActive ? (
                          <PowerOff className="h-3.5 w-3.5 text-amber-600" />
                        ) : (
                          <Power className="h-3.5 w-3.5 text-emerald-600" />
                        )}
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
