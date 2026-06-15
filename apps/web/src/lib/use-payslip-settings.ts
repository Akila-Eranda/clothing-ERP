import * as React from 'react';
import { api } from '@/lib/api';
import { PAYSLIP_DEFAULTS, type PayslipSettings } from '@/lib/payslip-settings';

export type { PayslipSettings } from '@/lib/payslip-settings';
export { PAYSLIP_DEFAULTS } from '@/lib/payslip-settings';

const LS_KEY = 'payslip_settings_cache';

function fromCache(): PayslipSettings | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? ({ ...PAYSLIP_DEFAULTS, ...JSON.parse(raw) } as PayslipSettings) : null;
  } catch {
    return null;
  }
}

function toCache(s: PayslipSettings) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch {
    /* noop */
  }
}

export function usePayslipSettings() {
  const [settings, setSettings] = React.useState<PayslipSettings>(() => fromCache() ?? PAYSLIP_DEFAULTS);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    try {
      const r = await api.get<PayslipSettings>('/tenants/payslip-settings');
      const raw = r.data;
      const merged =
        raw && typeof raw === 'object' && !Array.isArray(raw)
          ? ({ ...PAYSLIP_DEFAULTS, ...raw } as PayslipSettings)
          : PAYSLIP_DEFAULTS;
      setSettings(merged);
      toCache(merged);
    } catch {
      /* use cache / defaults */
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const save = React.useCallback(async (next: PayslipSettings) => {
    const r = await api.put<PayslipSettings>('/tenants/payslip-settings', next);
    const raw = r.data;
    const s =
      raw && typeof raw === 'object' && !Array.isArray(raw)
        ? ({ ...PAYSLIP_DEFAULTS, ...raw } as PayslipSettings)
        : next;
    setSettings(s);
    toCache(s);
    return s;
  }, []);

  return { settings, loading, reload: load, save };
}
