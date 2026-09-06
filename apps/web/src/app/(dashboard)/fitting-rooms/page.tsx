"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus, DoorOpen, Loader2, Search, X, User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader, PageKpiGrid, pageKpi } from "@/components/ui/page-kpi";
import { ModuleGate } from "@/components/shop/module-gate";
import { useBranchContext } from "@/components/branch/branch-provider";
import { useBranchStore } from "@/stores/branch-store";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { parseApiList } from "@/lib/parse-api-list";
import { cn } from "@/lib/utils";
import { modalInlineFooterClass } from "@/components/ui/modal-footer";

type FittingRoom = {
  id: string;
  name: string;
  code: string;
  isActive?: boolean;
  sessions?: FittingSession[];
};

type FittingSession = {
  id: string;
  roomId: string;
  status: "IN_FITTING" | "RESERVED" | "SOLD" | "RETURNED" | "CANCELLED";
  customerName?: string | null;
  startedAt?: string;
  items?: { variantId: string; quantity: number; variant?: { sku?: string; product?: { name?: string }; size?: string; color?: string } }[];
};

type SessionItemDraft = { variantId: string; quantity: number; label: string };

const STATUS_ACTIONS: { status: FittingSession["status"]; label: string; tone: string }[] = [
  { status: "SOLD", label: "Mark Sold", tone: "bg-emerald-600 hover:bg-emerald-700 text-white" },
  { status: "RESERVED", label: "Reserve", tone: "bg-amber-500 hover:bg-amber-600 text-white" },
  { status: "RETURNED", label: "Return", tone: "bg-slate-600 hover:bg-slate-700 text-white" },
  { status: "CANCELLED", label: "Cancel", tone: "bg-red-600 hover:bg-red-700 text-white" },
];

