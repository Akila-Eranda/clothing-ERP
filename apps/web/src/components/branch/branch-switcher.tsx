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
import { cn } from "@/lib/utils";

export function BranchSwitcher({ className }: { className?: string }) {
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
        className={cn(
          "hex-header-branch flex h-10 items-center gap-2 rounded-[0.625rem] border px-3.5 text-sm shrink-0 max-w-[180px] sm:max-w-[240px]",
          className,
        )}
        title={label}
      >
        <Building2 className="h-4 w-4 shrink-0 opacity-70" />
        <span className="truncate font-semibold">{label}</span>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "hex-header-branch h-10 gap-2 rounded-[0.625rem] text-sm shrink-0 max-w-[150px] sm:max-w-[240px] px-3.5 font-semibold",
            className,
          )}
          title={label}
        >
          <Building2 className="h-4 w-4 shrink-0" />
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
