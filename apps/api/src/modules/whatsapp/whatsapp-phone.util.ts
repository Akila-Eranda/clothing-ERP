/** Normalize Sri Lanka / international phone to WhatsApp JID user part (digits only, with country code). */
export function normalizeWhatsappPhone(raw: string, defaultCountry = '94'): string {
  let digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0') && digits.length >= 9) {
    digits = `${defaultCountry}${digits.slice(1)}`;
  }
  if (!digits.startsWith(defaultCountry) && digits.length <= 10) {
    digits = `${defaultCountry}${digits.replace(/^0+/, '')}`;
  }
  return digits;
}

export function toWhatsappJid(phone: string): string {
  const n = normalizeWhatsappPhone(phone);
  if (!n) throw new Error('Invalid phone number');
  return `${n}@s.whatsapp.net`;
}
