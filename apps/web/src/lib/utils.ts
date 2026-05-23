import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(
  amount: number,
  currency: string = "INR",
  locale: string = "en-IN"
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatNumber(num: number, locale: string = "en-IN"): string {
  return new Intl.NumberFormat(locale).format(num);
}

export function formatCompactNumber(num: number): string {
  if (num >= 10000000) return `${(num / 10000000).toFixed(1)}Cr`;
  if (num >= 100000) return `${(num / 100000).toFixed(1)}L`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

export function formatDate(
  date: Date | string,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...options,
  }).format(d);
}

export function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(d);
}

export function generateSKU(
  brand: string,
  category: string,
  size: string,
  color: string
): string {
  const b = brand.substring(0, 3).toUpperCase();
  const c = category.substring(0, 3).toUpperCase();
  const s = size.substring(0, 2).toUpperCase();
  const col = color.substring(0, 3).toUpperCase();
  const num = Math.floor(Math.random() * 9000) + 1000;
  return `${b}-${c}-${s}-${col}-${num}`;
}

export function generateBarcode(): string {
  const prefix = "890";
  const random = Math.floor(Math.random() * 9999999999)
    .toString()
    .padStart(10, "0");
  const full = prefix + random;
  const checkDigit = calculateEAN13CheckDigit(full.substring(0, 12));
  return full.substring(0, 12) + checkDigit;
}

function calculateEAN13CheckDigit(code: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(code[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10;
}

export function calculateTax(amount: number, taxRate: number): number {
  return Math.round((amount * taxRate) / 100 * 100) / 100;
}

export function calculateDiscount(
  amount: number,
  discount: number,
  discountType: "percentage" | "fixed"
): number {
  if (discountType === "percentage") {
    return Math.round((amount * discount) / 100 * 100) / 100;
  }
  return Math.min(discount, amount);
}

export function calculateLoyaltyPoints(amount: number, rate: number = 1): number {
  return Math.floor(amount * rate);
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .substring(0, 2);
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return `${str.substring(0, length)}...`;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]+/g, "")
    .replace(/--+/g, "-")
    .trim();
}

export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return function (...args: Parameters<T>) {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

export function getColorForValue(
  value: number,
  thresholds: { good: number; warning: number }
): string {
  if (value >= thresholds.good) return "text-emerald-500";
  if (value >= thresholds.warning) return "text-amber-500";
  return "text-red-500";
}

export function getStockStatus(
  current: number,
  minimum: number
): "in_stock" | "low_stock" | "out_of_stock" {
  if (current === 0) return "out_of_stock";
  if (current <= minimum) return "low_stock";
  return "in_stock";
}

export function parseCSV(csvText: string): Record<string, string>[] {
  const lines = csvText.trim().split("\n");
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim());
    return headers.reduce(
      (obj, header, i) => ({ ...obj, [header]: values[i] || "" }),
      {} as Record<string, string>
    );
  });
}

export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));
