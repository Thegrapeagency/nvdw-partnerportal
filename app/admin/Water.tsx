'use client'
// Water: de omzet en inkoop van het water zijn van ons, de partners verkopen
// het alleen. Hier zet je per bar de standaardvoorraad neer, zie je live wat er
// volgens de kassa nog staat en voer je leveringen in. Bijleveren kan alleen
// tot wat er verkocht is: wie water weggeeft, krijgt geen extra. Onder de
// drempel komt er een melding in de cockpit (Hulp) en een pushbericht.
import { useEffect, useMemo, useState } from 'react'
import { posRpc } from '@/lib/supabase'
import { AS, euro } from './ui'

type Rij = {
  product_id: string
  product: string
  merchant_id: string
  merchant: string
  is_house: boolean
  active: boolean
  track_stock: boolean
  standaard: number | null
  geleverd: number | null
  rest: number | null
  drempel: number | null
  bij_te_leveren: number
  verkocht: number
  omzet_cents: number
  laatste_levering: string | null
  open_melding: boolean
  status: 'niet_ingesteld' | 'op' | 'bijleveren' | 'ok'
}

const n = (v: unknown) => Math.round(Number(v) || 0)
const SOORTEN = ['Sea Water plat', 'Sea Water bruis']
const STATUS: Record<Rij['status'], { label: string; bg: string; fg: string }> = {
  op: { label: 'Op', bg: '#fdecea', fg: '#b3261e' },
  bijleveren: { label: 'Bijleveren', bg: '#fff4e0', fg: '#9a5b00' },
  ok: { label: 'Genoeg', bg: '#e8f3ea', fg: '#2e6b3a' },
  niet_ingesteld: { label: 'Niet ingesteld', bg: '#f1efe8', fg: '#777162' },
}

