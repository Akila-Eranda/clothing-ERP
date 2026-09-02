"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  LifeBuoy,
  Search,
  Copy,
  LogIn,
  ShieldOff,
  StickyNote,
  Trash2,
  Plus,
  KeyRound,
  Users,
  Package,
  ShoppingCart,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader, PageKpiGrid, pageKpi } from "@/components/ui/page-kpi";
import { AdminStatusBadge } from "@/components/admin/admin-badges";
import {
  ADMIN_CARD,
  ADMIN_INPUT,
  ADMIN_MODAL_PANEL,
  ADMIN_SELECT,
} from "@/lib/admin-ui";
import {
  fetchTenants,
  fetchTenantDebug,
  impersonateTenant,
  fetchSupportNotes,
  createSupportNote,
  deleteSupportNote,
  revokeTenantSessions,
  resetUserPassword,
  fetchTenantUsers,
  type TenantRow,
  type TenantDebugInfo,
  type SupportNote,
  type UserRow,
} from "@/lib/admin-api";
import { parseApiList } from "@/lib/parse-api-list";
import { LoadingCenter } from "@/components/ui/loading";

function fmtDate(s?: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleString("en-LK", {
    day: "numeric",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SupportPage() {
  return (
    <Suspense fallback={<LoadingCenter className="h-64 py-0" size={88} />}>
      <SupportPageInner />
    </Suspense>
  );
}

function SupportPageInner() {
  const searchParams = useSearchParams();
  const preselect = searchParams.get("tenant") || "";

  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [tenantQuery, setTenantQuery] = useState("");
  const [selectedId, setSelectedId] = useState(preselect);
  const [loadingTenants, setLoadingTenants] = useState(true);
  const [debug, setDebug] = useState<TenantDebugInfo | null>(null);
  const [notes, setNotes] = useState<SupportNote[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [noteModal, setNoteModal] = useState(false);
  const [noteForm, setNoteForm] = useState({ title: "", body: "" });
  const [savingNote, setSavingNote] = useState(false);

  const loadTenants = useCallback(async () => {
    setLoadingTenants(true);
    try {
      const res = await fetchTenants({ limit: "500" });
      setTenants(parseApiList<TenantRow>(res.data));
    } catch (e) {
      setTenants([]);
      toast.error(e instanceof Error ? e.message : "Failed to load tenants");
    } finally {
      setLoadingTenants(false);
    }
  }, []);

  useEffect(() => {
    void loadTenants();
  }, [loadTenants]);

  useEffect(() => {
    if (preselect) setSelectedId(preselect);
  }, [preselect]);

  const loadTenantDetail = useCallback(async (tenantId: string) => {
    if (!tenantId) {
      setDebug(null);
      setNotes([]);
      setUsers([]);
      return;
    }
    setDetailLoading(true);
    try {
      const [dbg, noteList, userRes] = await Promise.all([
        fetchTenantDebug(tenantId),
        fetchSupportNotes(tenantId),
        fetchTenantUsers(tenantId, { limit: 50 }).catch(() => ({ data: [] as UserRow[] })),
      ]);
      setDebug(dbg);
      setNotes(parseApiList<SupportNote>(noteList));
      setUsers(parseApiList<UserRow>(userRes.data));
    } catch (e) {
      setDebug(null);
      setNotes([]);
      setUsers([]);
      toast.error(e instanceof Error ? e.message : "Failed to load tenant support data");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTenantDetail(selectedId);
  }, [selectedId, loadTenantDetail]);

  const filteredTenants = useMemo(() => {
    const q = tenantQuery.trim().toLowerCase();
    if (!q) return tenants.slice(0, 40);
    return tenants
      .filter((t) =>
        `${t.name} ${t.subdomain} ${t.email} ${t.id}`.toLowerCase().includes(q),
      )
      .slice(0, 40);
  }, [tenants, tenantQuery]);

  const selected = useMemo(
    () => tenants.find((t) => t.id === selectedId) || debug?.tenant || null,
    [tenants, selectedId, debug],
  );

  const debugKpis = useMemo(() => {
    const c = debug?.counts;
    return [
      pageKpi("Products", c?.products ?? "—", Package, "primary"),
      pageKpi("Customers", c?.customers ?? "—", UserRound, "info"),
      pageKpi("Sales", c?.sales ?? "—", ShoppingCart, "success"),
      pageKpi("Users", c?.users ?? "—", Users, "neutral"),
    ];
  }, [debug]);

  async function handleImpersonate() {
    if (!selectedId) return;
    setBusy("impersonate");
    try {
      const res = await impersonateTenant(selectedId);
      if (res.loginUrl) {
        await navigator.clipboard.writeText(res.loginUrl);
        toast.success("Impersonation login URL copied");
      } else {
        toast.error("No login URL returned");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Impersonation failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleRevokeSessions() {
    if (!selectedId) return;
    if (!window.confirm("Revoke all active sessions for this tenant?")) return;
    setBusy("revoke");
    try {
      const res = await revokeTenantSessions(selectedId);
      const count =
        typeof (res as { revoked?: number }).revoked === "number"
          ? (res as { revoked: number }).revoked
          : (res as { revokedSessions?: number }).revokedSessions;
      toast.success(
        typeof count === "number" ? `Revoked ${count} session(s)` : "Tenant sessions revoked",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Revoke failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleCreateNote() {
    if (!noteForm.title.trim() || !noteForm.body.trim()) {
      toast.error("Title and body are required");
      return;
    }
    setSavingNote(true);
    try {
      await createSupportNote({
        tenantId: selectedId || undefined,
        title: noteForm.title.trim(),
        body: noteForm.body.trim(),
      });
      toast.success("Support note added");
      setNoteModal(false);
      setNoteForm({ title: "", body: "" });
      if (selectedId) await loadTenantDetail(selectedId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create note");
    } finally {
      setSavingNote(false);
    }
  }

  async function handleDeleteNote(note: SupportNote) {
    if (!window.confirm(`Delete note “${note.title}”?`)) return;
    setBusy(`note-${note.id}`);
    try {
      await deleteSupportNote(note.id);
      toast.success("Note deleted");
      if (selectedId) await loadTenantDetail(selectedId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleResetPassword(user: UserRow) {
    if (!window.confirm(`Send password reset for ${user.email}?`)) return;
    setBusy(`pwd-${user.id}`);
    try {
      await resetUserPassword(user.id);
      toast.success("Password reset sent");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reset failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Support tools"
        description="Impersonate tenants, inspect data, and manage support notes"
        onRefresh={() => {
          void loadTenants();
          if (selectedId) void loadTenantDetail(selectedId);
        }}
        refreshing={loadingTenants || detailLoading}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className={`${ADMIN_CARD} p-4 lg:col-span-1 space-y-3`}>
          <div className="flex items-center gap-2">
            <LifeBuoy size={14} className="text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Select tenant</h2>
          </div>
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              className={`${ADMIN_INPUT} pl-8`}
              placeholder="Search name, subdomain, email…"
              value={tenantQuery}
              onChange={(e) => setTenantQuery(e.target.value)}
            />
          </div>
          <select
            className={`${ADMIN_SELECT} w-full`}
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            <option value="">Choose a tenant…</option>
            {filteredTenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.subdomain})
              </option>
            ))}
          </select>
          <div className="max-h-64 overflow-y-auto space-y-1">
            {filteredTenants.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedId(t.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                  selectedId === t.id
                    ? "bg-primary/10 text-foreground"
                    : "hover:bg-muted text-muted-foreground"
                }`}
              >
                <p className="font-semibold text-foreground truncate">{t.name}</p>
                <p className="font-mono text-[10px]">{t.subdomain}</p>
              </button>
            ))}
            {!loadingTenants && filteredTenants.length === 0 && (
              <p className="text-xs text-muted-foreground px-1">No tenants match.</p>
            )}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          {!selectedId ? (
            <div className={`${ADMIN_CARD} p-8 text-center`}>
              <p className="text-sm text-muted-foreground">
                Select a tenant to view debug counts, impersonate, and manage notes.
              </p>
            </div>
          ) : (
            <>
              <div className={`${ADMIN_CARD} p-4`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-bold text-foreground">
                      {selected?.name ?? "Tenant"}
                    </h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      <span className="font-mono">{selected?.subdomain}</span>
                      {selected?.email ? ` · ${selected.email}` : ""}
                    </p>
                    {selected?.status ? (
                      <div className="mt-2">
                        <AdminStatusBadge status={selected.status} />
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      disabled={busy === "impersonate"}
                      onClick={() => void handleImpersonate()}
                    >
                      <LogIn size={13} />
                      Impersonate
                      <Copy size={12} className="opacity-60" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-amber-700 dark:text-amber-400"
                      disabled={busy === "revoke"}
                      onClick={() => void handleRevokeSessions()}
                    >
                      <ShieldOff size={13} />
                      Revoke sessions
                    </Button>
                  </div>
                </div>
              </div>

              <PageKpiGrid items={debugKpis} cols={4} loading={detailLoading} />

              <div className={`${ADMIN_CARD} p-4 space-y-3`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <StickyNote size={14} className="text-muted-foreground" />
                    <h3 className="text-sm font-semibold text-foreground">Support notes</h3>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => {
                      setNoteForm({ title: "", body: "" });
                      setNoteModal(true);
                    }}
                  >
                    <Plus className="h-4 w-4" />
                    Add note
                  </Button>
                </div>
                {notes.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No notes for this tenant.</p>
                ) : (
                  <ul className="space-y-2">
                    {notes.map((n) => (
                      <li
                        key={n.id}
                        className="rounded-lg border border-border px-3 py-2 flex items-start gap-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-foreground">{n.title}</p>
                          <p className="text-[11px] text-muted-foreground whitespace-pre-wrap mt-0.5">
                            {n.body}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-1">
                            {fmtDate(n.createdAt)}
                            {n.createdBy ? ` · ${n.createdBy}` : ""}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="text-red-500"
                          disabled={busy === `note-${n.id}`}
                          onClick={() => void handleDeleteNote(n)}
                        >
                          <Trash2 size={13} />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className={`${ADMIN_CARD} p-4 space-y-3`}>
                <div className="flex items-center gap-2">
                  <Users size={14} className="text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-foreground">Tenant users</h3>
                </div>
                {users.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No users loaded.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border">
                          <th className="py-2 pr-3 font-semibold">User</th>
                          <th className="py-2 pr-3 font-semibold">Status</th>
                          <th className="py-2 font-semibold text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {users.map((u) => (
                          <tr key={u.id}>
                            <td className="py-2 pr-3">
                              <p className="font-semibold text-foreground">
                                {[u.firstName, u.lastName].filter(Boolean).join(" ") || "—"}
                              </p>
                              <p className="text-muted-foreground">{u.email}</p>
                            </td>
                            <td className="py-2 pr-3">
                              <AdminStatusBadge status={u.status} />
                            </td>
                            <td className="py-2 text-right">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 gap-1"
                                disabled={busy === `pwd-${u.id}`}
                                onClick={() => void handleResetPassword(u)}
                              >
                                <KeyRound size={12} />
                                Reset password
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {noteModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className={`${ADMIN_MODAL_PANEL} max-w-md`}>
            <h3 className="text-sm font-bold text-foreground mb-4">Add support note</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Title</label>
                <input
                  className={ADMIN_INPUT}
                  value={noteForm.title}
                  onChange={(e) => setNoteForm((f) => ({ ...f, title: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Body</label>
                <textarea
                  className={`${ADMIN_INPUT} min-h-[100px] resize-y`}
                  value={noteForm.body}
                  onChange={(e) => setNoteForm((f) => ({ ...f, body: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <Button type="button" variant="outline" onClick={() => setNoteModal(false)}>
                Cancel
              </Button>
              <Button type="button" disabled={savingNote} onClick={() => void handleCreateNote()}>
                {savingNote ? "Saving…" : "Save note"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
