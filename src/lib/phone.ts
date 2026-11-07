// Pick the best phone for outreach (international format if present) and
// derive a wa.me URL from it. Returns null for both if no phone is usable.

export type AgencyPhone = { phone: string; phone_type?: string };

export function bestPhone(phones?: AgencyPhone[] | null): AgencyPhone | null {
  if (!phones || phones.length === 0) return null;
  // Prefer the international format ("+971 ...") since it round-trips through
  // wa.me/<digits>. National format ("050 ...") is shown as a display fallback
  // but cannot deep-link reliably.
  const intl = phones.find((p) => p.phone.trim().startsWith('+'));
  return intl ?? phones[0];
}

/** WhatsApp deep link from any phone string, or null if it isn't dial-able. */
export function whatsAppHref(phone: string | null | undefined, message?: string): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  // wa.me only accepts digits — and the number MUST include the country code.
  // We accept formats with a leading + OR with "00" international prefix.
  let digits = trimmed.replace(/[^\d+]/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('+'))  digits = digits.slice(1);
  // Sanity: a real international number is 8–15 digits and never starts with 0
  // after stripping the leading +/00.
  if (digits.length < 8 || digits.length > 15 || digits.startsWith('0')) return null;
  const base = `https://wa.me/${digits}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

/** tel: URL — works for nearly any phone string. */
export function telHref(phone: string | null | undefined): string | null {
  if (!phone) return null;
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

/** Pretty-print a phone for the table: collapse runs of whitespace. */
export function fmtPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  return phone.replace(/\s+/g, ' ').trim();
}
