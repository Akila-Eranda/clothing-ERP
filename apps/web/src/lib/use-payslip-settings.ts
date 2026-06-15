'use client';

import * as React from 'react';
import { api } from '@/lib/api';

export interface PayslipSettings {
  /** Document title shown below company header */
  title: string;
  headerText: string;
  footerText: string;
  thankYouText: string;
  currencyLabel: string;
  /** Use shop name / address / contact from Receipt Print settings */
  useReceiptShopInfo: boolean;
  companyName: string;
  tagline: string;
  address1: string;
  address2: string;
  phone: string;
  email: string;
  showLogo: boolean;
  logoUrl: string;
  showPayslipNumber: boolean;
  showEmployeeId: boolean;
  showDesignation: boolean;
  showPayPeriod: boolean;
  showPaidDate: boolean;
  showShopContact: boolean;
  labelEarningsSection: string;
  labelDeductionsSection: string;
  labelBasicSalary: string;
  labelAllowances: string;
  labelBonus: string;
  labelDeductions: string;
  labelNetPay: string;
  signatureLine: string;
  paperWidth: 'inherit' | '58mm' | '80mm';
  fontSize: 'inherit' | 'small' | 'medium' | 'large';
}

export const PAYSLIP_DEFAULTS: PayslipSettings = {
  title: 'PAYSLIP',
  headerText: '',
  footerText: 'Computer generated payslip. No signature required.',
  thankYouText: 'THANK YOU!',
  currencyLabel: 'LKR',
  useReceiptShopInfo: true,
  companyName: '',
  tagline: '',
  address1: '',
  address2: '',
  phone: '',
  email: '',
  showLogo: true,
  logoUrl: '',
  showPayslipNumber: true,
  showEmployeeId: true,
  showDesignation: true,
  showPayPeriod: true,
  showPaidDate: true,
  showShopContact: true,
  labelEarningsSection: 'EARNINGS',
  labelDeductionsSection: 'DEDUCTIONS',
  labelBasicSalary: 'Basic Salary',
  labelAllowances: 'Allowances',
  labelBonus: 'Bonus',
  labelDeductions: 'Total Deductions',
  labelNetPay: 'NET PAY',
  signatureLine: '',
  paperWidth: 'inherit',
  fontSize: 'inherit',
};

const LS_KEY = 'payslip_settings_cache';

function fromCache(): PayslipSettings | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? ({ ...PAYSLIP_DEFAULTS, ...JSON.parse(raw) } as PayslipSettings) : null;
  } catch {
    return null;
  }
}

function toCache(s: PayslipSettings) {
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
      const s = { ...PAYSLIP_DEFAULTS, ...r.data } as PayslipSettings;
      setSettings(s);
      toCache(s);
    } catch {
      /* use cache */
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const save = React.useCallback(async (next: PayslipSettings) => {
    const r = await api.put<PayslipSettings>('/tenants/payslip-settings', next);
    const s = { ...PAYSLIP_DEFAULTS, ...r.data } as PayslipSettings;
    setSettings(s);
    toCache(s);
    return s;
  }, []);

  return { settings, loading, reload: load, save };
}
