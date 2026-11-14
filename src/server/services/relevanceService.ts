// Is this Google Maps result actually a recruitment / manpower agency?
//
// Google's `employment_agency` type is on only ~26% of real agencies (many are
// tagged just "service"/"consultant"), and text searches also return travel
// agencies, ministries, study-abroad consultants, shops… So we combine:
//   1. Google types           (employment_agency = strong yes; travel/store/… = strong no)
//   2. Name keywords          (EN / AR / TR / SR-Latin / SR-Cyrillic / RU)
//   3. Website domain keywords
//   4. Homepage text           (only for results still unclear after 1–3)
// Verdicts: 'recruitment' (keep) · 'not_recruitment' (hide) · 'review' (human check).

export type Verdict = 'recruitment' | 'not_recruitment' | 'review';
export type Classification = { verdict: Verdict; reason: string; pos: number; neg: number };

// toLowerCase('İ') → 'i' + U+0307 (combining dot) in JS; strip it so "İnsan" matches "insan".
const norm = (s: string) => s.toLowerCase().normalize('NFKC').replace(/̇/g, '');

// [pattern, weight] — matched against lowercased name (and homepage text).
const POSITIVE: Array<[RegExp, number]> = [
  // English
  [/recruit/, 3], [/man ?-?power/, 3], [/staffing/, 3], [/head ?hunt/, 3], [/human resource/, 3],
  [/employment (agency|agencies|bureau|services?|solutions?|office)/, 3], [/overseas employment/, 3],
  [/lab(ou|o)r (supply|supplier|services?|contract)/, 3], [/workforce/, 2], [/\bhr\b/, 2], [/\bhrd\b/, 2],
  [/placement/, 2], [/personnel/, 2], [/\bhiring\b|\bhire/, 2], [/\bjobs?\b/, 2], [/talent/, 2], [/\blab(ou|o)r\b/, 2],
  [/employment/, 2], [/outsourc/, 1], [/\bcareers?\b/, 1], [/\bvisa\b/, 0],
  // Arabic
  [/[اإأآ]ستقدام/, 3], [/توظيف/, 3],   // every alef spelling: استقدام / إستقدام / أستقدام [/عمالة|(^|\s)(ال)?عمال(\s|$)/, 3],   // not الاعمال = "business" [/الأيدي العامل|الايدي العامل/, 3], [/موارد بشرية|الموارد البشرية/, 3],
  [/توريد/, 1], [/تشغيل/, 1],
  // Turkish
  [/insan kay?a?nak/, 3], [/istihdam/, 3], [/işe alım|ise alim/, 3], [/iş bulma|is bulma/, 3], [/yurt ?dışı iş\b|yurtdisi is\b/, 3],
  [/personel/, 2], [/eleman/, 2], [/işçi|isci/, 2], [/işgücü|isgucu/, 2], [/bakıcı|bakici/, 2], [/kariyer/, 1],
  // Serbian (Latin + Cyrillic)
  [/zapošlj|zaposlj|запошљ/, 3], [/regrut|регрут/, 3], [/ljudsk\S* resurs|људск\S* ресурс/, 3],
  [/radn\S* snag|радн\S* снаг/, 3], [/rad u inostranstv|рад у иностранств/, 3],
  [/posredovanj|посредовањ/, 2], [/kadrov|кадров/, 2], [/\bposao\b|\bposlovi\b|посао|послови/, 1],
  // Russian (Central Asia / Belarus markets)
  [/кадров|персонал|трудоустрой|рекрут|подбор персонала/, 3], [/вакансии|работа за рубежом/, 2],
];

