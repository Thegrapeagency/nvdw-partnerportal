'use client'
// Overleg: agenda, notulen en losse noties, live bij te werken. Eén chronologische
// feed per type, simpel toe te voegen zonder opmaak-gedoe.
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { AS } from './ui'

type Type = 'agenda' | 'notulen' | 'notitie'
type Item = { id: string; type: Type; titel: string | null; inhoud: string; auteur: string | null; datum: string | null; created_at: string }

const TYPE_LABEL: Record<Type, string> = { agenda: 'Agenda', notulen: 'Notulen', notitie: 'Losse noties' }
const TYPES: Type[] = ['agenda', 'notulen', 'notitie']

export default function Overleg({ flash }: { flash: (m: string, ms?: number) => void }) {
  const [items, setItems] = useState<Item[]>([])
  const [geladen, setGeladen] = useState(false)
  const [type, setType] = useState<Type>('agenda')
  const [draft, setDraft] = useState({ titel: '', inhoud: '', datum: new Date().toISOString().slice(0, 10) })
  const [mijnEmail, setMijnEmail] = useState('')

  const laad = async () => {
    const [{ data }, { data: { user } }] = await Promise.all([
      supabase.from('overleg').select('*').order('created_at', { ascending: false }),
      supabase.auth.getUser(),
    ])
    setItems((data || []) as Item[])
    setMijnEmail(user?.email || '')
    setGeladen(true)
  }
  useEffect(() => { laad() }, [])

  const voegToe = async () => {
    if (!draft.inhoud.trim()) { flash('Vul eerst iets in.', 5000); return }
    const { error } = await supabase.from('overleg').insert({
      type, titel: draft.titel.trim() || null, inhoud: draft.inhoud.trim(),
      auteur: mijnEmail || null, datum: (type === 'agenda' || type === 'notulen') ? draft.datum : null,
    })
    if (error) { flash('Opslaan mislukte: ' + error.message, 7000); return }
    setDraft({ titel: '', inhoud: '', datum: new Date().toISOString().slice(0, 10) })
    await laad()
  }

  const verwijder = async (id: string) => {
    if (!confirm('Dit item verwijderen?')) return
    await supabase.from('overleg').delete().eq('id', id)
    setItems(items.filter(i => i.id !== id))
  }

  const lijst = items.filter(i => i.type === type)

  return (
    <>
      <div style={AS.title}>Overleg</div>
      <div style={AS.sub}>Agenda, notulen en losse noties. Live bijgewerkt, geen opmaak nodig.</div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        {TYPES.map(t => (
          <button key={t} onClick={() => setType(t)} style={{
            padding: '8px 18px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, letterSpacing: '1px',
            textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
            border: '1px solid', borderColor: type === t ? 'var(--navy)' : '#ccc',
            background: type === t ? 'var(--navy)' : 'transparent',
            color: type === t ? 'var(--cream)' : 'var(--navy)',
          }}>
            {TYPE_LABEL[t]}{items.filter(i => i.type === t).length > 0 ? ` (${items.filter(i => i.type === t).length})` : ''}
          </button>
        ))}
      </div>

      <div style={AS.card}>
        <div style={AS.cardTitle}>Nieuw{type === 'agenda' ? ' agendapunt' : type === 'notulen' ? ' notulenpunt' : 'e notitie'}</div>
        {(type === 'agenda' || type === 'notulen') && (
          <>
            <label style={AS.label}>Datum</label>
            <input style={{ ...AS.input, width: '200px' }} type="date" value={draft.datum} onChange={e => setDraft({ ...draft, datum: e.target.value })} />
          </>
        )}
        <label style={AS.label}>Titel (optioneel)</label>
        <input style={AS.input} value={draft.titel} onChange={e => setDraft({ ...draft, titel: e.target.value })} placeholder="bijv. Vergunning update" />
        <label style={AS.label}>Tekst</label>
        <textarea style={{ ...AS.input, height: '90px', resize: 'vertical' }} value={draft.inhoud} onChange={e => setDraft({ ...draft, inhoud: e.target.value })} placeholder="Typ hier je punt of notitie..." />
        <button style={AS.btn} onClick={voegToe}>Toevoegen</button>
      </div>

      {!geladen ? (
        <div style={{ padding: '20px', color: '#888' }}>Laden...</div>
      ) : lijst.length === 0 ? (
        <div style={AS.card}><div style={{ color: '#888', fontSize: '14px' }}>Nog niets bij {TYPE_LABEL[type].toLowerCase()}.</div></div>
      ) : (
        lijst.map(i => (
          <div key={i.id} style={{ ...AS.card, padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
              <div>
                {i.titel && <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--navy)', marginBottom: '4px' }}>{i.titel}</div>}
                <div style={{ fontSize: '13px', color: 'var(--navy)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{i.inhoud}</div>
                <div style={{ fontSize: '11px', color: '#999', marginTop: '8px' }}>
                  {[i.datum && new Date(i.datum).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }), i.auteur, new Date(i.created_at).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })].filter(Boolean).join(' · ')}
                </div>
              </div>
              <button onClick={() => verwijder(i.id)} style={{ border: 'none', background: 'none', color: '#bbb', cursor: 'pointer', fontSize: '15px', padding: 0, flexShrink: 0 }}>×</button>
            </div>
          </div>
        ))
      )}
    </>
  )
}
