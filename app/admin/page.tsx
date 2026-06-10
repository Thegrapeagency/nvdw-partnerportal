'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Partner, PartnerVraag, Product, FAQ, PortalTekst, Admin, Document, ActiviteitLog } from '@/lib/supabase'
import { LOG_TABEL_LABEL, LOG_ACTIE_LABEL } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

const PAKKET_LABELS: Record<string, string> = {
  branded_bar: 'Branded Bar',
  own_bar: 'Own Bar',
  restaurant_host: 'Restaurant Host',
  entrance_host: 'Entrance Host',
  silent_disco: 'Silent Disco',
  foodtruck: 'Foodtruck',
}

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
  const [mijnNaam, setMijnNaam] = useState('')
  const [activeTab, setActiveTab] = useState('overzicht')
  const [loading, setLoading] = useState(true)
  const [saveMsg, setSaveMsg] = useState('')
  const [exportLoading, setExportLoading] = useState(false)
  const [newPartner, setNewPartner] = useState({
    naam: '', bedrijfsnaam: '', email: '', type: 'wijn', pakket: 'own_bar', avond: 'alle', gratis_tickets: '20', afdracht_percentage: '25', standplaats_vergoeding: '', barlocatie: '', notities: ''
  })
  const [antwoordMap, setAntwoordMap] = useState<Record<string, string>>({})
  const [newProduct, setNewProduct] = useState({ naam: '', omschrijving: '', prijs: '', eenheid: 'stuk' })
  const [newFaq, setNewFaq] = useState({ vraag: '', antwoord: '', categorie: 'logistiek' })
  const [tekstDraft, setTekstDraft] = useState<Record<string, string>>({})
  const [newTeamlid, setNewTeamlid] = useState({ email: '', naam: '' })
  const [docUpload, setDocUpload] = useState({ naam: '', categorie: 'draaiboek', file: null as File | null })
  const [uploading, setUploading] = useState(false)

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
    const [p, v, pr, f, t, a, d, l] = await Promise.all([
      supabase.from('partners').select('*').order('created_at', { ascending: false }),
      supabase.from('partner_vragen').select('*').order('created_at', { ascending: false }),
      supabase.from('producten_catalogus').select('*').order('volgorde'),
      supabase.from('faq').select('*').order('categorie').order('volgorde'),
      supabase.from('portal_teksten').select('*').order('volgorde'),
      supabase.from('admins').select('*').order('created_at'),
      supabase.from('documenten').select('*').order('created_at', { ascending: false }),
      supabase.from('activiteit_log').select('*').order('created_at', { ascending: false }).limit(300),
    ])
    setPartners(p.data || []); setVragen(v.data || []); setProducten(pr.data || [])
    setFaqItems(f.data || []); setTeksten(t.data || []); setAdmins(a.data || []); setDocumenten(d.data || [])
    setLog(l.data || [])
    const td: Record<string, string> = {}
    ;(t.data || []).forEach((x: PortalTekst) => { td[x.sleutel] = x.waarde })
    setTekstDraft(td)
  }

  const refreshLog = async () => {
    const { data } = await supabase.from('activiteit_log').select('*').order('created_at', { ascending: false }).limit(300)
    setLog(data || [])
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
      setLoading(false)
    }
    init()
  }, [router])

  // ---- Partners ----
  const handleAddPartner = async () => {
    if (!newPartner.naam || !newPartner.bedrijfsnaam || !newPartner.email) return
    const { data, error } = await supabase.from('partners').insert({
      naam: newPartner.naam, bedrijfsnaam: newPartner.bedrijfsnaam, email: newPartner.email,
      type: newPartner.type, pakket: newPartner.pakket, avond: newPartner.avond,
      gratis_tickets: parseInt(newPartner.gratis_tickets), afdracht_percentage: parseInt(newPartner.afdracht_percentage),
      standplaats_vergoeding: newPartner.type === 'food' && newPartner.standplaats_vergoeding ? parseFloat(newPartner.standplaats_vergoeding) : null,
      barlocatie: newPartner.barlocatie || null, notities: newPartner.notities || null,
    }).select().single()
    if (!error && data) {
      setPartners([data, ...partners])
      setNewPartner({ naam: '', bedrijfsnaam: '', email: '', type: 'wijn', pakket: 'own_bar', avond: 'alle', gratis_tickets: '20', afdracht_percentage: '25', standplaats_vergoeding: '', barlocatie: '', notities: '' })
      flash('Partner aangemaakt. Maak nu een login aan via de knop in het overzicht.', 6000)
      setActiveTab('partners')
    } else if (error) {
      flash('Fout: ' + error.message, 6000)
    }
  }

  const maakPartnerLogin = async (p: Partner) => {
    const pw = genPassword()
    const { data, error } = await supabase.rpc('admin_create_partner_login', { p_partner_id: p.id, p_temp_password: pw })
    if (error) { flash('Fout: ' + error.message, 6000); return }
    setPartners(partners.map(x => x.id === p.id ? { ...x, user_id: (data as any)?.user_id || 'set' } : x))
    const mail = await stuurWelkomstmail(p.email, p.naam, p.type === 'food')
    if (mail.ok) flash(`Login klaar — welkomstmail verstuurd naar ${p.email}.`, 8000)
    else flash(`Login klaar voor ${p.email}. Mail nog niet actief — tijdelijk wachtwoord: ${pw} (deel handmatig).`, 15000)
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

  const S = {
    page: { display: 'flex', minHeight: '100vh', background: 'var(--sand)' } as React.CSSProperties,
    sidebar: { width: '210px', background: 'var(--navy)', flexShrink: 0 } as React.CSSProperties,
    sidebarTop: { padding: '24px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)' } as React.CSSProperties,
    logo: { fontSize: '10px', fontWeight: '700', letterSpacing: '2px', textTransform: 'uppercase' as const, color: 'var(--gold)' },
    adminLabel: { fontSize: '13px', fontWeight: '700', color: 'var(--cream)', marginTop: '4px' },
    navItem: (active: boolean) => ({
      display: 'block', width: '100%', padding: '10px 20px', textAlign: 'left' as const,
      background: active ? 'rgba(254,183,42,0.12)' : 'transparent',
      borderLeft: active ? '3px solid var(--gold)' : '3px solid transparent',
      color: active ? 'var(--gold)' : 'rgba(255,255,255,0.55)',
      fontSize: '12px', fontWeight: '600', letterSpacing: '1px', textTransform: 'uppercase' as const,
      cursor: 'pointer', border: 'none', fontFamily: 'Inter, sans-serif',
    }),
    main: { flex: 1, padding: '32px 40px', maxWidth: '1100px' } as React.CSSProperties,
    title: { fontSize: '22px', fontWeight: '800', textTransform: 'uppercase' as const, letterSpacing: '1px', color: 'var(--navy)', marginBottom: '6px' },
    sub: { fontSize: '13px', color: '#888', marginBottom: '24px' },
    card: { background: 'var(--cream)', padding: '24px', marginBottom: '16px', borderRadius: '2px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' } as React.CSSProperties,
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
    { id: 'faq', label: 'FAQ & spelregels' },
    { id: 'documenten', label: 'Documenten' },
    { id: 'teksten', label: 'Teksten & deadlines' },
    { id: 'team', label: 'Team' },
    { id: 'export', label: 'Exports' },
    { id: 'vragen', label: `Vragen ${openVragen.length > 0 ? `(${openVragen.length})` : ''}` },
    { id: 'activiteit', label: 'Activiteit' },
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

        {/* PARTNERS */}
        {activeTab === 'partners' && (
          <>
            <div style={S.title}>Partners overzicht</div>
            <div style={S.sub}>{partners.length} partners. Klik op ticketcodes of kortingscode om te bewerken.</div>
            <div style={S.card}>
              <div style={{ overflowX: 'auto' }}>
                <table style={S.table}>
                  <thead>
                    <tr>{['Bedrijf', 'Type', 'Pakket', 'Avond', 'Status', 'Offerte', 'Tickets', 'Afdracht', 'Ticketcodes', 'Kortingscode', 'Login'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {partners.map(p => (
                      <tr key={p.id}>
                        <td style={S.td}><div style={{ fontWeight: '700' }}>{p.bedrijfsnaam}</div><div style={{ fontSize: '11px', color: '#999' }}>{p.email}</div></td>
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
                          {p.user_id
                            ? <span style={S.badge(true)}>actief</span>
                            : <button style={S.btnSm} onClick={() => maakPartnerLogin(p)}>Maak login</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* TOEVOEGEN */}
        {activeTab === 'toevoegen' && (
          <>
            <div style={S.title}>Partner toevoegen</div>
            <div style={S.sub}>Maak de partner aan en daarna in één klik een login via het overzicht.</div>
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
                    setNewPartner({ ...newPartner, type, pakket: type === 'food' ? 'foodtruck' : 'own_bar' })
                  }}>
                    <option value="wijn">Wijnpartner</option>
                    <option value="food">Foodtruck</option>
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
                    {(newPartner.type === 'food' ? ['foodtruck'] : ['branded_bar', 'own_bar', 'restaurant_host', 'entrance_host', 'silent_disco']).map(val => <option key={val} value={val}>{PAKKET_LABELS[val]}</option>)}
                  </select>
                </div>
                <div>
                  <label style={S.label}>Avond(en)</label>
                  <select style={S.input} value={newPartner.avond} onChange={e => setNewPartner({ ...newPartner, avond: e.target.value })}>
                    {['alle', 'vrijdag', 'zaterdag', 'zondag'].map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div>
                  <label style={S.label}>Gratis tickets</label>
                  <input style={S.input} type="number" value={newPartner.gratis_tickets} onChange={e => setNewPartner({ ...newPartner, gratis_tickets: e.target.value })} />
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
            <div style={S.title}>Tactile export</div>
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
