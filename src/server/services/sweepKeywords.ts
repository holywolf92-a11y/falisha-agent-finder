// Local-language search terms + big-city district tiling for agency sweeps.
//
// Why: sweeps used ONE English phrase ("recruitment agency") everywhere, plus
// Arabic terms even in Serbia/Türkiye. Local agencies describe themselves in
// their own language (özel istihdam bürosu, agencija za zapošljavanje …), and
// Google returns at most 60 places per search, so one query per big city
// (İstanbul, Belgrade) silently drops everything after result 60.
//
// `language` is passed to Places as languageCode (it shapes how names come back).

export type Term = { keyword: string; language: string };

const en = (...k: string[]): Term[] => k.map((keyword) => ({ keyword, language: 'en' }));
const L = (language: string, ...k: string[]): Term[] => k.map((keyword) => ({ keyword, language }));

const GULF: Term[] = [
  ...en('recruitment agency', 'manpower agency', 'employment agency', 'labour supply company'),
  ...L('ar', 'مكتب استقدام', 'شركة توظيف', 'توريد عمالة'),
];
const RUSSIAN: Term[] = [
  ...en('recruitment agency'),
  ...L('ru', 'кадровое агентство', 'агентство по трудоустройству', 'подбор персонала', 'трудоустройство за рубежом'),
];
const FRENCH_AFRICA: Term[] = [
  ...en('recruitment agency'),
  ...L('fr', 'agence de recrutement', 'agence de placement', 'cabinet de recrutement', 'agence d\'intérim'),
];

export const LOCAL_TERMS: Record<string, Term[]> = {
  TR: [
    ...L('tr', 'özel istihdam bürosu', 'insan kaynakları danışmanlık', 'personel temin şirketi',
      'yurt dışı iş bulma', 'eleman bulma ajansı', 'işçi temini'),
    ...en('recruitment agency'),
  ],
  RS: [
    ...L('sr', 'agencija za zapošljavanje', 'agencija za zapošljavanje u inostranstvu', 'agencija za privremeno zapošljavanje',
      'posredovanje u zapošljavanju', 'HR agencija', 'omladinska zadruga', 'агенција за запошљавање'),
    ...en('recruitment agency'),
  ],
  BA: [...L('bs', 'agencija za zapošljavanje', 'agencija za posredovanje u zapošljavanju', 'HR agencija'), ...en('recruitment agency')],
  XK: [...L('sq', 'agjenci punësimi', 'agjenci rekrutimi'), ...en('recruitment agency', 'employment agency')],
  AL: [...L('sq', 'agjenci punësimi', 'agjenci rekrutimi', 'punësim jashtë vendit'), ...en('recruitment agency')],
  MK: [...L('mk', 'агенција за вработување', 'агенција за привремени вработувања', 'agencija za vrabotuvanje'), ...en('recruitment agency')],
  RO: [...L('ro', 'agenție de recrutare', 'agenție de plasare forță de muncă', 'agenție de muncă temporară', 'recrutare personal'), ...en('recruitment agency')],
  MD: [...L('ro', 'agenție de recrutare', 'agenție de ocupare a forței de muncă'), ...L('ru', 'кадровое агентство'), ...en('recruitment agency')],
  BG: [...L('bg', 'агенция за подбор на персонал', 'агенция по заетостта', 'агенция за временна заетост', 'агенция за работа в чужбина'), ...en('recruitment agency')],
  GR: [...L('el', 'γραφείο ευρέσεως εργασίας', 'εταιρεία προσωρινής απασχόλησης', 'εταιρεία εύρεσης προσωπικού'), ...en('recruitment agency')],
  CY: [...en('recruitment agency', 'employment agency'), ...L('el', 'γραφείο ευρέσεως εργασίας'), ...L('tr', 'özel istihdam bürosu', 'insan kaynakları')],
  IT: [...L('it', 'agenzia per il lavoro', 'agenzia di reclutamento personale', 'agenzia interinale', 'ricerca e selezione personale'), ...en('recruitment agency')],
  ES: [...L('es', 'agencia de colocación', 'empresa de trabajo temporal', 'agencia de reclutamiento', 'selección de personal'), ...en('recruitment agency')],
  DE: [...L('de', 'Personalvermittlung', 'Zeitarbeitsfirma', 'Personaldienstleister', 'Arbeitsvermittlung'), ...en('recruitment agency')],
  LV: [...L('lv', 'personāla atlases aģentūra', 'personāla atlase', 'darbā iekārtošana'), ...L('ru', 'кадровое агентство'), ...en('recruitment agency')],
  RU: RUSSIAN, BY: RUSSIAN, KZ: RUSSIAN, KG: RUSSIAN, UZ: RUSSIAN,
  MY: [...L('ms', 'agensi pekerjaan', 'agensi pekerjaan swasta'), ...en('recruitment agency', 'manpower agency')],
  MV: en('recruitment agency', 'employment agency', 'manpower agency'),
  CA: [...en('recruitment agency', 'staffing agency', 'employment agency'), ...L('fr', 'agence de recrutement', 'agence de placement')],
  ZA: en('recruitment agency', 'labour broker', 'staffing agency', 'employment agency'),
  AE: GULF, SA: GULF, QA: GULF, KW: GULF, BH: GULF, OM: GULF,
  IQ: GULF, JO: GULF, LY: [...L('ar', 'مكتب استقدام', 'شركة توظيف'), ...en('recruitment agency')],
  LB: [...en('recruitment agency'), ...L('ar', 'مكتب استقدام', 'مكتب توظيف'), ...L('fr', 'agence de recrutement')],
  DJ: FRENCH_AFRICA, CD: FRENCH_AFRICA, CG: FRENCH_AFRICA,
};