export default function Water({ flash }: { flash: (m: string, ms?: number) => void }) {
  const [rijen, setRijen] = useState<Rij[]>([])
  const [status, setStatus] = useState<'laden' | 'ok' | 'fout'>('laden')
  const [fout, setFout] = useState('')
  const [tijd, setTijd] = useState<Date | null>(null)
  const [alleenNodig, setAlleenNodig] = useState(false)
  const [busy, setBusy] = useState('')
  const [aantal, setAantal] = useState<Record<string, string>>({})
  const [instelling, setInstelling] = useState<Record<string, { standaard: string; drempel: string }>>({
    'Sea Water plat': { standaard: '24', drempel: '6' },
    'Sea Water bruis': { standaard: '24', drempel: '6' },
  })

  const laad = async () => {
    try {
      const r = await posRpc<{ rijen: Rij[] }>('water_overzicht')
      setRijen(r.rijen || [])
      setStatus('ok'); setFout(''); setTijd(new Date())
    } catch (e) {
      setFout((e as Error).message)
      setStatus(s => (s === 'ok' ? 'ok' : 'fout'))
    }
  }

  useEffect(() => {
    const eerst = setTimeout(laad, 0)
    const iv = setInterval(laad, 20000)
    return () => { clearTimeout(eerst); clearInterval(iv) }
  }, [])

  const bars = useMemo(() => {
    const per = new Map<string, { merchant: string; is_house: boolean; rijen: Rij[] }>()
    for (const r of rijen) {
      if (!per.has(r.merchant_id)) per.set(r.merchant_id, { merchant: r.merchant, is_house: r.is_house, rijen: [] })
      per.get(r.merchant_id)!.rijen.push(r)
    }
    const lijst = [...per.entries()].map(([id, b]) => ({ id, ...b }))
    const urgent = (b: { rijen: Rij[] }) => b.rijen.some(r => r.status === 'op') ? 0 : b.rijen.some(r => r.status === 'bijleveren') ? 1 : 2
    lijst.sort((a, b) => urgent(a) - urgent(b) || a.merchant.localeCompare(b.merchant))
    return alleenNodig ? lijst.filter(b => urgent(b) < 2) : lijst
  }, [rijen, alleenNodig])

  const nodig = rijen.filter(r => r.status === 'op' || r.status === 'bijleveren')
  const ingesteld = rijen.filter(r => r.track_stock).length
  const totaalVerkocht = rijen.reduce((s, r) => s + n(r.verkocht), 0)
  const totaalOmzet = rijen.reduce((s, r) => s + n(r.omzet_cents), 0)
  const totaalBij = nodig.reduce((s, r) => s + n(r.bij_te_leveren), 0)

  const instellenAlle = async (soort: string) => {
    const i = instelling[soort]
    const standaard = Number(i.standaard), drempel = Number(i.drempel)
    if (!(standaard > 0) || !(drempel >= 0)) { flash('Vul een standaardvoorraad en een drempel in.'); return }
    const nieuw = rijen.filter(r => r.product === soort && !r.track_stock).length
    if (!confirm(`${soort}: standaard ${standaard}, seintje bij ${drempel} of minder.\n\n` +
      (nieuw > 0 ? `Bij ${nieuw} bars staat de voorraad nog niet aan. Daar zetten we nu ${standaard} flessen neer en telt de kassa vanaf nu af. ` : '') +
      'Bij bars waar de voorraad al loopt, verandert alleen de instelling.')) return
    setBusy('alle-' + soort)
    try {
      const r = await posRpc<{ aantal: number }>('water_instellen_alle', { p_naam: soort, p_standaard: standaard, p_drempel: drempel })
      flash(`${soort} ingesteld bij ${r.aantal} bars.`)
      await laad()
    } catch (e) { flash('Instellen mislukte: ' + (e as Error).message, 7000) }
    setBusy('')
  }

  const instellenEen = async (r: Rij) => {
    const i = instelling[r.product] ?? { standaard: '24', drempel: '6' }
    const standaard = Number(prompt(`${r.merchant}, ${r.product}\nStandaardvoorraad (zoveel zetten we neer):`, String(r.standaard ?? i.standaard)) ?? '')
    if (!(standaard > 0)) return
    const drempel = Number(prompt('Seintje als er nog zoveel of minder staan:', String(r.drempel ?? i.drempel)) ?? '')
    if (!(drempel >= 0)) return
    setBusy(r.product_id)
    try {
      await posRpc('water_instellen', { p_product_id: r.product_id, p_standaard: standaard, p_drempel: drempel })
      flash(`${r.merchant}: ${r.product} ingesteld.`)
      await laad()
    } catch (e) { flash('Instellen mislukte: ' + (e as Error).message, 7000) }
    setBusy('')
  }

  const bijleveren = async (r: Rij) => {
    const a = Number(aantal[r.product_id] ?? n(r.bij_te_leveren))
    if (!(a > 0)) { flash('Vul in hoeveel flessen je hebt gebracht.'); return }
    setBusy(r.product_id)
    try {
      await posRpc('water_bijleveren', { p_product_id: r.product_id, p_aantal: a })
      flash(`${r.merchant}: ${a} × ${r.product} bijgeleverd.`)
      setAantal(x => { const y = { ...x }; delete y[r.product_id]; return y })
      await laad()
    } catch (e) { flash((e as Error).message, 9000) }
    setBusy('')
  }

  const correctie = async (r: Rij) => {
    const geteld = prompt(`${r.merchant}, ${r.product}\nVolgens de kassa staan er ${n(r.rest)}. Hoeveel heb je geteld?`, String(n(r.rest)))
    if (geteld === null || geteld.trim() === '') return
    const reden = prompt('Reden (bijvoorbeeld: breuk, verkeerd neergezet):')
    if (!reden || !reden.trim()) { flash('Een correctie heeft een reden nodig.'); return }
    setBusy(r.product_id)
    try {
      await posRpc('water_correctie', { p_product_id: r.product_id, p_rest: Number(geteld), p_reden: reden })
      flash(`${r.merchant}: voorraad ${r.product} gecorrigeerd naar ${geteld}.`)
      await laad()
    } catch (e) { flash('Correctie mislukte: ' + (e as Error).message, 7000) }
    setBusy('')
  }

  return (
    <>
      <div style={AS.title}>Water</div>
      <div style={AS.sub}>
        Het water is van ons: partners verkopen het, maar zien het niet in hun omzet en kunnen het niet aanpassen.
        Hier zet je de voorraad neer en vul je bij. Ververst elke 20 seconden{tijd ? ` · bijgewerkt ${tijd.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}` : ''}.
      </div>

      {status === 'fout' && <div style={{ ...AS.card, background: '#fdecea', color: '#b3261e' }}>Watervoorraad niet bereikbaar: {fout}</div>}

      <div style={{ ...AS.grid3, marginBottom: '14px' }}>
        <div style={AS.card}>
          <div style={{ fontSize: '12px', color: '#777162' }}>Bijleveren nodig</div>
          <div style={{ fontSize: '26px', fontWeight: 700, color: nodig.length ? '#9a5b00' : 'var(--navy)' }}>{nodig.length}</div>
          <div style={{ fontSize: '12px', color: '#999' }}>{nodig.length ? `${totaalBij} flessen in totaal` : 'Alles staat goed'}</div>
        </div>
        <div style={AS.card}>
          <div style={{ fontSize: '12px', color: '#777162' }}>Verkocht</div>
          <div style={{ fontSize: '26px', fontWeight: 700 }}>{totaalVerkocht}</div>
          <div style={{ fontSize: '12px', color: '#999' }}>flessen, alle bars samen</div>
        </div>
        <div style={AS.card}>
          <div style={{ fontSize: '12px', color: '#777162' }}>Wateromzet voor ons</div>
          <div style={{ fontSize: '26px', fontWeight: 700 }}>{euro(totaalOmzet)}</div>
          <div style={{ fontSize: '12px', color: '#999' }}>inclusief btw</div>
        </div>
      </div>

      <div style={AS.card}>
        <div style={AS.cardTitle}>Standaardvoorraad voor alle bars</div>
        <p style={{ fontSize: '13px', color: '#666', margin: '0 0 6px', lineHeight: 1.6 }}>
          Zoveel flessen zetten we bij elke bar neer. Bij de eerste keer instellen staat die voorraad ook meteen klaar en telt de kassa vanaf dat moment af.
          Komt een bar op de drempel of eronder, dan krijg je een seintje in de cockpit onder Hulp. Staat de kassa op 0, dan kan de bar geen water meer verkopen tot je hebt bijgeleverd.
        </p>
        <p style={{ fontSize: '12px', color: '#999', margin: '0 0 4px' }}>
          {ingesteld} van {rijen.length} watersoorten bij de bars lopen al mee.
        </p>
        <div style={AS.grid2}>
          {SOORTEN.map(soort => (
            <div key={soort} style={{ border: '1px solid rgba(1,3,65,0.08)', borderRadius: '12px', padding: '12px 14px' }}>
              <div style={{ fontWeight: 700, fontSize: '13px' }}>{soort}</div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 1 }}>
                  <label style={AS.label}>Standaard per bar</label>
                  <input style={AS.input} type="number" min={1} value={instelling[soort].standaard}
                    onChange={e => setInstelling(x => ({ ...x, [soort]: { ...x[soort], standaard: e.target.value } }))} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={AS.label}>Seintje bij</label>
                  <input style={AS.input} type="number" min={0} value={instelling[soort].drempel}
                    onChange={e => setInstelling(x => ({ ...x, [soort]: { ...x[soort], drempel: e.target.value } }))} />
                </div>
              </div>
              <button style={{ ...AS.btn, marginTop: '12px', opacity: busy === 'alle-' + soort ? 0.5 : 1 }} disabled={!!busy} onClick={() => instellenAlle(soort)}>
                {busy === 'alle-' + soort ? 'Bezig…' : 'Toepassen op alle bars'}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div style={AS.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '8px' }}>
          <div style={{ ...AS.cardTitle, marginBottom: 0 }}>Per bar</div>
          <label style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
            <input type="checkbox" checked={alleenNodig} onChange={e => setAlleenNodig(e.target.checked)} /> Alleen bars die water nodig hebben
          </label>
        </div>
        {status === 'laden' && <p style={{ fontSize: '13px', color: '#999' }}>Laden…</p>}
        {status !== 'laden' && bars.length === 0 && <p style={{ fontSize: '13px', color: '#999' }}>{alleenNodig ? 'Geen enkele bar heeft nu water nodig.' : 'Geen waterproducten gevonden.'}</p>}
        <div style={{ overflowX: 'auto' }}>
          <table style={AS.table}>
            {bars.length > 0 && (
              <thead><tr>
                <th style={AS.th}>Bar</th><th style={AS.th}>Water</th><th style={AS.th}>Staat er nog</th>
                <th style={AS.th}>Verkocht</th><th style={AS.th}>Status</th><th style={AS.th}>Bijleveren</th>
              </tr></thead>
            )}
            <tbody>
              {bars.map(b => b.rijen.map((r, i) => {
                const st = STATUS[r.status]
                return (
                  <tr key={r.product_id}>
                    <td style={{ ...AS.td, borderBottom: i < b.rijen.length - 1 ? 'none' : AS.td.borderBottom }}>
                      {i === 0 && <><strong>{b.merchant.replace(/ \(house\)$/i, '')}</strong>{b.is_house && <div style={{ fontSize: '11px', color: '#999' }}>eigen bar</div>}</>}
                    </td>
                    <td style={AS.td}>{r.product.replace('Sea Water ', '')}</td>
                    <td style={AS.td}>
                      {r.track_stock ? <><strong>{n(r.rest)}</strong><span style={{ color: '#999' }}> van {n(r.standaard)}</span></> : <span style={{ color: '#999' }}>—</span>}
                      {r.track_stock && <div style={{ fontSize: '11px', color: '#999' }}>seintje bij {n(r.drempel)}</div>}
                    </td>
                    <td style={AS.td}>{n(r.verkocht)}<div style={{ fontSize: '11px', color: '#999' }}>{euro(n(r.omzet_cents))}</div></td>
                    <td style={AS.td}>
                      <span style={{ background: st.bg, color: st.fg, borderRadius: '999px', padding: '3px 10px', fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap' }}>{st.label}</span>
                    </td>
                    <td style={{ ...AS.td, whiteSpace: 'nowrap' }}>
                      {!r.track_stock ? (
                        <button style={AS.btnSm} disabled={!!busy} onClick={() => instellenEen(r)}>Instellen</button>
                      ) : n(r.bij_te_leveren) > 0 ? (
                        <span style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                          <input style={{ ...AS.input, width: '64px', padding: '5px 8px' }} type="number" min={1} max={n(r.bij_te_leveren)}
                            value={aantal[r.product_id] ?? String(n(r.bij_te_leveren))}
                            onChange={e => setAantal(x => ({ ...x, [r.product_id]: e.target.value }))} />
                          <button style={{ ...AS.btnSm, background: 'var(--navy)', color: 'var(--cream)', border: 'none', opacity: busy === r.product_id ? 0.5 : 1 }}
                            disabled={!!busy} onClick={() => bijleveren(r)}>Bijgeleverd</button>
                        </span>
                      ) : (
                        <span style={{ fontSize: '12px', color: '#999' }}>Niets verkocht sinds levering</span>
                      )}
                      {r.track_stock && (
                        <div style={{ marginTop: '6px' }}>
                          <button style={{ background: 'none', border: 'none', padding: 0, color: '#9a9484', fontSize: '11px', textDecoration: 'underline', cursor: 'pointer' }}
                            disabled={!!busy} onClick={() => correctie(r)}>Geteld, corrigeren</button>
                          {' · '}
                          <button style={{ background: 'none', border: 'none', padding: 0, color: '#9a9484', fontSize: '11px', textDecoration: 'underline', cursor: 'pointer' }}
                            disabled={!!busy} onClick={() => instellenEen(r)}>Standaard wijzigen</button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              }))}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: '12px', color: '#999', marginTop: '12px', lineHeight: 1.6 }}>
          Je kunt maximaal bijleveren wat er volgens de kassa verkocht is. Zegt een bar dat het water op is terwijl de kassa nog flessen telt,
          dan is er water buiten de kassa om weggegeven. Breuk of een telfout pas je aan met &quot;Geteld, corrigeren&quot;; dat komt met reden in het logboek.
        </p>
      </div>
    </>
  )
}
