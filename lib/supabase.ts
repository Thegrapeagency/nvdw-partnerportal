import { createBrowserClient } from '@supabase/ssr'

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ---- Festival POS (schema festival_pos) ----
// Het kassasysteem leeft in een eigen schema. We praten er rechtstreeks tegen via
// PostgREST met een Profile-header, met de ingelogde sessie. De beveiliging zit
// server-side (RLS + effective_merchant_scope): een partner krijgt ALTIJD alleen
// zijn eigen merchant terug, wat hij ook meestuurt.
async function posHeaders(): Promise<Record<string, string> | null> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) return null
  return {
    apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    Authorization: `Bearer ${session.access_token}`,
  }
}

export async function posRpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const h = await posHeaders()
  if (!h) throw new Error('Je sessie is verlopen. Log opnieuw in.')
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { ...h, 'Content-Type': 'application/json', 'Content-Profile': 'festival_pos' },
    body: JSON.stringify(args),
  })
  const j = await res.json().catch(() => null)
  if (!res.ok) throw new Error(j?.message || `Kassakoppeling gaf een fout (${res.status})`)
  return j as T
}

export async function posSelect<T = unknown>(pathAndQuery: string): Promise<T[]> {
  const h = await posHeaders()
  if (!h) throw new Error('Je sessie is verlopen. Log opnieuw in.')
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    headers: { ...h, 'Accept-Profile': 'festival_pos' },
  })
  const j = await res.json().catch(() => null)
  if (!res.ok) throw new Error(j?.message || `Kassakoppeling gaf een fout (${res.status})`)
  return j as T[]
}

export async function posPatch(pathAndQuery: string, body: Record<string, unknown>): Promise<void> {
  const h = await posHeaders()
  if (!h) throw new Error('Je sessie is verlopen. Log opnieuw in.')
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    method: 'PATCH',
    headers: { ...h, 'Content-Type': 'application/json', 'Content-Profile': 'festival_pos' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const j = await res.json().catch(() => null)
    throw new Error(j?.message || `Opslaan mislukte (${res.status})`)
  }
}

export type PosMe = { role: 'super' | 'partner' | 'none'; merchant_id?: string; merchant_name?: string; merchant_role?: string }
export type PosSummary = {
  scope: string | null
  total_cents: number
  order_count: number
  refunded_cents: number
  refund_count: number
  orders_last_15m: number
  cents_last_15m: number
  active_devices_15m: number
  by_method: { method: string; orders: number; cents: number }[]
  recent: { created_at: string; total_cents: number; status: string; method: string | null; bar: string; device: string; merchant: string }[]
}
export type PriceFloor = { key: string; label: string; min_cents: number; active: boolean }
export type SettlementRow = {
  merchant_id: string; merchant: string; partner_id: string; partner_naam: string
  afdracht_percentage: number; omzet_cents: number; refunded_cents: number; order_count: number
}

export type Partner = {
  id: string
  user_id: string | null
  naam: string
  bedrijfsnaam: string
  email: string
  pakket: string
  avond: string
  barlocatie: string | null
  status: string
  offerte_akkoord: boolean
  offerte_akkoord_datum: string | null
  gratis_tickets: number
  crew_tickets: number
  afdracht_percentage: number
  notities: string | null
  kortingscode: string | null
  contract_ondertekend: boolean | null
  contract_ondertekend_datum: string | null
  contract_ondertekenaar: string | null
  contract_handtekening: string | null
  type: string
  standplaats_vergoeding: number | null
  standplaats_inbegrepen: string | null
  contract_snapshot: Record<string, unknown> | null
  stroom_kw: number | null
  stroom_aansluitingen: string | null
  gas_nodig: boolean | null
  water_nodig: boolean | null
  techniek_opmerkingen: string | null
  created_at: string
  updated_at: string
}

// De 14 wettelijke EU-allergenen
export const ALLERGENEN = [
  'Gluten', 'Schaaldieren', 'Eieren', 'Vis', "Pinda's", 'Noten',
  'Soja', 'Melk', 'Selderij', 'Mosterd', 'Sesamzaad', 'Sulfiet', 'Lupine', 'Weekdieren',
] as const

export type CrewLid = {
  id: string
  partner_id: string | null
  naam: string
  functie: string | null
  email: string | null
  dagen: string[]
  catering_dagen: string[]
  dieet: string | null
  created_at: string
}

