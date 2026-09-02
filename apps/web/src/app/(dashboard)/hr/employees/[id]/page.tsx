"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  UserCog, Phone, Mail, MapPin, Banknote, CalendarDays,
  Loader2, Pencil, Building2, Briefcase, ArrowLeft, Clock, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { AddEmployeeModal, type Employee } from "@/components/hr/add-employee-modal";
import { HrPageHeader, HrPageShell, HR_CARD_CLASS } from "@/components/hr/hr-ui";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

interface EmployeeDetail extends Employee {
  dateOfBirth?: string | null;
  address?: string | null;
  gender?: string | null;
  nicNumber?: string | null;
  bankDetails?: Record<string, string> | null;
  epfNumber?: string | null;
  etfNumber?: string | null;
  employmentType?: string | null;
  attendances?: { id: string; date: string; status: string; checkIn?: string | null; checkOut?: string | null }[];
  payrolls?: { id: string; month: number; year: number; netSalary: number; isPaid: boolean }[];
  leaveRequests?: { id: string; startDate: string; endDate: string; leaveType: string; status: string; reason?: string | null }[];
}

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-LK", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtTime(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-LK", { hour: "2-digit", minute: "2-digit" });
}

function fmtLkr(n?: number | null) {
  return `LKR ${(n ?? 0).toLocaleString()}`;
}

function DetailCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <Card className={HR_CARD_CLASS}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-foreground">{value}</p>
      </div>
    </div>
  );
}

