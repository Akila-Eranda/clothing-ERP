"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, Banknote, CalendarDays, CheckSquare, ChevronLeft, ChevronRight,
  FileText, Loader2, Plus, RefreshCw, StickyNote, TrendingUp, Users, Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { cn, formatNumber } from "@/lib/utils";
import { useShopWorkspace } from "@/lib/use-shop-profile";

type DayBadges = {
  sales: number; expenses: number; chequesDue: number; customerDue: number;
  supplierDue: number; notes: number; tasks: number; meetings: number;
};

type MonthOverview = { year: number; month: number; days: { date: string; counts: DayBadges }[] };

type DayDetail = {
  date: string;
  sales: { count: number; gross: number; net: number; returns: number };
  profit: { cogs: number; grossProfit: number; expenses: number; netProfit: number; netMarginPct: number };
  expenses: { total: number; items: { id: string; description: string; amount: number }[] };
  supplierPayments: { id: string; amount: number; supplier: { name: string }; paidAt: string }[];
  supplierDue: { id: string; invoiceNumber: string; due: number; supplier: { name: string } }[];
  chequesDue: { id: string; chequeNumber: string; amount: number; partyName?: string | null; direction: string }[];
  customerDue: { id: string; amount: number; source: string; customer: { firstName: string; lastName?: string | null; phone: string } }[];
  notes: { id: string; title: string; body?: string | null }[];
  tasks: { id: string; title: string; status: string; priority: string }[];
  meetings: { id: string; title: string; startsAt: string; location?: string | null }[];
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function badgeDot(counts?: DayBadges) {
  if (!counts) return null;
  const has =
    counts.sales > 0 || counts.expenses > 0 || counts.chequesDue > 0
    || counts.customerDue > 0 || counts.supplierDue > 0
    || counts.notes > 0 || counts.tasks > 0 || counts.meetings > 0;
  if (!has) return null;
  return (
    <div className="flex gap-0.5 justify-center mt-1 flex-wrap max-w-[48px] mx-auto">
      {counts.sales > 0 && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
      {counts.expenses > 0 && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
      {(counts.chequesDue + counts.customerDue + counts.supplierDue) > 0 && <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />}
      {(counts.notes + counts.tasks + counts.meetings) > 0 && <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />}
    </div>
  );
}

export default function BusinessCalendarPage() {
  const { profile } = useShopWorkspace();
  const today = new Date().toISOString().slice(0, 10);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth() + 1);
  const [selected, setSelected] = useState(today);
  const [overview, setOverview] = useState<MonthOverview | null>(null);
  const [day, setDay] = useState<DayDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [dayLoading, setDayLoading] = useState(false);

  const [noteTitle, setNoteTitle] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [meetingTitle, setMeetingTitle] = useState("");
  const [meetingTime, setMeetingTime] = useState("10:00");
  const [busy, setBusy] = useState(false);

  const badgeMap = useMemo(() => {
    const m: Record<string, DayBadges> = {};
    for (const d of overview?.days ?? []) m[d.date] = d.counts;
    return m;
  }, [overview]);

  const loadMonth = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<MonthOverview>(`/calendar/month?year=${year}&month=${month}`);
      setOverview(r.data ?? null);
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to load calendar");
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  const loadDay = useCallback(async (date: string) => {
    setDayLoading(true);
    try {
      const r = await api.get<DayDetail>(`/calendar/day?date=${date}`);
      setDay(r.data ?? null);
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to load day");
    } finally {
      setDayLoading(false);
    }
  }, []);

  useEffect(() => { loadMonth(); }, [loadMonth]);
  useEffect(() => { loadDay(selected); }, [selected, loadDay]);

  const gridDays = useMemo(() => {
    const first = new Date(Date.UTC(year, month - 1, 1));
    const startPad = first.getUTCDay();
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const cells: ({ key: string; inMonth: boolean; date?: string; dayNum?: number })[] = [];
    for (let i = 0; i < startPad; i++) cells.push({ key: `pad-${i}`, inMonth: false });
    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells.push({ key: date, inMonth: true, date, dayNum: d });
    }
    while (cells.length % 7 !== 0) cells.push({ key: `trail-${cells.length}`, inMonth: false });
    return cells;
  }, [year, month]);

  const shiftMonth = (delta: number) => {
    let m = month + delta;
    let y = year;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    setYear(y);
    setMonth(m);
  };

  const addNote = async () => {
    if (!noteTitle.trim()) return;
    setBusy(true);
    try {
      await api.post("/calendar/notes", { date: selected, title: noteTitle.trim() });
      setNoteTitle("");
      toast.success("Note added");
      loadDay(selected); loadMonth();
    } catch (e: unknown) { toast.error((e as Error).message ?? "Failed"); }
    finally { setBusy(false); }
  };

  const addTask = async () => {
    if (!taskTitle.trim()) return;
    setBusy(true);
    try {
      await api.post("/calendar/tasks", { date: selected, title: taskTitle.trim() });
      setTaskTitle("");
      toast.success("Task added");
      loadDay(selected); loadMonth();
    } catch (e: unknown) { toast.error((e as Error).message ?? "Failed"); }
    finally { setBusy(false); }
  };

  const addMeeting = async () => {
    if (!meetingTitle.trim()) return;
    setBusy(true);
    try {
      await api.post("/calendar/meetings", {
        title: meetingTitle.trim(),
        startsAt: `${selected}T${meetingTime}:00.000Z`,
      });
      setMeetingTitle("");
      toast.success("Meeting added");
      loadDay(selected); loadMonth();
    } catch (e: unknown) { toast.error((e as Error).message ?? "Failed"); }
    finally { setBusy(false); }
  };

  const toggleTask = async (id: string, status: string) => {
    try {
      await api.put(`/calendar/tasks/${id}/status`, { status: status === "DONE" ? "OPEN" : "DONE" });
      loadDay(selected); loadMonth();
    } catch (e: unknown) { toast.error((e as Error).message ?? "Failed"); }
  };

  const monthLabel = new Date(Date.UTC(year, month - 1, 1)).toLocaleString(undefined, {
    month: "long", year: "numeric", timeZone: "UTC",
  });

  const DAY_STATS = day ? [
    {
      label: "Sales",
      value: `LKR ${formatNumber(day.sales.net)}`,
      sub: `${day.sales.count} orders`,
      icon: TrendingUp,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
    },
    {
      label: "Net Profit",
      value: `LKR ${formatNumber(day.profit.netProfit)}`,
      sub: `${day.profit.netMarginPct}% margin`,
      icon: Wallet,
      color: day.profit.netProfit >= 0 ? "text-indigo-500" : "text-rose-500",
      bg: day.profit.netProfit >= 0 ? "bg-indigo-500/10" : "bg-rose-500/10",
    },
    {
      label: "Expenses",
      value: `LKR ${formatNumber(day.expenses.total)}`,
      sub: `${day.expenses.items.length} items`,
      icon: Banknote,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
    },
    {
      label: "Customer Due",
      value: `LKR ${formatNumber(day.customerDue.reduce((s, c) => s + c.amount, 0))}`,
      sub: `${day.customerDue.length} due`,
      icon: AlertTriangle,
      color: "text-rose-500",
      bg: "bg-rose-500/10",
    },
  ] : [];

  return (
    <div className="page-shell">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Business Calendar</h1>
          <p className="text-sm text-muted-foreground">
            {profile.label} · Sales, profit, dues, notes, tasks & meetings
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { loadMonth(); loadDay(selected); }}
            disabled={loading}
            className="gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-12 gap-6">
        <Card className="lg:col-span-5">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => shiftMonth(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <p className="font-semibold text-sm">{monthLabel}</p>
              <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => shiftMonth(1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground uppercase font-semibold">
                  {WEEKDAYS.map((w) => <div key={w} className="py-1">{w}</div>)}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {gridDays.map((cell) => {
                    if (!cell.inMonth || !cell.date) {
                      return <div key={cell.key} className="h-12 rounded-xl bg-muted/20" />;
                    }
                    const isSel = cell.date === selected;
                    const isToday = cell.date === today;
                    return (
                      <button
                        key={cell.key}
                        type="button"
                        onClick={() => setSelected(cell.date!)}
                        className={cn(
                          "h-12 rounded-xl text-sm transition-colors border",
                          isSel
                            ? "bg-indigo-600 text-white border-indigo-600"
                            : "hover:bg-muted/50 border-transparent",
                          isToday && !isSel && "ring-1 ring-indigo-400/50",
                        )}
                      >
                        <div className="font-medium">{cell.dayNum}</div>
                        {badgeDot(badgeMap[cell.date!])}
                      </button>
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground pt-1">
                  <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Sales</span>
                  <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Expenses</span>
                  <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-rose-500" /> Dues</span>
                  <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-sky-500" /> Notes/Tasks</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold">{selected}</h2>
              <p className="text-xs text-muted-foreground">Day detail</p>
            </div>
            {dayLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>

          {day && (
            <>
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                {DAY_STATS.map((s) => (
                  <Card key={s.label}>
                    <CardContent className="p-4 flex items-center gap-3">
                      <div className={`p-2.5 rounded-xl ${s.bg}`}>
                        <s.icon className={`h-5 w-5 ${s.color}`} />
                      </div>
                      <div>
                        <p className="text-lg font-bold leading-tight">{s.value}</p>
                        <p className="text-xs text-muted-foreground">{s.label}</p>
                        <p className="text-[10px] text-muted-foreground">{s.sub}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <Section title="Expenses" icon={Banknote}>
                  {day.expenses.items.slice(0, 8).map((e) => (
                    <Row key={e.id} label={e.description} value={`LKR ${formatNumber(e.amount)}`} />
                  ))}
                  {!day.expenses.items.length && <Empty />}
                </Section>

                <Section title="Supplier payments" icon={FileText}>
                  {day.supplierPayments.map((p) => (
                    <Row key={p.id} label={p.supplier.name} value={`LKR ${formatNumber(p.amount)}`} />
                  ))}
                  {!day.supplierPayments.length && <Empty />}
                </Section>

                <Section title="Supplier due" icon={FileText}>
                  {day.supplierDue.map((i) => (
                    <Row key={i.id} label={`${i.supplier.name} · ${i.invoiceNumber}`} value={`LKR ${formatNumber(i.due)}`} />
                  ))}
                  {!day.supplierDue.length && <Empty />}
                </Section>

                <Section title="Cheques due" icon={Banknote}>
                  {day.chequesDue.map((c) => (
                    <Row key={c.id} label={`${c.chequeNumber} · ${c.partyName ?? c.direction}`} value={`LKR ${formatNumber(c.amount)}`} />
                  ))}
                  {!day.chequesDue.length && <Empty />}
                </Section>

                <Section title="Customer due" icon={Users}>
                  {day.customerDue.map((c) => (
                    <Row
                      key={c.id}
                      label={`${c.customer.firstName} ${c.customer.lastName ?? ""} · ${c.source}`}
                      value={`LKR ${formatNumber(c.amount)}`}
                    />
                  ))}
                  {!day.customerDue.length && <Empty />}
                </Section>

                <Section title="Meetings" icon={CalendarDays}>
                  {day.meetings.map((m) => (
                    <Row key={m.id} label={m.title} value={String(m.startsAt).slice(11, 16)} />
                  ))}
                  {!day.meetings.length && <Empty />}
                  <div className="flex gap-1.5 mt-3 pt-2 border-t">
                    <Input placeholder="Meeting title" value={meetingTitle} onChange={(e) => setMeetingTitle(e.target.value)} className="h-9 text-xs" />
                    <Input type="time" value={meetingTime} onChange={(e) => setMeetingTime(e.target.value)} className="h-9 text-xs w-24" />
                    <Button size="sm" className="h-9 gap-1" onClick={addMeeting} disabled={busy}>
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </Section>

                <Section title="Notes" icon={StickyNote}>
                  {day.notes.map((n) => (
                    <Row key={n.id} label={n.title} value={n.body ?? ""} />
                  ))}
                  {!day.notes.length && <Empty />}
                  <div className="flex gap-1.5 mt-3 pt-2 border-t">
                    <Input
                      placeholder="Add note"
                      value={noteTitle}
                      onChange={(e) => setNoteTitle(e.target.value)}
                      className="h-9 text-xs"
                      onKeyDown={(e) => e.key === "Enter" && addNote()}
                    />
                    <Button size="sm" className="h-9" onClick={addNote} disabled={busy}>
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </Section>

                <Section title="Tasks" icon={CheckSquare}>
                  {day.tasks.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggleTask(t.id, t.status)}
                      className="w-full flex items-center justify-between py-1.5 text-left text-sm hover:bg-muted/40 rounded-lg px-2"
                    >
                      <span className={cn(t.status === "DONE" && "line-through text-muted-foreground")}>{t.title}</span>
                      <Badge variant="outline" className="text-[10px]">{t.status}</Badge>
                    </button>
                  ))}
                  {!day.tasks.length && <Empty />}
                  <div className="flex gap-1.5 mt-3 pt-2 border-t">
                    <Input
                      placeholder="Add task"
                      value={taskTitle}
                      onChange={(e) => setTaskTitle(e.target.value)}
                      className="h-9 text-xs"
                      onKeyDown={(e) => e.key === "Enter" && addTask()}
                    />
                    <Button size="sm" className="h-9" onClick={addTask} disabled={busy}>
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </Section>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4 space-y-1">
        <div className="flex items-center gap-2 mb-2">
          <div className="p-1.5 rounded-lg bg-muted">
            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <p className="text-xs font-semibold">{title}</p>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 text-xs py-1">
      <span className="truncate text-muted-foreground">{label}</span>
      <span className="shrink-0 tabular-nums font-medium">{value}</span>
    </div>
  );
}

function Empty() {
  return <p className="text-xs text-muted-foreground py-3 text-center">None for this day</p>;
}
