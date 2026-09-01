import * as React from "react";
import { api } from "@/lib/api";
import { normalizePosLayoutId, POS_LAYOUT_DEFAULT, type PosLayoutId } from "@/lib/pos-layouts";
import type { PosTenantSettings } from "@/lib/pos-settings";

export const POS_TENANT_SETTINGS_EVENT = "pos-tenant-settings-updated";

const LS_KEY = "pos_tenant_settings_cache";

function fromCache(): PosTenantSettings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as PosTenantSettings) : null;
  } catch {
    return null;
  }
}

function toCache(s: PosTenantSettings) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch { /* noop */ }
}

export function notifyPosTenantSettingsUpdated() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(POS_TENANT_SETTINGS_EVENT));
  }
}

const DEFAULTS: PosTenantSettings = {
  allowNegativeStock: true,
  autoPrint: false,
  roundOff: true,
  loyalty: true,
  reloadEnabled: true,
  posLayout: POS_LAYOUT_DEFAULT,
};

export function usePosTenantSettings(enabled = true) {
  const [settings, setSettings] = React.useState<PosTenantSettings>(() => ({
    ...DEFAULTS,
    ...fromCache(),
  }));
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    try {
      const r = await api.get<PosTenantSettings>("/tenants/pos-settings");
      const s: PosTenantSettings = {
        ...DEFAULTS,
        ...r.data,
        posLayout: normalizePosLayoutId(r.data?.posLayout),
      };
      setSettings(s);
      toCache(s);
    } catch {
      const cached = fromCache();
      if (cached) setSettings({ ...DEFAULTS, ...cached });
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    const onUpdated = () => {
      const cached = fromCache();
      if (cached) setSettings({ ...DEFAULTS, ...cached });
    };
    window.addEventListener(POS_TENANT_SETTINGS_EVENT, onUpdated);
    return () => window.removeEventListener(POS_TENANT_SETTINGS_EVENT, onUpdated);
  }, []);

  const posLayout: PosLayoutId = normalizePosLayoutId(settings.posLayout);

  return { settings, posLayout, loading, reload: load };
}
