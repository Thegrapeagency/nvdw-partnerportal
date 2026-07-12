'use client'
// Marketing & attributie: verkopen per kanaal, ad-uitgaven en kosten per
// ticket, plus een UTM-linkbouwer zodat het team consistente campagnelinks
// maakt. Kanaalindeling gebeurt in de database (nvdw_kanaal), first-touch en
// last-touch staan op elke order.
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { AS, euro } from './ui'

type Rij = { dag: string; kanaal: string; bestellingen: number; tickets: number; omzet_cents: number }
type Spend = { id: string; kanaal: string; campagne: string; periode_start: string; periode_eind: string; bedrag_cents: number; notitie: string | null }

const KANAAL_LABEL: Record<string, string> = {
  meta_ads: 'Meta ads', nieuwsbrief: 'Nieuwsbrief', organic_social: 'Organic social',
  direct: 'Direct', organic_zoeken: 'Organisch zoeken', verwijzing: 'Verwijzing',
  overig: 'Overig (utm)', overig_betaald: 'Overig betaald',
}

const PERIODES = [
  { key: '7', label: 'Laatste 7 dagen' },
  { key: '30', label: 'Laatste 30 dagen' },
  { key: '90', label: 'Laatste 90 dagen' },
  { key: 'alles', label: 'Alles' },
]

