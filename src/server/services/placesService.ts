// Google Places API (New) client — raw REST.
// Why raw REST and not the official SDK:
//   - The SDK has a documented pagination gap with nextPageToken on searchText.
//   - We need surgical control over the X-Goog-FieldMask to keep costs in the
//     Pro tier (vs. Enterprise) and to add Arabic-language queries.
//
// Pricing model (2026):
//   - Text Search Pro (id+name+address+primaryType+businessStatus): ~$32/1k,
//     5,000 free events / month.
//   - Place Details Enterprise (phone+website+hours+...):           ~$20/1k,
//     1,000 free events / month.

import { getSetting } from './settingsService.js';
import { recordOrThrow } from './quotaService.js';
import { logger } from '../logger.js';

const BASE = 'https://places.googleapis.com/v1';

// Field masks tuned for cost — keep discovery in Pro, enrichment in Enterprise.
const DISCOVERY_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.primaryType',
  'places.types',
  'places.businessStatus',
  'places.rating',
  'places.userRatingCount',
  'nextPageToken',
].join(',');

const ENRICHMENT_MASK = [
  'id',
  'displayName',
  'formattedAddress',
  'addressComponents',
  'internationalPhoneNumber',
  'nationalPhoneNumber',
  'websiteUri',
  'googleMapsUri',
  'businessStatus',
  'rating',
  'userRatingCount',
  'regularOpeningHours',
  'primaryType',
  'types',
  'location',
].join(',');

export type PlaceDiscoveryResult = {
  id: string;
  name: string;
  formattedAddress: string | null;
  primaryType: string | null;
  types: string[];
  businessStatus: string | null;
  rating: number | null;
  userRatingCount: number | null;
  location: { latitude: number; longitude: number } | null;
};

export type PlaceDetails = {
  id: string;
  name: string;
  formattedAddress: string | null;
  city: string | null;
  countryCode: string | null;
  internationalPhoneNumber: string | null;
  nationalPhoneNumber: string | null;
  websiteUri: string | null;
  googleMapsUri: string | null;
  businessStatus: string | null;
  rating: number | null;
  userRatingCount: number | null;
  regularOpeningHours: string[] | null;
  primaryType: string | null;
  types: string[];
  location: { latitude: number; longitude: number } | null;
  raw: unknown;
};

async function getApiKey(): Promise<string> {
  const { value } = await getSetting('GOOGLE_PLACES_API_KEY');
  if (!value) {
    throw new Error('GOOGLE_PLACES_API_KEY not configured — set it in Settings.');
  }
  return value;
}

type RawSearchResponse = {
  places?: Array<{
    id?: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    primaryType?: string;
    types?: string[];
    businessStatus?: string;
    rating?: number;
    userRatingCount?: number;
    location?: { latitude?: number; longitude?: number };
  }>;
  nextPageToken?: string;
};

/**
 * Run ONE searchText query. Returns the page of results plus a token to
 * continue. Loop until no nextPageToken or cap reached.
 */
export async function searchText(args: {
  query: string;
  locationBias?: { lat: number; lng: number; radius: number };
  pageToken?: string;
  languageCode?: string;
  regionCode?: string;
  pageSize?: number;
}): Promise<{ results: PlaceDiscoveryResult[]; nextPageToken?: string }> {
  const key = await getApiKey();
  const body: Record<string, unknown> = {
    textQuery: args.query,
    pageSize: args.pageSize ?? 20,
    languageCode: args.languageCode ?? 'en',
  };
  if (args.regionCode) body.regionCode = args.regionCode;
  if (args.locationBias) {
    body.locationBias = {
      circle: {
        center: { latitude: args.locationBias.lat, longitude: args.locationBias.lng },
        radius: args.locationBias.radius,
      },
    };
  }
  if (args.pageToken) body.pageToken = args.pageToken;

  const res = await fetch(`${BASE}/places:searchText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': DISCOVERY_MASK,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Places searchText ${res.status}: ${txt.slice(0, 240)}`);
  }

  const data = (await res.json()) as RawSearchResponse;
  const places = (data.places ?? []).map((p): PlaceDiscoveryResult => ({
    id: p.id ?? '',
    name: p.displayName?.text ?? '',
    formattedAddress: p.formattedAddress ?? null,
    primaryType: p.primaryType ?? null,
    types: Array.isArray(p.types) ? p.types : [],
    businessStatus: p.businessStatus ?? null,
    rating: typeof p.rating === 'number' ? p.rating : null,
    userRatingCount: typeof p.userRatingCount === 'number' ? p.userRatingCount : null,
    location: p.location?.latitude != null && p.location?.longitude != null
      ? { latitude: p.location.latitude, longitude: p.location.longitude }
      : null,
  }));

  return { results: places.filter((p) => p.id), nextPageToken: data.nextPageToken };
}

type RawDetailsResponse = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  addressComponents?: Array<{ shortText?: string; longText?: string; types?: string[] }>;
  internationalPhoneNumber?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  businessStatus?: string;
  rating?: number;
  userRatingCount?: number;
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  primaryType?: string;
  types?: string[];
  location?: { latitude?: number; longitude?: number };
};

/** Fetch full details for one place — call only for IDs we want to keep. */
export async function getPlaceDetails(placeId: string): Promise<PlaceDetails> {
  const key = await getApiKey();
  // Quota guard for the Enterprise SKU (1k free/mo).
  await recordOrThrow('place_details');

  const res = await fetch(`${BASE}/places/${encodeURIComponent(placeId)}`, {
    method: 'GET',
    headers: {
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': ENRICHMENT_MASK,
    },
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Places details ${res.status}: ${txt.slice(0, 240)}`);
  }

  const d = (await res.json()) as RawDetailsResponse;
  const components = d.addressComponents ?? [];
  const city = components.find((c) => c.types?.includes('locality'))?.longText ?? null;
  const countryComp = components.find((c) => c.types?.includes('country'));
  const countryCode = countryComp?.shortText?.toLowerCase() ?? null;

  return {
    id: d.id ?? placeId,
    name: d.displayName?.text ?? '',
    formattedAddress: d.formattedAddress ?? null,
    city,
    countryCode,
    internationalPhoneNumber: d.internationalPhoneNumber ?? null,
    nationalPhoneNumber: d.nationalPhoneNumber ?? null,
    websiteUri: d.websiteUri ?? null,
    googleMapsUri: d.googleMapsUri ?? null,
    businessStatus: d.businessStatus ?? null,
    rating: typeof d.rating === 'number' ? d.rating : null,
    userRatingCount: typeof d.userRatingCount === 'number' ? d.userRatingCount : null,
    regularOpeningHours: d.regularOpeningHours?.weekdayDescriptions ?? null,
    primaryType: d.primaryType ?? null,
    types: Array.isArray(d.types) ? d.types : [],
    location: d.location?.latitude != null && d.location?.longitude != null
      ? { latitude: d.location.latitude, longitude: d.location.longitude }
      : null,
    raw: d,
  };
}

/** Lightweight ping so the Settings UI can show a "Test connection" status. */
export async function testApiKey(key: string): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch(`${BASE}/places:searchText`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'places.id',
      },
      body: JSON.stringify({ textQuery: 'recruitment agencies Dubai', pageSize: 1 }),
    });
    if (res.ok) return { ok: true, message: 'OK' };
    const body = await res.text();
    return { ok: false, message: `HTTP ${res.status}: ${body.slice(0, 180)}` };
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'places_test_failed');
    return { ok: false, message: err instanceof Error ? err.message : 'unknown' };
  }
}