/** Search terms for a country: its local pack, or English as a fallback. */
export function termsFor(code: string): Term[] {
  return LOCAL_TERMS[(code || '').toUpperCase()] ?? en('recruitment agency');
}

// Big cities searched district-by-district on top of the city-level search, so
// results beyond Google's 60-per-search cap are reached. Label = "district city".
export const DISTRICTS: Record<string, Array<{ city: string; districts: string[] }>> = {
  TR: [
    { city: 'İstanbul', districts: ['Arnavutköy', 'Ataşehir', 'Avcılar', 'Bağcılar', 'Bahçelievler', 'Bakırköy', 'Başakşehir',
      'Bayrampaşa', 'Beşiktaş', 'Beykoz', 'Beylikdüzü', 'Beyoğlu', 'Büyükçekmece', 'Çekmeköy', 'Esenler', 'Esenyurt',
      'Eyüpsultan', 'Fatih', 'Gaziosmanpaşa', 'Güngören', 'Kadıköy', 'Kağıthane', 'Kartal', 'Küçükçekmece', 'Maltepe',
      'Pendik', 'Sancaktepe', 'Sarıyer', 'Silivri', 'Sultanbeyli', 'Sultangazi', 'Şişli', 'Tuzla', 'Ümraniye', 'Üsküdar', 'Zeytinburnu'] },
    { city: 'Ankara', districts: ['Çankaya', 'Keçiören', 'Yenimahalle', 'Mamak', 'Etimesgut', 'Sincan', 'Altındağ', 'Pursaklar', 'Gölbaşı'] },
    { city: 'İzmir', districts: ['Konak', 'Karşıyaka', 'Bornova', 'Buca', 'Bayraklı', 'Çiğli', 'Gaziemir', 'Karabağlar', 'Torbalı', 'Menemen'] },
    { city: 'Bursa', districts: ['Osmangazi', 'Nilüfer', 'Yıldırım', 'İnegöl', 'Gemlik'] },
    { city: 'Antalya', districts: ['Muratpaşa', 'Kepez', 'Konyaaltı', 'Alanya', 'Manavgat'] },
    { city: 'Kocaeli', districts: ['İzmit', 'Gebze', 'Darıca', 'Körfez'] },
  ],
  RS: [
    { city: 'Beograd', districts: ['Novi Beograd', 'Zemun', 'Vračar', 'Stari Grad', 'Savski Venac', 'Zvezdara',
      'Voždovac', 'Čukarica', 'Palilula', 'Rakovica'] },
  ],
  AE: [
    { city: 'Dubai', districts: ['Deira', 'Bur Dubai', 'Al Karama', 'Al Qusais', 'Business Bay', 'Jebel Ali', 'Al Barsha', 'Dubai Silicon Oasis'] },
  ],
  SA: [
    { city: 'Riyadh', districts: ['Al Olaya', 'Al Malaz', 'Al Sulaimaniyah', 'Al Naseem', 'Al Rawdah', 'Al Batha'] },
    { city: 'Jeddah', districts: ['Al Hamra', 'Al Rawdah', 'Al Aziziyah', 'Al Balad', 'Al Safa'] },
  ],
};

export function districtLabelsFor(code: string): string[] {
  return (DISTRICTS[(code || '').toUpperCase()] ?? []).flatMap((c) => c.districts.map((d) => `${d} ${c.city}`));
}