export default function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [emp, setEmp] = useState<EmployeeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [tab, setTab] = useState("overview");

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get<EmployeeDetail>(`/hr/employees/${id}`);
      setEmp(res.data);
    } catch {
      toast.error("Employee not found");
      router.push("/hr");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (id) load(); }, [id]);

  if (loading) {
    return (
      <div className="page-shell flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!emp) return null;

  const initials = `${emp.firstName?.[0] ?? ""}${emp.lastName?.[0] ?? ""}`.toUpperCase();
  const bank = (emp.bankDetails ?? {}) as Record<string, string>;

  return (
    <HrPageShell>
      <button
        type="button"
        onClick={() => router.push("/hr")}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground font-medium -mt-1"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Employees
      </button>

      <HrPageHeader
        title={`${emp.firstName} ${emp.lastName}`}
        description={`${emp.code ?? "—"} · ${emp.designation ?? "No designation"} · ${emp.department ?? "No department"}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="gap-1.5" asChild>
              <Link href="/hr/attendance"><Clock className="h-[18px] w-[18px]" /> Attendance</Link>
            </Button>
            <Button variant="outline" className="gap-1.5" asChild>
              <Link href="/hr/leaves"><CalendarDays className="h-[18px] w-[18px]" /> Leaves</Link>
            </Button>
            <Button variant="outline" className="gap-1.5" asChild>
              <Link href="/hr/payroll"><Banknote className="h-[18px] w-[18px]" /> Payroll</Link>
            </Button>
            <Button className="gap-1.5" onClick={() => setEditOpen(true)}>
              <Pencil className="h-[18px] w-[18px]" /> Edit Profile
            </Button>
          </div>
        }
      />

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={emp.isActive ? "softSuccess" : "secondary"} className="rounded-full px-2.5 text-[10px] font-bold uppercase">
            {emp.isActive ? "Active" : "Inactive"}
          </Badge>
          {emp.designation ? <Badge variant="outline">{emp.designation}</Badge> : null}
          {emp.department ? <Badge variant="outline">{emp.department}</Badge> : null}
          {emp.employmentType ? <Badge variant="secondary" className="text-[10px]">{emp.employmentType.replace("_", " ")}</Badge> : null}
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="attendance">Attendance ({emp.attendances?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="payroll">Payroll ({emp.payrolls?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="leaves">Leaves</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <DetailCard title="Basic Information" description="Contact and personal details">
                <div className="space-y-4">
                  <div className="flex items-center gap-3 pb-4 border-b">
                    <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center text-lg font-bold text-primary">
                      {initials}
                    </div>
                    <div>
                      <p className="font-semibold">{emp.firstName} {emp.lastName}</p>
                      <p className="text-xs text-muted-foreground font-mono">{emp.code}</p>
                    </div>
                  </div>
                  <InfoRow icon={Phone} label="Phone" value={emp.phone} />
                  {emp.email ? <InfoRow icon={Mail} label="Email" value={emp.email} /> : null}
                  {emp.gender ? <InfoRow icon={UserCog} label="Gender" value={emp.gender} /> : null}
                  <InfoRow icon={CalendarDays} label="Joined" value={fmtDate(emp.joiningDate)} />
                  {emp.dateOfBirth ? <InfoRow icon={CalendarDays} label="Date of Birth" value={fmtDate(emp.dateOfBirth)} /> : null}
                  {emp.address ? <InfoRow icon={MapPin} label="Address" value={emp.address} /> : null}
                </div>
              </DetailCard>

              <DetailCard title="Work Details" description="Role, branch and compensation">
                <div className="space-y-4">
                  <InfoRow icon={Building2} label="Department" value={emp.department ?? "—"} />
                  <InfoRow icon={Briefcase} label="Designation" value={emp.designation ?? "—"} />
                  <InfoRow icon={Banknote} label="Basic Salary" value={`${fmtLkr(emp.basicSalary)}/month`} />
                  {emp.branch?.name ? <InfoRow icon={Building2} label="Branch" value={emp.branch.name} /> : null}
                  {emp.nicNumber ? <InfoRow icon={FileText} label="NIC" value={emp.nicNumber} /> : null}
                  {emp.epfNumber ? <InfoRow icon={FileText} label="EPF Number" value={emp.epfNumber} /> : null}
                  {emp.etfNumber ? <InfoRow icon={FileText} label="ETF Number" value={emp.etfNumber} /> : null}
                </div>
              </DetailCard>

              <DetailCard title="Bank Information" description="Payment account details">
                {bank.bankName || bank.accountNumber ? (
                  <div className="space-y-4">
                    {bank.bankName ? <InfoRow icon={Banknote} label="Bank" value={bank.bankName} /> : null}
                    {bank.accountNumber ? <InfoRow icon={Banknote} label="Account" value={<span className="font-mono">{bank.accountNumber}</span>} /> : null}
                    {bank.branch ? <InfoRow icon={Building2} label="Branch" value={bank.branch} /> : null}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-4">No bank details on file</p>
                )}
              </DetailCard>
            </div>
          </TabsContent>

          <TabsContent value="attendance" className="mt-4">
            <DetailCard title="Attendance History" description="Recent daily records">
              <div className="space-y-2">
                {(emp.attendances ?? []).map((a) => (
                  <div key={a.id} className="flex items-center justify-between text-sm border-b last:border-0 pb-2 gap-4">
                    <span className="text-muted-foreground shrink-0">{fmtDate(a.date)}</span>
                    <span className="text-xs text-muted-foreground font-mono">{fmtTime(a.checkIn)} – {fmtTime(a.checkOut)}</span>
                    <Badge variant="outline" className="text-[10px] ml-auto">{a.status}</Badge>
                  </div>
                ))}
                {!(emp.attendances?.length) ? <p className="text-sm text-muted-foreground py-4">No attendance records</p> : null}
              </div>
            </DetailCard>
          </TabsContent>

          <TabsContent value="payroll" className="mt-4">
            <DetailCard title="Payroll History" description="Salary records">
              <div className="space-y-2">
                {(emp.payrolls ?? []).map((p) => (
                  <div key={p.id} className="flex items-center justify-between text-sm border-b last:border-0 pb-2">
                    <span className="text-muted-foreground">{p.month}/{p.year}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold tabular-nums">{fmtLkr(p.netSalary)}</span>
                      <Badge variant={p.isPaid ? "softSuccess" : "softWarning"} className="text-[10px]">{p.isPaid ? "Paid" : "Pending"}</Badge>
                    </div>
                  </div>
                ))}
                {!(emp.payrolls?.length) ? <p className="text-sm text-muted-foreground py-4">No payroll records</p> : null}
              </div>
            </DetailCard>
          </TabsContent>

          <TabsContent value="leaves" className="mt-4">
            <DetailCard title="Leave Requests" description="All leave applications">
              <div className="space-y-2">
                {(emp.leaveRequests ?? []).map((l) => (
                  <div key={l.id} className="flex items-center justify-between text-sm border-b last:border-0 pb-2 gap-3">
                    <div>
                      <p className="font-medium">{l.leaveType}</p>
                      <p className="text-xs text-muted-foreground">{fmtDate(l.startDate)} – {fmtDate(l.endDate)}</p>
                    </div>
                    <Badge variant={l.status === "APPROVED" ? "softSuccess" : l.status === "REJECTED" ? "danger" : "softWarning"} className="text-[10px]">
                      {l.status}
                    </Badge>
                  </div>
                ))}
                {!(emp.leaveRequests?.length) ? (
                  <p className="text-sm text-muted-foreground py-4">No leave requests — <Link href="/hr/leaves" className="text-primary hover:underline">create one</Link></p>
                ) : null}
              </div>
            </DetailCard>
          </TabsContent>
        </Tabs>

      <AddEmployeeModal open={editOpen} onClose={() => setEditOpen(false)} onSaved={() => { setEditOpen(false); load(); }} editEmployee={emp} />
    </HrPageShell>
  );
}
