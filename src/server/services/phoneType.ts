// Classify a phone number as mobile / landline / unknown from its numbering
// range (libphonenumber-js "/max" carries per-range type metadata). A landline
// can never be on WhatsApp, so this is the cheapest "will a template even
// deliver?" signal we have. Ported from the summit Lead Finder (phone-type.ts).

import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/max';

export type PhoneType = 'mobile' | 'landline' | 'unknown';

const MOBILE_TYPES = new Set(['MOBILE', 'PERSONAL_NUMBER']);
const LANDLINE_TYPES = new Set([
  'FIXED_LINE',
  'UAN', // company access numbers (e.g. Pakistan's 111-… lines)
  'TOLL_FREE',
  'PREMIUM_RATE',
  'SHARED_COST',
  'PAGER',
  'VOICEMAIL',
]);

export function classifyPhone(phone: string | null | undefined, countryCode?: string | null): PhoneType {
  if (!phone?.trim()) return 'unknown';
  const parsed = parsePhoneNumberFromString(phone, (countryCode?.toUpperCase() || undefined) as CountryCode | undefined);
  const type = parsed?.getType();
  if (type && MOBILE_TYPES.has(type)) return 'mobile';
  if (type && LANDLINE_TYPES.has(type)) return 'landline';
  // FIXED_LINE_OR_MOBILE (ranges some countries don't split), VOIP, unparsable.
  return 'unknown';
}

/**
 * Normalize a phone to the WhatsApp "to" address: E.164 digits with no '+'.
 * Returns null when the number can't be parsed to a valid international number.
 */
export function toWhatsAppAddress(phone: string | null | undefined, countryCode?: string | null): string | null {
  if (!phone?.trim()) return null;
  const parsed = parsePhoneNumberFromString(phone, (countryCode?.toUpperCase() || undefined) as CountryCode | undefined);
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number.replace(/^\+/, ''); // E.164 without the leading '+'
}
