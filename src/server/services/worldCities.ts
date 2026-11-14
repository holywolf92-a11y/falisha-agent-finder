// Country + major-city catalogue for sweeps. Lets a sweep tile across a country's
// cities by putting the city name in the Places text query (+ regionCode) — no
// per-city coordinates needed (unlike the legacy SEED_CITIES locationBias grid).
// Covers the recruitment corridors Falisha works (Gulf/MENA destinations +
// Europe + South/SE Asia + Africa source markets). Any country not listed can
// still be swept at country level (single query); add cities here to tile it.

export interface CountryOption {
  code: string; // ISO 3166-1 alpha-2 (upper)
  name: string;
  flag: string;
}

// Major cities per country. Order: biggest/most-relevant first.
export const WORLD_CITIES: Record<string, string[]> = {
  // ── Gulf / MENA (destinations) ──
  AE: ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Al Ain', 'Ras Al Khaimah', 'Fujairah', 'Umm Al Quwain'],
  SA: ['Riyadh', 'Jeddah', 'Dammam', 'Mecca', 'Medina', 'Khobar', 'Tabuk', 'Buraidah', 'Abha', 'Jubail', 'Yanbu', 'Hail'],
  QA: ['Doha', 'Al Rayyan', 'Al Wakrah', 'Al Khor'],
  KW: ['Kuwait City', 'Hawalli', 'Salmiya', 'Al Ahmadi', 'Jahra'],
  BH: ['Manama', 'Riffa', 'Muharraq', 'Isa Town'],
  OM: ['Muscat', 'Salalah', 'Sohar', 'Nizwa', 'Sur'],
  JO: ['Amman', 'Zarqa', 'Irbid', 'Aqaba'],
  LB: ['Beirut', 'Tripoli', 'Sidon', 'Zahle'],
  IQ: ['Baghdad', 'Basra', 'Erbil', 'Mosul', 'Najaf', 'Sulaymaniyah', 'Karbala', 'Kirkuk', 'Duhok'],
  LY: ['Tripoli', 'Benghazi', 'Misrata', 'Zawiya'],
  EG: ['Cairo', 'Alexandria', 'Giza', 'Port Said', 'Mansoura'],
  // ── Europe (destinations + agencies) ──
  // Türkiye: all 81 provinces, most populous first. İstanbul/Ankara/İzmir/Bursa/Antalya/Kocaeli are
  // also split into districts in sweepKeywords.ts (Google caps one search at 60 results).
  TR: ['İstanbul', 'Ankara', 'İzmir', 'Bursa', 'Antalya', 'Konya', 'Adana', 'Şanlıurfa', 'Gaziantep', 'Kocaeli',
       'Mersin', 'Diyarbakır', 'Hatay', 'Manisa', 'Kayseri', 'Samsun', 'Balıkesir', 'Kahramanmaraş', 'Van', 'Aydın',
       'Tekirdağ', 'Sakarya', 'Denizli', 'Muğla', 'Eskişehir', 'Mardin', 'Malatya', 'Trabzon', 'Erzurum', 'Ordu',
       'Afyonkarahisar', 'Sivas', 'Adıyaman', 'Tokat', 'Zonguldak', 'Elazığ', 'Batman', 'Kütahya', 'Çorum', 'Osmaniye',
       'Çanakkale', 'Isparta', 'Şırnak', 'Giresun', 'Aksaray', 'Yozgat', 'Edirne', 'Düzce', 'Kastamonu', 'Uşak',
       'Niğde', 'Kırklareli', 'Rize', 'Siirt', 'Amasya', 'Bolu', 'Nevşehir', 'Bitlis', 'Hakkari', 'Muş',
       'Kırıkkale', 'Karaman', 'Burdur', 'Yalova', 'Karabük', 'Kırşehir', 'Bingöl', 'Erzincan', 'Bilecik', 'Sinop',
       'Bartın', 'Iğdır', 'Çankırı', 'Artvin', 'Gümüşhane', 'Kilis', 'Ağrı', 'Ardahan', 'Tunceli', 'Bayburt', 'Kars'],
  RS: ['Beograd', 'Novi Sad', 'Niš', 'Kragujevac', 'Subotica', 'Zrenjanin', 'Pančevo', 'Čačak', 'Novi Pazar', 'Kraljevo',
       'Smederevo', 'Leskovac', 'Valjevo', 'Kruševac', 'Vranje', 'Šabac', 'Užice', 'Sombor', 'Požarevac', 'Pirot',
       'Kikinda', 'Zaječar', 'Sremska Mitrovica', 'Jagodina', 'Vršac', 'Bor', 'Loznica', 'Prokuplje'],
  XK: ['Prishtina', 'Prizren', 'Peja', 'Gjakova', 'Mitrovica', 'Ferizaj', 'Gjilan'],
  MK: ['Skopje', 'Bitola', 'Kumanovo', 'Tetovo', 'Ohrid', 'Prilep', 'Štip', 'Veles'],
  BA: ['Sarajevo', 'Banja Luka', 'Tuzla', 'Zenica', 'Mostar', 'Bihać', 'Brčko', 'Doboj', 'Bijeljina'],
  MD: ['Chișinău', 'Bălți', 'Tiraspol', 'Cahul', 'Ungheni', 'Orhei'],
  LV: ['Riga', 'Daugavpils', 'Liepāja', 'Jelgava', 'Jūrmala', 'Ventspils', 'Rēzekne'],
  BY: ['Minsk', 'Gomel', 'Mogilev', 'Vitebsk', 'Grodno', 'Brest'],
  RU: ['Moscow', 'Saint Petersburg', 'Novosibirsk', 'Yekaterinburg', 'Kazan', 'Nizhny Novgorod', 'Krasnodar', 'Rostov-on-Don', 'Samara', 'Chelyabinsk'],
  RO: ['Bucharest', 'Cluj-Napoca', 'Timisoara', 'Iasi', 'Constanta', 'Brasov', 'Craiova', 'Galati', 'Ploiesti', 'Oradea', 'Arad', 'Sibiu', 'Bacau', 'Pitesti', 'Suceava'],
  PL: ['Warsaw', 'Krakow', 'Wroclaw', 'Poznan', 'Gdansk', 'Lodz'],
  HR: ['Zagreb', 'Split', 'Rijeka', 'Osijek'],
  DE: ['Berlin', 'Munich', 'Frankfurt', 'Hamburg', 'Cologne', 'Stuttgart', 'Dusseldorf', 'Dortmund', 'Essen', 'Leipzig', 'Bremen', 'Dresden', 'Hanover', 'Nuremberg', 'Duisburg'],
  GB: ['London', 'Manchester', 'Birmingham', 'Leeds', 'Glasgow', 'Bristol'],
  IT: ['Rome', 'Milan', 'Naples', 'Turin', 'Palermo', 'Genoa', 'Bologna', 'Florence', 'Bari', 'Catania', 'Venice', 'Verona', 'Brescia', 'Padua'],
  ES: ['Madrid', 'Barcelona', 'Valencia', 'Seville', 'Malaga', 'Zaragoza', 'Murcia', 'Palma', 'Bilbao', 'Alicante', 'Valladolid', 'Almeria', 'Las Palmas'],
  PT: ['Lisbon', 'Porto', 'Braga', 'Faro'],
  // Cyprus incl. the north (Lefkoşa / Girne / Gazimağusa / Güzelyurt) — Turkish terms are in the CY term pack.
  CY: ['Nicosia', 'Limassol', 'Larnaca', 'Paphos', 'Famagusta', 'Lefkoşa', 'Girne', 'Gazimağusa', 'Güzelyurt'],
  GR: ['Athens', 'Thessaloniki', 'Patras', 'Piraeus', 'Heraklion', 'Larissa', 'Volos', 'Ioannina', 'Kavala', 'Chania'],
  HU: ['Budapest', 'Debrecen', 'Szeged'],
  BG: ['Sofia', 'Plovdiv', 'Varna', 'Burgas', 'Ruse', 'Stara Zagora', 'Pleven', 'Sliven', 'Dobrich', 'Shumen', 'Pernik', 'Blagoevgrad'],
  CZ: ['Prague', 'Brno', 'Ostrava'],
  NL: ['Amsterdam', 'Rotterdam', 'The Hague', 'Eindhoven'],
  MT: ['Valletta', 'Birkirkara', 'Sliema'],
  AL: ['Tirana', 'Durrës', 'Vlorë', 'Elbasan', 'Shkodër', 'Fier', 'Korçë', 'Berat'],
  // ── South / SE / Central Asia (source markets) ──
  PK: ['Karachi', 'Lahore', 'Islamabad', 'Rawalpindi', 'Faisalabad', 'Multan', 'Peshawar', 'Gujranwala', 'Sialkot', 'Quetta'],
  IN: ['Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Chennai', 'Kolkata', 'Kochi', 'Pune', 'Ahmedabad'],
  BD: ['Dhaka', 'Chittagong', 'Khulna', 'Sylhet', 'Rajshahi'],
  NP: ['Kathmandu', 'Pokhara', 'Biratnagar', 'Lalitpur'],
  LK: ['Colombo', 'Kandy', 'Galle', 'Jaffna'],
  PH: ['Manila', 'Quezon City', 'Cebu', 'Davao', 'Makati'],
  ID: ['Jakarta', 'Surabaya', 'Bandung', 'Medan', 'Semarang'],
  MY: ['Kuala Lumpur', 'Petaling Jaya', 'Shah Alam', 'Klang', 'George Town', 'Johor Bahru', 'Ipoh', 'Seremban', 'Kuching', 'Kota Kinabalu', 'Malacca'],
  SG: ['Singapore'],
  VN: ['Hanoi', 'Ho Chi Minh City', 'Da Nang'],
  TH: ['Bangkok', 'Chiang Mai', 'Pattaya'],
  UZ: ['Tashkent', 'Samarkand', 'Bukhara', 'Namangan', 'Andijan', 'Fergana', 'Nukus', 'Qarshi'],
  KZ: ['Almaty', 'Astana', 'Shymkent', 'Karaganda', 'Aktobe', 'Taraz', 'Pavlodar', 'Atyrau'],
  KG: ['Bishkek', 'Osh', 'Jalal-Abad', 'Karakol'],
  CN: ['Beijing', 'Shanghai', 'Guangzhou', 'Shenzhen'],
  // ── Africa (source markets) ──
  KE: ['Nairobi', 'Mombasa', 'Kisumu', 'Nakuru'],
  NG: ['Lagos', 'Abuja', 'Kano', 'Ibadan', 'Port Harcourt'],
  UG: ['Kampala', 'Entebbe', 'Jinja'],
  GH: ['Accra', 'Kumasi', 'Tamale'],
  TZ: ['Dar es Salaam', 'Dodoma', 'Arusha'],
  ET: ['Addis Ababa', 'Dire Dawa'],
  MA: ['Casablanca', 'Rabat', 'Marrakesh', 'Tangier', 'Fes'],
  TN: ['Tunis', 'Sfax', 'Sousse'],
  ZA: ['Johannesburg', 'Cape Town', 'Durban', 'Pretoria', 'Port Elizabeth', 'Bloemfontein', 'East London', 'Polokwane', 'Nelspruit', 'Kimberley'],
  CD: ['Kinshasa', 'Lubumbashi', 'Mbuji-Mayi', 'Kisangani', 'Goma'],
  CG: ['Brazzaville', 'Pointe-Noire'],
  DJ: ['Djibouti'],
  // ── North America ──
  CA: ['Toronto', 'Montreal', 'Vancouver', 'Calgary', 'Edmonton', 'Ottawa', 'Winnipeg', 'Mississauga', 'Brampton', 'Hamilton', 'Quebec City', 'Surrey', 'Halifax', 'Saskatoon', 'Regina'],
  // ── Maldives ──
  MV: ['Male', 'Hulhumale', 'Addu City', 'Fuvahmulah', 'Kulhudhuffushi'],
};

