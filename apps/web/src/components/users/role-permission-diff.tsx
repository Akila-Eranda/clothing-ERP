"use client";

import { useMemo } from "react";
import { ArrowRight, Plus, Minus, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  diffPermissionKeys,
  keyToLabel,
  rolePermissionKeys,
  type RolePermissionLink,
} from "@/lib/permissions";

interface RoleLike {
  name: string;
  type?: string;
  permissions?: RolePermissionLink[];
}

interface RolePermissionDiffProps {
  currentRole?: RoleLike | null;
  newRole?: RoleLike | null;
  className?: string;
}

export function RolePermissionDiff({ currentRole, newRole, className }: RolePermissionDiffProps) {
  const diff = useMemo(() => {
    const current = rolePermissionKeys(currentRole?.permissions);
    const next = rolePermissionKeys(newRole?.permissions);
    return diffPermissionKeys(current, next);
  }, [currentRole, newRole]);

  const total = diff.added.length + diff.unchanged.length;
  const sameRole = currentRole?.name === newRole?.name;

  if (!newRole) {
    return (
      <div className={className}>
        <p className="text-sm text-muted-foreground">Select a role to preview permissions.</p>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <Shield className="h-4 w-4 text-primary shrink-0" />
        <span className="text-sm font-semibold">{newRole.name}</span>
        <Badge variant="outline" className="text-xs">
          {total} permission{total === 1 ? "" : "s"}
        </Badge>
        {currentRole && !sameRole && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <span className="truncate max-w-[8rem]">{currentRole.name}</span>
            <ArrowRight className="h-3 w-3 shrink-0" />
            <span className="truncate max-w-[8rem] font-medium text-foreground">{newRole.name}</span>
          </span>
        )}
      </div>

      {sameRole ? (
        <p className="text-sm text-muted-foreground mb-2">
          This user already has this role. Permissions below are unchanged.
        </p>
      ) : currentRole ? (
        <div className="flex flex-wrap gap-2 mb-3">
          {diff.added.length > 0 && (
            <Badge variant="softSuccess" className="gap-1">
              <Plus className="h-3 w-3" />
              {diff.added.length} new
            </Badge>
          )}
          {diff.removed.length > 0 && (
            <Badge variant="softDanger" className="gap-1">
              <Minus className="h-3 w-3" />
              {diff.removed.length} removed
            </Badge>
          )}
          {diff.added.length === 0 && diff.removed.length === 0 && (
            <Badge variant="softInfo">Same access level</Badge>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground mb-2">
          Review the access rules below before creating this user.
        </p>
      )}

      <ScrollArea className="max-h-[280px] rounded-lg border bg-card">
        <div className="p-3 space-y-3 text-sm">
          {currentRole && diff.added.length > 0 && (
            <section>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600 mb-1.5">
                Will be granted
              </p>
              <ul className="space-y-1">
                {diff.added.map((key) => (
                  <li key={key} className="flex items-start gap-2 text-emerald-700 dark:text-emerald-400">
                    <Plus className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>{keyToLabel(key)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {currentRole && diff.removed.length > 0 && (
            <section>
              <p className="text-xs font-semibold uppercase tracking-wide text-red-600 mb-1.5">
                Will be removed
              </p>
              <ul className="space-y-1">
                {diff.removed.map((key) => (
                  <li key={key} className="flex items-start gap-2 text-red-600 dark:text-red-400">
                    <Minus className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>{keyToLabel(key)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(diff.added.length > 0 || diff.removed.length > 0) && diff.unchanged.length > 0 && (
            <section>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                Unchanged ({diff.unchanged.length})
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {diff.unchanged.slice(0, 8).map(keyToLabel).join(" · ")}
                {diff.unchanged.length > 8 ? ` · +${diff.unchanged.length - 8} more` : ""}
              </p>
            </section>
          )}

          {!currentRole && (
            <section>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                This user will receive
              </p>
              <ul className="space-y-1">
                {[...diff.added, ...diff.unchanged].map((key) => (
                  <li key={key} className="text-foreground">{keyToLabel(key)}</li>
                ))}
              </ul>
            </section>
          )}

          {sameRole && (
            <ul className="space-y-1">
              {[...diff.unchanged].map((key) => (
                <li key={key} className="text-muted-foreground">{keyToLabel(key)}</li>
              ))}
            </ul>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
