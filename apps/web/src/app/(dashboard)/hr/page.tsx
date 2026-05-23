"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { UserCog, Search, Plus, Users, Clock, DollarSign, TrendingUp, MoreHorizontal, Mail, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const DUMMY_EMPLOYEES = [
  { id: "EMP001", name: "Arun Kumar", role: "Branch Manager", department: "Management", salary: 65000, status: "active", phone: "+91 98001 11111", email: "arun@store.com", joinDate: "Jan 2022", attendance: 96 },
  { id: "EMP002", name: "Sunita Patel", role: "Senior Cashier", department: "Operations", salary: 28000, status: "active", phone: "+91 98001 22222", email: "sunita@store.com", joinDate: "Mar 2022", attendance: 98 },
  { id: "EMP003", name: "Vikram Singh", role: "Inventory Manager", department: "Warehouse", salary: 35000, status: "active", phone: "+91 98001 33333", email: "vikram@store.com", joinDate: "Jun 2021", attendance: 94 },
  { id: "EMP004", name: "Pooja Reddy", role: "Sales Associate", department: "Sales", salary: 22000, status: "active", phone: "+91 98001 44444", email: "pooja@store.com", joinDate: "Sep 2023", attendance: 91 },
  { id: "EMP005", name: "Kiran Mehta", role: "Accountant", department: "Finance", salary: 42000, status: "on_leave", phone: "+91 98001 55555", email: "kiran@store.com", joinDate: "Feb 2020", attendance: 88 },
  { id: "EMP006", name: "Ravi Sharma", role: "Delivery Executive", department: "Logistics", salary: 18000, status: "active", phone: "+91 98001 66666", email: "ravi@store.com", joinDate: "Nov 2023", attendance: 93 },
];

const DEPT_COLORS: Record<string, string> = {
  Management: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  Operations: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  Warehouse: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  Sales: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  Finance: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
  Logistics: "bg-orange-500/10 text-orange-500 border-orange-500/20",
};

export default function HRPage() {
  const [search, setSearch] = React.useState("");

  const filtered = DUMMY_EMPLOYEES.filter((e) =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    e.role.toLowerCase().includes(search.toLowerCase()) ||
    e.department.toLowerCase().includes(search.toLowerCase())
  );

  const totalPayroll = DUMMY_EMPLOYEES.reduce((s, e) => s + e.salary, 0);
  const activeCount = DUMMY_EMPLOYEES.filter((e) => e.status === "active").length;
  const avgAttendance = Math.round(DUMMY_EMPLOYEES.reduce((s, e) => s + e.attendance, 0) / DUMMY_EMPLOYEES.length);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">HR & Payroll</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage employees, attendance and salary</p>
        </div>
        <Button variant="gradient" className="gap-2">
          <Plus className="h-4 w-4" /> Add Employee
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Employees", value: DUMMY_EMPLOYEES.length, icon: Users, color: "text-blue-500", bg: "bg-blue-500/10" },
          { label: "Active", value: activeCount, icon: UserCog, color: "text-emerald-500", bg: "bg-emerald-500/10" },
          { label: "Avg Attendance", value: `${avgAttendance}%`, icon: Clock, color: "text-amber-500", bg: "bg-amber-500/10" },
          { label: "Monthly Payroll", value: `₹${(totalPayroll / 1000).toFixed(0)}K`, icon: DollarSign, color: "text-purple-500", bg: "bg-purple-500/10" },
        ].map((s) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border bg-card p-4 flex items-center gap-3"
          >
            <div className={`h-10 w-10 rounded-lg ${s.bg} flex items-center justify-center shrink-0`}>
              <s.icon className={`h-5 w-5 ${s.color}`} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          </motion.div>
        ))}
      </div>

      <Tabs defaultValue="employees">
        <TabsList>
          <TabsTrigger value="employees">Employees</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="payroll">Payroll</TabsTrigger>
        </TabsList>

        <TabsContent value="employees" className="mt-4 space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search employees..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((emp, i) => (
              <motion.div
                key={emp.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="rounded-xl border bg-card p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                      {emp.name.split(" ").map((n) => n[0]).join("")}
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{emp.name}</p>
                      <p className="text-xs text-muted-foreground">{emp.id}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${emp.status === "active" ? "bg-emerald-500" : "bg-amber-500"}`} />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm"><MoreHorizontal className="h-3.5 w-3.5" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>View Profile</DropdownMenuItem>
                        <DropdownMenuItem>Edit Details</DropdownMenuItem>
                        <DropdownMenuItem>View Payslips</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive">Deactivate</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                <p className="text-sm font-medium mb-1">{emp.role}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${DEPT_COLORS[emp.department] ?? "bg-muted"}`}>
                  {emp.department}
                </span>

                <div className="mt-3 pt-3 border-t space-y-1.5">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Phone className="h-3 w-3" />{emp.phone}
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />{emp.attendance}% attendance</span>
                    <span className="font-bold text-primary">₹{emp.salary.toLocaleString()}/mo</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="attendance" className="mt-4">
          <div className="rounded-xl border bg-card p-8 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Clock className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p className="font-medium">Attendance tracking coming soon</p>
              <p className="text-sm mt-1">Mark daily attendance and view monthly reports</p>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="payroll" className="mt-4">
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="font-semibold">December 2024 Payroll</h3>
              <Button size="sm" variant="outline" className="gap-1.5">Generate Slips</Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-muted/30">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Employee</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Basic Salary</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Bonus</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Deductions</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Net Pay</th>
                </tr></thead>
                <tbody>
                  {DUMMY_EMPLOYEES.map((e) => (
                    <tr key={e.id} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="px-4 py-3"><p className="font-medium">{e.name}</p><p className="text-xs text-muted-foreground">{e.role}</p></td>
                      <td className="px-4 py-3 text-right">₹{e.salary.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-emerald-500">₹0</td>
                      <td className="px-4 py-3 text-right text-red-500">₹{Math.round(e.salary * 0.12).toLocaleString()}</td>
                      <td className="px-4 py-3 text-right font-bold">₹{Math.round(e.salary * 0.88).toLocaleString()}</td>
                    </tr>
                  ))}
                  <tr className="bg-muted/30 font-bold">
                    <td className="px-4 py-3">Total</td>
                    <td className="px-4 py-3 text-right">₹{totalPayroll.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">₹0</td>
                    <td className="px-4 py-3 text-right text-red-500">₹{Math.round(totalPayroll * 0.12).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-primary">₹{Math.round(totalPayroll * 0.88).toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