// Dropdown list — every country we can sweep (those with cities tile; others run
// one country-level query). Keep alphabetical-ish within regions for the UI.
export const SWEEP_COUNTRIES: CountryOption[] = [
  { code: 'AE', name: 'United Arab Emirates', flag: '🇦🇪' },
  { code: 'SA', name: 'Saudi Arabia', flag: '🇸🇦' },
  { code: 'QA', name: 'Qatar', flag: '🇶🇦' },
  { code: 'KW', name: 'Kuwait', flag: '🇰🇼' },
  { code: 'BH', name: 'Bahrain', flag: '🇧🇭' },
  { code: 'OM', name: 'Oman', flag: '🇴🇲' },
  { code: 'JO', name: 'Jordan', flag: '🇯🇴' },
  { code: 'LB', name: 'Lebanon', flag: '🇱🇧' },
  { code: 'IQ', name: 'Iraq', flag: '🇮🇶' },
  { code: 'LY', name: 'Libya', flag: '🇱🇾' },
  { code: 'EG', name: 'Egypt', flag: '🇪🇬' },
  { code: 'TR', name: 'Turkey', flag: '🇹🇷' },
  { code: 'RS', name: 'Serbia', flag: '🇷🇸' },
  { code: 'RO', name: 'Romania', flag: '🇷🇴' },
  { code: 'PL', name: 'Poland', flag: '🇵🇱' },
  { code: 'HR', name: 'Croatia', flag: '🇭🇷' },
  { code: 'DE', name: 'Germany', flag: '🇩🇪' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧' },
  { code: 'IT', name: 'Italy', flag: '🇮🇹' },
  { code: 'ES', name: 'Spain', flag: '🇪🇸' },
  { code: 'PT', name: 'Portugal', flag: '🇵🇹' },
  { code: 'CY', name: 'Cyprus', flag: '🇨🇾' },
  { code: 'GR', name: 'Greece', flag: '🇬🇷' },
  { code: 'HU', name: 'Hungary', flag: '🇭🇺' },
  { code: 'BG', name: 'Bulgaria', flag: '🇧🇬' },
  { code: 'CZ', name: 'Czechia', flag: '🇨🇿' },
  { code: 'NL', name: 'Netherlands', flag: '🇳🇱' },
  { code: 'MT', name: 'Malta', flag: '🇲🇹' },
  { code: 'AL', name: 'Albania', flag: '🇦🇱' },
  { code: 'XK', name: 'Kosovo', flag: '🇽🇰' },
  { code: 'MK', name: 'North Macedonia', flag: '🇲🇰' },
  { code: 'BA', name: 'Bosnia and Herzegovina', flag: '🇧🇦' },
  { code: 'MD', name: 'Moldova', flag: '🇲🇩' },
  { code: 'LV', name: 'Latvia', flag: '🇱🇻' },
  { code: 'BY', name: 'Belarus', flag: '🇧🇾' },
  { code: 'RU', name: 'Russia', flag: '🇷🇺' },
  { code: 'PK', name: 'Pakistan', flag: '🇵🇰' },
  { code: 'IN', name: 'India', flag: '🇮🇳' },
  { code: 'BD', name: 'Bangladesh', flag: '🇧🇩' },
  { code: 'NP', name: 'Nepal', flag: '🇳🇵' },
  { code: 'LK', name: 'Sri Lanka', flag: '🇱🇰' },
  { code: 'PH', name: 'Philippines', flag: '🇵🇭' },
  { code: 'ID', name: 'Indonesia', flag: '🇮🇩' },
  { code: 'MY', name: 'Malaysia', flag: '🇲🇾' },
  { code: 'SG', name: 'Singapore', flag: '🇸🇬' },
  { code: 'VN', name: 'Vietnam', flag: '🇻🇳' },
  { code: 'TH', name: 'Thailand', flag: '🇹🇭' },
  { code: 'UZ', name: 'Uzbekistan', flag: '🇺🇿' },
  { code: 'KZ', name: 'Kazakhstan', flag: '🇰🇿' },
  { code: 'KG', name: 'Kyrgyzstan', flag: '🇰🇬' },
  { code: 'CN', name: 'China', flag: '🇨🇳' },
  { code: 'KE', name: 'Kenya', flag: '🇰🇪' },
  { code: 'NG', name: 'Nigeria', flag: '🇳🇬' },
  { code: 'UG', name: 'Uganda', flag: '🇺🇬' },
  { code: 'GH', name: 'Ghana', flag: '🇬🇭' },
  { code: 'TZ', name: 'Tanzania', flag: '🇹🇿' },
  { code: 'ET', name: 'Ethiopia', flag: '🇪🇹' },
  { code: 'MA', name: 'Morocco', flag: '🇲🇦' },
  { code: 'TN', name: 'Tunisia', flag: '🇹🇳' },
  { code: 'ZA', name: 'South Africa', flag: '🇿🇦' },
  { code: 'CD', name: 'DR Congo', flag: '🇨🇩' },
  { code: 'CG', name: 'Congo (Brazzaville)', flag: '🇨🇬' },
  { code: 'DJ', name: 'Djibouti', flag: '🇩🇯' },
  { code: 'CA', name: 'Canada', flag: '🇨🇦' },
  { code: 'MV', name: 'Maldives', flag: '🇲🇻' },
];

export function citiesFor(code: string): string[] {
  return WORLD_CITIES[(code || '').toUpperCase()] ?? [];
}

export function countryName(code: string): string {
  const c = SWEEP_COUNTRIES.find((x) => x.code === (code || '').toUpperCase());
  return c?.name ?? (code || '').toUpperCase();
}
