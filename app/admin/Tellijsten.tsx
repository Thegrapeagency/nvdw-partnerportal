'use client'
// Tellijsten: de eigen bars (Delta en Wijnbeurs) en de voorraad tellen op een
// telefoon of tablet, in plaats van op papier. Eén telling = één bar (of de
// voorraad) op één datum, met per product een aantal. Het verbruik rekenen we
// bewust niet uit; de tellingen zijn te exporteren naar CSV.
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { AS } from './ui'

type Soort = 'bar' | 'voorraad'
type Telling = {
  id: string
  soort: Soort
  bar: string | null
  geteld_op: string
  geteld_door: string | null
  aantallen: Record<string, number>
  opmerking: string | null
  created_at: string
}

export const WATER = ['Sea Water plat', 'Sea Water bruis']

// Zelfde producten en volgorde als de papieren tellijst (de eigen bars: Delta, Kaiken en Wijnbeurs).
export const BARS: { id: string; naam: string; producten: string[] }[] = [
  { id: 'santa-tresa', naam: 'Delta – Santa Tresa', producten: ['Grillo Spumante', 'Rina Ianca', 'Cerasuolo', 'Insieme Bianco', 'Insieme Orange', 'Siccari Rosso', 'Frappato', 'Grillo Magnum', ...WATER] },
  { id: 'radacini', naam: 'Delta – Radacini', producten: ['Fiori Alba', 'Metier Brut', 'Blanc de Cabernet', 'Fiori Neagra', 'Reserve Chard PG', 'Reserve Cab Mer', 'Vintage Chard', 'Vintage Pinot N', ...WATER] },
  { id: 'misty-cove', naam: 'Delta – Misty Cove', producten: ['Landmark Albariño', 'Landmark Riesling', 'Wild Daisy Pinot', 'Estate Sauv Blanc', 'Landmark Sauv Bl', '1203 Chardonnay', '1203 Pinot Noir', ...WATER] },
  { id: 'abstinence', naam: 'Delta – Abstinence', producten: ['Abstinence Bloedsinaasappel Negroni', 'Abstinence Kaapse Citruszure', 'Abstinence Citroen Spritz', 'Abstinence Cape Spice Daiquiri'] },
  { id: 'no-low', naam: 'Delta – No/Low', producten: ['Kolonne Null', 'Oddbird', 'Pizzolato Zero Sparkling', 'Fris', ...WATER] },
  { id: 'aotr', naam: 'Delta – Art of the Refill', producten: [...WATER] },
  {
    id: 'kaiken', naam: 'Kaiken wines', producten: [
      'Terroir Torrontes', 'Indómito Cab Fr', 'Disobedience', 'Brut Rosé', 'MAI', 'Divina Chard',
      'Estate Malbec', 'Estate Sauv Sém', 'Indómito Chard', 'Ultra Cab Sauv', ...WATER,
    ],
  },
  {
    id: 'wijnbeurs', naam: 'Wijnbeurs', producten: [
      'Two Rivers Sauv', 'Girard Sancerre', 'Setzer Grüner', 'Meursault Clerc', 'Kanakaris Assyrt.', 'Bosio Chardonnay',
      'Perica Rioja Bl', 'Lalande Pomerol', 'St-Émilion GC', 'Amarone Vallesel.', 'Irpinia Eremo', 'Encosta Sobral',
      'Sekeida Garnacha', 'Numéro 20 Rosé', 'Susumaniello', 'Victoria Chard', 'Pure Zero Rood 0%', 'Pure Zero Wit 0%',
      'Mystery wine 1 – Primitivo di Manduria (rood)', 'Mystery wine 2 – Saint-Émilion Grand Cru (rood)',
      'Mystery wine 3 – Bufalo Nero Bianco (wit)', 'Mystery wine 4 – Beausejour Sauvignon Blanc (wit)', ...WATER,
    ],
  },
]

