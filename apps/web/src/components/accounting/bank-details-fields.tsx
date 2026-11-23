"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  BANK_DETAIL_LABELS,
  type BankDetailKey,
  type BankDetailsInput,
} from "@/lib/bank-account";

const PLACEHOLDERS: Record<BankDetailKey, string> = {
  bankName: "e.g. Bank of Ceylon",
  accountNumber: "e.g. 0081 2345 6789",
  accountHolderName: "Name on the account",
  branchName: "e.g. Colombo Fort",
  branchCode: "e.g. 001",
};

/**
 * The five bank account details shown to the customer with a QR payment, as one block of form fields.
 * Shared by Settings → QR payments (bank accounts) and the Accounting → Banking / Finance "add account" forms,
 * so every screen asks for — and validates — the same things. `errors` come from bankDetailProblems().
 */
export function BankDetailsFields({
  value,
  onChange,
  errors = {},
  required,
  disabled,
  idPrefix = "bank",
  compact,
}: {
  value: BankDetailsInput;
  onChange: (next: BankDetailsInput) => void;
  errors?: Partial<Record<BankDetailKey, string>>;
  /** Show the required asterisk (current / savings accounts). */
  required: boolean;
  disabled?: boolean;
  idPrefix?: string;
  compact?: boolean;
}) {
  const field = (key: BankDetailKey, extra?: { inputMode?: "text" | "numeric"; maxLength?: number }) => (
    <div className="space-y-1" key={key}>
      <Label htmlFor={`${idPrefix}-${key}`} className={compact ? "text-xs" : undefined}>
        {BANK_DETAIL_LABELS[key]}{required ? " *" : ""}
      </Label>
      <Input
        id={`${idPrefix}-${key}`}
        data-testid={`${idPrefix}-${key}`}
        className={compact ? "h-9" : undefined}
        value={value[key]}
        placeholder={PLACEHOLDERS[key]}
        disabled={disabled}
        maxLength={extra?.maxLength ?? 100}
        inputMode={extra?.inputMode}
        autoComplete="off"
        aria-invalid={errors[key] ? true : undefined}
        aria-describedby={errors[key] ? `${idPrefix}-${key}-error` : undefined}
        onChange={(e) => onChange({ ...value, [key]: e.target.value })}
      />
      {errors[key] && <p id={`${idPrefix}-${key}-error`} className="text-xs text-destructive-text" role="alert">{errors[key]}</p>}
    </div>
  );
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {field("bankName")}
      {field("accountNumber", { maxLength: 40 })}
      {field("accountHolderName")}
      {field("branchName")}
      {field("branchCode", { maxLength: 12 })}
    </div>
  );
}
