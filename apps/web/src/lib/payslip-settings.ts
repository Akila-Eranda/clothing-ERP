/** Shared payslip template types + defaults (safe for server/client imports). */

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
