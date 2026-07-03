'use client'
import { useEffect, useState } from 'react'
import { supabase, posRpc, posSelect, posPatch } from '@/lib/supabase'
import type { Partner, PartnerVraag, Product, FAQ, PortalTekst, Admin, Document, ActiviteitLog, CrewLid, Proeverij, ExtraTicketType, PriceFloor, SettlementRow } from '@/lib/supabase'
import { LOG_TABEL_LABEL, LOG_ACTIE_LABEL } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

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
const PROGRAMMA_DAGEN: { value: 'fri' | 'sat' | 'sun'; label: string; datum: string }[] = [
  { value: 'fri', label: 'Vrijdag 6 nov', datum: '2026-11-06' },
  { value: 'sat', label: 'Zaterdag 7 nov', datum: '2026-11-07' },
  { value: 'sun', label: 'Zondag 8 nov', datum: '2026-11-08' },
]
const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
const euro = (cents: number) => '€' + (cents / 100).toFixed(2).replace('.', ',')
const tijdUit = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' }) : ''

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
    await supabase.from('partners').update({ ticket_codes: val } as any).eq('id', partner.id)
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
    await supabase.from('partners').update({ kortingscode: val || null }).eq('id', partner.id)
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
  const [vragen, setVragen] = useState<PartnerVraag[]>([])
  const [producten, setProducten] = useState<Product[]>([])
  const [faqItems, setFaqItems] = useState<FAQ[]>([])
  const [teksten, setTeksten] = useState<PortalTekst[]>([])
  const [admins, setAdmins] = useState<Admin[]>([])
  const [documenten, setDocumenten] = useState<Document[]>([])
  const [log, setLog] = useState<ActiviteitLog[]>([])
  const [crew, setCrew] = useState<CrewLid[]>([])
  const [internCrew, setInternCrew] = useState<{ naam: string; functie: string; email: string; dagen: string[]; catering_dagen: string[]; dieet: string }>({ naam: '', functie: '', email: '', dagen: [], catering_dagen: [], dieet: '' })
  const [mijnNaam, setMijnNaam] = useState('')
  const [activeTab, setActiveTab] = useState('overzicht')
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
  const [docUpload, setDocUpload] = useState({ naam: '', categorie: 'draaiboek', file: null as File | null })
  const [uploading, setUploading] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [partnerDocs, setPartnerDocs] = useState<Document[]>([])
  const [pDocUpload, setPDocUpload] = useState({ naam: '', file: null as File | null })
  const [pUploading, setPUploading] = useState(false)
  const [proeverijen, setProeverijen] = useState<Proeverij[]>([])
  const [extraTypes, setExtraTypes] = useState<ExtraTicketType[]>([])
  const [newProeverij, setNewProeverij] = useState({
    soort: 'proeverij' as 'proeverij' | 'restaurant', titel: '', host: '', beschrijving: '',
    dag: 'fri' as 'fri' | 'sat' | 'sun', start_tijd: '', eind_tijd: '', locatie: '',
    capaciteit: '20', prijs: '', partner_id: '',
  })

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

  const loadAll = async () => {
    const [p, v, pr, f, t, a, d, l, cw] = await Promise.all([
      supabase.from('partners').select('*').order('created_at', { ascending: false }),
      supabase.from('partner_vragen').select('*').order('created_at', { ascending: false }),
      supabase.from('producten_catalogus').select('*').order('volgorde'),
      supabase.from('faq').select('*').order('categorie').order('volgorde'),
      supabase.from('portal_teksten').select('*').order('volgorde'),
      supabase.from('admins').select('*').order('created_at'),
      supabase.from('documenten').select('*').order('created_at', { ascending: false }),
      supabase.from('activiteit_log').select('*').order('created_at', { ascending: false }).limit(300),
      supabase.from('crew').select('*').order('created_at'),
    ])
    setPartners(p.data || []); setVragen(v.data || []); setProducten(pr.data || [])
    setFaqItems(f.data || []); setTeksten(t.data || []); setAdmins(a.data || []); setDocumenten(d.data || [])
    setLog(l.data || []); setCrew(cw.data || [])
    const td: Record<string, string> = {}
    ;(t.data || []).forEach((x: PortalTekst) => { td[x.sleutel] = x.waarde })
    setTekstDraft(td)
  }

  const refreshLog = async () => {
    const { data } = await supabase.from('activiteit_log').select('*').order('created_at', { ascending: false }).limit(300)
    setLog(data || [])
  }

  const loadProeverijen = async () => {
    const [pv, tt] = await Promise.all([
      supabase.from('proeverijen').select('*').order('volgorde'),
      supabase.from('ticket_types').select('id, price_cents, active, per_type_cap, per_type_sold').eq('category', 'extra'),
    ])
    setProeverijen((pv.data || []) as Proeverij[])
    setExtraTypes((tt.data || []) as ExtraTicketType[])
  }

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }
      const { data: isAdmin } = await supabase.rpc('is_admin')
      if (!isAdmin) { router.push('/dashboard'); return }
      const { data: me } = await supabase.from('admins').select('naam').eq('email', user.email).maybeSingle()
      setMijnNaam(me?.naam || user.email || '')
      await loadAll()
      await loadProeverijen()
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
    if (activeTab !== 'status') return
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
      setActiveTab('partners')
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
    await supabase.from('partners').update({ ticket_codes: val } as any).eq('id', p.id)
    setPartners(partners.map(x => x.id === p.id ? ({ ...x, ticket_codes: val } as any) : x))
    flash(`${aantal} ticketcodes gegenereerd`)
  }

  const openPartner = async (id: string) => {
    setSelectedId(id)
    const { data } = await supabase.from('documenten').select('*').eq('partner_id', id).order('created_at', { ascending: false })
    setPartnerDocs(data || [])
  }

  const updatePartner = async (id: string, patch: Partial<Partner>) => {
    await supabase.from('partners').update(patch).eq('id', id)
    setPartners(partners.map(p => p.id === id ? { ...p, ...patch } : p))
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
    await supabase.from('producten_catalogus').update(patch).eq('id', id)
    setProducten(producten.map(p => p.id === id ? { ...p, ...patch } : p))
  }
  const deleteProduct = async (id: string) => {
    if (!confirm('Product verwijderen?')) return
    await supabase.from('producten_catalogus').delete().eq('id', id)
    setProducten(producten.filter(p => p.id !== id)); flash('Verwijderd')
  }

  // ---- Proeverijen & Restaurant (boekbare momenten) ----
  // Elk moment krijgt een eigen ticket_types-rij (category='extra', public=false,
  // active=false). Zo verschijnt hij NOOIT in de publieke kassa op nachtvandewijn.nl,
  // en is hij pas echt boekbaar in de bezoekers-app zodra jij hier "Boekbaar" aanzet.
  const addProeverij = async () => {
    const { soort, titel, host, beschrijving, dag, start_tijd, eind_tijd, locatie, capaciteit, prijs, partner_id } = newProeverij
    if (!titel.trim() || !capaciteit || !prijs) { flash('Vul titel, capaciteit en prijs in.', 5000); return }
    const dagInfo = PROGRAMMA_DAGEN.find(d => d.value === dag)!
    let typeId = (soort === 'restaurant' ? 'resto_' : 'proef_') + (slugify(titel) || 'moment')
    if (extraTypes.some(t => t.id === typeId) || proeverijen.some(p => p.ticket_type_id === typeId)) typeId += '_' + Date.now().toString(36)

    const { error: ttErr } = await supabase.from('ticket_types').insert({
      id: typeId, name_nl: titel, name_en: titel,
      price_cents: Math.round(parseFloat(prijs) * 100),
      valid_days: [dag], stock_days: [],
      admits_count: 1, max_per_order: soort === 'restaurant' ? 8 : 6,
      per_type_cap: parseInt(capaciteit), category: 'extra', public: false, active: false,
      description_nl: beschrijving || '', description_en: beschrijving || '',
    })
    if (ttErr) { flash('Fout bij aanmaken: ' + ttErr.message, 6000); return }

    const { error } = await supabase.from('proeverijen').insert({
      partner_id: partner_id || null, ticket_type_id: typeId, titel, host: host || null,
      beschrijving: beschrijving || null, dag,
      start_tijd: start_tijd ? `${dagInfo.datum}T${start_tijd}:00+01:00` : null,
      eind_tijd: eind_tijd ? `${dagInfo.datum}T${eind_tijd}:00+01:00` : null,
      locatie: locatie || null, capaciteit: parseInt(capaciteit), volgorde: proeverijen.length + 1,
      actief: true, soort,
    })
    if (error) { flash('Fout: ' + error.message, 6000); await supabase.from('ticket_types').delete().eq('id', typeId); return }

    flash('Toegevoegd, nog NIET boekbaar. Zet "Boekbaar" aan zodra je het wilt openstellen.', 7000)
    setNewProeverij({ soort: 'proeverij', titel: '', host: '', beschrijving: '', dag: 'fri', start_tijd: '', eind_tijd: '', locatie: '', capaciteit: '20', prijs: '', partner_id: '' })
    await loadProeverijen()
  }

  const updateProeverij = async (id: string, patch: Partial<Proeverij>) => {
    await supabase.from('proeverijen').update(patch).eq('id', id)
    setProeverijen(proeverijen.map(p => p.id === id ? { ...p, ...patch } : p))
  }

  const updateExtraType = async (typeId: string, patch: Partial<ExtraTicketType>) => {
    await supabase.from('ticket_types').update(patch).eq('id', typeId)
    setExtraTypes(extraTypes.map(t => t.id === typeId ? { ...t, ...patch } : t))
  }

  const toggleBoekbaar = async (typeId: string, active: boolean) => {
    await updateExtraType(typeId, { active })
    flash(active ? 'Boekbaar. Bezoekers kunnen dit nu echt afrekenen in de app.' : 'Niet meer boekbaar.', 5000)
  }

  const deleteProeverij = async (p: Proeverij) => {
    const t = extraTypes.find(x => x.id === p.ticket_type_id)
    if ((t?.per_type_sold ?? 0) > 0) { flash('Hier zijn al boekingen op -- verwijderen kan niet. Zet "Boekbaar" uit om te stoppen.', 8000); return }
    if (!confirm(`"${p.titel}" verwijderen?`)) return
    await supabase.from('proeverijen').delete().eq('id', p.id)
    await supabase.from('ticket_types').delete().eq('id', p.ticket_type_id)
    setProeverijen(proeverijen.filter(x => x.id !== p.id))
    setExtraTypes(extraTypes.filter(x => x.id !== p.ticket_type_id))
    flash('Verwijderd')
  }

  // ---- FAQ ----
  const addFaq = async () => {
    if (!newFaq.vraag || !newFaq.antwoord) return
    const max = Math.max(0, ...faqItems.filter(f => f.categorie === newFaq.categorie).map(f => f.volgorde))
    const { data, error } = await supabase.from('faq').insert({ vraag: newFaq.vraag, antwoord: newFaq.antwoord, categorie: newFaq.categorie, volgorde: max + 1, actief: true }).select().single()
    if (!error && data) { setFaqItems([...faqItems, data]); setNewFaq({ vraag: '', antwoord: '', categorie: 'logistiek' }); flash('FAQ toegevoegd') }
  }
  const updateFaq = async (id: string, patch: Partial<FAQ>) => {
    await supabase.from('faq').update(patch).eq('id', id)
    setFaqItems(faqItems.map(f => f.id === id ? { ...f, ...patch } : f))
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
    const pw = genPassword()
    const { error } = await supabase.rpc('admin_create_teamlid', { p_email: newTeamlid.email, p_naam: newTeamlid.naam, p_temp_password: pw })
    if (error) { flash('Fout: ' + error.message, 6000); return }
    const mail = await stuurWelkomstmail(newTeamlid.email, newTeamlid.naam, false)
    await loadAll()
    if (mail.ok) flash(`${newTeamlid.naam} toegevoegd — welkomstmail verstuurd naar ${newTeamlid.email}.`, 8000)
    else flash(`${newTeamlid.naam} toegevoegd. Mail nog niet actief — login: ${newTeamlid.email} / wachtwoord: ${pw} (deel handmatig).`, 15000)
    setNewTeamlid({ email: '', naam: '' })
  }
  const toggleAdmin = async (a: Admin) => {
    await supabase.from('admins').update({ actief: !a.actief }).eq('id', a.id)
    setAdmins(admins.map(x => x.id === a.id ? { ...x, actief: !a.actief } : x))
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

  const S = {
    page: { display: 'flex', minHeight: '100vh', background: 'var(--sand)' } as React.CSSProperties,
    sidebar: { width: '210px', background: 'var(--navy)', flexShrink: 0 } as React.CSSProperties,
    sidebarTop: { padding: '24px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)' } as React.CSSProperties,
    logo: { fontSize: '10px', fontWeight: '700', letterSpacing: '2px', textTransform: 'uppercase' as const, color: 'var(--gold)' },
    adminLabel: { fontSize: '13px', fontWeight: '700', color: 'var(--cream)', marginTop: '4px' },
    navItem: (active: boolean) => ({
      display: 'block', width: '100%', padding: '10px 20px', textAlign: 'left' as const,
      background: active ? 'rgba(254,183,42,0.12)' : 'transparent',
      borderTop: 'none', borderRight: 'none', borderBottom: 'none',
      borderLeft: active ? '3px solid var(--gold)' : '3px solid transparent',
      color: active ? 'var(--gold)' : 'rgba(255,255,255,0.55)',
      fontSize: '12px', fontWeight: '600', letterSpacing: '1px', textTransform: 'uppercase' as const,
      cursor: 'pointer', fontFamily: 'Inter, sans-serif',
    }),
    main: { flex: 1, padding: '32px 40px', maxWidth: '1100px' } as React.CSSProperties,
    title: { fontFamily: 'Fraunces, Georgia, serif', fontSize: '24px', fontWeight: '700', letterSpacing: '0', color: 'var(--navy)', marginBottom: '6px' },
    sub: { fontSize: '13px', color: '#888', marginBottom: '24px' },
    card: { background: 'var(--card)', padding: '24px', marginBottom: '16px', borderRadius: '14px', border: '1px solid rgba(1,3,65,0.08)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' } as React.CSSProperties,
    cardTitle: { fontSize: '11px', fontWeight: '700', letterSpacing: '2px', textTransform: 'uppercase' as const, color: 'var(--bordeaux)', marginBottom: '16px' },
    label: { display: 'block', fontSize: '11px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase' as const, color: '#666', marginBottom: '6px', marginTop: '12px' },
    input: { width: '100%', padding: '9px 12px', border: '1px solid #ddd', fontSize: '13px', fontFamily: 'Inter, sans-serif', outline: 'none', borderRadius: '2px', color: 'var(--navy)', background: '#fff' } as React.CSSProperties,
    btn: { padding: '10px 20px', background: 'var(--navy)', color: 'var(--cream)', border: 'none', fontSize: '11px', fontWeight: '700', letterSpacing: '2px', textTransform: 'uppercase' as const, cursor: 'pointer', fontFamily: 'Inter, sans-serif', borderRadius: '2px', marginTop: '16px' },
    btnSm: { padding: '6px 12px', background: 'transparent', color: 'var(--bordeaux)', border: '1px solid var(--bordeaux)', fontSize: '10px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase' as const, cursor: 'pointer', borderRadius: '2px' },
    grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' },
    grid3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' },
    table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: '13px' },
    th: { textAlign: 'left' as const, fontSize: '10px', fontWeight: '700', letterSpacing: '2px', textTransform: 'uppercase' as const, color: '#999', padding: '8px 12px', borderBottom: '2px solid #eee' },
    td: { padding: '10px 12px', borderBottom: '1px solid #f0f0f0', color: 'var(--navy)', verticalAlign: 'top' as const },
    badge: (ok: boolean) => ({ display: 'inline-block', padding: '2px 8px', fontSize: '10px', fontWeight: '700', borderRadius: '2px', background: ok ? '#e8f5e9' : '#fff3e0', color: ok ? '#2e7d32' : '#e65100' }),
    successMsg: { background: '#e8f5e9', border: '1px solid #4caf50', color: '#2e7d32', padding: '12px 16px', borderRadius: '2px', fontSize: '13px', marginBottom: '20px', fontWeight: '600' } as React.CSSProperties,
  }

  if (loading) return <div style={{ padding: '40px' }}>Laden...</div>

  const openVragen = vragen.filter(v => v.status === 'open')

  const NAV = [
    { id: 'overzicht', label: 'Overzicht' },
    { id: 'partners', label: 'Partners' },
    { id: 'toevoegen', label: 'Partner toevoegen' },
    { id: 'producten', label: 'Producten' },
    { id: 'kassa', label: 'Kassa & omzet' },
    { id: 'programma', label: 'Proeverijen & Restaurant' },
    { id: 'faq', label: 'FAQ & spelregels' },
    { id: 'crew', label: 'Crew' },
    { id: 'documenten', label: 'Documenten' },
    { id: 'teksten', label: 'Teksten & deadlines' },
    { id: 'team', label: 'Team' },
    { id: 'export', label: 'Exports' },
    { id: 'vragen', label: `Vragen ${openVragen.length > 0 ? `(${openVragen.length})` : ''}` },
    { id: 'activiteit', label: 'Activiteit' },
    { id: 'app', label: 'Bezoekers-app' },
    { id: 'status', label: 'Status' },
  ]

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
        <nav style={{ padding: '16px 0', flex: 1, overflowY: 'auto' }}>
          {NAV.map(item => (
            <button key={item.id} style={S.navItem(activeTab === item.id)} onClick={() => setActiveTab(item.id)}>{item.label}</button>
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
        {saveMsg && <div style={S.successMsg}>{saveMsg}</div>}

        {/* OVERZICHT */}
        {activeTab === 'overzicht' && (
          <>
            <div style={S.title}>Welkom, {mijnNaam.split(' ')[0]}</div>
            <div style={S.sub}>Nacht van de Wijn 2026 · partnerbeheer</div>
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={S.cardTitle}>Laatste activiteit</div>
                <button style={S.btnSm} onClick={() => setActiveTab('activiteit')}>Alles bekijken</button>
              </div>
              {log.length === 0 && <p style={{ fontSize: '13px', color: '#999' }}>Nog geen activiteit.</p>}
              {log.slice(0, 6).map(e => {
                const { wie, zin } = logZin(e)
                return (
                  <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f0f0f0', fontSize: '13px' }}>
                    <span style={{ color: 'var(--navy)' }}><strong>{wie}</strong> {zin}</span>
                    <span style={{ color: '#aaa', fontSize: '11px', whiteSpace: 'nowrap', marginLeft: '12px' }}>{new Date(e.created_at).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* BEZOEKERS-APP */}
        {activeTab === 'app' && (
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

        {/* STATUS / MISSION CONTROL */}
        {activeTab === 'status' && (
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

        {/* ACTIVITEIT */}
        {activeTab === 'activiteit' && (
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

        {/* PARTNERS — overzicht */}
        {activeTab === 'partners' && !selectedId && (
          <>
            <div style={S.title}>Partners overzicht</div>
            <div style={S.sub}>{partners.length} partners. Klik op een bedrijfsnaam voor het detailscherm.</div>
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
          const num = (v: string) => v === '' ? null : Number(v)
          return (
            <>
              <button style={{ ...S.btnSm, marginBottom: '16px' }} onClick={() => { setSelectedId(null); setPartnerDocs([]) }}>← Terug naar overzicht</button>
              <div style={S.title}>{sp.bedrijfsnaam}</div>
              <div style={S.sub}>{sp.naam} · {sp.email} · {sp.type === 'food' ? 'Foodtruck' : 'Wijnpartner'}</div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                {/* Afspraken */}
                <div style={S.card}>
                  <div style={S.cardTitle}>Afspraken</div>
                  <label style={S.label}>Pakket</label>
                  <select style={S.input} value={sp.pakket} onChange={e => updatePartner(sp.id, { pakket: e.target.value })}>
                    {(sp.type === 'food' ? ['foodtruck'] : ['branded_bar', 'own_bar', 'restaurant_host', 'entrance_host', 'silent_disco']).map(v => <option key={v} value={v}>{PAKKET_LABELS[v]}</option>)}
                  </select>
                  <div style={S.grid2}>
                    <div>
                      <label style={S.label}>Afdracht %</label>
                      <input style={S.input} type="number" defaultValue={sp.afdracht_percentage} onBlur={e => Number(e.target.value) !== sp.afdracht_percentage && updatePartner(sp.id, { afdracht_percentage: Number(e.target.value) })} />
                    </div>
                    <div>
                      <label style={S.label}>Gratis tickets</label>
                      <input style={S.input} type="number" defaultValue={sp.gratis_tickets} onBlur={e => Number(e.target.value) !== sp.gratis_tickets && updatePartner(sp.id, { gratis_tickets: Number(e.target.value) })} />
                    </div>
                    <div>
                      <label style={S.label}>Crewtickets</label>
                      <input style={S.input} type="number" defaultValue={sp.crew_tickets ?? 0} onBlur={e => Number(e.target.value) !== (sp.crew_tickets ?? 0) && updatePartner(sp.id, { crew_tickets: Number(e.target.value) })} />
                    </div>
                  </div>
                  {sp.type === 'food' && (
                    <>
                      <label style={S.label}>Standplaatsvergoeding € (excl. btw)</label>
                      <input style={S.input} type="number" step="0.01" defaultValue={sp.standplaats_vergoeding ?? ''} onBlur={e => updatePartner(sp.id, { standplaats_vergoeding: num(e.target.value) as any })} />
                    </>
                  )}
                  <label style={S.label}>{sp.type === 'food' ? 'Standplaats' : 'Barlocatie'}</label>
                  <input style={S.input} defaultValue={sp.barlocatie ?? ''} onBlur={e => updatePartner(sp.id, { barlocatie: e.target.value || null })} />
                </div>

                {/* Offerte + tickets */}
                <div style={S.card}>
                  <div style={S.cardTitle}>Offerte &amp; tickets</div>
                  <div style={{ padding: '4px 0 14px' }}>
                    <span style={S.badge(!!sp.contract_ondertekend)}>{sp.contract_ondertekend ? 'Contract getekend' : 'Nog niet getekend'}</span>
                    {sp.contract_ondertekend && sp.contract_ondertekend_datum && <span style={{ fontSize: '11px', color: '#999', marginLeft: '8px' }}>door {sp.contract_ondertekenaar} op {new Date(sp.contract_ondertekend_datum).toLocaleDateString('nl-NL')}</span>}
                    {sp.contract_handtekening && <img src={sp.contract_handtekening} alt="handtekening" style={{ display: 'block', marginTop: '10px', maxWidth: '220px', height: 'auto', background: '#fff', border: '1px solid #eee' }} />}
                  </div>
                  <label style={S.label}>Ticketcodes automatisch genereren</label>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
                    <input style={{ ...S.input, width: '100px' }} type="number" min="1" value={genAantal} onChange={e => setGenAantal(e.target.value)} placeholder="aantal" />
                    <button style={S.btnSm} onClick={() => genereerTicketcodes(sp, parseInt(genAantal))}>Genereer ticketcodes</button>
                  </div>
                  <label style={S.label}>Ticketcodes (komma-gescheiden)</label>
                  <textarea key={(sp as any).ticket_codes || 'leeg'} style={{ ...S.input, height: '64px', fontFamily: 'monospace', fontSize: '12px' }} defaultValue={(sp as any).ticket_codes || ''} onBlur={e => updatePartner(sp.id, { ticket_codes: e.target.value } as any)} placeholder="CODE1,CODE2,CODE3" />
                  <label style={S.label}>Eigen kortingscode</label>
                  <input style={S.input} defaultValue={sp.kortingscode ?? ''} onBlur={e => updatePartner(sp.id, { kortingscode: e.target.value.toUpperCase() || null })} placeholder="standaard" />
                  <div style={{ marginTop: '14px' }}>
                    {sp.user_id && <span style={{ ...S.badge(true), marginRight: '8px' }}>login actief</span>}
                    <button style={S.btnSm} onClick={() => stuurInlog(sp)}>{sp.user_id ? 'Inlogmail opnieuw sturen' : 'Stuur inlogmail'}</button>
                  </div>
                </div>
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

        {/* TOEVOEGEN */}
        {activeTab === 'toevoegen' && (
          <>
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
        {activeTab === 'programma' && (() => {
          const typeById = new Map(extraTypes.map(t => [t.id, t]))
          return (
            <>
              <div style={S.title}>Proeverijen &amp; Restaurant</div>
              <div style={S.sub}>Boekbare momenten voor de bezoekers-app. Elk moment is een los ticket via dezelfde kassa als de festivaltickets.</div>
              <div style={{ background: '#fff3e0', border: '1px solid #ffb74d', color: '#8a5a00', padding: '12px 16px', borderRadius: '2px', fontSize: '13px', marginBottom: '20px' }}>
                <strong>Let op:</strong> een nieuw moment staat standaard NIET boekbaar. Zet &quot;Boekbaar&quot; pas aan zodra alles klopt, dan pas kan iemand er in de app echt voor afrekenen.
              </div>

              {proeverijen.length > 0 && (
                <div style={S.card}>
                  <div style={S.cardTitle}>Huidige momenten</div>
                  <table style={S.table}>
                    <thead><tr>{['Titel', 'Soort', 'Dag & tijd', 'Locatie', 'Capaciteit', 'Prijs', 'Verkocht', 'Boekbaar', ''].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {proeverijen.map(p => {
                        const t = typeById.get(p.ticket_type_id)
                        const dagLabel = PROGRAMMA_DAGEN.find(d => d.value === p.dag)?.label || p.dag
                        return (
                          <tr key={p.id}>
                            <td style={S.td}>
                              <input style={{ ...S.input, fontWeight: '600' }} defaultValue={p.titel} onBlur={e => e.target.value !== p.titel && updateProeverij(p.id, { titel: e.target.value })} />
                              <input style={{ ...S.input, marginTop: '4px', fontSize: '11px' }} defaultValue={p.host || ''} placeholder="Host" onBlur={e => e.target.value !== (p.host || '') && updateProeverij(p.id, { host: e.target.value || null })} />
                            </td>
                            <td style={S.td}>{p.soort === 'restaurant' ? 'Restaurant' : 'Proeverij'}</td>
                            <td style={{ ...S.td, fontSize: '12px' }}>{dagLabel}<br />{tijdUit(p.start_tijd)}{p.eind_tijd ? `–${tijdUit(p.eind_tijd)}` : ''}</td>
                            <td style={S.td}><input style={S.input} defaultValue={p.locatie || ''} onBlur={e => e.target.value !== (p.locatie || '') && updateProeverij(p.id, { locatie: e.target.value || null })} /></td>
                            <td style={{ ...S.td, width: '90px' }}><input style={S.input} type="number" defaultValue={t?.per_type_cap ?? p.capaciteit} onBlur={e => { const n = parseInt(e.target.value); if (n !== t?.per_type_cap) { updateExtraType(p.ticket_type_id, { per_type_cap: n }); updateProeverij(p.id, { capaciteit: n }) } }} /></td>
                            <td style={{ ...S.td, width: '90px' }}><input style={S.input} type="number" step="0.01" defaultValue={t ? (t.price_cents / 100).toFixed(2) : ''} onBlur={e => { const cents = Math.round(parseFloat(e.target.value) * 100); if (cents !== t?.price_cents) updateExtraType(p.ticket_type_id, { price_cents: cents }) }} /></td>
                            <td style={S.td}>{t ? `${t.per_type_sold}/${t.per_type_cap ?? '∞'}` : '–'}</td>
                            <td style={S.td}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', cursor: 'pointer' }}>
                                <input type="checkbox" checked={t?.active ?? false} onChange={e => toggleBoekbaar(p.ticket_type_id, e.target.checked)} />
                                {t?.active ? <span style={{ color: '#2e7d32', fontWeight: 700 }}>Ja</span> : <span style={{ color: '#999' }}>Nee</span>}
                              </label>
                            </td>
                            <td style={S.td}><button style={S.btnSm} onClick={() => deleteProeverij(p)}>Verwijder</button></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div style={S.card}>
                <div style={S.cardTitle}>Nieuw moment</div>
                <div style={S.grid2}>
                  <div>
                    <label style={S.label}>Soort</label>
                    <select style={S.input} value={newProeverij.soort} onChange={e => setNewProeverij({ ...newProeverij, soort: e.target.value as 'proeverij' | 'restaurant' })}>
                      <option value="proeverij">Proeverij / masterclass</option>
                      <option value="restaurant">Restaurant-shift</option>
                    </select>
                  </div>
                  <div>
                    <label style={S.label}>Titel</label>
                    <input style={S.input} value={newProeverij.titel} onChange={e => setNewProeverij({ ...newProeverij, titel: e.target.value })} placeholder="bijv. Masterclass Bourgogne" />
                  </div>
                  <div>
                    <label style={S.label}>Host</label>
                    <input style={S.input} value={newProeverij.host} onChange={e => setNewProeverij({ ...newProeverij, host: e.target.value })} placeholder="bijv. Sommelier team NvdW" />
                  </div>
                  <div>
                    <label style={S.label}>Gekoppelde partner (optioneel)</label>
                    <select style={S.input} value={newProeverij.partner_id} onChange={e => setNewProeverij({ ...newProeverij, partner_id: e.target.value })}>
                      <option value="">Geen (organisatie)</option>
                      {partners.map(p => <option key={p.id} value={p.id}>{p.bedrijfsnaam}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={S.label}>Dag</label>
                    <select style={S.input} value={newProeverij.dag} onChange={e => setNewProeverij({ ...newProeverij, dag: e.target.value as 'fri' | 'sat' | 'sun' })}>
                      {PROGRAMMA_DAGEN.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={S.label}>Locatie</label>
                    <input style={S.input} value={newProeverij.locatie} onChange={e => setNewProeverij({ ...newProeverij, locatie: e.target.value })} placeholder="bijv. Podium / Mezzanine" />
                  </div>
                  <div>
                    <label style={S.label}>Starttijd</label>
                    <input style={S.input} type="time" value={newProeverij.start_tijd} onChange={e => setNewProeverij({ ...newProeverij, start_tijd: e.target.value })} />
                  </div>
                  <div>
                    <label style={S.label}>Eindtijd</label>
                    <input style={S.input} type="time" value={newProeverij.eind_tijd} onChange={e => setNewProeverij({ ...newProeverij, eind_tijd: e.target.value })} />
                  </div>
                  <div>
                    <label style={S.label}>Capaciteit (plekken)</label>
                    <input style={S.input} type="number" value={newProeverij.capaciteit} onChange={e => setNewProeverij({ ...newProeverij, capaciteit: e.target.value })} />
                  </div>
                  <div>
                    <label style={S.label}>Prijs per persoon (€)</label>
                    <input style={S.input} type="number" step="0.01" value={newProeverij.prijs} onChange={e => setNewProeverij({ ...newProeverij, prijs: e.target.value })} placeholder="0.00" />
                  </div>
                </div>
                <div>
                  <label style={S.label}>Beschrijving</label>
                  <textarea style={{ ...S.input, height: '70px', resize: 'vertical' }} value={newProeverij.beschrijving} onChange={e => setNewProeverij({ ...newProeverij, beschrijving: e.target.value })} />
                </div>
                <button style={S.btn} onClick={addProeverij}>Toevoegen</button>
              </div>
            </>
          )
        })()}

        {/* FAQ */}
        {activeTab === 'faq' && (
          <>
            <div style={S.title}>FAQ &amp; spelregels</div>
            <div style={S.sub}>De vragen en antwoorden die partners in hun portal zien.</div>
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

        {/* DOCUMENTEN */}
        {activeTab === 'documenten' && (
          <>
            <div style={S.title}>Documenten</div>
            <div style={S.sub}>Uploads die partners onder &quot;Documenten&quot; kunnen downloaden.</div>
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

        {/* TEKSTEN */}
        {activeTab === 'teksten' && (
          <>
            <div style={S.title}>Teksten &amp; deadlines</div>
            <div style={S.sub}>Vaste teksten, deadlines en prijzen die partners in hun portal zien.</div>
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
            <div style={S.sub}>Beheerders van de portal. Iedereen hier heeft volledige toegang.</div>
            <div style={S.card}>
              <table style={S.table}>
                <thead><tr>{['Naam', 'E-mail', 'Rol', 'Status', ''].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {admins.map(a => (
                    <tr key={a.id}>
                      <td style={S.td}><div style={{ fontWeight: '600' }}>{a.naam}</div></td>
                      <td style={S.td}>{a.email}</td>
                      <td style={S.td}>{a.rol}</td>
                      <td style={S.td}><span style={S.badge(a.actief)}>{a.actief ? 'actief' : 'inactief'}</span></td>
                      <td style={S.td}>{a.rol !== 'owner' && <button style={S.btnSm} onClick={() => toggleAdmin(a)}>{a.actief ? 'Deactiveer' : 'Activeer'}</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={S.card}>
              <div style={S.cardTitle}>Teamlid toevoegen</div>
              <div style={S.grid2}>
                <div><label style={S.label}>Naam</label><input style={S.input} value={newTeamlid.naam} onChange={e => setNewTeamlid({ ...newTeamlid, naam: e.target.value })} /></div>
                <div><label style={S.label}>E-mailadres</label><input style={S.input} value={newTeamlid.email} onChange={e => setNewTeamlid({ ...newTeamlid, email: e.target.value })} placeholder="naam@nachtvandewijn.nl" /></div>
              </div>
              <button style={S.btn} onClick={addTeamlid}>Login aanmaken</button>
              <p style={{ fontSize: '12px', color: '#999', marginTop: '12px' }}>Er wordt automatisch een tijdelijk wachtwoord gegenereerd. Geef dit door aan het teamlid; ze kunnen het later wijzigen.</p>
            </div>
          </>
        )}

        {/* EXPORT */}
        {activeTab === 'export' && (
          <>
            <div style={S.title}>Exports</div>
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

        {/* VRAGEN */}
        {activeTab === 'vragen' && (
          <>
            <div style={S.title}>Partner vragen</div>
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
      </main>
    </div>
  )
}
