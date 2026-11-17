/**
 * Customer bill message on the web: fetch the server-built text of a sale (shop template, real invoice, current
 * credit balance), copy it with its line breaks, or open a WhatsApp share link. The text is built on the server
 * (apps/api/src/shared/sale-bill-message.ts); nothing here changes it.
 */

/** wa.me wants digits only with the country code: 077 123 4567 → 94771234567 (Sri Lanka when it starts with 0). */
export function whatsappNumber(phone: string | null | undefined, defaultCountryCode = "94"): string {
  const digits = (phone ?? "").replace(/[^\d]/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith("0")) return defaultCountryCode + digits.slice(1);
  return digits;
}

/** Share link that keeps every line break of the message (encoded as %0A). */
export function whatsappShareUrl(phone: string | null | undefined, message: string): string {
  const n = whatsappNumber(phone);
  return `https://wa.me/${n}?text=${encodeURIComponent(message)}`;
}

/** Copies text with its line breaks (Clipboard API, with a textarea fallback for old / insecure contexts). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the textarea fallback */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
