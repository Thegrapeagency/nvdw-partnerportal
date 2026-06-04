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
  created_at: string
  updated_at: string
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
}
