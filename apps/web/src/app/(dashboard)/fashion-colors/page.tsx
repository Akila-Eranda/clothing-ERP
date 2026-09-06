"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Palette, Sparkles, Loader2 } from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TableStatusBadge } from "@/components/ui/table-status-badge";
import { PageHeader, PageKpiGrid, pageKpi } from "@/components/ui/page-kpi";
import { ClientSideTable, DataTableColumnHeader, TableActionsRow } from "@/components/table";
import { ModuleGate } from "@/components/shop/module-gate";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { parseApiList } from "@/lib/parse-api-list";
import { cn } from "@/lib/utils";
import { modalInlineFooterClass } from "@/components/ui/modal-footer";

type FashionColor = {
  id: string;
  name: string;
  code?: string | null;
  hex: string;
  isActive: boolean;
  sortOrder?: number;
};

type ColorForm = { name: string; code: string; hex: string; isActive: boolean };

const EMPTY: ColorForm = { name: "", code: "", hex: "#111827", isActive: true };

export default function FashionColorsPage() {
  const [rows, setRows] = useState<FashionColor[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FashionColor | null>(null);
  const [form, setForm] = useState<ColorForm>({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<FashionColor[]>("/clothing/colors");
      setRows(parseApiList(res.data));
    } catch {
      toast.error("Failed to load colors");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchList(); }, [fetchList]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY });
    setModalOpen(true);
  };

  const openEdit = (c: FashionColor) => {
    setEditing(c);
    setForm({ name: c.name, code: c.code ?? "", hex: c.hex || "#111827", isActive: c.isActive });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error("Name required"); return; }
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        code: form.code.trim() || undefined,
        hex: form.hex.trim() || "#111827",
        isActive: form.isActive,
      };
      if (editing) await api.put(`/clothing/colors/${editing.id}`, body);
      else await api.post("/clothing/colors", body);
      toast.success(editing ? "Color updated" : "Color created");
      setModalOpen(false);
      await fetchList();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (c: FashionColor) => {
    if (!window.confirm(`Delete color "${c.name}"?`)) return;
    try {
      await api.delete(`/clothing/colors/${c.id}`);
      toast.success("Deleted");
      await fetchList();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Delete failed");
    }
  };

  const seedPresets = async () => {
    setSeeding(true);
    try {
      await api.post("/clothing/colors/seed-presets");
      toast.success("Preset colors seeded");
      await fetchList();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Seed failed");
    } finally {
      setSeeding(false);
    }
  };

  const columns = useMemo<ColumnDef<FashionColor>[]>(
    () => [
      {
        id: "name",
        accessorFn: (c) => `${c.name} ${c.code ?? ""}`.trim(),
        header: ({ column }) => <DataTableColumnHeader column={column} title="Color" />,
        cell: ({ row }) => {
          const c = row.original;
          return (
            <div className="flex items-center gap-2.5">
              <span
                className="h-7 w-7 rounded-md border shrink-0 shadow-sm"
                style={{ backgroundColor: c.hex || "#e5e7eb" }}
                title={c.hex}
              />
              <div>
                <p className="text-sm font-medium">{c.name}</p>
                {c.code ? <p className="text-[10px] font-mono text-muted-foreground">{c.code}</p> : null}
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: "hex",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Hex" />,
        cell: ({ row }) => (
          <span className="text-xs font-mono tabular-nums">{row.original.hex}</span>
        ),
      },
      {
        accessorKey: "isActive",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => (
          <TableStatusBadge status={row.original.isActive ? "ACTIVE" : "INACTIVE"} />
        ),
      },
      {
        id: "actions",
        cell: ({ row }) => (
          <TableActionsRow
            editAction={{ action: () => openEdit(row.original) }}
            deleteAction={{ action: () => void remove(row.original) }}
          />
        ),
      },
    ],
    [],
  );

  const activeCount = rows.filter((r) => r.isActive).length;
  const kpis = [
    pageKpi("Colors", rows.length, Palette, "slate"),
    pageKpi("Active", activeCount, Palette, "emerald"),
    pageKpi("Inactive", rows.length - activeCount, Palette, "amber"),
  ];

  return (
    <ModuleGate module="colorMaster">
      <div className="page-shell space-y-4">
        <PageHeader
          title="Fashion Colors"
          description="Master color swatches for apparel variants"
          onRefresh={() => void fetchList()}
          refreshing={loading}
          actions={
            <div className="flex items-center gap-2">
              <Button variant="outline" className="gap-1.5" onClick={() => void seedPresets()} disabled={seeding}>
                {seeding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Seed presets
              </Button>
              <Button className="gap-1.5" onClick={openCreate}>
                <Plus className="h-4 w-4" /> Add color
              </Button>
            </div>
          }
        />

        <PageKpiGrid items={kpis} loading={loading} />

        <ClientSideTable
          data={rows}
          columns={columns}
          searchableColumns={[{ id: "name", title: "Color / code" }]}
          filterableColumns={[
            {
              id: "isActive",
              title: "Status",
              options: [
                { label: "Active", value: "true" },
                { label: "Inactive", value: "false" },
              ],
            },
          ]}
        />

        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editing ? "Edit color" : "New color"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Code</Label>
                <Input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} className="font-mono" placeholder="e.g. NVY" />
              </div>
              <div className="space-y-1.5">
                <Label>Hex</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.hex}
                    onChange={(e) => setForm((f) => ({ ...f, hex: e.target.value }))}
                    className="h-9 w-12 rounded border cursor-pointer bg-transparent"
                  />
                  <Input
                    value={form.hex}
                    onChange={(e) => setForm((f) => ({ ...f, hex: e.target.value }))}
                    className="font-mono"
                  />
                  <span className={cn("h-9 w-9 rounded-md border shrink-0")} style={{ backgroundColor: form.hex }} />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Label>Active</Label>
                <Switch checked={form.isActive} onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))} />
              </div>
              <div className={modalInlineFooterClass}>
                <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
                <Button onClick={() => void save()} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </ModuleGate>
  );
}