const NEGATIVE: Array<[RegExp, number]> = [
  // travel / hospitality
  [/\btravel|\btour(s|ism)?\b|turizm|turist|turističk|туризм|туристич/, 3], [/\bhotel|\botel\b|resort|hostel|apartman|apartment/, 3],
  [/restaurant|restoran|\bcafe\b|café|kafana|coffee|ресторан/, 3],
  // education / study abroad
  [/school|okul|kolej|akademi|academy|škola|школа/, 3], [/eğitim|egitim|education|obrazovanj|образовањ|образован/, 3],
  [/study abroad|yurt ?dışı eğitim|yurtdisi egitim|student|öğrenci|ogrenci|studen/, 3], [/universit|üniversite/, 3],
  // property / retail / services that are not recruitment
  [/real estate|realty|emlak|nekretnin|некретнин|недвижим|property|properties/, 3], [/rent ?a ?car|rentals?\b|kiralama/, 3],
  [/furniture|mobilya|namešt|намешт|\bmarket\b|supermarket|mağaza|prodavnic|продавниц|\bstore\b|\bshop\b/, 3],
  [/\bbebe\b|\bbaby\b|oprema za bebe/, 3], [/servis računar|servis racunar|računar|racunar|computer|рачунар/, 3],
  [/clinic|klinik|hospital|hastane|medical|dental|pharmac|eczane|apoteka|болниц|клиник/, 3],
  [/\bbank\b|banka\b|insurance|sigorta|osiguran|осигуран/, 3], [/translat|tercüme|tercume|çeviri|prevod|превод/, 3],
  [/law firm|\blawyer|avukat|advokat|адвокат|accounting|muhasebe|računovod|рачуновод|\baudit|\btax\b/, 3],
  [/reklam|advertis|marketing|creative writing|printing|matbaa|štampa/, 3], [/software|yazılım|yazilim|softver|\bit solutions/, 2],
  [/cargo|kargo|courier|shipping|freight|nakliyat|selidb/, 2], [/beauty|salon|\bspa\b|barber|kuaför|kuafor|gym|fitness/, 3],
  [/\bcar\b|\bauto\b|otomotiv|\boto\b/, 2], [/wedding|düğün|\bevents?\b|organizasyon/, 2], [/cruise|bosphorus|night show|marina|yacht/, 3],
  // public bodies (not partner agencies)
  [/municipal|belediye|opštin|opstin|општин|council|city hall|ministry|bakanlığ|bakanlig|ministarstv|министарств|وزارة|بلدية|embassy|consulate|konsolosluk|ambasad|амбасад/, 3],
  [/su ve kanalizasyon|water (and|&) sewer|vodovod|водовод/, 3],
];

// Google types (places.types / primaryType) that are never a recruitment agency.
const NEG_TYPES: Record<string, number> = {
  travel_agency: 3, tour_agency: 3, tourist_information_center: 3, lodging: 3, hotel: 3, guest_house: 3,
  private_guest_room: 3, restaurant: 3, family_restaurant: 3, western_restaurant: 3, cafe: 3, food: 2,
  store: 2, clothing_store: 3, furniture_store: 3, electronics_store: 3, hardware_store: 3, home_goods_store: 3,
  home_improvement_store: 3, supermarket: 3, food_store: 3, car_dealer: 3, gas_station: 3, real_estate_agency: 3,
  bank: 3, insurance_agency: 3, accounting: 3, lawyer: 3, school: 3, university: 3, educational_institution: 2,
  hospital: 3, medical_clinic: 3, medical_center: 3, health: 2, beauty_salon: 3, barber_shop: 3, massage_spa: 3,
  marina: 3, ferry_service: 3, international_airport: 3, airport_shuttle_service: 3, casino: 3, post_office: 3,
  courier_service: 3, moving_company: 3, laundry: 3, tailor: 3, sports_activity_location: 3,
  government_office: 2, local_government_office: 3, city_hall: 3, wholesaler: 2, manufacturer: 2, supplier: 2,
  marketing_consultant: 2, telecommunications_service_provider: 3, coworking_space: 3, business_center: 2,
  general_contractor: 1, transportation_service: 1, apartment_building: 1, premise: 1, street_address: 1,
};

const DOMAIN_POS = /recruit|manpower|staffing|\bhr|hr\b|jobs?|career|employ|workforce|labou?r|talent|istihdam|insankaynak|zaposl|kadrov|regrut|personel|eleman/;

function score(text: string, table: Array<[RegExp, number]>): { total: number; hits: string[] } {
  let total = 0; const hits: string[] = [];
  for (const [re, w] of table) {
    const m = text.match(re);
    if (m && w > 0) { total += w; hits.push(m[0]); }
  }
  return { total, hits };
}

// State / municipal employment services. Their names are full of recruitment words
// ("Nacionalna služba za zapošljavanje", "İŞKUR", "Agentur für Arbeit") but they are
// public bodies, not private agencies we can partner with — always hidden.
const PUBLIC_EMPLOYMENT = /nacionaln\S* služb\S* za zapošlj|nacionaln\S* sluzb\S* za zaposlj|национал\S* служб\S* за запошљ|državn\S* služb\S* za zapošlj|државн\S* служб\S* за запошљ|biro za nezaposlen|zavod za zapošljavanje|завод за запошљавање|\bnsz\b|işkur|iskur|türkiye iş kurumu|turkiye is kurumu|\bibb\b|istihdam ofisi|belediye\S* istihdam|agentur für arbeit|agentur fur arbeit|jobcenter|anofm|agenția (județeană|națională) pentru ocuparea|агенция по заетостта|služba za zapošljavanje|public employment service|government employment|مكتب العمل|وزارة العمل|وزارة الموارد البشرية|صندوق تنمية الموارد البشرية/;

