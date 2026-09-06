"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus, RefreshCw, MapPin, Layers, Trash2, Pencil, Package, Loader2, Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader, PageKpiGrid, pageKpi } from "@/components/ui/page-kpi";
import { ModuleGate } from "@/components/shop/module-gate";
import { useBranchContext } from "@/components/branch/branch-provider";
import { useBranchStore } from "@/stores/branch-store";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { parseApiList } from "@/lib/parse-api-list";
import { cn } from "@/lib/utils";
import { modalInlineFooterClass } from "@/components/ui/modal-footer";

type LocRow = {
  id: string;
  name: string;
  code: string;
  isActive?: boolean;
  sortOrder?: number;
  floorId?: string;
  sectionId?: string;
  rackId?: string;
};

type ShelfOption = LocRow & { path?: string };

type Level = "floors" | "sections" | "racks" | "shelves";

const LEVEL_META: Record<Level, { title: string; parent?: string; endpoint: string; parentKey?: string }> = {
  floors: { title: "Floors", endpoint: "/clothing/floors" },
  sections: { title: "Sections", endpoint: "/clothing/sections", parent: "floor", parentKey: "floorId" },
  racks: { title: "Racks", endpoint: "/clothing/racks", parent: "section", parentKey: "sectionId" },
  shelves: { title: "Shelves", endpoint: "/clothing/shelves", parent: "rack", parentKey: "rackId" },
};

