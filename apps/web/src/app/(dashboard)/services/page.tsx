"use client";

import { useState, useEffect, useCallback } from "react";
import { Wrench, Plus, Loader2, RefreshCw, Bell, Users, Hash } from "lucide-react";
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
import { formatNumber } from "@/lib/utils";

interface Service {
  id: string; code: string; name: string; category: string;
  defaultPrice: number; durationMinutes: number; isActive: boolean;
}
interface Reminder {
  id: string; reminderType: string; channel: string; scheduledFor: string;
  message: string; status: string;
  customer: { firstName: string; lastName?: string | null; phone: string };
}
interface FleetCustomer {
  id: string; firstName: string; lastName?: string | null; phone: string;
  totalSpent: number; isFleet: boolean;
}
interface Serial {
  id: string; serialNumber: string; dotCode?: string | null; status: string;
  variant: { name: string; product: { name: string; brand?: { name: string } | null } };
}
interface Customer { id: string; firstName: string; lastName?: string | null; phone: string }
interface VariantOpt { variantId: string; productName: string; variantName: string; sku: string }

type Tab = "services" | "reminders" | "fleet" | "serials";

export default function ServicesPage() {
  const [tab, setTab] = useState<Tab>("services");
  const [services, setServices] = useState<Service[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [fleet, setFleet] = useState<FleetCustomer[]>([]);
  const [serials, setSerials] = useState<Serial[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [variants, setVariants] = useState<VariantOpt[]>([]);
  const [loading, setLoading] = useState(false);
  const [remForm, setRemForm] = useState({ customerId: "", scheduledFor: "", message: "", channel: "SMS" });
  const [serialForm, setSerialForm] = useState({ variantId: "", serialNumber: "", dotCode: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === "services") {
        const r = await api.get<Service[]>("/workshop/services");
        setServices(Array.isArray(r.data) ? r.data : []);
      } else if (tab === "reminders") {
        const r = await api.get<Reminder[]>("/workshop/reminders");
        setReminders(Array.isArray(r.data) ? r.data : []);
      } else if (tab === "fleet") {
        const r = await api.get<FleetCustomer[]>("/workshop/fleet-customers");
        setFleet(Array.isArray(r.data) ? r.data : []);
      } else {
        const r = await api.get<Serial[]>("/workshop/tyre-serials");
        setSerials(Array.isArray(r.data) ? r.data : []);
      }
    } catch { toast.error("Failed to load data"); }
    finally { setLoading(false); }
  }, [tab]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get<{ data: Customer[] }>("/customers?limit=200").then((r) => setCustomers(r.data?.data ?? [])).catch(() => {});
    api.get<VariantOpt[]>("/pos/products").then((r) => setVariants(Array.isArray(r.data) ? r.data : [])).catch(() => {});
  }, []);

  const seedServices = async () => {
    try {
      await api.post("/workshop/services/seed-defaults");
      toast.success("Default services loaded (Fitting, Balancing, Alignment…)");
      load();
    } catch (e: unknown) { toast.error((e as Error).message); }
  };

  const createReminder = async () => {
    if (!remForm.customerId || !remForm.scheduledFor || !remForm.message) {
      toast.error("Fill all reminder fields"); return;
    }
    try {
      await api.post("/workshop/reminders", {
        customerId: remForm.customerId,
        scheduledFor: new Date(remForm.scheduledFor).toISOString(),
        message: remForm.message,
        channel: remForm.channel,
        reminderType: "SERVICE_DUE",
      });
      toast.success("Reminder scheduled");
      setRemForm({ customerId: "", scheduledFor: "", message: "", channel: "SMS" });
      load();
    } catch (e: unknown) { toast.error((e as Error).message); }
  };

  const sendReminder = async (id: string) => {
    try {
      await api.post(`/workshop/reminders/${id}/send`);
      toast.success("Reminder sent");
      load();
    } catch (e: unknown) { toast.error((e as Error).message); }
  };

  const addSerial = async () => {
    if (!serialForm.variantId || !serialForm.serialNumber) { toast.error("Variant and serial required"); return; }
    try {
      await api.post("/workshop/tyre-serials", serialForm);
      toast.success("Serial registered");
      setSerialForm({ variantId: "", serialNumber: "", dotCode: "" });
      load();
    } catch (e: unknown) { toast.error((e as Error).message); }
  };

  const toggleFleet = async (id: string, isFleet: boolean) => {
    try {
      await api.put(`/workshop/fleet-customers/${id}`, { isFleet: !isFleet });
      toast.success(isFleet ? "Removed from fleet" : "Marked as fleet customer");
      load();
    } catch (e: unknown) { toast.error((e as Error).message); }
  };

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "services", label: "Service Catalog", icon: Wrench },
    { id: "reminders", label: "Reminders", icon: Bell },
    { id: "fleet", label: "Fleet Customers", icon: Users },
    { id: "serials", label: "Serial Numbers", icon: Hash },
  ];

  return (
    <ModuleGate module="workshop">
      <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Wrench className="h-6 w-6 text-primary" /> Workshop Services
            </h1>
            <p className="text-sm text-muted-foreground">Service catalog, reminders, fleet & premium tyre serials</p>
          </div>
          <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        <div className="flex gap-2 flex-wrap">
          {tabs.map((t) => (
            <Button key={t.id} variant={tab === t.id ? "default" : "outline"} size="sm"
              onClick={() => setTab(t.id)} className="gap-1.5">
              <t.icon className="h-3.5 w-3.5" /> {t.label}
            </Button>
          ))}
        </div>

        {tab === "services" && (
          <div className="space-y-3">
            <Button size="sm" onClick={seedServices} className="gap-1"><Plus className="h-3.5 w-3.5" /> Load Default Services</Button>
            {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {services.map((s) => (
                  <Card key={s.id}><CardContent className="p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold">{s.name}</p>
                        <p className="text-xs text-muted-foreground">{s.code} · {s.category}</p>
                      </div>
                      <Badge variant="secondary">{s.durationMinutes}m</Badge>
                    </div>
                    <p className="text-lg font-bold text-primary mt-2">LKR {formatNumber(s.defaultPrice)}</p>
                  </CardContent></Card>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "reminders" && (
          <div className="grid xl:grid-cols-3 gap-4">
            <Card><CardContent className="p-4 space-y-3">
              <h3 className="font-semibold text-sm">Schedule Reminder</h3>
              <Select value={remForm.customerId} onValueChange={(v) => setRemForm((f) => ({ ...f, customerId: v }))}>
                <SelectTrigger><SelectValue placeholder="Customer" /></SelectTrigger>
                <SelectContent>{customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.firstName} {c.lastName}</SelectItem>
                ))}</SelectContent>
              </Select>
              <Input type="datetime-local" value={remForm.scheduledFor} onChange={(e) => setRemForm((f) => ({ ...f, scheduledFor: e.target.value }))} />
              <Select value={remForm.channel} onValueChange={(v) => setRemForm((f) => ({ ...f, channel: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SMS">SMS</SelectItem>
                  <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                  <SelectItem value="EMAIL">Email</SelectItem>
                </SelectContent>
              </Select>
              <Textarea rows={2} placeholder="Message…" value={remForm.message} onChange={(e) => setRemForm((f) => ({ ...f, message: e.target.value }))} />
              <Button onClick={createReminder} className="w-full">Schedule</Button>
            </CardContent></Card>
            <div className="xl:col-span-2 space-y-2">
              {reminders.map((r) => (
                <Card key={r.id}><CardContent className="p-3 flex justify-between items-center gap-2">
                  <div>
                    <p className="text-sm font-medium">{r.customer.firstName} · {r.channel}</p>
                    <p className="text-xs text-muted-foreground">{new Date(r.scheduledFor).toLocaleString("en-LK")}</p>
                    <p className="text-xs mt-1">{r.message}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={r.status === "SENT" ? "success" : "secondary"}>{r.status}</Badge>
                    {r.status === "PENDING" && (
                      <Button size="sm" variant="outline" onClick={() => sendReminder(r.id)}>Send</Button>
                    )}
                  </div>
                </CardContent></Card>
              ))}
            </div>
          </div>
        )}

        {tab === "fleet" && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Mark workshop/fleet customers for quotations & credit terms.</p>
            {customers.slice(0, 30).map((c) => {
              const fc = fleet.find((f) => f.id === c.id);
              const isFleet = fc?.isFleet ?? false;
              return (
                <Card key={c.id}><CardContent className="p-3 flex justify-between items-center">
                  <span>{c.firstName} {c.lastName} · {c.phone}</span>
                  <Button size="sm" variant={isFleet ? "default" : "outline"} onClick={() => toggleFleet(c.id, isFleet)}>
                    {isFleet ? "Fleet ✓" : "Mark Fleet"}
                  </Button>
                </CardContent></Card>
              );
            })}
          </div>
        )}

        {tab === "serials" && (
          <div className="grid xl:grid-cols-3 gap-4">
            <Card><CardContent className="p-4 space-y-3">
              <h3 className="font-semibold text-sm">Register Premium Tyre Serial</h3>
              <Select value={serialForm.variantId} onValueChange={(v) => setSerialForm((f) => ({ ...f, variantId: v }))}>
                <SelectTrigger><SelectValue placeholder="Tyre variant" /></SelectTrigger>
                <SelectContent>{variants.map((v) => (
                  <SelectItem key={v.variantId} value={v.variantId}>{v.productName} — {v.variantName}</SelectItem>
                ))}</SelectContent>
              </Select>
              <Input placeholder="Serial number" value={serialForm.serialNumber} onChange={(e) => setSerialForm((f) => ({ ...f, serialNumber: e.target.value }))} />
              <Input placeholder="DOT code (e.g. 2524)" value={serialForm.dotCode} onChange={(e) => setSerialForm((f) => ({ ...f, dotCode: e.target.value }))} />
              <Button onClick={addSerial} className="w-full">Register</Button>
            </CardContent></Card>
            <div className="xl:col-span-2 space-y-2">
              {serials.map((s) => (
                <Card key={s.id}><CardContent className="p-3 flex justify-between">
                  <div>
                    <p className="font-mono text-sm font-semibold">{s.serialNumber}</p>
                    <p className="text-xs text-muted-foreground">{s.variant.product.name} — {s.variant.name}</p>
                    {s.dotCode && <p className="text-xs">DOT: {s.dotCode}</p>}
                  </div>
                  <Badge variant={s.status === "IN_STOCK" ? "success" : "secondary"}>{s.status}</Badge>
                </CardContent></Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </ModuleGate>
  );
}
