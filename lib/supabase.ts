import { createBrowserClient } from '@supabase/ssr'

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

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
  afdracht_percentage: number
  notities: string | null
  kortingscode: string | null
  type: string
  standplaats_vergoeding: number | null
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
