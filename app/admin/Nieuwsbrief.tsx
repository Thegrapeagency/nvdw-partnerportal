'use client'
// Nieuwsbrief: verplaatst vanuit het ticketdashboard naar het organisatieportal
// zodat je nergens anders meer hoeft in te loggen. Toont abonneecijfers en de
// verzendhistorie (opens/clicks/afmeldingen). Nieuwsbrieven samenstellen en
// versturen gebeurt via de /nieuwsbrief-skill in Claude Code; dat blijft zo.
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { AS } from './ui'

const NL_API = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/newsletter`

type Count = { total: number; active: number; unsubscribed: number; bounced: number; nog_te_versturen: number }
type Broadcast = {
  id: string; subject: string; preheader: string | null; status: string
  audience_size: number; sent_at: string | null; scheduled_at: string | null; created_at: string
  stats: { sent?: number } | null; opened: number; clicked: number; unsubscribed: number
}

const STATUS_KLEUR: Record<string, { bg: string; fg: string }> = {
  sent: { bg: '#e8f5e9', fg: '#2e7d32' },
  sending: { bg: '#fff3e0', fg: '#e65100' },
  failed: { bg: '#fdecea', fg: '#b71c1c' },
  draft: { bg: '#eceff1', fg: '#546e7a' },
  scheduled: { bg: '#e3e8fc', fg: '#33357e' },
}

export default function Nieuwsbrief({ flash }: { flash: (m: string, ms?: number) => void }) {
  const [count, setCount] = useState<Count | null>(null)
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([])
  const [geladen, setGeladen] = useState(false)
  const [syncBusy, setSyncBusy] = useState(false)

  const authHeader = async (): Promise<string | null> => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ? `Bearer ${session.access_token}` : null
  }

  const laad = async () => {
    const auth = await authHeader()
    if (!auth) { setGeladen(true); return }
    const headers = { Authorization: auth, apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '' }
    const [c, b] = await Promise.all([
      fetch(`${NL_API}/count`, { headers }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${NL_API}/broadcasts`, { headers }).then(r => r.ok ? r.json() : null).catch(() => null),
    ])
    if (c) setCount(c)
    if (b) setBroadcasts(b.broadcasts || [])
    setGeladen(true)
  }
  useEffect(() => { laad() }, [])

  const schrijfKopersBij = async () => {
    const auth = await authHeader()
    if (!auth) { flash('Log opnieuw in.', 6000); return }
    setSyncBusy(true)
    try {
      const res = await fetch(`${NL_API}/sync`, { method: 'POST', headers: { Authorization: auth, apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '' } })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { flash('Bijschrijven mislukt.', 7000); return }
      flash(`Klaar. ${j.buyers} kopers gecheckt, ${j.total} abonnees totaal.`, 7000)
      await laad()
    } catch {
      flash('Bijschrijven mislukte: geen verbinding.', 7000)
    } finally {
      setSyncBusy(false)
    }
  }

  const dt = (iso: string | null) => iso ? new Date(iso).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-'

  if (!geladen) return <div style={{ padding: '20px', color: '#888' }}>Nieuwsbrief laden...</div>

  return (
    <>
      <div style={AS.title}>Nieuwsbrief</div>
      <div style={AS.sub}>
        Abonneecijfers en verzendhistorie. Een nieuwsbrief samenstellen en versturen doe je via de /nieuwsbrief-opdracht in Claude Code; hier volg je het resultaat.
      </div>

      {count && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
          {[
            { label: 'Actieve abonnees', val: count.active },
            { label: 'Nog te versturen', val: count.nog_te_versturen },
            { label: 'Afgemeld', val: count.unsubscribed },
            { label: 'Bounced', val: count.bounced },
          ].map(s => (
            <div key={s.label} style={{ ...AS.card, marginBottom: 0, padding: '18px 20px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#999', marginBottom: '6px' }}>{s.label}</div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--navy)' }}>{s.val}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ ...AS.card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <div style={AS.cardTitle}>Beheer</div>
          <div style={{ fontSize: '13px', color: '#666' }}>Nieuwe ticketkopers bijschrijven als abonnee, of het volledige archief bekijken (met de admin-sleutel).</div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button style={AS.btnSm} onClick={schrijfKopersBij} disabled={syncBusy}>{syncBusy ? 'Bezig...' : 'Nieuwe kopers bijschrijven'}</button>
          <a href={`${NL_API}/archief`} target="_blank" rel="noreferrer" style={{ ...AS.btnSm, textDecoration: 'none', display: 'inline-block' }}>Volledig archief</a>
        </div>
      </div>

      <div style={AS.card}>
        <div style={AS.cardTitle}>Verstuurde nieuwsbrieven ({broadcasts.length})</div>
        {broadcasts.length === 0 ? (
          <div style={{ color: '#888', fontSize: '14px' }}>Nog geen nieuwsbrieven verstuurd.</div>
        ) : (
          <table style={AS.table}>
            <thead><tr>{['Onderwerp', 'Status', 'Verzonden', 'Ontvangers', 'Opens', 'Clicks', 'Afgemeld'].map(h => <th key={h} style={AS.th}>{h}</th>)}</tr></thead>
            <tbody>
              {broadcasts.map(b => {
                const kleur = STATUS_KLEUR[b.status] || STATUS_KLEUR.draft
                const ontvangers = b.stats?.sent ?? b.audience_size ?? 0
                return (
                  <tr key={b.id}>
                    <td style={AS.td}>
                      <strong>{b.subject}</strong>
                      {b.preheader && <div style={{ fontSize: '11px', color: '#999' }}>{b.preheader}</div>}
                    </td>
                    <td style={AS.td}><span style={{ display: 'inline-block', padding: '2px 8px', fontSize: '10px', fontWeight: 700, borderRadius: '2px', background: kleur.bg, color: kleur.fg }}>{b.status}</span></td>
                    <td style={AS.td}>{dt(b.sent_at || b.scheduled_at || b.created_at)}</td>
                    <td style={AS.td}>{ontvangers}</td>
                    <td style={AS.td}>{b.opened}</td>
                    <td style={AS.td}>{b.clicked}</td>
                    <td style={AS.td}>{b.unsubscribed}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        <p style={{ fontSize: '11px', color: '#999', marginTop: '12px' }}>
          Opens en clicks worden gemeten zodra Resend-tracking en de webhook actief zijn. Uitschrijvingen werken altijd. Opens zijn door Apple Mail onbetrouwbaar; clicks zijn het echte signaal.
        </p>
      </div>
    </>
  )
}
