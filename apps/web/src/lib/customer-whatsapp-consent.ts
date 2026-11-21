export function hasCustomerWhatsappConsent(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false;
  const value = metadata as Record<string, unknown>;
  if (typeof value.whatsappConsent === "boolean") return value.whatsappConsent;
  const whatsapp = value.whatsapp;
  return !!whatsapp && typeof whatsapp === "object" && !Array.isArray(whatsapp) &&
    (whatsapp as Record<string, unknown>).consent === true;
}
