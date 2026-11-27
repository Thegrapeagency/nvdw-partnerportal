// Bibliotheek met standaard eventmaterialen voor de plattegrond-tekenaar.
// Maten zijn de gangbare verhuurmaten in meters (breedte x diepte).
// soort 'blok' = los object, soort 'lijn' = je tekent een lijn en de tool
// rekent uit hoeveel stuks erin passen (bouwhekken, dranghekken, rijplaten).
// Iconen: 24x24, lijnstijl, worden op schaal in het blok getekend.

export type Materiaal = {
  key: string
  label: string
  cat: string
  w: number
  h: number
  kleur: string
  icoon: string // SVG-inhoud in een 24x24 viewBox
  soort?: 'blok' | 'lijn' | 'route' // lijn = telt stuks, route = band met pijlen
  stuk?: number // lijn: lengte per stuk in meters
  breedte?: number // lijn: dikte van de lijn in meters
  rond?: boolean
  brand?: boolean   // brandrisico: hier hoort een blusser bij
  wc?: number       // aantal toiletplekken
  uitgang?: boolean // telt mee als (nood)uitgang, breedte = lange zijde
  tent?: { kort: string; breedtes: number[]; stap: number } // tenttype: je kiest zelf de maat
  oud?: boolean     // niet meer in de lijst, bestaat nog voor oude tekeningen
}

