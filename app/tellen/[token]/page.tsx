'use client'
// Publieke tellijstpagina voor de bars en de voorraad. Bereikbaar via een geheime
// link (token), zonder login. De RPC's tellijst_publiek_opslaan en
// tellijst_publiek_overzicht controleren het token server-side; meer dan een
// telling opslaan en de laatste tellingen bekijken kan met deze link niet.
// Aanpassen of verwijderen van een telling gaat in het portaal (Partners > Tellijsten).
//
// Per wijn staan twee invulvelden naast elkaar: Bar en Voorraad. Bij het opslaan
// wordt dat een telling "bar" (voor de gekozen bar) en een telling "voorraad".
// Water staat maar één keer in de voorraad: bij de bars alleen het veld Bar, en
// de voorraad van water tel je onder het kopje "Water".
import { use, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { AS } from '../../admin/ui'
import { BARS, WATER } from '../../admin/Tellijsten'

type Soort = 'bar' | 'voorraad'
type Rij = { id: string; soort: Soort; bar: string | null; geteld_op: string; geteld_door: string | null; regels: number; opmerking: string | null }
type Overzicht = { geldig: boolean; tellingen?: Rij[] }
type Velden = Record<string, string>

const WATER_ID = 'water'

const vandaag = () => new Date().toISOString().slice(0, 10)
const datumNl = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })
const barNaam = (id: string | null) => BARS.find(b => b.id === id)?.naam || id || ''
const titelVan = (t: Pick<Rij, 'soort' | 'bar'>) => t.soort === 'voorraad' ? 'Voorraad' : barNaam(t.bar)

const NAAM_SLEUTEL = 'nvdw-tellijst-naam'

const schoon = (producten: string[], v: Velden) => {
  const uit: Record<string, number> = {}
  producten.forEach(p => { if (v[p] !== undefined && v[p] !== '') uit[p] = parseInt(v[p], 10) })
  return uit
}

