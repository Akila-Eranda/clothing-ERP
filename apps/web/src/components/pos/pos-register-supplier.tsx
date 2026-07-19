"use client";

import * as React from "react";
import { Loader2, Plus, Truck, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";

const INPUT_CLS =
  "w-full h-9 rounded-xl px-3 text-sm text-white outline-none focus:border-[#4f6ef7] transition-colors";
const INPUT_STYLE = { background: "#1a2b4a", border: "1px solid #1e3356" } as const;

export type RegisteredSupplier = {
  id: string;
  name: string;
  phone?: string | null;
  code?: string | null;
  balance?: number;
};

type Props = {
  disabled?: boolean;
  onRegistered: (supplier: RegisteredSupplier) => void;
};

export function PosRegisterSupplier({ disabled, onRegistered }: Props) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [contactPerson, setContactPerson] = React.useState("");

  const reset = () => {
    setName("");
    setPhone("");
    setContactPerson("");
    setOpen(false);
  };

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Supplier name is required");
      return;
    }
    if (!phone.trim()) {
      toast.error("Phone is required");
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<RegisteredSupplier>("/suppliers", {
        name: name.trim(),
        phone: phone.trim(),
        contactPerson: contactPerson.trim() || undefined,
        creditDays: 30,
        creditLimit: 0,
      });
      const created = res.data;
      toast.success(`${created.name} registered`);
      onRegistered({
        id: created.id,
        name: created.name,
        phone: created.phone ?? phone.trim(),
        code: created.code,
        balance: created.balance ?? 0,
      });
      reset();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to register supplier");
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-[11px] font-bold transition-all hover:bg-white/10 disabled:opacity-50"
        style={{ color: "#93c5fd", border: "1px solid rgba(147,197,253,0.35)" }}
      >
        <Plus className="h-3.5 w-3.5" />
        New supplier
      </button>
    );
  }

  return (
    <div
      className="rounded-xl border p-3 space-y-2.5"
      style={{ background: "rgba(79,110,247,0.08)", borderColor: "rgba(79,110,247,0.35)" }}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-white flex items-center gap-1.5">
          <Truck className="h-3.5 w-3.5" style={{ color: "#93c5fd" }} />
          Register supplier
        </p>
        <button
          type="button"
          onClick={reset}
          disabled={busy}
          className="p-1 rounded-lg hover:bg-white/10 disabled:opacity-50"
          style={{ color: "#6a8ab8" }}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-[10px] font-semibold uppercase" style={{ color: "#6a8ab8" }}>
            Name *
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy || disabled}
            placeholder="Supplier name"
            className={INPUT_CLS}
            style={INPUT_STYLE}
            autoFocus
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-semibold uppercase" style={{ color: "#6a8ab8" }}>
            Phone *
          </label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={busy || disabled}
            placeholder="Phone number"
            className={INPUT_CLS}
            style={INPUT_STYLE}
          />
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-[10px] font-semibold uppercase" style={{ color: "#6a8ab8" }}>
          Contact person
        </label>
        <input
          value={contactPerson}
          onChange={(e) => setContactPerson(e.target.value)}
          disabled={busy || disabled}
          placeholder="Optional"
          className={INPUT_CLS}
          style={INPUT_STYLE}
        />
      </div>
      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy || disabled}
        className="w-full h-9 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50"
        style={{ background: "#4f6ef7" }}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        {busy ? "Saving…" : "Save supplier"}
      </button>
    </div>
  );
}
