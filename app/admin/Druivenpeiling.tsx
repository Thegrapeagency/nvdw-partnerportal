'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { AS } from './ui'

type Option = { id: string; slug: string; name: string; subtitle: string | null; accent: string; active: boolean; position: number; votes: number }
type Poll = { id: string; slug: string; title: string; year: number; status: 'draft' | 'open' | 'closed'; starts_at: string | null; ends_at: string | null; discount_code: string; votes: number; options: Option[] }
type DailyVote = { date: string; votes: number }
type Winner = { year: number; grape_name: string; note: string | null }
type PollDashboard = { polls: Poll[]; daily_votes: DailyVote[]; winners: Winner[] }

const statusLabel: Record<Poll['status'], string> = { draft: 'Concept', open: 'Open', closed: 'Gesloten' }

export default function Druivenpeiling({ flash }: { flash: (message: string, ms?: number) => void }) {
  const [data, setData] = useState<PollDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const laad = async () => {
    setLoading(true)
    const { data: result, error } = await supabase.rpc('grape_poll_dashboard')
    if (error) flash('De druivenpeiling kon niet worden geladen: ' + error.message, 7000)
    else setData(result as PollDashboard)
    setLoading(false)
  }
  useEffect(() => { laad() }, [])

  const current = useMemo(() => data?.polls.find(p => p.year === 2026) || data?.polls[0] || null, [data])
  const ranking = useMemo(() => current ? [...current.options].sort((a, b) => b.votes - a.votes) : [], [current])
  const leader = ranking[0]
  const maxDaily = Math.max(1, ...(data?.daily_votes || []).map(d => d.votes))

  const setStatus = async (status: Poll['status']) => {
    if (!current || status === current.status) return
    const action = status === 'closed' ? 'sluiten' : status === 'open' ? 'openen' : 'terugzetten naar concept'
    if (!confirm(`Stemming ${action}?`)) return
    setSaving(true)
    const { error } = await supabase.from('grape_polls').update({ status, updated_at: new Date().toISOString() }).eq('id', current.id)
    setSaving(false)
    if (error) { flash('Opslaan mislukt: ' + error.message, 7000); return }
    flash(status === 'open' ? 'De stemming staat open.' : status === 'closed' ? 'De stemming is gesloten.' : 'De stemming staat als concept.', 5000)
    await laad()
  }

  const fmt = (iso: string | null) => iso ? new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso)) : 'geen einddatum'

  if (loading) return <div style={{ padding: '20px', color: '#888' }}>Druivenpeiling laden...</div>
  if (!current) return <div style={AS.card}>Er is nog geen druivenpeiling aangemaakt.</div>

  return <>
    <div style={AS.title}>Populairste druif</div>
    <div style={AS.sub}>Live overzicht van de stemactie, zonder e-mailadressen of individuele stemmen te tonen.</div>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '12px', marginBottom: '20px' }}>
      {[
        { label: 'Stemmen', value: current.votes, sub: 'unieke e-mailadressen' },
        { label: 'Koploper', value: leader?.name || '–', sub: leader ? `${leader.votes} stemmen` : 'nog geen stemmen' },
        { label: 'Korting', value: '€2,50', sub: current.discount_code },
        { label: 'Status', value: statusLabel[current.status], sub: `t/m ${fmt(current.ends_at)}` },
      ].map(kpi => <div key={kpi.label} style={{ ...AS.card, marginBottom: 0, padding: '18px 20px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#999', marginBottom: '7px' }}>{kpi.label}</div>
        <div style={{ fontSize: kpi.label === 'Koploper' ? '20px' : '28px', lineHeight: 1.05, fontWeight: 800, color: 'var(--navy)', overflowWrap: 'anywhere' }}>{kpi.value}</div>
        <div style={{ fontSize: '11px', color: '#888', marginTop: '7px', fontFamily: kpi.label === 'Korting' ? 'monospace' : undefined }}>{kpi.sub}</div>
      </div>)}
    </div>

    <div style={{ ...AS.card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
      <div><div style={AS.cardTitle}>Stemronde {current.year}</div><div style={{ fontSize: '13px', color: '#666' }}>De website toont alleen actieve kandidaten. Sluit de stemming zodra jullie de uitslag gaan vaststellen.</div></div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button style={AS.btnSm} onClick={laad}>Ververs cijfers</button>
        {current.status !== 'open' && <button style={AS.btnSm} disabled={saving} onClick={() => setStatus('open')}>Open stemming</button>}
        {current.status === 'open' && <button style={AS.btnSm} disabled={saving} onClick={() => setStatus('closed')}>Sluit stemming</button>}
      </div>
    </div>

    <div style={AS.card}>
      <div style={AS.cardTitle}>Tussenstand</div>
      <div style={{ display: 'grid', gap: '10px' }}>
        {ranking.map((option, index) => {
          const share = current.votes ? Math.round(option.votes / current.votes * 100) : 0
          return <div key={option.id} style={{ display: 'grid', gridTemplateColumns: '30px minmax(130px, 180px) minmax(0, 1fr) 82px', alignItems: 'center', gap: '10px' }}>
            <span style={{ color: '#999', fontWeight: 700, fontSize: '12px' }}>{index + 1}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700 }}><i style={{ width: '12px', height: '12px', borderRadius: '50%', display: 'inline-block', background: option.accent }} />{option.name}</span>
            <div style={{ height: '10px', background: '#eee9dc', borderRadius: '999px', overflow: 'hidden' }}><div style={{ width: `${share}%`, minWidth: option.votes ? '4px' : 0, height: '100%', background: option.accent, borderRadius: 'inherit', transition: 'width .3s ease' }} /></div>
            <span style={{ textAlign: 'right', fontSize: '12px', color: '#666' }}><strong style={{ color: 'var(--navy)' }}>{option.votes}</strong> · {share}%</span>
          </div>
        })}
      </div>
    </div>

    <div style={{ ...AS.card, overflow: 'hidden' }}>
      <div style={AS.cardTitle}>Nieuwe stemmen, laatste 30 dagen</div>
      {data?.daily_votes.length ? <div style={{ height: '130px', display: 'flex', gap: '5px', alignItems: 'end', paddingTop: '12px', borderBottom: '1px solid #eee9dc' }}>
        {data.daily_votes.map(day => <div key={day.date} title={`${new Date(day.date).toLocaleDateString('nl-NL')}: ${day.votes} stemmen`} style={{ flex: 1, minWidth: '5px', height: `${Math.max(5, day.votes / maxDaily * 100)}%`, background: 'var(--bordeaux)', borderRadius: '4px 4px 0 0' }} />)}
      </div> : <p style={{ color: '#888', fontSize: '13px', margin: 0 }}>Zodra de eerste stemmen binnenkomen verschijnt hier het verloop.</p>}
    </div>

    <div style={AS.card}>
      <div style={AS.cardTitle}>Erelijst</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: '8px' }}>
        {(data?.winners || []).map(winner => <div key={winner.year} style={{ padding: '13px', borderRadius: '10px', background: '#f8f3e7' }}>
          <div style={{ color: 'var(--bordeaux)', fontSize: '11px', fontWeight: 800, letterSpacing: '1px' }}>{winner.year}</div>
          <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: '17px', fontWeight: 700, lineHeight: 1.05, marginTop: '5px' }}>{winner.grape_name}</div>
        </div>)}
      </div>
    </div>
  </>
}
