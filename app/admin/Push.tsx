'use client'
// Pushberichten naar de bezoekersapp: direct versturen of inplannen,
// doelgroep alle appgebruikers of kopers van een specifieke proeverij.
// Verzenden gebeurt server-side (edge function push-send); ingeplande
// berichten worden elke vijf minuten door de cron opgepakt.
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { AS } from './ui'

type Bericht = {
  id: string; titel: string; tekst: string; deeplink: string | null
  doelgroep: { type: string; ticket_type_id?: string; label?: string }
  status: 'concept' | 'gepland' | 'verzonden' | 'mislukt'
  gepland_op: string | null; verzonden_op: string | null
  resultaat: { doelgroep?: string; abonnees?: number; bezorgd?: number; mislukt?: number; fout?: string } | null
  created_at: string
}
type ProeverijOptie = { id: string; titel: string; ticket_type_id: string | null; dag: string }

const DEEPLINKS = [
  { value: '/', label: 'Home' },
  { value: '/programma', label: 'Programma (ticketkoop proeverijen)' },
  { value: '/food', label: 'Food en restaurant' },
  { value: '/wijnen', label: 'Wijnlijst' },
  { value: '/naar-huis', label: 'Naar huis (OV en taxi)' },
]

const STATUS_BADGE: Record<Bericht['status'], { bg: string; fg: string; label: string }> = {
  concept: { bg: '#eceff1', fg: '#546e7a', label: 'Concept' },
  gepland: { bg: '#fff3e0', fg: '#e65100', label: 'Gepland' },
  verzonden: { bg: '#e8f5e9', fg: '#2e7d32', label: 'Verzonden' },
  mislukt: { bg: '#fdecea', fg: '#b71c1c', label: 'Mislukt' },
}