const I = {
  bolt: '<path d="M13 3L6 13h5l-1 8 7-11h-5z"/>',
  aggregaat: '<rect x="3" y="6" width="18" height="12" rx="1.5"/><path d="M13 8.5l-3 4h3.5l-2.5 3.5"/><path d="M6 18v2M18 18v2"/>',
  stroomkast: '<rect x="6" y="3" width="12" height="18" rx="1"/><path d="M13 7l-2.5 4h3l-2 4"/>',
  kabel: '<path d="M3 15l4-6h10l4 6z"/><path d="M8 12h8"/>',
  lichtmast: '<path d="M12 21V7"/><path d="M8 21h8"/><path d="M7 3h10l-2 4H9z"/><path d="M9 9.5l-1.5 2M15 9.5l1.5 2"/>',
  hek: '<path d="M3 6h18M3 18h18"/><path d="M4 6v12M8 6v12M12 6v12M16 6v12M20 6v12"/><path d="M4 6l4 12M8 6l4 12M12 6l4 12M16 6l4 12"/>',
  dranghek: '<path d="M3 8h18M3 13h18"/><path d="M5 8v10M19 8v10M9 8v5M12 8v5M15 8v5"/><path d="M3 18h4M17 18h4"/>',
  poort: '<path d="M3 20V5h18v15"/><path d="M12 5v15"/><path d="M3 5l9 15M21 5l-9 15"/>',
  rijplaat: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 9.3h18M3 14.6h18M9 4v16M15 4v16"/>',
  toilet: '<path d="M7 3h7v6H7z"/><path d="M5 9h14a6 6 0 01-6 6h-2a6 6 0 01-6-6z"/><path d="M9 15l-1 6h8l-1-6"/>',
  toiletwagen: '<rect x="2" y="5" width="18" height="12" rx="1"/><path d="M20 13h2"/><circle cx="7" cy="19" r="2"/><circle cx="15" cy="19" r="2"/><text x="11" y="13.5" font-size="6" text-anchor="middle" font-family="Inter,sans-serif" font-weight="700" stroke="none" fill="currentColor">WC</text>',
  urinoir: '<path d="M8 3h8v9a4 4 0 01-8 0z"/><path d="M12 16v5M9 21h6"/>',
  handen: '<path d="M12 3c3 4 5 6.5 5 9a5 5 0 01-10 0c0-2.5 2-5 5-9z"/><path d="M5 21h14"/>',
  blusser: '<path d="M9 8h6v12a1 1 0 01-1 1h-4a1 1 0 01-1-1z"/><path d="M10 8V5h4v3"/><path d="M14 5h3l2 2"/><path d="M9 12h6"/>',
  ehbo: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M10 7h4v3h3v4h-3v3h-4v-3H7v-4h3z" fill="currentColor" stroke="none"/>',
  aed: '<path d="M12 20s-8-4.5-8-10a4.5 4.5 0 018-2.8A4.5 4.5 0 0120 10c0 5.5-8 10-8 10z"/><path d="M13 8l-2.5 4h3L11 16"/>',
  nooduitgang: '<circle cx="8" cy="5" r="1.8" fill="currentColor"/><path d="M4 11l3-3 3 1 2 3M7 8l-1 6 3 3v4M6 14l-3 2"/><path d="M14 12h8M19 9l3 3-3 3"/>',
  verzamel: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><path d="M7 7l3 3M17 7l-3 3M7 17l3-3M17 17l-3-3"/>',
  beveiliging: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  tent: '<path d="M2 20L12 4l10 16z"/><path d="M12 4v16M8 20l4-6 4 6"/>',
  partytent: '<path d="M3 9l9-5 9 5z"/><path d="M4 9v11M20 9v11M12 4v5"/><path d="M3 9q2.25 2 4.5 0t4.5 0 4.5 0 4.5 0"/>',
  stretchtent: '<path d="M2 18c4-10 6-12 10-12s6 2 10 12"/><path d="M7 18V11M12 18V6M17 18v-7"/>',
  buffet: '<path d="M2 14h20"/><path d="M4 14v6M20 14v6"/><path d="M6 14a6 6 0 0112 0"/><path d="M12 6V5"/>',
  statafel: '<circle cx="12" cy="6" r="4"/><path d="M12 10v10M8 20h8"/>',
  picknick: '<path d="M3 9h18M5 15h14"/><path d="M7 9l-3 11M17 9l3 11"/>',
  bar: '<path d="M3 10h18v10H3z"/><path d="M7 3l2 4h-4zM17 3v4M15 5h4"/>',
  koeling: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/><path d="M9.5 4.5L12 6l2.5-1.5M9.5 19.5L12 18l2.5 1.5"/>',
  afval: '<path d="M5 7h14l-1.5 13h-11z"/><path d="M3 7h18M9 7V4h6v3M10 11v6M14 11v6"/>',
  container: '<path d="M3 8h18l-2 11H5z"/><path d="M2 8l2-3h16l2 3"/><path d="M8 11v5M12 11v5M16 11v5"/>',
  water: '<path d="M12 3c3.5 4.5 6 7.5 6 10.5a6 6 0 01-12 0C6 10.5 8.5 7.5 12 3z"/>',
  podium: '<path d="M2 12h20v8H2z"/><path d="M5 12V7h14v5"/><path d="M9 4h6"/>',
  garderobe: '<path d="M12 7a2 2 0 112-2"/><path d="M12 7v1L3 15h18l-9-7"/><path d="M3 15v2h18v-2"/>',
  kassa: '<rect x="3" y="9" width="18" height="11" rx="1"/><path d="M6 9V4h8v5"/><path d="M7 13h2M11 13h2M15 13h2M7 16h10"/>',
  ingang: '<path d="M14 3h6v18h-6"/><path d="M3 12h11M10 8l4 4-4 4"/>',
  parasol: '<path d="M2 11a10 7 0 0120 0z"/><path d="M12 11v10M12 4V2"/>',
  heater: '<path d="M12 2c2 3 4 4.5 4 7.5a4 4 0 01-8 0C8 7 10 5 12 2z"/><path d="M12 13.5V22M8 22h8"/>',
  vlag: '<path d="M5 22V3"/><path d="M5 3c5 0 7 2 12 2l-2 5 2 5c-5 0-7-2-12-2"/>',
  bord: '<rect x="3" y="4" width="18" height="10" rx="1"/><path d="M8 14v7M16 14v7M7 8h10M7 11h6"/>',
  camera: '<rect x="2" y="7" width="15" height="11" rx="2"/><path d="M17 11l5-3v9l-5-3z"/>',
  speaker: '<rect x="6" y="2" width="12" height="20" rx="2"/><circle cx="12" cy="14" r="3.5"/><circle cx="12" cy="7" r="1.5"/>',
  dj: '<rect x="2" y="8" width="20" height="10" rx="1"/><circle cx="7.5" cy="13" r="3"/><circle cx="16.5" cy="13" r="3"/>',
  zitje: '<path d="M5 11V6a2 2 0 012-2h10a2 2 0 012 2v5"/><path d="M3 11h18v5H3zM5 16v4M19 16v4"/>',
  boom: '<circle cx="12" cy="9" r="6"/><path d="M12 15v7"/>',
  pijl: '<path d="M3 12h16M14 6l6 6-6 6"/>',
  brandkraan: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M8 10h8M9 17h6"/>',
  gas: '<path d="M8 8h8v12a1 1 0 01-1 1H9a1 1 0 01-1-1z"/><path d="M10 8V5h4v3M11 3h2"/><path d="M12 12c1.2 1.4 1.8 2.2 1.8 3.2a1.8 1.8 0 01-3.6 0c0-1 .6-1.8 1.8-3.2z"/>',
  kraam: '<path d="M3 9l2-5h14l2 5"/><path d="M3 9q2.25 2.5 4.5 0t4.5 0 4.5 0 4.5 0"/><path d="M5 10v10h14V10M5 15h14"/>',
  vuur: '<path d="M12 3c3 4 6 6 6 11a6 6 0 01-12 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3 0-6 2-9.5z"/>',
  tribune: '<path d="M3 20h18M3 20v-4h5v-4h5V8h5V4h3v16"/>',
  unit: '<rect x="2" y="6" width="20" height="12" rx="1"/><path d="M6 10h4v4H6zM14 10h4v8h-4z"/>',
  rolstoel: '<circle cx="10" cy="5" r="2"/><path d="M10 7v6h5l3 5"/><path d="M14 16a5 5 0 11-6-6"/>',
  fiets: '<circle cx="6" cy="16" r="4"/><circle cx="18" cy="16" r="4"/><path d="M6 16l4-8h5l3 8M10 8H8M12 16l3-8"/>',
  parkeer: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 17V7h4a3 3 0 010 6H9"/>',
  verkeer: '<circle cx="12" cy="5" r="2.5"/><path d="M7 21l1-11h8l1 11M4 12l4-2M20 12l-4-2"/>',
  schrikhek: '<path d="M2 8h20v5H2z"/><path d="M5 13v7M19 13v7M6 8l-3 5M11 8l-3 5M16 8l-3 5M21 8l-3 5"/>',
  haspel: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 4v5M12 15v5M4 12h5M15 12h5"/>',
  noodlicht: '<rect x="3" y="8" width="18" height="8" rx="1"/><path d="M7 12h6M11 10l2 2-2 2M17 10v4"/>',
  munt: '<circle cx="12" cy="12" r="8"/><path d="M14.5 9.5a3 3 0 100 5M9 11h4M9 13h4"/>',
  kantoor: '<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M7 9h4M7 12h10M7 15h6"/>',
  mobiel: '<path d="M3 12h4l2-6 3 12 2-6h7"/>',
}

