"use client";

import * as React from "react";
import Link from "next/link";
import { Building2, Check, ChevronDown, Settings2 } from "lucide-react";
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "hex-header-branch group inline-flex h-10 max-w-[150px] items-center gap-2 rounded-[0.625rem] border px-3 text-sm font-semibold shrink-0 sm:max-w-[240px]",
            "outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
            className,
          )}
          title={label}
          aria-label={`Active branch: ${label}`}
        >
          <span className="hex-header-branch__icon flex h-7 w-7 shrink-0 items-center justify-center rounded-md">
            <Building2 className="h-4 w-4" />
          </span>
          <span className="truncate">{label}</span>
          <ChevronDown className="hex-header-branch__chevron h-3.5 w-3.5 shrink-0 opacity-70 transition-transform group-data-[state=open]:rotate-180" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Switch Branch
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {branches.map((b) => (
          <DropdownMenuItem
            key={b.id}
            onClick={() => handleSelect(b)}
            className={cn(
              "flex items-center justify-between gap-2 py-2.5",
              b.id === activeBranchId && "bg-primary/8 text-primary",
            )}
          >
            <span className="min-w-0 truncate">
              <span className="font-medium">{b.name}</span>
              <span className="ml-1 text-xs text-muted-foreground">({b.code})</span>
            </span>
            {b.id === activeBranchId && (
              <Check className="h-4 w-4 shrink-0 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/branches" className="flex items-center gap-2 text-sm">
            <Settings2 className="h-4 w-4 text-muted-foreground" />
            Manage branches
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
