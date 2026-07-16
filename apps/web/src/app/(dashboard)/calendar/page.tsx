"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Banknote, CalendarDays, CheckSquare, ChevronLeft, ChevronRight, FileText,
  Loader2, Plus, RefreshCw, StickyNote, TrendingUp, Users, Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { cn, formatNumber } from "@/lib/utils";

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

  const monthLabel = new Date(Date.UTC(year, month - 1, 1)).toLocaleString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <CalendarDays className="h-6 w-6" /> Business Calendar
          </h1>
          <p className="text-sm text-muted-foreground">Sales, profit, dues, notes, tasks & meetings</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { loadMonth(); loadDay(selected); }} disabled={loading}>
          <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} /> Refresh
        </Button>
      </div>

      <div className="grid lg:grid-cols-12 gap-4">
        {/* Month grid */}
        <Card className="lg:col-span-5">
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="icon" onClick={() => shiftMonth(-1)}><ChevronLeft className="h-4 w-4" /></Button>
              <div className="font-semibold">{monthLabel}</div>
              <Button variant="ghost" size="icon" onClick={() => shiftMonth(1)}><ChevronRight className="h-4 w-4" /></Button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground uppercase">
              {WEEKDAYS.map((w) => <div key={w} className="py-1">{w}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {gridDays.map((cell) => {
                if (!cell.inMonth || !cell.date) {
                  return <div key={cell.key} className="h-12 rounded-md bg-muted/20" />;
                }
                const isSel = cell.date === selected;
                const isToday = cell.date === today;
                return (
                  <button
                    key={cell.key}
                    type="button"
                    onClick={() => setSelected(cell.date!)}
                    className={cn(
                      "h-12 rounded-md text-sm transition-colors border",
                      isSel ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted/50 border-transparent",
                      isToday && !isSel && "ring-1 ring-primary/40",
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
          </CardContent>
        </Card>

        {/* Day panel */}
        <div className="lg:col-span-7 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-lg">{selected}</h2>
            {dayLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>

          {day && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Card><CardContent className="pt-3 pb-3">
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Sales</div>
                  <div className="text-lg font-semibold tabular-nums">LKR {formatNumber(day.sales.net)}</div>
                  <div className="text-[10px] text-muted-foreground">{day.sales.count} orders</div>
                </CardContent></Card>
                <Card><CardContent className="pt-3 pb-3">
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1"><Wallet className="h-3 w-3" /> Net profit</div>
                  <div className={cn("text-lg font-semibold tabular-nums", day.profit.netProfit >= 0 ? "text-emerald-600" : "text-rose-600")}>
                    LKR {formatNumber(day.profit.netProfit)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">{day.profit.netMarginPct}% margin</div>
                </CardContent></Card>
                <Card><CardContent className="pt-3 pb-3">
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1"><Banknote className="h-3 w-3" /> Expenses</div>
                  <div className="text-lg font-semibold tabular-nums">LKR {formatNumber(day.expenses.total)}</div>
                </CardContent></Card>
                <Card><CardContent className="pt-3 pb-3">
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1"><Users className="h-3 w-3" /> Customer due</div>
                  <div className="text-lg font-semibold tabular-nums text-amber-600">
                    LKR {formatNumber(day.customerDue.reduce((s, c) => s + c.amount, 0))}
                  </div>
                </CardContent></Card>
              </div>

              <div className="grid md:grid-cols-2 gap-3">
                <Section title="Expenses" icon={Banknote}>
                  {day.expenses.items.slice(0, 6).map((e) => (
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
                  <div className="flex gap-1 mt-2">
                    <Input placeholder="Meeting title" value={meetingTitle} onChange={(e) => setMeetingTitle(e.target.value)} className="h-8 text-xs" />
                    <Input type="time" value={meetingTime} onChange={(e) => setMeetingTime(e.target.value)} className="h-8 text-xs w-24" />
                    <Button size="sm" className="h-8" onClick={addMeeting} disabled={busy}><Plus className="h-3.5 w-3.5" /></Button>
                  </div>
                </Section>

                <Section title="Notes" icon={StickyNote}>
                  {day.notes.map((n) => (
                    <Row key={n.id} label={n.title} value={n.body ?? ""} />
                  ))}
                  {!day.notes.length && <Empty />}
                  <div className="flex gap-1 mt-2">
                    <Input placeholder="Add note" value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} className="h-8 text-xs" onKeyDown={(e) => e.key === "Enter" && addNote()} />
                    <Button size="sm" className="h-8" onClick={addNote} disabled={busy}><Plus className="h-3.5 w-3.5" /></Button>
                  </div>
                </Section>

                <Section title="Tasks" icon={CheckSquare}>
                  {day.tasks.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggleTask(t.id, t.status)}
                      className="w-full flex items-center justify-between py-1 text-left text-sm hover:bg-muted/40 rounded px-1"
                    >
                      <span className={cn(t.status === "DONE" && "line-through text-muted-foreground")}>{t.title}</span>
                      <Badge variant="outline" className="text-[10px]">{t.status}</Badge>
                    </button>
                  ))}
                  {!day.tasks.length && <Empty />}
                  <div className="flex gap-1 mt-2">
                    <Input placeholder="Add task" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} className="h-8 text-xs" onKeyDown={(e) => e.key === "Enter" && addTask()} />
                    <Button size="sm" className="h-8" onClick={addTask} disabled={busy}><Plus className="h-3.5 w-3.5" /></Button>
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
    <div className="rounded-lg border p-3 space-y-1">
      <div className="text-xs font-semibold flex items-center gap-1.5 mb-1">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" /> {title}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 text-xs py-0.5">
      <span className="truncate text-muted-foreground">{label}</span>
      <span className="shrink-0 tabular-nums font-medium">{value}</span>
    </div>
  );
}

function Empty() {
  return <p className="text-xs text-muted-foreground py-2">None</p>;
}
