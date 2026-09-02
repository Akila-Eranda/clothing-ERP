"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import {
  Megaphone,
  Plus,
  Send,
  Pencil,
  Trash2,
  FileText,
  CheckCircle2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { ClientSideTable, DataTableColumnHeader } from "@/components/table";
import { Button } from "@/components/ui/button";
import { PageHeader, PageKpiGrid, pageKpi } from "@/components/ui/page-kpi";
import { TableStatusBadge, TableValueBadge } from "@/components/ui/table-status-badge";
import { AdminStatusBadge } from "@/components/admin/admin-badges";
import {
  ADMIN_CARD,
  ADMIN_INPUT,
  ADMIN_MODAL_PANEL,
  ADMIN_SELECT,
} from "@/lib/admin-ui";
import {
  fetchAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  sendAnnouncement,
  deleteAnnouncement,
  type PlatformAnnouncement,
} from "@/lib/admin-api";
import { parseApiList } from "@/lib/parse-api-list";

const ANNOUNCEMENT_TYPES = ["INFO", "WARNING", "CRITICAL", "MAINTENANCE"] as const;

function fmtDate(s?: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-LK", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  });
}

type FormState = {
  title: string;
  body: string;
  type: string;
  sendNow: boolean;
};

const EMPTY_FORM: FormState = {
  title: "",
  body: "",
  type: "INFO",
  sendNow: false,
};

export default function AnnouncementsPage() {
  const [rows, setRows] = useState<PlatformAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PlatformAnnouncement | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAnnouncements();
      setRows(parseApiList<PlatformAnnouncement>(data));
    } catch (e) {
      setRows([]);
      toast.error(e instanceof Error ? e.message : "Failed to load announcements");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const kpis = useMemo(
    () => [
      pageKpi("Total", rows.length, Megaphone, "primary"),
      pageKpi(
        "Draft",
        rows.filter((r) => String(r.status).toUpperCase() === "DRAFT").length,
        FileText,
        "neutral",
      ),
      pageKpi(
        "Sent",
        rows.filter((r) => String(r.status).toUpperCase() === "SENT").length,
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

  function openEdit(row: PlatformAnnouncement) {
    setEditing(row);
    setForm({
      title: row.title,
      body: row.body,
      type: row.type || "INFO",
      sendNow: false,
    });
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.title.trim() || !form.body.trim()) {
      toast.error("Title and body are required");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await updateAnnouncement(editing.id, {
          title: form.title.trim(),
          body: form.body.trim(),
          type: form.type,
        });
        toast.success("Announcement updated");
      } else {
        await createAnnouncement({
          title: form.title.trim(),
          body: form.body.trim(),
          type: form.type,
          sendNow: form.sendNow,
        });
        toast.success(form.sendNow ? "Announcement created and published" : "Announcement created");
      }
      setModalOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish(row: PlatformAnnouncement) {
    setActionId(row.id);
    try {
      await sendAnnouncement(row.id);
      toast.success("Published — now visible to tenants");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Publish failed");
    } finally {
      setActionId(null);
    }
  }

  async function handleDelete(row: PlatformAnnouncement) {
    if (!window.confirm(`Delete announcement “${row.title}”?`)) return;
    setActionId(row.id);
    try {
      await deleteAnnouncement(row.id);
      toast.success("Announcement deleted");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setActionId(null);
    }
  }

  const columns = useMemo<ColumnDef<PlatformAnnouncement>[]>(
    () => [
      {
        id: "title",
        accessorFn: (r) => `${r.title} ${r.body}`.trim(),
        header: ({ column }) => <DataTableColumnHeader column={column} title="Announcement" />,
        cell: ({ row }) => (
          <div className="min-w-0 max-w-md">
            <p className="text-xs font-semibold text-foreground truncate">{row.original.title}</p>
            <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{row.original.body}</p>
          </div>
        ),
      },
      {
        accessorKey: "type",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
        cell: ({ row }) => <TableValueBadge label={row.original.type || "INFO"} />,
      },
      {
        accessorKey: "status",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => {
          const status = String(row.original.status || "DRAFT").toUpperCase();
          if (status === "SENT") {
            return <TableStatusBadge status="SENT" label="Sent" variant="info" />;
          }
          return <AdminStatusBadge status={status} />;
        },
      },
      {
        accessorKey: "sentAt",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Sent" />,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {fmtDate(row.original.sentAt)}
          </span>
        ),
      },
      {
        accessorKey: "createdAt",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Created" />,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {fmtDate(row.original.createdAt)}
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
                  title="Publish to platform feed"
                  onClick={() => void handlePublish(r)}
                >
                  <Send size={12} />
                  Publish to feed
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
        title="Announcements"
        description="Platform-wide notices for tenant feeds"
        onRefresh={() => void load()}
        refreshing={loading}
        actions={
          <Button type="button" size="sm" className="gap-1.5" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            New announcement
          </Button>
        }
      />

      <PageKpiGrid items={kpis} cols={3} loading={loading} />

      <div className={ADMIN_CARD + " p-1"}>
        <ClientSideTable
          data={rows}
          columns={columns}
          searchableColumns={[{ id: "title", title: "Title / body" }]}
          filterableColumns={[
            {
              id: "status",
              title: "Status",
              options: [
                { value: "DRAFT", label: "Draft" },
                { value: "SENT", label: "Sent" },
              ],
            },
            {
              id: "type",
              title: "Type",
              options: ANNOUNCEMENT_TYPES.map((t) => ({ value: t, label: t })),
            },
          ]}
          isShowExportButtons={{ isShow: true, fileName: "announcements-export" }}
        />
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className={`${ADMIN_MODAL_PANEL} max-w-lg max-h-[90vh] overflow-y-auto`}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-sm font-bold text-foreground">
                {editing ? "Edit announcement" : "New announcement"}
              </h3>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => setModalOpen(false)}>
                <X size={16} />
              </Button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Title</label>
                <input
                  className={ADMIN_INPUT}
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Announcement title"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Body</label>
                <textarea
                  className={`${ADMIN_INPUT} min-h-[120px] resize-y`}
                  value={form.body}
                  onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                  placeholder="Message shown in the platform feed"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Type</label>
                <select
                  className={`${ADMIN_SELECT} w-full`}
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                >
                  {ANNOUNCEMENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              {!editing && (
                <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.sendNow}
                    onChange={(e) => setForm((f) => ({ ...f, sendNow: e.target.checked }))}
                    className="rounded border-border"
                  />
                  Send now (publish to platform feed immediately)
                </label>
              )}
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
