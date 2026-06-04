'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Partner, Wijn, Crewcatering, FAQ, PartnerVraag, Product } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

const NAV_ITEMS = [
  { id: 'home', label: 'Dashboard' },
  { id: 'offerte', label: 'Offerte' },
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

  // Wijn form state
  const [newWijn, setNewWijn] = useState({ naam: '', producent: '', regio: '', land: '', druif: '', jaar: '', prijs_half_glas: '', prijs_heel_glas: '', prijs_fles: '', beschrijving: '' })

  // Vraag form state
  const [newVraag, setNewVraag] = useState({ onderwerp: '', bericht: '' })

  // Catering state per avond
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
      // Initialiseer catering form vanuit bestaande data
      if (cateringData && cateringData.length > 0) {
        const formState: Record<string, { aantal: string; dieet: string }> = {
          vrijdag: { aantal: '0', dieet: '' },
          zaterdag: { aantal: '0', dieet: '' },
          zondag: { aantal: '0', dieet: '' },
        }
        cateringData.forEach((c: Crewcatering) => {
          formState[c.avond] = { aantal: c.aantal_personen.toString(), dieet: c.dieetwensen || '' }
        })
        setCateringForm(formState)
      }
      setFaqItems(faqData || [])
      setVragen(vraagData || [])
      setProducten(productData || [])
      setLoading(false)
    }
    init()
  }, [router])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const handleOffertAkkoord = async () => {
    if (!partner) return
    const { error } = await supabase.from('partners').update({
      offerte_akkoord: true,
      offerte_akkoord_datum: new Date().toISOString(),
      status: 'offerte_akkoord'
    }).eq('id', partner.id)
    if (!error) {
      setPartner({ ...partner, offerte_akkoord: true, status: 'offerte_akkoord' })
      setSaveMsg('Offerte geaccordeerd!')
      setTimeout(() => setSaveMsg(''), 3000)
    }
  }

  const handleAddWijn = async () => {
    if (!partner || !newWijn.naam) return
    const { data, error } = await supabase.from('wijnlijst').insert({
      partner_id: partner.id,
      naam: newWijn.naam,
      producent: newWijn.producent || null,
      regio: newWijn.regio || null,
      land: newWijn.land || null,
      druif: newWijn.druif || null,
      jaar: newWijn.jaar ? parseInt(newWijn.jaar) : null,
      prijs_half_glas: newWijn.prijs_half_glas ? parseFloat(newWijn.prijs_half_glas) : null,
      prijs_heel_glas: newWijn.prijs_heel_glas ? parseFloat(newWijn.prijs_heel_glas) : null,
      prijs_fles: newWijn.prijs_fles ? parseFloat(newWijn.prijs_fles) : null,
      beschrijving: newWijn.beschrijving || null,
      volgorde: wijnen.length
    }).select().single()
    if (!error && data) {
      setWijnen([...wijnen, data])
      setNewWijn({ naam: '', producent: '', regio: '', land: '', druif: '', jaar: '', prijs_half_glas: '', prijs_heel_glas: '', prijs_fles: '', beschrijving: '' })
      setSaveMsg('Wijn toegevoegd!')
      setTimeout(() => setSaveMsg(''), 3000)
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
      const { error } = await supabase.from('crewcatering').update({ aantal_personen: aantal, dieetwensen }).eq('id', existing.id)
      if (!error) setCatering(catering.map(c => c.avond === avond ? { ...c, aantal_personen: aantal, dieetwensen } : c))
    } else {
      const { data, error } = await supabase.from('crewcatering').insert({ partner_id: partner.id, avond, aantal_personen: aantal, dieetwensen }).select().single()
      if (!error && data) setCatering([...catering, data])
    }
    setSaveMsg('Catering opgeslagen!')
    setTimeout(() => setSaveMsg(''), 3000)
  }

  const handleBestelExtra = async (product: Product) => {
    if (!partner) return
    await supabase.from('extra_bestellingen').insert({
      partner_id: partner.id,
      product: product.naam,
      omschrijving: product.omschrijving,
      aantal: 1,
      prijs_per_stuk: product.prijs
    })
    setSaveMsg(`${product.naam} aangevraagd!`)
    setTimeout(() => setSaveMsg(''), 3000)
  }

  const handleVraag = async () => {
    if (!partner || !newVraag.onderwerp || !newVraag.bericht) return
    const { data, error } = await supabase.from('partner_vragen').insert({
      partner_id: partner.id,
      onderwerp: newVraag.onderwerp,
      bericht: newVraag.bericht
    }).select().single()
    if (!error && data) {
      setVragen([data, ...vragen])
      setNewVraag({ onderwerp: '', bericht: '' })
      setSaveMsg('Vraag verstuurd!')
      setTimeout(() => setSaveMsg(''), 3000)
    }
  }

  const S = {
    page: { display: 'flex', minHeight: '100vh', background: 'var(--cream)' },
    sidebar: { width: '220px', background: 'var(--navy)', flexShrink: 0, display: 'flex', flexDirection: 'column' as const },
    sidebarTop: { padding: '28px 20px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)' },
    logo: { fontSize: '10px', fontWeight: '700', letterSpacing: '2px', textTransform: 'uppercase' as const, color: 'var(--gold)', marginBottom: '4px' },
    partnerName: { fontSize: '14px', fontWeight: '700', color: 'var(--cream)', textTransform: 'uppercase' as const, letterSpacing: '1px' },
    pakket: { fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: '4px' },
    nav: { padding: '16px 0', flex: 1 },
    navItem: (active: boolean) => ({
      display: 'block', width: '100%', padding: '10px 20px', textAlign: 'left' as const,
      background: active ? 'rgba(254,183,42,0.12)' : 'transparent',
      borderLeft: active ? '3px solid var(--gold)' : '3px solid transparent',
      color: active ? 'var(--gold)' : 'rgba(255,255,255,0.55)',
      fontSize: '12px', fontWeight: '600', letterSpacing: '1px', textTransform: 'uppercase' as const,
      cursor: 'pointer', border: 'none', fontFamily: 'Raleway, sans-serif', transition: 'all 0.15s'
    }),
    logoutBtn: { margin: '16px', padding: '10px', background: 'rgba(155,55,55,0.2)', border: '1px solid rgba(155,55,55,0.3)', color: 'rgba(255,255,255,0.5)', fontSize: '11px', fontWeight: '600', letterSpacing: '1px', textTransform: 'uppercase' as const, cursor: 'pointer', fontFamily: 'Raleway, sans-serif', borderRadius: '2px' },
    main: { flex: 1, padding: '36px 40px', maxWidth: '820px' },
    pageTitle: { fontSize: '22px', fontWeight: '800', textTransform: 'uppercase' as const, letterSpacing: '1px', color: 'var(--navy)', marginBottom: '6px' },
    pageSubtitle: { fontSize: '13px', color: '#666', marginBottom: '32px' },
    card: { background: 'white', padding: '24px', marginBottom: '20px', borderRadius: '2px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
    cardTitle: { fontSize: '12px', fontWeight: '700', letterSpacing: '2px', textTransform: 'uppercase' as const, color: 'var(--bordeaux)', marginBottom: '16px' },
    label: { display: 'block', fontSize: '11px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase' as const, color: '#666', marginBottom: '6px', marginTop: '14px' },
    input: { width: '100%', padding: '10px 12px', border: '1px solid #ddd', fontSize: '13px', fontFamily: 'Raleway, sans-serif', outline: 'none', borderRadius: '2px', color: 'var(--navy)' },
    btn: { padding: '10px 20px', background: 'var(--navy)', color: 'var(--cream)', border: 'none', fontSize: '11px', fontWeight: '700', letterSpacing: '2px', textTransform: 'uppercase' as const, cursor: 'pointer', fontFamily: 'Raleway, sans-serif', borderRadius: '2px', marginTop: '16px' },
    btnGold: { padding: '12px 24px', background: 'var(--gold)', color: 'var(--navy)', border: 'none', fontSize: '12px', fontWeight: '800', letterSpacing: '2px', textTransform: 'uppercase' as const, cursor: 'pointer', fontFamily: 'Raleway, sans-serif', borderRadius: '2px' },
    btnDanger: { padding: '6px 12px', background: 'transparent', color: 'var(--bordeaux)', border: '1px solid var(--bordeaux)', fontSize: '10px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase' as const, cursor: 'pointer', fontFamily: 'Raleway, sans-serif', borderRadius: '2px' },
    successMsg: { background: '#e8f5e9', border: '1px solid #4caf50', color: '#2e7d32', padding: '10px 16px', borderRadius: '2px', fontSize: '13px', marginBottom: '20px', fontWeight: '600' },
    statusBadge: (status: string) => ({
      display: 'inline-block', padding: '3px 10px', fontSize: '10px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase' as const, borderRadius: '2px',
      background: status === 'offerte_akkoord' || status === 'volledig' ? '#e8f5e9' : status === 'actief' ? '#fff3e0' : '#f5f5f5',
      color: status === 'offerte_akkoord' || status === 'volledig' ? '#2e7d32' : status === 'actief' ? '#e65100' : '#666'
    }),
    grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' },
    wijnRow: { display: 'grid', gridTemplateColumns: '1fr auto', gap: '12px', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #f0f0f0' },
    faqItem: { padding: '16px 0', borderBottom: '1px solid #f0f0f0' },
  }

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--navy)', fontWeight: '600' }}>Laden...</div>
  if (!partner) return <div style={{ padding: '40px', color: 'var(--navy)' }}>Geen partneraccout gevonden. Neem contact op met Milan.</div>

  const avonden = ['vrijdag', 'zaterdag', 'zondag']

  return (
    <div style={S.page}>
      {/* Sidebar */}
      <div style={S.sidebar}>
        <div style={S.sidebarTop}>
          <div style={S.logo}>NvdW 2026</div>
          <div style={S.partnerName}>{partner.bedrijfsnaam}</div>
          <div style={S.pakket}>{PAKKET_LABELS[partner.pakket] || partner.pakket}</div>
          <div style={{ marginTop: '10px' }}>
            <span style={S.statusBadge(partner.status)}>{partner.status.replace('_', ' ')}</span>
          </div>
        </div>
        <nav style={S.nav}>
          {NAV_ITEMS.map(item => (
            <button key={item.id} style={S.navItem(activeTab === item.id)} onClick={() => setActiveTab(item.id)}>
              {item.label}
            </button>
          ))}
        </nav>
        <button style={S.logoutBtn} onClick={handleLogout}>Uitloggen</button>
      </div>

      {/* Main content */}
      <main style={S.main}>
        {saveMsg && <div style={S.successMsg}>{saveMsg}</div>}

        {/* DASHBOARD HOME */}
        {activeTab === 'home' && (
          <>
            <div style={S.pageTitle}>Welkom, {partner.naam}</div>
            <div style={S.pageSubtitle}>Nacht van de Wijn — 7, 8 & 9 november 2026 — Werkspoorkathedraal Utrecht</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
              {[
                { label: 'Pakket', value: PAKKET_LABELS[partner.pakket] || partner.pakket },
                { label: 'Avond(en)', value: partner.avond },
                { label: 'Gratis tickets', value: `${partner.gratis_tickets} stuks` },
                { label: 'Afdracht', value: `${partner.afdracht_percentage}%` },
                { label: 'Wijnlijst', value: `${wijnen.length} wijnen ingevoerd` },
                { label: 'Offerte', value: partner.offerte_akkoord ? '✓ Geaccordeerd' : 'Nog te accorderen' },
              ].map((item, i) => (
                <div key={i} style={{ background: 'white', padding: '18px', borderRadius: '2px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                  <div style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '2px', textTransform: 'uppercase', color: '#999', marginBottom: '4px' }}>{item.label}</div>
                  <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--navy)' }}>{item.value}</div>
                </div>
              ))}
            </div>
            <div style={{ background: 'var(--navy)', padding: '20px 24px', borderRadius: '2px' }}>
              <div style={{ fontSize: '12px', fontWeight: '700', letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: '8px' }}>To-do voor de deadline</div>
              {[
                { done: partner.offerte_akkoord, label: 'Offerte accorderen' },
                { done: wijnen.length > 0, label: 'Wijnlijst invullen' },
                { done: catering.length > 0, label: 'Crewcatering aanvragen (uiterlijk 31 oktober)' },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0', color: item.done ? 'rgba(255,255,255,0.4)' : 'var(--cream)', fontSize: '13px', textDecoration: item.done ? 'line-through' : 'none' }}>
                  <span>{item.done ? '✓' : '○'}</span> {item.label}
                </div>
              ))}
            </div>
          </>
        )}

        {/* OFFERTE */}
        {activeTab === 'offerte' && (
          <>
            <div style={S.pageTitle}>Offerte</div>
            <div style={S.pageSubtitle}>Bekijk je partnerafspraken en geef akkoord.</div>
            <div style={S.card}>
              <div style={S.cardTitle}>Jouw pakket</div>
              <div style={S.grid2}>
                {[
                  ['Pakket', PAKKET_LABELS[partner.pakket] || partner.pakket],
                  ['Avond(en)', partner.avond],
                  ['Barlocatie', partner.barlocatie || 'Wordt gecommuniceerd'],
                  ['Gratis tickets', `${partner.gratis_tickets} stuks`],
                  ['Afdracht', `${partner.afdracht_percentage}% van netto-omzet`],
                ].map(([label, value]) => (
                  <div key={label}>
                    <div style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase', color: '#999' }}>{label}</div>
                    <div style={{ fontSize: '15px', fontWeight: '600', color: 'var(--navy)', marginTop: '2px' }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={S.card}>
              <div style={S.cardTitle}>Algemene voorwaarden</div>
              <p style={{ fontSize: '13px', color: '#555', lineHeight: '1.7' }}>
                Op deze deelname zijn de Algemene Voorwaarden van Nacht van de Wijn (NVDW B.V., KvK 89631935) van toepassing.
                Rollup- en spanbanners zijn niet toegestaan. Branding via koelkasten, kleding en kleine materialen is wel mogelijk.
                De afdracht wordt berekend over de netto-omzet via de door NvdW beschikbaar gestelde betaalsystemen.
                Extra pins zijn bij te huren tegen meerprijs. Twijfel over merkuitingen? Neem contact op.
              </p>
            </div>
            {!partner.offerte_akkoord ? (
              <div style={{ ...S.card, border: '2px solid var(--gold)' }}>
                <div style={S.cardTitle}>Akkoord geven</div>
                <p style={{ fontSize: '13px', color: '#555', marginBottom: '20px' }}>
                  Door akkoord te geven bevestig je dat je bovenstaande afspraken en de algemene voorwaarden hebt gelezen en accepteert.
                </p>
                <button style={S.btnGold} onClick={handleOffertAkkoord}>
                  Ja, ik ga akkoord
                </button>
              </div>
            ) : (
              <div style={{ background: '#e8f5e9', padding: '20px', borderRadius: '2px', border: '1px solid #4caf50' }}>
                <div style={{ fontWeight: '700', color: '#2e7d32', fontSize: '14px' }}>✓ Offerte geaccordeerd</div>
                <div style={{ fontSize: '12px', color: '#555', marginTop: '4px' }}>
                  {partner.offerte_akkoord_datum ? new Date(partner.offerte_akkoord_datum).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}
                </div>
              </div>
            )}
          </>
        )}

        {/* WIJNLIJST */}
        {activeTab === 'wijnlijst' && (
          <>
            <div style={S.pageTitle}>Wijnlijst</div>
            <div style={S.pageSubtitle}>Voer je wijnen en prijzen in. Deadline: 29 oktober 12:00 — daarna worden de prijslijsten gedrukt.</div>
            <div style={S.card}>
              <div style={S.cardTitle}>Jouw wijnen ({wijnen.length})</div>
              {wijnen.length === 0 && <p style={{ fontSize: '13px', color: '#999' }}>Nog geen wijnen ingevoerd.</p>}
              {wijnen.map(wijn => (
                <div key={wijn.id} style={S.wijnRow}>
                  <div>
                    <div style={{ fontWeight: '700', fontSize: '14px', color: 'var(--navy)' }}>{wijn.naam}</div>
                    <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
                      {[wijn.producent, wijn.regio, wijn.land, wijn.druif, wijn.jaar].filter(Boolean).join(' · ')}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--bordeaux)', marginTop: '2px' }}>
                      {wijn.prijs_half_glas ? `½ glas €${wijn.prijs_half_glas}` : ''}{wijn.prijs_heel_glas ? ` · glas €${wijn.prijs_heel_glas}` : ''}{wijn.prijs_fles ? ` · fles €${wijn.prijs_fles}` : ''}
                    </div>
                  </div>
                  <button style={S.btnDanger} onClick={() => handleDeleteWijn(wijn.id)}>Verwijder</button>
                </div>
              ))}
            </div>
            <div style={S.card}>
              <div style={S.cardTitle}>Wijn toevoegen</div>
              <div style={S.grid2}>
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
                ].map(({ key, label, placeholder }) => (
                  <div key={key}>
                    <label style={S.label}>{label}</label>
                    <input
                      style={S.input}
                      value={(newWijn as Record<string, string>)[key]}
                      onChange={e => setNewWijn({ ...newWijn, [key]: e.target.value })}
                      placeholder={placeholder}
                    />
                  </div>
                ))}
              </div>
              <div>
                <label style={S.label}>Omschrijving (optioneel)</label>
                <textarea
                  style={{ ...S.input, height: '80px', resize: 'vertical' }}
                  value={newWijn.beschrijving}
                  onChange={e => setNewWijn({ ...newWijn, beschrijving: e.target.value })}
                  placeholder="Korte beschrijving van de wijn"
                />
              </div>
              <button style={S.btn} onClick={handleAddWijn}>Wijn toevoegen</button>
            </div>
          </>
        )}

        {/* CREW CATERING */}
        {activeTab === 'catering' && (
          <>
            <div style={S.pageTitle}>Crew Catering</div>
            <div style={S.pageSubtitle}>Diner voor je crew: €17,50 per persoon per avond. Uiterste aanvraagdatum: 31 oktober.</div>
            {avonden.map(avond => {
              const form = cateringForm[avond] || { aantal: '0', dieet: '' }
              return (
                <div key={avond} style={S.card}>
                  <div style={S.cardTitle}>{avond.charAt(0).toUpperCase() + avond.slice(1)}</div>
                  <div style={S.grid2}>
                    <div>
                      <label style={S.label}>Aantal personen</label>
                      <input
                        style={S.input}
                        type="number"
                        min="0"
                        value={form.aantal}
                        onChange={e => setCateringForm({ ...cateringForm, [avond]: { ...form, aantal: e.target.value } })}
                      />
                    </div>
                    <div>
                      <label style={S.label}>Dieetwensen</label>
                      <input
                        style={S.input}
                        value={form.dieet}
                        onChange={e => setCateringForm({ ...cateringForm, [avond]: { ...form, dieet: e.target.value } })}
                        placeholder="bijv. vegetarisch, lactosevrij"
                      />
                    </div>
                  </div>
                  <div style={{ marginTop: '12px', fontSize: '13px', color: '#666' }}>
                    Totaal: €{(parseInt(form.aantal || '0') * 17.5).toFixed(2)}
                  </div>
                  <button style={S.btn} onClick={() => handleCatering(avond, parseInt(form.aantal || '0'), form.dieet)}>Opslaan</button>
                </div>
              )
            })}
          </>
        )}

        {/* EXTRA BESTELLEN */}
        {activeTab === 'extras' && (
          <>
            <div style={S.pageTitle}>Extra bestellen</div>
            <div style={S.pageSubtitle}>Extra's bovenop je standaard pakket.</div>
            {producten.map(product => (
              <div key={product.id} style={{ ...S.card, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: '700', fontSize: '15px', color: 'var(--navy)' }}>{product.naam}</div>
                  <div style={{ fontSize: '13px', color: '#666', marginTop: '4px' }}>{product.omschrijving}</div>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--bordeaux)', marginTop: '6px' }}>
                    {product.prijs === 0 ? 'In overleg' : `€${product.prijs.toFixed(2)} per ${product.eenheid}`}
                  </div>
                </div>
                <button style={S.btnGold} onClick={() => handleBestelExtra(product)}>Aanvragen</button>
              </div>
            ))}
          </>
        )}

        {/* DOCUMENTEN */}
        {activeTab === 'documenten' && (
          <>
            <div style={S.pageTitle}>Documenten</div>
            <div style={S.pageSubtitle}>Alle downloads voor jouw deelname.</div>
            <div style={S.card}>
              <div style={S.cardTitle}>Beschikbare documenten</div>
              <p style={{ fontSize: '13px', color: '#999' }}>Milan uploadt hier de documenten zodra ze beschikbaar zijn: plattegrond, perskit, briefing, AV en meer.</p>
            </div>
          </>
        )}

        {/* FAQ */}
        {activeTab === 'faq' && (
          <>
            <div style={S.pageTitle}>Spelregels & FAQ</div>
            <div style={S.pageSubtitle}>Antwoorden op de meest gestelde vragen.</div>
            {['logistiek', 'systemen', 'huisregels', 'catering'].map(cat => {
              const items = faqItems.filter(f => f.categorie === cat)
              if (!items.length) return null
              return (
                <div key={cat} style={S.card}>
                  <div style={S.cardTitle}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</div>
                  {items.map(item => (
                    <div key={item.id} style={S.faqItem}>
                      <div style={{ fontWeight: '700', fontSize: '14px', color: 'var(--navy)', marginBottom: '6px' }}>{item.vraag}</div>
                      <div style={{ fontSize: '13px', color: '#555', lineHeight: '1.7' }}>{item.antwoord}</div>
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
            <div style={S.pageTitle}>Contact</div>
            <div style={S.pageSubtitle}>Stel je vraag — we reageren binnen 24 uur.</div>
            <div style={S.card}>
              <div style={S.cardTitle}>Nieuwe vraag</div>
              <label style={S.label}>Onderwerp</label>
              <input style={S.input} value={newVraag.onderwerp} onChange={e => setNewVraag({ ...newVraag, onderwerp: e.target.value })} placeholder="bijv. Vraag over opbouwtijden" />
              <label style={S.label}>Bericht</label>
              <textarea style={{ ...S.input, height: '120px', resize: 'vertical' }} value={newVraag.bericht} onChange={e => setNewVraag({ ...newVraag, bericht: e.target.value })} placeholder="Wat wil je weten?" />
              <button style={S.btn} onClick={handleVraag}>Versturen</button>
            </div>
            {vragen.length > 0 && (
              <div style={S.card}>
                <div style={S.cardTitle}>Eerdere vragen</div>
                {vragen.map(v => (
                  <div key={v.id} style={S.faqItem}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontWeight: '700', fontSize: '14px', color: 'var(--navy)' }}>{v.onderwerp}</div>
                      <span style={{ ...S.statusBadge(v.status), fontSize: '10px' }}>{v.status}</span>
                    </div>
                    <div style={{ fontSize: '13px', color: '#555', margin: '6px 0' }}>{v.bericht}</div>
                    {v.antwoord && (
                      <div style={{ background: '#f0f8f0', padding: '10px 14px', borderRadius: '2px', fontSize: '13px', color: '#2e7d32', borderLeft: '3px solid #4caf50' }}>
                        <strong>Antwoord:</strong> {v.antwoord}
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