export const MATERIALEN: Materiaal[] = [
  // Stroom & techniek
  { brand: true, key: 'aggregaat', label: 'Aggregaat', cat: 'Stroom & techniek', w: 3, h: 1.2, kleur: '#d69e2e', icoon: I.aggregaat },
  { brand: true, key: 'aggregaat_groot', label: 'Aggregaat groot (100 kVA+)', cat: 'Stroom & techniek', w: 4.5, h: 1.6, kleur: '#d69e2e', icoon: I.aggregaat },
  { key: 'stroom', label: 'Stroomkast', cat: 'Stroom & techniek', w: 1, h: 0.6, kleur: '#d69e2e', icoon: I.stroomkast },
  { key: 'kabelbrug', label: 'Kabelbrug', cat: 'Stroom & techniek', w: 0.9, h: 0.6, kleur: '#b7791f', icoon: I.kabel, soort: 'lijn', stuk: 0.9, breedte: 0.6 },
  { key: 'lichtmast', label: 'Lichtmast', cat: 'Stroom & techniek', w: 1.2, h: 1.2, kleur: '#d69e2e', icoon: I.lichtmast },
  { key: 'speaker', label: 'Speaker', cat: 'Stroom & techniek', w: 0.6, h: 0.6, kleur: '#3a2a52', icoon: I.speaker },
  { key: 'dj', label: 'DJ-booth', cat: 'Stroom & techniek', w: 2.5, h: 1.2, kleur: '#3a2a52', icoon: I.dj },
  { key: 'camera', label: 'Camera / beveiligingscamera', cat: 'Stroom & techniek', w: 0.5, h: 0.5, kleur: '#3a2a52', icoon: I.camera },
  // Afzetting & grond
  { key: 'bouwhek', label: 'Bouwhek', cat: 'Afzetting & grond', w: 3.5, h: 0.2, kleur: '#4a5568', icoon: I.hek, soort: 'lijn', stuk: 3.5, breedte: 0.2 },
  { key: 'dranghek', label: 'Dranghek', cat: 'Afzetting & grond', w: 2.5, h: 0.5, kleur: '#718096', icoon: I.dranghek, soort: 'lijn', stuk: 2.5, breedte: 0.5 },
  { uitgang: true, key: 'hekpoort', label: 'Hekpoort / doorgang', cat: 'Afzetting & grond', w: 3.5, h: 0.3, kleur: '#4a5568', icoon: I.poort },
  { key: 'rijplaat', label: 'Rijplaten', cat: 'Afzetting & grond', w: 3, h: 2, kleur: '#8b8574', icoon: I.rijplaat, soort: 'lijn', stuk: 3, breedte: 2 },
  { key: 'looppad', label: 'Loopvloer / grondbescherming', cat: 'Afzetting & grond', w: 1, h: 1.2, kleur: '#a39d8c', icoon: I.rijplaat, soort: 'lijn', stuk: 1, breedte: 1.2 },
  // Sanitair
  { wc: 1, key: 'toilet', label: 'Toiletunit', cat: 'Sanitair', w: 1.2, h: 1.2, kleur: '#2b6cb0', icoon: I.toilet },
  { wc: 8, key: 'toiletwagen', label: 'Toiletwagen', cat: 'Sanitair', w: 6, h: 2.5, kleur: '#2b6cb0', icoon: I.toiletwagen },
  { wc: 4, key: 'urinoir', label: 'Urinoir (4 pers.)', cat: 'Sanitair', w: 1.5, h: 1.5, kleur: '#2b6cb0', icoon: I.urinoir },
  { key: 'handen', label: 'Handenwasunit', cat: 'Sanitair', w: 1, h: 1, kleur: '#2b6cb0', icoon: I.handen },
  { key: 'water', label: 'Waterpunt', cat: 'Sanitair', w: 1, h: 1, kleur: '#2b6cb0', icoon: I.water },
  // Veiligheid
  { key: 'blusser', label: 'Brandblusser', cat: 'Veiligheid', w: 0.6, h: 0.6, kleur: '#c53030', icoon: I.blusser },
  { key: 'ehbo', label: 'EHBO-post', cat: 'Veiligheid', w: 3, h: 3, kleur: '#c53030', icoon: I.ehbo },
  { key: 'aed', label: 'AED', cat: 'Veiligheid', w: 0.6, h: 0.6, kleur: '#2e8b3a', icoon: I.aed },
  { uitgang: true, key: 'nooduitgang', label: 'Nooduitgang', cat: 'Veiligheid', w: 2, h: 0.6, kleur: '#2e8b3a', icoon: I.nooduitgang },
  { key: 'verzamel', label: 'Verzamelplaats', cat: 'Veiligheid', w: 4, h: 4, kleur: '#2e8b3a', icoon: I.verzamel },
  { key: 'beveiliging', label: 'Beveiligingspost', cat: 'Veiligheid', w: 2, h: 2, kleur: '#2d3748', icoon: I.beveiliging },
  { key: 'looproute', label: 'Looproute / vluchtrichting', cat: 'Veiligheid', w: 3, h: 1, kleur: '#2e8b3a', icoon: I.pijl },
  // Tenten
  { oud: true, key: 'tent3', label: 'Partytent 3x3', cat: 'Tenten', w: 3, h: 3, kleur: '#5b6b8c', icoon: I.partytent },
  { oud: true, key: 'tent3x6', label: 'Partytent 3x6', cat: 'Tenten', w: 6, h: 3, kleur: '#5b6b8c', icoon: I.partytent },
  { oud: true, key: 'tent5', label: 'Tent 5x5', cat: 'Tenten', w: 5, h: 5, kleur: '#5b6b8c', icoon: I.tent },
  { oud: true, key: 'tent6x12', label: 'Tent 6x12', cat: 'Tenten', w: 12, h: 6, kleur: '#5b6b8c', icoon: I.tent },
  { oud: true, key: 'tent10x20', label: 'Tent 10x20', cat: 'Tenten', w: 20, h: 10, kleur: '#5b6b8c', icoon: I.tent },
  { oud: true, key: 'stretchtent', label: 'Stretchtent 10x15', cat: 'Tenten', w: 15, h: 10, kleur: '#5b6b8c', icoon: I.stretchtent },
  // Horeca & meubilair
  { key: 'bar', label: 'Bar', cat: 'Horeca & meubilair', w: 4, h: 1, kleur: '#9b3737', icoon: I.bar },
  { key: 'buffet', label: 'Buffettafel', cat: 'Horeca & meubilair', w: 2, h: 0.8, kleur: '#9b3737', icoon: I.buffet },
  { key: 'statafel', label: 'Statafel', cat: 'Horeca & meubilair', w: 0.8, h: 0.8, kleur: '#8b8574', icoon: I.statafel, rond: true },
  { key: 'picknick', label: 'Picknicktafel', cat: 'Horeca & meubilair', w: 2, h: 1.8, kleur: '#8b8574', icoon: I.picknick },
  { key: 'lounge', label: 'Loungeset', cat: 'Horeca & meubilair', w: 3, h: 2, kleur: '#8b8574', icoon: I.zitje },
  { key: 'koeling', label: 'Koelcel / koelwagen', cat: 'Horeca & meubilair', w: 3, h: 2.5, kleur: '#4299e1', icoon: I.koeling },
  { key: 'parasol', label: 'Parasol', cat: 'Horeca & meubilair', w: 3, h: 3, kleur: '#c9a24b', icoon: I.parasol, rond: true },
  { key: 'heater', label: 'Terrasheater', cat: 'Horeca & meubilair', w: 0.6, h: 0.6, kleur: '#dd6b20', icoon: I.heater, rond: true },
  { key: 'afval', label: 'Afvalbak', cat: 'Horeca & meubilair', w: 0.6, h: 0.6, kleur: '#777162', icoon: I.afval },
  { key: 'container', label: 'Afvalcontainer', cat: 'Horeca & meubilair', w: 2, h: 1.5, kleur: '#777162', icoon: I.container },
  // Publiek & organisatie
  { uitgang: true, key: 'ingang', label: 'Ingang', cat: 'Publiek & organisatie', w: 6, h: 1, kleur: '#010341', icoon: I.ingang },
  { key: 'kassa', label: 'Kassa / scan', cat: 'Publiek & organisatie', w: 4, h: 1.5, kleur: '#010341', icoon: I.kassa },
  { key: 'garderobe', label: 'Garderobe / lockers', cat: 'Publiek & organisatie', w: 6, h: 2, kleur: '#5b6b8c', icoon: I.garderobe },
  { key: 'glasbar', label: 'Glasbar', cat: 'Publiek & organisatie', w: 3, h: 2, kleur: '#5b6b8c', icoon: I.bar },
  { key: 'podium', label: 'Podium', cat: 'Publiek & organisatie', w: 8, h: 5, kleur: '#3a2a52', icoon: I.podium },
  { key: 'bord', label: 'Bord / signing', cat: 'Publiek & organisatie', w: 1.2, h: 0.4, kleur: '#010341', icoon: I.bord },
  { key: 'vlag', label: 'Vlag / beachflag', cat: 'Publiek & organisatie', w: 0.6, h: 0.6, kleur: '#010341', icoon: I.vlag },
  { key: 'boom', label: 'Boom / plantenbak', cat: 'Publiek & organisatie', w: 1.5, h: 1.5, kleur: '#2f855a', icoon: I.boom, rond: true },
  { key: 'terras', label: 'Terras / statafels', cat: 'Publiek & organisatie', w: 8, h: 6, kleur: '#8b8574', icoon: I.statafel },
  { key: 'mobiel', label: 'Stroompunt mobiel', cat: 'Stroom & techniek', w: 0.6, h: 0.6, kleur: '#d69e2e', icoon: I.mobiel },
]