export type MenukaartItem = {
  id: string
  partner_id: string
  naam: string
  omschrijving: string | null
  prijs: number | null
  allergenen: string[]
  volgorde: number
}

export type Admin = {
  id: string
  email: string
  naam: string
  rol: string
  actief: boolean
  created_at: string
  // null = volledige toegang. Anders een lijst gebieden (zie app/admin/rechten.ts
  // voor de mogelijke waarden). De echte afdwinging zit in de RLS-policies via
  // de SQL-functie mag().
  rechten: import('@/app/admin/rechten').Gebied[] | null
}

export type PortalTekst = {
  sleutel: string
  label: string
  waarde: string
  type: string
  groep: string
  volgorde: number
  updated_at: string
}

export type Document = {
  id: string
  naam: string
  categorie: string
  bestandsnaam: string
  storage_path: string
  partner_id: string | null
  created_at: string
}

export type ActiviteitLog = {
  id: string
  actor_email: string | null
  actor_naam: string | null
  actie: string
  tabel: string
  record_id: string | null
  partner_id: string | null
  omschrijving: string | null
  created_at: string
}

// Vriendelijke labels + werkwoorden voor het activiteitenlog
export const LOG_TABEL_LABEL: Record<string, string> = {
  partners: 'partner', wijnlijst: 'wijn', menukaart: 'gerecht', crewcatering: 'crewcatering',
  extra_bestellingen: 'extra bestelling', producten_catalogus: 'product', faq: 'FAQ',
  documenten: 'document', portal_teksten: 'portaltekst', admins: 'teamlid', partner_vragen: 'vraag',
}
export const LOG_ACTIE_LABEL: Record<string, string> = {
  INSERT: 'toegevoegd', UPDATE: 'gewijzigd', DELETE: 'verwijderd',
}

export type Wijn = {
  id: string
  partner_id: string
  naam: string
  producent: string | null
  regio: string | null
  land: string | null
  druif: string | null
  jaar: number | null
  prijs_half_glas: number | null
  prijs_heel_glas: number | null
  prijs_fles: number | null
  beschrijving: string | null
  volgorde: number
  foto_url: string | null
}

export type Crewcatering = {
  id: string
  partner_id: string
  avond: string
  aantal_personen: number
  dieetwensen: string | null
}

export type FAQ = {
  id: string
  vraag: string
  antwoord: string
  categorie: string
  volgorde: number
  actief?: boolean
}

export type PartnerVraag = {
  id: string
  partner_id: string
  onderwerp: string
  bericht: string
  status: string
  antwoord: string | null
  antwoord_datum: string | null
  created_at: string
}

export type Product = {
  id: string
  naam: string
  omschrijving: string | null
  prijs: number
  eenheid: string
  actief?: boolean
  volgorde?: number
}

// Programma-items (proeverijen, masterclasses, restaurant-shifts, podium...).
// Dit is de ene bron van waarheid: bij status 'live' maakt een database-trigger
// automatisch het tickettype (prijs/capaciteit) aan en houdt het in sync.
// Flow: concept -> review -> live -> (eventueel) geannuleerd.
export type ProgrammaStatus = 'concept' | 'review' | 'live' | 'geannuleerd'
export type ProgrammaSoort = 'proeverij' | 'restaurant' | 'podium' | 'silent_disco' | 'workshop' | 'overig'
export type Proeverij = {
  id: string
  partner_id: string | null
  ticket_type_id: string | null
  titel: string
  host: string | null
  beschrijving: string | null
  beschrijving_kort: string | null
  social_copy: string | null
  steekwoorden: string | null
  dag: 'fri' | 'sat' | 'sun'
  start_tijd: string | null
  eind_tijd: string | null
  locatie: string | null
  capaciteit: number | null
  prijs_cents: number | null
  foto_url: string | null
  volgorde: number
  actief: boolean
  soort: ProgrammaSoort
  status: ProgrammaStatus
  gen_model: string | null
  gen_at: string | null
  published_at: string | null
  geannuleerd_at: string | null
  annulering_reden: string | null
}
export type ExtraTicketType = {
  id: string
  price_cents: number
  active: boolean
  per_type_cap: number | null
  per_type_sold: number
}
