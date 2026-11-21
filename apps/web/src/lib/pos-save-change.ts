export type SaveChangeValidationInput = {
  enabled: boolean;
  consent: boolean;
  amountInput: string;
  customerId?: string;
  changeDue: number;
  minimum?: number;
  maximum?: number | null;
};

export type SaveChangeValidation =
  | { ok: true; amount: number }
  | { ok: false; message: string };

export function validateSaveChangeInput(input: SaveChangeValidationInput): SaveChangeValidation {
  const raw = input.amountInput.trim();
  if (!input.enabled) return { ok: true, amount: 0 };
  if (!input.consent && raw) {
    return { ok: false, message: "Confirm consent before saving change to the customer's wallet" };
  }
  if (!input.consent) return { ok: true, amount: 0 };
  if (!input.customerId) {
    return { ok: false, message: "Select a customer before saving change to their wallet" };
  }
  const amount = Number(raw);
  const maximum = Math.min(input.changeDue, input.maximum ?? Number.POSITIVE_INFINITY);
  if (!Number.isFinite(amount) || amount <= 0 || amount < (input.minimum ?? 0) || amount > maximum + 0.01) {
    return { ok: false, message: `Enter a saved change amount up to LKR ${input.changeDue.toFixed(2)}` };
  }
  return { ok: true, amount: Math.round(amount * 100) / 100 };
}