export default function Push({ flash }: { flash: (m: string, ms?: number) => void }) {
  const [berichten, setBerichten] = useState<Bericht[]>([])
  const [proeverijen, setProeverijen] = useState<ProeverijOptie[]>([])
  const [abonnees, setAbonnees] = useState<number | null>(null)
  const [geladen, setGeladen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [vorm, setVorm] = useState({
    titel: '', tekst: '', deeplink: '/programma',
    doelgroep: 'alle', ticket_type_id: '',
    wanneer: 'nu' as 'nu' | 'plan', gepland_op: '',
  })

  const laad = async () => {
    const [b, p, s] = await Promise.all([
      supabase.from('push_berichten').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('proeverijen').select('id, titel, ticket_type_id, dag').eq('status', 'live').not('ticket_type_id', 'is', null),
      supabase.from('push_subscriptions').select('id', { count: 'exact', head: true }),
    ])
    setBerichten((b.data || []) as Bericht[])
    setProeverijen((p.data || []) as ProeverijOptie[])
    setAbonnees(s.count ?? 0)
    setGeladen(true)
  }
  useEffect(() => { laad() }, [])

  const verstuurViaFunctie = async (berichtId: string) => {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/push-send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token || ''}`,
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      },
      body: JSON.stringify({ bericht_id: berichtId }),
    })
    return res.json()
  }

  const opslaanEnVersturen = async () => {
    if (!vorm.titel.trim() || !vorm.tekst.trim()) { flash('Vul titel en tekst in.', 5000); return }
    if (vorm.doelgroep === 'proeverij' && !vorm.ticket_type_id) { flash('Kies een proeverij voor de doelgroep.', 5000); return }
    if (vorm.wanneer === 'plan' && !vorm.gepland_op) { flash('Kies een moment om te versturen.', 5000); return }

    const doelgroep = vorm.doelgroep === 'proeverij'
      ? { type: 'proeverij', ticket_type_id: vorm.ticket_type_id, label: proeverijen.find(p => p.ticket_type_id === vorm.ticket_type_id)?.titel }
      : { type: 'alle' }

    const direct = vorm.wanneer === 'nu'
    if (direct && !confirm(`Dit bericht NU versturen naar ${doelgroep.type === 'alle' ? `alle appgebruikers (${abonnees ?? '?'} toestellen)` : `kopers van "${doelgroep.label}"`}?`)) return

    setBusy(true)
    const { data: nieuw, error } = await supabase.from('push_berichten').insert({
      titel: vorm.titel.trim(), tekst: vorm.tekst.trim(), deeplink: vorm.deeplink || '/',
      doelgroep, status: direct ? 'concept' : 'gepland',
      gepland_op: direct ? null : new Date(vorm.gepland_op).toISOString(),
    }).select('id').single()
    if (error || !nieuw) { setBusy(false); flash('Opslaan mislukt: ' + (error?.message || ''), 6000); return }

    if (direct) {
      const uit = await verstuurViaFunctie(nieuw.id)
      setBusy(false)
      if (uit.ok) flash(`Verstuurd naar ${uit.bezorgd} van ${uit.abonnees} toestellen.`, 7000)
      else flash('Versturen mislukte: ' + (uit.detail || uit.error || 'onbekende fout'), 8000)
    } else {
      setBusy(false)
      flash('Ingepland. De cron verstuurt hem binnen vijf minuten na het gekozen moment.', 6000)
    }
    setVorm({ titel: '', tekst: '', deeplink: '/programma', doelgroep: 'alle', ticket_type_id: '', wanneer: 'nu', gepland_op: '' })
    await laad()
  }

  const annuleerGepland = async (b: Bericht) => {
    if (!confirm(`"${b.titel}" niet meer versturen?`)) return
    await supabase.from('push_berichten').delete().eq('id', b.id).eq('status', 'gepland')
    flash('Geannuleerd'); await laad()
  }

  const tijd = (iso: string | null) => iso ? new Date(iso).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''

  if (!geladen) return <div style={{ padding: '20px', color: '#888' }}>Pushberichten laden...</div>

  return (
    <>
      <div style={AS.title}>Pushberichten</div>
      <div style={AS.sub}>
        Stuur een melding naar de bezoekersapp. Handig voor restcapaciteit: kies de proeverij als doelgroep
        en link direct naar de ticketkoop. Er zijn nu {abonnees ?? 0} toestellen aangemeld voor meldingen.
      </div>

      <div style={AS.card}>
        <div style={AS.cardTitle}>Nieuw bericht</div>
        <div style={AS.grid2}>
          <div>
            <label style={AS.label}>Titel</label>
            <input style={AS.input} value={vorm.titel} maxLength={60} onChange={e => setVorm({ ...vorm, titel: e.target.value })}
              placeholder="bijv. Nog 8 plekken bij de port-masterclass" />
          </div>
          <div>
            <label style={AS.label}>Opent in de app op</label>
            <select style={AS.input} value={vorm.deeplink} onChange={e => setVorm({ ...vorm, deeplink: e.target.value })}>
              {DEEPLINKS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>
        </div>
        <label style={AS.label}>Tekst</label>
        <textarea style={{ ...AS.input, height: '60px', resize: 'vertical' }} value={vorm.tekst} maxLength={180}
          onChange={e => setVorm({ ...vorm, tekst: e.target.value })}
          placeholder="bijv. Om 21:00 begint de port-masterclass op de Mezzanine. Boek je plek in de app." />

        <div style={AS.grid2}>
          <div>
            <label style={AS.label}>Doelgroep</label>
            <select style={AS.input} value={vorm.doelgroep} onChange={e => setVorm({ ...vorm, doelgroep: e.target.value })}>
              <option value="alle">Alle appgebruikers</option>
              <option value="proeverij">Kopers van een specifieke proeverij</option>
            </select>
            {vorm.doelgroep === 'proeverij' && (
              <select style={{ ...AS.input, marginTop: '8px' }} value={vorm.ticket_type_id} onChange={e => setVorm({ ...vorm, ticket_type_id: e.target.value })}>
                <option value="">Kies proeverij...</option>
                {proeverijen.map(p => <option key={p.id} value={p.ticket_type_id!}>{p.titel}</option>)}
              </select>
            )}
          </div>
          <div>
            <label style={AS.label}>Wanneer</label>
            <select style={AS.input} value={vorm.wanneer} onChange={e => setVorm({ ...vorm, wanneer: e.target.value as 'nu' | 'plan' })}>
              <option value="nu">Nu versturen</option>
              <option value="plan">Inplannen</option>
            </select>
            {vorm.wanneer === 'plan' && (
              <input style={{ ...AS.input, marginTop: '8px' }} type="datetime-local" value={vorm.gepland_op}
                onChange={e => setVorm({ ...vorm, gepland_op: e.target.value })} />
            )}
          </div>
        </div>
        {vorm.doelgroep === 'proeverij' && (
          <div style={{ fontSize: '12px', color: '#888', marginTop: '10px' }}>
            Gericht sturen bereikt alleen kopers die in de app zijn ingelogd met hun ticket-mail en meldingen aan hebben.
          </div>
        )}
        <button style={AS.btn} onClick={opslaanEnVersturen} disabled={busy}>
          {busy ? 'Bezig...' : vorm.wanneer === 'nu' ? 'Verstuur nu' : 'Plan in'}
        </button>
      </div>

      <div style={AS.card}>
        <div style={AS.cardTitle}>Verzendlog</div>
        {berichten.length === 0 ? (
          <div style={{ color: '#888', fontSize: '13px' }}>Nog geen berichten verstuurd.</div>
        ) : (
          <table style={AS.table}>
            <thead><tr>{['Bericht', 'Doelgroep', 'Status', 'Moment', 'Resultaat', ''].map(h => <th key={h} style={AS.th}>{h}</th>)}</tr></thead>
            <tbody>
              {berichten.map(b => {
                const badge = STATUS_BADGE[b.status]
                return (
                  <tr key={b.id}>
                    <td style={AS.td}><strong>{b.titel}</strong><div style={{ fontSize: '11px', color: '#888' }}>{b.tekst.slice(0, 60)}{b.tekst.length > 60 ? '...' : ''}</div></td>
                    <td style={{ ...AS.td, fontSize: '12px' }}>{b.doelgroep?.type === 'proeverij' ? (b.doelgroep.label || 'proeverij') : 'Alle appgebruikers'}</td>
                    <td style={AS.td}><span style={{ display: 'inline-block', padding: '2px 8px', fontSize: '10px', fontWeight: 700, borderRadius: '2px', background: badge.bg, color: badge.fg }}>{badge.label}</span></td>
                    <td style={{ ...AS.td, fontSize: '12px' }}>{b.status === 'gepland' ? tijd(b.gepland_op) : tijd(b.verzonden_op || b.created_at)}</td>
                    <td style={{ ...AS.td, fontSize: '12px' }}>
                      {b.resultaat?.bezorgd != null ? `${b.resultaat.bezorgd}/${b.resultaat.abonnees} bezorgd` : b.resultaat?.fout ? 'fout' : '-'}
                    </td>
                    <td style={AS.td}>
                      {b.status === 'gepland' && <button style={AS.btnSm} onClick={() => annuleerGepland(b)}>Annuleer</button>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
