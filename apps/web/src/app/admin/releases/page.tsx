"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import {
  Rocket,
  Plus,
  Pencil,
  Trash2,
  Upload,
  FileText,
  CheckCircle2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { ClientSideTable, DataTableColumnHeader } from "@/components/table";
import { Button } from "@/components/ui/button";
import { PageHeader, PageKpiGrid, pageKpi } from "@/components/ui/page-kpi";
import { AdminStatusBadge } from "@/components/admin/admin-badges";
import {
  ADMIN_CARD,
  ADMIN_INPUT,
  ADMIN_MODAL_PANEL,
} from "@/lib/admin-ui";
import {
  fetchReleases,
  createRelease,
  updateRelease,
  publishRelease,
  deleteRelease,
  type PlatformRelease,
  type PlatformReleaseItem,
} from "@/lib/admin-api";
import { parseApiList } from "@/lib/parse-api-list";

type ReleaseRow = PlatformRelease & {
  releaseDate?: string | null;
};

function fmtDate(s?: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-LK", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  });
}

function publishDate(r: ReleaseRow) {
  return r.publishedAt || r.releaseDate || null;
}

function itemTitles(items?: PlatformReleaseItem[] | Array<Record<string, unknown>>) {
  if (!items?.length) return [] as string[];
  return items.map((item) => {
    const row = item as Record<string, unknown>;
    return String(row.title || row.featureName || "").trim();
  }).filter(Boolean);
}

function toApiItems(lines: string[]): PlatformReleaseItem[] {
  return lines
    .map((t) => t.trim())
    .filter(Boolean)
    .map((title) => ({
      title,
      body: title,
      type: "FEATURE",
      // Backend expects featureName / category / description
      category: "FEATURE",
      featureName: title,
      description: title,
    })) as PlatformReleaseItem[];
}

type FormState = {
  version: string;
  title: string;
  summary: string;
  itemsText: string;
};

const EMPTY_FORM: FormState = {
  version: "",
  title: "",
  summary: "",
  itemsText: "",
};