export default function FittingRoomsPage() {
  const { branches } = useBranchContext();
  const activeBranchId = useBranchStore((s) => s.activeBranchId);
  const setBranch = useBranchStore((s) => s.setBranch);
  const branchId = activeBranchId ?? branches[0]?.id ?? "";

  const [rooms, setRooms] = useState<FittingRoom[]>([]);
  const [sessions, setSessions] = useState<FittingSession[]>([]);
  const [loading, setLoading] = useState(true);

  const [roomModal, setRoomModal] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [savingRoom, setSavingRoom] = useState(false);

  const [sessionModal, setSessionModal] = useState(false);
  const [sessionRoomId, setSessionRoomId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [items, setItems] = useState<SessionItemDraft[]>([]);
  const [searchQ, setSearchQ] = useState("");
  const [hits, setHits] = useState<{ id: string; label: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [savingSession, setSavingSession] = useState(false);
  const [patchingId, setPatchingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!branchId) { setRooms([]); setSessions([]); return; }
    setLoading(true);
    try {
      const [roomsRes, sessRes] = await Promise.all([
        api.get<FittingRoom[]>(`/clothing/fitting-rooms?branchId=${encodeURIComponent(branchId)}`),
        api.get<FittingSession[]>(`/clothing/fitting-sessions?branchId=${encodeURIComponent(branchId)}&status=IN_FITTING,RESERVED`),
      ]);
      setRooms(parseApiList(roomsRes.data));
      setSessions(parseApiList(sessRes.data));
    } catch {
      toast.error("Failed to load fitting rooms");
      setRooms([]);
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => { void load(); }, [load]);

  const activeByRoom = useMemo(() => {
    const map = new Map<string, FittingSession[]>();
    for (const s of sessions) {
      if (s.status !== "IN_FITTING" && s.status !== "RESERVED") continue;
      const list = map.get(s.roomId) ?? [];
      list.push(s);
      map.set(s.roomId, list);
    }
    return map;
  }, [sessions]);

  const createRoom = async () => {
    if (!branchId || !roomName.trim() || !roomCode.trim()) {
      toast.error("Branch, name, and code required");
      return;
    }
    setSavingRoom(true);
    try {
      await api.post("/clothing/fitting-rooms", {
        branchId,
        name: roomName.trim(),
        code: roomCode.trim(),
      });
      toast.success("Room created");
      setRoomModal(false);
      setRoomName("");
      setRoomCode("");
      await load();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Create failed");
    } finally {
      setSavingRoom(false);
    }
  };

  const searchItems = async () => {
    if (!searchQ.trim()) return;
    setSearching(true);
    try {
      const res = await api.get<{ id: string; sku: string; product?: { name: string }; size?: string; color?: string }>(
        `/pos/barcode/${encodeURIComponent(searchQ.trim())}`,
      );
      if (res.data?.id) {
        const v = res.data;
        setHits([{
          id: v.id,
          label: `${v.product?.name ?? "Item"} · ${[v.size, v.color].filter(Boolean).join(" / ") || v.sku}`,
        }]);
      } else {
        toast.error("Not found");
        setHits([]);
      }
    } catch {
      toast.error("Not found");
      setHits([]);
    } finally {
      setSearching(false);
    }
  };

  const startSession = async () => {
    if (!branchId || !sessionRoomId || items.length === 0) {
      toast.error("Pick room and add items");
      return;
    }
    setSavingSession(true);
    try {
      await api.post("/clothing/fitting-sessions", {
        roomId: sessionRoomId,
        branchId,
        customerName: customerName.trim() || undefined,
        items: items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
      });
      toast.success("Session started");
      setSessionModal(false);
      setItems([]);
      setCustomerName("");
      await load();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Start failed");
    } finally {
      setSavingSession(false);
    }
  };

  const patchStatus = async (sessionId: string, status: FittingSession["status"]) => {
    setPatchingId(sessionId);
    try {
      await api.patch(`/clothing/fitting-sessions/${sessionId}/status`, { status });
      toast.success(`Marked ${status.toLowerCase().replace("_", " ")}`);
      await load();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Update failed");
    } finally {
      setPatchingId(null);
    }
  };

  const busyRooms = rooms.filter((r) => (activeByRoom.get(r.id)?.length ?? 0) > 0).length;
  const kpis = [
    pageKpi("Rooms", rooms.length, DoorOpen, "slate"),
    pageKpi("Busy", busyRooms, User, "amber"),
    pageKpi("Active sessions", sessions.filter((s) => s.status === "IN_FITTING" || s.status === "RESERVED").length, DoorOpen, "blue"),
  ];

  return (
    <ModuleGate module="fittingRoom">
      <div className="page-shell space-y-4">
        <PageHeader
          title="Fitting Rooms"
          description="Track try-ons, reserves, and sold-from-fitting"
          onRefresh={() => void load()}
          refreshing={loading}
          actions={
            <div className="flex items-center gap-2 flex-wrap">
              <Select
                value={branchId || undefined}
                onValueChange={(id) => {
                  const b = branches.find((x) => x.id === id);
                  setBranch(id, b?.name ?? null);
                }}
              >
                <SelectTrigger className="w-[180px] h-9">
                  <SelectValue placeholder="Branch" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" className="gap-1.5" onClick={() => setRoomModal(true)}>
                <Plus className="h-4 w-4" /> Room
              </Button>
              <Button
                className="gap-1.5"
                onClick={() => {
                  setSessionRoomId(rooms[0]?.id ?? "");
                  setSessionModal(true);
                }}
                disabled={!rooms.length}
              >
                <Plus className="h-4 w-4" /> Start session
              </Button>
            </div>
          }
        />

        {!branchId ? (
          <p className="text-sm text-muted-foreground">Select a branch to manage fitting rooms.</p>
        ) : (
          <>
            <PageKpiGrid items={kpis} loading={loading} />

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {rooms.map((room) => {
                const active = activeByRoom.get(room.id) ?? [];
                return (
                  <div key={room.id} className="rounded-xl border bg-card p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-sm">{room.name}</p>
                        <p className="text-[10px] font-mono text-muted-foreground">{room.code}</p>
                      </div>
                      <span
                        className={cn(
                          "text-[10px] font-bold uppercase px-2 py-0.5 rounded-full",
                          active.length ? "bg-amber-500/15 text-amber-700" : "bg-emerald-500/15 text-emerald-700",
                        )}
                      >
                        {active.length ? `${active.length} active` : "Free"}
                      </span>
                    </div>

                    {active.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No active session</p>
                    ) : (
                      <div className="space-y-2">
                        {active.map((s) => (
                          <div key={s.id} className="rounded-lg border bg-muted/20 p-2.5 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-medium truncate">
                                {s.customerName || "Guest"} · {s.status.replace("_", " ")}
                              </p>
                              <span className="text-[10px] text-muted-foreground tabular-nums">
                                {(s.items ?? []).reduce((n, i) => n + i.quantity, 0)} pcs
                              </span>
                            </div>
                            {(s.items ?? []).slice(0, 3).map((it, idx) => (
                              <p key={idx} className="text-[10px] text-muted-foreground truncate">
                                {it.variant?.product?.name ?? "Item"}
                                {it.variant?.size || it.variant?.color
                                  ? ` · ${[it.variant.size, it.variant.color].filter(Boolean).join("/")}`
                                  : ""}
                                ×{it.quantity}
                              </p>
                            ))}
                            <div className="flex flex-wrap gap-1 pt-1">
                              {STATUS_ACTIONS.map((a) => (
                                <button
                                  key={a.status}
                                  type="button"
                                  disabled={patchingId === s.id || s.status === a.status}
                                  onClick={() => void patchStatus(s.id, a.status)}
                                  className={cn(
                                    "text-[10px] font-semibold px-2 py-1 rounded-md disabled:opacity-40",
                                    a.tone,
                                  )}
                                >
                                  {patchingId === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : a.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full gap-1.5"
                      onClick={() => {
                        setSessionRoomId(room.id);
                        setSessionModal(true);
                      }}
                    >
                      <Plus className="h-3.5 w-3.5" /> Start session
                    </Button>
                  </div>
                );
              })}
              {rooms.length === 0 && !loading ? (
                <p className="text-sm text-muted-foreground col-span-full">No fitting rooms yet. Add one to get started.</p>
              ) : null}
            </div>
          </>
        )}

        <Dialog open={roomModal} onOpenChange={setRoomModal}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Add fitting room</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={roomName} onChange={(e) => setRoomName(e.target.value)} placeholder="Room A" />
              </div>
              <div className="space-y-1.5">
                <Label>Code</Label>
                <Input value={roomCode} onChange={(e) => setRoomCode(e.target.value)} className="font-mono" placeholder="FR-A" />
              </div>
              <div className={modalInlineFooterClass}>
                <Button variant="outline" onClick={() => setRoomModal(false)}>Cancel</Button>
                <Button onClick={() => void createRoom()} disabled={savingRoom}>
                  {savingRoom ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={sessionModal} onOpenChange={setSessionModal}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader><DialogTitle>Start fitting session</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Room</Label>
                <Select value={sessionRoomId || undefined} onValueChange={setSessionRoomId}>
                  <SelectTrigger><SelectValue placeholder="Select room" /></SelectTrigger>
                  <SelectContent>
                    {rooms.map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Customer name (optional)</Label>
                <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Items</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Scan barcode / SKU…"
                    value={searchQ}
                    onChange={(e) => setSearchQ(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") void searchItems(); }}
                  />
                  <Button variant="outline" onClick={() => void searchItems()} disabled={searching} className="shrink-0">
                    {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                </div>
                {hits.length > 0 && (
                  <div className="rounded-lg border divide-y">
                    {hits.map((h) => (
                      <button
                        key={h.id}
                        type="button"
                        className="w-full text-left px-3 py-2 text-xs hover:bg-muted/40"
                        onClick={() => {
                          setItems((p) => {
                            const ex = p.find((x) => x.variantId === h.id);
                            if (ex) return p.map((x) => x.variantId === h.id ? { ...x, quantity: x.quantity + 1 } : x);
                            return [...p, { variantId: h.id, quantity: 1, label: h.label }];
                          });
                          setHits([]);
                          setSearchQ("");
                        }}
                      >
                        {h.label}
                      </button>
                    ))}
                  </div>
                )}
                {items.length > 0 && (
                  <div className="rounded-lg border divide-y">
                    {items.map((it, idx) => (
                      <div key={it.variantId} className="flex items-center gap-2 px-3 py-2">
                        <p className="flex-1 text-xs truncate">{it.label}</p>
                        <Input
                          type="number"
                          min={1}
                          className="w-14 h-7 text-xs"
                          value={it.quantity}
                          onChange={(e) => setItems((p) => p.map((x, i) => i === idx ? { ...x, quantity: parseInt(e.target.value) || 1 } : x))}
                        />
                        <button type="button" onClick={() => setItems((p) => p.filter((_, i) => i !== idx))} className="p-1 hover:text-red-500">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className={modalInlineFooterClass}>
                <Button variant="outline" onClick={() => setSessionModal(false)}>Cancel</Button>
                <Button onClick={() => void startSession()} disabled={savingSession}>
                  {savingSession ? <Loader2 className="h-4 w-4 animate-spin" /> : "Start"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </ModuleGate>
  );
}
