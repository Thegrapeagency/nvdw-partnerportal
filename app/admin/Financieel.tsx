'use client'
// Financieel: begroting, werkelijke kosten, prognose en scenario's.
// Opzet naar het model van professionele eventcalculatie (Procim-achtig):
// - sturen op PROGNOSE per post (werkelijk + toegezegd, minimaal begroot
//   zolang de post niet is afgerond), niet op "restant";
// - verplichtingen (status verwacht) tellen zwaar mee;
// - alles in één grid zonder klikwerk, met snelboekbalk en zoekveld;
// - begroting vastklikken als baseline zodat schuiven zichtbaar blijft.
// De omzetkant komt live binnen (ticketing, kassa, standgelden); de
// scenario-sliders rekenen vooruit en veranderen niets aan de cijfers.
import type React from 'react'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { supabase, posRpc } from '@/lib/supabase'
import type { SettlementRow } from '@/lib/supabase'
import { AS, euro } from './ui'

type BudgetType = 'kosten' | 'omzet'
// Omzet die live binnenkomt. Het begrote bedrag staat in de begroting, maar de
// realisatie komt uit de bron zelf; boekingen zouden dan dubbel tellen.
type LiveBron = 'ticketing' | 'kassa' | 'standgelden'
type BudgetPost = {
  id: string
  type: BudgetType
  categorie: string
  naam: string
  begroot_cents: number
  vorig_cents: number
  baseline_cents: number | null
  afgerond: boolean
  notitie: string | null
  volgorde: number
  live_bron: LiveBron | null
}
type BoekingStatus = 'verwacht' | 'factuur' | 'betaald'
type Boeking = {
  id: string
  post_id: string
  omschrijving: string
  leverancier: string | null
  bedrag_cents: number
  datum: string
  status: BoekingStatus
}
// Offertes, facturen en bonnen die aan een boeking hangen. Bewust per boeking:
// bij elk bedrag hoort het bewijsstuk waar dat bedrag vandaan komt.
type BijlageSoort = 'offerte' | 'factuur' | 'bon' | 'contract' | 'overig'
type Bijlage = {
  id: string
  boeking_id: string
  naam: string
  bestandsnaam: string
  storage_path: string
  soort: BijlageSoort
  geupload_door: string | null
  created_at: string
}
type PostDraft = { categorie: string; naam: string; begroot: string; vorig: string }
type BoekingDraft = { omschrijving: string; leverancier: string; bedrag: string; datum: string; status: BoekingStatus }
type TicketRegel = { naam: string; aantal: number; omzet_cents: number }
// Eén bar uit de kassa, met het NvdW-deel al ex btw gerekend.
type HorecaBar = {
  merchant: string
  eigen_bar: boolean
  partner_naam: string | null
  nvdw_pct: number
  netto_bruto_cents: number
  netto_ex_btw_cents: number
  zonder_regels_cents: number
  nvdw_ex_btw_cents: number
}
type ImportRij = {
  geldig: boolean
  fout?: string
  type: BudgetType
  categorie: string
  naam: string
  begroot_cents: number
  gerealiseerd_cents: number
  vorig_cents: number
}
type Scenario = {
  capaciteit: number
  bezoekers: number
  ticketprijs: number      // euro's
  barPerBezoeker: number   // euro's
  afdrachtPct: number
  kostenUitloopPct: number
}

const CATEGORIE_SUGGESTIES = ['locatie', 'personeel', 'techniek', 'marketing', 'inkoop wijn', 'vergunningen', 'overig']
const GROEN = '#2e7d32'
const SCENARIO_KEY = 'nvdw_fin_scenario_v1'
const MARKETING_CATEGORIE = 'promotie'
// Referentie vorige editie (bron: Calculatie NVDW Utrecht 2026 - 3 daags.xlsx, totaaloverzicht)
const VORIGE_EDITIE = { bezoekers: 4750, omzet_cents: 13061375 }
const STATUS_LABEL: Record<BoekingStatus, string> = { verwacht: 'Verwacht', factuur: 'Factuur', betaald: 'Betaald' }
const LIVE_LABEL: Record<LiveBron, string> = { ticketing: 'ticketverkoop', kassa: 'kassa', standgelden: 'stagelden' }
// Baromzet is een mix van drank (21%) en eten (9%). De calculatiesheet rekent met
// driekwart drank, een kwart eten; die verhouding gebruiken we hier ook om van de
// besteding per bezoeker (wat die betaalt, dus bruto) naar ex btw te komen.
const BAR_DEEL_DRANK = 0.75
const BTW_DRANK = 21
const BTW_ETEN = 9
const BAR_EX_BTW_FACTOR =
  BAR_DEEL_DRANK / (1 + BTW_DRANK / 100) + (1 - BAR_DEEL_DRANK) / (1 + BTW_ETEN / 100)
const SOORT_LABEL: Record<BijlageSoort, string> = { offerte: 'Offerte', factuur: 'Factuur', bon: 'Bon', contract: 'Contract', overig: 'Overig' }
// Wat de bucket accepteert. Ruim genoeg voor een offerte uit de mail of een
// foto van een bon, zonder uitvoerbare bestanden.
const BIJLAGE_TYPES = '.pdf,.jpg,.jpeg,.png,.heic,.webp,.doc,.docx,.xls,.xlsx,.txt'
const MAX_BIJLAGE = 25 * 1024 * 1024
const STATUS_KLEUR: Record<BoekingStatus, string> = { verwacht: '#9c7a1e', factuur: '#546e7a', betaald: GROEN }
// Kolombreedtes van het kostengrid, gedeeld door koppen, categorierijen en postrijen.
const KOL = { cat: 120, vorig: 86, begroot: 92, werkelijk: 96, prognose: 96, delta: 84 }

// Afgeronde euro's voor grote cijfers en het scenario.
const euroRond = (cents: number) => (cents < 0 ? '-€' : '€') + Math.round(Math.abs(cents) / 100).toLocaleString('nl-NL')
// Bedrag per bezoeker, altijd met centen.
const euroPB = (cents: number, bezoekers: number) => {
  if (bezoekers <= 0) return '-'
  const v = cents / 100 / bezoekers
  return (v < 0 ? '-€' : '€') + Math.abs(v).toFixed(2).replace('.', ',')
}

// "1.250,50", "1250.50", "1250" en "€ 1250,5" worden allemaal begrepen.
const parseEuro = (s: string): number | null => {
  const t = s.replace(/[€\s]/g, '')
  if (!t) return 0
  let n = t
  const komma = t.includes(','), punt = t.includes('.')
  if (komma && punt) n = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '')
  else if (komma) n = t.replace(',', '.')
  const v = parseFloat(n)
  if (isNaN(v)) return null
  return Math.round(v * 100)
}

const naarInvoer = (cents: number) => (cents / 100).toFixed(2).replace('.', ',')
const vandaag = () => new Date().toISOString().slice(0, 10)
const datumKort = (iso: string) => {
  const [j, m, d] = iso.split('-')
  return `${d}-${m}-${j.slice(2)}`
}