// De voorraadtelling gebruikt dezelfde producten, gegroepeerd per bar. Water
// staat maar één keer in de lijst, anders tel je het zes keer.
export const VOORRAAD_GROEPEN: { naam: string; producten: string[] }[] = [
  ...BARS.map(b => ({ naam: b.naam, producten: b.producten.filter(p => !WATER.includes(p)) })).filter(g => g.producten.length > 0),
  { naam: 'Water', producten: WATER },
]

const vandaag = () => new Date().toISOString().slice(0, 10)
const datumNl = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })

const barNaam = (id: string | null) => BARS.find(b => b.id === id)?.naam || id || ''
const titelVan = (t: Pick<Telling, 'soort' | 'bar'>) => t.soort === 'voorraad' ? 'Voorraad' : barNaam(t.bar)

type Weergave = 'tellen' | 'overzicht'

export default function Tellijsten({ flash }: { flash: (m: string, ms?: number) => void }) {
  const [weergave, setWeergave] = useState<Weergave>('tellen')
  const [soort, setSoort] = useState<Soort>('bar')
  const [bar, setBar] = useState(BARS[0].id)
  const [geteldOp, setGeteldOp] = useState(vandaag())
  const [geteldDoor, setGeteldDoor] = useState('')
  const [opmerking, setOpmerking] = useState('')
  const [aantallen, setAantallen] = useState<Record<string, string>>({})
  const [bewerkId, setBewerkId] = useState<string | null>(null)
  const [tellingen, setTellingen] = useState<Telling[]>([])
  const [geladen, setGeladen] = useState(false)
  const [dbKlaar, setDbKlaar] = useState(true)
  const [bezig, setBezig] = useState(false)
  const [linkToken, setLinkToken] = useState<string | null>(null)

  const laad = async () => {
    const { data, error } = await supabase.from('tellijsten').select('*').order('geteld_op', { ascending: false }).order('created_at', { ascending: false })
    if (error) {
      // Tabel nog niet aangemaakt: tonen we een duidelijke melding in plaats van een lege pagina.
      setDbKlaar(false)
    } else {
      setDbKlaar(true)
      setTellingen((data || []) as Telling[])
    }
    setGeladen(true)
  }

  useEffect(() => {
    laad()
    // Link zonder inlog voor de bars. Bestaat de tabel nog niet, dan tonen we de kaart gewoon niet.
    supabase.from('tellijst_link').select('token').limit(1).maybeSingle().then(({ data }) => setLinkToken(data?.token || null))
    // Naam van wie is ingelogd alvast invullen, scheelt typen op de bar.
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email) return
      const { data } = await supabase.from('admins').select('naam').ilike('email', user.email).maybeSingle()
      if (data?.naam) setGeteldDoor(v => v || data.naam)
    })()
  }, [])

  const groepen = useMemo(() => {
    if (soort === 'voorraad') return VOORRAAD_GROEPEN
    const b = BARS.find(x => x.id === bar) || BARS[0]
    return [{ naam: b.naam, producten: b.producten }]
  }, [soort, bar])

  const alleProducten = groepen.flatMap(g => g.producten)
  const ingevuld = alleProducten.filter(p => aantallen[p] !== undefined && aantallen[p] !== '').length

  const reset = () => {
    setAantallen({})
    setOpmerking('')
    setBewerkId(null)
    setGeteldOp(vandaag())
  }

  const kiesSoort = (s: Soort) => { setSoort(s); reset() }
  const kiesBar = (id: string) => { setBar(id); reset() }

  const zet = (product: string, waarde: string) => {
    if (waarde !== '' && !/^\d{1,4}$/.test(waarde)) return
    setAantallen(a => ({ ...a, [product]: waarde }))
  }
  const stap = (product: string, delta: number) => {
    const nu = parseInt(aantallen[product] || '0', 10) || 0
    zet(product, String(Math.max(0, nu + delta)))
  }

  const bewaar = async () => {
    if (!geteldOp) { flash('Vul de datum in waarop je geteld hebt.', 5000); return }
    if (!geteldDoor.trim()) { flash('Vul in wie er geteld heeft.', 5000); return }
    if (ingevuld === 0) { flash('Vul minstens één aantal in.', 5000); return }
    const schoon: Record<string, number> = {}
    alleProducten.forEach(p => {
      const v = aantallen[p]
      if (v !== undefined && v !== '') schoon[p] = parseInt(v, 10)
    })
    const { data: { user } } = await supabase.auth.getUser()
    const rij = {
      soort, bar: soort === 'bar' ? bar : null,
      geteld_op: geteldOp, geteld_door: geteldDoor.trim(),
      aantallen: schoon, opmerking: opmerking.trim() || null,
    }
    setBezig(true)
    const { error } = bewerkId
      ? await supabase.from('tellijsten').update({ ...rij, updated_at: new Date().toISOString() }).eq('id', bewerkId)
      : await supabase.from('tellijsten').insert({ ...rij, aangemaakt_door: user?.email || null })
    setBezig(false)
    if (error) { flash('Opslaan mislukte: ' + error.message, 8000); return }
    flash(`Telling van ${titelVan({ soort, bar })} is opgeslagen.`)
    reset()
    await laad()
  }

  const bewerk = (t: Telling) => {
    setSoort(t.soort)
    if (t.bar) setBar(t.bar)
    setGeteldOp(t.geteld_op)
    setGeteldDoor(t.geteld_door || '')
    setOpmerking(t.opmerking || '')
    setAantallen(Object.fromEntries(Object.entries(t.aantallen || {}).map(([k, v]) => [k, String(v)])))
    setBewerkId(t.id)
    setWeergave('tellen')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const verwijder = async (t: Telling) => {
    if (!window.confirm(`Telling van ${titelVan(t)} op ${datumNl(t.geteld_op)} verwijderen?`)) return
    const { error } = await supabase.from('tellijsten').delete().eq('id', t.id)
    if (error) { flash('Verwijderen mislukte: ' + error.message, 8000); return }
    flash('Telling verwijderd.')
    await laad()
  }

  const exporteer = () => {
    const esc = (v: string | number | null) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const regels = [['Soort', 'Bar', 'Geteld op', 'Geteld door', 'Product', 'Aantal', 'Opmerking'].map(esc).join(';')]
    ;[...tellingen].reverse().forEach(t => {
      Object.entries(t.aantallen || {}).forEach(([product, n]) => {
        regels.push([t.soort === 'voorraad' ? 'Voorraad' : 'Bar', t.soort === 'bar' ? barNaam(t.bar) : '', t.geteld_op, t.geteld_door, product, n, t.opmerking].map(esc).join(';'))
      })
    })
    const blob = new Blob(['﻿' + regels.join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `tellijsten-nvdw-${vandaag()}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const chip = (actief: boolean): React.CSSProperties => ({
    padding: '9px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', borderRadius: '999px',
    border: `1px solid ${actief ? 'var(--navy)' : 'rgba(1,3,65,0.15)'}`,
    background: actief ? 'var(--navy)' : '#fff', color: actief ? 'var(--cream)' : '#66604f',
    fontFamily: 'Inter, sans-serif',
  })
  const stapKnop: React.CSSProperties = {
    width: '44px', height: '44px', borderRadius: '12px', border: '1px solid rgba(1,3,65,0.18)', background: '#fff',
    color: 'var(--navy)', fontSize: '22px', fontWeight: 600, cursor: 'pointer', lineHeight: 1, flexShrink: 0,
  }

  if (!geladen) return <div style={{ padding: '24px', color: '#8b8574' }}>Laden…</div>

  return (
    <div>
      <div style={AS.title}>Tellijsten</div>
      <div style={AS.sub}>Tel de bars en de voorraad hier op je telefoon. Het verbruik reken je zelf uit met de export.</div>

      {!dbKlaar && (
        <div style={{ ...AS.card, borderColor: 'rgba(155,55,55,0.35)' }}>
          <div style={AS.cardTitle}>De tellijsten zijn nog niet klaar in de database</div>
          <div style={{ fontSize: '13px' }}>Een beheerder moet eerst de migratie <code>20261104100000_tellijsten.sql</code> uitvoeren. Daarna werkt dit scherm.</div>
        </div>
      )}

      {linkToken && (
        <div style={AS.card}>
          <div style={AS.cardTitle}>Link zonder inlog</div>
          <div style={{ fontSize: '13px', color: '#66604f', marginBottom: '10px' }}>
            Stuur deze link naar de bars en Sara. Wie hem heeft, kan tellingen opslaan en bekijken, zonder in te loggen.
          </div>
          <input readOnly value={`${window.location.origin}/tellen/${linkToken}`} onFocus={e => e.currentTarget.select()}
            style={{ ...AS.input, fontSize: '13px', fontFamily: 'monospace' }} />
          <button
            onClick={() => navigator.clipboard.writeText(`${window.location.origin}/tellen/${linkToken}`).then(() => flash('Link gekopieerd.'), () => flash('Kopiëren lukte niet, selecteer de link zelf.', 5000))}
            style={AS.btn}>Kopieer link</button>
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', marginBottom: '18px', flexWrap: 'wrap' }}>
        <button style={chip(weergave === 'tellen')} onClick={() => setWeergave('tellen')}>Tellen</button>
        <button style={chip(weergave === 'overzicht')} onClick={() => setWeergave('overzicht')}>Eerdere tellingen ({tellingen.length})</button>
      </div>

      {weergave === 'tellen' && (
        <>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
            <button style={chip(soort === 'bar')} onClick={() => kiesSoort('bar')}>Telling bar</button>
            <button style={chip(soort === 'voorraad')} onClick={() => kiesSoort('voorraad')}>Telling voorraad</button>
          </div>

          {soort === 'bar' && (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
              {BARS.map(b => (
                <button key={b.id} onClick={() => kiesBar(b.id)} style={{ ...chip(bar === b.id), padding: '7px 13px', fontSize: '12.5px' }}>
                  {b.naam.replace('Delta – ', '')}
                </button>
              ))}
            </div>
          )}

          {bewerkId && (
            <div style={{ background: 'rgba(254,183,42,0.22)', borderRadius: '12px', padding: '10px 14px', marginBottom: '14px', fontSize: '13px', fontWeight: 600 }}>
              Je past een eerdere telling aan.{' '}
              <button onClick={reset} style={{ background: 'none', border: 'none', color: 'var(--bordeaux)', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}>Annuleren</button>
            </div>
          )}

          <div style={AS.card}>
            <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: '21px', fontWeight: 700, color: 'var(--navy)', marginBottom: '4px' }}>
              {soort === 'voorraad' ? 'Voorraad' : barNaam(bar)}
            </div>
            <div style={AS.grid2}>
              <div>
                <label style={AS.label}>Geteld op (datum)</label>
                <input type="date" value={geteldOp} onChange={e => setGeteldOp(e.target.value)} style={{ ...AS.input, fontSize: '16px', padding: '11px 12px' }} />
              </div>
              <div>
                <label style={AS.label}>Geteld door</label>
                <input value={geteldDoor} onChange={e => setGeteldDoor(e.target.value)} placeholder="Naam" style={{ ...AS.input, fontSize: '16px', padding: '11px 12px' }} />
              </div>
            </div>
          </div>

          {groepen.map(g => (
            <div key={g.naam} style={AS.card}>
              {soort === 'voorraad' && <div style={AS.cardTitle}>{g.naam}</div>}
              {g.producten.map((p, i) => (
                <div key={p} style={{
                  display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 0',
                  borderTop: i === 0 ? 'none' : '1px solid rgba(1,3,65,0.07)',
                }}>
                  <div style={{ flex: 1, minWidth: 0, fontSize: '15px', fontWeight: 600, color: 'var(--navy)', lineHeight: 1.3 }}>{p}</div>
                  <button type="button" aria-label={`${p} min één`} onClick={() => stap(p, -1)} style={stapKnop}>−</button>
                  <input
                    inputMode="numeric" pattern="[0-9]*" placeholder="–" aria-label={`Aantal ${p}`}
                    value={aantallen[p] ?? ''} onChange={e => zet(p, e.target.value)}
                    style={{ ...AS.input, width: '72px', textAlign: 'center', fontSize: '20px', fontWeight: 700, padding: '9px 4px', flexShrink: 0 }}
                  />
                  <button type="button" aria-label={`${p} plus één`} onClick={() => stap(p, 1)} style={stapKnop}>+</button>
                </div>
              ))}
            </div>
          ))}

          <div style={AS.card}>
            <label style={{ ...AS.label, marginTop: 0 }}>Opmerking (optioneel)</label>
            <textarea value={opmerking} onChange={e => setOpmerking(e.target.value)} rows={2} placeholder="Bijvoorbeeld: 2 flessen kapot"
              style={{ ...AS.input, fontSize: '15px', resize: 'vertical' }} />
          </div>

          <div style={{ position: 'sticky', bottom: 0, background: 'var(--sand)', padding: '12px 0 16px', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
            <button onClick={bewaar} disabled={bezig || !dbKlaar} style={{ ...AS.btnGold, marginTop: 0, padding: '14px 28px', fontSize: '15px', opacity: bezig || !dbKlaar ? 0.5 : 1 }}>
              {bezig ? 'Opslaan…' : bewerkId ? 'Wijzigingen opslaan' : 'Telling opslaan'}
            </button>
            <div style={{ fontSize: '13px', color: '#66604f', fontWeight: 600 }}>{ingevuld} van {alleProducten.length} ingevuld</div>
          </div>
        </>
      )}

      {weergave === 'overzicht' && (
        <div style={AS.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '8px' }}>
            <div style={{ ...AS.cardTitle, marginBottom: 0 }}>Eerdere tellingen</div>
            <button onClick={exporteer} disabled={tellingen.length === 0} style={{ ...AS.btn, marginTop: 0, opacity: tellingen.length === 0 ? 0.5 : 1 }}>Exporteer naar CSV</button>
          </div>
          {tellingen.length === 0 ? (
            <div style={{ fontSize: '13px', color: '#8b8574', padding: '10px 0' }}>Er zijn nog geen tellingen opgeslagen.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={AS.table}>
                <thead>
                  <tr>
                    <th style={AS.th}>Geteld op</th>
                    <th style={AS.th}>Wat</th>
                    <th style={AS.th}>Geteld door</th>
                    <th style={AS.th}>Regels</th>
                    <th style={AS.th}>Opmerking</th>
                    <th style={AS.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {tellingen.map(t => (
                    <tr key={t.id}>
                      <td style={AS.td}>{datumNl(t.geteld_op)}</td>
                      <td style={{ ...AS.td, fontWeight: 600 }}>{titelVan(t)}</td>
                      <td style={AS.td}>{t.geteld_door}</td>
                      <td style={AS.td}>{Object.keys(t.aantallen || {}).length}</td>
                      <td style={AS.td}>{t.opmerking}</td>
                      <td style={{ ...AS.td, whiteSpace: 'nowrap' }}>
                        <button onClick={() => bewerk(t)} style={{ ...AS.btnSm, color: 'var(--navy)', borderColor: 'rgba(1,3,65,0.25)', marginRight: '6px' }}>Bekijk / pas aan</button>
                        <button onClick={() => verwijder(t)} style={AS.btnSm}>Verwijder</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
