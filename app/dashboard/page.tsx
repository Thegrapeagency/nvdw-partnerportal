'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase, posRpc } from '@/lib/supabase'
import type { Partner, Wijn, Crewcatering, FAQ, PartnerVraag, Product, PortalTekst, Document, MenukaartItem, ActiviteitLog, CrewLid, PosMe, PosSummary } from '@/lib/supabase'
import { ALLERGENEN, LOG_TABEL_LABEL, LOG_ACTIE_LABEL } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

const PAKKET: Record<string, string> = {
  branded_bar: 'Branded Bar', own_bar: 'Own Bar',
  restaurant_host: 'Restaurant Host', entrance_host: 'Entrance Host', silent_disco: 'Silent Disco Host',
  foodtruck: 'Foodtruck',
}

// Shared styles
const S = {
  label: { fontSize: '11px', fontWeight: '600', letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(1,3,65,0.45)', display: 'block', marginBottom: '6px', marginTop: '18px' } as React.CSSProperties,
  input: { width: '100%', padding: '10px 12px', background: 'var(--cream)', border: '1px solid rgba(1,3,65,0.12)', color: 'var(--navy)', fontSize: '14px', outline: 'none' } as React.CSSProperties,
  btn: { padding: '10px 20px', background: 'var(--navy)', color: 'var(--cream)', border: 'none', fontSize: '11px', fontWeight: '600', letterSpacing: '1.5px', textTransform: 'uppercase', cursor: 'pointer', marginTop: '20px' } as React.CSSProperties,
  btnOutline: { padding: '7px 14px', background: 'transparent', color: 'var(--bordeaux)', border: '1px solid var(--bordeaux)', fontSize: '10px', fontWeight: '600', letterSpacing: '1px', textTransform: 'uppercase', cursor: 'pointer' } as React.CSSProperties,
  divider: { borderTop: '1px solid rgba(1,3,65,0.08)', margin: '0' },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' } as React.CSSProperties,
  pageTitle: { fontFamily: 'Fraunces, Georgia, serif', fontWeight: 700, fontSize: '26px', letterSpacing: '0', color: 'var(--navy)', lineHeight: 1.1, marginBottom: '6px' } as React.CSSProperties,
  pageDesc: { fontSize: '13px', color: 'rgba(1,3,65,0.45)', marginBottom: '32px' } as React.CSSProperties,
  sectionTitle: { fontSize: '11px', fontWeight: '600', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(1,3,65,0.4)', marginBottom: '16px' } as React.CSSProperties,
}

function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const dirty = useRef(false)

  const ctx = () => { const c = ref.current!; return c.getContext('2d')! }
  const point = (e: React.PointerEvent) => {
    const c = ref.current!; const r = c.getBoundingClientRect()
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) }
  }
  const down = (e: React.PointerEvent) => { drawing.current = true; const p = point(e); const x = ctx(); x.beginPath(); x.moveTo(p.x, p.y); (e.target as Element).setPointerCapture(e.pointerId) }
  const move = (e: React.PointerEvent) => { if (!drawing.current) return; const p = point(e); const x = ctx(); x.lineWidth = 2.5; x.lineCap = 'round'; x.strokeStyle = '#010341'; x.lineTo(p.x, p.y); x.stroke(); dirty.current = true }
  const up = () => { if (!drawing.current) return; drawing.current = false; if (dirty.current) onChange(ref.current!.toDataURL('image/png')) }
  const clear = () => { const c = ref.current!; ctx().clearRect(0, 0, c.width, c.height); dirty.current = false; onChange(null) }

  return (
    <div>
      <canvas ref={ref} width={500} height={160}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
        style={{ width: '100%', height: '160px', background: '#fff', border: '1px solid rgba(1,3,65,0.2)', borderRadius: '2px', touchAction: 'none', cursor: 'crosshair' }} />
      <button type="button" onClick={clear} style={{ marginTop: '8px', fontSize: '11px', color: 'rgba(1,3,65,0.5)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Wissen</button>
    </div>
  )
}

export default function Dashboard() {
  const router = useRouter()
  const [tab, setTab] = useState('home')
  const [partner, setPartner] = useState<Partner | null>(null)
  const [loading, setLoading] = useState(true)
  const [wijnen, setWijnen] = useState<Wijn[]>([])
  const [catering, setCatering] = useState<Crewcatering[]>([])
  const [faqItems, setFaqItems] = useState<FAQ[]>([])
  const [vragen, setVragen] = useState<PartnerVraag[]>([])
  const [producten, setProducten] = useState<Product[]>([])
  const [teksten, setTeksten] = useState<Record<string, string>>({})
  const [documenten, setDocumenten] = useState<Document[]>([])
  const [log, setLog] = useState<ActiviteitLog[]>([])
  const [msg, setMsg] = useState('')
  const [newWijn, setNewWijn] = useState({ naam: '', producent: '', regio: '', land: '', druif: '', jaar: '', prijs_half_glas: '', prijs_heel_glas: '', prijs_fles: '', beschrijving: '' })
  const [menu, setMenu] = useState<MenukaartItem[]>([])
  const [crew, setCrew] = useState<CrewLid[]>([])
  const [newCrew, setNewCrew] = useState<{ naam: string; functie: string; email: string; dagen: string[]; catering_dagen: string[]; dieet: string }>({ naam: '', functie: '', email: '', dagen: [], catering_dagen: [], dieet: '' })
  const [newGerecht, setNewGerecht] = useState<{ naam: string; omschrijving: string; prijs: string; allergenen: string[] }>({ naam: '', omschrijving: '', prijs: '', allergenen: [] })
  const [techForm, setTechForm] = useState({ stroom_kw: '', stroom_aansluitingen: '', gas_nodig: false, water_nodig: false, techniek_opmerkingen: '' })
  const [newVraag, setNewVraag] = useState({ onderwerp: '', bericht: '' })
  const [signNaam, setSignNaam] = useState('')
  const [signData, setSignData] = useState<string | null>(null)
  const [cateringForm, setCateringForm] = useState<Record<string, { aantal: string; dieet: string }>>({
    vrijdag: { aantal: '0', dieet: '' }, zaterdag: { aantal: '0', dieet: '' }, zondag: { aantal: '0', dieet: '' },
  })

  // Gasttickets
  type GastIssued = {
    id: string
    short_ref: string
    buyer_name: string
    buyer_email: string
    created_at: string
    order_items?: { quantity: number; ticket_type_id: string; ticket_types?: { name_nl?: string } | null }[]
  }
  const GAST_DAGEN = [
    { id: 'day_fri', label: 'Vrijdag 6 nov' },
    { id: 'day_sat', label: 'Zaterdag 7 nov' },
    { id: 'day_sun', label: 'Zondag 8 nov' },
  ]
  const [gastQuota, setGastQuota] = useState(0)
  const [gastUsed, setGastUsed] = useState(0)
  const [gastIssued, setGastIssued] = useState<GastIssued[]>([])
  const [gastLoaded, setGastLoaded] = useState(false)
  const [gastBusy, setGastBusy] = useState(false)
  const [gastForm, setGastForm] = useState({ guest_name: '', guest_email: '', type_id: 'day_fri', qty: '1' })

  // Live omzet uit de kassa (festival_pos)
  const [omzet, setOmzet] = useState<PosSummary | null>(null)
  const [omzetStatus, setOmzetStatus] = useState<'idle' | 'laden' | 'ok' | 'niet_gekoppeld' | 'fout'>('idle')
  const [omzetTijd, setOmzetTijd] = useState<Date | null>(null)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }
      const { data: p } = await supabase.from('partners').select('*').eq('user_id', user.id).single()
      if (!p) { setLoading(false); return }
      setPartner(p)
      setTechForm({
        stroom_kw: p.stroom_kw != null ? String(p.stroom_kw) : '',
        stroom_aansluitingen: p.stroom_aansluitingen || '',
        gas_nodig: !!p.gas_nodig, water_nodig: !!p.water_nodig,
        techniek_opmerkingen: p.techniek_opmerkingen || '',
      })
      const [{ data: w }, { data: m }, { data: c }, { data: cr }, { data: f }, { data: v }, { data: pr }, { data: t }, { data: d }] = await Promise.all([
        supabase.from('wijnlijst').select('*').eq('partner_id', p.id).order('volgorde'),
        supabase.from('menukaart').select('*').eq('partner_id', p.id).order('volgorde'),
        supabase.from('crewcatering').select('*').eq('partner_id', p.id),
        supabase.from('crew').select('*').eq('partner_id', p.id).order('created_at'),
        supabase.from('faq').select('*').eq('actief', true).order('volgorde'),
        supabase.from('partner_vragen').select('*').eq('partner_id', p.id).order('created_at', { ascending: false }),
        supabase.from('producten_catalogus').select('*').eq('actief', true).order('volgorde'),
        supabase.from('portal_teksten').select('*'),
        supabase.from('documenten').select('*').order('created_at', { ascending: false }),
      ])
      setWijnen(w || []); setMenu(m || []); setCatering(c || []); setCrew(cr || []); setFaqItems(f || []); setVragen(v || []); setProducten(pr || [])
      const tmap: Record<string, string> = {}
      ;(t as PortalTekst[] || []).forEach(x => { tmap[x.sleutel] = x.waarde })
      setTeksten(tmap); setDocumenten(d || [])
      const { data: lg } = await supabase.from('activiteit_log').select('*').order('created_at', { ascending: false }).limit(15)
      setLog(lg || [])
      if (c && c.length > 0) {
        const fs: Record<string, { aantal: string; dieet: string }> = { vrijdag: { aantal: '0', dieet: '' }, zaterdag: { aantal: '0', dieet: '' }, zondag: { aantal: '0', dieet: '' } }
        c.forEach((x: Crewcatering) => { fs[x.avond] = { aantal: x.aantal_personen.toString(), dieet: x.dieetwensen || '' } })
        setCateringForm(fs)
      }
      setLoading(false)
    }
    init()
  }, [router])

  // Laad gasttickets zodra de tab geopend wordt (en partner geladen is)
  useEffect(() => {
    if (tab === 'gasttickets' && partner && (partner.gratis_tickets || 0) > 0 && !gastLoaded) {
      laadGasttickets()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, partner])

  // Live omzet: laden bij openen van de tab en daarna elke 15 seconden verversen
  useEffect(() => {
    if (tab !== 'omzet' || !partner) return
    let stop = false
    const laad = async () => {
      try {
        if (!omzet) setOmzetStatus('laden')
        const me = await posRpc<PosMe>('me')
        if (me?.role !== 'partner' && me?.role !== 'super') { if (!stop) setOmzetStatus('niet_gekoppeld'); return }
        const sum = await posRpc<PosSummary>('merchant_sales_summary', { p_merchant_id: null })
        if (!stop) { setOmzet(sum); setOmzetStatus('ok'); setOmzetTijd(new Date()) }
      } catch {
        if (!stop) setOmzetStatus(omzet ? 'ok' : 'fout')
      }
    }
    laad()
    const iv = setInterval(laad, 15000)
    return () => { stop = true; clearInterval(iv) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, partner])

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3000) }
  const logout = async () => { await supabase.auth.signOut(); router.push('/') }
  const T = (k: string, fallback = '') => teksten[k] || fallback
  const cateringPrijs = parseFloat(T('prijs_catering_pp', '19.50')) || 19.5

  const downloadDoc = async (d: Document) => {
    const { data } = await supabase.storage.from('documenten').createSignedUrl(d.storage_path, 120)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  // "4,50" en "4.50" allebei goed inlezen (komma is hier de normale invoer)
  const leesPrijs = (s: string): number | null => {
    if (!s || !s.trim()) return null
    const n = parseFloat(s.trim().replace(',', '.'))
    return isNaN(n) ? null : n
  }

  const addWijn = async () => {
    if (!partner || !newWijn.naam) return
    const { data, error } = await supabase.from('wijnlijst').insert({
      partner_id: partner.id, naam: newWijn.naam, producent: newWijn.producent || null,
      regio: newWijn.regio || null, land: newWijn.land || null, druif: newWijn.druif || null,
      jaar: newWijn.jaar ? parseInt(newWijn.jaar) : null,
      prijs_half_glas: leesPrijs(newWijn.prijs_half_glas),
      prijs_heel_glas: leesPrijs(newWijn.prijs_heel_glas),
      prijs_fles: leesPrijs(newWijn.prijs_fles),
      beschrijving: newWijn.beschrijving || null, volgorde: wijnen.length,
    }).select().single()
    if (!error && data) { setWijnen([...wijnen, data]); setNewWijn({ naam: '', producent: '', regio: '', land: '', druif: '', jaar: '', prijs_half_glas: '', prijs_heel_glas: '', prijs_fles: '', beschrijving: '' }); flash('Wijn toegevoegd. Staat direct in de kassa.') }
    else if (error) flash(error.message)
  }

  const deleteWijn = async (id: string) => { await supabase.from('wijnlijst').delete().eq('id', id); setWijnen(wijnen.filter(w => w.id !== id)) }

  const toggleAllergeen = (a: string) => {
    setNewGerecht(g => ({ ...g, allergenen: g.allergenen.includes(a) ? g.allergenen.filter(x => x !== a) : [...g.allergenen, a] }))
  }

  const addGerecht = async () => {
    if (!partner || !newGerecht.naam) return
    const { data, error } = await supabase.from('menukaart').insert({
      partner_id: partner.id, naam: newGerecht.naam, omschrijving: newGerecht.omschrijving || null,
      prijs: leesPrijs(newGerecht.prijs),
      allergenen: newGerecht.allergenen, volgorde: menu.length,
    }).select().single()
    if (!error && data) { setMenu([...menu, data]); setNewGerecht({ naam: '', omschrijving: '', prijs: '', allergenen: [] }); flash('Gerecht toegevoegd. Staat direct in de kassa.') }
    else if (error) flash(error.message)
  }

  const deleteGerecht = async (id: string) => { await supabase.from('menukaart').delete().eq('id', id); setMenu(menu.filter(m => m.id !== id)) }

  const saveTechniek = async () => {
    if (!partner) return
    const patch = {
      stroom_kw: techForm.stroom_kw ? parseFloat(techForm.stroom_kw) : null,
      stroom_aansluitingen: techForm.stroom_aansluitingen || null,
      gas_nodig: techForm.gas_nodig, water_nodig: techForm.water_nodig,
      techniek_opmerkingen: techForm.techniek_opmerkingen || null,
    }
    await supabase.from('partners').update(patch).eq('id', partner.id)
    setPartner({ ...partner, ...patch })
    flash('Technische gegevens opgeslagen')
  }

  const toggleArr = (key: 'dagen' | 'catering_dagen', dag: string) => {
    setNewCrew(c => ({ ...c, [key]: c[key].includes(dag) ? c[key].filter(d => d !== dag) : [...c[key], dag] }))
  }

  const addCrew = async () => {
    if (!partner || !newCrew.naam) return
    const { data, error } = await supabase.from('crew').insert({
      partner_id: partner.id, naam: newCrew.naam, functie: newCrew.functie || null, email: newCrew.email || null,
      dagen: newCrew.dagen, catering_dagen: newCrew.catering_dagen, dieet: newCrew.dieet || null,
    }).select().single()
    if (error || !data) { flash('Crewlid toevoegen mislukt.'); return }
    setCrew([...crew, data])
    const naam = newCrew.naam.trim()
    const email = newCrew.email.trim()
    setNewCrew({ naam: '', functie: '', email: '', dagen: [], catering_dagen: [], dieet: '' })
    // Crewticket (alle dagen, gratis) automatisch uitgeven als er een geldig e-mailadres is
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      flash('Crewlid toegevoegd. Vul een e-mail in om automatisch een crewticket te sturen.')
      return
    }
    const auth = await gastAuthHeader()
    if (!auth) { flash('Crewlid toegevoegd. Crewticket niet verstuurd: log opnieuw in.'); return }
    try {
      const res = await fetch(GAST_ENDPOINT, {
        method: 'POST',
        headers: { Authorization: auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type_id: 'crew', qty: 1, guest_name: naam, guest_email: email }),
      })
      const j = await res.json().catch(() => ({}))
      if (res.ok && j.ok) { flash(`Crewlid toegevoegd. Crewticket verstuurd naar ${email}.`); return }
      if (j.error === 'quota_exceeded') { flash('Crewlid toegevoegd, maar je crew-ticketquotum is op. Neem contact op voor meer crewtickets.'); return }
      flash('Crewlid toegevoegd. Crewticket kon niet worden verstuurd.')
    } catch {
      flash('Crewlid toegevoegd. Crewticket kon niet worden verstuurd.')
    }
  }

  const deleteCrew = async (id: string) => { await supabase.from('crew').delete().eq('id', id); setCrew(crew.filter(c => c.id !== id)) }

  const ondertekenContract = async () => {
    if (!partner || !signNaam.trim() || !signData) { flash('Vul je naam in en zet je handtekening.'); return }
    const nu = new Date().toISOString()
    const patch = {
      contract_ondertekend: true, contract_ondertekend_datum: nu, contract_ondertekenaar: signNaam.trim(),
      contract_handtekening: signData, offerte_akkoord: true, offerte_akkoord_datum: nu, status: 'getekend',
    }
    const { error } = await supabase.from('partners').update(patch).eq('id', partner.id)
    if (error) { flash('Opslaan mislukt: ' + error.message); return }
    setPartner({ ...partner, ...patch })
    flash('Contract ondertekend. Bedankt!')
  }

  const saveCatering = async (avond: string) => {
    if (!partner) return
    const form = cateringForm[avond]
    const aantal = parseInt(form.aantal || '0')
    const existing = catering.find(c => c.avond === avond)
    if (existing) {
      await supabase.from('crewcatering').update({ aantal_personen: aantal, dieetwensen: form.dieet }).eq('id', existing.id)
      setCatering(catering.map(c => c.avond === avond ? { ...c, aantal_personen: aantal, dieetwensen: form.dieet } : c))
    } else {
      const { data } = await supabase.from('crewcatering').insert({ partner_id: partner.id, avond, aantal_personen: aantal, dieetwensen: form.dieet }).select().single()
      if (data) setCatering([...catering, data])
    }
    flash('Opgeslagen')
  }

  const bestelExtra = async (product: Product) => {
    if (!partner) return
    await supabase.from('extra_bestellingen').insert({ partner_id: partner.id, product: product.naam, omschrijving: product.omschrijving, aantal: 1, prijs_per_stuk: product.prijs })
    flash(`${product.naam} aangevraagd`)
  }

  const stuurVraag = async () => {
    if (!partner || !newVraag.onderwerp || !newVraag.bericht) return
    const { data } = await supabase.from('partner_vragen').insert({ partner_id: partner.id, ...newVraag }).select().single()
    if (data) { setVragen([data, ...vragen]); setNewVraag({ onderwerp: '', bericht: '' }); flash('Vraag verstuurd') }
  }

  const GAST_ENDPOINT = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/partner-tickets`

  const gastAuthHeader = async (): Promise<string | null> => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return null
    return 'Bearer ' + session.access_token
  }

  const laadGasttickets = async () => {
    const auth = await gastAuthHeader()
    if (!auth) { flash('Je sessie is verlopen. Log opnieuw in.'); return }
    try {
      const res = await fetch(GAST_ENDPOINT, { method: 'GET', headers: { Authorization: auth } })
      if (res.status === 401) { flash('Je sessie is verlopen. Log opnieuw in.'); return }
      if (!res.ok) { flash('Gasttickets konden niet worden geladen.'); return }
      const json = await res.json()
      setGastQuota(typeof json.quota === 'number' ? json.quota : 0)
      setGastUsed(typeof json.used === 'number' ? json.used : 0)
      setGastIssued(Array.isArray(json.issued) ? json.issued : [])
      setGastLoaded(true)
    } catch {
      flash('Gasttickets konden niet worden geladen.')
    }
  }

  const wijsGastticketToe = async () => {
    if (gastBusy) return
    const naam = gastForm.guest_name.trim()
    const email = gastForm.guest_email.trim()
    const qty = parseInt(gastForm.qty || '1', 10)
    if (!naam) { flash('Vul de naam van je gast in.'); return }
    if (!email) { flash('Vul het e-mailadres van je gast in.'); return }
    if (!qty || qty < 1) { flash('Vul een geldig aantal in.'); return }
    const auth = await gastAuthHeader()
    if (!auth) { flash('Je sessie is verlopen. Log opnieuw in.'); return }
    setGastBusy(true)
    try {
      const res = await fetch(GAST_ENDPOINT, {
        method: 'POST',
        headers: { Authorization: auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type_id: gastForm.type_id, qty, guest_name: naam, guest_email: email }),
      })
      if (res.status === 401) { flash('Je sessie is verlopen. Log opnieuw in.'); return }
      let json: { ok?: boolean; error?: string; used?: number; quota?: number } = {}
      try { json = await res.json() } catch { /* lege of niet-JSON respons */ }
      if (res.ok && json.ok) {
        if (typeof json.used === 'number') setGastUsed(json.used)
        if (typeof json.quota === 'number') setGastQuota(json.quota)
        flash(`Gastticket verstuurd naar ${email}`)
        setGastForm({ guest_name: '', guest_email: '', type_id: gastForm.type_id, qty: '1' })
        await laadGasttickets()
        return
      }
      if (json.error === 'quota_exceeded') { flash('Je hebt niet genoeg gasttickets meer over.'); return }
      if (json.error === 'sold_out') { flash('Die dag is uitverkocht.'); return }
      if (json.error === 'bad_email') { flash('Het e-mailadres is ongeldig.'); return }
      if (json.error === 'bad_name') { flash('De naam is ongeldig.'); return }
      if (json.error === 'bad_qty') { flash('Het aantal is ongeldig.'); return }
      if (json.error === 'no_type') { flash('Kies een geldige dag.'); return }
      flash('Het is niet gelukt om het gastticket te versturen.')
    } catch {
      flash('Het is niet gelukt om het gastticket te versturen.')
    } finally {
      setGastBusy(false)
    }
  }

  // Ticket codes als array
  const ticketCodes = (partner as any)?.ticket_codes
    ? String((partner as any).ticket_codes).split(',').map((c: string) => c.trim()).filter(Boolean)
    : []

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--sand)', fontSize: '13px', color: 'rgba(1,3,65,0.4)' }}>Laden...</div>
  if (!partner) return <div style={{ padding: '40px', background: 'var(--sand)', minHeight: '100vh', fontSize: '14px', color: 'var(--navy)' }}>Geen partneraccount gevonden. Mail naar info@nachtvandewijn.nl</div>

  const isFood = partner.type === 'food'
  const isPersoneel = partner.type === 'personeel'
  const isWijn = !isFood && !isPersoneel
  const NAV = [
    { id: 'home', label: 'Dashboard' },
    ...((isWijn || isFood) ? [{ id: 'omzet', label: 'Omzet' }] : []),
    { id: 'gegevens', label: 'Mijn gegevens' },
    { id: 'offerte', label: 'Offerte' },
    { id: 'tickets', label: 'Tickets & codes' },
    { id: 'gasttickets', label: 'Gasttickets' },
    ...(isWijn ? [{ id: 'wijnlijst', label: 'Wijnlijst' }] : []),
    ...(isFood ? [{ id: 'menukaart', label: 'Menukaart' }, { id: 'techniek', label: 'Techniek' }] : []),
    { id: 'crew', label: 'Crew' },
    ...((isWijn || isFood) ? [{ id: 'extras', label: 'Extra bestellen' }] : []),
    { id: 'documenten', label: 'Documenten' },
    { id: 'faq', label: 'Spelregels & FAQ' },
    { id: 'contact', label: 'Contact' },
  ]

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--sand)' }}>

      {/* Sidebar */}
      <aside style={{ width: '210px', flexShrink: 0, background: 'var(--cream)', borderRight: '1px solid rgba(1,3,65,0.08)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '24px 20px', borderBottom: '1px solid rgba(1,3,65,0.08)' }}>
          <div style={{ fontSize: '10px', fontWeight: '600', letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--bordeaux)', marginBottom: '6px' }}>NvdW 2026</div>
          <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--navy)' }}>{partner.bedrijfsnaam}</div>
          <div style={{ fontSize: '12px', color: 'rgba(1,3,65,0.4)', marginTop: '2px' }}>{PAKKET[partner.pakket] || partner.pakket}</div>
        </div>
        <nav style={{ flex: 1, padding: '8px 0' }}>
          {NAV.map(item => (
            <button key={item.id} onClick={() => setTab(item.id)} style={{
              display: 'block', width: '100%', padding: '9px 20px', textAlign: 'left',
              background: tab === item.id ? 'rgba(1,3,65,0.05)' : 'transparent',
              borderTop: 'none', borderRight: 'none', borderBottom: 'none',
              borderLeft: `2px solid ${tab === item.id ? 'var(--bordeaux)' : 'transparent'}`,
              color: tab === item.id ? 'var(--navy)' : 'rgba(1,3,65,0.4)',
              fontSize: '12px', fontWeight: tab === item.id ? '600' : '400',
              cursor: 'pointer',
            }}>
              {item.label}
            </button>
          ))}
        </nav>
        <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(1,3,65,0.08)', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-start' }}>
          <button onClick={() => router.push('/wachtwoord')} style={{ fontSize: '11px', color: 'rgba(1,3,65,0.5)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            Wachtwoord wijzigen
          </button>
          <button onClick={logout} style={{ fontSize: '11px', color: 'rgba(1,3,65,0.35)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            Uitloggen
          </button>
        </div>
      </aside>

      {/* Content */}
      <main style={{ flex: 1, padding: '48px 52px', maxWidth: '780px' }}>
        {msg && <div style={{ fontSize: '13px', color: '#2e7d32', background: '#f0faf0', padding: '10px 16px', marginBottom: '24px', border: '1px solid #c8e6c9' }}>{msg}</div>}

        {/* HOME */}
        {tab === 'home' && (() => {
          const acties = [
            { done: !!partner.offerte_akkoord, label: 'Offerte accorderen', sub: 'Ga naar Offerte', go: 'offerte' },
            ...(isFood
              ? [{ done: menu.length > 0, label: 'Menukaart & allergenen invullen', sub: `Deadline ${T('deadline_wijnlijst', '29 oktober 12:00')}`, go: 'menukaart' },
                 { done: partner.stroom_kw != null, label: 'Technische gegevens doorgeven', sub: 'Stroom, gas en water', go: 'techniek' }]
              : [{ done: wijnen.length > 0, label: 'Wijnlijst invullen', sub: `Deadline ${T('deadline_wijnlijst', '29 oktober 12:00')}`, go: 'wijnlijst' }]),
            { done: catering.length > 0, label: 'Crewcatering aanvragen', sub: `Deadline ${T('deadline_catering', '31 oktober')}`, go: 'catering' },
          ]
          const klaar = acties.filter(a => a.done).length
          const pct = Math.round((klaar / acties.length) * 100)
          return <>
            <div style={S.pageTitle}>Welkom terug</div>
            <div style={S.pageDesc}>{partner.bedrijfsnaam} · {partner.avond} · {PAKKET[partner.pakket]}</div>

            {/* Voortgang */}
            <div style={{ background: 'var(--card)', border: '1px solid rgba(1,3,65,0.08)', borderRadius: '14px', padding: '20px 22px', marginBottom: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '12px' }}>
                <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--navy)' }}>
                  {pct === 100 ? 'Alles is geregeld 🎉' : `Je bent er bijna — ${klaar} van ${acties.length} afgerond`}
                </span>
                <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--bordeaux)' }}>{pct}%</span>
              </div>
              <div style={{ height: '8px', background: 'rgba(1,3,65,0.08)', borderRadius: '99px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: 'var(--bordeaux)', borderRadius: '99px', transition: 'width .4s ease' }} />
              </div>
            </div>

            <div style={{ paddingTop: '24px' }}>
              <div style={S.sectionTitle}>Openstaande acties</div>
              {acties.map((item, i) => (
                <div key={i} onClick={() => !item.done && setTab(item.go)} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 0', borderBottom: '1px solid rgba(1,3,65,0.07)', cursor: item.done ? 'default' : 'pointer' }}>
                  <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: item.done ? 'var(--bordeaux)' : 'transparent', border: `1.5px solid ${item.done ? 'var(--bordeaux)' : 'rgba(1,3,65,0.2)'}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {item.done && <span style={{ color: 'white', fontSize: '10px', lineHeight: 1 }}>✓</span>}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '14px', fontWeight: item.done ? '400' : '500', color: item.done ? 'rgba(1,3,65,0.3)' : 'var(--navy)', textDecoration: item.done ? 'line-through' : 'none' }}>{item.label}</div>
                    {!item.done && <div style={{ fontSize: '12px', color: 'rgba(1,3,65,0.4)', marginTop: '1px' }}>{item.sub}</div>}
                  </div>
                  {!item.done && <span style={{ fontSize: '16px', color: 'rgba(1,3,65,0.25)' }}>›</span>}
                </div>
              ))}
            </div>

            {/* Recente activiteit (eigen) */}
            {log.length > 0 && (
              <div style={{ marginTop: '40px' }}>
                <div style={S.sectionTitle}>Recente activiteit</div>
                {log.slice(0, 8).map(e => {
                  const wat = LOG_TABEL_LABEL[e.tabel] || e.tabel
                  const actie = LOG_ACTIE_LABEL[e.actie] || e.actie.toLowerCase()
                  return (
                    <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(1,3,65,0.06)', fontSize: '13px' }}>
                      <span style={{ color: 'rgba(1,3,65,0.7)' }}>{wat.charAt(0).toUpperCase() + wat.slice(1)} {actie}{e.omschrijving ? `: ${e.omschrijving}` : ''}</span>
                      <span style={{ color: 'rgba(1,3,65,0.3)', fontSize: '11px', whiteSpace: 'nowrap', marginLeft: '12px' }}>{new Date(e.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        })()}

        {/* OMZET (live uit de kassa) */}
        {tab === 'omzet' && (() => {
          const eu = (c: number) => '€ ' + (c / 100).toFixed(2).replace('.', ',')
          const afdracht = partner.afdracht_percentage || 0
          const netto = omzet ? omzet.total_cents - omzet.refunded_cents : 0
          const afdrachtCents = Math.round(netto * afdracht / 100)
          const jouwDeel = netto - afdrachtCents
          return <>
            <div style={S.pageTitle}>Omzet</div>
            <div style={S.pageDesc}>
              Live vanaf de kassa{omzetTijd ? ` · bijgewerkt ${omzetTijd.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : ''} · ververst automatisch
            </div>

            {omzetStatus === 'laden' && <p style={{ fontSize: '13px', color: 'rgba(1,3,65,0.4)' }}>Omzet laden…</p>}
            {omzetStatus === 'niet_gekoppeld' && (
              <div style={{ background: 'var(--card)', border: '1px solid rgba(1,3,65,0.08)', borderRadius: '14px', padding: '20px 22px', fontSize: '14px', color: 'var(--navy)', lineHeight: 1.7 }}>
                Je account is nog niet gekoppeld aan het kassasysteem. De organisatie regelt dit vóór het festival. Zodra de koppeling er is, zie je hier live je verkopen.
              </div>
            )}
            {omzetStatus === 'fout' && (
              <div style={{ background: 'var(--cream)', border: '1px solid rgba(155,55,55,0.35)', padding: '20px 22px', fontSize: '14px', color: 'var(--bordeaux)' }}>
                De omzetcijfers konden niet worden geladen. Probeer het later opnieuw.
              </div>
            )}

            {omzet && omzetStatus === 'ok' && <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                {[
                  { label: 'Omzet (betaald)', val: eu(omzet.total_cents), sub: `${omzet.order_count} verkopen` },
                  { label: 'Laatste 15 minuten', val: eu(omzet.cents_last_15m), sub: `${omzet.orders_last_15m} verkopen` },
                  { label: 'Terugbetaald', val: eu(omzet.refunded_cents), sub: `${omzet.refund_count} refunds` },
                  { label: 'Actieve kassa’s', val: String(omzet.active_devices_15m), sub: 'afgelopen kwartier' },
                ].map(s => (
                  <div key={s.label} style={{ background: 'var(--card)', border: '1px solid rgba(1,3,65,0.08)', borderRadius: '14px', padding: '18px 20px' }}>
                    <div style={{ fontSize: '10px', fontWeight: '600', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(1,3,65,0.45)', marginBottom: '6px' }}>{s.label}</div>
                    <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--navy)', lineHeight: 1 }}>{s.val}</div>
                    <div style={{ fontSize: '12px', color: 'rgba(1,3,65,0.4)', marginTop: '5px' }}>{s.sub}</div>
                  </div>
                ))}
              </div>

              {/* Jouw deel volgens contract */}
              <div style={{ background: 'var(--navy)', color: 'var(--cream)', padding: '20px 22px', marginBottom: '28px' }}>
                <div style={{ fontSize: '10px', fontWeight: '600', letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: '8px' }}>Jouw deel (indicatie)</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ fontSize: '28px', fontWeight: '700' }}>{eu(jouwDeel)}</div>
                  <div style={{ fontSize: '12px', color: 'rgba(254,241,213,0.75)' }}>
                    netto {eu(netto)} − afdracht {afdracht}% ({eu(afdrachtCents)})
                  </div>
                </div>
                <div style={{ fontSize: '11px', color: 'rgba(254,241,213,0.55)', marginTop: '8px' }}>
                  Indicatie op basis van de kassaomzet en het afgesproken afdrachtpercentage. De definitieve afrekening volgt na het festival.
                </div>
              </div>

              {omzet.recent.length > 0 && <>
                <div style={S.sectionTitle}>Laatste verkopen</div>
                {omzet.recent.slice(0, 12).map((r, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(1,3,65,0.07)', fontSize: '13px' }}>
                    <span style={{ color: 'rgba(1,3,65,0.7)' }}>
                      {new Date(r.created_at).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
                      {' · '}{r.method === 'card_tap' ? 'pin' : r.method === 'ideal_qr' ? 'iDEAL' : r.method === 'cash' ? 'contant' : r.method || ''}
                      {r.status === 'refunded' && <span style={{ color: 'var(--bordeaux)', fontWeight: 600 }}> · terugbetaald</span>}
                    </span>
                    <span style={{ fontWeight: 600, color: r.status === 'refunded' ? 'var(--bordeaux)' : 'var(--navy)' }}>{eu(r.total_cents)}</span>
                  </div>
                ))}
              </>}
              {omzet.order_count === 0 && (
                <p style={{ fontSize: '13px', color: 'rgba(1,3,65,0.4)' }}>Nog geen verkopen. Zodra je kassa draait, zie je hier alles live binnenkomen.</p>
              )}
            </>}
          </>
        })()}

        {/* TICKETS */}
        {tab === 'tickets' && <>
          <div style={S.pageTitle}>Tickets & codes</div>
          <div style={S.pageDesc}>Gebruik deze codes in de NvdW ticketshop voor jouw gratis tickets.</div>

          <div style={{ borderTop: '1px solid rgba(1,3,65,0.1)', paddingTop: '28px', marginBottom: '40px' }}>
            <div style={S.sectionTitle}>Jouw ticketcodes ({ticketCodes.length} van {partner.gratis_tickets})</div>
            {ticketCodes.length === 0 ? (
              <p style={{ fontSize: '13px', color: 'rgba(1,3,65,0.4)', paddingTop: '8px' }}>
                Jouw codes zijn nog niet beschikbaar. NvdW stuurt een bericht zodra ze klaarstaan.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                {ticketCodes.map((code: string, i: number) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--card)', border: '1px solid rgba(1,3,65,0.08)', borderRadius: '14px' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: '15px', fontWeight: '600', color: 'var(--navy)', letterSpacing: '2px' }}>{code}</span>
                    <span style={{ fontSize: '11px', color: 'rgba(1,3,65,0.35)' }}>1 ticket</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ borderTop: '1px solid rgba(1,3,65,0.1)', paddingTop: '28px' }}>
            <div style={S.sectionTitle}>Kortingscode voor relaties</div>
            <p style={{ fontSize: '13px', color: 'rgba(1,3,65,0.55)', marginBottom: '16px' }}>
              Deel deze code voor {T('korting_percentage', '20')}% korting op alle tickets. Geschikt voor nieuwsbrieven en social media.
            </p>
            <div style={{ padding: '14px 18px', background: 'var(--card)', border: '1px solid rgba(1,3,65,0.08)', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'monospace', fontSize: '16px', fontWeight: '600', color: 'var(--navy)', letterSpacing: '2px' }}>{partner.kortingscode || T('korting_code_default', 'PARTNERKORTING')}</span>
              <span style={{ fontSize: '12px', color: 'var(--bordeaux)', fontWeight: '600' }}>{T('korting_percentage', '20')}% korting</span>
            </div>
          </div>
        </>}

        {/* GASTTICKETS */}
        {tab === 'gasttickets' && (() => {
          const heeftPakket = (partner.gratis_tickets || 0) > 0
          const quota = gastLoaded ? gastQuota : partner.gratis_tickets
          const used = gastUsed
          const over = Math.max(quota - used, 0)
          const pct = quota > 0 ? Math.min(Math.round((used / quota) * 100), 100) : 0
          const dagLabel = (typeId?: string) => GAST_DAGEN.find(d => d.id === typeId)?.label || ''
          return <>
            <div style={S.pageTitle}>Gasttickets</div>
            <div style={S.pageDesc}>Wijs gratis gasttickets toe aan je gasten binnen jouw quotum.</div>

            {!heeftPakket ? (
              <div style={{ background: 'var(--card)', border: '1px solid rgba(1,3,65,0.08)', borderRadius: '14px', padding: '20px 22px', fontSize: '14px', color: 'var(--navy)' }}>
                Je hebt geen gasttickets in je pakket.
              </div>
            ) : <>
              {/* Quotum-overzicht */}
              <div style={{ background: 'var(--card)', border: '1px solid rgba(1,3,65,0.08)', borderRadius: '14px', padding: '20px 22px', marginBottom: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '12px' }}>
                  <span style={{ fontSize: '16px', fontWeight: '600', color: 'var(--navy)' }}>
                    {used} van {quota} gasttickets gebruikt
                  </span>
                  <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--bordeaux)' }}>{over} over</span>
                </div>
                <div style={{ height: '8px', background: 'rgba(1,3,65,0.08)', borderRadius: '99px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: 'var(--bordeaux)', borderRadius: '99px', transition: 'width .4s ease' }} />
                </div>
              </div>

              <p style={{ fontSize: '13px', color: 'rgba(1,3,65,0.55)', lineHeight: '1.7', marginBottom: '8px', marginTop: '16px' }}>
                Je gast ontvangt het ticket per mail. Toegewezen tickets gaan van je quotum af.
              </p>

              {/* Formulier */}
              <div style={{ borderTop: '1px solid rgba(1,3,65,0.1)', paddingTop: '28px', marginTop: '20px' }}>
                <div style={S.sectionTitle}>Gastticket toewijzen</div>
                <div style={S.grid2}>
                  <div>
                    <label style={S.label}>Naam gast *</label>
                    <input style={S.input} value={gastForm.guest_name} onChange={e => setGastForm({ ...gastForm, guest_name: e.target.value })} placeholder="Voor- en achternaam" />
                  </div>
                  <div>
                    <label style={S.label}>E-mail gast *</label>
                    <input style={S.input} type="email" value={gastForm.guest_email} onChange={e => setGastForm({ ...gastForm, guest_email: e.target.value })} placeholder="naam@voorbeeld.nl" />
                  </div>
                  <div>
                    <label style={S.label}>Dag</label>
                    <select style={S.input} value={gastForm.type_id} onChange={e => setGastForm({ ...gastForm, type_id: e.target.value })}>
                      {GAST_DAGEN.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={S.label}>Aantal</label>
                    <input style={S.input} type="number" min="1" value={gastForm.qty} onChange={e => setGastForm({ ...gastForm, qty: e.target.value })} />
                  </div>
                </div>
                <button style={{ ...S.btn, opacity: gastBusy ? 0.55 : 1, cursor: gastBusy ? 'default' : 'pointer' }} disabled={gastBusy} onClick={wijsGastticketToe}>
                  {gastBusy ? 'Bezig met versturen...' : 'Ticket toewijzen'}
                </button>
              </div>

              {/* Toegewezen gasttickets */}
              <div style={{ borderTop: '1px solid rgba(1,3,65,0.1)', paddingTop: '28px', marginTop: '40px' }}>
                <div style={S.sectionTitle}>Toegewezen gasttickets</div>
                {!gastLoaded ? (
                  <p style={{ fontSize: '13px', color: 'rgba(1,3,65,0.4)', paddingTop: '4px' }}>Laden...</p>
                ) : gastIssued.length === 0 ? (
                  <p style={{ fontSize: '13px', color: 'rgba(1,3,65,0.4)', paddingTop: '4px' }}>Nog geen gasttickets toegewezen.</p>
                ) : (
                  gastIssued.map(g => {
                    const dagen = (g.order_items || [])
                      .map(it => `${it.ticket_types?.name_nl || dagLabel(it.ticket_type_id)}${it.quantity > 1 ? ` ×${it.quantity}` : ''}`)
                      .filter(Boolean).join(', ')
                    return (
                      <div key={g.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '14px 0', borderBottom: '1px solid rgba(1,3,65,0.07)' }}>
                        <div style={{ paddingRight: '14px' }}>
                          <div style={{ fontSize: '14px', fontWeight: '500', color: 'var(--navy)' }}>{g.buyer_name || 'Onbekende gast'}</div>
                          <div style={{ fontSize: '12px', color: 'rgba(1,3,65,0.4)', marginTop: '2px' }}>{g.buyer_email}</div>
                          {dagen && <div style={{ fontSize: '12px', color: 'var(--bordeaux)', marginTop: '2px' }}>{dagen}</div>}
                        </div>
                        <span style={{ fontSize: '11px', color: 'rgba(1,3,65,0.35)', whiteSpace: 'nowrap', marginLeft: '12px' }}>
                          {g.created_at ? new Date(g.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }) : ''}
                        </span>
                      </div>
                    )
                  })
                )}
              </div>
            </>}
          </>
        })()}

        {/* OFFERTE */}
        {tab === 'gegevens' && <>
          <div style={S.pageTitle}>Mijn gegevens</div>
          <div style={S.pageDesc}>Vul of werk je bedrijfs- en contactgegevens bij. Je bedrijfsnaam is ook zichtbaar voor bezoekers in de NvdW app.</div>
          <div style={{ borderTop: '1px solid rgba(1,3,65,0.1)', paddingTop: '28px', maxWidth: '440px' }}>
            <label style={S.label}>Bedrijfsnaam</label>
            <input style={S.input} defaultValue={partner.bedrijfsnaam || ''} onBlur={async e => {
              if (e.target.value !== partner.bedrijfsnaam) { await supabase.from('partners').update({ bedrijfsnaam: e.target.value }).eq('id', partner.id); setPartner({ ...partner, bedrijfsnaam: e.target.value }); flash('Opgeslagen') }
            }} />
            <label style={S.label}>Contactpersoon</label>
            <input style={S.input} defaultValue={partner.naam || ''} onBlur={async e => {
              if (e.target.value !== partner.naam) { await supabase.from('partners').update({ naam: e.target.value }).eq('id', partner.id); setPartner({ ...partner, naam: e.target.value }); flash('Opgeslagen') }
            }} />
            <label style={S.label}>E-mailadres (inlog)</label>
            <input style={{ ...S.input, opacity: 0.6 }} value={partner.email} disabled />
            <p style={{ fontSize: '12px', color: 'rgba(1,3,65,0.4)', marginTop: '8px' }}>Je e-mailadres is je inlognaam en kan niet hier gewijzigd worden. Neem contact op als dit moet veranderen.</p>
          </div>
        </>}

        {tab === 'offerte' && <>
          <div style={S.pageTitle}>Offerte</div>
          <div style={S.pageDesc}>Jouw partnerafspraken voor Nacht van de Wijn 2026.</div>
          <div style={{ borderTop: '1px solid rgba(1,3,65,0.1)', paddingTop: '28px' }}>
            {[
              ['Pakket', PAKKET[partner.pakket] || partner.pakket],
              ['Avond(en)', partner.avond],
              [isFood ? 'Standplaats' : 'Barlocatie', partner.barlocatie || 'Wordt gecommuniceerd'],
              ['Gratis tickets', `${partner.gratis_tickets} stuks`],
              ...(isFood && partner.standplaats_vergoeding != null ? [['Standplaatsvergoeding', `€${Number(partner.standplaats_vergoeding).toFixed(2)} excl. btw`]] : []),
              ['Afdracht', `${partner.afdracht_percentage}% van netto-omzet`],
            ].map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '13px 0', borderBottom: '1px solid rgba(1,3,65,0.07)' }}>
                <span style={{ fontSize: '13px', color: 'rgba(1,3,65,0.45)' }}>{l}</span>
                <span style={{ fontSize: '14px', fontWeight: '500', color: 'var(--navy)' }}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: '32px', padding: '20px', background: 'var(--card)', border: '1px solid rgba(1,3,65,0.08)', borderRadius: '14px' }}>
            <div style={{ fontSize: '12px', fontWeight: '600', color: 'rgba(1,3,65,0.5)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '1px' }}>Contract &amp; voorwaarden</div>
            <p style={{ fontSize: '13px', color: 'rgba(1,3,65,0.65)', lineHeight: '1.7', whiteSpace: 'pre-line' }}>
              {T('contract_tekst', T('offerte_voorwaarden', 'Voorwaarden voor deelname aan Nacht van de Wijn 2026.'))}
            </p>
          </div>
          <div style={{ marginTop: '24px' }}>
            {partner.contract_ondertekend ? (
              <div style={{ padding: '18px 20px', background: '#f0faf0', border: '1px solid #c8e6c9' }}>
                <div style={{ fontSize: '14px', color: '#2e7d32', fontWeight: '600', marginBottom: '4px' }}>✓ Ondertekend</div>
                <div style={{ fontSize: '13px', color: 'rgba(1,3,65,0.6)' }}>
                  Door {partner.contract_ondertekenaar} op {partner.contract_ondertekend_datum ? new Date(partner.contract_ondertekend_datum).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}
                </div>
                {partner.contract_handtekening && <img src={partner.contract_handtekening} alt="handtekening" style={{ marginTop: '12px', maxWidth: '260px', height: 'auto', background: '#fff', border: '1px solid rgba(1,3,65,0.12)' }} />}
              </div>
            ) : (
              <>
                <p style={{ fontSize: '13px', color: 'rgba(1,3,65,0.55)', marginBottom: '16px' }}>
                  Zet hieronder je handtekening en vul je naam in. Daarmee onderteken je het contract en ga je akkoord met de afspraken en voorwaarden.
                </p>
                <label style={S.label}>Volledige naam</label>
                <input style={S.input} value={signNaam} onChange={e => setSignNaam(e.target.value)} placeholder="Voor- en achternaam" />
                <label style={S.label}>Handtekening</label>
                <SignaturePad onChange={setSignData} />
                <button style={{ ...S.btn, opacity: (signNaam.trim() && signData) ? 1 : 0.5 }} disabled={!signNaam.trim() || !signData} onClick={ondertekenContract}>Onderteken contract</button>
              </>
            )}
          </div>
        </>}

        {/* WIJNLIJST */}
        {tab === 'wijnlijst' && <>
          <div style={S.pageTitle}>Wijnlijst</div>
          <div style={S.pageDesc}>Vul hier je volledige wijnassortiment in inclusief prijzen.</div>
          <div style={{ background: 'var(--card)', borderTop: '1px solid rgba(1,3,65,0.08)', borderRight: '1px solid rgba(1,3,65,0.08)', borderBottom: '1px solid rgba(1,3,65,0.08)', borderLeft: '3px solid var(--gold)', borderRadius: '14px', padding: '14px 18px', marginBottom: '16px', fontSize: '13px', color: 'var(--navy)', lineHeight: '1.7' }}>
            <div style={{ fontSize: '11px', fontWeight: '600', letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--bordeaux)', marginBottom: '6px' }}>Zichtbaar in de bezoekers-app én de kassa</div>
            Alles wat je hier invult (je wijnen, prijzen en omschrijving) tonen we aan bezoekers in de NvdW app, en je wijnen staan direct als knoppen in je kassa. Hoe vollediger en aantrekkelijker je het omschrijft, hoe vaker jouw wijn wordt gekozen.
          </div>
          <div style={{ background: 'var(--card)', border: '1px solid rgba(1,3,65,0.08)', borderRadius: '14px', padding: '16px 20px', marginBottom: '28px', fontSize: '13px', color: 'var(--navy)', lineHeight: '1.7' }}>
            <strong>Let op:</strong> De wijnen en prijzen die je hier invoert worden op <strong>{T('deadline_wijnlijst', '29 oktober 12:00')}</strong> geëxporteerd. Ze worden gedrukt op de signing en geladen in de kassa. Wijzigingen na die tijd zijn niet meer mogelijk.
          </div>
          <div style={{ borderTop: '1px solid rgba(1,3,65,0.1)', paddingTop: '28px' }}>
            {wijnen.length > 0 && <>
              <div style={S.sectionTitle}>{wijnen.length} {wijnen.length === 1 ? 'wijn' : 'wijnen'} ingevoerd</div>
              {wijnen.map(w => (
                <div key={w.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid rgba(1,3,65,0.07)' }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: '500', color: 'var(--navy)' }}>{w.naam}</div>
                    <div style={{ fontSize: '12px', color: 'rgba(1,3,65,0.4)', marginTop: '2px' }}>
                      {[w.producent, w.regio, w.land, w.druif, w.jaar].filter(Boolean).join(' · ')}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--bordeaux)', marginTop: '2px' }}>
                      {[w.prijs_half_glas && `½ €${w.prijs_half_glas}`, w.prijs_heel_glas && `glas €${w.prijs_heel_glas}`, w.prijs_fles && `fles €${w.prijs_fles}`].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <button onClick={() => deleteWijn(w.id)} style={S.btnOutline}>Verwijder</button>
                </div>
              ))}
            </>}
            <div style={{ marginTop: wijnen.length > 0 ? '36px' : '0' }}>
              <div style={S.sectionTitle}>Wijn toevoegen</div>
              <div style={S.grid2}>
                {[
                  { k: 'naam', l: 'Naam *', p: 'bijv. Rioja Reserva' },
                  { k: 'producent', l: 'Producent', p: '' },
                  { k: 'regio', l: 'Regio', p: '' },
                  { k: 'land', l: 'Land', p: '' },
                  { k: 'druif', l: 'Druif', p: '' },
                  { k: 'jaar', l: 'Jaar', p: '2021' },
                  { k: 'prijs_half_glas', l: '½ glas (€)', p: '0.00' },
                  { k: 'prijs_heel_glas', l: 'Heel glas (€)', p: '0.00' },
                  { k: 'prijs_fles', l: 'Fles (€)', p: '0.00' },
                ].map(({ k, l, p }) => (
                  <div key={k}>
                    <label style={S.label}>{l}</label>
                    <input style={S.input} value={(newWijn as any)[k]} onChange={e => setNewWijn({ ...newWijn, [k]: e.target.value })} placeholder={p} />
                  </div>
                ))}
              </div>
              <label style={S.label}>Omschrijving</label>
              <textarea style={{ ...S.input, height: '72px', resize: 'vertical' }} value={newWijn.beschrijving} onChange={e => setNewWijn({ ...newWijn, beschrijving: e.target.value })} />
              <button style={S.btn} onClick={addWijn}>Toevoegen</button>
            </div>
          </div>
        </>}

        {/* MENUKAART (food) */}
        {tab === 'menukaart' && <>
          <div style={S.pageTitle}>Menukaart</div>
          <div style={S.pageDesc}>Vul je gerechten met prijzen in en vink per gerecht de allergenen aan.</div>
          <div style={{ background: 'var(--card)', borderTop: '1px solid rgba(1,3,65,0.08)', borderRight: '1px solid rgba(1,3,65,0.08)', borderBottom: '1px solid rgba(1,3,65,0.08)', borderLeft: '3px solid var(--gold)', borderRadius: '14px', padding: '14px 18px', marginBottom: '16px', fontSize: '13px', color: 'var(--navy)', lineHeight: '1.7' }}>
            <div style={{ fontSize: '11px', fontWeight: '600', letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--bordeaux)', marginBottom: '6px' }}>Zichtbaar in de bezoekers-app én de kassa</div>
            Je gerechten, prijzen en allergenen tonen we aan bezoekers in de NvdW app, en je gerechten staan direct als knoppen in je kassa.
          </div>
          <div style={{ background: 'var(--card)', border: '1px solid rgba(1,3,65,0.08)', borderRadius: '14px', padding: '16px 20px', marginBottom: '28px', fontSize: '13px', color: 'var(--navy)', lineHeight: '1.7' }}>
            <strong>Let op:</strong> Allergenen invullen is wettelijk verplicht. De menukaart wordt op <strong>{T('deadline_wijnlijst', '29 oktober 12:00')}</strong> definitief gemaakt voor de signing en kassa.
          </div>
          <div style={{ borderTop: '1px solid rgba(1,3,65,0.1)', paddingTop: '28px' }}>
            {menu.length > 0 && <>
              <div style={S.sectionTitle}>{menu.length} {menu.length === 1 ? 'gerecht' : 'gerechten'} ingevoerd</div>
              {menu.map(m => (
                <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '14px 0', borderBottom: '1px solid rgba(1,3,65,0.07)' }}>
                  <div style={{ paddingRight: '14px' }}>
                    <div style={{ fontSize: '14px', fontWeight: '500', color: 'var(--navy)' }}>{m.naam}{m.prijs != null && <span style={{ color: 'var(--bordeaux)' }}> · €{Number(m.prijs).toFixed(2)}</span>}</div>
                    {m.omschrijving && <div style={{ fontSize: '12px', color: 'rgba(1,3,65,0.4)', marginTop: '2px' }}>{m.omschrijving}</div>}
                    <div style={{ fontSize: '11px', color: 'rgba(1,3,65,0.55)', marginTop: '4px' }}>
                      {m.allergenen.length > 0 ? `Allergenen: ${m.allergenen.join(', ')}` : 'Geen allergenen aangevinkt'}
                    </div>
                  </div>
                  <button onClick={() => deleteGerecht(m.id)} style={S.btnOutline}>Verwijder</button>
                </div>
              ))}
            </>}
            <div style={{ marginTop: menu.length > 0 ? '36px' : '0' }}>
              <div style={S.sectionTitle}>Gerecht toevoegen</div>
              <div style={S.grid2}>
                <div>
                  <label style={S.label}>Naam *</label>
                  <input style={S.input} value={newGerecht.naam} onChange={e => setNewGerecht({ ...newGerecht, naam: e.target.value })} placeholder="bijv. Pulled pork burger" />
                </div>
                <div>
                  <label style={S.label}>Prijs (€)</label>
                  <input style={S.input} value={newGerecht.prijs} onChange={e => setNewGerecht({ ...newGerecht, prijs: e.target.value })} placeholder="0.00" />
                </div>
              </div>
              <label style={S.label}>Omschrijving</label>
              <textarea style={{ ...S.input, height: '60px', resize: 'vertical' }} value={newGerecht.omschrijving} onChange={e => setNewGerecht({ ...newGerecht, omschrijving: e.target.value })} />
              <label style={S.label}>Allergenen (aanvinken wat van toepassing is)</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
                {ALLERGENEN.map(a => {
                  const on = newGerecht.allergenen.includes(a)
                  return (
                    <button key={a} type="button" onClick={() => toggleAllergeen(a)} style={{
                      padding: '7px 12px', fontSize: '12px', cursor: 'pointer', borderRadius: '2px',
                      border: `1px solid ${on ? 'var(--bordeaux)' : 'rgba(1,3,65,0.2)'}`,
                      background: on ? 'var(--bordeaux)' : 'transparent',
                      color: on ? 'var(--cream)' : 'rgba(1,3,65,0.55)', fontWeight: on ? '600' : '400',
                    }}>{a}</button>
                  )
                })}
              </div>
              <button style={S.btn} onClick={addGerecht}>Toevoegen</button>
            </div>
          </div>
        </>}

        {/* TECHNIEK (food) */}
        {tab === 'techniek' && <>
          <div style={S.pageTitle}>Techniek</div>
          <div style={S.pageDesc}>Laat ons weten wat je nodig hebt aan stroom, gas en water.</div>
          <div style={{ borderTop: '1px solid rgba(1,3,65,0.1)', paddingTop: '28px' }}>
            <div style={S.grid2}>
              <div>
                <label style={S.label}>Stroombehoefte (kW)</label>
                <input style={S.input} value={techForm.stroom_kw} onChange={e => setTechForm({ ...techForm, stroom_kw: e.target.value })} placeholder="bijv. 7.5" />
              </div>
              <div>
                <label style={S.label}>Aansluitingen</label>
                <input style={S.input} value={techForm.stroom_aansluitingen} onChange={e => setTechForm({ ...techForm, stroom_aansluitingen: e.target.value })} placeholder="bijv. 1x krachtstroom 16A + 1x 230V" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '28px', marginTop: '20px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: 'var(--navy)', cursor: 'pointer' }}>
                <input type="checkbox" checked={techForm.gas_nodig} onChange={e => setTechForm({ ...techForm, gas_nodig: e.target.checked })} /> Gas nodig
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: 'var(--navy)', cursor: 'pointer' }}>
                <input type="checkbox" checked={techForm.water_nodig} onChange={e => setTechForm({ ...techForm, water_nodig: e.target.checked })} /> Water/afvoer nodig
              </label>
            </div>
            <label style={S.label}>Opmerkingen</label>
            <textarea style={{ ...S.input, height: '90px', resize: 'vertical' }} value={techForm.techniek_opmerkingen} onChange={e => setTechForm({ ...techForm, techniek_opmerkingen: e.target.value })} placeholder="Afmetingen truck, bijzonderheden, etc." />
            <button style={S.btn} onClick={saveTechniek}>Opslaan</button>
          </div>
        </>}

        {/* CREW */}
        {tab === 'crew' && <>
          <div style={S.pageTitle}>Crew</div>
          <div style={S.pageDesc}>Meld hier je personeel aan. Met een e-mailadres ontvangt elk crewlid automatisch een gratis crewticket (alle dagen). Vul ook crewcatering en allergieën in.</div>
          <div style={{ borderTop: '1px solid rgba(1,3,65,0.1)', paddingTop: '28px' }}>
            {crew.length > 0 && <>
              <div style={S.sectionTitle}>{crew.length} {crew.length === 1 ? 'crewlid' : 'crewleden'}</div>
              {crew.map(c => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '14px 0', borderBottom: '1px solid rgba(1,3,65,0.07)' }}>
                  <div style={{ paddingRight: '14px' }}>
                    <div style={{ fontSize: '14px', fontWeight: '500', color: 'var(--navy)' }}>{c.naam}{c.functie && <span style={{ color: 'rgba(1,3,65,0.45)', fontWeight: 400 }}> · {c.functie}</span>}</div>
                    <div style={{ fontSize: '12px', color: 'rgba(1,3,65,0.4)', marginTop: '2px' }}>
                      {[c.email, c.dagen.length ? `dagen: ${c.dagen.join(', ')}` : null, c.catering_dagen.length ? `catering: ${c.catering_dagen.join(', ')}` : null].filter(Boolean).join(' · ')}
                    </div>
                    {c.dieet && <div style={{ fontSize: '12px', color: 'var(--bordeaux)', marginTop: '2px' }}>Dieet/allergie: {c.dieet}</div>}
                  </div>
                  <button onClick={() => deleteCrew(c.id)} style={S.btnOutline}>Verwijder</button>
                </div>
              ))}
            </>}
            <div style={{ marginTop: crew.length > 0 ? '36px' : '0' }}>
              <div style={S.sectionTitle}>Crewlid toevoegen</div>
              <div style={S.grid2}>
                <div><label style={S.label}>Naam *</label><input style={S.input} value={newCrew.naam} onChange={e => setNewCrew({ ...newCrew, naam: e.target.value })} /></div>
                <div><label style={S.label}>Functie</label><input style={S.input} value={newCrew.functie} onChange={e => setNewCrew({ ...newCrew, functie: e.target.value })} placeholder="bijv. bartender" /></div>
              </div>
              <label style={S.label}>E-mailadres (voor ticket &amp; briefing)</label>
              <input style={S.input} value={newCrew.email} onChange={e => setNewCrew({ ...newCrew, email: e.target.value })} placeholder="naam@bedrijf.nl" />
              <label style={S.label}>Werkdagen</label>
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                {['vrijdag', 'zaterdag', 'zondag'].map(d => {
                  const on = newCrew.dagen.includes(d)
                  return <button key={d} type="button" onClick={() => toggleArr('dagen', d)} style={{ padding: '8px 14px', fontSize: '13px', cursor: 'pointer', textTransform: 'capitalize', border: `1px solid ${on ? 'var(--bordeaux)' : 'rgba(1,3,65,0.2)'}`, background: on ? 'var(--bordeaux)' : 'transparent', color: on ? 'var(--cream)' : 'rgba(1,3,65,0.55)', fontWeight: on ? 600 : 400 }}>{d}</button>
                })}
              </div>
              <label style={S.label}>Crewcatering op (welke dagen eet deze persoon mee)</label>
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                {['vrijdag', 'zaterdag', 'zondag'].map(d => {
                  const on = newCrew.catering_dagen.includes(d)
                  return <button key={d} type="button" onClick={() => toggleArr('catering_dagen', d)} style={{ padding: '8px 14px', fontSize: '13px', cursor: 'pointer', textTransform: 'capitalize', border: `1px solid ${on ? 'var(--bordeaux)' : 'rgba(1,3,65,0.2)'}`, background: on ? 'var(--bordeaux)' : 'transparent', color: on ? 'var(--cream)' : 'rgba(1,3,65,0.55)', fontWeight: on ? 600 : 400 }}>{d}</button>
                })}
              </div>
              <label style={S.label}>Dieetwensen / allergieën</label>
              <input style={S.input} value={newCrew.dieet} onChange={e => setNewCrew({ ...newCrew, dieet: e.target.value })} placeholder="bijv. vegetarisch, notenallergie" />
              <button style={S.btn} onClick={addCrew}>Toevoegen</button>
            </div>
          </div>
        </>}

        {/* CATERING */}
        {tab === 'catering' && <>
          <div style={S.pageTitle}>Crew catering</div>
          <div style={S.pageDesc}>€{cateringPrijs.toFixed(2).replace('.', ',')} per persoon per avond. Deadline: {T('deadline_catering', '31 oktober')}.</div>
          <div style={{ borderTop: '1px solid rgba(1,3,65,0.1)', paddingTop: '28px', display: 'flex', flexDirection: 'column', gap: '28px' }}>
            {['vrijdag', 'zaterdag', 'zondag'].map(avond => {
              const form = cateringForm[avond] || { aantal: '0', dieet: '' }
              return (
                <div key={avond}>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--navy)', textTransform: 'capitalize', marginBottom: '14px' }}>{avond}</div>
                  <div style={S.grid2}>
                    <div>
                      <label style={S.label}>Aantal personen</label>
                      <input style={S.input} type="number" min="0" value={form.aantal} onChange={e => setCateringForm({ ...cateringForm, [avond]: { ...form, aantal: e.target.value } })} />
                    </div>
                    <div>
                      <label style={S.label}>Dieetwensen</label>
                      <input style={S.input} value={form.dieet} onChange={e => setCateringForm({ ...cateringForm, [avond]: { ...form, dieet: e.target.value } })} placeholder="bijv. vegetarisch" />
                    </div>
                  </div>
                  {parseInt(form.aantal || '0') > 0 && (
                    <div style={{ fontSize: '12px', color: 'rgba(1,3,65,0.4)', marginTop: '8px' }}>
                      Totaal: €{(parseInt(form.aantal) * cateringPrijs).toFixed(2)}
                    </div>
                  )}
                  <button style={{ ...S.btn, marginTop: '14px' }} onClick={() => saveCatering(avond)}>Opslaan</button>
                </div>
              )
            })}
          </div>
        </>}

        {/* EXTRAS */}
        {tab === 'extras' && <>
          <div style={S.pageTitle}>Extra bestellen</div>
          <div style={S.pageDesc}>Alles optioneel, naar wens bij te boeken. Prijzen exclusief btw.</div>
          <div style={{ borderTop: '1px solid rgba(1,3,65,0.1)', paddingTop: '28px', display: 'flex', flexDirection: 'column', gap: '1px' }}>
            {producten.map(p => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 0', borderBottom: '1px solid rgba(1,3,65,0.07)' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '500', color: 'var(--navy)' }}>{p.naam}</div>
                  {p.omschrijving && <div style={{ fontSize: '12px', color: 'rgba(1,3,65,0.45)', marginTop: '2px' }}>{p.omschrijving}</div>}
                  <div style={{ fontSize: '13px', color: 'var(--bordeaux)', fontWeight: '500', marginTop: '4px' }}>
                    {p.prijs === 0 ? 'Prijs op aanvraag' : `€${p.prijs.toFixed(2)} per ${p.eenheid} excl. btw`}
                  </div>
                </div>
                <button style={S.btnOutline} onClick={() => bestelExtra(p)}>Aanvragen</button>
              </div>
            ))}
          </div>
        </>}

        {/* DOCUMENTEN */}
        {tab === 'documenten' && <>
          <div style={S.pageTitle}>Documenten</div>
          <div style={S.pageDesc}>Downloads voor jouw deelname.</div>
          <div style={{ borderTop: '1px solid rgba(1,3,65,0.1)', paddingTop: '28px' }}>
            {documenten.length === 0 ? (
              <p style={{ fontSize: '13px', color: 'rgba(1,3,65,0.4)' }}>NvdW uploadt hier de documenten zodra ze beschikbaar zijn.</p>
            ) : (
              documenten.map(d => (
                <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid rgba(1,3,65,0.07)' }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: '500', color: 'var(--navy)' }}>{d.naam}</div>
                    <div style={{ fontSize: '12px', color: 'rgba(1,3,65,0.4)', marginTop: '2px', textTransform: 'capitalize' }}>{d.categorie}</div>
                  </div>
                  <button onClick={() => downloadDoc(d)} style={S.btnOutline}>Download</button>
                </div>
              ))
            )}
          </div>
        </>}

        {/* FAQ */}
        {tab === 'faq' && <>
          <div style={S.pageTitle}>Spelregels & FAQ</div>
          <div style={S.pageDesc}>Antwoorden op de meest gestelde vragen.</div>
          <div style={{ borderTop: '1px solid rgba(1,3,65,0.1)', paddingTop: '28px' }}>
            {['logistiek', 'systemen', 'huisregels', 'catering'].map(cat => {
              const items = faqItems.filter(f => f.categorie === cat)
              if (!items.length) return null
              return (
                <div key={cat} style={{ marginBottom: '32px' }}>
                  <div style={S.sectionTitle}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</div>
                  {items.map(item => (
                    <div key={item.id} style={{ padding: '14px 0', borderBottom: '1px solid rgba(1,3,65,0.07)' }}>
                      <div style={{ fontSize: '14px', fontWeight: '500', color: 'var(--navy)', marginBottom: '5px' }}>{item.vraag}</div>
                      <div style={{ fontSize: '13px', color: 'rgba(1,3,65,0.6)', lineHeight: '1.7' }}>{item.antwoord}</div>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </>}

        {/* CONTACT */}
        {tab === 'contact' && <>
          <div style={S.pageTitle}>Contact</div>
          <div style={S.pageDesc}>We reageren binnen 24 uur.</div>
          <div style={{ borderTop: '1px solid rgba(1,3,65,0.1)', paddingTop: '28px' }}>
            <label style={S.label}>Onderwerp</label>
            <input style={S.input} value={newVraag.onderwerp} onChange={e => setNewVraag({ ...newVraag, onderwerp: e.target.value })} />
            <label style={S.label}>Bericht</label>
            <textarea style={{ ...S.input, height: '120px', resize: 'vertical' }} value={newVraag.bericht} onChange={e => setNewVraag({ ...newVraag, bericht: e.target.value })} />
            <button style={S.btn} onClick={stuurVraag}>Versturen</button>
            {vragen.length > 0 && <>
              <div style={{ ...S.sectionTitle, marginTop: '40px' }}>Eerdere vragen</div>
              {vragen.map(v => (
                <div key={v.id} style={{ padding: '14px 0', borderBottom: '1px solid rgba(1,3,65,0.07)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '14px', fontWeight: '500', color: 'var(--navy)' }}>{v.onderwerp}</span>
                    <span style={{ fontSize: '10px', fontWeight: '600', color: v.status === 'open' ? 'var(--bordeaux)' : '#2d8a4e', textTransform: 'uppercase', letterSpacing: '1px' }}>{v.status}</span>
                  </div>
                  <div style={{ fontSize: '13px', color: 'rgba(1,3,65,0.5)' }}>{v.bericht}</div>
                  {v.antwoord && <div style={{ marginTop: '8px', padding: '10px 14px', background: 'var(--cream)', fontSize: '13px', color: 'var(--navy)', borderLeft: '2px solid var(--bordeaux)' }}>{v.antwoord}</div>}
                </div>
              ))}
            </>}
          </div>
        </>}
      </main>
    </div>
  )
}