export default function Attributie({ flash }: { flash: (m: string, ms?: number) => void }) {
  const [rijen, setRijen] = useState<Rij[]>([])
  const [spend, setSpend] = useState<Spend[]>([])
  const [periode, setPeriode] = useState('30')
  const [geladen, setGeladen] = useState(false)
  const [nieuwSpend, setNieuwSpend] = useState({ kanaal: 'meta_ads', campagne: '', start: '', eind: '', bedrag: '' })
  // UTM-bouwer
  const [utm, setUtm] = useState({ pad: '/', source: 'instagram', medium: 'organic_social', campaign: '' })

  const laad = async () => {
    const [a, s] = await Promise.all([
      supabase.from('attributie_per_dag').select('*'),
      supabase.from('ad_spend').select('*').order('periode_start', { ascending: false }),
    ])
    setRijen((a.data || []) as Rij[])
    setSpend((s.data || []) as Spend[])
    setGeladen(true)
  }
  useEffect(() => { laad() }, [])

  const vanaf = useMemo(() => {
    if (periode === 'alles') return null
    const d = new Date()
    d.setDate(d.getDate() - parseInt(periode))
    return d.toISOString().slice(0, 10)
  }, [periode])

  const perKanaal = useMemo(() => {
    const map = new Map<string, { bestellingen: number; tickets: number; omzet: number }>()
    for (const r of rijen) {
      if (vanaf && r.dag < vanaf) continue
      const cur = map.get(r.kanaal) || { bestellingen: 0, tickets: 0, omzet: 0 }
      cur.bestellingen += r.bestellingen; cur.tickets += r.tickets; cur.omzet += Number(r.omzet_cents)
      map.set(r.kanaal, cur)
    }
    return [...map.entries()].sort((a, b) => b[1].omzet - a[1].omzet)
  }, [rijen, vanaf])

  const totaal = useMemo(() => perKanaal.reduce((s, [, v]) => ({
    bestellingen: s.bestellingen + v.bestellingen, tickets: s.tickets + v.tickets, omzet: s.omzet + v.omzet,
  }), { bestellingen: 0, tickets: 0, omzet: 0 }), [perKanaal])

  // ad-uitgaven binnen de periode meetellen voor kosten per ticket
  const spendPerKanaal = useMemo(() => {
    const map = new Map<string, number>()
    for (const s of spend) {
      if (vanaf && s.periode_eind < vanaf) continue
      map.set(s.kanaal, (map.get(s.kanaal) || 0) + s.bedrag_cents)
    }
    return map
  }, [spend, vanaf])

  const voegSpendToe = async () => {
    if (!nieuwSpend.campagne.trim() || !nieuwSpend.start || !nieuwSpend.eind || !nieuwSpend.bedrag) {
      flash('Vul campagne, periode en bedrag in.', 5000); return
    }
    const { error } = await supabase.from('ad_spend').insert({
      kanaal: nieuwSpend.kanaal, campagne: nieuwSpend.campagne.trim(),
      periode_start: nieuwSpend.start, periode_eind: nieuwSpend.eind,
      bedrag_cents: Math.round(parseFloat(nieuwSpend.bedrag.replace(',', '.')) * 100),
    })
    if (error) { flash('Opslaan mislukt: ' + error.message, 6000); return }
    setNieuwSpend({ kanaal: 'meta_ads', campagne: '', start: '', eind: '', bedrag: '' })
    flash('Uitgave toegevoegd'); await laad()
  }

  const verwijderSpend = async (id: string) => {
    if (!confirm('Deze uitgave verwijderen?')) return
    await supabase.from('ad_spend').delete().eq('id', id)
    await laad()
  }

  const utmLink = useMemo(() => {
    const basis = 'https://nachtvandewijn.nl' + (utm.pad.startsWith('/') ? utm.pad : '/' + utm.pad)
    const p = new URLSearchParams()
    if (utm.source) p.set('utm_source', utm.source.toLowerCase().replace(/\s+/g, '_'))
    if (utm.medium) p.set('utm_medium', utm.medium.toLowerCase().replace(/\s+/g, '_'))
    if (utm.campaign) p.set('utm_campaign', utm.campaign.toLowerCase().replace(/\s+/g, '_'))
    return basis + (p.toString() ? '?' + p.toString() : '')
  }, [utm])

  if (!geladen) return <div style={{ padding: '20px', color: '#888' }}>Attributie laden...</div>

  return (
    <>
      <div style={AS.title}>Marketing &amp; attributie</div>
      <div style={AS.sub}>
        Waar kopers vandaan komen. Elke bestelling krijgt automatisch zijn herkomst mee (first-touch en last-touch);
        de indeling per kanaal gebeurt op basis van de laatste bron voor aankoop.
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        {PERIODES.map(p => (
          <button key={p.key} onClick={() => setPeriode(p.key)}
            style={{ ...AS.btnSm, ...(periode === p.key ? { background: 'var(--navy)', color: 'var(--cream)', borderColor: 'var(--navy)' } : { color: '#666', borderColor: '#ccc' }) }}>
            {p.label}
          </button>
        ))}
      </div>

      <div style={AS.card}>
        <div style={AS.cardTitle}>Verkopen per kanaal</div>
        {perKanaal.length === 0 ? (
          <div style={{ color: '#888', fontSize: '13px' }}>
            Nog geen betaalde bestellingen in deze periode. Zodra er verkocht wordt, zie je hier de verdeling per kanaal.
          </div>
        ) : (
          <table style={AS.table}>
            <thead><tr>{['Kanaal', 'Bestellingen', 'Tickets', 'Omzet', 'Uitgegeven', 'Kosten per ticket'].map(h => <th key={h} style={AS.th}>{h}</th>)}</tr></thead>
            <tbody>
              {perKanaal.map(([kanaal, v]) => {
                const uit = spendPerKanaal.get(kanaal) || 0
                return (
                  <tr key={kanaal}>
                    <td style={{ ...AS.td, fontWeight: 600 }}>{KANAAL_LABEL[kanaal] || kanaal}</td>
                    <td style={AS.td}>{v.bestellingen}</td>
                    <td style={AS.td}>{v.tickets}</td>
                    <td style={AS.td}>{euro(v.omzet)}</td>
                    <td style={AS.td}>{uit ? euro(uit) : '-'}</td>
                    <td style={AS.td}>{uit && v.tickets ? euro(Math.round(uit / v.tickets)) : '-'}</td>
                  </tr>
                )
              })}
              <tr>
                <td style={{ ...AS.td, fontWeight: 700 }}>Totaal</td>
                <td style={{ ...AS.td, fontWeight: 700 }}>{totaal.bestellingen}</td>
                <td style={{ ...AS.td, fontWeight: 700 }}>{totaal.tickets}</td>
                <td style={{ ...AS.td, fontWeight: 700 }}>{euro(totaal.omzet)}</td>
                <td style={AS.td} colSpan={2}></td>
              </tr>
            </tbody>
          </table>
        )}
        <div style={{ fontSize: '11px', color: '#999', marginTop: '10px' }}>
          Bestellingen van voor 12 juli 2026 hebben geen herkomst en tellen als direct.
        </div>
      </div>

      <div style={AS.card}>
        <div style={AS.cardTitle}>UTM-linkbouwer</div>
        <div style={{ fontSize: '13px', color: '#666', marginBottom: '4px' }}>
          Gebruik altijd deze bouwer voor campagnelinks, dan blijven de kanalen kloppen.
        </div>
        <div style={AS.grid2}>
          <div>
            <label style={AS.label}>Pagina</label>
            <select style={AS.input} value={utm.pad} onChange={e => setUtm({ ...utm, pad: e.target.value })}>
              <option value="/">Home (ticketshop)</option>
              <option value="/programma">Programma</option>
              <option value="/proeverijen">Proeverijen</option>
              <option value="/restaurant">Restaurant</option>
              <option value="/wijnhuizen">Wijnhuizen</option>
            </select>
          </div>
          <div>
            <label style={AS.label}>Bron (utm_source)</label>
            <select style={AS.input} value={utm.source} onChange={e => setUtm({ ...utm, source: e.target.value })}>
              <option value="instagram">instagram</option>
              <option value="facebook">facebook</option>
              <option value="meta">meta (advertenties)</option>
              <option value="nieuwsbrief">nieuwsbrief</option>
              <option value="tiktok">tiktok</option>
              <option value="partner">partner</option>
            </select>
          </div>
          <div>
            <label style={AS.label}>Medium (utm_medium)</label>
            <select style={AS.input} value={utm.medium} onChange={e => setUtm({ ...utm, medium: e.target.value })}>
              <option value="organic_social">organic_social (gewone post of story)</option>
              <option value="cpc">cpc (betaalde advertentie)</option>
              <option value="email">email (nieuwsbrief)</option>
              <option value="qr">qr (drukwerk)</option>
              <option value="referral">referral (partnersite)</option>
            </select>
          </div>
          <div>
            <label style={AS.label}>Campagne (utm_campaign)</label>
            <input style={AS.input} value={utm.campaign} onChange={e => setUtm({ ...utm, campaign: e.target.value })} placeholder="bijv. early_bird_september" />
          </div>
        </div>
        <div style={{ marginTop: '14px', padding: '12px', background: '#f7f4ec', borderRadius: '8px', fontFamily: 'monospace', fontSize: '12px', wordBreak: 'break-all', color: 'var(--navy)' }}>
          {utmLink}
        </div>
        <button style={{ ...AS.btnSm, marginTop: '10px' }} onClick={() => { navigator.clipboard.writeText(utmLink); flash('Link gekopieerd') }}>
          Kopieer link
        </button>
      </div>

      <div style={AS.card}>
        <div style={AS.cardTitle}>Ad-uitgaven (handmatige invoer)</div>
        <div style={AS.grid3}>
          <div>
            <label style={AS.label}>Kanaal</label>
            <select style={AS.input} value={nieuwSpend.kanaal} onChange={e => setNieuwSpend({ ...nieuwSpend, kanaal: e.target.value })}>
              <option value="meta_ads">Meta ads</option>
              <option value="overig_betaald">Overig betaald</option>
            </select>
          </div>
          <div>
            <label style={AS.label}>Campagne</label>
            <input style={AS.input} value={nieuwSpend.campagne} onChange={e => setNieuwSpend({ ...nieuwSpend, campagne: e.target.value })} placeholder="bijv. early_bird_september" />
          </div>
          <div>
            <label style={AS.label}>Bedrag (€)</label>
            <input style={AS.input} type="number" step="0.01" value={nieuwSpend.bedrag} onChange={e => setNieuwSpend({ ...nieuwSpend, bedrag: e.target.value })} placeholder="250,00" />
          </div>
          <div>
            <label style={AS.label}>Periode van</label>
            <input style={AS.input} type="date" value={nieuwSpend.start} onChange={e => setNieuwSpend({ ...nieuwSpend, start: e.target.value })} />
          </div>
          <div>
            <label style={AS.label}>Periode tot en met</label>
            <input style={AS.input} type="date" value={nieuwSpend.eind} onChange={e => setNieuwSpend({ ...nieuwSpend, eind: e.target.value })} />
          </div>
        </div>
        <button style={AS.btn} onClick={voegSpendToe}>Uitgave toevoegen</button>

        {spend.length > 0 && (
          <table style={{ ...AS.table, marginTop: '18px' }}>
            <thead><tr>{['Kanaal', 'Campagne', 'Periode', 'Bedrag', ''].map(h => <th key={h} style={AS.th}>{h}</th>)}</tr></thead>
            <tbody>
              {spend.map(s => (
                <tr key={s.id}>
                  <td style={AS.td}>{KANAAL_LABEL[s.kanaal] || s.kanaal}</td>
                  <td style={AS.td}>{s.campagne}</td>
                  <td style={{ ...AS.td, fontSize: '12px' }}>{s.periode_start} t/m {s.periode_eind}</td>
                  <td style={AS.td}>{euro(s.bedrag_cents)}</td>
                  <td style={AS.td}><button style={AS.btnSm} onClick={() => verwijderSpend(s.id)}>Verwijder</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={AS.card}>
        <div style={AS.cardTitle}>Meta Conversions API</div>
        <div style={{ fontSize: '13px', color: '#666', lineHeight: 1.6 }}>
          Bij elke betaalde bestelling stuurt de server automatisch een Purchase-event naar Meta
          (met event-deduplicatie via het order-id, dus de pixel dubbeltelt niet).
          Hiervoor moet eenmalig een CAPI-token worden ingesteld: Meta Events Manager, pixel-instellingen,
          Conversions API, token genereren, en die als <code>META_CAPI_TOKEN</code> in app_config zetten.
          Zonder token werkt alles gewoon door, alleen zonder server-side events.
        </div>
      </div>
    </>
  )
}
