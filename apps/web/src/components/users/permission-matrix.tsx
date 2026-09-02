"use client";

import { useMemo, useState } from "react";
import { Search, Check, Minus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  type AppPermission,
  ACTION_LABELS,
  RESOURCE_LABELS,
  formatPermissionLabel,
  groupPermissionsByResource,
  permissionKey,
  sortedResourceKeys,
} from "@/lib/permissions";

interface PermissionMatrixProps {
  permissions: AppPermission[];
  selectedIds: Set<string>;
  onChange?: (next: Set<string>) => void;
  readOnly?: boolean;
  className?: string;
  maxHeightClass?: string;
}

export function PermissionMatrix({
  permissions,
  selectedIds,
  onChange,
  readOnly = false,
  className,
  maxHeightClass = "max-h-[min(420px,55vh)]",
}: PermissionMatrixProps) {
  const [query, setQuery] = useState("");
  const grouped = useMemo(() => groupPermissionsByResource(permissions), [permissions]);
  const resources = useMemo(() => sortedResourceKeys(grouped), [grouped]);

  const filteredResources = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return resources;
    return resources.filter((resource) => {
      const label = RESOURCE_LABELS[resource] ?? resource;
      if (label.toLowerCase().includes(q) || resource.includes(q)) return true;
      return (grouped.get(resource) ?? []).some((p) =>
        formatPermissionLabel(p).toLowerCase().includes(q) ||
        permissionKey(p).includes(q),
      );
    });
  }, [grouped, query, resources]);

  const toggleOne = (id: string) => {
    if (readOnly || !onChange) return;
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };

  const toggleResource = (resource: string, on: boolean) => {
    if (readOnly || !onChange) return;
    const next = new Set(selectedIds);
    for (const p of grouped.get(resource) ?? []) {
      if (on) next.add(p.id);
      else next.delete(p.id);
    }
    onChange(next);
  };

  if (!permissions.length) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        No permissions loaded.
      </p>
    );
  }

  return (
    <div className={cn("rounded-xl border bg-muted/20 flex flex-col min-h-0", className)}>
      <div className="p-3 border-b bg-card/80 shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search permissions…"
            className="pl-9 h-9 text-sm"
          />
        </div>
        {!readOnly && (
          <p className="text-xs text-muted-foreground mt-2">
            {selectedIds.size} of {permissions.length} permissions selected
          </p>
        )}
      </div>

      <div
        className={cn(
          "overflow-y-auto overscroll-contain p-3 space-y-3",
          maxHeightClass,
        )}
      >
          {filteredResources.map((resource) => {
            const items = grouped.get(resource) ?? [];
            const selectedInGroup = items.filter((p) => selectedIds.has(p.id)).length;
            const allSelected = selectedInGroup === items.length && items.length > 0;
            const someSelected = selectedInGroup > 0 && !allSelected;

            return (
              <div key={resource} className="rounded-lg border bg-card overflow-hidden">
                <div className="flex items-center justify-between gap-2 px-3 py-2 bg-muted/30 border-b">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">
                      {RESOURCE_LABELS[resource] ?? resource}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {selectedInGroup}/{items.length} enabled
                    </p>
                  </div>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => toggleResource(resource, !allSelected)}
                      className="text-xs font-semibold text-primary hover:underline shrink-0"
                    >
                      {allSelected ? "Clear all" : "Select all"}
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 p-2">
                  {items.map((p) => {
                    const checked = selectedIds.has(p.id);
                    return (
                      <label
                        key={p.id}
                        className={cn(
                          "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                          readOnly ? "cursor-default" : "cursor-pointer hover:bg-muted/50",
                          checked && "bg-primary/5",
                        )}
                      >
                        {!readOnly ? (
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleOne(p.id)}
                            className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                          />
                        ) : (
                          <span
                            className={cn(
                              "h-4 w-4 rounded border flex items-center justify-center shrink-0",
                              checked
                                ? "bg-primary border-primary text-primary-foreground"
                                : "bg-muted/40 border-border text-transparent",
                            )}
                          >
                            {checked ? <Check className="h-3 w-3" /> : <Minus className="h-3 w-3 opacity-0" />}
                          </span>
                        )}
                        <span className={cn("truncate", !checked && readOnly && "text-muted-foreground")}>
                          {ACTION_LABELS[p.action] ?? p.action}
                        </span>
                      </label>
                    );
                  })}
                </div>
                {!readOnly && someSelected && (
                  <div className="px-3 pb-2">
                    <div className="h-1 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${(selectedInGroup / items.length) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {filteredResources.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">No matching permissions</p>
          )}
      </div>
    </div>
  );
}
