"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Users, Clock, Banknote, CalendarDays, Building2, Briefcase, Tag,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/hr", label: "Employees", icon: Users, exact: true },
  { href: "/hr/attendance", label: "Attendance", icon: Clock },
  { href: "/hr/leaves", label: "Leaves", icon: CalendarDays },
  { href: "/hr/payroll", label: "Payroll", icon: Banknote },
  { href: "/hr/departments", label: "Departments", icon: Building2 },
  { href: "/hr/designations", label: "Designations", icon: Briefcase },
  { href: "/hr/shifts", label: "Shifts", icon: Clock },
  { href: "/hr/leave-types", label: "Leave Types", icon: Tag },
  { href: "/hr/holidays", label: "Holidays", icon: CalendarDays },
];

export function HrSectionNav() {
  const pathname = usePathname();

  return (
    <div className="border-b border-border/80 bg-muted/20 overflow-x-auto">
      <div className="page-shell py-2.5">
        <nav className="flex items-center gap-1 min-w-max">
          {NAV.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/80",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