MATERIALEN.push(
  // Tenten: kies het type, de maat vul je in bij het plaatsen
  { key: 'pagode', label: 'Pagodetent', cat: 'Tenten', w: 5, h: 5, kleur: '#5b6b8c', icoon: I.tent, tent: { kort: 'PAGODE', breedtes: [3, 4, 5, 6], stap: 1 } },
  { key: 'aluhal', label: 'Aluhal / frametent', cat: 'Tenten', w: 10, h: 20, kleur: '#5b6b8c', icoon: I.tent, tent: { kort: 'ALUHAL', breedtes: [6, 8, 10, 12, 15, 20, 25, 30], stap: 5 } },
  { key: 'easyup', label: 'Partytent / easy-up', cat: 'Tenten', w: 3, h: 3, kleur: '#5b6b8c', icoon: I.partytent, tent: { kort: 'TENT', breedtes: [3, 4, 6], stap: 1.5 } },
  { key: 'stretch', label: 'Stretchtent', cat: 'Tenten', w: 10, h: 15, kleur: '#5b6b8c', icoon: I.stretchtent, tent: { kort: 'STRETCH', breedtes: [6, 8, 10, 12, 15], stap: 1 } },
  { key: 'stertent', label: 'Stertent', cat: 'Tenten', w: 12, h: 12, kleur: '#5b6b8c', icoon: I.tent, rond: true, tent: { kort: 'STERTENT', breedtes: [10, 12, 14, 17], stap: 1 } },
  { key: 'tipi', label: 'Tipi', cat: 'Tenten', w: 10, h: 10, kleur: '#5b6b8c', icoon: I.tent, rond: true, tent: { kort: 'TIPI', breedtes: [8, 10], stap: 1 } },
  { key: 'spiegeltent', label: 'Spiegeltent', cat: 'Tenten', w: 18, h: 18, kleur: '#5b6b8c', icoon: I.tent, rond: true, tent: { kort: 'SPIEGELTENT', breedtes: [12, 15, 18, 21, 24], stap: 1 } },
  // Routes: teken je als lijn, de band laat zien hoeveel ruimte vrij moet blijven
  { key: 'calamiteitenroute', label: 'Calamiteitenroute', cat: 'Veiligheid', w: 3.5, h: 3.5, kleur: '#e02424', icoon: I.pijl, soort: 'route', breedte: 3.5 },
  { key: 'vluchtroute', label: 'Vluchtroute publiek', cat: 'Veiligheid', w: 1.2, h: 1.2, kleur: '#2e8b3a', icoon: I.pijl, soort: 'route', breedte: 1.2 },
  { key: 'leverroute', label: 'Aan- en afvoerroute', cat: 'Veiligheid', w: 3, h: 3, kleur: '#dd6b20', icoon: I.pijl, soort: 'route', breedte: 3 },
  { key: 'brandkraan', label: 'Brandkraan', cat: 'Veiligheid', w: 0.8, h: 0.8, kleur: '#c53030', icoon: I.brandkraan, rond: true },
  { key: 'haspel', label: 'Brandslanghaspel', cat: 'Veiligheid', w: 0.6, h: 0.6, kleur: '#c53030', icoon: I.haspel },
  { key: 'noodverlichting', label: 'Noodverlichting / transparant', cat: 'Veiligheid', w: 0.6, h: 0.3, kleur: '#2e8b3a', icoon: I.noodlicht },
  { key: 'gasflessen', label: 'Gasflessen', cat: 'Veiligheid', w: 1, h: 1, kleur: '#dd6b20', icoon: I.gas, brand: true },
  { key: 'verkeersregelaar', label: 'Verkeersregelaar', cat: 'Veiligheid', w: 0.8, h: 0.8, kleur: '#dd6b20', icoon: I.verkeer, rond: true },
  { key: 'schrikhek', label: 'Wegafzetting (schrikhek)', cat: 'Afzetting & grond', w: 2, h: 0.4, kleur: '#c53030', icoon: I.schrikhek, soort: 'lijn', stuk: 2, breedte: 0.4 },
  { key: 'bakkraam', label: 'Bak- en braadkraam', cat: 'Horeca & meubilair', w: 4, h: 3, kleur: '#2e6b3a', icoon: I.vuur, brand: true },
  { key: 'marktkraam', label: 'Marktkraam', cat: 'Horeca & meubilair', w: 4, h: 1.2, kleur: '#8b8574', icoon: I.kraam },
  { key: 'munten', label: 'Munt- of tokenverkoop', cat: 'Publiek & organisatie', w: 3, h: 2, kleur: '#010341', icoon: I.munt },
  { key: 'tribune', label: 'Tribune', cat: 'Publiek & organisatie', w: 10, h: 5, kleur: '#3a2a52', icoon: I.tribune },
  { key: 'foh', label: 'FOH / regie', cat: 'Stroom & techniek', w: 3, h: 3, kleur: '#3a2a52', icoon: I.dj },
  { key: 'productie', label: 'Productiekantoor (unit)', cat: 'Publiek & organisatie', w: 6, h: 3, kleur: '#4a5568', icoon: I.kantoor },
  { key: 'zeecontainer', label: 'Zeecontainer 20 ft', cat: 'Publiek & organisatie', w: 6.06, h: 2.44, kleur: '#4a5568', icoon: I.unit },
  { key: 'backstage', label: 'Backstage / crew', cat: 'Publiek & organisatie', w: 8, h: 6, kleur: '#4a5568', icoon: I.zitje },
  { key: 'mivatoilet', label: 'Toilet mindervaliden', cat: 'Sanitair', w: 2.2, h: 2.2, kleur: '#2b6cb0', icoon: I.rolstoel, wc: 1 },
  { key: 'rolstoelplatform', label: 'Rolstoelplatform', cat: 'Publiek & organisatie', w: 4, h: 3, kleur: '#2b6cb0', icoon: I.rolstoel },
  { key: 'fietsen', label: 'Fietsenstalling', cat: 'Publiek & organisatie', w: 10, h: 4, kleur: '#5b6b8c', icoon: I.fiets },
  { key: 'parkeren', label: 'Parkeren', cat: 'Publiek & organisatie', w: 10, h: 5, kleur: '#2b6cb0', icoon: I.parkeer },
)
// ---- Tekenstijl zoals in de evenementenbranche ----
// 'bord'  = veiligheidspictogram: gekleurd vlak met wit symbool (ISO 7010:
//           rood = brand, groen = vluchten en eerste hulp, blauw = voorziening)
// 'vorm'  = bovenaanzicht van het object: volle kleur, donkere rand, korte tekst erin
export type Stijl = { s: 'bord' | 'vorm'; vul: string; tekst?: string; patroon?: 'kruis' | 'strepen'; icoon?: boolean }
const ROOD = '#d9221c', GROEN = '#00843d', BLAUW = '#0b5cad'
const STIJL: Record<string, Stijl> = {
  blusser: { s: 'bord', vul: ROOD }, haspel: { s: 'bord', vul: ROOD }, brandkraan: { s: 'bord', vul: ROOD },
  nooduitgang: { s: 'vorm', vul: GROEN, icoon: true }, aed: { s: 'bord', vul: GROEN }, verzamel: { s: 'bord', vul: GROEN }, noodverlichting: { s: 'bord', vul: GROEN },
  water: { s: 'bord', vul: BLAUW }, handen: { s: 'bord', vul: BLAUW }, verkeersregelaar: { s: 'bord', vul: '#e67700' }, gasflessen: { s: 'bord', vul: '#e67700' },
  camera: { s: 'bord', vul: '#333333' }, mobiel: { s: 'bord', vul: '#e6a700' }, stroom: { s: 'bord', vul: '#e6a700' }, looproute: { s: 'bord', vul: GROEN },
  ehbo: { s: 'vorm', vul: GROEN, tekst: 'EHBO' },
  aggregaat: { s: 'vorm', vul: ROOD, tekst: 'AGG', icoon: true }, aggregaat_groot: { s: 'vorm', vul: ROOD, tekst: 'AGG', icoon: true },
  toilet: { s: 'vorm', vul: '#1f9e8f', tekst: 'WC' }, toiletwagen: { s: 'vorm', vul: '#1f9e8f', tekst: 'WC' }, urinoir: { s: 'vorm', vul: '#1f9e8f', tekst: 'URI' }, mivatoilet: { s: 'vorm', vul: BLAUW, tekst: 'MIVA' },
  pagode: { s: 'vorm', vul: '#e4e4e4', patroon: 'kruis' }, aluhal: { s: 'vorm', vul: '#ececec', patroon: 'strepen' }, easyup: { s: 'vorm', vul: '#e4e4e4', patroon: 'kruis' }, stretch: { s: 'vorm', vul: '#efe6d2' },
  stertent: { s: 'vorm', vul: '#efe6d2' }, tipi: { s: 'vorm', vul: '#e9dcc0' }, spiegeltent: { s: 'vorm', vul: '#e6c9a8' },
  tent3: { s: 'vorm', vul: '#e4e4e4', patroon: 'kruis' }, tent3x6: { s: 'vorm', vul: '#e4e4e4', patroon: 'kruis' }, tent5: { s: 'vorm', vul: '#e4e4e4', patroon: 'kruis' },
  tent6x12: { s: 'vorm', vul: '#e4e4e4', patroon: 'kruis', tekst: 'TENT' }, tent10x20: { s: 'vorm', vul: '#e4e4e4', patroon: 'kruis', tekst: 'TENT' }, stretchtent: { s: 'vorm', vul: '#efe6d2', tekst: 'STRETCHTENT' },
  bar: { s: 'vorm', vul: '#c4c4c4', tekst: 'BAR' }, glasbar: { s: 'vorm', vul: '#c4c4c4', tekst: 'GLAS' }, bakkraam: { s: 'vorm', vul: '#f48fb1', tekst: 'FOOD' },
  buffet: { s: 'vorm', vul: '#a0703f' }, marktkraam: { s: 'vorm', vul: '#7b3f2a', patroon: 'strepen' }, statafel: { s: 'vorm', vul: '#a0703f' }, picknick: { s: 'vorm', vul: '#c9a24b', patroon: 'strepen' }, lounge: { s: 'vorm', vul: '#b08968' },
  koeling: { s: 'vorm', vul: '#2f6db5', tekst: 'KOEL' }, zeecontainer: { s: 'vorm', vul: '#1f4e8c', tekst: 'CONT' }, container: { s: 'vorm', vul: '#5a5a5a', tekst: 'AFVAL' }, afval: { s: 'vorm', vul: '#5a5a5a' },
  productie: { s: 'vorm', vul: '#8a9a5b', tekst: 'OFFICE' }, backstage: { s: 'vorm', vul: '#c5cfa5', tekst: 'CREW' },
  podium: { s: 'vorm', vul: '#f4511e', tekst: 'PODIUM' }, foh: { s: 'vorm', vul: '#f4511e', tekst: 'FOH' }, dj: { s: 'vorm', vul: '#f4511e', tekst: 'DJ' }, speaker: { s: 'vorm', vul: '#333333' },
  tribune: { s: 'vorm', vul: '#cfcfcf', patroon: 'strepen', tekst: 'TRIBUNE' },
  ingang: { s: 'vorm', vul: GROEN, tekst: 'INGANG' }, hekpoort: { s: 'vorm', vul: '#ffffff', tekst: 'POORT' }, kassa: { s: 'vorm', vul: '#5e35b1', tekst: 'KASSA' }, munten: { s: 'vorm', vul: '#5e35b1', tekst: 'MUNTEN' },
  garderobe: { s: 'vorm', vul: '#5b6b8c', tekst: 'GARDEROBE' }, terras: { s: 'vorm', vul: '#ead9b0', tekst: 'TERRAS' }, fietsen: { s: 'vorm', vul: '#bcd4f0', tekst: 'FIETSEN' }, parkeren: { s: 'vorm', vul: '#bcd4f0', tekst: 'P' },
  rolstoelplatform: { s: 'vorm', vul: BLAUW, tekst: 'MIVA' }, lichtmast: { s: 'vorm', vul: '#fbf3c4', icoon: true }, parasol: { s: 'vorm', vul: '#f3e3b0' }, heater: { s: 'vorm', vul: '#f08c2e' }, boom: { s: 'vorm', vul: '#9ccc65' },
  bord: { s: 'vorm', vul: '#0b5cad' }, vlag: { s: 'vorm', vul: '#0b5cad' },
}
export const stijlVan = (m?: Materiaal): Stijl => (m && STIJL[m.key]) || { s: 'vorm', vul: m?.kleur || '#999999' }
// Kleur van lijnmaterialen zoals op een eventplot
export const LIJNKLEUR: Record<string, string> = { bouwhek: '#111111', dranghek: '#e8730c', schrikhek: '#d9221c', kabelbrug: '#f2c200', rijplaat: '#b3b3b3', looppad: '#cfc3a4' }
export const leesbaarOp = (hex: string) => { const h = hex.replace('#', ''); const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16); return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#111111' : '#ffffff' }
// Symbool van een materiaal als SVG-inhoud in een vak van 24 x 24 (voor legenda en lijst)
export function symboolSvg(m: Materiaal): string {
  if (m.soort === 'route') return `<rect x="1" y="7" width="22" height="10" fill="${m.kleur}" fill-opacity="0.22"/><path d="M3 12h15M14 8l5 4-5 4" fill="none" stroke="${m.kleur}" stroke-width="2"/>`
  if (m.soort === 'lijn') {
    const k = LIJNKLEUR[m.key] || m.kleur
    if (m.key === 'bouwhek') return `<path d="M1 12h22" stroke="${k}" stroke-width="1.6"/><rect x="0" y="10" width="4" height="4" fill="#555"/><rect x="10" y="10" width="4" height="4" fill="#555"/><rect x="20" y="10" width="4" height="4" fill="#555"/>`
    if (m.key === 'dranghek' || m.key === 'schrikhek') return `<path d="M2 12h20M2 8v8M12 8v8M22 8v8" stroke="${k}" stroke-width="1.8" fill="none"/>`
    if (m.key === 'kabelbrug') return `<rect x="1" y="8" width="22" height="8" fill="${k}" stroke="#111" stroke-width="0.8"/><path d="M6 8v8M12 8v8M18 8v8" stroke="#111" stroke-width="1.6"/>`
    return `<rect x="1" y="6" width="22" height="12" fill="${k}" stroke="#555" stroke-width="0.8"/><path d="M8.3 6v12M15.6 6v12" stroke="#555" stroke-width="0.8"/>`
  }
  const st = stijlVan(m), tk = leesbaarOp(st.vul)
  if (st.s === 'bord') return `<rect x="1" y="1" width="22" height="22" rx="2.5" fill="${st.vul}"/><g transform="translate(3.6 3.6) scale(0.7)" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="color:#fff">${m.icoon}</g>`
  const vorm = m.rond ? `<circle cx="12" cy="12" r="10" fill="${st.vul}" stroke="#222" stroke-width="1"/>` : `<rect x="1" y="4" width="22" height="16" fill="${st.vul}" stroke="#222" stroke-width="1"/>`
  const pat = st.patroon === 'kruis' ? `<path d="M1 4l22 16M23 4L1 20" stroke="#888" stroke-width="0.8"/>` : st.patroon === 'strepen' ? `<path d="M6 4v16M12 4v16M18 4v16" stroke="#222" stroke-opacity="0.4" stroke-width="0.8"/>` : ''
  const tx = st.tekst && st.tekst.length <= 4 ? `<text x="12" y="${m.rond ? 14.6 : 14.8}" font-size="${st.tekst.length > 3 ? 6.2 : 7.5}" font-weight="700" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" fill="${tk}" stroke="none">${st.tekst}</text>` : ''
  return vorm + pat + tx
}

