/** POS cashier PIN unlock — switch operator without full re-login. */

const TOKEN_KEY = "pos_cashier_unlock_token";
const CASHIER_KEY = "pos_active_cashier";

export type PosActiveCashier = {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  email?: string | null;
  role?: string | null;
};

export const posCashierStorage = {
  getToken: (): string | null =>
    typeof window !== "undefined" ? sessionStorage.getItem(TOKEN_KEY) : null,
  getCashier: (): PosActiveCashier | null => {
    if (typeof window === "undefined") return null;
    try {
      const raw = sessionStorage.getItem(CASHIER_KEY);
      return raw ? (JSON.parse(raw) as PosActiveCashier) : null;
    } catch {
      return null;
    }
  },
  set: (token: string, cashier: PosActiveCashier) => {
    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(CASHIER_KEY, JSON.stringify(cashier));
  },
  clear: () => {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(CASHIER_KEY);
  },
};
