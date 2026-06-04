'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Partner, Wijn, Crewcatering, FAQ, PartnerVraag, Product } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

const NAV_ITEMS = [
  { id: 'home', label: 'Dashboard' },
  { id: 'offerte', label: 'Offerte' },
  { id: 'tickets', label: 'Tickets & codes' },
  { id: 'wijnlijst', label: 'Wijnlijst' },
  { id: 'catering', label: 'Crew catering' },
  { id: 'extras', label: 'Extra bestellen' },
  { id: 'documenten', label: 'Documenten' },
  { id: 'faq', label: 'Spelregels & FAQ' },
  { id: 'contact', label: 'Contact' },
]

const PAKKET_LABELS: Record<string, string> = {
  branded_bar: 'Branded Bar',
  own_bar: 'Own Bar',
  restaurant_host: 'Restaurant Host',
  entrance_host: 'Entrance Host',
  silent_disco: 'Silent Disco Host',
}

// Style tokens
const C = {
  navy: '#010341',
  midnight: '#33357e',
  bordeaux: '#9b3737',
  terracotta: '#ac595a',
  gold: '#feb72a',
  cream: '#fef1d5',
  sand: '#f0e4c0',
}

const T = {
  gobold: { fontFamily: 'GoboldBlocky, Inter, sans-serif', fontWeight: 900, textTransform: 'uppercase' as const, letterSpacing: 0 },
  inter: { fontFamily: 'Inter, sans-serif' },
  fraunces: { fontFamily: 'Fraunces, Georgia, serif' },
}

