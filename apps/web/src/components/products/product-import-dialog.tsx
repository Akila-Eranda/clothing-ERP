"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, Download, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { postFile } from "@/lib/upload";
import { toCsv } from "@/lib/product-csv";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type PreviewRow = {
  line: number;
  status: "OK" | "ERROR" | "DUPLICATE";
  errors: string[];
  warnings: string[];
  name: string;
  sku?: string;
  barcode?: string;
  category?: string;
  brand?: string;
  cells?: Record<string, string>;
};
type Preview = {
  fileName: string;
  totalRows: number;
  valid: number;
  errors: number;
  duplicates: number;
  commitChunkSize: number;
  rows: PreviewRow[];
};
type CommitRow = { line: number; name: string; status: "CREATED" | "SKIPPED" | "ERROR"; message?: string };
type Filter = "ALL" | "ERROR" | "DUPLICATE" | "OK";

const SHOW_MAX = 500;

function saveCsv(fileName: string, rows: string[][]) {
  const blob = new Blob(["﻿" + toCsv(rows)], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Excel / CSV product import: the server validates the whole file first (nothing saved) and the
 * preview shows every row's problems. Valid rows are then imported in small batches; the server
 * validates each batch again and skips anything that already exists.
 */
export function ProductImportDialog({ file, onClose, onImported }: { file: File | null; onClose: () => void; onImported: () => void }) {
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState<Filter>("ALL");
  const [importing, setImporting] = React.useState(false);
  const [progress, setProgress] = React.useState({ done: 0, total: 0 });
  const [results, setResults] = React.useState<CommitRow[] | null>(null);
  const cancelRef = React.useRef(false);

  React.useEffect(() => {
    if (!file) return;
    let alive = true;
    setPreview(null); setResults(null); setLoadError(null); setFilter("ALL"); setProgress({ done: 0, total: 0 });
    setLoading(true);
    postFile<Preview>("/products/import/preview", file)
      .then((p) => { if (alive) setPreview(p); })
      .catch((e: unknown) => { if (alive) setLoadError((e as Error).message || "Could not read the file"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [file]);

  const validRows = React.useMemo(() => (preview?.rows ?? []).filter((r) => r.status === "OK" && r.cells), [preview]);
  const shown = React.useMemo(() => {
    const rows = preview?.rows ?? [];
    return filter === "ALL" ? rows : rows.filter((r) => r.status === filter);
  }, [preview, filter]);

  const runImport = async () => {
    if (!preview || !validRows.length) return;
    if (!window.confirm(`Import ${validRows.length} product${validRows.length === 1 ? "" : "s"}? Rows with errors or duplicates are not imported.`)) return;
    cancelRef.current = false;
    setImporting(true);
    const size = Math.max(1, Math.min(preview.commitChunkSize || 200, 200));
    const all: CommitRow[] = [];
    setProgress({ done: 0, total: validRows.length });
    try {
      for (let i = 0; i < validRows.length; i += size) {
        if (cancelRef.current) break;
        const chunk = validRows.slice(i, i + size).map((r) => ({ line: r.line, cells: r.cells! }));
        const res = await api.post<{ rows: CommitRow[] }>("/products/import/commit", { rows: chunk });
        all.push(...(res.data?.rows ?? []));
        setProgress({ done: Math.min(i + size, validRows.length), total: validRows.length });
      }
    } catch (e: unknown) {
      toast.error(`Import stopped: ${(e as Error).message || "request failed"}. Rows already imported are kept; re-importing the same file skips them.`);
    } finally {
      setImporting(false);
      setResults(all);
      if (all.some((r) => r.status === "CREATED")) onImported();
    }
  };

  const created = results?.filter((r) => r.status === "CREATED").length ?? 0;
  const skipped = results?.filter((r) => r.status === "SKIPPED").length ?? 0;
  const failed = results?.filter((r) => r.status === "ERROR").length ?? 0;

  const statusBadge = (s: PreviewRow["status"]) =>
    s === "OK" ? <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" />Valid</span>
      : s === "DUPLICATE" ? <span className="inline-flex items-center gap-1 text-amber-600"><AlertTriangle className="h-3.5 w-3.5" />Duplicate</span>
        : <span className="inline-flex items-center gap-1 text-rose-600"><XCircle className="h-3.5 w-3.5" />Error</span>;

  return (
    <Dialog open={!!file} onOpenChange={(o) => { if (!o && !importing) onClose(); }}>
      <DialogContent className="max-w-5xl w-[calc(100vw-2rem)] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Import products</DialogTitle>
          <DialogDescription className="truncate">{file?.name}</DialogDescription>
        </DialogHeader>

        {loading && <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Checking every row…</div>}
        {loadError && <p className="py-6 text-sm text-destructive" role="alert">{loadError}</p>}

        {preview && !results && (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter rows">
              {([
                ["ALL", `All ${preview.totalRows}`],
                ["OK", `Valid ${preview.valid}`],
                ["ERROR", `Errors ${preview.errors}`],
                ["DUPLICATE", `Duplicates ${preview.duplicates}`],
              ] as [Filter, string][]).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={filter === k}
                  onClick={() => setFilter(k)}
                  className={`h-8 rounded-full border px-3 text-xs font-semibold ${filter === k ? "bg-primary text-primary-foreground border-primary" : "bg-background"}`}
                >
                  {label}
                </button>
              ))}
              {(preview.errors > 0 || preview.duplicates > 0 || preview.rows.some((r) => r.warnings.length > 0)) && (
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-auto h-8 gap-1.5"
                  // toCsv neutralises formula-like cells (=, +, -, @) so the file is safe to open in Excel.
                  onClick={() => saveCsv("product-import-issues.csv", [
                    ["line", "status", "name", "sku", "barcode", "problem", "warning"],
                    ...preview.rows
                      .filter((r) => r.status !== "OK" || r.warnings.length > 0)
                      .map((r) => [String(r.line), r.status, r.name, r.sku ?? "", r.barcode ?? "", r.errors.join("; "), r.warnings.join("; ")]),
                  ])}
                >
                  <Download className="h-3.5 w-3.5" /> Download issues
                </Button>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/80 backdrop-blur text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-2 py-2 text-left">Line</th>
                    <th className="px-2 py-2 text-left">Status</th>
                    <th className="px-2 py-2 text-left">Name</th>
                    <th className="px-2 py-2 text-left">SKU</th>
                    <th className="px-2 py-2 text-left">Barcode</th>
                    <th className="px-2 py-2 text-left">Category</th>
                    <th className="px-2 py-2 text-left">Problems / notes</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.slice(0, SHOW_MAX).map((r) => (
                    <tr key={r.line} className="border-t align-top">
                      <td className="px-2 py-1.5 tabular-nums text-muted-foreground">{r.line}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{statusBadge(r.status)}</td>
                      <td className="px-2 py-1.5 max-w-[220px] truncate" title={r.name}>{r.name || "—"}</td>
                      <td className="px-2 py-1.5 font-mono">{r.sku ?? "—"}</td>
                      <td className="px-2 py-1.5 font-mono">{r.barcode ?? "—"}</td>
                      <td className="px-2 py-1.5">{r.category ?? "—"}</td>
                      <td className="px-2 py-1.5">
                        {r.errors.map((e) => <div key={e} className={r.status === "DUPLICATE" ? "text-amber-700 dark:text-amber-400" : "text-rose-600"}>{e}</div>)}
                        {r.warnings.map((w) => <div key={w} className="text-muted-foreground">{w}</div>)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {shown.length > SHOW_MAX && (
                <p className="p-2 text-center text-xs text-muted-foreground">Showing the first {SHOW_MAX} of {shown.length} rows. Download issues for the full list.</p>
              )}
            </div>
            {importing && (
              <div className="space-y-1" aria-live="polite">
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-primary transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
                </div>
                <p className="text-xs text-muted-foreground">Imported {progress.done} of {progress.total}…</p>
              </div>
            )}
          </div>
        )}

        {results && (
          <div className="space-y-3 py-2" aria-live="polite">
            <p className="text-sm">
              <b>{created}</b> imported · <b>{skipped}</b> skipped (already exist) · <b>{failed}</b> failed
              {preview && preview.errors + preview.duplicates > 0 ? ` · ${preview.errors + preview.duplicates} not sent (errors / duplicates in the preview)` : ""}
            </p>
            {(skipped > 0 || failed > 0) && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => saveCsv("product-import-result.csv", [["line", "name", "result", "message"], ...results.map((r) => [String(r.line), r.name, r.status, r.message ?? ""])])}
              >
                <Download className="h-3.5 w-3.5" /> Download result
              </Button>
            )}
          </div>
        )}

        <DialogFooter>
          {importing ? (
            <Button variant="outline" onClick={() => { cancelRef.current = true; }}>Stop after this batch</Button>
          ) : results ? (
            <Button onClick={onClose}>Close</Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={() => void runImport()} disabled={!validRows.length || loading} className="gap-1.5">
                Import {validRows.length} valid row{validRows.length === 1 ? "" : "s"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