export default function StoreLocationsPage() {
  const { branches } = useBranchContext();
  const activeBranchId = useBranchStore((s) => s.activeBranchId);
  const setBranch = useBranchStore((s) => s.setBranch);
  const branchId = activeBranchId ?? branches[0]?.id ?? "";

  const [tab, setTab] = useState<"tree" | "assign">("tree");
  const [floors, setFloors] = useState<LocRow[]>([]);
  const [sections, setSections] = useState<LocRow[]>([]);
  const [racks, setRacks] = useState<LocRow[]>([]);
  const [shelves, setShelves] = useState<LocRow[]>([]);
  const [floorId, setFloorId] = useState<string>("");
  const [sectionId, setSectionId] = useState<string>("");
  const [rackId, setRackId] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalLevel, setModalLevel] = useState<Level>("floors");
  const [editing, setEditing] = useState<LocRow | null>(null);
  const [formName, setFormName] = useState("");
  const [formCode, setFormCode] = useState("");
  const [saving, setSaving] = useState(false);

  // Assign location
  const [variantQuery, setVariantQuery] = useState("");
  const [variantHits, setVariantHits] = useState<{ id: string; sku: string; label: string }[]>([]);
  const [pickedVariantId, setPickedVariantId] = useState("");
  const [pickedShelfId, setPickedShelfId] = useState("");
  const [assignNotes, setAssignNotes] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [searching, setSearching] = useState(false);
  const [shelfOptions, setShelfOptions] = useState<ShelfOption[]>([]);

  const loadFloors = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    try {
      const res = await api.get<LocRow[]>(`/clothing/floors?branchId=${encodeURIComponent(branchId)}`);
      const list = parseApiList<LocRow>(res.data);
      setFloors(list);
      if (!floorId && list[0]) setFloorId(list[0].id);
      else if (floorId && !list.some((f) => f.id === floorId)) setFloorId(list[0]?.id ?? "");
    } catch {
      toast.error("Failed to load floors");
      setFloors([]);
    } finally {
      setLoading(false);
    }
  }, [branchId, floorId]);

  const loadSections = useCallback(async () => {
    if (!floorId) { setSections([]); return; }
    try {
      const res = await api.get<LocRow[]>(`/clothing/sections?floorId=${encodeURIComponent(floorId)}`);
      const list = parseApiList<LocRow>(res.data);
      setSections(list);
      if (!sectionId && list[0]) setSectionId(list[0].id);
      else if (sectionId && !list.some((s) => s.id === sectionId)) setSectionId(list[0]?.id ?? "");
    } catch {
      setSections([]);
    }
  }, [floorId, sectionId]);

  const loadRacks = useCallback(async () => {
    if (!sectionId) { setRacks([]); return; }
    try {
      const res = await api.get<LocRow[]>(`/clothing/racks?sectionId=${encodeURIComponent(sectionId)}`);
      const list = parseApiList<LocRow>(res.data);
      setRacks(list);
      if (!rackId && list[0]) setRackId(list[0].id);
      else if (rackId && !list.some((r) => r.id === rackId)) setRackId(list[0]?.id ?? "");
    } catch {
      setRacks([]);
    }
  }, [sectionId, rackId]);

  const loadShelves = useCallback(async () => {
    if (!rackId) { setShelves([]); return; }
    try {
      const res = await api.get<LocRow[]>(`/clothing/shelves?rackId=${encodeURIComponent(rackId)}`);
      setShelves(parseApiList<LocRow>(res.data));
    } catch {
      setShelves([]);
    }
  }, [rackId]);

  const loadShelfTree = useCallback(async () => {
    if (!branchId) return;
    try {
      const res = await api.get<{
        floors?: {
          id: string; name: string; code: string;
          sections?: {
            id: string; name: string; code: string;
            racks?: {
              id: string; name: string; code: string;
              shelves?: { id: string; name: string; code: string }[];
            }[];
          }[];
        }[];
      }>(`/clothing/location-tree?branchId=${encodeURIComponent(branchId)}`);
      const tree = res.data?.floors ?? (Array.isArray(res.data) ? (res.data as typeof res.data.floors) : []);
      const opts: ShelfOption[] = [];
      for (const f of tree ?? []) {
        for (const s of f.sections ?? []) {
          for (const r of s.racks ?? []) {
            for (const sh of r.shelves ?? []) {
              opts.push({
                id: sh.id,
                name: sh.name,
                code: sh.code,
                path: `${f.code}/${s.code}/${r.code}/${sh.code}`,
              });
            }
          }
        }
      }
      setShelfOptions(opts);
    } catch {
      setShelfOptions([]);
    }
  }, [branchId]);

  useEffect(() => { void loadFloors(); }, [branchId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void loadSections(); }, [floorId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void loadRacks(); }, [sectionId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void loadShelves(); }, [rackId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab === "assign") void loadShelfTree(); }, [tab, branchId]); // eslint-disable-line react-hooks/exhaustive-deps

  const openCreate = (level: Level) => {
    setModalLevel(level);
    setEditing(null);
    setFormName("");
    setFormCode("");
    setModalOpen(true);
  };

  const openEdit = (level: Level, row: LocRow) => {
    setModalLevel(level);
    setEditing(row);
    setFormName(row.name);
    setFormCode(row.code);
    setModalOpen(true);
  };

  const saveLoc = async () => {
    if (!formName.trim() || !formCode.trim()) {
      toast.error("Name and code required");
      return;
    }
    const meta = LEVEL_META[modalLevel];
    setSaving(true);
    try {
      if (editing) {
        await api.put(`${meta.endpoint}/${editing.id}`, { name: formName.trim(), code: formCode.trim() });
        toast.success("Updated");
      } else {
        const body: Record<string, string> = { name: formName.trim(), code: formCode.trim() };
        if (modalLevel === "floors") {
          if (!branchId) throw new Error("Select a branch");
          body.branchId = branchId;
        } else if (modalLevel === "sections") {
          if (!floorId) throw new Error("Select a floor first");
          body.floorId = floorId;
        } else if (modalLevel === "racks") {
          if (!sectionId) throw new Error("Select a section first");
          body.sectionId = sectionId;
        } else {
          if (!rackId) throw new Error("Select a rack first");
          body.rackId = rackId;
        }
        await api.post(meta.endpoint, body);
        toast.success("Created");
      }
      setModalOpen(false);
      if (modalLevel === "floors") await loadFloors();
      else if (modalLevel === "sections") await loadSections();
      else if (modalLevel === "racks") await loadRacks();
      else await loadShelves();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const deleteLoc = async (level: Level, row: LocRow) => {
    if (!window.confirm(`Delete ${row.name}?`)) return;
    try {
      await api.delete(`${LEVEL_META[level].endpoint}/${row.id}`);
      toast.success("Deleted");
      if (level === "floors") await loadFloors();
      else if (level === "sections") await loadSections();
      else if (level === "racks") await loadRacks();
      else await loadShelves();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Delete failed");
    }
  };

  const searchVariants = async () => {
    if (!variantQuery.trim()) return;
    setSearching(true);
    try {
      const res = await api.get<{ id: string; sku: string; product?: { name: string }; size?: string; color?: string; name?: string }>(
        `/pos/barcode/${encodeURIComponent(variantQuery.trim())}`,
      );
      const v = res.data;
      if (!v?.id) {
        // fallback product search
        const pRes = await api.get<{ data?: { id: string; name: string; variants?: { id: string; sku: string; size?: string; color?: string }[] }[] }>(
          `/products?search=${encodeURIComponent(variantQuery.trim())}&limit=8`,
        );
        const products = parseApiList<{ id: string; name: string; variants?: { id: string; sku: string; size?: string; color?: string }[] }>(pRes.data);
        const hits: { id: string; sku: string; label: string }[] = [];
        for (const p of products) {
          for (const vv of p.variants ?? []) {
            hits.push({
              id: vv.id,
              sku: vv.sku,
              label: `${p.name} · ${[vv.size, vv.color].filter(Boolean).join(" / ") || vv.sku}`,
            });
          }
        }
        setVariantHits(hits.slice(0, 20));
        if (!hits.length) toast.error("No variants found");
      } else {
        const label = `${v.product?.name ?? "Variant"} · ${[v.size, v.color].filter(Boolean).join(" / ") || v.sku}`;
        setVariantHits([{ id: v.id, sku: v.sku, label }]);
        setPickedVariantId(v.id);
      }
    } catch {
      toast.error("Variant search failed");
      setVariantHits([]);
    } finally {
      setSearching(false);
    }
  };

  const assignLocation = async () => {
    if (!branchId || !pickedVariantId || !pickedShelfId) {
      toast.error("Select branch, variant, and shelf");
      return;
    }
    setAssigning(true);
    try {
      await api.put("/clothing/variant-location", {
        branchId,
        variantId: pickedVariantId,
        shelfId: pickedShelfId,
        notes: assignNotes.trim() || undefined,
      });
      toast.success("Location assigned");
      setAssignNotes("");
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Assign failed");
    } finally {
      setAssigning(false);
    }
  };

  const kpis = useMemo(
    () => [
      pageKpi("Floors", floors.length, Layers, "slate"),
      pageKpi("Sections", sections.length, MapPin, "blue"),
      pageKpi("Racks", racks.length, Package, "amber"),
      pageKpi("Shelves", shelves.length, Package, "emerald"),
    ],
    [floors.length, sections.length, racks.length, shelves.length],
  );

  const renderList = (level: Level, rows: LocRow[], selectedId: string, onSelect: (id: string) => void) => (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
        <p className="text-xs font-semibold">{LEVEL_META[level].title}</p>
        <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => openCreate(level)}>
          <Plus className="h-3 w-3" /> Add
        </Button>
      </div>
      <div className="divide-y max-h-72 overflow-y-auto">
        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground p-3">No {LEVEL_META[level].title.toLowerCase()} yet.</p>
        ) : (
          rows.map((row) => (
            <div
              key={row.id}
              className={cn(
                "flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/40",
                selectedId === row.id && "bg-primary/5",
              )}
              onClick={() => onSelect(row.id)}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{row.name}</p>
                <p className="text-[10px] font-mono text-muted-foreground">{row.code}</p>
              </div>
              <button type="button" className="p-1 text-muted-foreground hover:text-foreground" onClick={(e) => { e.stopPropagation(); openEdit(level, row); }}>
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button type="button" className="p-1 text-muted-foreground hover:text-red-500" onClick={(e) => { e.stopPropagation(); void deleteLoc(level, row); }}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <ModuleGate module="storeLocations">
      <div className="page-shell space-y-4">
        <PageHeader
          title="Store Locations"
          description="Floor → Section → Rack → Shelf map for apparel pick / putaway"
          onRefresh={() => void loadFloors()}
          refreshing={loading}
          actions={
            <div className="flex items-center gap-2">
              <Select
                value={branchId || undefined}
                onValueChange={(id) => {
                  const b = branches.find((x) => x.id === id);
                  setBranch(id, b?.name ?? null);
                }}
              >
                <SelectTrigger className="w-[200px] h-9">
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" className="gap-1.5" onClick={() => void loadFloors()}>
                <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> Refresh
              </Button>
            </div>
          }
        />

        {!branchId ? (
          <p className="text-sm text-muted-foreground">Select a branch to manage locations.</p>
        ) : (
          <>
            <PageKpiGrid items={kpis} loading={loading} />

            <Tabs value={tab} onValueChange={(v) => setTab(v as "tree" | "assign")}>
              <TabsList>
                <TabsTrigger value="tree">Location tree</TabsTrigger>
                <TabsTrigger value="assign">Assign variant</TabsTrigger>
              </TabsList>

              <TabsContent value="tree" className="mt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                  {renderList("floors", floors, floorId, setFloorId)}
                  {renderList("sections", sections, sectionId, setSectionId)}
                  {renderList("racks", racks, rackId, setRackId)}
                  {renderList("shelves", shelves, "", () => undefined)}
                </div>
              </TabsContent>

              <TabsContent value="assign" className="mt-4 space-y-4 max-w-xl">
                <div className="rounded-xl border bg-card p-4 space-y-3">
                  <p className="text-sm font-semibold">Assign variant to shelf</p>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Scan barcode / SKU / product…"
                      value={variantQuery}
                      onChange={(e) => setVariantQuery(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") void searchVariants(); }}
                    />
                    <Button variant="outline" onClick={() => void searchVariants()} disabled={searching} className="gap-1.5 shrink-0">
                      {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                      Find
                    </Button>
                  </div>
                  {variantHits.length > 0 && (
                    <div className="rounded-lg border divide-y max-h-40 overflow-y-auto">
                      {variantHits.map((h) => (
                        <button
                          key={h.id}
                          type="button"
                          onClick={() => setPickedVariantId(h.id)}
                          className={cn(
                            "w-full text-left px-3 py-2 text-xs hover:bg-muted/40",
                            pickedVariantId === h.id && "bg-primary/5",
                          )}
                        >
                          <span className="font-medium">{h.label}</span>
                          <span className="block font-mono text-muted-foreground">{h.sku}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label>Shelf</Label>
                    <Select value={pickedShelfId || undefined} onValueChange={setPickedShelfId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select shelf" />
                      </SelectTrigger>
                      <SelectContent>
                        {shelfOptions.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.path ?? `${s.code} · ${s.name}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Notes (optional)</Label>
                    <Input value={assignNotes} onChange={(e) => setAssignNotes(e.target.value)} placeholder="e.g. front face" />
                  </div>
                  <Button onClick={() => void assignLocation()} disabled={assigning} className="gap-1.5">
                    {assigning ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
                    Save location
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </>
        )}

        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editing ? "Edit" : "Add"} {LEVEL_META[modalLevel].title.slice(0, -1)}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={formName} onChange={(e) => setFormName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Code</Label>
                <Input value={formCode} onChange={(e) => setFormCode(e.target.value)} className="font-mono" />
              </div>
              <div className={modalInlineFooterClass}>
                <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
                <Button onClick={() => void saveLoc()} disabled={saving}>
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