export default function Dashboard() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState('home')
  const [partner, setPartner] = useState<Partner | null>(null)
  const [loading, setLoading] = useState(true)
  const [wijnen, setWijnen] = useState<Wijn[]>([])
  const [catering, setCatering] = useState<Crewcatering[]>([])
  const [faqItems, setFaqItems] = useState<FAQ[]>([])
  const [vragen, setVragen] = useState<PartnerVraag[]>([])
  const [producten, setProducten] = useState<Product[]>([])
  const [saveMsg, setSaveMsg] = useState('')
  const [newWijn, setNewWijn] = useState({ naam: '', producent: '', regio: '', land: '', druif: '', jaar: '', prijs_half_glas: '', prijs_heel_glas: '', prijs_fles: '', beschrijving: '' })
  const [newVraag, setNewVraag] = useState({ onderwerp: '', bericht: '' })
  const [cateringForm, setCateringForm] = useState<Record<string, { aantal: string; dieet: string }>>({
    vrijdag: { aantal: '0', dieet: '' },
    zaterdag: { aantal: '0', dieet: '' },
    zondag: { aantal: '0', dieet: '' },
  })

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }
      const { data: partnerData } = await supabase.from('partners').select('*').eq('user_id', user.id).single()
      if (!partnerData) { setLoading(false); return }
      setPartner(partnerData)
      const [{ data: wijnData }, { data: cateringData }, { data: faqData }, { data: vraagData }, { data: productData }] = await Promise.all([
        supabase.from('wijnlijst').select('*').eq('partner_id', partnerData.id).order('volgorde'),
        supabase.from('crewcatering').select('*').eq('partner_id', partnerData.id),
        supabase.from('faq').select('*').eq('actief', true).order('volgorde'),
        supabase.from('partner_vragen').select('*').eq('partner_id', partnerData.id).order('created_at', { ascending: false }),
        supabase.from('producten_catalogus').select('*').eq('actief', true).order('volgorde'),
      ])
      setWijnen(wijnData || [])
      setCatering(cateringData || [])
      if (cateringData && cateringData.length > 0) {
        const formState: Record<string, { aantal: string; dieet: string }> = { vrijdag: { aantal: '0', dieet: '' }, zaterdag: { aantal: '0', dieet: '' }, zondag: { aantal: '0', dieet: '' } }
        cateringData.forEach((c: Crewcatering) => { formState[c.avond] = { aantal: c.aantal_personen.toString(), dieet: c.dieetwensen || '' } })
        setCateringForm(formState)
      }
      setFaqItems(faqData || [])
      setVragen(vraagData || [])
      setProducten(productData || [])
      setLoading(false)
    }
    init()
  }, [router])

  const flash = (msg: string) => { setSaveMsg(msg); setTimeout(() => setSaveMsg(''), 3000) }

  const handleLogout = async () => { await supabase.auth.signOut(); router.push('/') }

  const handleOffertAkkoord = async () => {
    if (!partner) return
    await supabase.from('partners').update({ offerte_akkoord: true, offerte_akkoord_datum: new Date().toISOString(), status: 'offerte_akkoord' }).eq('id', partner.id)
    setPartner({ ...partner, offerte_akkoord: true, status: 'offerte_akkoord' })
    flash('Offerte geaccordeerd!')
  }

  const handleAddWijn = async () => {
    if (!partner || !newWijn.naam) return
    const { data, error } = await supabase.from('wijnlijst').insert({
      partner_id: partner.id, naam: newWijn.naam, producent: newWijn.producent || null,
      regio: newWijn.regio || null, land: newWijn.land || null, druif: newWijn.druif || null,
      jaar: newWijn.jaar ? parseInt(newWijn.jaar) : null,
      prijs_half_glas: newWijn.prijs_half_glas ? parseFloat(newWijn.prijs_half_glas) : null,
      prijs_heel_glas: newWijn.prijs_heel_glas ? parseFloat(newWijn.prijs_heel_glas) : null,
      prijs_fles: newWijn.prijs_fles ? parseFloat(newWijn.prijs_fles) : null,
      beschrijving: newWijn.beschrijving || null, volgorde: wijnen.length
    }).select().single()
    if (!error && data) {
      setWijnen([...wijnen, data])
      setNewWijn({ naam: '', producent: '', regio: '', land: '', druif: '', jaar: '', prijs_half_glas: '', prijs_heel_glas: '', prijs_fles: '', beschrijving: '' })
      flash('Wijn toegevoegd!')
    }
  }

  const handleDeleteWijn = async (id: string) => {
    await supabase.from('wijnlijst').delete().eq('id', id)
    setWijnen(wijnen.filter(w => w.id !== id))
  }

  const handleCatering = async (avond: string, aantal: number, dieetwensen: string) => {
    if (!partner) return
    const existing = catering.find(c => c.avond === avond)
    if (existing) {
      await supabase.from('crewcatering').update({ aantal_personen: aantal, dieetwensen }).eq('id', existing.id)
      setCatering(catering.map(c => c.avond === avond ? { ...c, aantal_personen: aantal, dieetwensen } : c))
    } else {
      const { data } = await supabase.from('crewcatering').insert({ partner_id: partner.id, avond, aantal_personen: aantal, dieetwensen }).select().single()
      if (data) setCatering([...catering, data])
    }
    flash('Catering opgeslagen!')
  }

  const handleBestelExtra = async (product: Product) => {
    if (!partner) return
    await supabase.from('extra_bestellingen').insert({ partner_id: partner.id, product: product.naam, omschrijving: product.omschrijving, aantal: 1, prijs_per_stuk: product.prijs })
    flash(`${product.naam} aangevraagd!`)
  }

  const handleVraag = async () => {
    if (!partner || !newVraag.onderwerp || !newVraag.bericht) return
    const { data } = await supabase.from('partner_vragen').insert({ partner_id: partner.id, onderwerp: newVraag.onderwerp, bericht: newVraag.bericht }).select().single()
    if (data) { setVragen([data, ...vragen]); setNewVraag({ onderwerp: '', bericht: '' }); flash('Vraag verstuurd!') }
  }

  // Style helpers
  const sidebarNavItem = (active: boolean) => ({
    display: 'block', width: '100%', padding: '10px 24px', textAlign: 'left' as const,
    background: active ? 'rgba(155,55,55,0.12)' : 'transparent',
    borderLeft: active ? `3px solid ${C.bordeaux}` : '3px solid transparent',
    color: active ? C.bordeaux : 'rgba(1,3,65,0.45)',
    fontSize: '11px', fontWeight: '600', letterSpacing: '1.5px', textTransform: 'uppercase' as const,
    cursor: 'pointer', border: 'none', fontFamily: 'Inter, sans-serif', transition: 'all 0.15s',
    borderLeft2: active ? `3px solid ${C.bordeaux}` : '3px solid transparent',
  })

  const card = {
    background: C.cream,
    padding: '28px',
    marginBottom: '16px',
    borderTop: `2px solid ${C.bordeaux}`,
  }

  const cardTitle = {
    ...T.inter,
    fontSize: '10px', fontWeight: '700', letterSpacing: '2.5px',
    textTransform: 'uppercase' as const, color: C.bordeaux, marginBottom: '18px',
  }

  const label = {
    display: 'block', ...T.inter,
    fontSize: '10px', fontWeight: '700', letterSpacing: '1.5px',
    textTransform: 'uppercase' as const, color: 'rgba(1,3,65,0.5)', marginBottom: '6px', marginTop: '14px',
  }

  const input = {
    width: '100%', padding: '10px 12px',
    border: `1px solid rgba(1,3,65,0.15)`, background: C.sand,
    fontSize: '14px', fontFamily: 'Inter, sans-serif', outline: 'none', color: C.navy,
  }

  const btn = {
    padding: '11px 22px', background: C.navy, color: C.cream,
    border: 'none', fontSize: '10px', fontWeight: '700', letterSpacing: '2px',
    textTransform: 'uppercase' as const, cursor: 'pointer', fontFamily: 'Inter, sans-serif', marginTop: '16px',
  }

  const btnBordeaux = { ...btn, background: C.bordeaux }

  const pageTitle = { ...T.gobold, fontSize: '28px', color: C.navy, marginBottom: '4px' }
  const pageSubtitle = { ...T.fraunces, fontSize: '14px', color: 'rgba(1,3,65,0.55)', marginBottom: '28px', fontStyle: 'italic' as const }

  const grid2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: C.sand }}>
      <div style={{ ...T.gobold, fontSize: '18px', color: C.navy }}>Laden...</div>
    </div>
  )

  if (!partner) return (
    <div style={{ padding: '40px', background: C.sand, minHeight: '100vh', color: C.navy, fontFamily: 'Inter, sans-serif' }}>
      Geen partneraccount gevonden. Neem contact op met NvdW via info@nachtvandewijn.nl.
    </div>
  )

  const avonden = ['vrijdag', 'zaterdag', 'zondag']

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.sand }}>

      {/* Sidebar */}
      <div style={{ width: '230px', background: C.cream, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: `1px solid rgba(1,3,65,0.08)` }}>
        {/* Sidebar header */}
        <div style={{ padding: '28px 24px 20px', borderBottom: `1px solid rgba(1,3,65,0.08)` }}>
          <div style={{ ...T.inter, fontSize: '9px', fontWeight: '700', letterSpacing: '2.5px', textTransform: 'uppercase', color: C.bordeaux, marginBottom: '8px' }}>
            NvdW 2026
          </div>
          <div style={{ ...T.gobold, fontSize: '16px', color: C.navy, lineHeight: 1.1 }}>
            {partner.bedrijfsnaam}
          </div>
          <div style={{ ...T.inter, fontSize: '11px', color: 'rgba(1,3,65,0.4)', marginTop: '4px' }}>
            {PAKKET_LABELS[partner.pakket] || partner.pakket}
          </div>
          <div style={{
            display: 'inline-block', marginTop: '10px',
            background: partner.offerte_akkoord ? 'rgba(45,138,78,0.12)' : 'rgba(155,55,55,0.1)',
            color: partner.offerte_akkoord ? '#2d8a4e' : C.bordeaux,
            padding: '3px 10px', fontSize: '9px', fontWeight: '700', letterSpacing: '1px',
            textTransform: 'uppercase', fontFamily: 'Inter, sans-serif',
          }}>
            {partner.offerte_akkoord ? '✓ Akkoord' : 'Offerte open'}
          </div>
        </div>

        {/* Nav */}
        <nav style={{ padding: '12px 0', flex: 1 }}>
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              style={{
                display: 'block', width: '100%', padding: '9px 24px',
                textAlign: 'left', background: activeTab === item.id ? 'rgba(155,55,55,0.08)' : 'transparent',
                borderLeft: activeTab === item.id ? `3px solid ${C.bordeaux}` : '3px solid transparent',
                color: activeTab === item.id ? C.bordeaux : 'rgba(1,3,65,0.5)',
                fontSize: '11px', fontWeight: '600', letterSpacing: '1px', textTransform: 'uppercase',
                cursor: 'pointer', border: 'none', fontFamily: 'Inter, sans-serif',
                borderLeftWidth: '3px', borderLeftStyle: 'solid',
                borderLeftColor: activeTab === item.id ? C.bordeaux : 'transparent',
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Logout */}
        <div style={{ padding: '16px 24px', borderTop: `1px solid rgba(1,3,65,0.08)` }}>
          <button onClick={handleLogout} style={{
            ...T.inter, width: '100%', padding: '9px', background: 'transparent',
            border: `1px solid rgba(1,3,65,0.15)`, color: 'rgba(1,3,65,0.4)',
            fontSize: '10px', fontWeight: '600', letterSpacing: '1px', textTransform: 'uppercase', cursor: 'pointer',
          }}>
            Uitloggen
          </button>
        </div>
      </div>

      {/* Main */}
      <main style={{ flex: 1, padding: '40px 48px', maxWidth: '860px', overflowY: 'auto' }}>
        {saveMsg && (
          <div style={{ background: '#e8f5e9', border: `1px solid #4caf50`, color: '#2e7d32', padding: '10px 16px', marginBottom: '24px', fontSize: '13px', fontFamily: 'Inter, sans-serif', fontWeight: '600' }}>
            {saveMsg}
          </div>
        )}

        {/* HOME */}
        {activeTab === 'home' && (
          <>
            <div style={pageTitle}>Welkom, {partner.naam}</div>
            <div style={pageSubtitle}>6, 7 & 8 november 2026 — Werkspoorkathedraal Utrecht</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '20px' }}>
              {[
                { label: 'Pakket', value: PAKKET_LABELS[partner.pakket] || partner.pakket },
                { label: 'Avond(en)', value: partner.avond },
                { label: 'Gratis tickets', value: `${partner.gratis_tickets} stuks` },
                { label: 'Afdracht', value: `${partner.afdracht_percentage}%` },
                { label: 'Wijnlijst', value: `${wijnen.length} wijnen` },
                { label: 'Offerte', value: partner.offerte_akkoord ? '✓ Akkoord' : 'Open' },
              ].map((item, i) => (
                <div key={i} style={{ background: C.cream, padding: '18px 20px', borderTop: `2px solid ${i < 3 ? C.bordeaux : C.navy}` }}>
                  <div style={{ ...T.inter, fontSize: '9px', fontWeight: '700', letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(1,3,65,0.4)', marginBottom: '6px' }}>{item.label}</div>
                  <div style={{ ...T.gobold, fontSize: '16px', color: C.navy }}>{item.value}</div>
                </div>
              ))}
            </div>
            <div style={{ background: C.navy, padding: '24px 28px' }}>
              <div style={{ ...T.inter, fontSize: '9px', fontWeight: '700', letterSpacing: '2px', textTransform: 'uppercase', color: C.gold, marginBottom: '14px' }}>
                Nog te doen
              </div>
              {[
                { done: partner.offerte_akkoord, label: 'Offerte accorderen' },
                { done: wijnen.length > 0, label: 'Wijnlijst invullen (deadline: 29 oktober 12:00)' },
                { done: catering.length > 0, label: 'Crewcatering aanvragen (deadline: 31 oktober)' },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '7px 0', color: item.done ? 'rgba(255,255,255,0.3)' : C.cream, fontSize: '13px', fontFamily: 'Fraunces, serif', fontStyle: item.done ? 'normal' : 'italic', textDecoration: item.done ? 'line-through' : 'none' }}>
                  <span style={{ fontFamily: 'Inter', fontStyle: 'normal', fontSize: '11px' }}>{item.done ? '✓' : '○'}</span>
                  {item.label}
                </div>
              ))}
            </div>
          </>
        )}

        {/* TICKETS */}
        {activeTab === 'tickets' && (
          <>
            <div style={pageTitle}>Tickets & codes</div>
            <div style={pageSubtitle}>Jouw gratis tickets en kortingscode voor relaties.</div>
            <div style={card}>
              <div style={cardTitle}>Gratis toegangstickets</div>
              <p style={{ ...T.fraunces, fontSize: '14px', color: 'rgba(1,3,65,0.7)', marginBottom: '20px', lineHeight: '1.7' }}>
                Als partner ontvang je <strong>{partner.gratis_tickets} gratis toegangstickets</strong>. NvdW stuurt deze per e-mail zodra de ticketverkoop opent.
              </p>
              <div style={{ background: C.sand, padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ ...T.inter, fontSize: '9px', fontWeight: '700', letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(1,3,65,0.4)', marginBottom: '4px' }}>Jouw contingent</div>
                  <div style={{ ...T.gobold, fontSize: '32px', color: C.navy }}>{partner.gratis_tickets} tickets</div>
                </div>
                <div style={{ ...T.inter, fontSize: '11px', color: 'rgba(1,3,65,0.4)' }}>Worden per mail verstuurd</div>
              </div>
            </div>
            <div style={card}>
              <div style={cardTitle}>Kortingscode voor relaties</div>
              <p style={{ ...T.fraunces, fontSize: '14px', color: 'rgba(1,3,65,0.7)', marginBottom: '20px', lineHeight: '1.7' }}>
                Deel deze code met klanten en relaties voor <strong>20% korting</strong> op hun tickets.
              </p>
              <div style={{ background: C.navy, padding: '22px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ ...T.inter, fontSize: '9px', fontWeight: '700', letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: '8px' }}>Kortingscode</div>
                  <div style={{ ...T.gobold, fontSize: '26px', color: C.gold, letterSpacing: '4px' }}>PARTNERKORTING</div>
                </div>
                <div style={{ ...T.inter, fontSize: '12px', color: 'rgba(255,255,255,0.35)', textAlign: 'right' }}>20% korting<br />op alle tickets</div>
              </div>
            </div>
          </>
        )}

        {/* OFFERTE */}
        {activeTab === 'offerte' && (
          <>
            <div style={pageTitle}>Offerte</div>
            <div style={pageSubtitle}>Jouw partnerafspraken voor Nacht van de Wijn 2026.</div>
            <div style={card}>
              <div style={cardTitle}>Pakket details</div>
              <div style={grid2}>
                {[
                  ['Pakket', PAKKET_LABELS[partner.pakket] || partner.pakket],
                  ['Avond(en)', partner.avond],
                  ['Barlocatie', partner.barlocatie || 'Wordt gecommuniceerd'],
                  ['Gratis tickets', `${partner.gratis_tickets} stuks`],
                  ['Afdracht', `${partner.afdracht_percentage}% van netto-omzet`],
                ].map(([l, v]) => (
                  <div key={l} style={{ padding: '14px 0', borderBottom: `1px solid rgba(1,3,65,0.08)` }}>
                    <div style={{ ...T.inter, fontSize: '9px', fontWeight: '700', letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(1,3,65,0.4)', marginBottom: '4px' }}>{l}</div>
                    <div style={{ ...T.fraunces, fontSize: '16px', color: C.navy }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={card}>
              <div style={cardTitle}>Algemene voorwaarden</div>
              <p style={{ ...T.fraunces, fontSize: '14px', color: 'rgba(1,3,65,0.7)', lineHeight: '1.8' }}>
                Op deze deelname zijn de Algemene Voorwaarden van NVDW B.V. (KvK 89631935) van toepassing.
                Rollup- en spanbanners zijn niet toegestaan. Branding via koelkasten, kleding en kleine materialen is wel mogelijk.
                De afdracht wordt berekend over de netto-omzet via de door NvdW beschikbaar gestelde betaalsystemen.
              </p>
            </div>
            {!partner.offerte_akkoord ? (
              <div style={{ ...card, borderTop: `2px solid ${C.gold}` }}>
                <div style={cardTitle}>Akkoord geven</div>
                <p style={{ ...T.fraunces, fontSize: '14px', color: 'rgba(1,3,65,0.7)', marginBottom: '20px' }}>
                  Door akkoord te geven bevestig je dat je de afspraken en algemene voorwaarden hebt gelezen en accepteert.
                </p>
                <button style={btnBordeaux} onClick={handleOffertAkkoord}>Ja, ik ga akkoord</button>
              </div>
            ) : (
              <div style={{ background: '#e8f5e9', padding: '20px 24px', border: '1px solid #4caf50' }}>
                <div style={{ ...T.gobold, fontSize: '14px', color: '#2e7d32' }}>✓ Offerte geaccordeerd</div>
                <div style={{ ...T.fraunces, fontSize: '12px', color: '#555', marginTop: '4px', fontStyle: 'italic' }}>
                  {partner.offerte_akkoord_datum ? new Date(partner.offerte_akkoord_datum).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}
                </div>
              </div>
            )}
          </>
        )}

        {/* WIJNLIJST */}
        {activeTab === 'wijnlijst' && (
          <>
            <div style={pageTitle}>Wijnlijst</div>
            <div style={pageSubtitle}>Deadline: 29 oktober 12:00 — daarna worden de prijslijsten gedrukt.</div>
            <div style={card}>
              <div style={cardTitle}>Ingevoerde wijnen ({wijnen.length})</div>
              {wijnen.length === 0 && <p style={{ ...T.fraunces, fontSize: '14px', color: 'rgba(1,3,65,0.4)', fontStyle: 'italic' }}>Nog geen wijnen ingevoerd.</p>}
              {wijnen.map(wijn => (
                <div key={wijn.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '12px', alignItems: 'center', padding: '14px 0', borderBottom: `1px solid rgba(1,3,65,0.08)` }}>
                  <div>
                    <div style={{ ...T.gobold, fontSize: '14px', color: C.navy }}>{wijn.naam}</div>
                    <div style={{ ...T.inter, fontSize: '12px', color: 'rgba(1,3,65,0.5)', marginTop: '2px' }}>
                      {[wijn.producent, wijn.regio, wijn.land, wijn.druif, wijn.jaar].filter(Boolean).join(' · ')}
                    </div>
                    <div style={{ ...T.inter, fontSize: '12px', color: C.bordeaux, marginTop: '3px' }}>
                      {wijn.prijs_half_glas ? `½ glas €${wijn.prijs_half_glas}` : ''}{wijn.prijs_heel_glas ? ` · glas €${wijn.prijs_heel_glas}` : ''}{wijn.prijs_fles ? ` · fles €${wijn.prijs_fles}` : ''}
                    </div>
                  </div>
                  <button onClick={() => handleDeleteWijn(wijn.id)} style={{ padding: '6px 12px', background: 'transparent', color: C.bordeaux, border: `1px solid ${C.bordeaux}`, fontSize: '10px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
                    Verwijder
                  </button>
                </div>
              ))}
            </div>
            <div style={card}>
              <div style={cardTitle}>Wijn toevoegen</div>
              <div style={grid2}>
                {[
                  { key: 'naam', label: 'Naam wijn *', placeholder: 'bijv. Rioja Reserva 2019' },
                  { key: 'producent', label: 'Producent', placeholder: 'bijv. Marqués de Cáceres' },
                  { key: 'regio', label: 'Regio', placeholder: 'bijv. Rioja' },
                  { key: 'land', label: 'Land', placeholder: 'bijv. Spanje' },
                  { key: 'druif', label: 'Druif', placeholder: 'bijv. Tempranillo' },
                  { key: 'jaar', label: 'Jaar', placeholder: 'bijv. 2019' },
                  { key: 'prijs_half_glas', label: 'Prijs ½ glas (€)', placeholder: '0.00' },
                  { key: 'prijs_heel_glas', label: 'Prijs heel glas (€)', placeholder: '0.00' },
                  { key: 'prijs_fles', label: 'Prijs fles (€)', placeholder: '0.00' },
                ].map(({ key, label: lbl, placeholder }) => (
                  <div key={key}>
                    <label style={label}>{lbl}</label>
                    <input style={input} value={(newWijn as Record<string, string>)[key]} onChange={e => setNewWijn({ ...newWijn, [key]: e.target.value })} placeholder={placeholder} />
                  </div>
                ))}
              </div>
              <label style={label}>Omschrijving</label>
              <textarea style={{ ...input, height: '80px', resize: 'vertical' }} value={newWijn.beschrijving} onChange={e => setNewWijn({ ...newWijn, beschrijving: e.target.value })} placeholder="Korte omschrijving" />
              <button style={btn} onClick={handleAddWijn}>Wijn toevoegen</button>
            </div>
          </>
        )}

        {/* CREW CATERING */}
        {activeTab === 'catering' && (
          <>
            <div style={pageTitle}>Crew catering</div>
            <div style={pageSubtitle}>Diner voor je crew: €17,50 per persoon per avond. Deadline: 31 oktober.</div>
            {avonden.map(avond => {
              const form = cateringForm[avond] || { aantal: '0', dieet: '' }
              return (
                <div key={avond} style={card}>
                  <div style={cardTitle}>{avond.charAt(0).toUpperCase() + avond.slice(1)}</div>
                  <div style={grid2}>
                    <div>
                      <label style={label}>Aantal personen</label>
                      <input style={input} type="number" min="0" value={form.aantal} onChange={e => setCateringForm({ ...cateringForm, [avond]: { ...form, aantal: e.target.value } })} />
                    </div>
                    <div>
                      <label style={label}>Dieetwensen</label>
                      <input style={input} value={form.dieet} onChange={e => setCateringForm({ ...cateringForm, [avond]: { ...form, dieet: e.target.value } })} placeholder="bijv. vegetarisch" />
                    </div>
                  </div>
                  <div style={{ ...T.fraunces, fontSize: '14px', color: C.midnight, marginTop: '12px', fontStyle: 'italic' }}>
                    Totaal: €{(parseInt(form.aantal || '0') * 17.5).toFixed(2)}
                  </div>
                  <button style={btn} onClick={() => handleCatering(avond, parseInt(form.aantal || '0'), form.dieet)}>Opslaan</button>
                </div>
              )
            })}
          </>
        )}

        {/* EXTRA BESTELLEN */}
        {activeTab === 'extras' && (
          <>
            <div style={pageTitle}>Extra bestellen</div>
            <div style={pageSubtitle}>Extra's bovenop je standaard pakket.</div>
            {producten.map(product => (
              <div key={product.id} style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ ...T.gobold, fontSize: '16px', color: C.navy, marginBottom: '4px' }}>{product.naam}</div>
                  <div style={{ ...T.fraunces, fontSize: '13px', color: 'rgba(1,3,65,0.6)', fontStyle: 'italic', marginBottom: '6px' }}>{product.omschrijving}</div>
                  <div style={{ ...T.inter, fontSize: '14px', fontWeight: '700', color: C.bordeaux }}>
                    {product.prijs === 0 ? 'Prijs op aanvraag' : `€${product.prijs.toFixed(2)} per ${product.eenheid}`}
                  </div>
                </div>
                <button style={btnBordeaux} onClick={() => handleBestelExtra(product)}>Aanvragen</button>
              </div>
            ))}
          </>
        )}

        {/* DOCUMENTEN */}
        {activeTab === 'documenten' && (
          <>
            <div style={pageTitle}>Documenten</div>
            <div style={pageSubtitle}>Alle downloads voor jouw deelname.</div>
            <div style={card}>
              <div style={cardTitle}>Beschikbare documenten</div>
              <p style={{ ...T.fraunces, fontSize: '14px', color: 'rgba(1,3,65,0.4)', fontStyle: 'italic' }}>
                NvdW uploadt hier de documenten zodra ze beschikbaar zijn: plattegrond, perskit, briefing en algemene voorwaarden.
              </p>
            </div>
          </>
        )}

        {/* FAQ */}
        {activeTab === 'faq' && (
          <>
            <div style={pageTitle}>Spelregels & FAQ</div>
            <div style={pageSubtitle}>Antwoorden op de meest gestelde vragen.</div>
            {['logistiek', 'systemen', 'huisregels', 'catering'].map(cat => {
              const items = faqItems.filter(f => f.categorie === cat)
              if (!items.length) return null
              return (
                <div key={cat} style={card}>
                  <div style={cardTitle}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</div>
                  {items.map(item => (
                    <div key={item.id} style={{ padding: '16px 0', borderBottom: `1px solid rgba(1,3,65,0.08)` }}>
                      <div style={{ ...T.gobold, fontSize: '13px', color: C.navy, marginBottom: '6px' }}>{item.vraag}</div>
                      <div style={{ ...T.fraunces, fontSize: '14px', color: 'rgba(1,3,65,0.7)', lineHeight: '1.7' }}>{item.antwoord}</div>
                    </div>
                  ))}
                </div>
              )
            })}
          </>
        )}

        {/* CONTACT */}
        {activeTab === 'contact' && (
          <>
            <div style={pageTitle}>Contact</div>
            <div style={pageSubtitle}>Stel je vraag — we reageren binnen 24 uur.</div>
            <div style={card}>
              <div style={cardTitle}>Nieuwe vraag</div>
              <label style={label}>Onderwerp</label>
              <input style={input} value={newVraag.onderwerp} onChange={e => setNewVraag({ ...newVraag, onderwerp: e.target.value })} placeholder="bijv. Vraag over opbouwtijden" />
              <label style={label}>Bericht</label>
              <textarea style={{ ...input, height: '120px', resize: 'vertical' }} value={newVraag.bericht} onChange={e => setNewVraag({ ...newVraag, bericht: e.target.value })} placeholder="Wat wil je weten?" />
              <button style={btn} onClick={handleVraag}>Versturen</button>
            </div>
            {vragen.length > 0 && (
              <div style={card}>
                <div style={cardTitle}>Eerdere vragen</div>
                {vragen.map(v => (
                  <div key={v.id} style={{ padding: '16px 0', borderBottom: `1px solid rgba(1,3,65,0.08)` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <div style={{ ...T.gobold, fontSize: '13px', color: C.navy }}>{v.onderwerp}</div>
                      <span style={{ ...T.inter, fontSize: '9px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase', color: v.status === 'open' ? C.bordeaux : '#2d8a4e' }}>{v.status}</span>
                    </div>
                    <div style={{ ...T.fraunces, fontSize: '14px', color: 'rgba(1,3,65,0.6)', marginBottom: '8px', fontStyle: 'italic' }}>{v.bericht}</div>
                    {v.antwoord && (
                      <div style={{ background: '#f0f8f0', padding: '12px 16px', borderLeft: '3px solid #4caf50', fontSize: '13px', color: '#2e7d32', fontFamily: 'Fraunces, serif' }}>
                        {v.antwoord}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
