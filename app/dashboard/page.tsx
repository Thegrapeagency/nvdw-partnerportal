'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Partner, Wijn, Crewcatering, FAQ, PartnerVraag, Product } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

const NAV = [
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

const PAKKET: Record<string, string> = {
  branded_bar: 'Branded Bar', own_bar: 'Own Bar',
  restaurant_host: 'Restaurant Host', entrance_host: 'Entrance Host', silent_disco: 'Silent Disco Host',
}

// Shared styles
const S = {
  label: { fontSize: '11px', fontWeight: '600', letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(1,3,65,0.45)', display: 'block', marginBottom: '6px', marginTop: '18px' } as React.CSSProperties,
  input: { width: '100%', padding: '10px 12px', background: 'var(--cream)', border: '1px solid rgba(1,3,65,0.12)', color: 'var(--navy)', fontSize: '14px', outline: 'none' } as React.CSSProperties,
  btn: { padding: '10px 20px', background: 'var(--navy)', color: 'var(--cream)', border: 'none', fontSize: '11px', fontWeight: '600', letterSpacing: '1.5px', textTransform: 'uppercase', cursor: 'pointer', marginTop: '20px' } as React.CSSProperties,
  btnOutline: { padding: '7px 14px', background: 'transparent', color: 'var(--bordeaux)', border: '1px solid var(--bordeaux)', fontSize: '10px', fontWeight: '600', letterSpacing: '1px', textTransform: 'uppercase', cursor: 'pointer' } as React.CSSProperties,
  divider: { borderTop: '1px solid rgba(1,3,65,0.08)', margin: '0' },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' } as React.CSSProperties,
  pageTitle: { fontFamily: 'GoboldBlocky, sans-serif', fontSize: '26px', textTransform: 'uppercase', letterSpacing: '0', color: 'var(--navy)', lineHeight: 1, marginBottom: '6px' } as React.CSSProperties,
  pageDesc: { fontSize: '13px', color: 'rgba(1,3,65,0.45)', marginBottom: '32px' } as React.CSSProperties,
  sectionTitle: { fontSize: '11px', fontWeight: '600', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(1,3,65,0.4)', marginBottom: '16px' } as React.CSSProperties,
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
  const [msg, setMsg] = useState('')
  const [newWijn, setNewWijn] = useState({ naam: '', producent: '', regio: '', land: '', druif: '', jaar: '', prijs_half_glas: '', prijs_heel_glas: '', prijs_fles: '', beschrijving: '' })
  const [newVraag, setNewVraag] = useState({ onderwerp: '', bericht: '' })
  const [cateringForm, setCateringForm] = useState<Record<string, { aantal: string; dieet: string }>>({
    vrijdag: { aantal: '0', dieet: '' }, zaterdag: { aantal: '0', dieet: '' }, zondag: { aantal: '0', dieet: '' },
  })

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }
      const { data: p } = await supabase.from('partners').select('*').eq('user_id', user.id).single()
      if (!p) { setLoading(false); return }
      setPartner(p)
      const [{ data: w }, { data: c }, { data: f }, { data: v }, { data: pr }] = await Promise.all([
        supabase.from('wijnlijst').select('*').eq('partner_id', p.id).order('volgorde'),
        supabase.from('crewcatering').select('*').eq('partner_id', p.id),
        supabase.from('faq').select('*').eq('actief', true).order('volgorde'),
        supabase.from('partner_vragen').select('*').eq('partner_id', p.id).order('created_at', { ascending: false }),
        supabase.from('producten_catalogus').select('*').eq('actief', true).order('volgorde'),
      ])
      setWijnen(w || []); setCatering(c || []); setFaqItems(f || []); setVragen(v || []); setProducten(pr || [])
      if (c && c.length > 0) {
        const fs: Record<string, { aantal: string; dieet: string }> = { vrijdag: { aantal: '0', dieet: '' }, zaterdag: { aantal: '0', dieet: '' }, zondag: { aantal: '0', dieet: '' } }
        c.forEach((x: Crewcatering) => { fs[x.avond] = { aantal: x.aantal_personen.toString(), dieet: x.dieetwensen || '' } })
        setCateringForm(fs)
      }
      setLoading(false)
    }
    init()
  }, [router])

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3000) }
  const logout = async () => { await supabase.auth.signOut(); router.push('/') }

  const addWijn = async () => {
    if (!partner || !newWijn.naam) return
    const { data, error } = await supabase.from('wijnlijst').insert({
      partner_id: partner.id, naam: newWijn.naam, producent: newWijn.producent || null,
      regio: newWijn.regio || null, land: newWijn.land || null, druif: newWijn.druif || null,
      jaar: newWijn.jaar ? parseInt(newWijn.jaar) : null,
      prijs_half_glas: newWijn.prijs_half_glas ? parseFloat(newWijn.prijs_half_glas) : null,
      prijs_heel_glas: newWijn.prijs_heel_glas ? parseFloat(newWijn.prijs_heel_glas) : null,
      prijs_fles: newWijn.prijs_fles ? parseFloat(newWijn.prijs_fles) : null,
      beschrijving: newWijn.beschrijving || null, volgorde: wijnen.length,
    }).select().single()
    if (!error && data) { setWijnen([...wijnen, data]); setNewWijn({ naam: '', producent: '', regio: '', land: '', druif: '', jaar: '', prijs_half_glas: '', prijs_heel_glas: '', prijs_fles: '', beschrijving: '' }); flash('Wijn toegevoegd') }
  }

  const deleteWijn = async (id: string) => { await supabase.from('wijnlijst').delete().eq('id', id); setWijnen(wijnen.filter(w => w.id !== id)) }

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

  // Ticket codes als array
  const ticketCodes = (partner as any)?.ticket_codes
    ? String((partner as any).ticket_codes).split(',').map((c: string) => c.trim()).filter(Boolean)
    : []

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--sand)', fontSize: '13px', color: 'rgba(1,3,65,0.4)' }}>Laden...</div>
  if (!partner) return <div style={{ padding: '40px', background: 'var(--sand)', minHeight: '100vh', fontSize: '14px', color: 'var(--navy)' }}>Geen partneraccount gevonden. Mail naar info@nachtvandewijn.nl</div>

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
              borderLeft: `2px solid ${tab === item.id ? 'var(--bordeaux)' : 'transparent'}`,
              color: tab === item.id ? 'var(--navy)' : 'rgba(1,3,65,0.4)',
              fontSize: '12px', fontWeight: tab === item.id ? '600' : '400',
              cursor: 'pointer', border: 'none',
            }}>
              {item.label}
            </button>
          ))}
        </nav>
        <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(1,3,65,0.08)' }}>
          <button onClick={logout} style={{ fontSize: '11px', color: 'rgba(1,3,65,0.35)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            Uitloggen
          </button>
        </div>
      </aside>

      {/* Content */}
      <main style={{ flex: 1, padding: '48px 52px', maxWidth: '780px' }}>
        {msg && <div style={{ fontSize: '13px', color: '#2e7d32', background: '#f0faf0', padding: '10px 16px', marginBottom: '24px', border: '1px solid #c8e6c9' }}>{msg}</div>}

        {/* HOME */}
        {tab === 'home' && <>
          <div style={S.pageTitle}>Welkom terug</div>
          <div style={S.pageDesc}>{partner.bedrijfsnaam} · {partner.avond} · {PAKKET[partner.pakket]}</div>
          <div style={{ borderTop: '1px solid rgba(1,3,65,0.1)', paddingTop: '28px' }}>
            <div style={S.sectionTitle}>Openstaande acties</div>
            {[
              { done: partner.offerte_akkoord, label: 'Offerte accorderen', sub: 'Ga naar Offerte' },
              { done: wijnen.length > 0, label: 'Wijnlijst invullen', sub: 'Deadline 29 oktober 12:00' },
              { done: catering.length > 0, label: 'Crewcatering aanvragen', sub: 'Deadline 31 oktober' },
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 0', borderBottom: '1px solid rgba(1,3,65,0.07)' }}>
                <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: item.done ? 'var(--bordeaux)' : 'transparent', border: `1.5px solid ${item.done ? 'var(--bordeaux)' : 'rgba(1,3,65,0.2)'}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {item.done && <span style={{ color: 'white', fontSize: '10px', lineHeight: 1 }}>✓</span>}
                </div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: item.done ? '400' : '500', color: item.done ? 'rgba(1,3,65,0.3)' : 'var(--navy)', textDecoration: item.done ? 'line-through' : 'none' }}>{item.label}</div>
                  {!item.done && <div style={{ fontSize: '12px', color: 'rgba(1,3,65,0.4)', marginTop: '1px' }}>{item.sub}</div>}
                </div>
              </div>
            ))}
          </div>
        </>}

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
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--cream)', border: '1px solid rgba(1,3,65,0.1)' }}>
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
              Deel deze code voor 20% korting op alle tickets. Geschikt voor nieuwsbrieven en social media.
            </p>
            <div style={{ padding: '14px 18px', background: 'var(--cream)', border: '1px solid rgba(1,3,65,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'monospace', fontSize: '16px', fontWeight: '600', color: 'var(--navy)', letterSpacing: '2px' }}>PARTNERKORTING</span>
              <span style={{ fontSize: '12px', color: 'var(--bordeaux)', fontWeight: '600' }}>20% korting</span>
            </div>
          </div>
        </>}

        {/* OFFERTE */}
        {tab === 'offerte' && <>
          <div style={S.pageTitle}>Offerte</div>
          <div style={S.pageDesc}>Jouw partnerafspraken voor Nacht van de Wijn 2026.</div>
          <div style={{ borderTop: '1px solid rgba(1,3,65,0.1)', paddingTop: '28px' }}>
            {[
              ['Pakket', PAKKET[partner.pakket] || partner.pakket],
              ['Avond(en)', partner.avond],
              ['Barlocatie', partner.barlocatie || 'Wordt gecommuniceerd'],
              ['Gratis tickets', `${partner.gratis_tickets} stuks`],
              ['Afdracht', `${partner.afdracht_percentage}% van netto-omzet`],
            ].map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '13px 0', borderBottom: '1px solid rgba(1,3,65,0.07)' }}>
                <span style={{ fontSize: '13px', color: 'rgba(1,3,65,0.45)' }}>{l}</span>
                <span style={{ fontSize: '14px', fontWeight: '500', color: 'var(--navy)' }}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: '32px', padding: '20px', background: 'var(--cream)', border: '1px solid rgba(1,3,65,0.1)' }}>
            <div style={{ fontSize: '12px', fontWeight: '600', color: 'rgba(1,3,65,0.5)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '1px' }}>Voorwaarden</div>
            <p style={{ fontSize: '13px', color: 'rgba(1,3,65,0.65)', lineHeight: '1.7' }}>
              NVDW B.V. (KvK 89631935). Rollup- en spanbanners niet toegestaan. Branding via koelkasten, kleding en kleine materialen wel mogelijk. Afdracht over netto-omzet via NvdW betaalsystemen.
            </p>
          </div>
          <div style={{ marginTop: '24px' }}>
            {partner.offerte_akkoord ? (
              <div style={{ fontSize: '13px', color: '#2e7d32', fontWeight: '500' }}>
                ✓ Geaccordeerd op {partner.offerte_akkoord_datum ? new Date(partner.offerte_akkoord_datum).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}
              </div>
            ) : (
              <>
                <p style={{ fontSize: '13px', color: 'rgba(1,3,65,0.55)', marginBottom: '16px' }}>
                  Door akkoord te geven bevestig je dat je de afspraken en voorwaarden hebt gelezen en accepteert.
                </p>
                <button style={S.btn} onClick={async () => {
                  await supabase.from('partners').update({ offerte_akkoord: true, offerte_akkoord_datum: new Date().toISOString(), status: 'offerte_akkoord' }).eq('id', partner.id)
                  setPartner({ ...partner, offerte_akkoord: true, status: 'offerte_akkoord' })
                  flash('Offerte geaccordeerd')
                }}>Akkoord geven</button>
              </>
            )}
          </div>
        </>}

        {/* WIJNLIJST */}
        {tab === 'wijnlijst' && <>
          <div style={S.pageTitle}>Wijnlijst</div>
          <div style={S.pageDesc}>Deadline: 29 oktober 12:00 — daarna worden de prijslijsten gedrukt.</div>
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

        {/* CATERING */}
        {tab === 'catering' && <>
          <div style={S.pageTitle}>Crew catering</div>
          <div style={S.pageDesc}>€17,50 per persoon per avond. Deadline: 31 oktober.</div>
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
                      Totaal: €{(parseInt(form.aantal) * 17.5).toFixed(2)}
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
          <div style={S.pageDesc}>Extra's bovenop je standaard pakket.</div>
          <div style={{ borderTop: '1px solid rgba(1,3,65,0.1)', paddingTop: '28px', display: 'flex', flexDirection: 'column', gap: '1px' }}>
            {producten.map(p => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 0', borderBottom: '1px solid rgba(1,3,65,0.07)' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '500', color: 'var(--navy)' }}>{p.naam}</div>
                  {p.omschrijving && <div style={{ fontSize: '12px', color: 'rgba(1,3,65,0.45)', marginTop: '2px' }}>{p.omschrijving}</div>}
                  <div style={{ fontSize: '13px', color: 'var(--bordeaux)', fontWeight: '500', marginTop: '4px' }}>
                    {p.prijs === 0 ? 'Prijs op aanvraag' : `€${p.prijs.toFixed(2)} per ${p.eenheid}`}
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
          <p style={{ fontSize: '13px', color: 'rgba(1,3,65,0.4)', borderTop: '1px solid rgba(1,3,65,0.1)', paddingTop: '28px' }}>
            NvdW uploadt hier de documenten zodra ze beschikbaar zijn.
          </p>
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
