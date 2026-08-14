'use client'
import { useEffect, useState } from 'react'
import { supabase, posRpc, posSelect, posPatch } from '@/lib/supabase'
import type { Partner, PartnerVraag, Product, FAQ, PortalTekst, Admin, Document, ActiviteitLog, CrewLid, PriceFloor, SettlementRow } from '@/lib/supabase'
import { LOG_TABEL_LABEL, LOG_ACTIE_LABEL } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Programma from './Programma'
import Dashboard from './Dashboard'
import Attributie from './Attributie'
import CrewRooster from './CrewRooster'
import Financieel from './Financieel'
import Leveranciers from './Leveranciers'
import Advertenties from './Advertenties'
import Push from './Push'
import Aankondigingen from './Aankondigingen'
import Draaiboek from './Draaiboek'
import Carousel from './Carousel'
import Schrijfstijl from './Schrijfstijl'
import { heeftTab, GEBIEDEN, type Gebied } from './rechten'
import Huisstijl from './Huisstijl'
import Nieuwsbrief from './Nieuwsbrief'
import Todo from './Todo'
import Overleg from './Overleg'
import BezoekerVragen from './BezoekerVragen'
import AppBeheer from './AppBeheer'

const PAKKET_LABELS: Record<string, string> = {
  branded_bar: 'Branded Bar',
  own_bar: 'Own Bar',
  restaurant_host: 'Restaurant Host',
  entrance_host: 'Entrance Host',
  silent_disco: 'Silent Disco',
  foodtruck: 'Foodtruck',
  personeel: 'Personeelsleverancier',
}

const DAGEN = ['vrijdag', 'zaterdag', 'zondag']

const FAQ_CATEGORIEEN = ['logistiek', 'systemen', 'huisregels', 'catering', 'algemeen']
const DOC_CATEGORIEEN = ['draaiboek', 'plattegrond', 'huisstijl', 'contracten', 'overig']

function genPassword() {
  const woorden = ['Wijn', 'Druif', 'Kurk', 'Glas', 'Vat', 'Oogst', 'Terroir', 'Proost']
  const w = woorden[Math.floor(Math.random() * woorden.length)]
  const n = Math.floor(1000 + Math.random() * 9000)
  return `${w}${n}!`
}