// ---- Lagen per vakgebied: elk materiaal komt vanzelf op de goede laag ----
export const VAKLAGEN = [
  { id: 'locatie', naam: 'Terrein', kleur: '#8b8574' },
  { id: 'constructies', naam: 'Tenten & podia', kleur: '#5b6b8c' },
  { id: 'afzetting', naam: 'Hekken & afzetting', kleur: '#111111' },
  { id: 'stroom', naam: 'Stroom & techniek', kleur: '#e6a700' },
  { id: 'facilitair', naam: 'Facilitair', kleur: '#1f9e8f' },
  { id: 'horeca', naam: 'Horeca', kleur: '#9b3737' },
  { id: 'publiek', naam: 'Publiek & organisatie', kleur: '#5e35b1' },
  { id: 'veiligheid', naam: 'Veiligheid', kleur: '#d9221c' },
  { id: 'partners', naam: 'Deelnemers', kleur: '#2e6b3a' },
  { id: 'teksten', naam: 'Teksten & maten', kleur: '#333333' },
]
const NAAR_FACILITAIR = new Set(['afval', 'container', 'koeling', 'zeecontainer', 'productie', 'backstage', 'garderobe', 'fietsen', 'parkeren'])
const NAAR_CONSTRUCTIE = new Set(['podium', 'tribune', 'foh', 'dj', 'rolstoelplatform'])
export function laagVanMateriaal(m?: Materiaal): string {
  if (!m) return 'publiek'
  if (m.tent || NAAR_CONSTRUCTIE.has(m.key)) return 'constructies'
  if (NAAR_FACILITAIR.has(m.key)) return 'facilitair'
  return ({ 'Veiligheid': 'veiligheid', 'Afzetting & grond': 'afzetting', 'Sanitair': 'facilitair', 'Stroom & techniek': 'stroom', 'Tenten': 'constructies', 'Horeca & meubilair': 'horeca' } as Record<string, string>)[m.cat] || 'publiek'
}

export const isLijn = (m?: Materiaal) => m?.soort === 'lijn' || m?.soort === 'route'
for (const m of MATERIALEN) if (STIJL[m.key]?.s === 'bord') { m.w = 1.5; m.h = 1.5; m.rond = false }
export const MATERIAAL: Record<string, Materiaal> = Object.fromEntries(MATERIALEN.map(m => [m.key, m]))
export const CATEGORIEEN = ['Veiligheid', 'Afzetting & grond', 'Sanitair', 'Stroom & techniek', 'Tenten', 'Horeca & meubilair', 'Publiek & organisatie']

// Oude 'voorziening'-objecten uit de eerste versie zetten we om naar materialen
export const OUDE_VOORZIENING: Record<string, string> = {
  ingang: 'ingang', kassa: 'kassa', garderobe: 'garderobe', glasbar: 'glasbar', toiletten: 'toiletwagen',
  ehbo: 'ehbo', podium: 'podium', terras: 'terras', nooduitgang: 'nooduitgang', water: 'water', stroom: 'stroom', afval: 'container',
}
