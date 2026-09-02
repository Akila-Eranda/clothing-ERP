"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import {
  Lightbulb,
  Inbox,
  Eye,
  CheckCircle2,
  Ban,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { ClientSideTable, DataTableColumnHeader } from "@/components/table";
import { Button } from "@/components/ui/button";
import { PageHeader, PageKpiGrid, pageKpi } from "@/components/ui/page-kpi";
import { AdminStatusBadge } from "@/components/admin/admin-badges";
import { TableValueBadge } from "@/components/ui/table-status-badge";
import {
  ADMIN_CARD,
  ADMIN_INPUT,
  ADMIN_MODAL_PANEL,
  ADMIN_SELECT,
} from "@/lib/admin-ui";
import {
  fetchSuggestionsSummary,
  fetchSuggestions,
  fetchSuggestion,
  updateSuggestion,
  type FeatureSuggestion,
} from "@/lib/admin-api";
import { parseApiList } from "@/lib/parse-api-list";

const STATUSES = ["NEW", "UNDER_REVIEW", "PLANNED", "IN_PROGRESS", "DONE", "DECLINED"] as const;
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

type SuggestionRow = FeatureSuggestion & {
  submittedBy?: FeatureSuggestion["user"];
};

function fmtDate(s?: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-LK", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  });
}

function submitter(s: SuggestionRow) {
  return s.user ?? s.submittedBy ?? null;
}

