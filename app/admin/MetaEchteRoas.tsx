'use client'
// Echte ROAS: rekent met de bedragen uit de eigen kaartverkoop in plaats van
// met de aankoopwaarde die Meta rapporteert. Sinds 12 okt 2026 komt die waarde
// deels in centen binnen (via de Meta-gehoste "Conversions API met Meta"),
// waardoor de ROAS in Ads Manager tientallen keren te hoog is. Het aantal
// aankopen dat Meta telt klopt wel, dus: aankopen x gemiddelde echte orderwaarde.
//
// Data: public.meta_ads_echte_roas(p_dagen), gevuld door pg_cron
// (nvdw-meta-dag-aanvragen elk uur, nvdw-meta-dag-verwerken elke 10 minuten).
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { AS } from './ui'

type Dag = {
  dag: string
  spend: number
  purchases: number
  value_meta: number
  gem_orderwaarde: number | null
  value_echt: number | null
  roas_meta: number | null
  roas_echt: number | null
  omzet_kassa_meta: number
  roas_kassa: number | null
  spend_7872: number
  purchases_7872: number
  spend_1869: number
  purchases_1869: number
}

const eur = (n: number | null | undefined) =>
  n == null ? '–' : '€' + Number(n).toLocaleString('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
const roas = (n: number | null | undefined) =>
  n == null ? '–' : Number(n).toFixed(2).replace('.', ',')
const dagLabel = (d: string) =>
  new Date(d + 'T12:00:00').toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })

// Kleur volgens de ROAS-vloer van 1,5 uit het marketingadvies.
const kleur = (n: number | null | undefined) =>
  n == null ? '#777162' : n >= 1.5 ? '#2f6b3d' : n >= 1 ? '#8a6100' : 'var(--bordeaux)'