// Supabase geeft maximaal 1000 rijen per keer terug; haal alles op in pagina's.
async function alleRijen<T>(maak: (van: number, tot: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const uit: T[] = []
  for (let van = 0; ; van += 1000) {
    const { data, error } = await maak(van, van + 999)
    if (error) throw new Error(error.message)
    const rijen = data || []
    uit.push(...rijen)
    if (rijen.length < 1000) return uit
  }
}

// Fuzzy zoeker voor de snelboekbalk: substring wint, anders subsequentie.
function fuzzyScore(naam: string, term: string): number {
  const n = naam.toLowerCase(), t = term.toLowerCase()
  if (!t) return -1
  const idx = n.indexOf(t)
  if (idx >= 0) return 1000 - idx - n.length / 100
  let i = 0
  for (const ch of n) if (ch === t[i]) i++
  return i === t.length ? 100 - n.length / 100 : -1
}

// Snelboekbalk: "<post> <bedrag> [omschrijving] [v|f|b]"
type SnelParse = {
  kandidaten: BudgetPost[]
  bedrag: number | null
  omschrijving: string
  status: BoekingStatus
}
function parseSnel(input: string, posten: BudgetPost[]): SnelParse | null {
  const tokens = input.trim().split(/\s+/)
  if (tokens.length < 2) return null
  // eerste token dat als bedrag leest (moet een cijfer bevatten) splitst de regel
  let bedragIdx = -1
  for (let i = 1; i < tokens.length; i++) {
    if (/\d/.test(tokens[i]) && parseEuro(tokens[i]) !== null) { bedragIdx = i; break }
  }
  if (bedragIdx < 1) return null
  const term = tokens.slice(0, bedragIdx).join(' ')
  const bedrag = parseEuro(tokens[bedragIdx])
  let rest = tokens.slice(bedragIdx + 1)
  let status: BoekingStatus = 'betaald'
  const laatste = (rest[rest.length - 1] || '').toLowerCase()
  const statusMap: Record<string, BoekingStatus> = { v: 'verwacht', verwacht: 'verwacht', f: 'factuur', factuur: 'factuur', b: 'betaald', betaald: 'betaald' }
  if (laatste in statusMap) { status = statusMap[laatste]; rest = rest.slice(0, -1) }
  const kandidaten = posten
    .map(p => ({ p, score: fuzzyScore(p.categorie + ' ' + p.naam, term) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(x => x.p)
  return { kandidaten, bedrag, omschrijving: rest.join(' '), status }
}

function parseCsv(tekst: string): ImportRij[] {
  const regels = tekst.split(/\r?\n/).map(r => r.trim()).filter(Boolean)
  if (regels.length === 0) return []
  const delim = regels[0].includes(';') ? ';' : regels[0].includes('\t') ? '\t' : ','
  const uit: ImportRij[] = []
  for (const regel of regels) {
    const kol = regel.split(delim).map(k => k.trim().replace(/^"|"$/g, ''))
    const eerste = (kol[0] || '').toLowerCase()
    if (eerste === 'type' || eerste === 'soort') continue // kopregel
    const type: BudgetType | null =
      ['kosten', 'kost', 'uitgave', 'uitgaven'].includes(eerste) ? 'kosten'
      : ['omzet', 'inkomsten', 'opbrengst', 'opbrengsten'].includes(eerste) ? 'omzet'
      : null
    const naam = (kol[2] || '').trim()
    const begroot = parseEuro(kol[3] || '0')
    const gerealiseerd = parseEuro(kol[4] || '0')
    const vorig = parseEuro(kol[5] || '0')
    const basis = {
      type: type || 'kosten' as BudgetType,
      categorie: (kol[1] || 'overig').toLowerCase() || 'overig',
      naam: naam || regel,
      begroot_cents: begroot ?? 0,
      gerealiseerd_cents: gerealiseerd ?? 0,
      vorig_cents: vorig ?? 0,
    }
    if (!type) uit.push({ ...basis, geldig: false, fout: 'Type onbekend. Gebruik kosten of omzet.' })
    else if (!naam) uit.push({ ...basis, geldig: false, fout: 'Geen naam gevonden in kolom 3.' })
    else if (begroot === null || gerealiseerd === null || vorig === null) uit.push({ ...basis, geldig: false, fout: 'Bedrag niet leesbaar.' })
    else uit.push({ ...basis, geldig: true })
  }
  return uit
}

const legeBoekingDraft = (): BoekingDraft => ({ omschrijving: '', leverancier: '', bedrag: '', datum: vandaag(), status: 'betaald' })

export default function Financieel({ flash }: { flash: (m: string, ms?: number) => void }) {
  const [geladen, setGeladen] = useState(false)
  // Live omzetbronnen
  // Alle ticketbedragen hieronder zijn EX btw, net als de calculatiesheet.
  const [ticketTotaal, setTicketTotaal] = useState(0)
  const [ticketKorting, setTicketKorting] = useState(0)
  const [ticketServiceFee, setTicketServiceFee] = useState(0)
  const [ticketTransactie, setTicketTransactie] = useState(0)
  const [ticketAantal, setTicketAantal] = useState(0)
  const [ticketRegels, setTicketRegels] = useState<TicketRegel[]>([])
  const [ticketFout, setTicketFout] = useState<string | null>(null)
  const [ticketOpen, setTicketOpen] = useState(false)
  const [posNvdw, setPosNvdw] = useState(0)
  const [posAfdrachtGem, setPosAfdrachtGem] = useState(20)
  const [posStatus, setPosStatus] = useState<'laden' | 'ok' | 'fout'>('laden')
  // Horeca-omzet van NvdW zelf, ex btw: afdracht op partnerbars plus 100% van de
  // eigen bars. Dit is waar de begrote "Inkomsten horeca" tegenover staat.
  const [horecaEx, setHorecaEx] = useState(0)
  const [horecaBruto, setHorecaBruto] = useState(0)
  const [horecaZonderRegels, setHorecaZonderRegels] = useState(0)
  const [horecaBars, setHorecaBars] = useState<HorecaBar[]>([])
  const [horecaOpen, setHorecaOpen] = useState(false)
  const [standgelden, setStandgelden] = useState(0)
  const [standAantal, setStandAantal] = useState(0)
  const [standFout, setStandFout] = useState<string | null>(null)
  // Begroting + boekingen
  const [posten, setPosten] = useState<BudgetPost[]>([])
  const [boekingen, setBoekingen] = useState<Boeking[]>([])
  const [drafts, setDrafts] = useState<Record<string, PostDraft>>({})
  const [openPosten, setOpenPosten] = useState<Set<string>>(new Set())
  const [nieuweBoeking, setNieuweBoeking] = useState<Record<string, BoekingDraft>>({})
  const [bijlagen, setBijlagen] = useState<Bijlage[]>([])
  const [openBijlagen, setOpenBijlagen] = useState<Set<string>>(new Set())
  const [uploadBezig, setUploadBezig] = useState<string | null>(null)
  const [nieuweCat, setNieuweCat] = useState({ categorie: '', naam: '', begroot: '' })
  const [nieuwOmzet, setNieuwOmzet] = useState({ categorie: '', naam: '', begroot: '' })
  // Categoriebeheer in het kostengrid. Een categorie bestaat pas echt in de
  // database zodra er een post in staat; nieuwe lege categorieën staan tot die
  // tijd lokaal klaar (per browser onthouden).
  const [extraCats, setExtraCats] = useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    try { return JSON.parse(localStorage.getItem('nvdw_fin_extra_cats') || '[]') } catch { return [] }
  })
  const bewaarExtraCats = (cats: string[]) => {
    setExtraCats(cats)
    try { localStorage.setItem('nvdw_fin_extra_cats', JSON.stringify(cats)) } catch { /* niks */ }
  }
  const [catToevoegen, setCatToevoegen] = useState(false)
  const [catNaam, setCatNaam] = useState('')
  const [catHernoem, setCatHernoem] = useState<{ oud: string; naam: string } | null>(null)
  // Ingeklapte categorieën (per browser onthouden) en de losse "+ post"-regel
  // die per categorie open kan staan.
  const [dicht, setDicht] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    try { return new Set(JSON.parse(localStorage.getItem('nvdw_fin_dicht') || '[]')) } catch { return new Set() }
  })
  const zetDicht = (next: Set<string>) => {
    setDicht(next)
    try { localStorage.setItem('nvdw_fin_dicht', JSON.stringify([...next])) } catch { /* niks */ }
  }
  const klapCategorie = (cat: string) => {
    const next = new Set(dicht)
    if (next.has(cat)) next.delete(cat); else next.add(cat)
    zetDicht(next)
  }
  const [snelPost, setSnelPost] = useState<Record<string, { naam: string; begroot: string }>>({})
  // Posten zonder bedrag verbergen. Er staan er een stuk in de calculatie als
  // herinnering ("nog prijzen"), die hoeven niet altijd in beeld.
  const [verbergNul, setVerbergNul] = useState(false)
  // Zodra een lokale categorie z'n eerste post heeft, staat hij in de database
  // en hoeft de lokale kopie niet meer bewaard te blijven.
  useEffect(() => {
    const bestaand = new Set(posten.filter(p => p.type === 'kosten').map(p => p.categorie))
    if (extraCats.some(c => bestaand.has(c))) bewaarExtraCats(extraCats.filter(c => !bestaand.has(c)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posten])
  const [baselineBezig, setBaselineBezig] = useState(false)
  // Snelboek + zoeken
  const [snel, setSnel] = useState('')
  const [snelLaatste, setSnelLaatste] = useState<string | null>(null)
  const [zoek, setZoek] = useState('')
  const snelRef = useRef<HTMLInputElement>(null)
  // Scenario
  const [scenario, setScenario] = useState<Scenario | null>(null)
  // CSV-import
  const [importOpen, setImportOpen] = useState(false)
  const [logOpen, setLogOpen] = useState(false)
  const [logBusy, setLogBusy] = useState(false)
  const [log, setLog] = useState<{ id: string; tabel: string; actie: string; veld: string | null; oude_waarde: string | null; nieuwe_waarde: string | null; wie: string | null; wanneer: string }[]>([])
  const [importTekst, setImportTekst] = useState('')
  const [importBusy, setImportBusy] = useState(false)

  const zetPosten = (rijen: BudgetPost[]) => {
    setPosten(rijen)
    const d: Record<string, PostDraft> = {}
    for (const p of rijen) d[p.id] = { categorie: p.categorie, naam: p.naam, begroot: naarInvoer(p.begroot_cents), vorig: naarInvoer(p.vorig_cents) }
    setDrafts(d)
  }

  const laadPosten = async () => {
    // Op volgorde, niet op categorienaam: zo staan de categorieën in dezelfde
    // volgorde als in de calculatiesheet in plaats van alfabetisch.
    const { data, error } = await supabase.from('budget_posten')
      .select('id, type, categorie, naam, begroot_cents, vorig_cents, baseline_cents, afgerond, notitie, volgorde, live_bron')
      .order('type').order('volgorde')
    if (error) { flash('Begroting laden mislukt: ' + error.message, 7000); return }
    zetPosten((data || []) as BudgetPost[])
  }

  const laadBoekingen = async () => {
    try {
      const rijen = await alleRijen<Boeking>((v, t) =>
        supabase.from('budget_boekingen').select('id, post_id, omschrijving, leverancier, bedrag_cents, datum, status').order('datum').range(v, t))
      setBoekingen(rijen)
    } catch (e) {
      flash('Boekingen laden mislukt: ' + (e instanceof Error ? e.message : 'onbekende fout'), 7000)
    }
  }

  const laadBijlagen = async () => {
    const { data, error } = await supabase.from('budget_bijlagen')
      .select('id, boeking_id, naam, bestandsnaam, storage_path, soort, geupload_door, created_at')
      .order('created_at', { ascending: false })
    if (error) { flash('Bijlagen laden mislukt: ' + error.message, 7000); return }
    setBijlagen((data || []) as Bijlage[])
  }

  const laadTicketing = async () => {
    try {
      const [orders, items, types] = await Promise.all([
        alleRijen<{
          id: string; total_cents: number; discount_cents: number | null
          service_fee_cents: number | null; service_fee_vat_rate: number | null
          transaction_fee_cents: number | null; paid_at: string | null
        }>((v, t) =>
          supabase.from('orders').select('id, total_cents, discount_cents, service_fee_cents, service_fee_vat_rate, transaction_fee_cents, paid_at').eq('status', 'paid').range(v, t)),
        alleRijen<{ order_id: string; ticket_type_id: string; quantity: number; unit_price_cents: number }>((v, t) =>
          supabase.from('order_items').select('order_id, ticket_type_id, quantity, unit_price_cents').range(v, t)),
        alleRijen<{ id: string; name_nl: string; category: string; vat_rate: number }>((v, t) =>
          supabase.from('ticket_types').select('id, name_nl, category, vat_rate').range(v, t)),
      ])
      const betaald = new Set(orders.map(o => o.id))
      const typeVan = new Map(types.map(t => [t.id, t]))
      const perType = new Map<string, TicketRegel>()
      let aantal = 0
      for (const it of items) {
        if (!betaald.has(it.order_id)) continue
        const tt = typeVan.get(it.ticket_type_id)
        // Crewtickets kosten niets en zijn geen bezoekers; die horen niet in de
        // omzet en niet in het gemiddelde van de ticketprijs.
        if (tt?.category === 'crew') continue
        const bruto = it.quantity * it.unit_price_cents
        const r = perType.get(it.ticket_type_id) || { naam: tt?.name_nl || it.ticket_type_id, aantal: 0, omzet_cents: 0 }
        r.aantal += it.quantity
        // De calculatiesheet rekent ex btw, dus hier de btw eruit halen met het
        // tarief dat bij het tickettype staat (nu overal 9%).
        r.omzet_cents += Math.round(bruto / (1 + Number(tt?.vat_rate ?? 9) / 100))
        perType.set(it.ticket_type_id, r)
        aantal += it.quantity
      }
      // Kortingen drukken de ticketomzet; die volgen het ticket-btw-tarief.
      const kortingBruto = orders.reduce((s, o) => s + (o.discount_cents || 0), 0)
      const kortingEx = Math.round(kortingBruto / 1.09)
      const regelsEx = [...perType.values()].reduce((s, r) => s + r.omzet_cents, 0)
      // Servicekosten zijn eigen omzet, geen ticketomzet: apart houden zodat de
      // ticketregel te vergelijken blijft met de begroting.
      const serviceEx = orders.reduce((s, o) =>
        s + Math.round((o.service_fee_cents || 0) / (1 + Number(o.service_fee_vat_rate ?? 9) / 100)), 0)
      setTicketTotaal(regelsEx - kortingEx)
      setTicketKorting(kortingEx)
      setTicketServiceFee(serviceEx)
      // Transactiekosten belasten we door aan de koper en betalen we door aan
      // Mollie: geen omzet, alleen ter info.
      setTicketTransactie(orders.reduce((s, o) => s + (o.transaction_fee_cents || 0), 0))
      setTicketAantal(aantal)
      setTicketRegels([...perType.values()].sort((a, b) => b.omzet_cents - a.omzet_cents))
      setTicketFout(null)
    } catch (e) {
      setTicketFout(e instanceof Error ? e.message : 'Ticketdata niet bereikbaar.')
    }
  }

  const laadPos = async () => {
    try {
      const j = await posRpc<{ ok: boolean; partners: SettlementRow[] }>('partner_settlement')
      if (!j?.ok) throw new Error('Kassa gaf geen geldig antwoord.')
      const rijen = j.partners || []
      // Bruto afdracht van partnerbars: dat is wat je met de partners afrekent.
      setPosNvdw(Math.round(rijen.reduce((s, r) => s + (r.omzet_cents - r.refunded_cents) * r.afdracht_percentage / 100, 0)))
      if (rijen.length > 0) setPosAfdrachtGem(Math.round(rijen.reduce((s, r) => s + r.afdracht_percentage, 0) / rijen.length))
      // Los hiervan de NvdW-horeca-omzet ex btw. Settlement gaat alleen over
      // partnerbars; de eigen bars zitten daar niet in en zijn juist het
      // grootste deel van de begrote horeca-inkomsten.
      const h = await posRpc<{
        ok: boolean; bars: HorecaBar[]
        nvdw_ex_btw_cents: number; bruto_cents: number; zonder_regels_cents: number
      }>('horeca_omzet_nvdw')
      if (h?.ok) {
        setHorecaEx(Number(h.nvdw_ex_btw_cents) || 0)
        setHorecaBruto(Number(h.bruto_cents) || 0)
        setHorecaZonderRegels(Number(h.zonder_regels_cents) || 0)
        setHorecaBars(h.bars || [])
      }
      setPosStatus('ok')
    } catch {
      setPosStatus('fout')
    }
  }

  const laadStandgelden = async () => {
    const { data, error } = await supabase.from('partners').select('bedrijfsnaam, type, standplaats_vergoeding')
    if (error) { setStandFout(error.message); return }
    const food = ((data || []) as { type: string; standplaats_vergoeding: number | null }[])
      .filter(p => p.type === 'food' && p.standplaats_vergoeding != null && p.standplaats_vergoeding > 0)
    setStandgelden(Math.round(food.reduce((s, p) => s + (p.standplaats_vergoeding || 0), 0) * 100))
    setStandAantal(food.length)
    setStandFout(null)
  }

  useEffect(() => {
    Promise.all([laadTicketing(), laadPos(), laadStandgelden(), laadPosten(), laadBoekingen(), laadBijlagen()]).finally(() => setGeladen(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------- afgeleiden ----------
  const kostenPosten = useMemo(() => posten.filter(p => p.type === 'kosten'), [posten])
  const omzetPosten = useMemo(() => posten.filter(p => p.type === 'omzet'), [posten])

  const perPost = useMemo(() => {
    const m = new Map<string, { werkelijk: number; verwacht: number; rijen: Boeking[] }>()
    for (const b of boekingen) {
      const r = m.get(b.post_id) || { werkelijk: 0, verwacht: 0, rijen: [] }
      if (b.status === 'verwacht') r.verwacht += Number(b.bedrag_cents)
      else r.werkelijk += Number(b.bedrag_cents)
      r.rijen.push(b)
      m.set(b.post_id, r)
    }
    return m
  }, [boekingen])

  // Prognose per post: wat gaat dit uiteindelijk kosten/opleveren.
  // Zolang de post loopt minimaal het begrote bedrag; afgerond = de teller staat stil.
  const prognose = (p: BudgetPost) => {
    const info = perPost.get(p.id)
    const geboekt = (info?.werkelijk || 0) + (info?.verwacht || 0)
    return p.afgerond ? geboekt : Math.max(Number(p.begroot_cents), geboekt)
  }

  const somWerkelijk = (l: BudgetPost[]) => l.reduce((s, p) => s + (perPost.get(p.id)?.werkelijk || 0), 0)
  const somVerwacht = (l: BudgetPost[]) => l.reduce((s, p) => s + (perPost.get(p.id)?.verwacht || 0), 0)
  const somBegroot = (l: BudgetPost[]) => l.reduce((s, p) => s + Number(p.begroot_cents), 0)
  const somVorig = (l: BudgetPost[]) => l.reduce((s, p) => s + Number(p.vorig_cents), 0)
  const somPrognose = (l: BudgetPost[]) => l.reduce((s, p) => s + prognose(p), 0)

  // Realisatie van een live omzetpost komt uit de bron, niet uit boekingen.
  // Alles ex btw, want zo staat de begroting erin.
  const liveWerkelijk = (bron: LiveBron) =>
    bron === 'ticketing' ? ticketTotaal
      : bron === 'kassa' ? (posStatus === 'ok' ? horecaEx : 0)
        : standgelden

  const totalen = useMemo(() => {
    const posDeel = posStatus === 'ok' ? horecaEx : 0
    const kostenBegroot = somBegroot(kostenPosten)
    const kostenWerkelijk = somWerkelijk(kostenPosten)
    const kostenVerwacht = somVerwacht(kostenPosten)
    const kostenVorig = somVorig(kostenPosten)
    const kostenPrognose = somPrognose(kostenPosten)
    // Begroot: alle omzetposten. Gerealiseerd: de live bronnen één keer, plus
    // de boekingen onder de handmatige posten.
    const handmatigeOmzet = omzetPosten.filter(p => !p.live_bron)
    const omzetBegroot = somBegroot(omzetPosten)
    // Servicekosten zijn geen ticketomzet maar wel omzet, dus wel in het totaal.
    const omzetGerealiseerd = ticketTotaal + ticketServiceFee + posDeel + standgelden + somWerkelijk(handmatigeOmzet)
    const marketing = kostenPosten.filter(p => p.categorie === MARKETING_CATEGORIE)
    return {
      kostenBegroot, kostenWerkelijk, kostenVerwacht, kostenVorig, kostenPrognose,
      marketingPrognose: somPrognose(marketing), marketingVorig: somVorig(marketing),
      omzetBegroot, omzetGerealiseerd,
      omzetBegrootHandmatig: somBegroot(handmatigeOmzet),
      omzetVorig: somVorig(omzetPosten),
      resultaatNu: omzetGerealiseerd - kostenWerkelijk,
      resultaatBegroot: omzetBegroot - kostenBegroot,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketTotaal, ticketServiceFee, horecaEx, posStatus, standgelden, kostenPosten, omzetPosten, perPost])

  // ---------- scenario ----------
  // Vorige editie: 4750 bezoekers (bron: kostenspreadsheet 2025).
  const scenarioDefaults = (): Scenario => ({
    capaciteit: 6000,
    bezoekers: ticketAantal > 100 ? Math.min(6000, ticketAantal) : VORIGE_EDITIE.bezoekers,
    ticketprijs: ticketAantal > 0 ? Math.round(ticketTotaal / ticketAantal / 100 * 2) / 2 : 30.5,
    barPerBezoeker: 25,
    afdrachtPct: posAfdrachtGem,
    kostenUitloopPct: 0,
  })

  useEffect(() => {
    if (!geladen || scenario) return
    try {
      const raw = localStorage.getItem(SCENARIO_KEY)
      if (raw) { setScenario({ ...scenarioDefaults(), ...JSON.parse(raw) }); return }
    } catch { /* localstorage kapot: gewoon defaults */ }
    setScenario(scenarioDefaults())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geladen])

  const zetScenario = (patch: Partial<Scenario>) => {
    setScenario(s => {
      const next = { ...(s || scenarioDefaults()), ...patch }
      if (next.bezoekers > next.capaciteit) next.bezoekers = next.capaciteit
      try { localStorage.setItem(SCENARIO_KEY, JSON.stringify(next)) } catch { /* niks */ }
      return next
    })
  }

  const scenarioUitkomst = useMemo(() => {
    if (!scenario) return null
    // De ticketprijs-slider staat al ex btw (afgeleid uit de live ticketomzet).
    const tickets = Math.round(scenario.bezoekers * scenario.ticketprijs * 100)
    // De besteding aan de bar is wat de bezoeker betaalt, dus bruto. Eerst de
    // btw eruit, dan het afdrachtpercentage erover: de hele begroting is ex btw.
    const barExPB = scenario.barPerBezoeker * BAR_EX_BTW_FACTOR
    const bar = Math.round(scenario.bezoekers * barExPB * scenario.afdrachtPct / 100 * 100)
    // Alleen de handmatige omzetposten erbij: tickets en bar rekent het scenario
    // zelf uit, dus de begrote live-posten zouden hier dubbel tellen.
    const vast = standgelden + totalen.omzetBegrootHandmatig
    const omzet = tickets + bar + vast
    const kosten = Math.round(totalen.kostenBegroot * (1 + scenario.kostenUitloopPct / 100))
    const perBezoeker = scenario.ticketprijs + barExPB * scenario.afdrachtPct / 100
    const breakEven = perBezoeker > 0 ? Math.max(0, Math.ceil((kosten - vast) / 100 / perBezoeker)) : null
    return { tickets, bar, vast, omzet, kosten, resultaat: omzet - kosten, breakEven }
  }, [scenario, standgelden, totalen.omzetBegrootHandmatig, totalen.kostenBegroot])

  // KPI's per bezoeker en de prognose van het eindresultaat.
  const kpi = useMemo(() => {
    if (!scenario || !scenarioUitkomst) return null
    const bez = scenario.bezoekers
    const omzetPrognose = scenarioUitkomst.omzet
    const eindresultaat = omzetPrognose - totalen.kostenPrognose
    const besteed = totalen.kostenWerkelijk + totalen.kostenVerwacht
    return {
      bez,
      eindresultaat,
      kostenPB: euroPB(totalen.kostenPrognose, bez),
      kostenPBvorig: euroPB(totalen.kostenVorig, VORIGE_EDITIE.bezoekers),
      marketingPB: euroPB(totalen.marketingPrognose, bez),
      marketingPBvorig: euroPB(totalen.marketingVorig, VORIGE_EDITIE.bezoekers),
      omzetPB: euroPB(omzetPrognose, bez),
      omzetPBvorig: euroPB(VORIGE_EDITIE.omzet_cents, VORIGE_EDITIE.bezoekers),
      resultaatPB: euroPB(eindresultaat, bez),
      resultaatPBvorig: euroPB(VORIGE_EDITIE.omzet_cents - totalen.kostenVorig, VORIGE_EDITIE.bezoekers),
      besteedPct: totalen.kostenBegroot > 0 ? Math.round(besteed / totalen.kostenBegroot * 100) : 0,
      breakEven: scenarioUitkomst.breakEven,
    }
  }, [scenario, scenarioUitkomst, totalen])

  const categorieOpties = useMemo(() => {
    const set = new Set(CATEGORIE_SUGGESTIES)
    for (const p of posten) if (p.categorie) set.add(p.categorie)
    return [...set]
  }, [posten])

  // Categorieën per soort: een kostenpost hoort niet in een omzetcategorie
  // terecht te kunnen komen en omgekeerd.
  const catsVanType = useMemo(() => {
    const m: Record<BudgetType, string[]> = { kosten: [], omzet: [] }
    for (const t of ['kosten', 'omzet'] as BudgetType[]) {
      const set = new Set(posten.filter(p => p.type === t).map(p => p.categorie).filter(Boolean))
      if (t === 'kosten') for (const c of CATEGORIE_SUGGESTIES) set.add(c)
      for (const c of extraCats) if (t === 'kosten') set.add(c)
      m[t] = [...set]
    }
    return m
  }, [posten, extraCats])

  const snelParse = useMemo(() => snel.trim() ? parseSnel(snel, kostenPosten) : null, [snel, kostenPosten])
  const importPreview = useMemo(() => importOpen && importTekst.trim() ? parseCsv(importTekst) : [], [importOpen, importTekst])

  // ---------- CRUD posten ----------
  const wijzigDraft = (id: string, veld: keyof PostDraft, waarde: string) =>
    setDrafts(d => ({ ...d, [id]: { ...d[id], [veld]: waarde } }))

  const bewaarPost = async (p: BudgetPost) => {
    const d = drafts[p.id]
    if (!d) return
    const begroot = parseEuro(d.begroot)
    const vorig = parseEuro(d.vorig)
    if (begroot === null || vorig === null) {
      flash('Dat bedrag kan ik niet lezen. Gebruik bijvoorbeeld 1250 of 1250,50.', 6000)
      setDrafts(x => ({ ...x, [p.id]: { ...x[p.id], begroot: naarInvoer(p.begroot_cents), vorig: naarInvoer(p.vorig_cents) } }))
      return
    }
    const upd = {
      categorie: d.categorie.trim().toLowerCase() || 'overig',
      naam: d.naam.trim() || p.naam,
      begroot_cents: begroot,
      vorig_cents: vorig,
    }
    if (upd.categorie === p.categorie && upd.naam === p.naam && begroot === p.begroot_cents && vorig === p.vorig_cents) return
    const { error } = await supabase.from('budget_posten').update(upd).eq('id', p.id)
    if (error) { flash('Opslaan mislukt: ' + error.message, 6000); return }
    setPosten(ps => ps.map(x => x.id === p.id ? { ...x, ...upd } : x))
    setDrafts(x => ({ ...x, [p.id]: { categorie: upd.categorie, naam: upd.naam, begroot: naarInvoer(begroot), vorig: naarInvoer(vorig) } }))
    // Kort terugkoppelen, anders weet je niet of dat bedrag echt is opgeslagen.
    flash(begroot !== p.begroot_cents ? `${upd.naam} staat nu op ${euro(begroot)}` : `${upd.naam} opgeslagen`, 2500)
  }

  // Post naar een andere categorie verplaatsen. Achteraan in de nieuwe categorie
  // zetten, zodat hij niet ergens midden in de lijst opduikt.
  const verplaatsPost = async (p: BudgetPost, nieuweCategorie: string) => {
    const cat = nieuweCategorie.trim().toLowerCase()
    if (!cat || cat === p.categorie) return
    const inCat = posten.filter(x => x.type === p.type && x.categorie === cat)
    const volgorde = inCat.length > 0 ? Math.max(...inCat.map(x => x.volgorde)) + 5 : p.volgorde
    const { error } = await supabase.from('budget_posten').update({ categorie: cat, volgorde }).eq('id', p.id)
    if (error) { flash('Verplaatsen mislukt: ' + error.message, 6000); return }
    setPosten(ps => ps.map(x => x.id === p.id ? { ...x, categorie: cat, volgorde } : x))
    setDrafts(x => ({ ...x, [p.id]: { ...x[p.id], categorie: cat } }))
    flash(`"${p.naam}" staat nu onder ${cat}`)
  }

  const zetAfgerond = async (p: BudgetPost, afgerond: boolean) => {
    const { error } = await supabase.from('budget_posten').update({ afgerond }).eq('id', p.id)
    if (error) { flash('Opslaan mislukt: ' + error.message, 6000); return }
    setPosten(ps => ps.map(x => x.id === p.id ? { ...x, afgerond } : x))
  }

  const voegPostToe = async (type: BudgetType, categorie: string, naam: string, begrootTekst: string) => {
    if (!naam.trim()) { flash('Geef de post een naam.', 5000); return false }
    const begroot = parseEuro(begrootTekst)
    if (begroot === null) { flash('Dat bedrag kan ik niet lezen. Gebruik bijvoorbeeld 1250 of 1250,50.', 6000); return false }
    const cat = categorie.trim().toLowerCase() || 'overig'
    // Achteraan in de eigen categorie, niet achteraan de hele begroting.
    const inCat = posten.filter(p => p.type === type && p.categorie === cat)
    const volgorde = inCat.length > 0
      ? Math.max(...inCat.map(p => p.volgorde)) + 5
      : Math.max(0, ...posten.map(p => p.volgorde)) + 10
    const { error } = await supabase.from('budget_posten').insert({
      type, categorie: cat, naam: naam.trim(),
      begroot_cents: begroot, gerealiseerd_cents: 0, volgorde,
    })
    if (error) { flash('Toevoegen mislukt: ' + error.message, 6000); return false }
    flash(`"${naam.trim()}" toegevoegd onder ${cat} voor ${euro(begroot)}`)
    await laadPosten()
    return true
  }

  const verwijderPost = async (p: BudgetPost) => {
    const n = perPost.get(p.id)?.rijen.length || 0
    if (!confirm(`"${p.naam}" verwijderen?${n > 0 ? ` De ${n} boeking${n === 1 ? '' : 'en'} eronder verdwijnen ook.` : ''}`)) return
    const { error } = await supabase.from('budget_posten').delete().eq('id', p.id)
    if (error) { flash('Verwijderen mislukt: ' + error.message, 6000); return }
    setPosten(ps => ps.filter(x => x.id !== p.id))
    setBoekingen(bs => bs.filter(x => x.post_id !== p.id))
  }

  const klikBaseline = async () => {
    const heeftBaseline = posten.some(p => p.baseline_cents !== null)
    if (!confirm(heeftBaseline
      ? 'De begroting is al eens vastgeklikt. Opnieuw vastklikken overschrijft die referentie met de huidige bedragen. Doorgaan?'
      : 'De huidige begrote bedragen worden vastgeklikt als referentie. Latere wijzigingen blijven dan zichtbaar. Doorgaan?')) return
    setBaselineBezig(true)
    const { error } = await supabase.rpc('fin_klik_baseline')
    setBaselineBezig(false)
    if (error) { flash('Vastklikken mislukt: ' + error.message, 6000); return }
    setPosten(ps => ps.map(x => ({ ...x, baseline_cents: x.begroot_cents })))
    flash('Begroting vastgeklikt als baseline')
  }

  const CENT_VELDEN = new Set(['begroot_cents', 'gerealiseerd_cents', 'vorig_cents', 'baseline_cents', 'bedrag_cents'])
  const logWaarde = (veld: string | null, waarde: string | null) => {
    if (waarde === null) return '-'
    if (veld && CENT_VELDEN.has(veld)) { const n = Number(waarde); return Number.isFinite(n) ? euro(n) : waarde }
    return waarde
  }
  const laadLog = async () => {
    setLogOpen(o => !o)
    if (log.length > 0 || logOpen) return
    setLogBusy(true)
    const { data } = await supabase.from('budget_log').select('*').order('wanneer', { ascending: false }).limit(300)
    setLog(data || [])
    setLogBusy(false)
  }

  // ---------- CRUD boekingen (optimistisch, geen herlaad-rondjes) ----------
  const boekRegel = async (postId: string, regel: { omschrijving: string; leverancier: string | null; bedrag_cents: number; datum: string; status: BoekingStatus }) => {
    const { data, error } = await supabase.from('budget_boekingen')
      .insert({ post_id: postId, ...regel })
      .select('id, post_id, omschrijving, leverancier, bedrag_cents, datum, status')
      .single()
    if (error) { flash('Boeking mislukt: ' + error.message, 6000); return false }
    setBoekingen(bs => [...bs, data as Boeking])
    return true
  }

  const boekingDraft = (postId: string) => nieuweBoeking[postId] || legeBoekingDraft()
  const wijzigBoekingDraft = (postId: string, patch: Partial<BoekingDraft>) =>
    setNieuweBoeking(x => ({ ...x, [postId]: { ...boekingDraft(postId), ...patch } }))

  const voegBoekingToe = async (p: BudgetPost) => {
    const d = boekingDraft(p.id)
    if (!d.omschrijving.trim()) { flash('Geef de boeking een omschrijving.', 5000); return }
    const bedrag = parseEuro(d.bedrag)
    if (bedrag === null) { flash('Dat bedrag kan ik niet lezen.', 5000); return }
    if (await boekRegel(p.id, { omschrijving: d.omschrijving.trim(), leverancier: d.leverancier.trim() || null, bedrag_cents: bedrag, datum: d.datum || vandaag(), status: d.status }))
      setNieuweBoeking(x => ({ ...x, [p.id]: { ...legeBoekingDraft(), status: d.status } }))
  }

  const snelBoek = async () => {
    if (!snelParse || snelParse.bedrag === null || snelParse.kandidaten.length === 0) return
    const post = snelParse.kandidaten[0]
    const ok = await boekRegel(post.id, {
      omschrijving: snelParse.omschrijving || 'Snel geboekt',
      leverancier: null, bedrag_cents: snelParse.bedrag, datum: vandaag(), status: snelParse.status,
    })
    if (ok) {
      setSnel('')
      setSnelLaatste(`${post.naam} · ${euro(snelParse.bedrag)} · ${STATUS_LABEL[snelParse.status]}`)
      snelRef.current?.focus()
    }
  }

  // ---------- bijlagen ----------
  const bijlagenVan = (boekingId: string) => bijlagen.filter(x => x.boeking_id === boekingId)

  const uploadBijlage = async (b: Boeking, file: File, soort: BijlageSoort) => {
    if (file.size > MAX_BIJLAGE) {
      flash(`"${file.name}" is ${Math.round(file.size / 1024 / 1024)} MB en dat is te groot. Maximaal 25 MB.`, 7000)
      return
    }
    setUploadBezig(b.id)
    const veilig = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `boeking/${b.id}/${Date.now()}_${veilig}`
    const { error: upFout } = await supabase.storage.from('begroting').upload(path, file)
    if (upFout) { flash('Uploaden mislukt: ' + upFout.message, 7000); setUploadBezig(null); return }
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = await supabase.from('budget_bijlagen').insert({
      boeking_id: b.id, naam: file.name, bestandsnaam: file.name,
      storage_path: path, soort, geupload_door: user?.email || null,
    }).select('id, boeking_id, naam, bestandsnaam, storage_path, soort, geupload_door, created_at').single()
    if (error) {
      // Bestand staat er wel, rij niet: haal het bestand weer weg zodat er geen wees achterblijft.
      await supabase.storage.from('begroting').remove([path])
      flash('Bijlage opslaan mislukt: ' + error.message, 7000)
      setUploadBezig(null)
      return
    }
    setBijlagen(x => [data as Bijlage, ...x])
    setUploadBezig(null)
    flash(`${SOORT_LABEL[soort]} "${file.name}" toegevoegd`)
  }

  const openBijlage = async (bl: Bijlage) => {
    const { data, error } = await supabase.storage.from('begroting').createSignedUrl(bl.storage_path, 120)
    if (error || !data?.signedUrl) { flash('Openen mislukt: ' + (error?.message || 'geen link gekregen'), 6000); return }
    window.open(data.signedUrl, '_blank')
  }

  const verwijderBijlage = async (bl: Bijlage) => {
    if (!confirm(`Bijlage "${bl.naam}" verwijderen?`)) return
    const { error } = await supabase.from('budget_bijlagen').delete().eq('id', bl.id)
    if (error) { flash('Verwijderen mislukt: ' + error.message, 6000); return }
    await supabase.storage.from('begroting').remove([bl.storage_path])
    setBijlagen(x => x.filter(y => y.id !== bl.id))
  }

  const zetBoekingStatus = async (b: Boeking, status: BoekingStatus) => {
    const { error } = await supabase.from('budget_boekingen').update({ status }).eq('id', b.id)
    if (error) { flash('Status wijzigen mislukt: ' + error.message, 6000); return }
    setBoekingen(bs => bs.map(x => x.id === b.id ? { ...x, status } : x))
  }

  const verwijderBoeking = async (b: Boeking) => {
    const hangt = bijlagenVan(b.id)
    const waarschuwing = hangt.length > 0 ? `\n\nDe ${hangt.length} bijlage${hangt.length === 1 ? '' : 'n'} eronder verdwijnt ook.` : ''
    if (!confirm(`Boeking "${b.omschrijving}" (${euro(Number(b.bedrag_cents))}) verwijderen?${waarschuwing}`)) return
    const { error } = await supabase.from('budget_boekingen').delete().eq('id', b.id)
    if (error) { flash('Verwijderen mislukt: ' + error.message, 6000); return }
    // De rijen gaan mee via cascade, de bestanden moeten we zelf opruimen.
    if (hangt.length > 0) await supabase.storage.from('begroting').remove(hangt.map(x => x.storage_path))
    setBoekingen(bs => bs.filter(x => x.id !== b.id))
    setBijlagen(x => x.filter(y => y.boeking_id !== b.id))
  }

  // ---------- import ----------
  const importeer = async () => {
    const geldig = importPreview.filter(r => r.geldig)
    if (geldig.length === 0) { flash('Geen geldige regels om te importeren.', 5000); return }
    setImportBusy(true)
    const basis = Math.max(0, ...posten.map(p => p.volgorde)) + 1
    const { data, error } = await supabase.from('budget_posten').insert(geldig.map((r, i) => ({
      type: r.type, categorie: r.categorie, naam: r.naam,
      begroot_cents: r.begroot_cents, vorig_cents: r.vorig_cents, gerealiseerd_cents: 0, volgorde: basis + i,
    }))).select('id')
    if (error) { setImportBusy(false); flash('Import mislukt: ' + error.message, 7000); return }
    // Een gevulde "al betaald"-kolom wordt één beginboeking onder de post.
    const ids = (data || []) as { id: string }[]
    const startBoekingen = geldig
      .map((r, i) => ({ r, id: ids[i]?.id }))
      .filter(x => x.id && x.r.gerealiseerd_cents !== 0)
      .map(x => ({ post_id: x.id as string, omschrijving: 'Overgenomen uit spreadsheet', bedrag_cents: x.r.gerealiseerd_cents, datum: vandaag(), status: 'betaald' as BoekingStatus }))
    if (startBoekingen.length > 0) {
      const { error: bFout } = await supabase.from('budget_boekingen').insert(startBoekingen)
      if (bFout) flash('Posten staan erin, maar beginboekingen mislukten: ' + bFout.message, 8000)
    }
    setImportBusy(false)
    flash(`${geldig.length} ${geldig.length === 1 ? 'post' : 'posten'} geïmporteerd`)
    setImportTekst('')
    setImportOpen(false)
    await Promise.all([laadPosten(), laadBoekingen()])
  }

  // ---------- bouwstenen ----------
  const togglePost = (id: string) => setOpenPosten(s => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })

  const tegel = (label: string, cents: number, sub: string, kleur?: string, noot?: string) => (
    <div style={AS.card}>
      <div style={AS.cardTitle}>{label}</div>
      <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: '30px', fontWeight: 700, color: kleur || 'var(--navy)', lineHeight: 1.1 }}>
        {euroRond(cents)}
      </div>
      <div style={{ fontSize: '12px', color: '#888', marginTop: '8px' }}>{sub}</div>
      {noot && <div style={{ fontSize: '11px', color: 'var(--bordeaux)', marginTop: '4px' }}>{noot}</div>}
    </div>
  )

  const kpiTegel = (label: string, waarde: string, sub: string, kleur?: string) => (
    <div style={{ background: 'var(--card)', borderRadius: '10px', border: '1px solid rgba(1,3,65,0.08)', padding: '12px 14px' }}>
      <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#999' }}>{label}</div>
      <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: '20px', fontWeight: 700, color: kleur || 'var(--navy)', margin: '3px 0 2px' }}>{waarde}</div>
      <div style={{ fontSize: '10px', color: '#999' }}>{sub}</div>
    </div>
  )

  const balk = (werkelijk: number, begroot: number) => {
    const pct = begroot > 0 ? Math.min(100, werkelijk / begroot * 100) : (werkelijk > 0 ? 100 : 0)
    const over = begroot > 0 && werkelijk > begroot
    return (
      <div style={{ height: '4px', background: '#eee8da', borderRadius: '2px', overflow: 'hidden', marginTop: '6px' }}>
        <div style={{ height: '100%', width: pct + '%', background: over ? 'var(--bordeaux)' : 'var(--gold)', borderRadius: '2px', transition: 'width .3s' }} />
      </div>
    )
  }

  const bronLabel = (tekst: string) => (
    <span style={{ display: 'inline-block', marginLeft: '8px', padding: '2px 8px', fontSize: '10px', fontWeight: 700, borderRadius: '2px', background: '#eceff1', color: '#546e7a', verticalAlign: 'middle' }}>{tekst}</span>
  )

  const statusChip = (b: Boeking) => (
    <select value={b.status} onChange={e => zetBoekingStatus(b, e.target.value as BoekingStatus)}
      style={{ padding: '3px 6px', fontSize: '11px', fontWeight: 600, border: '1px solid #ddd', borderRadius: '2px', color: STATUS_KLEUR[b.status], background: '#fff', cursor: 'pointer' }}>
      {(Object.keys(STATUS_LABEL) as BoekingStatus[]).map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
    </select>
  )

  const smalInput: React.CSSProperties = { ...AS.input, padding: '5px 8px', fontSize: '12px' }
  const geldInput = (waarde: string, breedte: number, opChange: (v: string) => void, opBlur?: () => void, placeholder?: string, stijl?: React.CSSProperties) => (
    <input style={{ ...smalInput, width: breedte + 'px', textAlign: 'right', ...stijl }} inputMode="decimal" value={waarde} placeholder={placeholder}
      onChange={e => opChange(e.target.value)} onBlur={opBlur}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
  )

  const slider = (label: string, waarde: number, weergave: string, min: number, max: number, step: number, opChange: (v: number) => void) => (
    <div style={{ marginBottom: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
        <span style={{ color: '#666', fontWeight: 600 }}>{label}</span>
        <span style={{ color: 'var(--navy)', fontWeight: 700 }}>{weergave}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={waarde}
        onChange={e => opChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--bordeaux)' }} />
    </div>
  )

  // Paperclip achter een boeking. Toont het aantal bijlagen en klapt ze uit.
  const bijlageKnop = (b: Boeking) => {
    const n = bijlagenVan(b.id).length
    const open = openBijlagen.has(b.id)
    return (
      <button
        title={n === 0 ? 'Offerte of factuur toevoegen' : `${n} bijlage${n === 1 ? '' : 'n'}`}
        onClick={() => setOpenBijlagen(s => {
          const next = new Set(s)
          if (next.has(b.id)) next.delete(b.id); else next.add(b.id)
          return next
        })}
        style={{
          border: 'none', background: open ? '#efe7d3' : 'transparent', borderRadius: '3px', cursor: 'pointer',
          padding: '2px 6px', fontSize: '11px', whiteSpace: 'nowrap', flexShrink: 0,
          color: n > 0 ? 'var(--navy)' : '#bbb', fontWeight: n > 0 ? 700 : 400,
        }}>
        📎{n > 0 ? ` ${n}` : ''}
      </button>
    )
  }

  // Bijlagen onder een boeking: openen, verwijderen en nieuwe toevoegen.
  const bijlagenBlok = (b: Boeking) => {
    const lijst = bijlagenVan(b.id)
    const bezig = uploadBezig === b.id
    return (
      <div style={{ background: '#fff', border: '1px solid #eee5d0', borderRadius: '6px', padding: '10px 12px', margin: '2px 0 8px 58px' }}>
        {lijst.length === 0 && (
          <div style={{ fontSize: '11px', color: '#999', marginBottom: '8px' }}>
            Nog geen bijlage. Hang hier de offerte, de factuur of een foto van de bon aan.
          </div>
        )}
        {lijst.map(bl => (
          <div key={bl.id} style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '3px 0', fontSize: '11px' }}>
            <span style={{ width: '58px', flexShrink: 0, fontWeight: 700, color: 'var(--bordeaux)' }}>{SOORT_LABEL[bl.soort]}</span>
            <button onClick={() => openBijlage(bl)}
              style={{ flex: 1, textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--navy)', textDecoration: 'underline', fontSize: '11px', padding: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {bl.naam}
            </button>
            <span style={{ color: '#bbb', flexShrink: 0 }}>
              {new Date(bl.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
              {bl.geupload_door ? ' · ' + bl.geupload_door.split('@')[0] : ''}
            </span>
            <button style={{ ...AS.btnSm, padding: '1px 6px', fontSize: '9px', flexShrink: 0 }} onClick={() => verwijderBijlage(bl)}>x</button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: lijst.length > 0 ? '10px' : 0, flexWrap: 'wrap' }}>
          <select id={`soort-${b.id}`} defaultValue="offerte" style={{ ...smalInput, width: '110px', fontSize: '11px' }}>
            {(Object.keys(SOORT_LABEL) as BijlageSoort[]).map(s => <option key={s} value={s}>{SOORT_LABEL[s]}</option>)}
          </select>
          <label style={{ ...AS.btnSm, cursor: bezig ? 'wait' : 'pointer', opacity: bezig ? 0.6 : 1, margin: 0 }}>
            {bezig ? 'Bezig met uploaden…' : '+ Bestand kiezen'}
            <input type="file" accept={BIJLAGE_TYPES} disabled={bezig} style={{ display: 'none' }}
              onChange={e => {
                const file = e.target.files?.[0]
                const keuze = (document.getElementById(`soort-${b.id}`) as HTMLSelectElement | null)?.value as BijlageSoort | undefined
                e.target.value = ''
                if (file) uploadBijlage(b, file, keuze || 'offerte')
              }} />
          </label>
          <span style={{ fontSize: '10px', color: '#bbb' }}>pdf, foto, word of excel · max 25 MB</span>
        </div>
      </div>
    )
  }

  // Eén boekingenblok (uitklap onder een post).
  const boekingenBlok = (p: BudgetPost) => {
    const info = perPost.get(p.id)
    const d = boekingDraft(p.id)
    const isOmzet = p.type === 'omzet'
    return (
      <div style={{ background: '#faf7f0', borderRadius: '8px', padding: '12px 14px', margin: '4px 0 10px' }}>
        {(info?.rijen.length || 0) === 0 && (
          <div style={{ fontSize: '12px', color: '#999', marginBottom: '8px' }}>
            Nog geen {isOmzet ? 'ontvangsten' : 'boekingen'}. Vul hieronder de leverancier en het bedrag in
            {isOmzet ? '' : ' (zet een offerte op Verwacht)'} en hang er met 📎 de offerte of factuur aan.
            Tip: de snelboekbalk bovenaan is de snelste route.
          </div>
        )}
        {(info?.rijen || []).map(b => (
          <Fragment key={b.id}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid #f0ead9', fontSize: '12px' }}>
              <span style={{ color: '#999', width: '58px', flexShrink: 0 }}>{datumKort(b.datum)}</span>
              <span style={{ flex: 1, color: 'var(--navy)' }}>{b.omschrijving}{b.leverancier ? <span style={{ color: '#999' }}> · {b.leverancier}</span> : null}</span>
              {bijlageKnop(b)}
              {statusChip(b)}
              <span style={{ fontWeight: 700, whiteSpace: 'nowrap', width: '90px', textAlign: 'right' }}>{euro(Number(b.bedrag_cents))}</span>
              <button style={{ ...AS.btnSm, padding: '2px 7px', fontSize: '9px' }} onClick={() => verwijderBoeking(b)}>x</button>
            </div>
            {openBijlagen.has(b.id) && bijlagenBlok(b)}
          </Fragment>
        ))}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '10px', flexWrap: 'wrap' }}>
          <input style={{ ...smalInput, flex: 2, minWidth: '160px' }} placeholder={isOmzet ? 'Nieuwe ontvangst (bijv. subsidie deel 1)' : 'Nieuwe boeking (bijv. aanbetaling)'}
            value={d.omschrijving} onChange={e => wijzigBoekingDraft(p.id, { omschrijving: e.target.value })} />
          <input style={{ ...smalInput, flex: 1, minWidth: '110px' }} placeholder="leverancier" value={d.leverancier}
            onChange={e => wijzigBoekingDraft(p.id, { leverancier: e.target.value })} />
          <input type="date" style={{ ...smalInput, width: '130px' }} value={d.datum}
            onChange={e => wijzigBoekingDraft(p.id, { datum: e.target.value })} />
          <select style={{ ...smalInput, width: '105px' }} value={d.status}
            onChange={e => wijzigBoekingDraft(p.id, { status: e.target.value as BoekingStatus })}>
            {(Object.keys(STATUS_LABEL) as BoekingStatus[]).map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
          {geldInput(d.bedrag, 90, v => wijzigBoekingDraft(p.id, { bedrag: v }), undefined, 'bedrag')}
          <button style={AS.btnSm} onClick={() => voegBoekingToe(p)}>+ Boek</button>
        </div>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#666', marginTop: '10px', cursor: 'pointer' }}>
          <input type="checkbox" checked={p.afgerond} onChange={e => zetAfgerond(p, e.target.checked)} />
          Post afgerond: prognose = geboekt bedrag, ook als dat onder begroting is
        </label>
      </div>
    )
  }

  // Eén postrij in het grid.
  const postRij = (p: BudgetPost) => {
    const d = drafts[p.id] || { categorie: p.categorie, naam: p.naam, begroot: naarInvoer(p.begroot_cents), vorig: naarInvoer(p.vorig_cents) }
    const info = perPost.get(p.id)
    const isOmzet = p.type === 'omzet'
    // Live omzetposten halen hun realisatie uit de bron; boekingen zouden er
    // dubbel op tellen, dus die klap je hier ook niet uit.
    const live = isOmzet ? p.live_bron : null
    const werkelijk = live ? liveWerkelijk(live) : (info?.werkelijk || 0)
    const verwacht = live ? 0 : (info?.verwacht || 0)
    const prog = live ? Math.max(Number(p.begroot_cents), werkelijk) : prognose(p)
    const delta = isOmzet ? prog - Number(p.begroot_cents) : Number(p.begroot_cents) - prog
    const open = openPosten.has(p.id)
    const baselineAfwijkend = p.baseline_cents !== null && Number(p.baseline_cents) !== Number(p.begroot_cents)
    return (
      <Fragment key={p.id}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid #f3f0e8', opacity: p.afgerond ? 0.72 : 1 }}>
          {live ? (
            <span title={'Realisatie komt live uit ' + LIVE_LABEL[live]} style={{ width: '16px', flexShrink: 0, textAlign: 'center', color: GROEN, fontSize: '10px' }}>◉</span>
          ) : (
            <button onClick={() => togglePost(p.id)} title={open ? 'Boekingen verbergen' : 'Boekingen tonen'}
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--bordeaux)', fontSize: '11px', width: '16px', flexShrink: 0, padding: 0 }}>
              {open ? '▾' : '▸'}
            </button>
          )}
          <div style={{ flex: 1, minWidth: '140px' }}>
            <input style={{ ...smalInput, width: '100%', border: '1px solid transparent', background: 'transparent', padding: '4px 6px' }}
              value={d.naam}
              title={p.notitie || undefined}
              onFocus={e => { e.target.style.border = '1px solid #ddd'; e.target.style.background = '#fff' }}
              onBlurCapture={e => { (e.target as HTMLInputElement).style.border = '1px solid transparent'; (e.target as HTMLInputElement).style.background = 'transparent' }}
              onChange={e => wijzigDraft(p.id, 'naam', e.target.value)} onBlur={() => bewaarPost(p)} />
            {p.afgerond && <span style={{ fontSize: '9px', color: GROEN, fontWeight: 700, marginLeft: '6px' }}>✓ AFGEROND</span>}
            {live && <span style={{ fontSize: '9px', color: GROEN, fontWeight: 700, marginLeft: '6px' }}>LIVE UIT {LIVE_LABEL[live].toUpperCase()}</span>}
            {p.notitie && <span title={p.notitie} style={{ fontSize: '10px', color: '#bbb', marginLeft: '6px', cursor: 'help' }}>ⓘ</span>}
          </div>
          {/* Categorie als keuzelijst: zo verhuist een post in één klik. */}
          <select style={{ ...smalInput, width: KOL.cat + 'px', flexShrink: 0, fontSize: '11px', color: '#777', padding: '4px 4px' }}
            value={d.categorie} title="Post naar een andere categorie verplaatsen"
            onChange={e => { wijzigDraft(p.id, 'categorie', e.target.value); verplaatsPost(p, e.target.value) }}>
            {[...new Set([d.categorie, ...catsVanType[p.type]])].map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <span style={{ width: KOL.vorig + 'px', flexShrink: 0, textAlign: 'right', fontSize: '12px', color: '#aaa', whiteSpace: 'nowrap' }}>
            {Number(p.vorig_cents) !== 0 ? euro(Number(p.vorig_cents)) : '·'}
          </span>
          <div style={{ width: KOL.begroot + 'px', flexShrink: 0, textAlign: 'right' }}>
            {geldInput(d.begroot, KOL.begroot, v => wijzigDraft(p.id, 'begroot', v), () => bewaarPost(p))}
            {baselineAfwijkend && (
              <div style={{ fontSize: '9px', color: '#9c7a1e', marginTop: '1px' }}>vast: {euro(Number(p.baseline_cents))}</div>
            )}
          </div>
          {live ? (
            <span title={'Live uit ' + LIVE_LABEL[live]}
              style={{ width: KOL.werkelijk + 'px', flexShrink: 0, textAlign: 'right', fontSize: '12px', fontWeight: 700, color: werkelijk > 0 ? GROEN : '#ccc', whiteSpace: 'nowrap' }}>
              {euro(werkelijk)}
            </span>
          ) : (
            <button onClick={() => togglePost(p.id)}
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', width: KOL.werkelijk + 'px', flexShrink: 0, textAlign: 'right', fontSize: '12px', fontWeight: 700, color: werkelijk > 0 ? 'var(--navy)' : '#ccc', whiteSpace: 'nowrap', padding: 0 }}>
              {euro(werkelijk)}{verwacht > 0 && <span style={{ display: 'block', fontSize: '9px', fontWeight: 600, color: STATUS_KLEUR.verwacht }}>+{euro(verwacht)} toegezegd</span>}
            </button>
          )}
          <span style={{ width: KOL.prognose + 'px', flexShrink: 0, textAlign: 'right', fontSize: '12px', fontWeight: 700, color: 'var(--navy)', whiteSpace: 'nowrap' }}>
            {euro(prog)}
          </span>
          <span style={{ width: KOL.delta + 'px', flexShrink: 0, textAlign: 'right', fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap', color: delta === 0 ? '#bbb' : delta > 0 ? GROEN : 'var(--bordeaux)' }}>
            {delta === 0 ? '–' : (delta > 0 ? '+' : '-') + euro(Math.abs(delta)).slice(1)}
          </span>
          <button style={{ ...AS.btnSm, padding: '2px 7px', fontSize: '9px', flexShrink: 0, border: 'none' }} title="Verwijder post" onClick={() => verwijderPost(p)}>x</button>
        </div>
        {open && !live && boekingenBlok(p)}
      </Fragment>
    )
  }

  const gridKop = (laatsteKolom: string) => (
    <div style={{ display: 'flex', gap: '8px', fontSize: '9px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#999', padding: '4px 0', borderBottom: '2px solid #eee' }}>
      <span style={{ width: '16px' }}></span>
      <span style={{ flex: 1 }}>Post</span>
      <span style={{ width: KOL.cat + 'px' }}>Categorie</span>
      <span style={{ width: KOL.vorig + 'px', textAlign: 'right' }}>Vorige editie</span>
      <span style={{ width: KOL.begroot + 'px', textAlign: 'right' }}>Begroot</span>
      <span style={{ width: KOL.werkelijk + 'px', textAlign: 'right' }}>{laatsteKolom}</span>
      <span style={{ width: KOL.prognose + 'px', textAlign: 'right' }}>Prognose</span>
      <span style={{ width: KOL.delta + 'px', textAlign: 'right' }}>Δ begroot</span>
      <span style={{ width: '26px' }}></span>
    </div>
  )

  // Een categorie hernoemen betekent: alle kostenposten in die categorie
  // omhangen. De boekingen hangen aan de posten en verhuizen dus vanzelf mee.
  const hernoemCategorie = async (oud: string) => {
    const nieuw = (catHernoem?.naam || '').trim().toLowerCase()
    setCatHernoem(null)
    if (!nieuw || nieuw === oud) return
    if (oud === MARKETING_CATEGORIE && !confirm(`De KPI "Marketing per bezoeker" kijkt naar de categorie "${MARKETING_CATEGORIE}". Als je die hernoemt, telt die KPI niet meer mee. Toch hernoemen?`)) return
    const heeftPosten = posten.some(p => p.type === 'kosten' && p.categorie === oud)
    if (heeftPosten) {
      const { error } = await supabase.from('budget_posten').update({ categorie: nieuw }).eq('type', 'kosten').eq('categorie', oud)
      if (error) { flash('Hernoemen mislukte: ' + error.message, 7000); return }
      setPosten(x => x.map(p => p.type === 'kosten' && p.categorie === oud ? { ...p, categorie: nieuw } : p))
    }
    if (extraCats.includes(oud)) bewaarExtraCats(extraCats.map(c => c === oud ? nieuw : c))
    flash(`Categorie "${oud}" heet nu "${nieuw}".`)
  }

  // Verwijderen gooit nooit posten weg: alles verhuist naar "overig".
  const verwijderCategorie = async (cat: string, rijen: BudgetPost[]) => {
    if (cat === 'overig' && rijen.length > 0) { flash('"overig" is de vangnetcategorie en kan niet weg zolang er posten in staan.', 7000); return }
    if (rijen.length > 0) {
      if (cat === MARKETING_CATEGORIE && !confirm(`De KPI "Marketing per bezoeker" kijkt naar "${MARKETING_CATEGORIE}". Toch verwijderen?`)) return
      if (!confirm(`"${cat}" bevat ${rijen.length} ${rijen.length === 1 ? 'post' : 'posten'}. Die verhuizen naar "overig" (boekingen en bijlagen blijven eraan hangen). Categorie verwijderen?`)) return
      const { error } = await supabase.from('budget_posten').update({ categorie: 'overig' }).eq('type', 'kosten').eq('categorie', cat)
      if (error) { flash('Verwijderen mislukte: ' + error.message, 7000); return }
      setPosten(x => x.map(p => p.type === 'kosten' && p.categorie === cat ? { ...p, categorie: 'overig' } : p))
    }
    bewaarExtraCats(extraCats.filter(c => c !== cat))
    flash(`Categorie "${cat}" is weg${rijen.length > 0 ? '; de posten staan onder "overig"' : ''}.`)
  }

  const voegCategorieToe = () => {
    const naam = catNaam.trim().toLowerCase()
    if (!naam) return
    setCatToevoegen(false); setCatNaam('')
    if (posten.some(p => p.type === 'kosten' && p.categorie === naam) || extraCats.includes(naam)) { flash(`"${naam}" bestaat al.`); return }
    bewaarExtraCats([...extraCats, naam])
    setNieuweCat(x => ({ ...x, categorie: naam }))
    flash(`Categorie "${naam}" staat klaar. Hij wordt definitief zodra je er de eerste post in zet.`, 7000)
  }

  // Categorierij in het grid: subtotalen op dezelfde kolommen.
  const categorieRij = (cat: string, rijen: BudgetPost[], bez: number) => {
    const begroot = somBegroot(rijen)
    const werkelijk = somWerkelijk(rijen)
    const verwacht = somVerwacht(rijen)
    const prog = somPrognose(rijen)
    const isDicht = dicht.has(cat)
    return (
      <div key={'kop-' + cat} style={{ position: 'sticky', top: 0, background: 'var(--card)', zIndex: 2, paddingTop: '14px' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline' }}>
          <button onClick={() => klapCategorie(cat)} title={isDicht ? 'Categorie uitklappen' : 'Categorie inklappen'}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--bordeaux)', fontSize: '11px', width: '16px', flexShrink: 0, padding: 0 }}>
            {isDicht ? '▸' : '▾'}
          </button>
          {catHernoem?.oud === cat ? (
            <input autoFocus style={{ ...smalInput, flex: 1, fontWeight: 700, textTransform: 'uppercase' }} value={catHernoem.naam}
              onChange={e => setCatHernoem({ oud: cat, naam: e.target.value })}
              onBlur={() => hernoemCategorie(cat)}
              onKeyDown={e => { if (e.key === 'Enter') hernoemCategorie(cat); if (e.key === 'Escape') setCatHernoem(null) }} />
          ) : (
            <span style={{ flex: 1, fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--bordeaux)' }}>
              <span onClick={() => klapCategorie(cat)} style={{ cursor: 'pointer' }}>{cat}</span>
              {' '}<span style={{ color: '#bbb', fontWeight: 400, letterSpacing: 0, textTransform: 'none' }}>({rijen.length} · {euroPB(prog, bez)} p.b.)</span>
              <button title="Post toevoegen in deze categorie" onClick={() => { setSnelPost(x => ({ ...x, [cat]: x[cat] || { naam: '', begroot: '' } })); if (isDicht) klapCategorie(cat) }}
                style={{ border: 'none', background: 'none', color: 'var(--bordeaux)', cursor: 'pointer', fontSize: '13px', fontWeight: 700, padding: '0 4px' }}>+</button>
              <button title="Categorie hernoemen" onClick={() => setCatHernoem({ oud: cat, naam: cat })}
                style={{ border: 'none', background: 'none', color: '#bbb', cursor: 'pointer', fontSize: '11px', padding: '0 3px' }}>✎</button>
              <button title="Categorie verwijderen (posten verhuizen naar overig)" onClick={() => verwijderCategorie(cat, rijen)}
                style={{ border: 'none', background: 'none', color: '#bbb', cursor: 'pointer', fontSize: '12px', padding: 0 }}>×</button>
            </span>
          )}
          <span style={{ width: KOL.cat + 'px' }}></span>
          <span style={{ width: KOL.vorig + 'px', textAlign: 'right', fontSize: '11px', color: '#aaa', fontWeight: 600 }}>{euroRond(somVorig(rijen))}</span>
          <span style={{ width: KOL.begroot + 'px', textAlign: 'right', fontSize: '11px', fontWeight: 700, color: 'var(--navy)' }}>{euroRond(begroot)}</span>
          <span style={{ width: KOL.werkelijk + 'px', textAlign: 'right', fontSize: '11px', fontWeight: 700, color: 'var(--navy)' }}>
            {euroRond(werkelijk)}{verwacht > 0 ? <span style={{ color: STATUS_KLEUR.verwacht }}> +{euroRond(verwacht)}</span> : null}
          </span>
          <span style={{ width: KOL.prognose + 'px', textAlign: 'right', fontSize: '11px', fontWeight: 700, color: prog > begroot ? 'var(--bordeaux)' : 'var(--navy)' }}>{euroRond(prog)}</span>
          <span style={{ width: KOL.delta + 'px' }}></span>
          <span style={{ width: '26px' }}></span>
        </div>
        {balk(werkelijk + verwacht, begroot)}
      </div>
    )
  }

  if (!geladen) return <div style={{ padding: '20px', color: '#888' }}>Financiën laden...</div>

  const posNoot = posStatus === 'fout' ? 'Kassa niet bereikbaar, telt nu niet mee.' : undefined
  const zoekTerm = zoek.trim().toLowerCase()
  const zichtbareKosten = zoekTerm
    ? kostenPosten.filter(p => (p.categorie + ' ' + p.naam).toLowerCase().includes(zoekTerm))
    : kostenPosten
  const kostenGroepen = new Map<string, BudgetPost[]>()
  for (const p of zichtbareKosten) kostenGroepen.set(p.categorie || 'overig', [...(kostenGroepen.get(p.categorie || 'overig') || []), p])
  const s = scenario || scenarioDefaults()
  const u = scenarioUitkomst
  const bez = s.bezoekers

  return (
    <>
      <div style={AS.title}>Begroting & kosten</div>
      <div style={AS.sub}>
        Begroting, boekingen en prognose op één plek. Omzet komt live binnen uit ticketing, kassa en partnerportal.
        De prognosekolom is leidend: werkelijk plus toegezegd, minimaal begroot zolang een post loopt.
      </div>
      <div style={{ ...AS.sub, background: '#f7f4ec', borderLeft: '3px solid var(--gold)', borderRadius: '4px', padding: '10px 14px', marginBottom: '16px' }}>
        <b>Begroting aanpassen:</b> klik in het bedrag in de kolom Begroot en typ het nieuwe bedrag. Klaar is opgeslagen.
        Klik op het pijltje <span style={{ color: 'var(--bordeaux)' }}>▸</span> voor een post om er een leverancier,
        een bedrag en de bijbehorende offerte of factuur onder te hangen.
      </div>

      <datalist id="fin-categorieen">
        {categorieOpties.map(c => <option key={c} value={c} />)}
      </datalist>

      {/* Grote cijfers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
        {kpi && tegel('Prognose eindresultaat', kpi.eindresultaat, `Scenario-omzet ${euroRond(u?.omzet || 0)} min kostenprognose ${euroRond(totalen.kostenPrognose)}`, kpi.eindresultaat >= 0 ? GROEN : 'var(--bordeaux)')}
        {tegel('Omzet gerealiseerd', totalen.omzetGerealiseerd, `Live uit ticketing, kassa en standgelden. Tickets ex btw, kassa nog bruto`, undefined, posNoot)}
        {tegel('Kosten', totalen.kostenWerkelijk + totalen.kostenVerwacht, `Betaald + facturen ${euroRond(totalen.kostenWerkelijk)} · toegezegd ${euroRond(totalen.kostenVerwacht)} · begroot ${euroRond(totalen.kostenBegroot)}`)}
        {tegel('Resultaat nu', totalen.resultaatNu, 'Gerealiseerde omzet min betaald en gefactureerd', totalen.resultaatNu > 0 ? GROEN : totalen.resultaatNu < 0 ? 'var(--bordeaux)' : undefined)}
      </div>

      {/* KPI-strip per bezoeker */}
      {kpi && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', margin: '4px 0 16px' }}>
          {kpiTegel('Kosten per bezoeker', kpi.kostenPB, `vorige editie ${kpi.kostenPBvorig}`, totalen.kostenPrognose / bez > totalen.kostenVorig / VORIGE_EDITIE.bezoekers ? 'var(--bordeaux)' : GROEN)}
          {kpiTegel('Marketing per bezoeker', kpi.marketingPB, `vorige editie ${kpi.marketingPBvorig}`)}
          {kpiTegel('Omzet per bezoeker', kpi.omzetPB, `vorige editie ${kpi.omzetPBvorig}`)}
          {kpiTegel('Resultaat per bezoeker', kpi.resultaatPB, `vorige editie ${kpi.resultaatPBvorig}`, kpi.eindresultaat >= 0 ? GROEN : 'var(--bordeaux)')}
          {kpiTegel('Begroting vastgelegd', kpi.besteedPct + '%', 'betaald, gefactureerd en toegezegd', kpi.besteedPct > 100 ? 'var(--bordeaux)' : undefined)}
          {kpiTegel('Break-even', kpi.breakEven !== null ? kpi.breakEven.toLocaleString('nl-NL') + ' bez.' : '-', `scenario rekent met ${bez.toLocaleString('nl-NL')}`, kpi.breakEven !== null && kpi.breakEven <= bez ? GROEN : 'var(--bordeaux)')}
        </div>
      )}

      {/* Kosten: snelboek + grid */}
      <div style={AS.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={AS.cardTitle}>Kosten</div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input style={{ ...smalInput, width: '180px' }} placeholder="Zoek post of categorie..." value={zoek} onChange={e => setZoek(e.target.value)} />
            <button style={AS.btnSm} title="Alle categorieën in of uitklappen"
              onClick={() => zetDicht(dicht.size > 0 ? new Set() : new Set(kostenGroepen.keys()))}>
              {dicht.size > 0 ? 'Alles uitklappen' : 'Alles inklappen'}
            </button>
            <button style={{ ...AS.btnSm, borderColor: verbergNul ? 'var(--bordeaux)' : undefined, color: verbergNul ? 'var(--bordeaux)' : undefined }}
              title="Posten zonder bedrag en zonder boekingen verbergen" onClick={() => setVerbergNul(v => !v)}>
              {verbergNul ? 'Toon nulposten' : 'Verberg nulposten'}
            </button>
            <button style={{ ...AS.btnSm, opacity: baselineBezig ? 0.6 : 1 }} disabled={baselineBezig} onClick={klikBaseline}>
              {posten.some(p => p.baseline_cents !== null) ? 'Baseline opnieuw vastklikken' : 'Begroting vastklikken'}
            </button>
            <button style={AS.btnSm} onClick={() => setImportOpen(o => !o)}>
              {importOpen ? 'Sluit import' : 'Import'}
            </button>
            <button style={AS.btnSm} onClick={laadLog}>
              {logOpen ? 'Sluit wijzigingslog' : 'Wijzigingslog'}
            </button>
          </div>
        </div>

        {logOpen && (
          <div style={{ background: '#f7f4ec', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
            <div style={{ fontSize: '13px', color: '#666', marginBottom: '10px' }}>
              Elke wijziging aan de begroting en boekingen, los van de algemene activiteitenlog.
            </div>
            {logBusy ? (
              <div style={{ fontSize: '13px', color: '#888' }}>Laden...</div>
            ) : log.length === 0 ? (
              <div style={{ fontSize: '13px', color: '#888' }}>Nog geen wijzigingen gelogd.</div>
            ) : (
              <table style={AS.table}>
                <thead><tr>{['Wanneer', 'Tabel', 'Actie', 'Veld', 'Van', 'Naar', 'Wie'].map(h => <th key={h} style={AS.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {log.map(l => (
                    <tr key={l.id}>
                      <td style={AS.td}>{new Date(l.wanneer).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                      <td style={AS.td}>{l.tabel === 'budget_posten' ? 'post' : 'boeking'}</td>
                      <td style={AS.td}>{l.actie}</td>
                      <td style={AS.td}>{l.veld || '-'}</td>
                      <td style={AS.td}>{logWaarde(l.veld, l.oude_waarde)}</td>
                      <td style={AS.td}>{logWaarde(l.veld, l.nieuwe_waarde)}</td>
                      <td style={AS.td}>{l.wie || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Snelboekbalk */}
        <div style={{ background: '#f7f4ec', borderRadius: '8px', padding: '12px 14px', marginBottom: '14px' }}>
          <input ref={snelRef} style={{ ...AS.input, fontSize: '14px', padding: '10px 12px' }}
            placeholder='Snel boeken: typ "post bedrag omschrijving" bijv. "bev 5800 aanbetaling f"  (v = verwacht, f = factuur, b = betaald)'
            value={snel} onChange={e => setSnel(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') snelBoek(); if (e.key === 'Escape') setSnel('') }} />
          {snelParse && (
            <div style={{ fontSize: '12px', marginTop: '8px', color: '#666' }}>
              {snelParse.kandidaten.length === 0 || snelParse.bedrag === null ? (
                <span style={{ color: 'var(--bordeaux)' }}>
                  {snelParse.bedrag === null ? 'Geen bedrag herkend.' : 'Geen post gevonden. Maak hem eerst aan onderaan het grid.'}
                </span>
              ) : (
                <>
                  <span style={{ color: GROEN, fontWeight: 700 }}>Enter boekt:</span>{' '}
                  <b>{snelParse.kandidaten[0].naam}</b> ({snelParse.kandidaten[0].categorie}) · {euro(snelParse.bedrag)} · {STATUS_LABEL[snelParse.status]}
                  {snelParse.omschrijving ? <> · &quot;{snelParse.omschrijving}&quot;</> : null}
                  {snelParse.kandidaten.length > 1 && (
                    <span style={{ color: '#999' }}> — of bedoelde je: {snelParse.kandidaten.slice(1).map(k => k.naam).join(', ')}? Typ specifieker.</span>
                  )}
                </>
              )}
            </div>
          )}
          {!snelParse && snelLaatste && (
            <div style={{ fontSize: '12px', marginTop: '8px', color: GROEN }}>✓ Geboekt: {snelLaatste}</div>
          )}
        </div>

        {importOpen && (
          <div style={{ background: '#f7f4ec', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
            <div style={{ fontSize: '13px', color: '#666', marginBottom: '8px' }}>
              Plak regels uit een spreadsheet. Kolommen: type (kosten of omzet), categorie, naam, begroot, al betaald (optioneel), vorige editie (optioneel).
              Een gevulde &quot;al betaald&quot;-kolom wordt automatisch een eerste boeking. Puntkomma, komma of tab werkt allemaal.
            </div>
            <textarea style={{ ...AS.input, height: '110px', resize: 'vertical', fontFamily: 'monospace', fontSize: '12px' }}
              value={importTekst} onChange={e => setImportTekst(e.target.value)}
              placeholder={'kosten;locatie;Huur Werkspoorkathedraal;25000;25000;24000\nkosten;techniek;Licht en geluid;8000;0;7500\nomzet;subsidie;Gemeente Utrecht;5000;0;0'} />
            {importPreview.length > 0 && (
              <>
                <table style={{ ...AS.table, marginTop: '12px' }}>
                  <thead><tr>{['Type', 'Categorie', 'Naam', 'Begroot', 'Al betaald', 'Vorige editie', ''].map(h => <th key={h} style={AS.th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {importPreview.map((r, i) => (
                      <tr key={i} style={{ opacity: r.geldig ? 1 : 0.7 }}>
                        <td style={AS.td}>{r.geldig ? r.type : '?'}</td>
                        <td style={AS.td}>{r.categorie}</td>
                        <td style={AS.td}>{r.naam}</td>
                        <td style={AS.td}>{r.geldig ? euro(r.begroot_cents) : '-'}</td>
                        <td style={AS.td}>{r.geldig ? euro(r.gerealiseerd_cents) : '-'}</td>
                        <td style={AS.td}>{r.geldig ? euro(r.vorig_cents) : '-'}</td>
                        <td style={{ ...AS.td, fontSize: '11px', color: r.geldig ? GROEN : 'var(--bordeaux)' }}>{r.geldig ? 'ok' : r.fout}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button style={{ ...AS.btn, opacity: importBusy ? 0.6 : 1 }} onClick={importeer} disabled={importBusy}>
                  {importBusy ? 'Bezig met importeren...' : `Voeg ${importPreview.filter(r => r.geldig).length} posten toe`}
                </button>
              </>
            )}
          </div>
        )}

        {kostenPosten.length === 0 && (
          <div style={{ color: '#888', fontSize: '13px', marginBottom: '12px' }}>
            Nog geen kostenposten. Importeer een spreadsheet of begin hieronder met een eerste post.
          </div>
        )}
        {zichtbareKosten.length === 0 && kostenPosten.length > 0 && (
          <div style={{ color: '#888', fontSize: '13px', margin: '8px 0' }}>Niets gevonden voor &quot;{zoek}&quot;.</div>
        )}

        {zichtbareKosten.length > 0 && gridKop('Werkelijk')}
        {(() => {
          // Lege, net aangemaakte categorieën meenemen (niet tijdens zoeken).
          const groepen = [...kostenGroepen.entries()]
          if (!zoekTerm) for (const c of extraCats) if (!kostenGroepen.has(c)) groepen.push([c, []])
          return groepen.map(([cat, rijen]) => {
            const isDicht = dicht.has(cat)
            // Nulposten alleen verbergen als je daar zelf om vraagt.
            const zichtbaar = verbergNul ? rijen.filter(p => Number(p.begroot_cents) !== 0 || (perPost.get(p.id)?.rijen.length || 0) > 0) : rijen
            const nieuw = snelPost[cat]
            return (
              <Fragment key={cat}>
                {categorieRij(cat, rijen, bez)}
                {!isDicht && zichtbaar.map(postRij)}
                {!isDicht && verbergNul && zichtbaar.length < rijen.length && (
                  <div style={{ fontSize: '11px', color: '#bbb', padding: '4px 0 4px 24px' }}>
                    {rijen.length - zichtbaar.length} {rijen.length - zichtbaar.length === 1 ? 'post' : 'posten'} zonder bedrag verborgen
                  </div>
                )}
                {!isDicht && rijen.length === 0 && !nieuw && (
                  <div style={{ fontSize: '12px', color: '#999', padding: '6px 0 6px 24px' }}>
                    Nog leeg. Klik op de + achter de categorienaam om de eerste post toe te voegen.
                  </div>
                )}
                {!isDicht && nieuw && (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '6px 0 6px 24px' }}>
                    <input autoFocus style={{ ...smalInput, flex: 1, minWidth: '140px' }} placeholder={`nieuwe post in ${cat}`} value={nieuw.naam}
                      onChange={e => setSnelPost(x => ({ ...x, [cat]: { ...x[cat], naam: e.target.value } }))}
                      onKeyDown={e => {
                        if (e.key === 'Escape') setSnelPost(x => { const n = { ...x }; delete n[cat]; return n })
                        if (e.key === 'Enter') voegPostToe('kosten', cat, nieuw.naam, nieuw.begroot).then(ok => { if (ok) setSnelPost(x => ({ ...x, [cat]: { naam: '', begroot: '' } })) })
                      }} />
                    {geldInput(nieuw.begroot, KOL.begroot, v => setSnelPost(x => ({ ...x, [cat]: { ...x[cat], begroot: v } })), undefined, 'begroot')}
                    <button style={AS.btnSm} onClick={() => voegPostToe('kosten', cat, nieuw.naam, nieuw.begroot).then(ok => { if (ok) setSnelPost(x => ({ ...x, [cat]: { naam: '', begroot: '' } })) })}>
                      + Toevoegen
                    </button>
                    <button style={{ ...AS.btnSm, borderColor: '#ddd', color: '#999' }} onClick={() => setSnelPost(x => { const n = { ...x }; delete n[cat]; return n })}>Klaar</button>
                  </div>
                )}
              </Fragment>
            )
          })
        })()}

        {/* Totaalregel */}
        {zichtbareKosten.length > 0 && !zoekTerm && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline', padding: '10px 0 2px', borderTop: '2px solid var(--navy)', marginTop: '10px' }}>
            <span style={{ width: '16px' }}></span>
            <span style={{ flex: 1, fontSize: '12px', fontWeight: 700, color: 'var(--navy)', textTransform: 'uppercase', letterSpacing: '1px' }}>Totaal kosten</span>
            <span style={{ width: KOL.cat + 'px' }}></span>
            <span style={{ width: KOL.vorig + 'px', textAlign: 'right', fontSize: '12px', color: '#aaa', fontWeight: 700 }}>{euroRond(totalen.kostenVorig)}</span>
            <span style={{ width: KOL.begroot + 'px', textAlign: 'right', fontSize: '12px', fontWeight: 700, color: 'var(--navy)' }}>{euroRond(totalen.kostenBegroot)}</span>
            <span style={{ width: KOL.werkelijk + 'px', textAlign: 'right', fontSize: '12px', fontWeight: 700, color: 'var(--navy)' }}>{euroRond(totalen.kostenWerkelijk + totalen.kostenVerwacht)}</span>
            <span style={{ width: KOL.prognose + 'px', textAlign: 'right', fontSize: '12px', fontWeight: 700, color: totalen.kostenPrognose > totalen.kostenBegroot ? 'var(--bordeaux)' : 'var(--navy)' }}>{euroRond(totalen.kostenPrognose)}</span>
            <span style={{ width: KOL.delta + 'px', textAlign: 'right', fontSize: '11px', fontWeight: 700, color: totalen.kostenBegroot - totalen.kostenPrognose >= 0 ? GROEN : 'var(--bordeaux)' }}>
              {euroRond(totalen.kostenBegroot - totalen.kostenPrognose)}
            </span>
            <span style={{ width: '26px' }}></span>
          </div>
        )}

        {/* Nieuwe post */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '16px', flexWrap: 'wrap' }}>
          <input style={{ ...smalInput, width: '160px' }} list="fin-categorieen" placeholder="categorie (nieuw of bestaand)" value={nieuweCat.categorie}
            onChange={e => setNieuweCat(x => ({ ...x, categorie: e.target.value }))} />
          <input style={{ ...smalInput, flex: 1, minWidth: '160px' }} placeholder="naam van de kostenpost" value={nieuweCat.naam}
            onChange={e => setNieuweCat(x => ({ ...x, naam: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') voegPostToe('kosten', nieuweCat.categorie, nieuweCat.naam, nieuweCat.begroot).then(ok => { if (ok) setNieuweCat({ categorie: '', naam: '', begroot: '' }) }) }} />
          {geldInput(nieuweCat.begroot, 90, v => setNieuweCat(x => ({ ...x, begroot: v })), undefined, 'begroot')}
          <button style={AS.btnSm} onClick={() => voegPostToe('kosten', nieuweCat.categorie, nieuweCat.naam, nieuweCat.begroot).then(ok => { if (ok) setNieuweCat({ categorie: '', naam: '', begroot: '' }) })}>
            + Kostenpost
          </button>
          {catToevoegen ? (
            <span style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
              <input autoFocus style={{ ...smalInput, width: '150px' }} placeholder="naam nieuwe categorie" value={catNaam}
                onChange={e => setCatNaam(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') voegCategorieToe(); if (e.key === 'Escape') setCatToevoegen(false) }} />
              <button style={AS.btnSm} onClick={voegCategorieToe}>OK</button>
            </span>
          ) : (
            <button style={{ ...AS.btnSm, borderColor: '#ccc', color: '#888' }} onClick={() => { setCatToevoegen(true); setCatNaam('') }}>+ Categorie</button>
          )}
        </div>
        <div style={{ fontSize: '11px', color: '#999', marginTop: '10px', lineHeight: 1.7 }}>
          Klik ▸ voor de boekingen onder een post. Prognose = werkelijk + toegezegd, minimaal begroot zolang de post niet is afgerond.
          <br />
          <b>Bedrag wijzigen:</b> typ het nieuwe bedrag en klik uit het veld, dan verschijnt onderin de bevestiging.
          <b> Post verplaatsen:</b> kies een andere categorie in de keuzelijst achter de postnaam.
          <b> Post toevoegen:</b> klik op de + achter een categorienaam, of gebruik de regel hieronder voor een nieuwe categorie.
        </div>
      </div>

      {/* Scenario-speeltuin */}
      <div style={AS.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={AS.cardTitle}>Scenario: draai aan de knoppen</div>
          <button style={AS.btnSm} onClick={() => { const d = scenarioDefaults(); setScenario(d); try { localStorage.setItem(SCENARIO_KEY, JSON.stringify(d)) } catch { /* niks */ } }}>
            Reset naar live cijfers
          </button>
        </div>
        <div style={{ fontSize: '12px', color: '#888', marginBottom: '16px' }}>
          Schuif en zie direct wat er met het resultaat gebeurt. Het bezoekersaantal hier stuurt ook de per-bezoeker-KPI&apos;s bovenaan.
          De uitkomst is ex btw, net als de begroting: de besteding aan de bar vul je bruto in (wat de bezoeker betaalt) en daar
          gaat de btw af met {Math.round(BAR_DEEL_DRANK * 100)}% drank op {BTW_DRANK}% en de rest eten op {BTW_ETEN}%.
          Let op: dit rekent alleen met de afdracht over partnerbars, dus zonder de eigen bars waar je alles houdt.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '28px' }}>
          <div>
            {slider('Bezoekers (betaalde tickets)', s.bezoekers, `${s.bezoekers.toLocaleString('nl-NL')} van ${s.capaciteit.toLocaleString('nl-NL')}`, 0, s.capaciteit, 25, v => zetScenario({ bezoekers: v }))}
            {slider('Gemiddelde ticketprijs (ex btw)', s.ticketprijs, '€' + s.ticketprijs.toFixed(2).replace('.', ','), 10, 60, 0.5, v => zetScenario({ ticketprijs: v }))}
            {slider('Besteding aan de bar per bezoeker (bruto)', s.barPerBezoeker, '€' + s.barPerBezoeker.toFixed(0), 0, 60, 1, v => zetScenario({ barPerBezoeker: v }))}
            {slider('Gemiddelde afdracht bars', s.afdrachtPct, s.afdrachtPct + '%', 0, 40, 1, v => zetScenario({ afdrachtPct: v }))}
            {slider('Kostenuitloop', s.kostenUitloopPct, (s.kostenUitloopPct > 0 ? '+' : '') + s.kostenUitloopPct + '%', -15, 25, 1, v => zetScenario({ kostenUitloopPct: v }))}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#666', marginTop: '4px' }}>
              <span style={{ fontWeight: 600 }}>Maximale capaciteit</span>
              <input style={{ ...smalInput, width: '90px', textAlign: 'right' }} inputMode="numeric" value={s.capaciteit}
                onChange={e => { const v = parseInt(e.target.value.replace(/\D/g, '') || '0', 10); zetScenario({ capaciteit: Math.max(0, v) }) }} />
              <span style={{ color: '#999' }}>over drie dagen samen</span>
            </div>
          </div>
          {u && (
            <div style={{ background: '#faf7f0', borderRadius: '10px', padding: '18px 20px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#999', marginBottom: '6px' }}>Scenario-resultaat</div>
              <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: '40px', fontWeight: 700, lineHeight: 1.05, color: u.resultaat >= 0 ? GROEN : 'var(--bordeaux)' }}>
                {euroRond(u.resultaat)}
              </div>
              <div style={{ fontSize: '12px', color: '#888', margin: '6px 0 14px' }}>
                {euroRond(u.resultaat - totalen.resultaatBegroot)} versus begroot resultaat ({euroRond(totalen.resultaatBegroot)})
              </div>
              {[
                ['Ticketomzet', u.tickets],
                ['NvdW-deel baromzet ex btw', u.bar],
                ['Standgelden + begrote overige omzet', u.vast],
                ['Totale omzet', u.omzet],
                ['Kosten' + (s.kostenUitloopPct !== 0 ? ` (begroot ${s.kostenUitloopPct > 0 ? '+' : ''}${s.kostenUitloopPct}%)` : ''), -u.kosten],
              ].map(([label, cents]) => (
                <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '4px 0', borderBottom: '1px solid #f0ead9', color: 'var(--navy)' }}>
                  <span style={{ color: '#666' }}>{label}</span>
                  <span style={{ fontWeight: 700 }}>{euroRond(cents as number)}</span>
                </div>
              ))}
              {u.breakEven !== null && (
                <div style={{ fontSize: '12px', color: u.breakEven <= s.bezoekers ? GROEN : 'var(--bordeaux)', marginTop: '12px', fontWeight: 600 }}>
                  Break-even bij {u.breakEven.toLocaleString('nl-NL')} bezoekers{u.breakEven <= s.bezoekers ? ' — daar zit je in dit scenario boven.' : ` — nog ${(u.breakEven - s.bezoekers).toLocaleString('nl-NL')} te gaan in dit scenario.`}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Omzet live */}
      <div style={AS.card}>
        <div style={AS.cardTitle}>Omzet live</div>
        {/* Expliciet in beeld: hier kijken meerdere mensen mee en een bedrag
            zonder btw-vermelding wordt makkelijk verkeerd overgenomen. */}
        <div style={{ background: '#f7f4ec', borderRadius: '8px', padding: '10px 14px', marginBottom: '12px', fontSize: '12px', color: 'var(--navy)', lineHeight: 1.6 }}>
          <b>Alle bedragen in dit scherm zijn exclusief btw.</b> Dat geldt voor de hele begroting, dus ook voor de
          kosten en de inkomsten hierboven. De btw wordt per regel uit het brutobedrag gehaald: tickets 9%,
          drank 21%, eten 9%. Wat een bezoeker betaalt is dus hoger dan wat hier staat.
        </div>
        <table style={AS.table}>
          <tbody>
            <tr>
              <td style={{ ...AS.td, fontWeight: 600 }}>
                Ticketomzet ex btw{ticketAantal > 0 ? ` (${ticketAantal.toLocaleString('nl-NL')} tickets)` : ''}{bronLabel('live uit ticketing')}
                {ticketRegels.length > 0 && (
                  <button style={{ ...AS.btnSm, marginLeft: '10px', padding: '3px 8px' }} onClick={() => setTicketOpen(o => !o)}>
                    {ticketOpen ? 'Verberg opbouw' : 'Opbouw'}
                  </button>
                )}
              </td>
              <td style={{ ...AS.td, textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>
                {ticketFout ? '-' : euro(ticketTotaal)}
              </td>
            </tr>
            {ticketFout && (
              <tr><td colSpan={2} style={{ ...AS.td, fontSize: '12px', color: 'var(--bordeaux)' }}>Ticketdata niet bereikbaar: {ticketFout}</td></tr>
            )}
            {ticketOpen && ticketRegels.map(r => (
              <tr key={r.naam}>
                <td style={{ ...AS.td, paddingLeft: '32px', fontSize: '12px', color: '#666' }}>{r.naam} ({r.aantal}x)</td>
                <td style={{ ...AS.td, textAlign: 'right', fontSize: '12px', color: '#666', whiteSpace: 'nowrap' }}>{euro(r.omzet_cents)}</td>
              </tr>
            ))}
            {ticketOpen && ticketKorting > 0 && (
              <tr>
                <td style={{ ...AS.td, paddingLeft: '32px', fontSize: '12px', color: '#666' }}>Kortingscodes (ex btw)</td>
                <td style={{ ...AS.td, textAlign: 'right', fontSize: '12px', color: '#666', whiteSpace: 'nowrap' }}>-{euro(ticketKorting).slice(1)}</td>
              </tr>
            )}
            {ticketOpen && (
              <tr>
                <td style={{ ...AS.td, paddingLeft: '32px', fontSize: '11px', color: '#999' }}>
                  De btw is per tickettype uit het bedrag gehaald (nu overal 9%), zodat dit te vergelijken is met de begroting.
                  Servicekosten staan als eigen regel; de doorbelaste transactiekosten zijn geen omzet.
                </td>
                <td style={AS.td}></td>
              </tr>
            )}
            <tr>
              <td style={{ ...AS.td, fontWeight: 600 }}>Servicekosten ex btw{bronLabel('live uit ticketing')}</td>
              <td style={{ ...AS.td, textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>
                {ticketFout ? '-' : euro(ticketServiceFee)}
              </td>
            </tr>
            {ticketTransactie > 0 && (
              <tr>
                <td style={{ ...AS.td, fontSize: '12px', color: '#999' }}>
                  Transactiekosten doorbelast aan de koper (geen omzet, gaat naar Mollie)
                </td>
                <td style={{ ...AS.td, textAlign: 'right', fontSize: '12px', color: '#999', whiteSpace: 'nowrap' }}>{euro(ticketTransactie)}</td>
              </tr>
            )}
            <tr>
              <td style={{ ...AS.td, fontWeight: 600 }}>
                Baromzet bruto, alle bars samen{bronLabel('live uit kassa')}
                {horecaBars.length > 0 && (
                  <button style={{ ...AS.btnSm, marginLeft: '10px', padding: '3px 8px' }} onClick={() => setHorecaOpen(o => !o)}>
                    {horecaOpen ? 'Verberg per bar' : 'Per bar'}
                  </button>
                )}
              </td>
              <td style={{ ...AS.td, textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>
                {posStatus === 'ok' ? euro(horecaBruto) : '-'}
              </td>
            </tr>
            {horecaOpen && horecaBars.map(b => (
              <tr key={b.merchant}>
                <td style={{ ...AS.td, paddingLeft: '32px', fontSize: '12px', color: '#666' }}>
                  {b.merchant}
                  <span style={{ color: '#999' }}>
                    {' '}· {b.eigen_bar ? 'eigen bar, NvdW houdt alles' : `partnerbar, ${b.nvdw_pct}% afdracht`}
                    {' '}· bruto {euro(Number(b.netto_bruto_cents))}
                  </span>
                  {Number(b.zonder_regels_cents) !== 0 && (
                    <span style={{ color: 'var(--bordeaux)' }}>
                      {' '}· {euro(Number(b.zonder_regels_cents))} zonder regels, btw niet te bepalen
                    </span>
                  )}
                </td>
                <td style={{ ...AS.td, textAlign: 'right', fontSize: '12px', color: '#666', whiteSpace: 'nowrap' }}>
                  {euro(Number(b.nvdw_ex_btw_cents))}
                </td>
              </tr>
            ))}
            <tr>
              <td style={{ ...AS.td, fontWeight: 600 }}>
                NvdW-deel horeca ex btw{bronLabel('live uit kassa')}
                <div style={{ fontSize: '11px', color: '#999', fontWeight: 400 }}>
                  Afdracht over de partnerbars plus de volledige omzet van de eigen bars. Btw per regel eruit: drank 21%, eten 9%.
                </div>
              </td>
              <td style={{ ...AS.td, textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap', color: GROEN }}>
                {posStatus === 'ok' ? euro(horecaEx) : '-'}
              </td>
            </tr>
            {posStatus === 'ok' && horecaZonderRegels !== 0 && (
              <tr>
                <td colSpan={2} style={{ ...AS.td, fontSize: '12px', color: 'var(--bordeaux)' }}>
                  Let op: van {euro(horecaZonderRegels)} baromzet staan geen orderregels in de kassa, dus daar valt geen btw-tarief
                  uit te halen. Dat bedrag zit niet in het NvdW-deel hierboven.
                </td>
              </tr>
            )}
            <tr>
              <td style={{ ...AS.td, fontSize: '12px', color: '#999' }}>
                Waarvan afdrachten van partnerbars (bruto, voor de afrekening met partners)
              </td>
              <td style={{ ...AS.td, textAlign: 'right', fontSize: '12px', color: '#999', whiteSpace: 'nowrap' }}>
                {posStatus === 'ok' ? euro(posNvdw) : '-'}
              </td>
            </tr>
            {posStatus === 'fout' && (
              <tr><td colSpan={2} style={{ ...AS.td, fontSize: '12px', color: 'var(--bordeaux)' }}>
                De kassa is even niet bereikbaar. <button style={{ ...AS.btnSm, marginLeft: '6px', padding: '3px 8px' }} onClick={() => { setPosStatus('laden'); laadPos() }}>Probeer opnieuw</button>
              </td></tr>
            )}
            <tr>
              <td style={{ ...AS.td, fontWeight: 600, borderBottom: 'none' }}>
                Standgelden partners{standAantal > 0 ? ` (${standAantal} food-partners)` : ''}{bronLabel('uit partnerportal')}
              </td>
              <td style={{ ...AS.td, textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap', borderBottom: 'none' }}>
                {standFout ? '-' : euro(standgelden)}
              </td>
            </tr>
            {standFout && (
              <tr><td colSpan={2} style={{ ...AS.td, fontSize: '12px', color: 'var(--bordeaux)', borderBottom: 'none' }}>Partnerdata niet bereikbaar: {standFout}</td></tr>
            )}
          </tbody>
        </table>
        <div style={{ fontSize: '11px', color: '#999', marginTop: '10px' }}>
          Alleen het NvdW-deel van de POS telt mee in de omzet bovenin. De bruto-omzet is ter info.
        </div>
      </div>

      {/* Omzetposten: begroot handmatig, realisatie deels live */}
      <div style={AS.card}>
        <div style={AS.cardTitle}>Inkomsten</div>
        <div style={{ fontSize: '12px', color: '#888', marginBottom: '10px' }}>
          De begrote bedragen komen uit de calculatiesheet. Posten met ◉ halen hun realisatie live uit de
          ticketverkoop, de kassa of de stagelden; daar hoef je niets te boeken. Bij de andere posten boek je
          ontvangsten zelf onder de post (▸), dan tellen ze mee in de gerealiseerde omzet.
        </div>
        {omzetPosten.length === 0 && (
          <div style={{ color: '#888', fontSize: '13px', marginBottom: '8px' }}>Nog geen omzetposten.</div>
        )}
        {omzetPosten.length > 0 && gridKop('Ontvangen')}
        {omzetPosten.map(postRij)}
        {omzetPosten.length > 0 && (
          <>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline', padding: '10px 0 2px', borderTop: '2px solid var(--navy)', marginTop: '10px' }}>
              <span style={{ width: '16px' }}></span>
              <span style={{ flex: 1, fontSize: '12px', fontWeight: 700, color: 'var(--navy)', textTransform: 'uppercase', letterSpacing: '1px' }}>Totaal inkomsten</span>
              <span style={{ width: KOL.cat + 'px' }}></span>
              <span style={{ width: KOL.vorig + 'px', textAlign: 'right', fontSize: '12px', color: '#aaa', fontWeight: 700 }}>{euroRond(totalen.omzetVorig)}</span>
              <span style={{ width: KOL.begroot + 'px', textAlign: 'right', fontSize: '12px', fontWeight: 700, color: 'var(--navy)' }}>{euroRond(totalen.omzetBegroot)}</span>
              <span style={{ width: KOL.werkelijk + 'px', textAlign: 'right', fontSize: '12px', fontWeight: 700, color: GROEN }}>{euroRond(totalen.omzetGerealiseerd)}</span>
              <span style={{ width: KOL.prognose + 'px' }}></span>
              <span style={{ width: KOL.delta + 'px' }}></span>
              <span style={{ width: '26px' }}></span>
            </div>
            {/* Begroot resultaat: inkomsten min kosten, zoals in de calculatiesheet. */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline', padding: '10px 0 2px', marginTop: '6px', borderTop: '1px solid #eee' }}>
              <span style={{ width: '16px' }}></span>
              <span style={{ flex: 1, fontSize: '12px', fontWeight: 700, color: 'var(--navy)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                Begroot resultaat <span style={{ color: '#bbb', fontWeight: 400, letterSpacing: 0, textTransform: 'none' }}>(inkomsten {euroRond(totalen.omzetBegroot)} min kosten {euroRond(totalen.kostenBegroot)})</span>
              </span>
              <span style={{ width: KOL.cat + 'px' }}></span>
              <span style={{ width: KOL.vorig + 'px' }}></span>
              <span style={{ width: KOL.begroot + 'px', textAlign: 'right', fontSize: '13px', fontWeight: 800, color: totalen.resultaatBegroot >= 0 ? GROEN : 'var(--bordeaux)' }}>
                {euroRond(totalen.resultaatBegroot)}
              </span>
              <span style={{ width: KOL.werkelijk + 'px' }}></span>
              <span style={{ width: KOL.prognose + 'px' }}></span>
              <span style={{ width: KOL.delta + 'px' }}></span>
              <span style={{ width: '26px' }}></span>
            </div>
          </>
        )}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '14px', flexWrap: 'wrap' }}>
          <input style={{ ...smalInput, width: '160px' }} list="fin-categorieen" placeholder="categorie" value={nieuwOmzet.categorie}
            onChange={e => setNieuwOmzet(x => ({ ...x, categorie: e.target.value }))} />
          <input style={{ ...smalInput, flex: 1, minWidth: '160px' }} placeholder="naam (bijv. Subsidie Gemeente Utrecht)" value={nieuwOmzet.naam}
            onChange={e => setNieuwOmzet(x => ({ ...x, naam: e.target.value }))} />
          {geldInput(nieuwOmzet.begroot, 90, v => setNieuwOmzet(x => ({ ...x, begroot: v })), undefined, 'begroot')}
          <button style={AS.btnSm} onClick={() => voegPostToe('omzet', nieuwOmzet.categorie, nieuwOmzet.naam, nieuwOmzet.begroot).then(ok => { if (ok) setNieuwOmzet({ categorie: '', naam: '', begroot: '' }) })}>
            + Omzetpost
          </button>
        </div>
      </div>
    </>
  )
}
