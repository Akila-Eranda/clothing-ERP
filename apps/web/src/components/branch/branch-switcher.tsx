"use client";

import * as React from "react";
import { Building2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useBranchStore } from "@/stores/branch-store";
import { useBranchContext, type BranchOption } from "./branch-provider";

export function BranchSwitcher() {
  const { branches } = useBranchContext();
  const { activeBranchId, activeBranchName, setBranch } = useBranchStore();

  const handleSelect = React.useCallback(
    (branch: BranchOption) => {
      if (branch.id === activeBranchId) return;
      setBranch(branch.id, branch.name);
    },
    [activeBranchId, setBranch],
  );

  if (branches.length === 0) return null;

  const label = activeBranchName ?? branches[0]?.name ?? "Branch";

  if (branches.length === 1) {
    return (
      <div
        className="flex h-8 items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2.5 text-xs shrink-0 max-w-[160px] sm:max-w-[200px]"
        title={label}
      >
        <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate font-medium">{label}</span>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs shrink-0 max-w-[120px] sm:max-w-[200px] px-2"
          title={label}
        >
          <Building2 className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Active Branch</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {branches.map((b) => (
          <DropdownMenuItem
            key={b.id}
            onClick={() => handleSelect(b)}
            className="flex items-center justify-between gap-2"
          >
            <span className="truncate">
              {b.name} <span className="text-muted-foreground">({b.code})</span>
            </span>
            {b.id === activeBranchId && (
              <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
