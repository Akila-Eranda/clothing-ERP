"use client";

import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";

export type ProductBranchScope = "ALL" | "SINGLE";

interface BranchOption {
  id: string;
  name: string;
  code?: string;
}

interface Props {
  branchScope: ProductBranchScope;
  branchId: string;
  onScopeChange: (scope: ProductBranchScope) => void;
  onBranchChange: (branchId: string) => void;
  disabled?: boolean;
}

export function ProductBranchScopeSelect({
  branchScope,
  branchId,
  onScopeChange,
  onBranchChange,
  disabled,
}: Props) {
  const [branches, setBranches] = useState<BranchOption[]>([]);

  useEffect(() => {
    api
      .get<{ data: BranchOption[] } | BranchOption[]>("/branches?limit=100")
      .then((r) => {
        const list = Array.isArray(r.data) ? r.data : (r.data?.data ?? []);
        setBranches(list);
      })
      .catch(() => setBranches([]));
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <Label className="text-sm font-medium">Branch Availability</Label>
      </div>
      <p className="text-xs text-muted-foreground">
        Choose whether initial stock records are created for all branches or one branch only.
      </p>
      <Select
        value={branchScope}
        onValueChange={(v) => onScopeChange(v as ProductBranchScope)}
        disabled={disabled}
      >
        <SelectTrigger>
          <SelectValue placeholder="Select availability" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">All Branches</SelectItem>
          <SelectItem value="SINGLE">Single Branch Only</SelectItem>
        </SelectContent>
      </Select>
      {branchScope === "SINGLE" && (
        <Select value={branchId || undefined} onValueChange={onBranchChange} disabled={disabled || !branches.length}>
          <SelectTrigger>
            <SelectValue placeholder={branches.length ? "Select branch" : "Loading branches…"} />
          </SelectTrigger>
          <SelectContent>
            {branches.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}{b.code ? ` (${b.code})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