/** Stage 1–3: name + Google types + website domain. Cheap, no network. */
export function classifyAgency(a: { name: string; google_categories?: string[] | null; category?: string | null; website?: string | null }): Classification {
  const name = norm(a.name || '');
  const pub = name.match(PUBLIC_EMPLOYMENT);
  if (pub) return { verdict: 'not_recruitment', reason: `public employment service: ${pub[0]}`, pos: 0, neg: 9 };
  const types = new Set([...(a.google_categories ?? []), ...(a.category ? [a.category] : [])]);
  const p = score(name, POSITIVE);
  const n = score(name, NEGATIVE);

  let pos = Math.min(p.total, 6);
  const reasons: string[] = [];
  if (p.hits.length) reasons.push(`name: ${p.hits.slice(0, 3).join(', ')}`);
  if (types.has('employment_agency')) { pos += 3; reasons.push('google: employment_agency'); }

  let host = '';
  try { host = a.website ? new URL(/^https?:/i.test(a.website) ? a.website : `https://${a.website}`).hostname.toLowerCase() : ''; } catch { host = ''; }
  if (host && DOMAIN_POS.test(host.replace(/^www\./, ''))) { pos += 2; reasons.push(`domain: ${host}`); }

  let typeNeg = 0; let typeNegName = '';
  for (const t of types) if ((NEG_TYPES[t] ?? 0) > typeNeg) { typeNeg = NEG_TYPES[t]; typeNegName = t; }
  const nameNeg = Math.min(n.total, 6);
  const neg = nameNeg + typeNeg;
  if (n.hits.length) reasons.push(`name says: ${n.hits.slice(0, 3).join(', ')}`);
  if (typeNeg) reasons.push(`google: ${typeNegName}`);

  const reason = reasons.join(' · ') || 'no signal';
  // A recruitment word in the name beats a noisy Google type (e.g. "EOS Manpower" tagged apartment_building),
  // but not a non-recruitment word in the name (e.g. "Career Escapes Yurtdışı Eğitim").
  if (pos >= 3 && nameNeg === 0) return { verdict: 'recruitment', reason, pos, neg };
  if (pos >= 3 && nameNeg > 0) return { verdict: 'review', reason, pos, neg };
  if (neg >= 3) return { verdict: 'not_recruitment', reason, pos, neg };
  return { verdict: 'review', reason, pos, neg };
}

// Terms that only a recruitment BUSINESS uses about itself. Generic corporate
// words ("careers", "jobs", "HR", "İnsan Kaynakları" menu links) don't count.
const STRONG: RegExp[] = [
  /recruit/, /man ?-?power/, /staffing/, /head ?hunt/, /executive search/, /employment agenc/, /overseas employment/,
  /lab(ou|o)r supply/, /[اإأآ]ستقدام/, /توظيف/, /عمالة/, /istihdam/, /işe alım|ise alim/, /zapošljavanj|zaposljavanj|запошљавањ/,
  /regrutacij|регрутациј/, /подбор персонала|кадровое агентство/,
];

/**
 * Stage 4: decide an unclear agency from its homepage text. Returns null if the
 * page can't be read. `priorPos` = positive score from stages 1–3: if the name,
 * Google type or domain already pointed to recruitment, the homepage may
 * confirm it but never hide it (agency homepages list the industries they
 * recruit FOR — hospitals, hotels, pharma — which look like negatives).
 */
export async function classifyByHomepage(website: string, priorPos = 0, timeoutMs = 9000): Promise<Classification | null> {
  const url = /^https?:/i.test(website) ? website : `https://${website}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal, redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FalishaAgentFinder/1.0; agency classification)', Accept: 'text/html' },
    });
    if (!res.ok || !(res.headers.get('content-type') || '').includes('html')) return null;
    const html = (await res.text()).slice(0, 250_000);
    const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').trim();
    const desc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i)?.[1] ?? '';
    const body = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const text = norm(`${title} ${desc} ${title} ${desc} ${body.slice(0, 20_000)}`);
    const p = score(text, POSITIVE);
    const n = score(text, NEGATIVE);
    const strong = STRONG.filter((re) => re.test(text)).length;
    const reason = `homepage: +[${p.hits.slice(0, 4).join(', ')}] −[${n.hits.slice(0, 4).join(', ')}] strong=${strong}`;
    if (strong >= 2 || (strong >= 1 && p.total >= 5)) return { verdict: 'recruitment', reason, pos: p.total, neg: n.total };
    // Hide only with ≥2 distinct non-recruitment signals: one stray word ("hospital"
    // on a Gulf "Management Consultancy" agency page) is not enough.
    if (priorPos === 0 && strong === 0 && p.total <= 1 && n.total >= 5) return { verdict: 'not_recruitment', reason, pos: p.total, neg: n.total };
    return { verdict: 'review', reason, pos: p.total, neg: n.total };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