export default function TellenPagina({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [data, setData] = useState<Overzicht | null>(null)
  const [keuze, setKeuze] = useState<string>(BARS[0].id)
  const [geteldOp, setGeteldOp] = useState(vandaag())
  const [geteldDoor, setGeteldDoor] = useState('')
  const [opmerking, setOpmerking] = useState('')
  const [barA, setBarA] = useState<Velden>({})
  const [voorA, setVoorA] = useState<Velden>({})
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

  const isWater = keuze === WATER_ID
  const bar = BARS.find(b => b.id === keuze)
  const producten = useMemo(() => isWater ? WATER : (bar?.producten || []), [isWater, bar])
  const titel = isWater ? 'Water (voorraad)' : barNaam(keuze)

  const barIngevuld = producten.filter(p => barA[p] !== undefined && barA[p] !== '').length
  const voorIngevuld = producten.filter(p => voorA[p] !== undefined && voorA[p] !== '').length

  const reset = () => { setBarA({}); setVoorA({}); setOpmerking(''); setGeteldOp(vandaag()) }
  const kies = (id: string) => { setKeuze(id); reset(); setMelding(null) }

  const zet = (zetter: React.Dispatch<React.SetStateAction<Velden>>, product: string, waarde: string) => {
    if (waarde !== '' && !/^\d{1,4}$/.test(waarde)) return
    zetter(a => ({ ...a, [product]: waarde }))
  }

  const stuur = (soort: Soort, barId: string | null, aantallen: Record<string, number>) =>
    supabase.rpc('tellijst_publiek_opslaan', {
      p_token: token, p_soort: soort, p_bar: barId, p_geteld_op: geteldOp, p_geteld_door: geteldDoor.trim(),
      p_aantallen: aantallen, p_opmerking: opmerking.trim() || null,
    })

  const bewaar = async () => {
    if (!geteldOp) { setMelding({ tekst: 'Vul de datum in waarop je geteld hebt.', goed: false }); return }
    if (!geteldDoor.trim()) { setMelding({ tekst: 'Vul in wie er geteld heeft.', goed: false }); return }
    const barAantallen = isWater ? {} : schoon(producten, barA)
    // Bij de bars telt water niet mee in de voorraad, die tel je onder "Water".
    const voorProducten = isWater ? producten : producten.filter(p => !WATER.includes(p))
    const voorAantallen = schoon(voorProducten, voorA)
    const nBar = Object.keys(barAantallen).length
    const nVoor = Object.keys(voorAantallen).length
    if (nBar === 0 && nVoor === 0) { setMelding({ tekst: 'Vul minstens één aantal in.', goed: false }); return }

    setBezig(true)
    const gelukt: string[] = []
    let fout: string | null = null
    if (nBar > 0) {
      const { error } = await stuur('bar', keuze, barAantallen)
      if (error) fout = error.message; else gelukt.push(`bar ${barNaam(keuze)}`)
    }
    if (!fout && nVoor > 0) {
      const { error } = await stuur('voorraad', null, voorAantallen)
      if (error) fout = error.message; else gelukt.push('voorraad')
    }
    setBezig(false)

    if (fout) {
      const tekst = fout.includes('ONGELDIGE_LINK') ? 'Deze link klopt niet meer.' : 'Opslaan lukte niet. Probeer het opnieuw.'
      setMelding({ tekst: gelukt.length ? `${tekst} Al opgeslagen: ${gelukt.join(' en ')}. Sla niet opnieuw op wat al bewaard is.` : tekst, goed: false })
      if (gelukt.length) { await laad() }
      return
    }
    try { localStorage.setItem(NAAM_SLEUTEL, geteldDoor.trim()) } catch { /* privémodus */ }
    setMelding({ tekst: `Opgeslagen: ${gelukt.join(' en ')}.`, goed: true })
    reset()
    window.scrollTo({ top: 0, behavior: 'smooth' })
    await laad()
  }

  const chip = (actief: boolean): React.CSSProperties => ({
    padding: '7px 13px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', borderRadius: '999px',
    border: `1px solid ${actief ? 'var(--navy)' : 'rgba(1,3,65,0.15)'}`,
    background: actief ? 'var(--navy)' : '#fff', color: actief ? 'var(--cream)' : '#66604f',
    fontFamily: 'Inter, sans-serif',
  })
  const veld: React.CSSProperties = { ...AS.input, width: '76px', textAlign: 'center', fontSize: '20px', fontWeight: 700, padding: '9px 4px', flexShrink: 0 }
  const kop: React.CSSProperties = { width: '76px', textAlign: 'center', fontSize: '11px', fontWeight: 700, letterSpacing: '0.3px', color: '#9a9484', flexShrink: 0 }
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
        <p style={{ fontSize: '13px', opacity: 0.85, margin: 0, lineHeight: 1.5 }}>Kies je bar, vul per wijn in wat er op de bar staat en wat er in voorraad is, en sla op. Je hebt hier geen login voor nodig.</p>
      </div>

      {melding && (
        <div style={{ background: melding.goed ? 'rgba(45,138,78,0.14)' : 'rgba(155,55,55,0.12)', borderRadius: '12px', padding: '12px 14px', marginBottom: '14px', fontSize: '13px', fontWeight: 600 }}>
          {melding.tekst}
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {BARS.map(b => (
          <button key={b.id} onClick={() => kies(b.id)} style={chip(keuze === b.id)}>{b.naam.replace('Delta – ', '')}</button>
        ))}
        <button onClick={() => kies(WATER_ID)} style={chip(isWater)}>Water</button>
      </div>

      <div style={AS.card}>
        <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: '21px', fontWeight: 700, color: 'var(--navy)', marginBottom: '4px' }}>{titel}</div>
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

      <div style={AS.card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingBottom: '6px' }}>
          <div style={{ flex: 1 }} />
          <div style={kop}>{isWater ? '' : 'BAR'}</div>
          <div style={kop}>VOORRAAD</div>
        </div>
        {producten.map(p => {
          const heeftVoorraad = isWater || !WATER.includes(p)
          return (
            <div key={p} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 0', borderTop: '1px solid rgba(1,3,65,0.07)' }}>
              <div style={{ flex: 1, minWidth: 0, fontSize: '15px', fontWeight: 600, color: 'var(--navy)', lineHeight: 1.3 }}>{p}</div>
              {isWater ? <div style={{ width: '76px', flexShrink: 0 }} /> : (
                <input inputMode="numeric" pattern="[0-9]*" placeholder="–" aria-label={`Aantal ${p} op de bar`}
                  value={barA[p] ?? ''} onChange={e => zet(setBarA, p, e.target.value)} style={veld} />
              )}
              {heeftVoorraad ? (
                <input inputMode="numeric" pattern="[0-9]*" placeholder="–" aria-label={`Aantal ${p} in voorraad`}
                  value={voorA[p] ?? ''} onChange={e => zet(setVoorA, p, e.target.value)} style={veld} />
              ) : <div style={{ width: '76px', flexShrink: 0 }} />}
            </div>
          )
        })}
        {!isWater && <div style={{ fontSize: '12px', color: '#8b8574', marginTop: '10px' }}>De voorraad van water tel je onder het kopje Water.</div>}
      </div>

      <div style={AS.card}>
        <label style={{ ...AS.label, marginTop: 0 }}>Opmerking (optioneel)</label>
        <textarea value={opmerking} onChange={e => setOpmerking(e.target.value)} rows={2} placeholder="Bijvoorbeeld: 2 flessen kapot"
          style={{ ...AS.input, fontSize: '15px', resize: 'vertical' }} />
      </div>

      <div style={{ position: 'sticky', bottom: 0, background: 'var(--sand)', padding: '12px 0 16px', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
        <button onClick={bewaar} disabled={bezig} style={{ ...AS.btnGold, marginTop: 0, padding: '14px 28px', fontSize: '15px', opacity: bezig ? 0.5 : 1 }}>
          {bezig ? 'Opslaan…' : 'Telling opslaan'}
        </button>
        <div style={{ fontSize: '13px', color: '#66604f', fontWeight: 600 }}>
          {isWater ? `${voorIngevuld} voorraad ingevuld` : `${barIngevuld} bar · ${voorIngevuld} voorraad ingevuld`}
        </div>
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