function TicketCodesCell({ partner, onSave }: { partner: any; onSave: (codes: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState((partner as any).ticket_codes || '')

  const save = async () => {
    const { error } = await supabase.from('partners').update({ ticket_codes: val } as any).eq('id', partner.id)
    if (error) { alert('Opslaan mislukt: ' + error.message); return }
    onSave(val)
    setEditing(false)
  }

  const codes = val ? val.split(',').filter(Boolean) : []

  if (editing) return (
    <div style={{ minWidth: '180px' }}>
      <textarea value={val} onChange={e => setVal(e.target.value)} placeholder="CODE1,CODE2,CODE3"
        style={{ width: '100%', padding: '6px 8px', fontSize: '11px', fontFamily: 'monospace', border: '1px solid #ddd', height: '70px', resize: 'vertical' }} />
      <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
        <button onClick={save} style={{ padding: '4px 10px', background: '#010341', color: 'white', border: 'none', fontSize: '10px', cursor: 'pointer' }}>Opslaan</button>
        <button onClick={() => setEditing(false)} style={{ padding: '4px 10px', background: 'transparent', border: '1px solid #ddd', fontSize: '10px', cursor: 'pointer' }}>Annuleer</button>
      </div>
    </div>
  )

  return (
    <div style={{ cursor: 'pointer' }} onClick={() => setEditing(true)}>
      {codes.length > 0
        ? <span style={{ fontSize: '11px', color: '#2d8a4e', fontWeight: '600' }}>{codes.length} codes</span>
        : <span style={{ fontSize: '11px', color: '#bbb' }}>+ Toevoegen</span>}
    </div>
  )
}

function KortingscodeCell({ partner, onSave }: { partner: Partner; onSave: (code: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(partner.kortingscode || '')
  const save = async () => {
    const { error } = await supabase.from('partners').update({ kortingscode: val || null }).eq('id', partner.id)
    if (error) { alert('Opslaan mislukt: ' + error.message); return }
    onSave(val)
    setEditing(false)
  }
  if (editing) return (
    <div style={{ display: 'flex', gap: '4px', minWidth: '140px' }}>
      <input value={val} onChange={e => setVal(e.target.value.toUpperCase())} placeholder="EIGENCODE"
        style={{ width: '100%', padding: '5px 7px', fontSize: '11px', fontFamily: 'monospace', border: '1px solid #ddd' }} />
      <button onClick={save} style={{ padding: '4px 8px', background: '#010341', color: 'white', border: 'none', fontSize: '10px', cursor: 'pointer' }}>✓</button>
    </div>
  )
  return (
    <div style={{ cursor: 'pointer' }} onClick={() => setEditing(true)}>
      {partner.kortingscode
        ? <span style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--navy)', fontWeight: '600' }}>{partner.kortingscode}</span>
        : <span style={{ fontSize: '11px', color: '#bbb' }}>standaard</span>}
    </div>
  )
}

export default function AdminPage() {
  const router = useRouter()
  const [partners, setPartners] = useState<Partner[]>([])
  // Niet-opgeslagen wijzigingen per partner-id, zodat het detailscherm een
  // expliciete Opslaan-knop kan tonen in plaats van losse velden die stil
  // wegschrijven bij onBlur (daardoor was nooit duidelijk of iets echt lukte).
  const [partnerDraft, setPartnerDraft] = useState<Record<string, Partial<Partner>>>({})
  const [partnerSaving, setPartnerSaving] = useState(false)
  const [vragen, setVragen] = useState<PartnerVraag[]>([])
  const [producten, setProducten] = useState<Product[]>([])
  const [faqItems, setFaqItems] = useState<FAQ[]>([])
  const [teksten, setTeksten] = useState<PortalTekst[]>([])
  const [admins, setAdmins] = useState<Admin[]>([])
  const [documenten, setDocumenten] = useState<Document[]>([])
  const [log, setLog] = useState<ActiviteitLog[]>([])
  const [crew, setCrew] = useState<CrewLid[]>([])
  const [extraBestellingen, setExtraBestellingen] = useState<{ id: string; partner_id: string; product: string; aantal: number; prijs_per_stuk: number; status: string }[]>([])
  const [crewcatering, setCrewcatering] = useState<{ id: string; partner_id: string; avond: string; aantal_personen: number; dieetwensen: string | null }[]>([])
  const [internCrew, setInternCrew] = useState<{ naam: string; functie: string; email: string; dagen: string[]; catering_dagen: string[]; dieet: string }>({ naam: '', functie: '', email: '', dagen: [], catering_dagen: [], dieet: '' })
  const [mijnNaam, setMijnNaam] = useState('')
  const [activeTab, setActiveTab] = useState('start')
  // Subweergaven binnen samengevoegde tabs: Partners (lijst/toevoegen/exports),
  // Info & documenten (faq/teksten/documenten) en Vragen (partners/bezoekers).
  const [partnersView, setPartnersView] = useState<'lijst' | 'toevoegen' | 'export'>('lijst')
  const [infoTab, setInfoTab] = useState<'faq' | 'teksten' | 'documenten'>('faq')
  const [vragenTab, setVragenTab] = useState<'partners' | 'bezoekers'>('partners')
  const [studioTab, setStudioTab] = useState<'schrijfstijl' | 'carousel' | 'huisstijl'>('schrijfstijl')
  const [appTab, setAppTab] = useState<'instellingen' | 'cijfers' | 'push' | 'advertenties'>('instellingen')
  const [statusTab, setStatusTab] = useState<'status' | 'activiteit'>('status')
  // Per thema onthouden op welk onderdeel je zat, zodat je bij terugkeren
  // verder gaat waar je was in plaats van steeds op het eerste tabblad.
  const [laatsteBlad, setLaatsteBlad] = useState<Record<string, string>>({})
  const [appMetrics, setAppMetrics] = useState<any>(null)
  const [appMetricsLoading, setAppMetricsLoading] = useState(false)
  // Kassa & omzet (festival_pos koppeling)
  const [bridgedPartnerIds, setBridgedPartnerIds] = useState<Set<string>>(new Set())
  const [floors, setFloors] = useState<PriceFloor[]>([])
  const [floorDraft, setFloorDraft] = useState<Record<string, { euro: string; active: boolean }>>({})
  const [settlement, setSettlement] = useState<SettlementRow[]>([])
  const [kassaLoaded, setKassaLoaded] = useState(false)
  const [kassaFout, setKassaFout] = useState('')
  const [kassaBusy, setKassaBusy] = useState('')
  // Status (mission control)
  const [health, setHealth] = useState<{ ok: boolean; systems: { key: string; label: string; ok: boolean; detail: string }[] } | null>(null)
  const [healthLoading, setHealthLoading] = useState(false)
  const [healthTijd, setHealthTijd] = useState<Date | null>(null)
  const [loading, setLoading] = useState(true)
  const [saveMsg, setSaveMsg] = useState('')
  const [exportLoading, setExportLoading] = useState(false)
  const [newPartner, setNewPartner] = useState({
    naam: '', bedrijfsnaam: '', email: '', type: 'wijn', pakket: 'own_bar', avond: 'alle', gratis_tickets: '20', crew_tickets: '0', afdracht_percentage: '25', standplaats_vergoeding: '', barlocatie: '', notities: ''
  })
  const [antwoordMap, setAntwoordMap] = useState<Record<string, string>>({})
  const [invite, setInvite] = useState({ email: '', type: 'wijn' })
  const [inviting, setInviting] = useState(false)
  const [genAantal, setGenAantal] = useState('')
  const [newProduct, setNewProduct] = useState({ naam: '', omschrijving: '', prijs: '', eenheid: 'stuk' })
  const [newFaq, setNewFaq] = useState({ vraag: '', antwoord: '', categorie: 'logistiek' })
  const [tekstDraft, setTekstDraft] = useState<Record<string, string>>({})
  const [newTeamlid, setNewTeamlid] = useState({ email: '', naam: '' })
  // Rechten voor een nieuw teamlid, al bij het uitnodigen. null = alles.
  const [newTeamlidRechten, setNewTeamlidRechten] = useState<Gebied[] | null>(null)
  // null = volledige toegang (alle huidige admins). Een array betekent beperkt.
  const [mijnRechten, setMijnRechten] = useState<Gebied[] | null>(null)
  const [mijnEmail, setMijnEmail] = useState('')
  const [rechtenOpen, setRechtenOpen] = useState<string | null>(null)
  const [pwOpen, setPwOpen] = useState<string | null>(null)
  const [pwVeld, setPwVeld] = useState<Record<string, string>>({})
  const [pwBezig, setPwBezig] = useState<string | null>(null)
  const [linkGestuurd, setLinkGestuurd] = useState<Record<string, number>>({})
  const magTab = (tab: string) => heeftTab(mijnRechten, tab)
  // De samengevoegde Vragen-tab is zichtbaar als je bij partnervragen ÓF bij
  // bezoekersvragen mag; binnenin filtert vragenTab op het juiste recht.
  const magView = (tab: string) => {
    if (tab === 'vragen') return heeftTab(mijnRechten, 'vragen') || heeftTab(mijnRechten, 'bezoekersvragen')
    // Bezoekers-app bundelt cijfers (gebied bezoekers) met push/advertenties
    // (gebied marketing); zichtbaar zodra je één van beide mag.
    if (tab === 'app') return heeftTab(mijnRechten, 'app') || heeftTab(mijnRechten, 'appmarketing')
    return heeftTab(mijnRechten, tab)
  }
  const [docUpload, setDocUpload] = useState({ naam: '', categorie: 'draaiboek', file: null as File | null })
  const [uploading, setUploading] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [partnerDocs, setPartnerDocs] = useState<Document[]>([])
  const [pDocUpload, setPDocUpload] = useState({ naam: '', file: null as File | null })
  const [pUploading, setPUploading] = useState(false)
  const flash = (m: string, ms = 3500) => { setSaveMsg(m); setTimeout(() => setSaveMsg(''), ms) }

  const stuurWelkomstmail = async (email: string, naam: string, isFood = false): Promise<{ ok: boolean; error?: string }> => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/welkomstmail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({ email, naam, isFood }),
      })
      const j = await res.json().catch(() => ({}))
      return res.ok ? { ok: true } : { ok: false, error: j.error }
    } catch (e) { return { ok: false, error: (e as Error)?.message } }
  }

  const loadAll = async (rechten: Gebied[] | null = mijnRechten) => {
    // Alleen ophalen waar deze gebruiker recht op heeft. RLS zou het anders
    // toch blokkeren, maar dan met een lege lijst en onnodige verzoeken.
    const leeg = Promise.resolve({ data: [] as never[] })
    const magPartners = heeftTab(rechten, 'partners')
    const magBeheer = heeftTab(rechten, 'team')
    const [p, v, pr, f, t, a, d, l, cw, eb, cc] = await Promise.all([
      magPartners ? supabase.from('partners').select('*').order('created_at', { ascending: false }) : leeg,
      magPartners ? supabase.from('partner_vragen').select('*').order('created_at', { ascending: false }) : leeg,
      magPartners ? supabase.from('producten_catalogus').select('*').order('volgorde') : leeg,
      magPartners ? supabase.from('faq').select('*').order('categorie').order('volgorde') : leeg,
      magPartners ? supabase.from('portal_teksten').select('*').order('volgorde') : leeg,
      magBeheer ? supabase.from('admins').select('*').order('created_at') : leeg,
      magPartners ? supabase.from('documenten').select('*').order('created_at', { ascending: false }) : leeg,
      magBeheer ? supabase.from('activiteit_log').select('*').order('created_at', { ascending: false }).limit(300) : leeg,
      magPartners ? supabase.from('crew').select('*').order('created_at') : leeg,
      magPartners ? supabase.from('extra_bestellingen').select('id, partner_id, product, aantal, prijs_per_stuk, status').order('created_at', { ascending: false }) : leeg,
      magPartners ? supabase.from('crewcatering').select('id, partner_id, avond, aantal_personen, dieetwensen') : leeg,
    ])
    setPartners(p.data || []); setVragen(v.data || []); setProducten(pr.data || [])
    setFaqItems(f.data || []); setTeksten(t.data || []); setAdmins(a.data || []); setDocumenten(d.data || [])
    setLog(l.data || []); setCrew(cw.data || [])
    setExtraBestellingen(eb.data || []); setCrewcatering(cc.data || [])
    const td: Record<string, string> = {}
    ;(t.data || []).forEach((x: PortalTekst) => { td[x.sleutel] = x.waarde })
    setTekstDraft(td)
  }

  const refreshLog = async () => {
    const { data } = await supabase.from('activiteit_log').select('*').order('created_at', { ascending: false }).limit(300)
    setLog(data || [])
  }

  // Val terug naar Start zodra de actieve tab niet (meer) mag. Vangt zowel een
  // gedeelde link als het moment waarop iemands rechten net zijn ingeperkt.
  useEffect(() => {
    if (!loading && !magView(activeTab)) setActiveTab('start')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mijnRechten, activeTab, loading])

  // Wie alleen bezoekersvragen mag zien, landt in de Vragen-tab direct daar.
  useEffect(() => {
    if (activeTab === 'vragen' && !heeftTab(mijnRechten, 'vragen')) setVragenTab('bezoekers')
  }, [activeTab, mijnRechten])

  // Zelfde voor de Bezoekers-app: zonder bezoekers-recht direct naar Push.
  useEffect(() => {
    if (activeTab === 'app' && !heeftTab(mijnRechten, 'app')) setAppTab('push')
  }, [activeTab, mijnRechten])

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }
      const { data: isAdmin } = await supabase.rpc('is_admin')
      if (!isAdmin) { router.push('/dashboard'); return }
      // Rechten via een eigen functie, niet via de admins-tabel: wie geen
      // beheer-recht heeft mag die tabel namelijk niet lezen.
      const { data: rechten } = await supabase.rpc('mijn_rechten')
      const rechtenLijst = (rechten as Gebied[] | null) ?? null
      setMijnRechten(rechtenLijst)
      const { data: me } = await supabase.from('admins').select('naam').eq('email', user.email).maybeSingle()
      setMijnNaam(me?.naam || user.email || '')
      setMijnEmail(user.email || '')
      await loadAll(rechtenLijst)
      setLoading(false)
    }
    init()
  }, [router])

  // Bezoekers-app cijfers laden zodra de tab opent.
  // Staat hier BOVEN de vroege loading-return: hooks moeten elke render in
  // dezelfde volgorde komen, anders crasht React (error 310).
  useEffect(() => {
    if (activeTab === 'app' && !appMetrics && !appMetricsLoading) {
      setAppMetricsLoading(true)
      supabase.rpc('app_metrics').then(({ data }) => { setAppMetrics(data); setAppMetricsLoading(false) })
    }
  }, [activeTab, appMetrics, appMetricsLoading])

  // ---- Kassa & omzet ----
  const laadKassa = async () => {
    try {
      const [merchants, fl, st] = await Promise.all([
        posSelect<{ id: string; partner_id: string | null }>('merchants?select=id,partner_id&partner_id=not.is.null'),
        posSelect<PriceFloor>('price_floors?select=key,label,min_cents,active'),
        posRpc<{ ok: boolean; partners: SettlementRow[] }>('partner_settlement'),
      ])
      setBridgedPartnerIds(new Set(merchants.map(m => m.partner_id!).filter(Boolean)))
      const volgorde = ['half_glas', 'heel_glas', 'fles', 'food_item']
      const sorted = [...fl].sort((a, b) => volgorde.indexOf(a.key) - volgorde.indexOf(b.key))
      setFloors(sorted)
      const draft: Record<string, { euro: string; active: boolean }> = {}
      sorted.forEach(f => { draft[f.key] = { euro: (f.min_cents / 100).toFixed(2).replace('.', ','), active: f.active } })
      setFloorDraft(draft)
      setSettlement(st.ok ? st.partners : [])
      setKassaFout('')
    } catch (e) {
      setKassaFout((e as Error).message)
    }
  }
  useEffect(() => {
    if (activeTab === 'kassa' && !kassaLoaded) { setKassaLoaded(true); laadKassa() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  // ---- Status (mission control) ----
  const laadStatus = async () => {
    setHealthLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/health`, {
        headers: { Authorization: `Bearer ${session?.access_token || ''}`, apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '' },
      })
      const j = await res.json()
      setHealth(j)
      setHealthTijd(new Date())
    } catch {
      setHealth(null)
    } finally {
      setHealthLoading(false)
    }
  }
  useEffect(() => {
    if (activeTab !== 'status' && activeTab !== 'start') return
    laadStatus()
    const iv = setInterval(laadStatus, 60000)
    return () => clearInterval(iv)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  const koppelPartner = async (p: Partner) => {
    if (!p.user_id) { flash('Deze partner heeft nog geen login. Stuur eerst een inlogmail via Partners.', 7000); return }
    setKassaBusy(p.id)
    try {
      const res = await posRpc<{ ok: boolean; error?: string; wijnen?: number; gerechten?: number; overgeslagen?: string[] }>('bridge_partner', { p_partner_id: p.id })
      if (!res.ok) {
        flash('Koppelen mislukte: ' + (res.error === 'partner_heeft_geen_login' ? 'deze partner heeft nog geen login' : res.error || 'onbekende fout'), 8000)
      } else {
        const over = res.overgeslagen || []
        flash(`${p.bedrijfsnaam} is gekoppeld aan de kassa. ${res.wijnen || 0} wijnen en ${res.gerechten || 0} gerechten staan erin.${over.length ? ` Let op, overgeslagen: ${over.join(' · ')}` : ''}`, 10000)
        await laadKassa()
      }
    } catch (e) {
      flash('Koppelen mislukte: ' + (e as Error).message, 8000)
    } finally {
      setKassaBusy('')
    }
  }

  const saveFloor = async (key: string) => {
    const d = floorDraft[key]
    if (!d) return
    const cents = Math.round(parseFloat((d.euro || '0').replace(',', '.')) * 100)
    if (isNaN(cents) || cents < 0) { flash('Vul een geldig bedrag in.'); return }
    try {
      await posPatch(`price_floors?key=eq.${encodeURIComponent(key)}`, { min_cents: cents, active: d.active })
      flash('Minimumprijs opgeslagen. Geldt direct voor alle partners.')
      await laadKassa()
    } catch (e) {
      flash('Opslaan mislukte: ' + (e as Error).message, 7000)
    }
  }

  const exportSettlementCsv = () => {
    const kop = 'Partner;Omzet;Terugbetaald;Netto;Afdracht %;Afdracht;Uit te betalen;Verkopen'
    const eu = (c: number) => (c / 100).toFixed(2).replace('.', ',')
    const regels = settlement.map(r => {
      const netto = r.omzet_cents - r.refunded_cents
      const afdracht = Math.round(netto * r.afdracht_percentage / 100)
      return [r.partner_naam, eu(r.omzet_cents), eu(r.refunded_cents), eu(netto), r.afdracht_percentage, eu(afdracht), eu(netto - afdracht), r.order_count].join(';')
    })
    const blob = new Blob(['﻿' + [kop, ...regels].join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `uitbetaaloverzicht-nvdw-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  // ---- Partners ----
  const handleAddPartner = async () => {
    if (!newPartner.naam || !newPartner.bedrijfsnaam || !newPartner.email) return
    const { data, error } = await supabase.from('partners').insert({
      naam: newPartner.naam, bedrijfsnaam: newPartner.bedrijfsnaam, email: newPartner.email,
      type: newPartner.type, pakket: newPartner.pakket, avond: newPartner.avond,
      gratis_tickets: parseInt(newPartner.gratis_tickets), crew_tickets: parseInt(newPartner.crew_tickets || "0"), afdracht_percentage: parseInt(newPartner.afdracht_percentage),
      standplaats_vergoeding: newPartner.type === 'food' && newPartner.standplaats_vergoeding ? parseFloat(newPartner.standplaats_vergoeding) : null,
      barlocatie: newPartner.barlocatie || null, notities: newPartner.notities || null,
    }).select().single()
    if (!error && data) {
      setPartners([data, ...partners])
      setNewPartner({ naam: '', bedrijfsnaam: '', email: '', type: 'wijn', pakket: 'own_bar', avond: 'alle', gratis_tickets: '20', crew_tickets: '0', afdracht_percentage: '25', standplaats_vergoeding: '', barlocatie: '', notities: '' })
      flash('Partner aangemaakt. Maak nu een login aan via de knop in het overzicht.', 6000)
      setActiveTab('partners'); setPartnersView('lijst')
    } else if (error) {
      flash('Fout: ' + error.message, 6000)
    }
  }

  const snelUitnodigen = async () => {
    const email = invite.email.trim().toLowerCase()
    if (!email) return
    setInviting(true)
    const pakket = invite.type === 'food' ? 'foodtruck' : invite.type === 'personeel' ? 'personeel' : 'own_bar'
    const { data, error } = await supabase.from('partners').insert({
      naam: '', bedrijfsnaam: email, email, type: invite.type, pakket, avond: 'alle',
    }).select().single()
    if (error) { flash('Fout: ' + error.message, 6000); setInviting(false); return }
    setPartners([data, ...partners])
    await stuurInlog(data)
    await loadAll()
    setInvite({ email: '', type: 'wijn' })
    setInviting(false)
  }

  const stuurInlog = async (p: Partner) => {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/partner-invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}`, apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '' },
      body: JSON.stringify({ partner_id: p.id }),
    })
    const j = await res.json().catch(() => ({}))
    if (res.ok && j.ok) { setPartners(partners.map(x => x.id === p.id ? { ...x, user_id: x.user_id || 'set' } : x)); flash(`Inlogmail met inloggegevens verstuurd naar ${p.email}.`, 8000) }
    else flash('Versturen mislukt: ' + (j.error || res.status), 8000)
  }

  const genTicketCode = () => 'NVDW-' + Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('')
  const genereerTicketcodes = async (p: Partner, aantal: number) => {
    if (!aantal || aantal < 1) { flash('Vul een aantal in.'); return }
    if ((p as any).ticket_codes && !confirm('Er staan al ticketcodes. Vervangen door nieuwe?')) return
    const codes: string[] = []
    while (codes.length < aantal) { const c = genTicketCode(); if (!codes.includes(c)) codes.push(c) }
    const val = codes.join(',')
    const { error } = await supabase.from('partners').update({ ticket_codes: val } as any).eq('id', p.id)
    if (error) { flash('Genereren mislukt: ' + error.message, 8000); return }
    setPartners(partners.map(x => x.id === p.id ? ({ ...x, ticket_codes: val } as any) : x))
    setPartnerDraft(d => { if (!d[p.id]?.hasOwnProperty('ticket_codes')) return d; const nd = { ...d, [p.id]: { ...d[p.id] } }; delete (nd[p.id] as any).ticket_codes; return nd })
    flash(`${aantal} ticketcodes gegenereerd`)
  }

  const openPartner = async (id: string) => {
    setSelectedId(id)
    const { data } = await supabase.from('documenten').select('*').eq('partner_id', id).order('created_at', { ascending: false })
    setPartnerDocs(data || [])
  }

  // Waarde die het detailscherm laat zien: opgeslagen data + eventuele
  // niet-opgeslagen wijzigingen uit het draft.
  const partnerDraftValue = (p: Partner) => ({ ...p, ...(partnerDraft[p.id] || {}) })
  const setPartnerDraftField = (id: string, patch: Partial<Partner>) => {
    setPartnerDraft(d => ({ ...d, [id]: { ...(d[id] || {}), ...patch } }))
  }
  const isPartnerDirty = (id: string) => !!partnerDraft[id] && Object.keys(partnerDraft[id]).length > 0
  const savePartnerDraft = async (p: Partner) => {
    const patch = partnerDraft[p.id]
    if (!patch || Object.keys(patch).length === 0) return
    setPartnerSaving(true)
    const { error } = await supabase.from('partners').update(patch).eq('id', p.id)
    setPartnerSaving(false)
    if (error) { flash('Opslaan mislukt: ' + error.message, 8000); return }
    setPartners(partners.map(x => x.id === p.id ? { ...x, ...patch } : x))
    setPartnerDraft(d => { const nd = { ...d }; delete nd[p.id]; return nd })
    flash('Wijzigingen opgeslagen')
  }
  const deletePartner = async (p: Partner) => {
    // Eerst tellen wat er aan deze partner hangt. Dat verdwijnt namelijk mee,
    // en dat hoor je te weten voordat je klikt.
    const tel = async (tabel: string) => {
      const { count } = await supabase.from(tabel).select('id', { count: 'exact', head: true }).eq('partner_id', p.id)
      return count || 0
    }
    const [wijnen, gerechten, crewleden, docs, bestellingen, vragenVanPartner] = await Promise.all([
      tel('wijnlijst'), tel('menukaart'), tel('crew'), tel('documenten'), tel('extra_bestellingen'), tel('partner_vragen'),
    ])
    const gaatMee = [
      wijnen && `${wijnen} ${wijnen === 1 ? 'wijn' : 'wijnen'}`,
      gerechten && `${gerechten} ${gerechten === 1 ? 'gerecht' : 'gerechten'}`,
      crewleden && `${crewleden} ${crewleden === 1 ? 'crewlid' : 'crewleden'}`,
      docs && `${docs} ${docs === 1 ? 'document' : 'documenten'}`,
      bestellingen && `${bestellingen} ${bestellingen === 1 ? 'bestelling' : 'bestellingen'}`,
      vragenVanPartner && `${vragenVanPartner} ${vragenVanPartner === 1 ? 'vraag' : 'vragen'}`,
    ].filter(Boolean) as string[]
    const melding = gaatMee.length > 0
      ? `"${p.bedrijfsnaam}" verwijderen?\n\nDit verdwijnt mee: ${gaatMee.join(', ')}.\n\nAl verkochte tickets en orders blijven bestaan, die raken alleen de koppeling met deze partner kwijt. Dit kan niet ongedaan gemaakt worden.`
      : `"${p.bedrijfsnaam}" verwijderen? Er hangt verder niets aan. Dit kan niet ongedaan gemaakt worden.`
    if (!confirm(melding)) return
    const { error } = await supabase.from('partners').delete().eq('id', p.id)
    if (error) { flash('Verwijderen mislukt: ' + error.message, 10000); return }
    setPartners(partners.filter(x => x.id !== p.id))
    setPartnerDraft(d => { const nd = { ...d }; delete nd[p.id]; return nd })
    setSelectedId(null)
    flash(`"${p.bedrijfsnaam}" is verwijderd`)
  }

  const uploadPartnerDoc = async (partnerId: string) => {
    if (!pDocUpload.file) return
    setPUploading(true)
    const file = pDocUpload.file
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `partner/${partnerId}/${Date.now()}_${safe}`
    const { error: upErr } = await supabase.storage.from('documenten').upload(path, file)
    if (upErr) { flash('Upload mislukt: ' + upErr.message, 6000); setPUploading(false); return }
    const { data, error } = await supabase.from('documenten').insert({
      naam: pDocUpload.naam || file.name, categorie: 'persoonlijk', bestandsnaam: file.name, storage_path: path, partner_id: partnerId,
    }).select().single()
    if (!error && data) { setPartnerDocs([data, ...partnerDocs]); setPDocUpload({ naam: '', file: null }); flash('Persoonlijk document geüpload') }
    setPUploading(false)
  }

  const deletePartnerDoc = async (d: Document) => {
    if (!confirm('Document verwijderen?')) return
    await supabase.storage.from('documenten').remove([d.storage_path])
    await supabase.from('documenten').delete().eq('id', d.id)
    setPartnerDocs(partnerDocs.filter(x => x.id !== d.id)); flash('Verwijderd')
  }

  const bekijkDoc = async (d: Document) => {
    const { data } = await supabase.storage.from('documenten').createSignedUrl(d.storage_path, 120)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  // ---- Vragen ----
  const handleAntwoord = async (vraagId: string) => {
    const antwoord = antwoordMap[vraagId]
    if (!antwoord) return
    const { error } = await supabase.from('partner_vragen').update({ antwoord, status: 'beantwoord', antwoord_datum: new Date().toISOString() }).eq('id', vraagId)
    if (!error) { setVragen(vragen.map(v => v.id === vraagId ? { ...v, antwoord, status: 'beantwoord' } : v)); flash('Antwoord opgeslagen') }
  }

  // ---- Producten ----
  const addProduct = async () => {
    if (!newProduct.naam || !newProduct.prijs) return
    const { data, error } = await supabase.from('producten_catalogus').insert({
      naam: newProduct.naam, omschrijving: newProduct.omschrijving || null,
      prijs: parseFloat(newProduct.prijs), eenheid: newProduct.eenheid, volgorde: producten.length + 1,
    }).select().single()
    if (!error && data) { setProducten([...producten, data]); setNewProduct({ naam: '', omschrijving: '', prijs: '', eenheid: 'stuk' }); flash('Product toegevoegd') }
  }
  const updateProduct = async (id: string, patch: Partial<Product>) => {
    const { error } = await supabase.from('producten_catalogus').update(patch).eq('id', id)
    if (error) { flash('Opslaan mislukt: ' + error.message, 8000); return }
    setProducten(producten.map(p => p.id === id ? { ...p, ...patch } : p))
    flash('Opgeslagen')
  }
  const deleteProduct = async (id: string) => {
    if (!confirm('Product verwijderen?')) return
    await supabase.from('producten_catalogus').delete().eq('id', id)
    setProducten(producten.filter(p => p.id !== id)); flash('Verwijderd')
  }

  // ---- FAQ ----
  const addFaq = async () => {
    if (!newFaq.vraag || !newFaq.antwoord) return
    const max = Math.max(0, ...faqItems.filter(f => f.categorie === newFaq.categorie).map(f => f.volgorde))
    const { data, error } = await supabase.from('faq').insert({ vraag: newFaq.vraag, antwoord: newFaq.antwoord, categorie: newFaq.categorie, volgorde: max + 1, actief: true }).select().single()
    if (!error && data) { setFaqItems([...faqItems, data]); setNewFaq({ vraag: '', antwoord: '', categorie: 'logistiek' }); flash('FAQ toegevoegd') }
  }
  const updateFaq = async (id: string, patch: Partial<FAQ>) => {
    const { error } = await supabase.from('faq').update(patch).eq('id', id)
    if (error) { flash('Opslaan mislukt: ' + error.message, 8000); return }
    setFaqItems(faqItems.map(f => f.id === id ? { ...f, ...patch } : f))
    flash('Opgeslagen')
  }
  const deleteFaq = async (id: string) => {
    if (!confirm('Vraag verwijderen?')) return
    await supabase.from('faq').delete().eq('id', id)
    setFaqItems(faqItems.filter(f => f.id !== id)); flash('Verwijderd')
  }

  // ---- Teksten ----
  const saveTekst = async (sleutel: string) => {
    const waarde = tekstDraft[sleutel] ?? ''
    await supabase.from('portal_teksten').update({ waarde, updated_at: new Date().toISOString() }).eq('sleutel', sleutel)
    setTeksten(teksten.map(t => t.sleutel === sleutel ? { ...t, waarde } : t))
    flash('Tekst opgeslagen')
  }

  // ---- Team ----
  const addTeamlid = async () => {
    if (!newTeamlid.email || !newTeamlid.naam) return
    if (newTeamlidRechten !== null && newTeamlidRechten.length === 0) { flash('Vink minstens één gebied aan, of kies volledige toegang.', 6000); return }
    const pw = genPassword()
    const { error } = await supabase.rpc('admin_create_teamlid', { p_email: newTeamlid.email, p_naam: newTeamlid.naam, p_temp_password: pw })
    if (error) { flash('Fout: ' + error.message, 6000); return }
    // Rechten direct inperken, vóór de welkomstmail de deur uit is: zo heeft
    // een beperkte login nooit — ook niet heel even — volledige toegang.
    if (newTeamlidRechten !== null) {
      const { error: rErr } = await supabase.from('admins').update({ rechten: newTeamlidRechten } as never).eq('email', newTeamlid.email.trim().toLowerCase())
      if (rErr) { flash('Login is aangemaakt, maar rechten inperken mislukte: ' + rErr.message + '. Pas ze direct aan via de Toegang-knop.', 12000) }
    }
    const mail = await stuurWelkomstmail(newTeamlid.email, newTeamlid.naam, false)
    await loadAll()
    if (mail.ok) flash(`${newTeamlid.naam} toegevoegd — welkomstmail verstuurd naar ${newTeamlid.email}.`, 8000)
    else flash(`${newTeamlid.naam} toegevoegd. Mail nog niet actief — login: ${newTeamlid.email} / wachtwoord: ${pw} (deel handmatig).`, 15000)
    setNewTeamlid({ email: '', naam: '' })
    setNewTeamlidRechten(null)
  }
  const toggleAdmin = async (a: Admin) => {
    await supabase.from('admins').update({ actief: !a.actief }).eq('id', a.id)
    setAdmins(admins.map(x => x.id === a.id ? { ...x, actief: !a.actief } : x))
  }
  // Rechten van een teamlid aanpassen. null = alles mogen.
  const zetRechten = async (a: Admin, rechten: Gebied[] | null) => {
    const { error } = await supabase.from('admins').update({ rechten } as never).eq('id', a.id)
    if (error) { flash('Opslaan mislukte: ' + error.message, 7000); return }
    setAdmins(admins.map(x => x.id === a.id ? ({ ...x, rechten } as Admin) : x))
    if (a.email.toLowerCase() === (mijnEmail || '').toLowerCase()) setMijnRechten(rechten)
  }
  const samenvattingRechten = (a: Admin) => {
    const r = (a as Admin & { rechten: Gebied[] | null }).rechten
    if (r === null) return 'Alles'
    if (!r.length) return 'Niets'
    if (r.length === GEBIEDEN.length) return 'Alles'
    return r.map(id => GEBIEDEN.find(g => g.id === id)?.naam || id).join(', ')
  }

  const stuurTeamToegang = async (a: Admin, type: 'recovery' | 'magiclink') => {
    // Per persoon is er maar één link geldig: een nieuwe maakt de vorige dood.
    // Twee mails achter elkaar sturen is dus precies hoe je iemand "link
    // verlopen" laat zien, en daarom waarschuwen we vooraf.
    const vorige = linkGestuurd[a.email]
    if (vorige && Date.now() - vorige < 30 * 60 * 1000) {
      const min = Math.max(1, Math.round((Date.now() - vorige) / 60000))
      const ok = confirm(
        `Er is ${min} ${min === 1 ? 'minuut' : 'minuten'} geleden al een link naar ${a.email} gestuurd.\n\n` +
        `Als je nu een nieuwe stuurt, werkt de vorige mail niet meer. Klikt ${a.naam || 'de ontvanger'} dan op de oudste mail, ` +
        `dan ziet die "link verlopen".\n\nToch een nieuwe sturen?`
      )
      if (!ok) return
    }
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/team-toegang', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
      body: JSON.stringify({ email: a.email, naam: a.naam, type }),
    })
    const j = await res.json().catch(() => ({}))
    if (res.ok && j.ok) {
      setLinkGestuurd(x => ({ ...x, [a.email]: Date.now() }))
      flash(`${type === 'recovery' ? 'Wachtwoord-link' : 'Magic link'} verstuurd naar ${a.email}. Laat ${a.naam || 'de ontvanger'} de nieuwste mail gebruiken; oudere links werken niet meer.`, 10000)
    }
    else flash('Versturen mislukt: ' + (j.error || res.status), 8000)
  }

  // Zelf een wachtwoord zetten. Geen mail, geen link die stuk kan.
  const nieuwWachtwoord = () => {
    const tekens = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    return Array.from(bytes, b => tekens[b % tekens.length]).join('')
  }

  const zetWachtwoord = async (a: Admin) => {
    const pw = pwVeld[a.id] || ''
    if (pw.length < 12) { flash('Kies een wachtwoord van minstens 12 tekens, of klik op Genereer.', 6000); return }
    if (!confirm(`Wachtwoord van ${a.naam || a.email} nu instellen?\n\nDe huidige inlog werkt daarna niet meer. Geef het nieuwe wachtwoord zelf aan ${a.naam || 'deze persoon'} door.`)) return
    setPwBezig(a.id)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/team-wachtwoord', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
      body: JSON.stringify({ email: a.email, wachtwoord: pw }),
    })
    const j = await res.json().catch(() => ({}))
    setPwBezig(null)
    if (res.ok && j.ok) flash(`Wachtwoord ingesteld voor ${a.naam || a.email}. Geef het nu door; hierna kun je het niet meer terugkijken.`, 12000)
    else flash('Instellen mislukt: ' + (j.error || res.status), 8000)
  }

  // ---- Documenten ----
  const uploadDoc = async () => {
    if (!docUpload.file) return
    setUploading(true)
    const file = docUpload.file
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${docUpload.categorie}/${Date.now()}_${safeName}`
    const { error: upErr } = await supabase.storage.from('documenten').upload(path, file)
    if (upErr) { flash('Upload mislukt: ' + upErr.message, 6000); setUploading(false); return }
    const { data, error } = await supabase.from('documenten').insert({
      naam: docUpload.naam || file.name, categorie: docUpload.categorie, bestandsnaam: file.name, storage_path: path,
    }).select().single()
    if (!error && data) { setDocumenten([data, ...documenten]); setDocUpload({ naam: '', categorie: 'draaiboek', file: null }); flash('Document geüpload') }
    setUploading(false)
  }
  const downloadDoc = async (d: Document) => {
    const { data } = await supabase.storage.from('documenten').createSignedUrl(d.storage_path, 120)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }
  const deleteDoc = async (d: Document) => {
    if (!confirm('Document verwijderen?')) return
    await supabase.storage.from('documenten').remove([d.storage_path])
    await supabase.from('documenten').delete().eq('id', d.id)
    setDocumenten(documenten.filter(x => x.id !== d.id)); flash('Verwijderd')
  }

  // ---- Export ----
  const handleExportTactile = async () => {
    setExportLoading(true)
    const { data: wijnen } = await supabase.from('wijnlijst').select('*, partners(bedrijfsnaam, pakket, avond, barlocatie)').order('partner_id').order('volgorde')
    if (!wijnen || wijnen.length === 0) { flash('Geen wijnen gevonden om te exporteren.'); setExportLoading(false); return }
    const headers = ['Partner', 'Pakket', 'Avond', 'Barlocatie', 'Wijn naam', 'Producent', 'Regio', 'Land', 'Druif', 'Jaar', 'Prijs half glas (€)', 'Prijs heel glas (€)', 'Prijs fles (€)', 'Omschrijving']
    const rows = wijnen.map((w: any) => [
      w.partners?.bedrijfsnaam || '', PAKKET_LABELS[w.partners?.pakket] || w.partners?.pakket || '', w.partners?.avond || '', w.partners?.barlocatie || '',
      w.naam || '', w.producent || '', w.regio || '', w.land || '', w.druif || '', w.jaar || '',
      w.prijs_half_glas?.toFixed(2) || '', w.prijs_heel_glas?.toFixed(2) || '', w.prijs_fles?.toFixed(2) || '', w.beschrijving || '',
    ])
    const csv = [headers, ...rows].map(r => r.map((c: any) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a'); link.href = url; link.download = `NvdW2026_wijnlijst_tactile_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url)
    flash(`Export klaar — ${wijnen.length} wijnen van ${new Set(wijnen.map((w: any) => w.partner_id)).size} partners.`, 4000)
    setExportLoading(false)
  }

  const handleExportMenukaart = async () => {
    setExportLoading(true)
    const { data: items } = await supabase.from('menukaart').select('*, partners(bedrijfsnaam, avond)').order('partner_id').order('volgorde')
    if (!items || items.length === 0) { flash('Geen gerechten gevonden om te exporteren.'); setExportLoading(false); return }
    const headers = ['Foodtruck', 'Avond', 'Gerecht', 'Omschrijving', 'Prijs (€)', 'Allergenen']
    const rows = items.map((m: any) => [
      m.partners?.bedrijfsnaam || '', m.partners?.avond || '', m.naam || '', m.omschrijving || '',
      m.prijs != null ? Number(m.prijs).toFixed(2) : '', (m.allergenen || []).join('; '),
    ])
    const csv = [headers, ...rows].map(r => r.map((c: any) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a'); link.href = url; link.download = `NvdW2026_menukaart_allergenen_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url)
    flash(`Export klaar — ${items.length} gerechten van ${new Set(items.map((m: any) => m.partner_id)).size} foodtrucks.`, 4000)
    setExportLoading(false)
  }

  // ---- Crew ----
  const toggleInternArr = (key: 'dagen' | 'catering_dagen', dag: string) => {
    setInternCrew(c => ({ ...c, [key]: c[key].includes(dag) ? c[key].filter(d => d !== dag) : [...c[key], dag] }))
  }
  const addInternCrew = async () => {
    if (!internCrew.naam) return
    const { data, error } = await supabase.from('crew').insert({
      partner_id: null, naam: internCrew.naam, functie: internCrew.functie || null, email: internCrew.email || null,
      dagen: internCrew.dagen, catering_dagen: internCrew.catering_dagen, dieet: internCrew.dieet || null,
    }).select().single()
    if (!error && data) { setCrew([...crew, data]); setInternCrew({ naam: '', functie: '', email: '', dagen: [], catering_dagen: [], dieet: '' }); flash('Eigen crewlid toegevoegd') }
    else if (error) flash('Fout: ' + error.message, 6000)
  }
  const deleteCrewLid = async (id: string) => {
    if (!confirm('Crewlid verwijderen?')) return
    await supabase.from('crew').delete().eq('id', id)
    setCrew(crew.filter(c => c.id !== id)); flash('Verwijderd')
  }
  const partnerNaam = (pid: string | null) => pid ? (partners.find(p => p.id === pid)?.bedrijfsnaam || 'Onbekend') : 'Eigen organisatie'
  const handleExportCrew = async () => {
    if (crew.length === 0) { flash('Geen crew om te exporteren.'); return }
    const headers = ['Bron', 'Naam', 'Functie', 'E-mail', 'Werkdagen', 'Crewcatering dagen', 'Dieet/allergie']
    const rows = crew.map(c => [partnerNaam(c.partner_id), c.naam, c.functie || '', c.email || '', (c.dagen || []).join('; '), (c.catering_dagen || []).join('; '), c.dieet || ''])
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a'); link.href = url; link.download = `NvdW2026_crewlijst_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url)
    flash(`Export klaar — ${crew.length} crewleden.`, 4000)
  }

  // Rustige SaaS-look in de NvdW-kleuren: kleur als accent, zachte kaarten,
  // ronde hoeken, geen schreeuwende uppercase meer.
  const S = {
    page: { display: 'flex', minHeight: '100vh', background: 'var(--sand)' } as React.CSSProperties,
    sidebar: { width: '224px', background: 'var(--navy)', flexShrink: 0 } as React.CSSProperties,
    sidebarTop: { padding: '22px 22px 18px', borderBottom: '1px solid rgba(255,255,255,0.07)' } as React.CSSProperties,
    logo: { fontSize: '10px', fontWeight: '700', letterSpacing: '2px', textTransform: 'uppercase' as const, color: 'var(--gold)' },
    adminLabel: { fontSize: '15px', fontWeight: '700', color: 'var(--cream)', marginTop: '3px', fontFamily: 'Fraunces, Georgia, serif' },
    navGroupTitel: { padding: '18px 20px 6px', fontSize: '10px', fontWeight: '700', letterSpacing: '1.5px', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.3)' } as React.CSSProperties,
    navItem: (active: boolean) => ({
      display: 'block', width: 'calc(100% - 20px)', margin: '2px 10px', padding: '10px 13px', textAlign: 'left' as const,
      background: active ? 'rgba(254,183,42,0.13)' : 'transparent',
      border: 'none', borderRadius: '9px',
      color: active ? 'var(--gold)' : 'rgba(255,255,255,0.62)',
      fontSize: '13.5px', fontWeight: active ? 650 : 500, letterSpacing: '0.1px',
      cursor: 'pointer', fontFamily: 'Inter, sans-serif',
    }),
    main: { flex: 1, padding: '30px 40px 60px', maxWidth: '1120px' } as React.CSSProperties,
    title: { fontFamily: 'Fraunces, Georgia, serif', fontSize: '25px', fontWeight: '700', letterSpacing: '-0.3px', color: 'var(--navy)', marginBottom: '5px' },
    sub: { fontSize: '13px', color: '#8b8574', marginBottom: '22px' },
    card: { background: 'var(--card)', padding: '22px 24px', marginBottom: '14px', borderRadius: '16px', border: '1px solid rgba(1,3,65,0.06)', boxShadow: '0 1px 2px rgba(1,3,65,0.04), 0 6px 20px rgba(1,3,65,0.03)' } as React.CSSProperties,
    cardTitle: { fontSize: '13.5px', fontWeight: '700', letterSpacing: '-0.1px', color: 'var(--navy)', marginBottom: '14px' },
    label: { display: 'block', fontSize: '12px', fontWeight: '600', letterSpacing: '0', color: '#777162', marginBottom: '5px', marginTop: '12px' },
    input: { width: '100%', padding: '8px 12px', border: '1px solid #e3dcc9', fontSize: '13px', fontFamily: 'Inter, sans-serif', outline: 'none', borderRadius: '9px', color: 'var(--navy)', background: '#fff' } as React.CSSProperties,
    btn: { padding: '9px 18px', background: 'var(--navy)', color: 'var(--cream)', border: 'none', fontSize: '13px', fontWeight: '600', letterSpacing: '0.1px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', borderRadius: '9px', marginTop: '16px' },
    btnSm: { padding: '5px 12px', background: 'transparent', color: 'var(--bordeaux)', border: '1px solid rgba(155,55,55,0.35)', fontSize: '12px', fontWeight: '600', letterSpacing: '0.1px', cursor: 'pointer', borderRadius: '8px' },
    grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' },
    grid3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' },
    table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: '13px' },
    th: { textAlign: 'left' as const, fontSize: '11px', fontWeight: '600', letterSpacing: '0.3px', color: '#9a9484', padding: '8px 12px', borderBottom: '1px solid rgba(1,3,65,0.1)' },
    td: { padding: '11px 12px', borderBottom: '1px solid rgba(1,3,65,0.05)', color: 'var(--navy)', verticalAlign: 'top' as const },
    badge: (ok: boolean) => ({ display: 'inline-block', padding: '2px 10px', fontSize: '11px', fontWeight: '600', borderRadius: '999px', background: ok ? '#e6f2e7' : '#fdf1df', color: ok ? '#2e7d32' : '#b26a00' }),
    successMsg: { background: '#e9f4ea', border: '1px solid #bcd9bf', color: '#2e7d32', padding: '11px 16px', borderRadius: '10px', fontSize: '13px', marginBottom: '20px', fontWeight: '600' } as React.CSSProperties,
  }

  if (loading) return <div style={{ padding: '40px' }}>Laden...</div>

  const openVragen = vragen.filter(v => v.status === 'open')

  // Subtab-balkje voor samengevoegde schermen (Partners, Info & documenten, Vragen).
  const subTabs = <T extends string>(opties: { id: T; label: string }[], actief: T, kies: (t: T) => void) => (
    <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
      {opties.map(o => (
        <button key={o.id} onClick={() => kies(o.id)} style={{
          padding: '7px 15px', fontSize: '12.5px', fontWeight: 600, letterSpacing: '0.1px', cursor: 'pointer',
          borderRadius: '999px', border: `1px solid ${actief === o.id ? 'var(--navy)' : 'rgba(1,3,65,0.15)'}`,
          background: actief === o.id ? 'var(--navy)' : '#fff',
          color: actief === o.id ? 'var(--cream)' : '#66604f', fontFamily: 'Inter, sans-serif',
        }}>{o.label}</button>
      ))}
    </div>
  )

  // Zeven knoppen in de zijbalk, meer niet: Start, Bezoekers-app en vijf
  // thema's. De onderdelen van een thema staan als tabs bovenaan het scherm.
  // Alleen tonen waar deze gebruiker recht op heeft — puur comfort, de echte
  // grens ligt in de database (RLS via mag()).
  const THEMAS: { id: string; label: string; leaves: { id: string; label: string }[] }[] = ([
    { id: 'thema-start', label: 'Start', leaves: [{ id: 'start', label: 'Start' }] },
    {
      id: 'thema-productie', label: 'Productie', leaves: [
        { id: 'programma', label: 'Programma' },
        { id: 'crewrooster', label: 'Crew-rooster' },
        { id: 'draaiboek', label: 'Draaiboek' },
        { id: 'crew', label: 'Crew & catering' },
        { id: 'leveranciers', label: 'Leveranciers' },
      ]
    },
    {
      id: 'thema-partners', label: 'Partners', leaves: [
        { id: 'partners', label: 'Partners' },
        { id: 'producten', label: 'Producten (extra’s)' },
        { id: 'partnerinfo', label: 'Info & documenten' },
        { id: 'vragen', label: `Vragen${openVragen.length > 0 ? ` (${openVragen.length})` : ''}` },
        { id: 'kassa', label: 'Kassa & omzet' },
      ]
    },
    {
      id: 'thema-marketing', label: 'Marketing', leaves: [
        { id: 'aankondigingen', label: 'Aankondigingen' },
        { id: 'studio', label: 'Content-studio' },
        { id: 'nieuwsbrief', label: 'Nieuwsbrief' },
        { id: 'attributie', label: 'Attributie & spend' },
        { id: 'app', label: 'Bezoekers-app' },
      ]
    },
    {
      id: 'thema-financieel', label: 'Financieel', leaves: [
        { id: 'financieel', label: 'Begroting & kosten' },
      ]
    },
    {
      id: 'thema-beheer', label: 'Beheer', leaves: [
        { id: 'todo', label: 'To-do' },
        { id: 'overleg', label: 'Overleg' },
        { id: 'status', label: 'Status & activiteit' },
        { id: 'team', label: 'Team' },
      ]
    },
  ])
    .map(t => ({ ...t, leaves: t.leaves.filter(l => magView(l.id)) }))
    .filter(t => t.leaves.length > 0)
  const actiefThema = THEMAS.find(t => t.leaves.some(l => l.id === activeTab))
  const kiesThema = (t: (typeof THEMAS)[number]) => {
    const onthouden = laatsteBlad[t.id]
    const doel = onthouden && t.leaves.some(l => l.id === onthouden) ? onthouden : t.leaves[0].id
    setActiveTab(doel)
  }
  const kiesBlad = (themaId: string, blad: string) => {
    setActiveTab(blad)
    setLaatsteBlad(x => ({ ...x, [themaId]: blad }))
  }

  const aantalFood = partners.filter(p => p.type === 'food').length
  const aantalWijn = partners.length - aantalFood
  const aantalLogins = partners.filter(p => p.user_id).length
  const aantalAkkoord = partners.filter(p => p.offerte_akkoord).length

  const logZin = (e: ActiviteitLog) => {
    const wat = LOG_TABEL_LABEL[e.tabel] || e.tabel
    const actie = LOG_ACTIE_LABEL[e.actie] || e.actie.toLowerCase()
    const wie = e.actor_naam || e.actor_email || 'iemand'
    return { wie, zin: `heeft ${wat} ${actie}${e.omschrijving ? `: ${e.omschrijving}` : ''}` }
  }

  return (
    <div style={S.page}>
      <div style={{ ...S.sidebar, display: 'flex', flexDirection: 'column' }}>
        <div style={S.sidebarTop}>
          <div style={S.logo}>NvdW 2026</div>
          <div style={S.adminLabel}>Organisatie</div>
        </div>
        <nav style={{ padding: '12px 0 16px', flex: 1, overflowY: 'auto' }}>
          {THEMAS.map(t => (
            <button key={t.id} style={S.navItem(actiefThema?.id === t.id)} onClick={() => kiesThema(t)}>{t.label}</button>
          ))}
        </nav>
        <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', fontWeight: '600', marginBottom: '8px' }}>{mijnNaam}</div>
          <button onClick={() => router.push('/wachtwoord')}
            style={{ display: 'block', fontSize: '11px', color: 'rgba(255,255,255,0.55)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: '8px' }}>Wachtwoord wijzigen</button>
          <button onClick={async () => { await supabase.auth.signOut(); router.push('/') }}
            style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Uitloggen</button>
        </div>
      </div>

      <main style={S.main}>
        {/* Onderdelen van het actieve thema als tabs bovenaan; alleen als er
            iets te kiezen valt. */}
        {actiefThema && actiefThema.leaves.length > 1 && (
          <div style={{ display: 'flex', gap: '6px', marginBottom: '26px', paddingBottom: '14px', borderBottom: '1px solid rgba(1,3,65,0.12)' }}>
            {actiefThema.leaves.map(l => (
              <button key={l.id} onClick={() => kiesBlad(actiefThema.id, l.id)} style={{
                padding: '8px 16px', fontSize: '13px', fontWeight: activeTab === l.id ? 700 : 500, letterSpacing: '0.1px',
                background: activeTab === l.id ? 'rgba(155,55,55,0.08)' : 'transparent', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                border: `1px solid ${activeTab === l.id ? 'rgba(155,55,55,0.25)' : 'rgba(1,3,65,0.08)'}`,
                borderRadius: '9px', color: activeTab === l.id ? 'var(--bordeaux)' : '#8b8574',
                transition: 'all 0.15s ease',
              }}>{l.label}</button>
            ))}
          </div>
        )}
        {saveMsg && <div style={S.successMsg}>{saveMsg}</div>}

        {/* START (launcher: 4 grote tegels naar de systemen, met live status) */}
        {activeTab === 'start' && (() => {
          const st = (key: string) => health?.systems.find(s => s.key === key)
          const TEGELS: { key: string; titel: string; onder: string; ga: () => void; extern?: string }[] = [
            { key: 'ticketing', titel: 'Tickets', onder: 'Ticketverkoop, bestellingen, scanner', ga: () => window.open('https://nachtvandewijn.nl/admin', '_blank'), extern: 'nachtvandewijn.nl/admin' },
            { key: 'kassa', titel: 'POS / Kassa', onder: 'Omzet, voorraad, dagstaat, refunds', ga: () => window.open('https://thegrapeagency.github.io/festival-pos-demo/admin/', '_blank'), extern: 'kassa-beheer' },
            { key: 'portal', titel: 'Partners', onder: 'Partners, contracten, crew, producten', ga: () => setActiveTab('partners') },
            { key: 'app', titel: 'Bezoekersapp', onder: 'Cijfers hier, of open de app', ga: () => setActiveTab('app'), extern: 'nvdw-bezoekers-app.vercel.app' },
          ]
          const OVERIGE_LINKS: { label: string; url: string }[] = [
            { label: 'Live website', url: 'https://www.nachtvandewijn.nl' },
            { label: 'Carousel-generator (los)', url: 'https://www.nachtvandewijn.nl/tools/carousel-generator' },
            { label: 'Huisstijl (deelbare link)', url: 'https://www.nachtvandewijn.nl/styleguide' },
            { label: 'Nieuwsbrief-archief', url: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/newsletter/archief` },
            { label: 'GitHub · website', url: 'https://github.com/Thegrapeagency/Nachtvandewijn-website' },
            { label: 'GitHub · organisatieportal', url: 'https://github.com/Thegrapeagency/nvdw-partnerportal' },
            { label: 'GitHub · bezoekers-app', url: 'https://github.com/Thegrapeagency/nvdw-bezoekers-app' },
            { label: 'Vercel · dashboards', url: 'https://vercel.com/thegrapeagencys-projects' },
            { label: 'Supabase · database', url: 'https://supabase.com/dashboard/project/snfojphxsbzfewwfbfka' },
          ]
          return <>
            <div style={S.title}>Start</div>
            <div style={S.sub}>
              Je vier systemen op één plek{healthTijd ? ` · status bijgewerkt ${healthTijd.toLocaleTimeString('nl-NL')}` : ''}. Klik een tegel om erin te duiken.
            </div>
            <Dashboard />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
              {TEGELS.map(t => {
                const s = st(t.key)
                // health geeft alleen de systemen terug waar je recht op hebt.
                // Ontbreekt er een, dan is dat geen storing maar geen toegang.
                const geenToegang = !!health && !s
                const kleur = !health ? '#bbb' : geenToegang ? '#ccc' : s?.ok ? '#2e7d32' : '#b3261e'
                return (
                  <button key={t.key} onClick={t.ga} style={{
                    ...S.card, marginBottom: 0, textAlign: 'left', cursor: 'pointer',
                    padding: '26px 24px', display: 'flex', flexDirection: 'column', gap: '10px',
                    fontFamily: 'inherit', minHeight: '150px',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: '22px', fontWeight: 700, color: 'var(--navy)' }}>{t.titel}</div>
                      <span title={s?.detail || 'status onbekend'} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#888' }}>
                        <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: kleur, display: 'inline-block' }} />
                        {!health ? 'checken…' : geenToegang ? 'geen toegang' : s?.ok ? 'werkt' : 'storing'}
                      </span>
                    </div>
                    <div style={{ fontSize: '13px', color: '#666', lineHeight: 1.5, flex: 1 }}>{t.onder}</div>
                    <div style={{ fontSize: '11px', color: 'var(--bordeaux)', fontWeight: 600, letterSpacing: '0.5px' }}>
                      {t.extern ? `Open ${t.extern} ↗` : 'Openen ›'}
                    </div>
                    {s?.detail && <div style={{ fontSize: '11px', color: '#999' }}>{s.detail}</div>}
                  </button>
                )
              })}
            </div>
            <div style={{ marginTop: '16px', fontSize: '12px', color: '#999' }}>
              Tip: het volledige statusoverzicht staat onder <button onClick={() => setActiveTab('status')} style={{ background: 'none', border: 'none', color: 'var(--bordeaux)', cursor: 'pointer', padding: 0, fontSize: '12px', textDecoration: 'underline' }}>Status</button>.
            </div>

            <div style={{ ...S.card, marginTop: '24px' }}>
              <div style={S.cardTitle}>Overige links</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px 24px' }}>
                {OVERIGE_LINKS.map(l => (
                  <a key={l.label} href={l.url} target="_blank" rel="noreferrer" style={{ display: 'block', padding: '9px 0', fontSize: '13px', color: 'var(--navy)', textDecoration: 'none', borderBottom: '1px solid #f0f0f0' }}>
                    {l.label} <span style={{ color: 'var(--bordeaux)' }}>↗</span>
                  </a>
                ))}
              </div>
            </div>
          </>
        })()}

        {/* BEZOEKERS-APP — cijfers, push en advertenties op één plek */}
        {activeTab === 'app' && subTabs([
          ...(magTab('app') ? [
            { id: 'instellingen' as const, label: 'Instellingen' },
            { id: 'cijfers' as const, label: 'Cijfers' },
          ] : []),
          ...(magTab('appmarketing') ? [
            { id: 'push' as const, label: 'Pushberichten' },
            { id: 'advertenties' as const, label: 'App-advertenties' },
          ] : []),
        ], appTab, setAppTab)}
        {activeTab === 'app' && appTab === 'instellingen' && magTab('app') && <AppBeheer flash={flash} />}
        {activeTab === 'app' && appTab === 'push' && magTab('appmarketing') && <Push flash={flash} />}
        {activeTab === 'app' && appTab === 'advertenties' && magTab('appmarketing') && <Advertenties flash={flash} />}
        {activeTab === 'app' && appTab === 'cijfers' && magTab('app') && (
          <>
            <div style={S.title}>Bezoekers-app</div>
            <div style={S.sub}>Nocturne, de app voor festivalbezoekers. Alleen anonieme cijfers, geen persoonsgegevens.</div>
            {appMetricsLoading && <p style={{ fontSize: '13px', color: '#999' }}>Cijfers laden...</p>}
            {appMetrics && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '24px' }}>
                {[
                  { label: 'Unieke bezoekers', val: appMetrics.devices, sub: 'toestellen met de app' },
                  { label: 'Actief, 24 uur', val: appMetrics.laatste_24u, sub: 'unieke toestellen' },
                  { label: 'App geopend', val: appMetrics.opens, sub: 'keer in totaal' },
                  { label: 'Smaaktest gedaan', val: appMetrics.smaaktest_started, sub: 'bezoekers' },
                  { label: 'Wijnen gestempeld', val: appMetrics.stempels, sub: 'in paspoorten' },
                  { label: 'Smaak-match aan', val: appMetrics.smaakmatch_optin, sub: 'bezoekers, vrijdag' },
                ].map(s => (
                  <div key={s.label} style={{ ...S.card, marginBottom: 0, padding: '20px' }}>
                    <div style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase', color: '#999', marginBottom: '8px' }}>{s.label}</div>
                    <div style={{ fontSize: '32px', fontWeight: '800', color: 'var(--navy)', lineHeight: 1 }}>{s.val ?? 0}</div>
                    <div style={{ fontSize: '12px', color: '#888', marginTop: '6px' }}>{s.sub}</div>
                  </div>
                ))}
              </div>
            )}
            <div style={S.card}>
              <div style={S.cardTitle}>Over deze cijfers</div>
              <p style={{ fontSize: '13px', color: '#666', lineHeight: 1.6 }}>De app verzamelt alleen anonieme gebeurtenissen met een lokaal toestel-id, geen namen of e-mails. Zodra bezoekers de app gebruiken, lopen deze cijfers op. De ticketverkoop en het partnerbeheer blijven in de andere tabbladen.</p>
            </div>
          </>
        )}

        {/* KASSA & OMZET */}
        {activeTab === 'kassa' && (() => {
          const eu = (c: number) => '€ ' + (c / 100).toFixed(2).replace('.', ',')
          const kandidaten = partners.filter(p => p.type === 'wijn' || p.type === 'food')
          const totaal = settlement.reduce((s, r) => s + (r.omzet_cents - r.refunded_cents), 0)
          const totaalAfdracht = settlement.reduce((s, r) => s + Math.round((r.omzet_cents - r.refunded_cents) * r.afdracht_percentage / 100), 0)
          return <>
            <div style={S.title}>Kassa & omzet</div>
            <div style={S.sub}>Koppel partners aan het kassasysteem, stel minimumprijzen in en zie wat elke partner krijgt uitbetaald.</div>
            {/* Verwarring voorkomen: hier staat bruto omdat je daarop afrekent
                met partners, terwijl de begroting ex btw rekent. */}
            <div style={{ background: '#f7f4ec', borderRadius: '8px', padding: '10px 14px', margin: '0 0 16px', fontSize: '12px', color: 'var(--navy)', lineHeight: 1.6 }}>
              <b>De bedragen op deze pagina zijn inclusief btw</b>, want dat is de omzet die door de kassa gaat en waarover
              je met de partner afrekent. In Begroting &amp; kosten staat alles exclusief btw. Zoek je het bedrag dat
              in de begroting meetelt, kijk dan daar bij Omzet live.
            </div>
            {kassaFout && <div style={{ ...S.successMsg, background: '#fdecea', border: '1px solid #e57373', color: '#b3261e' }}>Kassakoppeling niet bereikbaar: {kassaFout}</div>}

            <div style={S.card}>
              <div style={S.cardTitle}>Minimumprijzen (geldt voor alle partners)</div>
              <p style={{ fontSize: '13px', color: '#666', lineHeight: 1.6, marginBottom: '14px' }}>
                Een partner kan in het portal en in de kassa nooit onder deze prijzen zakken. Zet een regel aan met het vinkje. Wijzigingen gelden direct.
              </p>
              <table style={S.table}>
                <thead><tr><th style={S.th}>Eenheid</th><th style={S.th}>Minimum (€)</th><th style={S.th}>Actief</th><th style={S.th}></th></tr></thead>
                <tbody>
                  {floors.map(f => (
                    <tr key={f.key}>
                      <td style={S.td}>{f.label}</td>
                      <td style={S.td}>
                        <input style={{ ...S.input, width: '110px' }} value={floorDraft[f.key]?.euro ?? ''}
                          onChange={e => setFloorDraft({ ...floorDraft, [f.key]: { ...floorDraft[f.key], euro: e.target.value } })} placeholder="0,00" />
                      </td>
                      <td style={S.td}>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                          <input type="checkbox" checked={floorDraft[f.key]?.active ?? false}
                            onChange={e => setFloorDraft({ ...floorDraft, [f.key]: { ...floorDraft[f.key], active: e.target.checked } })} />
                          {floorDraft[f.key]?.active ? 'aan' : 'uit'}
                        </label>
                      </td>
                      <td style={S.td}><button style={S.btnSm} onClick={() => saveFloor(f.key)}>Opslaan</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={S.card}>
              <div style={S.cardTitle}>Partners koppelen aan de kassa</div>
              <p style={{ fontSize: '13px', color: '#666', lineHeight: 1.6, marginBottom: '14px' }}>
                Koppelen maakt een kassa-omgeving voor de partner, zet de wijnlijst of menukaart er direct in en geeft de partner een Omzet-tab in het portal. Daarna loopt alles automatisch mee.
              </p>
              <table style={S.table}>
                <thead><tr><th style={S.th}>Partner</th><th style={S.th}>Type</th><th style={S.th}>Login</th><th style={S.th}>Kassa</th><th style={S.th}></th></tr></thead>
                <tbody>
                  {kandidaten.map(p => {
                    const bridged = bridgedPartnerIds.has(p.id)
                    return (
                      <tr key={p.id}>
                        <td style={S.td}><strong>{p.bedrijfsnaam}</strong></td>
                        <td style={S.td}>{p.type}</td>
                        <td style={S.td}><span style={S.badge(!!p.user_id)}>{p.user_id ? 'actief' : 'nog niet'}</span></td>
                        <td style={S.td}><span style={S.badge(bridged)}>{bridged ? 'gekoppeld' : 'niet gekoppeld'}</span></td>
                        <td style={S.td}>
                          <button style={{ ...S.btnSm, opacity: kassaBusy === p.id ? 0.5 : 1 }} disabled={kassaBusy === p.id} onClick={() => koppelPartner(p)}>
                            {kassaBusy === p.id ? 'Bezig…' : bridged ? 'Opnieuw syncen' : 'Koppel aan kassa'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div style={S.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <div style={S.cardTitle}>Uitbetaaloverzicht</div>
                <button style={S.btnSm} onClick={exportSettlementCsv} disabled={settlement.length === 0}>Download CSV</button>
              </div>
              {settlement.length === 0 && <p style={{ fontSize: '13px', color: '#999' }}>Nog geen gekoppelde partners met omzet.</p>}
              {settlement.length > 0 && <>
                <table style={S.table}>
                  <thead><tr>
                    <th style={S.th}>Partner</th><th style={S.th}>Omzet</th><th style={S.th}>Terugbetaald</th>
                    <th style={S.th}>Netto</th><th style={S.th}>Afdracht</th><th style={S.th}>Uit te betalen</th>
                  </tr></thead>
                  <tbody>
                    {settlement.map(r => {
                      const netto = r.omzet_cents - r.refunded_cents
                      const afdracht = Math.round(netto * r.afdracht_percentage / 100)
                      return (
                        <tr key={r.merchant_id}>
                          <td style={S.td}><strong>{r.partner_naam}</strong><div style={{ fontSize: '11px', color: '#999' }}>{r.order_count} verkopen</div></td>
                          <td style={S.td}>{eu(r.omzet_cents)}</td>
                          <td style={S.td}>{r.refunded_cents > 0 ? eu(r.refunded_cents) : '—'}</td>
                          <td style={S.td}>{eu(netto)}</td>
                          <td style={S.td}>{r.afdracht_percentage}% ({eu(afdracht)})</td>
                          <td style={{ ...S.td, fontWeight: 700 }}>{eu(netto - afdracht)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <div style={{ fontSize: '12px', color: '#666', marginTop: '12px' }}>
                  Totaal netto {eu(totaal)} · totale afdracht (voor NvdW) {eu(totaalAfdracht)} · uit te betalen {eu(totaal - totaalAfdracht)}
                </div>
              </>}
            </div>
          </>
        })()}

        {/* STATUS & ACTIVITEIT — mission control en het wijzigingenlog samen */}
        {activeTab === 'status' && subTabs([
          { id: 'status' as const, label: 'Systemen' },
          { id: 'activiteit' as const, label: 'Activiteit' },
        ], statusTab, setStatusTab)}
        {activeTab === 'status' && statusTab === 'status' && (
          <>
            <div style={S.title}>Status van alle systemen</div>
            <div style={S.sub}>
              Ticketshop, kassa, portal en bezoekersapp in één oogopslag. Ververst elke minuut{healthTijd ? ` · laatste check ${healthTijd.toLocaleTimeString('nl-NL')}` : ''}.
            </div>
            <div style={{ marginBottom: '16px' }}>
              <button style={S.btnSm} onClick={laadStatus} disabled={healthLoading}>{healthLoading ? 'Checken…' : 'Nu verversen'}</button>
            </div>
            {!health && !healthLoading && (
              <div style={{ ...S.successMsg, background: '#fdecea', border: '1px solid #e57373', color: '#b3261e' }}>
                De statuscheck is niet bereikbaar. Dat kan betekenen dat Supabase zelf een storing heeft.
              </div>
            )}
            {health && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                {health.systems.map(s => (
                  <div key={s.key} style={{ ...S.card, marginBottom: 0, boxShadow: `inset 4px 0 0 ${s.ok ? '#2e7d32' : '#b3261e'}, 0 1px 3px rgba(0,0,0,0.05)` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--navy)' }}>{s.label}</div>
                      <span style={S.badge(s.ok)}>{s.ok ? 'werkt' : 'storing'}</span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#666' }}>{s.detail}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ACTIVITEIT (subtab van Status & activiteit) */}
        {activeTab === 'status' && statusTab === 'activiteit' && (
          <>
            <div style={S.title}>Activiteit</div>
            <div style={S.sub}>Alles wat het team en partners in de portal wijzigen. Iedereen met een admin-login ziet dit volledige log.</div>
            <div style={S.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={S.cardTitle}>{log.length} gebeurtenissen</div>
                <button style={S.btnSm} onClick={refreshLog}>Vernieuwen</button>
              </div>
              {log.length === 0 && <p style={{ fontSize: '13px', color: '#999' }}>Nog geen activiteit.</p>}
              {log.map(e => {
                const { wie, zin } = logZin(e)
                const kleur = e.actie === 'DELETE' ? '#c62828' : e.actie === 'INSERT' ? '#2e7d32' : '#5e35b1'
                return (
                  <div key={e.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '11px 0', borderBottom: '1px solid #f0f0f0' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: kleur, marginTop: '6px', flexShrink: 0 }} />
                    <div style={{ flex: 1, fontSize: '13px' }}>
                      <span style={{ color: 'var(--navy)' }}><strong>{wie}</strong> {zin}</span>
                    </div>
                    <span style={{ color: '#aaa', fontSize: '11px', whiteSpace: 'nowrap' }}>{new Date(e.created_at).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* CREW */}
        {activeTab === 'crew' && (() => {
          const cateringTotaal = DAGEN.reduce((acc, d) => { acc[d] = crew.filter(c => c.catering_dagen?.includes(d)).length; return acc }, {} as Record<string, number>)
          const bronnen = ['Eigen organisatie', ...partners.filter(p => crew.some(c => c.partner_id === p.id)).map(p => p.bedrijfsnaam)]
          return (
            <>
              <div style={S.title}>Crew &amp; personeel</div>
              <div style={S.sub}>Alle crew van partners, leveranciers én onze eigen mensen op één lijst.</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
                {[
                  { label: 'Crew totaal', val: crew.length, sub: `${bronnen.length} bronnen` },
                  ...DAGEN.map(d => ({ label: `Catering ${d.slice(0, 2)}`, val: cateringTotaal[d], sub: 'eters' })),
                ].map(s => (
                  <div key={s.label} style={{ ...S.card, marginBottom: 0, padding: '18px' }}>
                    <div style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase', color: '#999', marginBottom: '6px' }}>{s.label}</div>
                    <div style={{ fontSize: '26px', fontWeight: '800', color: 'var(--navy)', lineHeight: 1 }}>{s.val}</div>
                    <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>{s.sub}</div>
                  </div>
                ))}
              </div>

              <div style={S.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={S.cardTitle}>{crew.length} crewleden</div>
                  <button style={S.btnSm} onClick={handleExportCrew}>↓ Export CSV</button>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={S.table}>
                    <thead><tr>{['Bron', 'Naam', 'Functie', 'E-mail', 'Dagen', 'Catering', 'Dieet/allergie', ''].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {crew.length === 0 && <tr><td style={S.td} colSpan={8}><span style={{ color: '#999' }}>Nog geen crew.</span></td></tr>}
                      {crew.map(c => (
                        <tr key={c.id}>
                          <td style={S.td}><span style={{ fontSize: '11px', fontWeight: 700, color: c.partner_id ? 'var(--navy)' : 'var(--bordeaux)' }}>{partnerNaam(c.partner_id)}</span></td>
                          <td style={S.td}>{c.naam}</td>
                          <td style={S.td}>{c.functie || '—'}</td>
                          <td style={S.td}>{c.email || '—'}</td>
                          <td style={S.td}>{(c.dagen || []).join(', ') || '—'}</td>
                          <td style={S.td}>{(c.catering_dagen || []).join(', ') || '—'}</td>
                          <td style={S.td}>{c.dieet || '—'}</td>
                          <td style={S.td}><button style={S.btnSm} onClick={() => deleteCrewLid(c.id)}>Verwijder</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={S.card}>
                <div style={S.cardTitle}>Eigen crewlid toevoegen (vrijwilliger, runner, scanner)</div>
                <div style={S.grid3}>
                  <div><label style={S.label}>Naam</label><input style={S.input} value={internCrew.naam} onChange={e => setInternCrew({ ...internCrew, naam: e.target.value })} /></div>
                  <div><label style={S.label}>Functie</label><input style={S.input} value={internCrew.functie} onChange={e => setInternCrew({ ...internCrew, functie: e.target.value })} placeholder="bijv. ticketscanner" /></div>
                  <div><label style={S.label}>E-mail</label><input style={S.input} value={internCrew.email} onChange={e => setInternCrew({ ...internCrew, email: e.target.value })} /></div>
                </div>
                <label style={S.label}>Werkdagen</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {DAGEN.map(d => { const on = internCrew.dagen.includes(d); return <button key={d} type="button" onClick={() => toggleInternArr('dagen', d)} style={{ padding: '7px 12px', fontSize: '12px', cursor: 'pointer', textTransform: 'capitalize', borderRadius: '2px', border: `1px solid ${on ? 'var(--bordeaux)' : '#ddd'}`, background: on ? 'var(--bordeaux)' : '#fff', color: on ? '#fff' : '#666' }}>{d}</button> })}
                </div>
                <label style={S.label}>Crewcatering op</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {DAGEN.map(d => { const on = internCrew.catering_dagen.includes(d); return <button key={d} type="button" onClick={() => toggleInternArr('catering_dagen', d)} style={{ padding: '7px 12px', fontSize: '12px', cursor: 'pointer', textTransform: 'capitalize', borderRadius: '2px', border: `1px solid ${on ? 'var(--bordeaux)' : '#ddd'}`, background: on ? 'var(--bordeaux)' : '#fff', color: on ? '#fff' : '#666' }}>{d}</button> })}
                </div>
                <label style={S.label}>Dieet / allergieën</label>
                <input style={S.input} value={internCrew.dieet} onChange={e => setInternCrew({ ...internCrew, dieet: e.target.value })} placeholder="bijv. vegetarisch" />
                <button style={S.btn} onClick={addInternCrew}>Toevoegen aan crewlijst</button>
              </div>
            </>
          )
        })()}

        {/* PARTNERS — overzicht, toevoegen en exports in één scherm */}
        {activeTab === 'partners' && !selectedId && partnersView === 'lijst' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <div style={S.title}>Partners</div>
                <div style={S.sub}>{partners.length} partners. Klik op een bedrijfsnaam voor het detailscherm.</div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button style={{ ...S.btn, marginTop: 0 }} onClick={() => setPartnersView('toevoegen')}>+ Partner toevoegen</button>
                <button style={{ ...S.btnSm, padding: '10px 16px' }} onClick={() => setPartnersView('export')}>Exports</button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '24px' }}>
              {[
                { label: 'Partners totaal', val: partners.length, sub: `${aantalWijn} wijn · ${aantalFood} food` },
                { label: 'Logins actief', val: aantalLogins, sub: `van ${partners.length}` },
                { label: 'Offerte akkoord', val: aantalAkkoord, sub: `van ${partners.length}` },
                { label: 'Open vragen', val: openVragen.length, sub: openVragen.length === 0 ? 'alles beantwoord' : 'wacht op antwoord' },
              ].map(s => (
                <div key={s.label} style={{ ...S.card, marginBottom: 0, padding: '20px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase', color: '#999', marginBottom: '8px' }}>{s.label}</div>
                  <div style={{ fontSize: '32px', fontWeight: '800', color: 'var(--navy)', lineHeight: 1 }}>{s.val}</div>
                  <div style={{ fontSize: '12px', color: '#888', marginTop: '6px' }}>{s.sub}</div>
                </div>
              ))}
            </div>
            <div style={S.card}>
              <div style={{ overflowX: 'auto' }}>
                <table style={S.table}>
                  <thead>
                    <tr>{['Bedrijf', 'Type', 'Pakket', 'Avond', 'Status', 'Offerte', 'Tickets', 'Afdracht', 'Ticketcodes', 'Kortingscode', 'Login'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {partners.map(p => (
                      <tr key={p.id}>
                        <td style={S.td}>
                          <div style={{ fontWeight: '700', color: 'var(--bordeaux)', cursor: 'pointer' }} onClick={() => openPartner(p.id)}>{p.bedrijfsnaam} ›</div>
                          <div style={{ fontSize: '11px', color: '#999' }}>{p.email}</div>
                        </td>
                        <td style={S.td}><span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 8px', borderRadius: '2px', background: p.type === 'food' ? '#fff3e0' : '#ede7f6', color: p.type === 'food' ? '#e65100' : '#5e35b1' }}>{p.type === 'food' ? 'Food' : 'Wijn'}</span></td>
                        <td style={S.td}>{PAKKET_LABELS[p.pakket] || p.pakket}</td>
                        <td style={S.td}>{p.avond}</td>
                        <td style={S.td}>{p.status}</td>
                        <td style={S.td}><span style={S.badge(p.offerte_akkoord)}>{p.offerte_akkoord ? '✓' : 'Open'}</span></td>
                        <td style={S.td}>{p.gratis_tickets}</td>
                        <td style={S.td}>{p.afdracht_percentage}%</td>
                        <td style={S.td}>
                          <TicketCodesCell partner={p} onSave={(codes) => { setPartners(partners.map(x => x.id === p.id ? { ...x, ticket_codes: codes } as any : x)); flash('Codes opgeslagen') }} />
                        </td>
                        <td style={S.td}>
                          <KortingscodeCell partner={p} onSave={(code) => { setPartners(partners.map(x => x.id === p.id ? { ...x, kortingscode: code || null } : x)) }} />
                        </td>
                        <td style={S.td}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                            {p.user_id && <span style={S.badge(true)}>actief</span>}
                            <button style={S.btnSm} onClick={() => stuurInlog(p)}>{p.user_id ? 'Mail opnieuw' : 'Stuur inlog'}</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* PARTNERS — detail */}
        {activeTab === 'partners' && selectedId && (() => {
          const sp = partners.find(p => p.id === selectedId)
          if (!sp) return <button style={S.btnSm} onClick={() => setSelectedId(null)}>← Terug</button>
          const draft = partnerDraftValue(sp)
          const dirty = isPartnerDirty(sp.id)
          const setField = (patch: Partial<Partner>) => setPartnerDraftField(sp.id, patch)
          const num = (v: string) => v === '' ? null : Number(v)
          const euroFmt = (n: number) => '€' + n.toFixed(2).replace('.', ',')
          const cateringPrijs = parseFloat(tekstDraft['prijs_catering_pp'] || '19.50') || 19.5
          const spCatering = crewcatering.filter(c => c.partner_id === sp.id)
          const cateringTotaal = spCatering.reduce((s, c) => s + c.aantal_personen, 0) * cateringPrijs
          const spExtras = extraBestellingen.filter(e => e.partner_id === sp.id)
          const extrasTotaal = spExtras.reduce((s, e) => s + e.aantal * e.prijs_per_stuk, 0)
          return (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                <button style={S.btnSm} onClick={() => { if (dirty && !confirm('Niet-opgeslagen wijzigingen weggooien?')) return; setSelectedId(null); setPartnerDocs([]); setPartnerDraft(d => { const nd = { ...d }; delete nd[sp.id]; return nd }) }}>← Terug naar overzicht</button>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {dirty && <span style={{ fontSize: '12px', color: 'var(--bordeaux)', fontWeight: 600 }}>Niet-opgeslagen wijzigingen</span>}
                  <button style={{ ...S.btn, marginTop: 0, opacity: dirty && !partnerSaving ? 1 : 0.5 }} disabled={!dirty || partnerSaving} onClick={() => savePartnerDraft(sp)}>{partnerSaving ? 'Opslaan...' : 'Opslaan'}</button>
                  <button style={{ ...S.btnSm, color: 'var(--bordeaux)' }} onClick={() => deletePartner(sp)}>Partner verwijderen</button>
                </div>
              </div>
              <div style={S.title}>{sp.bedrijfsnaam}</div>
              <div style={S.sub}>{sp.naam} · {sp.email} · {sp.type === 'food' ? 'Foodtruck' : 'Wijnpartner'}</div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                {/* Afspraken */}
                <div style={S.card}>
                  <div style={S.cardTitle}>Afspraken</div>
                  <label style={S.label}>Pakket</label>
                  <select style={S.input} value={draft.pakket} onChange={e => setField({ pakket: e.target.value })}>
                    {(sp.type === 'food' ? ['foodtruck'] : ['branded_bar', 'own_bar', 'restaurant_host', 'entrance_host', 'silent_disco']).map(v => <option key={v} value={v}>{PAKKET_LABELS[v]}</option>)}
                  </select>
                  <div style={S.grid2}>
                    <div>
                      <label style={S.label}>Afdracht %</label>
                      <input style={S.input} type="number" value={draft.afdracht_percentage} onChange={e => setField({ afdracht_percentage: Number(e.target.value) })} />
                    </div>
                    <div>
                      <label style={S.label}>Gratis tickets</label>
                      <input style={S.input} type="number" value={draft.gratis_tickets} onChange={e => setField({ gratis_tickets: Number(e.target.value) })} />
                    </div>
                    <div>
                      <label style={S.label}>Crewtickets</label>
                      <input style={S.input} type="number" value={draft.crew_tickets ?? 0} onChange={e => setField({ crew_tickets: Number(e.target.value) })} />
                    </div>
                  </div>
                  {/* Stageld voor elk type partner, niet alleen foodtrucks: een
                      wijnpartner met een eigen bar betaalt het ook. */}
                  <label style={S.label}>Stageld € (excl. btw)</label>
                  <input style={S.input} type="number" step="0.01" placeholder="leeg = geen stageld"
                    value={draft.standplaats_vergoeding ?? ''}
                    onChange={e => setField({ standplaats_vergoeding: num(e.target.value) as any })} />
                  <label style={S.label}>Wat zit er bij het stageld in</label>
                  <textarea style={{ ...S.input, height: '96px', resize: 'vertical' as const }}
                    value={(draft as any).standplaats_inbegrepen ?? ''}
                    placeholder={'Eén regel per punt, bijvoorbeeld:\n1 pinautomaat\n200 cm bar met koeling en ijs\n20 gratis kaarten'}
                    onChange={e => setField({ standplaats_inbegrepen: e.target.value || null } as any)} />
                  <div style={{ fontSize: '11px', color: '#999', marginTop: '4px' }}>
                    Dit ziet de partner bij het stageld staan, en het gaat mee in wat hij aftekent.
                  </div>
                  <label style={S.label}>{sp.type === 'food' ? 'Standplaats' : 'Barlocatie'}</label>
                  <input style={S.input} value={draft.barlocatie ?? ''} onChange={e => setField({ barlocatie: e.target.value || null })} />
                </div>

                {/* Offerte + tickets */}
                <div style={S.card}>
                  <div style={S.cardTitle}>Offerte &amp; tickets</div>
                  <div style={{ padding: '4px 0 14px' }}>
                    <span style={S.badge(!!sp.contract_ondertekend)}>{sp.contract_ondertekend ? 'Contract getekend' : 'Nog niet getekend'}</span>
                    {sp.contract_ondertekend && sp.contract_ondertekend_datum && <span style={{ fontSize: '11px', color: '#999', marginLeft: '8px' }}>door {sp.contract_ondertekenaar} op {new Date(sp.contract_ondertekend_datum).toLocaleDateString('nl-NL')}</span>}
                    {sp.contract_handtekening && <img src={sp.contract_handtekening} alt="handtekening" style={{ display: 'block', marginTop: '10px', maxWidth: '220px', height: 'auto', background: '#fff', border: '1px solid #eee' }} />}
                    {/* Waar is precies voor getekend. Staat los van de huidige
                        afspraken, want die kunnen daarna gewijzigd zijn. */}
                    {(() => {
                      const snap = (sp as any).contract_snapshot as Record<string, any> | null
                      if (!snap) return null
                      const regels: [string, string][] = [
                        ['Afdracht', `${snap.afdracht_percentage}% van netto-omzet`],
                        ...(Number(snap.stageld) > 0 ? [['Stageld', euroFmt(Number(snap.stageld))]] as [string, string][] : []),
                        ...(Number(snap.extra_producten_totaal) > 0 ? [['Extra producten', euroFmt(Number(snap.extra_producten_totaal))]] as [string, string][] : []),
                        ...(Number(snap.crewcatering_totaal) > 0 ? [['Crewcatering', `${snap.crewcatering_personen} personen, ${euroFmt(Number(snap.crewcatering_totaal))}`]] as [string, string][] : []),
                        ['Totaal vast bedrag', euroFmt(Number(snap.totaal_vast || 0))],
                      ]
                      const afwijkend = Number(snap.afdracht_percentage) !== sp.afdracht_percentage
                        || Number(snap.stageld || 0) !== Number(sp.standplaats_vergoeding || 0)
                      return (
                        <div style={{ marginTop: '12px', background: '#f7f4ec', borderRadius: '6px', padding: '10px 12px' }}>
                          <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#999', marginBottom: '6px' }}>Getekend voor</div>
                          {regels.map(([l, v]) => (
                            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '2px 0' }}>
                              <span style={{ color: '#666' }}>{l}</span><span style={{ fontWeight: 600 }}>{v}</span>
                            </div>
                          ))}
                          {afwijkend && (
                            <div style={{ fontSize: '11px', color: 'var(--bordeaux)', marginTop: '8px', lineHeight: 1.5 }}>
                              Let op: de afspraken zijn ná het ondertekenen gewijzigd. Nu staat er {sp.afdracht_percentage}% afdracht
                              {sp.standplaats_vergoeding ? ` en ${euroFmt(Number(sp.standplaats_vergoeding))} stageld` : ' en geen stageld'}.
                              Laat opnieuw tekenen als dit klopt.
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                  <label style={S.label}>Ticketcodes automatisch genereren</label>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
                    <input style={{ ...S.input, width: '100px' }} type="number" min="1" value={genAantal} onChange={e => setGenAantal(e.target.value)} placeholder="aantal" />
                    <button style={S.btnSm} onClick={() => genereerTicketcodes(sp, parseInt(genAantal))}>Genereer ticketcodes</button>
                  </div>
                  <label style={S.label}>Ticketcodes (komma-gescheiden)</label>
                  <textarea style={{ ...S.input, height: '64px', fontFamily: 'monospace', fontSize: '12px' }} value={(draft as any).ticket_codes || ''} onChange={e => setField({ ticket_codes: e.target.value } as any)} placeholder="CODE1,CODE2,CODE3" />
                  <label style={S.label}>Eigen kortingscode</label>
                  <input style={S.input} value={draft.kortingscode ?? ''} onChange={e => setField({ kortingscode: e.target.value.toUpperCase() || null })} placeholder="standaard" />
                  <div style={{ marginTop: '14px' }}>
                    {sp.user_id && <span style={{ ...S.badge(true), marginRight: '8px' }}>login actief</span>}
                    <button style={S.btnSm} onClick={() => stuurInlog(sp)}>{sp.user_id ? 'Inlogmail opnieuw sturen' : 'Stuur inlogmail'}</button>
                  </div>
                </div>
              </div>

              {/* Wat de partner betaalt aan NvdW */}
              <div style={S.card}>
                <div style={S.cardTitle}>Wat {sp.bedrijfsnaam} betaalt aan NvdW</div>
                {spCatering.length === 0 && spExtras.length === 0 && !sp.standplaats_vergoeding ? (
                  <p style={{ fontSize: '13px', color: '#999' }}>Nog geen stageld, bestellingen of crewcatering.</p>
                ) : (
                  <>
                    {!!sp.standplaats_vergoeding && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0', fontSize: '13px' }}>
                        <span>Stageld</span>
                        <strong>{euroFmt(Number(sp.standplaats_vergoeding))}</strong>
                      </div>
                    )}
                    {spCatering.length > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0', fontSize: '13px' }}>
                        <span>Crewcatering ({spCatering.reduce((s, c) => s + c.aantal_personen, 0)} personen × {euroFmt(cateringPrijs)})</span>
                        <strong>{euroFmt(cateringTotaal)}</strong>
                      </div>
                    )}
                    {spExtras.map(e => (
                      <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0', fontSize: '13px' }}>
                        <span>{e.product} {e.aantal > 1 ? `× ${e.aantal}` : ''} <span style={{ color: '#999', fontSize: '11px' }}>({e.status})</span></span>
                        <strong>{euroFmt(e.aantal * e.prijs_per_stuk)}</strong>
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0 0', fontSize: '14px', fontWeight: 700, color: 'var(--navy)' }}>
                      <span>Totaal vast bedrag</span>
                      <span>{euroFmt(Number(sp.standplaats_vergoeding || 0) + cateringTotaal + extrasTotaal)}</span>
                    </div>
                  </>
                )}
                <p style={{ fontSize: '12px', color: '#999', marginTop: '12px' }}>
                  Exclusief de afdracht van {sp.afdracht_percentage}% over de kassaomzet, die wordt na afloop verrekend op basis van de werkelijke verkoop.
                </p>
              </div>

              {/* Persoonlijke documenten */}
              <div style={S.card}>
                <div style={S.cardTitle}>Persoonlijke documenten — alleen zichtbaar voor {sp.bedrijfsnaam}</div>
                <div style={S.grid2}>
                  <div><label style={S.label}>Weergavenaam</label><input style={S.input} value={pDocUpload.naam} onChange={e => setPDocUpload({ ...pDocUpload, naam: e.target.value })} placeholder="bijv. Getekende offerte" /></div>
                  <div><label style={S.label}>Bestand</label><input type="file" onChange={e => setPDocUpload({ ...pDocUpload, file: e.target.files?.[0] || null })} style={{ fontSize: '13px', marginTop: '8px' }} /></div>
                </div>
                <button style={{ ...S.btn, opacity: pUploading ? 0.6 : 1 }} disabled={pUploading} onClick={() => uploadPartnerDoc(sp.id)}>{pUploading ? 'Uploaden...' : 'Uploaden'}</button>
                <div style={{ marginTop: '20px' }}>
                  {partnerDocs.length === 0 && <p style={{ fontSize: '13px', color: '#999' }}>Nog geen persoonlijke documenten.</p>}
                  {partnerDocs.map(d => (
                    <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
                      <div><div style={{ fontWeight: '600', fontSize: '13px' }}>{d.naam}</div><div style={{ fontSize: '11px', color: '#999' }}>{d.bestandsnaam} · {new Date(d.created_at).toLocaleDateString('nl-NL')}</div></div>
                      <div><button style={{ ...S.btnSm, marginRight: '6px' }} onClick={() => bekijkDoc(d)}>Bekijk</button><button style={S.btnSm} onClick={() => deletePartnerDoc(d)}>Verwijder</button></div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )
        })()}

        {/* PARTNERS — toevoegen (subweergave) */}
        {activeTab === 'partners' && !selectedId && partnersView === 'toevoegen' && (
          <>
            <button style={{ ...S.btnSm, marginBottom: '16px' }} onClick={() => setPartnersView('lijst')}>← Terug naar partners</button>
            <div style={S.title}>Partner toevoegen</div>
            <div style={S.sub}>Snel uitnodigen met alleen een e-mailadres, of hieronder alle gegevens zelf invullen.</div>

            <div style={{ ...S.card, borderLeft: '3px solid var(--gold)' }}>
              <div style={S.cardTitle}>Snel uitnodigen</div>
              <p style={{ fontSize: '13px', color: '#555', lineHeight: 1.6, marginBottom: '14px' }}>
                Vul alleen een e-mailadres en het type in. De partner krijgt een uitnodiging, stelt zelf een wachtwoord in en vult daarna z&apos;n eigen gegevens aan.
              </p>
              <div style={S.grid2}>
                <div><label style={S.label}>E-mailadres</label><input style={S.input} value={invite.email} onChange={e => setInvite({ ...invite, email: e.target.value })} placeholder="naam@bedrijf.nl" /></div>
                <div><label style={S.label}>Type</label>
                  <select style={S.input} value={invite.type} onChange={e => setInvite({ ...invite, type: e.target.value })}>
                    <option value="wijn">Wijnpartner</option>
                    <option value="food">Foodtruck</option>
                    <option value="personeel">Personeelsleverancier</option>
                  </select>
                </div>
              </div>
              <button style={{ ...S.btn, opacity: inviting ? 0.6 : 1 }} disabled={inviting} onClick={snelUitnodigen}>{inviting ? 'Versturen...' : 'Uitnodiging versturen'}</button>
            </div>

            <div style={{ ...S.sub, marginTop: '8px' }}>Of vul alles handmatig in:</div>
            <div style={S.card}>
              <div style={S.grid2}>
                {[
                  { key: 'naam', label: 'Contactpersoon naam', placeholder: 'bijv. Jan de Vries' },
                  { key: 'bedrijfsnaam', label: 'Bedrijfsnaam', placeholder: 'bijv. Wijndomein X' },
                  { key: 'email', label: 'E-mailadres', placeholder: 'jan@bedrijf.nl' },
                  { key: 'barlocatie', label: 'Barlocatie (optioneel)', placeholder: 'bijv. Bar A, positie 3' },
                ].map(({ key, label, placeholder }) => (
                  <div key={key}>
                    <label style={S.label}>{label}</label>
                    <input style={S.input} value={(newPartner as Record<string, string>)[key]} onChange={e => setNewPartner({ ...newPartner, [key]: e.target.value })} placeholder={placeholder} />
                  </div>
                ))}
              </div>
              <div style={S.grid2}>
                <div>
                  <label style={S.label}>Type partner</label>
                  <select style={S.input} value={newPartner.type} onChange={e => {
                    const type = e.target.value
                    setNewPartner({ ...newPartner, type, pakket: type === 'food' ? 'foodtruck' : type === 'personeel' ? 'personeel' : 'own_bar' })
                  }}>
                    <option value="wijn">Wijnpartner</option>
                    <option value="food">Foodtruck</option>
                    <option value="personeel">Personeelsleverancier</option>
                  </select>
                </div>
                {newPartner.type === 'food' && (
                  <div>
                    <label style={S.label}>Standplaatsvergoeding € (excl. btw)</label>
                    <input style={S.input} type="number" step="0.01" value={newPartner.standplaats_vergoeding} onChange={e => setNewPartner({ ...newPartner, standplaats_vergoeding: e.target.value })} placeholder="bijv. 750.00" />
                  </div>
                )}
              </div>
              <div style={S.grid3}>
                <div>
                  <label style={S.label}>Pakket</label>
                  <select style={S.input} value={newPartner.pakket} onChange={e => setNewPartner({ ...newPartner, pakket: e.target.value })}>
                    {(newPartner.type === 'food' ? ['foodtruck'] : newPartner.type === 'personeel' ? ['personeel'] : ['branded_bar', 'own_bar', 'restaurant_host', 'entrance_host', 'silent_disco']).map(val => <option key={val} value={val}>{PAKKET_LABELS[val]}</option>)}
                  </select>
                </div>
                <div>
                  <label style={S.label}>Dagen aanwezig</label>
                  {(() => {
                    const sel = (newPartner.avond === 'alle' || !newPartner.avond) ? [...DAGEN] : newPartner.avond.split(',').map(s => s.trim()).filter(Boolean)
                    const toggle = (d: string) => {
                      const has = sel.includes(d)
                      const next = DAGEN.filter(x => has ? (sel.includes(x) && x !== d) : (sel.includes(x) || x === d))
                      setNewPartner({ ...newPartner, avond: next.length === DAGEN.length ? 'alle' : next.join(', ') })
                    }
                    return (
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {DAGEN.map(d => { const on = sel.includes(d); return <button type="button" key={d} onClick={() => toggle(d)} style={{ padding: '7px 12px', fontSize: '12px', cursor: 'pointer', textTransform: 'capitalize', borderRadius: '2px', border: `1px solid ${on ? 'var(--bordeaux)' : '#ddd'}`, background: on ? 'var(--bordeaux)' : '#fff', color: on ? '#fff' : '#666', fontWeight: on ? 700 : 400 }}>{d}</button> })}
                      </div>
                    )
                  })()}
                </div>
                <div>
                  <label style={S.label}>Gratis tickets</label>
                  <input style={S.input} type="number" value={newPartner.gratis_tickets} onChange={e => setNewPartner({ ...newPartner, gratis_tickets: e.target.value })} />
                </div>
                <div>
                  <label style={S.label}>Crewtickets</label>
                  <input style={S.input} type="number" value={newPartner.crew_tickets} onChange={e => setNewPartner({ ...newPartner, crew_tickets: e.target.value })} />
                </div>
                <div>
                  <label style={S.label}>Afdracht %</label>
                  <input style={S.input} type="number" value={newPartner.afdracht_percentage} onChange={e => setNewPartner({ ...newPartner, afdracht_percentage: e.target.value })} />
                </div>
              </div>
              <div>
                <label style={S.label}>Notities (intern)</label>
                <textarea style={{ ...S.input, height: '80px', resize: 'vertical' }} value={newPartner.notities} onChange={e => setNewPartner({ ...newPartner, notities: e.target.value })} placeholder="Interne aantekeningen" />
              </div>
              <button style={S.btn} onClick={handleAddPartner}>Partner aanmaken</button>
            </div>
          </>
        )}

        {/* PRODUCTEN */}
        {activeTab === 'producten' && (
          <>
            <div style={S.title}>Producten (extra&apos;s)</div>
            <div style={S.sub}>De catalogus die partners onder &quot;Extra bestellen&quot; zien. Prijzen exclusief btw.</div>
            <div style={S.card}>
              <div style={S.cardTitle}>Huidige producten</div>
              <table style={S.table}>
                <thead><tr>{['Naam', 'Omschrijving', 'Prijs', 'Eenheid', 'Actief', ''].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {producten.map(p => (
                    <tr key={p.id}>
                      <td style={S.td}><input style={{ ...S.input, fontWeight: '600' }} defaultValue={p.naam} onBlur={e => e.target.value !== p.naam && updateProduct(p.id, { naam: e.target.value })} /></td>
                      <td style={S.td}><input style={S.input} defaultValue={p.omschrijving || ''} onBlur={e => e.target.value !== (p.omschrijving || '') && updateProduct(p.id, { omschrijving: e.target.value || null as any })} /></td>
                      <td style={{ ...S.td, width: '90px' }}><input style={S.input} type="number" step="0.01" defaultValue={p.prijs} onBlur={e => parseFloat(e.target.value) !== p.prijs && updateProduct(p.id, { prijs: parseFloat(e.target.value) })} /></td>
                      <td style={{ ...S.td, width: '90px' }}><input style={S.input} defaultValue={p.eenheid} onBlur={e => e.target.value !== p.eenheid && updateProduct(p.id, { eenheid: e.target.value })} /></td>
                      <td style={S.td}><input type="checkbox" checked={p.actief !== false} onChange={e => updateProduct(p.id, { actief: e.target.checked })} /></td>
                      <td style={S.td}><button style={S.btnSm} onClick={() => deleteProduct(p.id)}>Verwijder</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={S.card}>
              <div style={S.cardTitle}>Product toevoegen</div>
              <div style={S.grid2}>
                <div><label style={S.label}>Naam</label><input style={S.input} value={newProduct.naam} onChange={e => setNewProduct({ ...newProduct, naam: e.target.value })} placeholder="bijv. Extra pin" /></div>
                <div><label style={S.label}>Omschrijving</label><input style={S.input} value={newProduct.omschrijving} onChange={e => setNewProduct({ ...newProduct, omschrijving: e.target.value })} /></div>
                <div><label style={S.label}>Prijs (€)</label><input style={S.input} type="number" step="0.01" value={newProduct.prijs} onChange={e => setNewProduct({ ...newProduct, prijs: e.target.value })} placeholder="0.00" /></div>
                <div><label style={S.label}>Eenheid</label><input style={S.input} value={newProduct.eenheid} onChange={e => setNewProduct({ ...newProduct, eenheid: e.target.value })} placeholder="stuk / ticket / dag" /></div>
              </div>
              <button style={S.btn} onClick={addProduct}>Toevoegen</button>
            </div>
          </>
        )}

        {/* PROEVERIJEN & RESTAURANT */}
        {activeTab === 'programma' && (
          <Programma partners={partners.map(p => ({ id: p.id, bedrijfsnaam: p.bedrijfsnaam }))} flash={flash} />
        )}

        {activeTab === 'aankondigingen' && <Aankondigingen flash={flash} />}
        {activeTab === 'draaiboek' && <Draaiboek flash={flash} />}
        {/* Content-studio: schrijfstijl, carousel en huisstijl in één tab */}
        {activeTab === 'studio' && subTabs([
          { id: 'schrijfstijl' as const, label: 'Schrijfstijl & teksten' },
          { id: 'carousel' as const, label: 'Carousel & stories' },
          { id: 'huisstijl' as const, label: 'Huisstijl' },
        ], studioTab, setStudioTab)}
        {activeTab === 'studio' && studioTab === 'schrijfstijl' && <Schrijfstijl flash={flash} />}
        {activeTab === 'studio' && studioTab === 'carousel' && <Carousel />}
        {activeTab === 'studio' && studioTab === 'huisstijl' && <Huisstijl />}
        {activeTab === 'nieuwsbrief' && <Nieuwsbrief flash={flash} />}
        {activeTab === 'todo' && <Todo flash={flash} />}
        {activeTab === 'overleg' && <Overleg flash={flash} />}
        {activeTab === 'attributie' && <Attributie flash={flash} />}
        {activeTab === 'crewrooster' && <CrewRooster flash={flash} />}
        {activeTab === 'financieel' && <Financieel flash={flash} />}
        {activeTab === 'leveranciers' && <Leveranciers flash={flash} />}

        {/* INFO & DOCUMENTEN — faq/spelregels, teksten/deadlines en documenten in één tab */}
        {activeTab === 'partnerinfo' && (
          <>
            <div style={S.title}>Info &amp; documenten</div>
            <div style={S.sub}>Alles wat partners in hun portal te zien krijgen: spelregels, vaste teksten, deadlines en downloads.</div>
            {subTabs([
              { id: 'faq' as const, label: 'FAQ & spelregels' },
              { id: 'teksten' as const, label: 'Teksten & deadlines' },
              { id: 'documenten' as const, label: 'Documenten' },
            ], infoTab, setInfoTab)}
          </>
        )}
        {activeTab === 'partnerinfo' && infoTab === 'faq' && (
          <>
            {FAQ_CATEGORIEEN.map(cat => {
              const items = faqItems.filter(f => f.categorie === cat)
              if (!items.length) return null
              return (
                <div key={cat} style={S.card}>
                  <div style={S.cardTitle}>{cat}</div>
                  {items.map(f => (
                    <div key={f.id} style={{ padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
                      <input style={{ ...S.input, fontWeight: '600', marginBottom: '6px' }} defaultValue={f.vraag} onBlur={e => e.target.value !== f.vraag && updateFaq(f.id, { vraag: e.target.value })} />
                      <textarea style={{ ...S.input, height: '60px', resize: 'vertical' }} defaultValue={f.antwoord} onBlur={e => e.target.value !== f.antwoord && updateFaq(f.id, { antwoord: e.target.value })} />
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '8px' }}>
                        <label style={{ fontSize: '11px', color: '#666', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <input type="checkbox" checked={f.actief !== false} onChange={e => updateFaq(f.id, { actief: e.target.checked })} /> Zichtbaar voor partners
                        </label>
                        <button style={S.btnSm} onClick={() => deleteFaq(f.id)}>Verwijder</button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            })}
            <div style={S.card}>
              <div style={S.cardTitle}>Vraag toevoegen</div>
              <label style={S.label}>Categorie</label>
              <select style={S.input} value={newFaq.categorie} onChange={e => setNewFaq({ ...newFaq, categorie: e.target.value })}>
                {FAQ_CATEGORIEEN.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <label style={S.label}>Vraag</label>
              <input style={S.input} value={newFaq.vraag} onChange={e => setNewFaq({ ...newFaq, vraag: e.target.value })} />
              <label style={S.label}>Antwoord</label>
              <textarea style={{ ...S.input, height: '80px', resize: 'vertical' }} value={newFaq.antwoord} onChange={e => setNewFaq({ ...newFaq, antwoord: e.target.value })} />
              <button style={S.btn} onClick={addFaq}>Toevoegen</button>
            </div>
          </>
        )}

        {/* DOCUMENTEN (subtab van Info & documenten) */}
        {activeTab === 'partnerinfo' && infoTab === 'documenten' && (
          <>
            <div style={S.card}>
              <div style={S.cardTitle}>Document uploaden</div>
              <div style={S.grid2}>
                <div><label style={S.label}>Weergavenaam</label><input style={S.input} value={docUpload.naam} onChange={e => setDocUpload({ ...docUpload, naam: e.target.value })} placeholder="bijv. Draaiboek opbouw" /></div>
                <div><label style={S.label}>Categorie</label>
                  <select style={S.input} value={docUpload.categorie} onChange={e => setDocUpload({ ...docUpload, categorie: e.target.value })}>
                    {DOC_CATEGORIEEN.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <label style={S.label}>Bestand</label>
              <input type="file" onChange={e => setDocUpload({ ...docUpload, file: e.target.files?.[0] || null })} style={{ fontSize: '13px' }} />
              <br />
              <button style={{ ...S.btn, opacity: uploading ? 0.6 : 1 }} disabled={uploading} onClick={uploadDoc}>{uploading ? 'Uploaden...' : 'Uploaden'}</button>
            </div>
            <div style={S.card}>
              <div style={S.cardTitle}>{documenten.length} document(en)</div>
              {documenten.length === 0 && <p style={{ fontSize: '13px', color: '#999' }}>Nog geen documenten.</p>}
              <table style={S.table}>
                <tbody>
                  {documenten.map(d => (
                    <tr key={d.id}>
                      <td style={S.td}><div style={{ fontWeight: '600' }}>{d.naam}</div><div style={{ fontSize: '11px', color: '#999' }}>{d.bestandsnaam}</div></td>
                      <td style={S.td}>{d.categorie}</td>
                      <td style={S.td}>{new Date(d.created_at).toLocaleDateString('nl-NL')}</td>
                      <td style={S.td}><button style={{ ...S.btnSm, marginRight: '6px' }} onClick={() => downloadDoc(d)}>Bekijk</button><button style={S.btnSm} onClick={() => deleteDoc(d)}>Verwijder</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* TEKSTEN (subtab van Info & documenten) */}
        {activeTab === 'partnerinfo' && infoTab === 'teksten' && (
          <>
            {Array.from(new Set(teksten.map(t => t.groep))).map(groep => (
              <div key={groep} style={S.card}>
                <div style={S.cardTitle}>{groep}</div>
                {teksten.filter(t => t.groep === groep).map(t => (
                  <div key={t.sleutel} style={{ marginBottom: '16px' }}>
                    <label style={S.label}>{t.label}</label>
                    {t.type === 'meerregelig'
                      ? <textarea style={{ ...S.input, height: '90px', resize: 'vertical' }} value={tekstDraft[t.sleutel] ?? ''} onChange={e => setTekstDraft({ ...tekstDraft, [t.sleutel]: e.target.value })} />
                      : <input style={S.input} value={tekstDraft[t.sleutel] ?? ''} onChange={e => setTekstDraft({ ...tekstDraft, [t.sleutel]: e.target.value })} />}
                    <button style={{ ...S.btnSm, marginTop: '8px' }} onClick={() => saveTekst(t.sleutel)}>Opslaan</button>
                  </div>
                ))}
              </div>
            ))}
          </>
        )}

        {/* TEAM */}
        {activeTab === 'team' && (
          <>
            <div style={S.title}>Team</div>
            <div style={S.sub}>
              Beheerders van de portal. Vink per persoon aan waar diegene bij mag.
              Niets aangevinkt laten betekent volledige toegang.
            </div>
            <div style={S.card}>
              <table style={S.table}>
                <thead><tr>{['Naam', 'E-mail', 'Toegang', 'Status', ''].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {admins.map(a => (
                    <tr key={a.id}>
                      <td style={S.td}>
                        <div style={{ fontWeight: '600' }}>{a.naam}</div>
                        <div style={{ fontSize: '11px', color: '#999' }}>{a.rol}</div>
                      </td>
                      <td style={S.td}>{a.email}</td>
                      <td style={S.td}>
                        <button style={S.btnSm} onClick={() => setRechtenOpen(rechtenOpen === a.id ? null : a.id)}>
                          {samenvattingRechten(a)}
                        </button>
                      </td>
                      <td style={S.td}><span style={S.badge(a.actief)}>{a.actief ? 'actief' : 'inactief'}</span></td>
                      <td style={S.td}>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          <button style={S.btnSm} onClick={() => { setPwOpen(pwOpen === a.id ? null : a.id); setPwVeld(x => ({ ...x, [a.id]: x[a.id] || nieuwWachtwoord() })) }}>
                            Wachtwoord zetten
                          </button>
                          <button style={S.btnSm} onClick={() => stuurTeamToegang(a, 'recovery')}>Mail wachtwoordlink</button>
                          <button style={S.btnSm} onClick={() => stuurTeamToegang(a, 'magiclink')}>Magic link</button>
                          {a.rol !== 'owner' && <button style={S.btnSm} onClick={() => toggleAdmin(a)}>{a.actief ? 'Deactiveer' : 'Activeer'}</button>}
                        </div>
                        {pwOpen === a.id && (
                          <div style={{ background: '#f7f4ec', borderRadius: '6px', padding: '12px', marginTop: '10px', maxWidth: '420px' }}>
                            <div style={{ fontSize: '12px', color: '#555', lineHeight: 1.6, marginBottom: '10px' }}>
                              Zet het wachtwoord meteen zelf, zonder mail. Geef het daarna door aan {a.naam || a.email};
                              je kunt het hierna niet meer terugkijken.
                            </div>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                              <input
                                style={{ ...S.input, width: '210px', fontFamily: 'ui-monospace, monospace', fontSize: '13px', padding: '7px 9px' }}
                                value={pwVeld[a.id] || ''}
                                onChange={e => setPwVeld(x => ({ ...x, [a.id]: e.target.value }))}
                                spellCheck={false} autoComplete="off" />
                              <button style={S.btnSm} onClick={() => setPwVeld(x => ({ ...x, [a.id]: nieuwWachtwoord() }))}>Genereer</button>
                              <button style={S.btnSm} onClick={() => navigator.clipboard?.writeText(pwVeld[a.id] || '').then(() => flash('Wachtwoord gekopieerd'), () => flash('Kopiëren lukte niet, selecteer het zelf', 6000))}>Kopieer</button>
                              <button style={{ ...S.btnSm, borderColor: 'var(--navy)', color: 'var(--navy)', fontWeight: 700 }}
                                disabled={pwBezig === a.id} onClick={() => zetWachtwoord(a)}>
                                {pwBezig === a.id ? 'Bezig…' : 'Instellen'}
                              </button>
                              <button style={S.btnSm} onClick={() => setPwOpen(null)}>Sluit</button>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {rechtenOpen && (() => {
              const a = admins.find(x => x.id === rechtenOpen)
              if (!a) return null
              const huidig = (a as Admin & { rechten: Gebied[] | null }).rechten
              const alles = huidig === null
              return (
                <div style={{ ...S.card, borderLeft: '3px solid var(--bordeaux)' }}>
                  <div style={S.cardTitle}>Toegang van {a.naam}</div>
                  <label style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '14px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={alles} onChange={e => zetRechten(a, e.target.checked ? null : [])} />
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>Volledige toegang (alles, ook toekomstige onderdelen)</span>
                  </label>
                  {!alles && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {GEBIEDEN.map(g => (
                        <label key={g.id} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            style={{ marginTop: '3px' }}
                            checked={(huidig || []).includes(g.id)}
                            onChange={e => {
                              const nu = huidig || []
                              zetRechten(a, e.target.checked ? [...nu, g.id] : nu.filter(x => x !== g.id))
                            }}
                          />
                          <span>
                            <span style={{ fontSize: '13px', fontWeight: 600 }}>{g.naam}</span>
                            <span style={{ fontSize: '12px', color: '#888', display: 'block' }}>{g.uitleg}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                  {!alles && (huidig || []).length === 0 && (
                    <p style={{ fontSize: '12px', color: 'var(--bordeaux)', marginTop: '12px' }}>
                      Zonder vinkjes kan deze persoon inloggen maar verder niets zien. Vink minstens één gebied aan.
                    </p>
                  )}
                  {!alles && !(huidig || []).includes('beheer') && (
                    <p style={{ fontSize: '12px', color: '#888', marginTop: '12px', lineHeight: 1.5 }}>
                      Zonder Beheer kan diegene het team en deze rechten niet zien of aanpassen. Dat is meestal precies
                      wat je wil bij iemand van buiten.
                    </p>
                  )}
                  <button style={{ ...S.btnSm, marginTop: '14px' }} onClick={() => setRechtenOpen(null)}>Sluiten</button>
                </div>
              )
            })()}
            <div style={S.card}>
              <div style={S.cardTitle}>Teamlid toevoegen</div>
              <div style={S.grid2}>
                <div><label style={S.label}>Naam</label><input style={S.input} value={newTeamlid.naam} onChange={e => setNewTeamlid({ ...newTeamlid, naam: e.target.value })} /></div>
                <div><label style={S.label}>E-mailadres</label><input style={S.input} value={newTeamlid.email} onChange={e => setNewTeamlid({ ...newTeamlid, email: e.target.value })} placeholder="naam@nachtvandewijn.nl" /></div>
              </div>
              <label style={S.label}>Toegang</label>
              <label style={{ display: 'flex', gap: '10px', alignItems: 'center', cursor: 'pointer', marginBottom: '8px' }}>
                <input type="checkbox" checked={newTeamlidRechten === null} onChange={e => setNewTeamlidRechten(e.target.checked ? null : [])} />
                <span style={{ fontSize: '13px', fontWeight: 600 }}>Volledige toegang (alles, ook toekomstige onderdelen)</span>
              </label>
              {newTeamlidRechten !== null && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: '#f7f4ec', borderRadius: '6px', padding: '12px 14px' }}>
                  {GEBIEDEN.map(g => (
                    <label key={g.id} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', cursor: 'pointer' }}>
                      <input type="checkbox" style={{ marginTop: '3px' }} checked={newTeamlidRechten.includes(g.id)}
                        onChange={e => setNewTeamlidRechten(e.target.checked ? [...newTeamlidRechten, g.id] : newTeamlidRechten.filter(x => x !== g.id))} />
                      <span>
                        <span style={{ fontSize: '13px', fontWeight: 600 }}>{g.naam}</span>
                        <span style={{ fontSize: '12px', color: '#888', display: 'block' }}>{g.uitleg}</span>
                      </span>
                    </label>
                  ))}
                  <div style={{ fontSize: '12px', color: '#888', lineHeight: 1.5 }}>
                    De login ziet vanaf de allereerste keer inloggen alleen deze gebieden. Later aan te passen via de Toegang-knop hierboven.
                  </div>
                </div>
              )}
              <button style={S.btn} onClick={addTeamlid}>Login aanmaken</button>
              <p style={{ fontSize: '12px', color: '#999', marginTop: '12px' }}>Er wordt automatisch een tijdelijk wachtwoord gegenereerd. Geef dit door aan het teamlid; ze kunnen het later wijzigen.</p>
            </div>
          </>
        )}

        {/* PARTNERS — exports (subweergave) */}
        {activeTab === 'partners' && !selectedId && partnersView === 'export' && (
          <>
            <button style={{ ...S.btnSm, marginBottom: '16px' }} onClick={() => setPartnersView('lijst')}>← Terug naar partners</button>
            <div style={S.title}>Exports</div>
            <div style={S.sub}>Wijnlijsten en menukaarten van alle partners als CSV.</div>
            <div style={S.card}>
              <div style={S.cardTitle}>Wijnlijst export</div>
              <p style={{ fontSize: '13px', color: '#555', lineHeight: '1.7', marginBottom: '20px' }}>
                Exporteer alle ingevulde wijnlijsten van alle partners in één CSV. Bevat per wijn: partner, pakket, avond, barlocatie, naam, producent, regio, land, druif, jaar en alle prijzen.
              </p>
              <button style={{ ...S.btn, background: exportLoading ? '#999' : 'var(--gold)', color: 'var(--navy)', fontSize: '13px', padding: '14px 28px' }} onClick={handleExportTactile} disabled={exportLoading}>
                {exportLoading ? 'Exporteren...' : '↓ Download wijnlijst CSV'}
              </button>
            </div>
            <div style={S.card}>
              <div style={S.cardTitle}>Menukaart &amp; allergenen export</div>
              <p style={{ fontSize: '13px', color: '#555', lineHeight: '1.7', marginBottom: '20px' }}>
                Alle gerechten van alle foodtrucks in één CSV, inclusief prijzen en de aangevinkte allergenen per gerecht.
              </p>
              <button style={{ ...S.btn, background: exportLoading ? '#999' : 'var(--gold)', color: 'var(--navy)', fontSize: '13px', padding: '14px 28px' }} onClick={handleExportMenukaart} disabled={exportLoading}>
                {exportLoading ? 'Exporteren...' : '↓ Download menukaart CSV'}
              </button>
            </div>
          </>
        )}

        {/* VRAGEN — partnervragen en bezoekersvragen in één inbox */}
        {activeTab === 'vragen' && (
          <>
            <div style={S.title}>Vragen</div>
            <div style={S.sub}>Alle binnengekomen vragen op één plek.</div>
            {subTabs([
              ...(magTab('vragen') ? [{ id: 'partners' as const, label: `Van partners${openVragen.length > 0 ? ` (${openVragen.length})` : ''}` }] : []),
              ...(magTab('bezoekersvragen') ? [{ id: 'bezoekers' as const, label: 'Van bezoekers' }] : []),
            ], vragenTab, setVragenTab)}
          </>
        )}
        {activeTab === 'vragen' && vragenTab === 'partners' && magTab('vragen') && (
          <>
            {vragen.map(v => (
              <div key={v.id} style={{ ...S.card, borderLeft: v.status === 'open' ? '3px solid var(--bordeaux)' : '3px solid #ccc' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ fontWeight: '700', fontSize: '14px' }}>{v.onderwerp}</div>
                  <span style={{ fontSize: '10px', fontWeight: '700', color: v.status === 'open' ? 'var(--bordeaux)' : '#999', textTransform: 'uppercase', letterSpacing: '1px' }}>{v.status}</span>
                </div>
                <div style={{ fontSize: '13px', color: '#555', marginBottom: '12px' }}>{v.bericht}</div>
                {v.status === 'open' && (
                  <div>
                    <textarea style={{ ...S.input, height: '80px', resize: 'vertical' }} value={antwoordMap[v.id] || ''} onChange={e => setAntwoordMap({ ...antwoordMap, [v.id]: e.target.value })} placeholder="Typ je antwoord..." />
                    <button style={S.btn} onClick={() => handleAntwoord(v.id)}>Antwoord opslaan</button>
                  </div>
                )}
                {v.antwoord && <div style={{ background: '#f0f8f0', padding: '10px', borderRadius: '2px', fontSize: '13px', color: '#2e7d32' }}><strong>Antwoord:</strong> {v.antwoord}</div>}
              </div>
            ))}
            {vragen.length === 0 && <p style={{ color: '#999', fontSize: '14px' }}>Geen vragen.</p>}
          </>
        )}

        {activeTab === 'vragen' && vragenTab === 'bezoekers' && magTab('bezoekersvragen') && <BezoekerVragen flash={flash} zonderKop />}
      </main>
    </div>
  )
}