export default function ReleasesPage() {
  const [rows, setRows] = useState<ReleaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ReleaseRow | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchReleases();
      setRows(parseApiList<ReleaseRow>(data));
    } catch (e) {
      setRows([]);
      toast.error(e instanceof Error ? e.message : "Failed to load releases");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const kpis = useMemo(
    () => [
      pageKpi("Total", rows.length, Rocket, "primary"),
      pageKpi(
        "Draft",
        rows.filter((r) => String(r.status).toUpperCase() === "DRAFT").length,
        FileText,
        "neutral",
      ),
      pageKpi(
        "Published",
        rows.filter((r) => String(r.status).toUpperCase() === "PUBLISHED").length,
        CheckCircle2,
        "success",
      ),
    ],
    [rows],
  );

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEdit(row: ReleaseRow) {
    setEditing(row);
    setForm({
      version: row.version,
      title: row.title,
      summary: row.summary || "",
      itemsText: itemTitles(row.items).join("\n"),
    });
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.version.trim() || !form.title.trim()) {
      toast.error("Version and title are required");
      return;
    }
    const items = toApiItems(form.itemsText.split("\n"));
    setSaving(true);
    try {
      if (editing) {
        await updateRelease(editing.id, {
          version: form.version.trim(),
          title: form.title.trim(),
          summary: form.summary.trim(),
          items,
        });
        toast.success("Release updated");
      } else {
        await createRelease({
          version: form.version.trim(),
          title: form.title.trim(),
          summary: form.summary.trim() || form.title.trim(),
          items,
        });
        toast.success("Release created");
      }
      setModalOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish(row: ReleaseRow) {
    setActionId(row.id);
    try {
      await publishRelease(row.id);
      toast.success("Release published");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Publish failed");
    } finally {
      setActionId(null);
    }
  }

  async function handleDelete(row: ReleaseRow) {
    if (!window.confirm(`Delete release ${row.version}?`)) return;
    setActionId(row.id);
    try {
      await deleteRelease(row.id);
      toast.success("Release deleted");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setActionId(null);
    }
  }

  const columns = useMemo<ColumnDef<ReleaseRow>[]>(
    () => [
      {
        accessorKey: "version",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Version" />,
        cell: ({ row }) => (
          <span className="text-xs font-mono font-semibold text-foreground">
            {row.original.version}
          </span>
        ),
      },
      {
        id: "title",
        accessorFn: (r) => `${r.title} ${r.summary ?? ""}`.trim(),
        header: ({ column }) => <DataTableColumnHeader column={column} title="Release" />,
        cell: ({ row }) => (
          <div className="min-w-0 max-w-sm">
            <p className="text-xs font-semibold text-foreground truncate">{row.original.title}</p>
            {row.original.summary ? (
              <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">
                {row.original.summary}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => <AdminStatusBadge status={row.original.status || "DRAFT"} />,
      },
      {
        id: "publishDate",
        accessorFn: (r) => publishDate(r) || "",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Publish date" />,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {fmtDate(publishDate(row.original))}
          </span>
        ),
      },
      {
        id: "items",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Items" />,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {itemTitles(row.original.items).length}
          </span>
        ),
      },
      {
        id: "actions",
        enableSorting: false,
        cell: ({ row }) => {
          const r = row.original;
          const busy = actionId === r.id;
          const isDraft = String(r.status).toUpperCase() === "DRAFT";
          return (
            <div className={`flex items-center gap-1 ${busy ? "opacity-50" : ""}`}>
              {isDraft && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs gap-1"
                  disabled={busy}
                  onClick={() => void handlePublish(r)}
                >
                  <Upload size={12} />
                  Publish
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={busy}
                title="Edit"
                onClick={() => openEdit(r)}
              >
                <Pencil size={13} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-red-500 hover:text-red-600"
                disabled={busy}
                title="Delete"
                onClick={() => void handleDelete(r)}
              >
                <Trash2 size={13} />
              </Button>
            </div>
          );
        },
      },
    ],
    [actionId],
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Releases"
        description="Versioned release notes for the platform"
        onRefresh={() => void load()}
        refreshing={loading}
        actions={
          <Button type="button" size="sm" className="gap-1.5" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            New release
          </Button>
        }
      />

      <PageKpiGrid items={kpis} cols={3} loading={loading} />

      <div className={ADMIN_CARD + " p-1"}>
        <ClientSideTable
          data={rows}
          columns={columns}
          searchableColumns={[{ id: "title", title: "Title / summary / version" }]}
          filterableColumns={[
            {
              id: "status",
              title: "Status",
              options: [
                { value: "DRAFT", label: "Draft" },
                { value: "PUBLISHED", label: "Published" },
              ],
            },
          ]}
          isShowExportButtons={{ isShow: true, fileName: "releases-export" }}
        />
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className={`${ADMIN_MODAL_PANEL} max-w-lg max-h-[90vh] overflow-y-auto`}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-sm font-bold text-foreground">
                {editing ? "Edit release" : "New release"}
              </h3>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => setModalOpen(false)}>
                <X size={16} />
              </Button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Version</label>
                  <input
                    className={ADMIN_INPUT}
                    value={form.version}
                    onChange={(e) => setForm((f) => ({ ...f, version: e.target.value }))}
                    placeholder="1.4.0"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Title</label>
                  <input
                    className={ADMIN_INPUT}
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="Release title"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Summary</label>
                <textarea
                  className={`${ADMIN_INPUT} min-h-[80px] resize-y`}
                  value={form.summary}
                  onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
                  placeholder="Short overview of this release"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Items (one title per line)
                </label>
                <textarea
                  className={`${ADMIN_INPUT} min-h-[120px] resize-y font-mono text-xs`}
                  value={form.itemsText}
                  onChange={(e) => setForm((f) => ({ ...f, itemsText: e.target.value }))}
                  placeholder={"New inventory filters\nFaster POS checkout\nBug fixes"}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button type="button" disabled={saving} onClick={() => void handleSave()}>
                {saving ? "Saving…" : editing ? "Save changes" : "Create"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
