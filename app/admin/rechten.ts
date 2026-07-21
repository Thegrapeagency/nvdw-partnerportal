// Rechten per gebied. Eén plek waar staat welke tab bij welk gebied hoort,
// zodat de navigatie, de Team-tab en de database dezelfde indeling gebruiken.
//
// LET OP: dit bestand bepaalt alleen wat je ZIET. Wat je mag OPHALEN wordt
// afgedwongen door de RLS-policies in Supabase (functie mag()). Een tab
// verbergen is comfort, geen beveiliging.

export type Gebied = 'programma' | 'partners' | 'marketing' | 'nieuwsbrief' | 'financieel' | 'crew' | 'bezoekers' | 'beheer'

export const GEBIEDEN: { id: Gebied; naam: string; uitleg: string }[] = [
  { id: 'programma', naam: 'Programma', uitleg: 'Proeverijen, artiesten, plattegrond en tickettypes' },
  { id: 'partners', naam: 'Partners', uitleg: 'Partnergegevens, contracten, wijnlijsten, documenten en vragen' },
  { id: 'marketing', naam: 'Marketing', uitleg: 'Aankondigingen, schrijfstijl, carousel, advertenties, attributie en push' },
  { id: 'nieuwsbrief', naam: 'Nieuwsbrief', uitleg: 'Het abonneebestand en het versturen van mailings. Los te geven, want hier hangt het hele adressenbestand aan' },
  { id: 'financieel', naam: 'Financieel', uitleg: 'Begroting, omzet, orders en ticketverkoop' },
  { id: 'crew', naam: 'Crew & draaiboek', uitleg: 'Roosters, crewleden en het draaiboek' },
  { id: 'bezoekers', naam: 'Bezoekers', uitleg: 'Bezoekers-app, stempels en bezoekersvragen' },
  { id: 'beheer', naam: 'Beheer', uitleg: 'Team, rechten, to-do, overleg en het activiteitenlog' },
]

// Welke tab hoort bij welk gebied. Tabs die hier niet in staan (zoals start)
// zijn voor iedereen zichtbaar.
export const TAB_GEBIED: Record<string, Gebied> = {
  programma: 'programma',

  overzicht: 'partners',
  partners: 'partners',
  toevoegen: 'partners',
  producten: 'partners',
  crew: 'partners',
  faq: 'partners',
  documenten: 'partners',
  teksten: 'partners',
  export: 'partners',
  vragen: 'partners',

  aankondigingen: 'marketing',
  schrijfstijl: 'marketing',
  carousel: 'marketing',
  huisstijl: 'marketing',
  attributie: 'marketing',
  push: 'marketing',
  advertenties: 'marketing',
  // Bewust een eigen gebied: aan de nieuwsbrief hangt het volledige
  // abonneebestand, dus die geef je los van de rest van marketing.
  nieuwsbrief: 'nieuwsbrief',

  financieel: 'financieel',
  kassa: 'financieel',

  crewrooster: 'crew',
  draaiboek: 'crew',

  app: 'bezoekers',
  bezoekersvragen: 'bezoekers',

  todo: 'beheer',
  overleg: 'beheer',
  status: 'beheer',
  activiteit: 'beheer',
  team: 'beheer',
}

// rechten === null betekent volledige toegang (zoals alle bestaande admins).
export function heeftGebied(rechten: Gebied[] | null, gebied: Gebied): boolean {
  return rechten === null || rechten.includes(gebied)
}

export function heeftTab(rechten: Gebied[] | null, tab: string): boolean {
  const gebied = TAB_GEBIED[tab]
  if (!gebied) return true            // start en andere neutrale tabs
  return heeftGebied(rechten, gebied)
}

// Alle tabs die bij een gebied horen, voor de uitleg onder de vinkjes.
export function tabsVan(gebied: Gebied): string[] {
  return Object.entries(TAB_GEBIED).filter(([, g]) => g === gebied).map(([t]) => t)
}
