"use client";

import Link from "next/link";
import { Phone, Mail, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { HR_CARD_CLASS } from "@/components/hr/hr-ui";
import type { Employee } from "@/components/hr/add-employee-modal";

function fmtLkr(n: number) {
  return `LKR ${n.toLocaleString()}`;
}

export function EmployeeGridView({
  employees,
  onEdit,
  onDeactivate,
}: {
  employees: Employee[];
  onEdit: (e: Employee) => void;
  onDeactivate: (e: Employee) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
      {employees.map((e) => {
        const initials = `${e.firstName?.[0] ?? ""}${e.lastName?.[0] ?? ""}`.toUpperCase() || "?";
        return (
          <div
            key={e.id}
            className={cn(HR_CARD_CLASS, "overflow-hidden group border")}
          >
            <div className="h-1 bg-gradient-to-r from-primary/80 to-primary/30" />
            <div className="p-4 space-y-3">
              <div className="flex items-start gap-3">
                <Link href={`/hr/employees/${e.id}`} className="shrink-0">
                  <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center text-sm font-bold text-primary group-hover:scale-105 transition-transform">
                    {initials}
                  </div>
                </Link>
                <div className="min-w-0 flex-1">
                  <Link href={`/hr/employees/${e.id}`} className="hover:underline">
                    <p className="font-semibold text-sm truncate">{e.firstName} {e.lastName}</p>
                  </Link>
                  <p className="text-[10px] text-muted-foreground font-mono">{e.code}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <Badge variant={e.isActive ? "softSuccess" : "secondary"} className="text-[9px] h-5 rounded-full px-2">
                      {e.isActive ? "Active" : "Inactive"}
                    </Badge>
                    {e.designation ? (
                      <Badge variant="outline" className="text-[9px] h-5 rounded-full px-2 truncate max-w-[120px]">
                        {e.designation}
                      </Badge>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5"><Phone className="h-3 w-3" /><span className="font-mono">{e.phone}</span></div>
                {e.email ? <div className="flex items-center gap-1.5"><Mail className="h-3 w-3" /><span className="truncate">{e.email}</span></div> : null}
                {e.department ? <p>Dept: <span className="text-foreground font-medium">{e.department}</span></p> : null}
                <p className="font-semibold text-foreground tabular-nums">{fmtLkr(e.basicSalary)}<span className="text-muted-foreground font-normal">/mo</span></p>
              </div>

              <div className="flex items-center gap-2 pt-1 border-t border-border/60">
                <Button type="button" size="sm" variant="outline" className="h-8 flex-1 text-xs gap-1" onClick={() => onEdit(e)}>
                  <Pencil className="h-3 w-3" /> Edit
                </Button>
                {e.isActive ? (
                  <Button type="button" size="sm" variant="ghost" className="h-8 text-xs text-destructive" onClick={() => onDeactivate(e)}>
                    Deactivate
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