export default function SuggestionsPage() {
  const [rows, setRows] = useState<SuggestionRow[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SuggestionRow | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [edit, setEdit] = useState({
    status: "NEW",
    priority: "MEDIUM",
    publicResponse: "",
    internalNote: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [listRes, sum] = await Promise.all([
        fetchSuggestions({ page: "1", limit: "200" }),
        fetchSuggestionsSummary().catch(() => ({})),
      ]);
      setRows(parseApiList<SuggestionRow>(listRes?.data ?? listRes));
      setSummary(
        sum && typeof sum === "object" && !Array.isArray(sum)
          ? (sum as Record<string, number>)
          : {},
      );
    } catch (e) {
      setRows([]);
      toast.error(e instanceof Error ? e.message : "Failed to load suggestions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const kpis = useMemo(
    () => [
      pageKpi("Total", summary.total ?? rows.length, Lightbulb, "primary"),
      pageKpi("New", summary.new ?? rows.filter((r) => r.status === "NEW").length, Inbox, "warning"),
      pageKpi(
        "In progress",
        summary.inProgress ?? rows.filter((r) => r.status === "IN_PROGRESS").length,
        Eye,
        "info",
      ),
      pageKpi(
        "Done",
        summary.done ?? rows.filter((r) => r.status === "DONE").length,
        CheckCircle2,
        "success",
      ),
      pageKpi(
        "Declined",
        summary.declined ?? rows.filter((r) => r.status === "DECLINED").length,
        Ban,
        "danger",
      ),
    ],
    [summary, rows],
  );

  async function openDetail(row: SuggestionRow) {
    setSelected(row);
    setEdit({
      status: row.status || "NEW",
      priority: row.priority || "MEDIUM",
      publicResponse: row.publicResponse || "",
      internalNote: row.internalNote || "",
    });
    setDetailLoading(true);
    try {
      const full = await fetchSuggestion(row.id);
      const detail = full as SuggestionRow;
      setSelected(detail);
      setEdit({
        status: detail.status || "NEW",
        priority: detail.priority || "MEDIUM",
        publicResponse: detail.publicResponse || "",
        internalNote: detail.internalNote || "",
      });
    } catch {
      /* keep list row */
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleSave() {
    if (!selected) return;
    setSaving(true);
    try {
      const updated = await updateSuggestion(selected.id, {
        status: edit.status,
        priority: edit.priority,
        publicResponse: edit.publicResponse,
        internalNote: edit.internalNote,
      });
      toast.success("Suggestion updated");
      setSelected(updated as SuggestionRow);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  const columns = useMemo<ColumnDef<SuggestionRow>[]>(
    () => [
      {
        id: "title",
        accessorFn: (s) =>
          `${s.title} ${s.description ?? ""} ${s.tenant?.name ?? ""} ${submitter(s)?.email ?? ""}`.trim(),
        header: ({ column }) => <DataTableColumnHeader column={column} title="Suggestion" />,
        cell: ({ row }) => (
          <button
            type="button"
            className="text-left min-w-0 max-w-md hover:opacity-80"
            onClick={() => void openDetail(row.original)}
          >
            <p className="text-xs font-semibold text-foreground truncate">{row.original.title}</p>
            <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">
              {row.original.description || "—"}
            </p>
          </button>
        ),
      },
      {
        id: "tenant",
        accessorFn: (s) => s.tenant?.name ?? "",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Tenant" />,
        cell: ({ row }) => (
          <div className="text-xs">
            <p className="text-foreground">{row.original.tenant?.name ?? "—"}</p>
            {row.original.tenant?.subdomain ? (
              <p className="text-[10px] font-mono text-muted-foreground">
                {row.original.tenant.subdomain}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => <AdminStatusBadge status={row.original.status} />,
      },
      {
        accessorKey: "priority",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Priority" />,
        cell: ({ row }) => (
          <TableValueBadge label={row.original.priority || "MEDIUM"} />
        ),
      },
      {
        accessorKey: "createdAt",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Submitted" />,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {fmtDate(row.original.createdAt)}
          </span>
        ),
      },
      {
        id: "actions",
        enableSorting: false,
        cell: ({ row }) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => void openDetail(row.original)}
          >
            Review
          </Button>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Feature suggestions"
        description="Inbox of tenant product ideas and feedback"
        onRefresh={() => void load()}
        refreshing={loading}
      />

      <PageKpiGrid items={kpis} cols={5} loading={loading} />

      <div className={ADMIN_CARD + " p-1"}>
        <ClientSideTable
          data={rows}
          columns={columns}
          searchableColumns={[{ id: "title", title: "Title / tenant / email" }]}
          filterableColumns={[
            {
              id: "status",
              title: "Status",
              options: STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, " ") })),
            },
            {
              id: "priority",
              title: "Priority",
              options: PRIORITIES.map((p) => ({ value: p, label: p })),
            },
          ]}
          isShowExportButtons={{ isShow: true, fileName: "suggestions-export" }}
        />
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black/40 flex justify-end z-50">
          <div
            className={`${ADMIN_MODAL_PANEL} max-w-md w-full h-full rounded-none border-y-0 border-r-0 overflow-y-auto`}
          >
            <div className="flex items-start justify-between gap-3 mb-5">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-foreground truncate">{selected.title}</h3>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {selected.tenant?.name ?? "Unknown tenant"}
                  {submitter(selected)?.email ? ` · ${submitter(selected)?.email}` : ""}
                </p>
              </div>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => setSelected(null)}>
                <X size={16} />
              </Button>
            </div>

            {detailLoading ? (
              <p className="text-xs text-muted-foreground">Loading detail…</p>
            ) : (
              <div className="space-y-4">
                <div className={`${ADMIN_CARD} p-3`}>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                    Description
                  </p>
                  <p className="text-xs text-foreground whitespace-pre-wrap">
                    {selected.description || "—"}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1">Status</label>
                    <select
                      className={`${ADMIN_SELECT} w-full`}
                      value={edit.status}
                      onChange={(e) => setEdit((f) => ({ ...f, status: e.target.value }))}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s.replace(/_/g, " ")}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1">Priority</label>
                    <select
                      className={`${ADMIN_SELECT} w-full`}
                      value={edit.priority}
                      onChange={(e) => setEdit((f) => ({ ...f, priority: e.target.value }))}
                    >
                      {PRIORITIES.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    Public response
                  </label>
                  <textarea
                    className={`${ADMIN_INPUT} min-h-[90px] resize-y`}
                    value={edit.publicResponse}
                    onChange={(e) => setEdit((f) => ({ ...f, publicResponse: e.target.value }))}
                    placeholder="Visible to the submitting tenant"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    Internal note
                  </label>
                  <textarea
                    className={`${ADMIN_INPUT} min-h-[90px] resize-y`}
                    value={edit.internalNote}
                    onChange={(e) => setEdit((f) => ({ ...f, internalNote: e.target.value }))}
                    placeholder="Ops-only notes"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setSelected(null)}>
                    Close
                  </Button>
                  <Button type="button" disabled={saving} onClick={() => void handleSave()}>
                    {saving ? "Saving…" : "Save"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