export default function MetaEchteRoas() {
  const [dagen, setDagen] = useState(14)
  const [rijen, setRijen] = useState<Dag[] | null>(null)
  const [fout, setFout] = useState<string | null>(null)

  useEffect(() => {
    let weg = false
    setRijen(null)
    setFout(null)
    supabase.rpc('meta_ads_echte_roas', { p_dagen: dagen }).then(({ data, error }) => {
      if (weg) return
      if (error) setFout(error.message)
      else setRijen((data ?? []) as Dag[])
    })
    return () => { weg = true }
  }, [dagen])

  const tot = (rijen ?? []).reduce((s, r) => ({
    spend: s.spend + Number(r.spend),
    purchases: s.purchases + r.purchases,
    value_meta: s.value_meta + Number(r.value_meta),
    kassa: s.kassa + Number(r.omzet_kassa_meta),
  }), { spend: 0, purchases: 0, value_meta: 0, kassa: 0 })
  const gem = rijen?.[0]?.gem_orderwaarde ?? null
  const roasEcht = tot.spend > 0 && gem != null ? (tot.purchases * gem) / tot.spend : null
  const roasMeta = tot.spend > 0 ? tot.value_meta / tot.spend : null
  const roasKassa = tot.spend > 0 ? tot.kassa / tot.spend : null

  const tegel = (label: string, waarde: string, toelichting: string, k?: string) => (
    <div>
      <div style={{ fontSize: '11px', color: '#9a9484' }}>{label}</div>
      <div style={{ fontSize: '24px', fontFamily: 'Fraunces, serif', color: k ?? 'var(--navy)' }}>{waarde}</div>
      <div style={{ fontSize: '11px', color: '#9a9484', marginTop: '2px' }}>{toelichting}</div>
    </div>
  )

  return (
    <div>
      <div style={AS.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '8px' }}>
          <div style={AS.cardTitle}>ROAS met echte bedragen, beide advertentieaccounts samen</div>
          <div style={{ display: 'flex', gap: '6px' }}>
            {[7, 14, 30].map(n => (
              <button key={n} onClick={() => setDagen(n)} style={{
                ...AS.btnSm, marginTop: 0,
                background: dagen === n ? 'var(--navy)' : 'transparent',
                color: dagen === n ? 'var(--cream)' : 'var(--navy)',
                border: '1px solid rgba(1,3,65,0.15)',
              }}>{n} dagen</button>
            ))}
          </div>
        </div>
        <p style={{ fontSize: '13px', lineHeight: 1.6, margin: '0 0 16px', color: '#5c5747' }}>
          Meta krijgt sinds 12 oktober een deel van de aankopen binnen met het bedrag in centen, waardoor de ROAS in Ads Manager
          niet meer klopt. Het aantal aankopen dat Meta telt is wel betrouwbaar. Hier rekenen we die aankopen om met de
          gemiddelde echte bestelwaarde uit de kaartverkoop{gem != null ? ` (nu ${eur(gem)})` : ''}. De ROAS-vloer is 1,5.
        </p>
        {fout && <p style={{ fontSize: '13px', color: 'var(--bordeaux)' }}>Laden mislukt: {fout}</p>}
        {!rijen && !fout && <p style={{ fontSize: '13px', color: '#8b8574' }}>Laden…</p>}
        {rijen && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px' }}>
            {tegel('Uitgaven', eur(tot.spend), `${dagen} dagen, beide accounts`)}
            {tegel('Aankopen (Meta)', String(tot.purchases), 'klikken en weergaven')}
            {tegel('ROAS echt', roas(roasEcht), 'aankopen x echte orderwaarde', kleur(roasEcht))}
            {tegel('ROAS eigen kassa', roas(roasKassa), 'alleen kopers via een klik op een ad', kleur(roasKassa))}
            {tegel('ROAS volgens Meta', roas(roasMeta), 'vervuild, niet op sturen', '#9a9484')}
          </div>
        )}
      </div>

      {rijen && rijen.length > 0 && (
        <div style={AS.card}>
          <div style={AS.cardTitle}>Per dag</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={AS.table}>
              <thead><tr>
                <th style={AS.th}>Dag</th><th style={AS.th}>Uitgaven</th><th style={AS.th}>Aankopen</th>
                <th style={AS.th}>ROAS echt</th><th style={AS.th}>ROAS kassa</th><th style={AS.th}>ROAS Meta</th>
                <th style={AS.th}>7872</th><th style={AS.th}>1869</th>
              </tr></thead>
              <tbody>
                {rijen.map(r => (
                  <tr key={r.dag}>
                    <td style={AS.td}>{dagLabel(r.dag)}</td>
                    <td style={AS.td}>{eur(r.spend)}</td>
                    <td style={AS.td}>{r.purchases}</td>
                    <td style={{ ...AS.td, color: kleur(r.roas_echt), fontWeight: 600 }}>{roas(r.roas_echt)}</td>
                    <td style={{ ...AS.td, color: kleur(r.roas_kassa) }}>{roas(r.roas_kassa)}</td>
                    <td style={{ ...AS.td, color: '#9a9484' }}>{roas(r.roas_meta)}</td>
                    <td style={{ ...AS.td, fontSize: '12px', color: '#5c5747' }}>{eur(r.spend_7872)} · {r.purchases_7872}</td>
                    <td style={{ ...AS.td, fontSize: '12px', color: '#5c5747' }}>{eur(r.spend_1869)} · {r.purchases_1869}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: '11.5px', color: '#9a9484', marginTop: '10px', lineHeight: 1.5 }}>
            ROAS kassa telt alleen bestellingen waarbij de koper via een klik op een Meta-advertentie binnenkwam, dus die ligt lager dan de werkelijkheid.
            ROAS echt telt ook kopers die een advertentie zagen en later kochten, dus die ligt eerder iets hoger. De waarheid ligt ertussen.
            Cijfers worden elk uur ververst.
          </p>
        </div>
      )}
    </div>
  )
}
