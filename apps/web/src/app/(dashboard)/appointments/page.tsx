"use client";

import { useState, useEffect, useCallback } from "react";
import { Calendar, Plus, Loader2, RefreshCw, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ModuleGate } from "@/components/shop/module-gate";
import { toast } from "sonner";
import { api } from "@/lib/api";

interface Appointment {
  id: string; appointmentNumber: string; status: string;
  scheduledAt: string; durationMinutes: number; serviceTypes: string[]; notes?: string | null;
  customer: { firstName: string; lastName?: string | null; phone: string };
  customerVehicle?: { registrationNo?: string | null } | null;
  jobCard?: { id: string; jobNumber: string; status: string } | null;
}
interface Customer { id: string; firstName: string; lastName?: string | null; phone: string }
interface Service { id: string; name: string }

const STATUS_VARIANT: Record<string, "warning" | "success" | "secondary" | "danger"> = {
  SCHEDULED: "secondary", CONFIRMED: "warning", CHECKED_IN: "success",
  IN_SERVICE: "warning", COMPLETED: "success", NO_SHOW: "danger", CANCELLED: "danger",
};

export default function AppointmentsPage() {
  const [items, setItems] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [form, setForm] = useState({
    customerId: "", scheduledAt: "", durationMinutes: "60", serviceTypes: [] as string[], notes: "",
  });
  const [saving, setSaving] = useState(false);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<Appointment[]>("/workshop/appointments");
      setItems(Array.isArray(res.data) ? res.data : []);
    } catch { toast.error("Failed to load appointments"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);
  useEffect(() => {
    api.get<{ data: Customer[] }>("/customers?limit=200").then((r) => setCustomers(r.data?.data ?? [])).catch(() => {});
    api.get<Service[]>("/workshop/services").then((r) => setServices(Array.isArray(r.data) ? r.data : [])).catch(() => {});
  }, []);

  const createAppt = async () => {
    if (!form.customerId || !form.scheduledAt) { toast.error("Customer and date/time required"); return; }
    setSaving(true);
    try {
      await api.post("/workshop/appointments", {
        customerId: form.customerId,
        scheduledAt: new Date(form.scheduledAt).toISOString(),
        durationMinutes: parseInt(form.durationMinutes, 10) || 60,
        serviceTypes: form.serviceTypes,
        notes: form.notes || undefined,
      });
      toast.success("Appointment booked");
      setForm({ customerId: "", scheduledAt: "", durationMinutes: "60", serviceTypes: [], notes: "" });
      fetchItems();
    } catch (e: unknown) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };

  const checkIn = async (id: string) => {
    try {
      await api.put(`/workshop/appointments/${id}`, { status: "CHECKED_IN" });
      toast.success("Checked in — job card created");
      fetchItems();
    } catch (e: unknown) { toast.error((e as Error).message); }
  };

  const toggleService = (name: string) => {
    setForm((f) => ({
      ...f,
      serviceTypes: f.serviceTypes.includes(name)
        ? f.serviceTypes.filter((s) => s !== name)
        : [...f.serviceTypes, name],
    }));
  };

  return (
    <ModuleGate module="appointments">
      <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Calendar className="h-6 w-6 text-primary" /> Appointments
            </h1>
            <p className="text-sm text-muted-foreground">Book tyre fitting, balancing & alignment slots</p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchItems} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        <div className="grid xl:grid-cols-3 gap-4">
          <Card className="xl:col-span-1"><CardContent className="p-4 space-y-3">
            <h3 className="font-semibold text-sm">Book Appointment</h3>
            <div className="space-y-1"><Label className="text-xs">Customer</Label>
              <Select value={form.customerId} onValueChange={(v) => setForm((f) => ({ ...f, customerId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>{customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.firstName} {c.lastName} — {c.phone}</SelectItem>
                ))}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label className="text-xs">Date & Time</Label>
              <Input type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm((f) => ({ ...f, scheduledAt: e.target.value }))} />
            </div>
            <div className="space-y-1"><Label className="text-xs">Duration (minutes)</Label>
              <Input type="number" value={form.durationMinutes} onChange={(e) => setForm((f) => ({ ...f, durationMinutes: e.target.value }))} />
            </div>
            <div className="space-y-1"><Label className="text-xs">Services</Label>
              <div className="flex flex-wrap gap-1.5">
                {services.map((s) => (
                  <Button key={s.id} type="button" size="sm" variant={form.serviceTypes.includes(s.name) ? "default" : "outline"}
                    onClick={() => toggleService(s.name)}>{s.name}</Button>
                ))}
              </div>
            </div>
            <div className="space-y-1"><Label className="text-xs">Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
            <Button onClick={createAppt} disabled={saving} className="w-full gap-1.5">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Book
            </Button>
          </CardContent></Card>

          <div className="xl:col-span-2 space-y-2">
            {loading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
            ) : items.length === 0 ? (
              <Card><CardContent className="p-8 text-center text-muted-foreground">No appointments scheduled</CardContent></Card>
            ) : items.map((a) => (
              <Card key={a.id}><CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{a.appointmentNumber}</span>
                    <Badge variant={STATUS_VARIANT[a.status] ?? "secondary"}>{a.status.replace(/_/g, " ")}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {new Date(a.scheduledAt).toLocaleString("en-LK")} · {a.durationMinutes} min
                  </p>
                  <p className="text-sm">{a.customer.firstName} {a.customer.lastName} · {a.customer.phone}</p>
                  {a.serviceTypes.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">{a.serviceTypes.join(", ")}</p>
                  )}
                  {a.jobCard && <p className="text-xs text-emerald-600 mt-1">Job: {a.jobCard.jobNumber}</p>}
                </div>
                <div className="flex gap-2">
                  {(a.status === "SCHEDULED" || a.status === "CONFIRMED") && !a.jobCard && (
                    <Button size="sm" onClick={() => checkIn(a.id)} className="gap-1">
                      <LogIn className="h-3.5 w-3.5" /> Check In
                    </Button>
                  )}
                </div>
              </CardContent></Card>
            ))}
          </div>
        </div>
      </div>
    </ModuleGate>
  );
}
