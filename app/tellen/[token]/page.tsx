'use client'
// Publieke tellijstpagina voor de bars en de voorraad. Bereikbaar via een geheime
// link (token), zonder login. De RPC's tellijst_publiek_opslaan en
// tellijst_publiek_overzicht controleren het token server-side; meer dan een
// telling opslaan en de laatste tellingen bekijken kan met deze link niet.
// Aanpassen of verwijderen van een telling gaat in het portaal (Partners > Tellijsten).
import { use, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { AS } from '../../admin/ui'
import { BARS, VOORRAAD_GROEPEN } from '../../admin/Tellijsten'

type Soort = 'bar' | 'voorraad'
type Rij = { id: string; soort: Soort; bar: string | null; geteld_op: string; geteld_door: string | null; regels: number; opmerking: string | null }
type Overzicht = { geldig: boolean; tellingen?: Rij[] }

const vandaag = () => new Date().toISOString().slice(0, 10)
const datumNl = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })
const barNaam = (id: string | null) => BARS.find(b => b.id === id)?.naam || id || ''
const titelVan = (t: Pick<Rij, 'soort' | 'bar'>) => t.soort === 'voorraad' ? 'Voorraad' : barNaam(t.bar)

const NAAM_SLEUTEL = 'nvdw-tellijst-naam'

export default function TellenPagina({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [data, setData] = useState<Overzicht | null>(null)
  const [soort, setSoort] = useState<Soort>('bar')
  const [bar, setBar] = useState(BARS[0].id)
  const [geteldOp, setGeteldOp] = useState(vandaag())
  const [geteldDoor, setGeteldDoor] = useState('')
  const [opmerking, setOpmerking] = useState('')
  const [aantallen, setAantallen] = useState<Record<string, string>>({})
  const [bezig, setBezig] = useState(false)
  const [melding, setMelding] = useState<{ tekst: string; goed: boolean } | null>(null)

  const laad = async () => {
    const { data: res, error } = await supabase.rpc('tellijst_publiek_overzicht', { p_token: token })
    setData(error || !res ? { geldig: false } : (res as Overzicht))
  }
  useEffect(() => { laad() }, [token])

  // Onthoud de naam op dit toestel, scheelt typen bij elke telling.
  useEffect(() => {
    try { setGeteldDoor(localStorage.getItem(NAAM_SLEUTEL) || '') } catch { /* privémodus */ }
  }, [])

  const groepen = useMemo(() => {
    if (soort === 'voorraad') return VOORRAAD_GROEPEN
    const b = BARS.find(x => x.id === bar) || BARS[0]
    return [{ naam: b.naam, producten: b.producten }]
  }, [soort, bar])

  const alleProducten = groepen.flatMap(g => g.producten)
  const ingevuld = alleProducten.filter(p => aantallen[p] !== undefined && aantallen[p] !== '').length

  const reset = () => { setAantallen({}); setOpmerking(''); setGeteldOp(vandaag()) }
  const kiesSoort = (s: Soort) => { setSoort(s); reset(); setMelding(null) }
  const kiesBar = (id: string) => { setBar(id); reset(); setMelding(null) }

  const zet = (product: string, waarde: string) => {
    if (waarde !== '' && !/^\d{1,4}$/.test(waarde)) return
    setAantallen(a => ({ ...a, [product]: waarde }))
  }
  const stap = (product: string, delta: number) => {
    const nu = parseInt(aantallen[product] || '0', 10) || 0
    zet(product, String(Math.max(0, nu + delta)))
  }

  const bewaar = async () => {
    if (!geteldOp) { setMelding({ tekst: 'Vul de datum in waarop je geteld hebt.', goed: false }); return }
    if (!geteldDoor.trim()) { setMelding({ tekst: 'Vul in wie er geteld heeft.', goed: false }); return }
    if (ingevuld === 0) { setMelding({ tekst: 'Vul minstens één aantal in.', goed: false }); return }
    const schoon: Record<string, number> = {}
    alleProducten.forEach(p => {
      const v = aantallen[p]
      if (v !== undefined && v !== '') schoon[p] = parseInt(v, 10)
    })
    setBezig(true)
    const { error } = await supabase.rpc('tellijst_publiek_opslaan', {
      p_token: token, p_soort: soort, p_bar: soort === 'bar' ? bar : null,
      p_geteld_op: geteldOp, p_geteld_door: geteldDoor.trim(), p_aantallen: schoon,
      p_opmerking: opmerking.trim() || null,
    })
    setBezig(false)
    if (error) {
      setMelding({ tekst: error.message.includes('ONGELDIGE_LINK') ? 'Deze link klopt niet meer.' : 'Opslaan lukte niet. Probeer het opnieuw.', goed: false })
      return
    }
    try { localStorage.setItem(NAAM_SLEUTEL, geteldDoor.trim()) } catch { /* privémodus */ }
    setMelding({ tekst: `Telling van ${titelVan({ soort, bar })} is opgeslagen.`, goed: true })
    reset()
    window.scrollTo({ top: 0, behavior: 'smooth' })
    await laad()
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
  const wrap: React.CSSProperties = { maxWidth: '560px', margin: '0 auto', padding: '20px 16px 40px', fontFamily: 'Inter, sans-serif', color: 'var(--navy)' }

  if (!data) return <div style={wrap}><p style={{ textAlign: 'center', color: '#888', marginTop: '60px', fontSize: '14px' }}>Laden...</p></div>

  if (!data.geldig) {
    return (
      <div style={wrap}>
        <div style={{ background: 'var(--navy)', borderRadius: '16px', padding: '32px 24px', color: 'var(--cream)', textAlign: 'center', marginTop: '40px' }}>
          <div style={{ fontSize: '10px', letterSpacing: '3px', textTransform: 'uppercase', color: 'var(--gold)', fontWeight: 700, marginBottom: '14px' }}>
            Nacht van de Wijn · Tellijsten
          </div>
          <h1 style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: '24px', fontWeight: 700, margin: '0 0 10px' }}>Deze link klopt niet meer.</h1>
          <p style={{ fontSize: '14px', opacity: 0.85, margin: 0 }}>Vraag de organisatie om een nieuwe.</p>
        </div>
      </div>
    )
  }

  const tellingen = data.tellingen || []

  return (
    <div style={wrap}>
      <div style={{ background: 'var(--navy)', borderRadius: '16px', padding: '24px', color: 'var(--cream)', marginBottom: '18px' }}>
        <div style={{ fontSize: '10px', letterSpacing: '3px', textTransform: 'uppercase', color: 'var(--gold)', fontWeight: 700, marginBottom: '8px' }}>
          Nacht van de Wijn · Tellijsten
        </div>
        <h1 style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: '26px', fontWeight: 700, margin: '0 0 6px', lineHeight: 1.15 }}>Tel de bars en de voorraad</h1>
        <p style={{ fontSize: '13px', opacity: 0.85, margin: 0, lineHeight: 1.5 }}>Kies wat je telt, vul de aantallen in en sla op. Je hebt hier geen login voor nodig.</p>
      </div>

      {melding && (
        <div style={{ background: melding.goed ? 'rgba(45,138,78,0.14)' : 'rgba(155,55,55,0.12)', borderRadius: '12px', padding: '12px 14px', marginBottom: '14px', fontSize: '13px', fontWeight: 600 }}>
          {melding.tekst}
        </div>
      )}

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
            <div key={p} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 0', borderTop: i === 0 ? 'none' : '1px solid rgba(1,3,65,0.07)' }}>
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
        <button onClick={bewaar} disabled={bezig} style={{ ...AS.btnGold, marginTop: 0, padding: '14px 28px', fontSize: '15px', opacity: bezig ? 0.5 : 1 }}>
          {bezig ? 'Opslaan…' : 'Telling opslaan'}
        </button>
        <div style={{ fontSize: '13px', color: '#66604f', fontWeight: 600 }}>{ingevuld} van {alleProducten.length} ingevuld</div>
      </div>

      <div style={AS.card}>
        <div style={AS.cardTitle}>Laatste tellingen</div>
        {tellingen.length === 0 ? (
          <div style={{ fontSize: '13px', color: '#8b8574' }}>Er zijn nog geen tellingen opgeslagen.</div>
        ) : tellingen.map(t => (
          <div key={t.id} style={{ padding: '8px 0', borderTop: '1px solid rgba(1,3,65,0.07)', fontSize: '13px' }}>
            <strong>{titelVan(t)}</strong> · {datumNl(t.geteld_op)} · {t.geteld_door} · {t.regels} regels
            {t.opmerking ? <div style={{ color: '#8b8574', marginTop: '2px' }}>{t.opmerking}</div> : null}
          </div>
        ))}
      </div>
    </div>
  )
}
