'use client'
// Simpele gedeelde to-do lijst voor het organisatieteam.
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { AS } from './ui'

type Taak = { id: string; tekst: string; gedaan: boolean; toegewezen_aan: string | null; deadline: string | null; volgorde: number }

export default function Todo({ flash }: { flash: (m: string, ms?: number) => void }) {
  const [taken, setTaken] = useState<Taak[]>([])
  const [geladen, setGeladen] = useState(false)
  const [nieuw, setNieuw] = useState({ tekst: '', toegewezen_aan: '', deadline: '' })
  const [toonAfgerond, setToonAfgerond] = useState(false)

  const laad = async () => {
    const { data } = await supabase.from('todos').select('*').order('gedaan').order('deadline', { nullsFirst: false }).order('volgorde')
    setTaken((data || []) as Taak[])
    setGeladen(true)
  }
  useEffect(() => { laad() }, [])

  const voegToe = async () => {
    if (!nieuw.tekst.trim()) return
    const { error } = await supabase.from('todos').insert({
      tekst: nieuw.tekst.trim(), toegewezen_aan: nieuw.toegewezen_aan.trim() || null,
      deadline: nieuw.deadline || null, volgorde: taken.length,
    })
    if (error) { flash('Toevoegen mislukte: ' + error.message, 7000); return }
    setNieuw({ tekst: '', toegewezen_aan: '', deadline: '' })
    await laad()
  }

  const toggle = async (t: Taak) => {
    await supabase.from('todos').update({ gedaan: !t.gedaan }).eq('id', t.id)
    setTaken(taken.map(x => x.id === t.id ? { ...x, gedaan: !x.gedaan } : x))
  }

  const verwijder = async (t: Taak) => {
    await supabase.from('todos').delete().eq('id', t.id)
    setTaken(taken.filter(x => x.id !== t.id))
  }

  const openTaken = taken.filter(t => !t.gedaan)
  const afgerondeTaken = taken.filter(t => t.gedaan)

  const rij = (t: Taak) => {
    const verlopen = t.deadline && !t.gedaan && new Date(t.deadline) < new Date(new Date().toDateString())
    return (
      <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '11px 0', borderBottom: '1px solid #f0f0f0' }}>
        <input type="checkbox" checked={t.gedaan} onChange={() => toggle(t)} style={{ width: '17px', height: '17px', cursor: 'pointer', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: '13px', color: t.gedaan ? '#aaa' : 'var(--navy)', textDecoration: t.gedaan ? 'line-through' : 'none' }}>{t.tekst}</span>
          {(t.toegewezen_aan || t.deadline) && (
            <div style={{ fontSize: '11px', color: verlopen ? 'var(--bordeaux)' : '#999', marginTop: '2px' }}>
              {[t.toegewezen_aan, t.deadline && `deadline ${new Date(t.deadline).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}${verlopen ? ' · verlopen' : ''}`].filter(Boolean).join(' · ')}
            </div>
          )}
        </div>
        <button onClick={() => verwijder(t)} style={{ border: 'none', background: 'none', color: '#bbb', cursor: 'pointer', fontSize: '15px', padding: 0, flexShrink: 0 }}>×</button>
      </div>
    )
  }

  if (!geladen) return <div style={{ padding: '20px', color: '#888' }}>To-do laden...</div>

  return (
    <>
      <div style={AS.title}>To-do</div>
      <div style={AS.sub}>Gedeelde takenlijst voor het organisatieteam.</div>

      <div style={AS.card}>
        <div style={AS.cardTitle}>Nieuwe taak</div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <input style={{ ...AS.input, flex: 2, minWidth: '200px', marginTop: 0 }} value={nieuw.tekst} onChange={e => setNieuw({ ...nieuw, tekst: e.target.value })} placeholder="Wat moet er gebeuren?" onKeyDown={e => e.key === 'Enter' && voegToe()} />
          <input style={{ ...AS.input, flex: 1, minWidth: '120px', marginTop: 0 }} value={nieuw.toegewezen_aan} onChange={e => setNieuw({ ...nieuw, toegewezen_aan: e.target.value })} placeholder="Wie (optioneel)" />
          <input style={{ ...AS.input, flex: 1, minWidth: '140px', marginTop: 0 }} type="date" value={nieuw.deadline} onChange={e => setNieuw({ ...nieuw, deadline: e.target.value })} />
          <button style={{ ...AS.btn, marginTop: 0 }} onClick={voegToe}>Toevoegen</button>
        </div>
      </div>

      <div style={AS.card}>
        <div style={AS.cardTitle}>Openstaand ({openTaken.length})</div>
        {openTaken.length === 0 ? <div style={{ color: '#888', fontSize: '14px' }}>Niets openstaand. Goed bezig.</div> : openTaken.map(rij)}
      </div>

      {afgerondeTaken.length > 0 && (
        <div style={AS.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={AS.cardTitle}>Afgerond ({afgerondeTaken.length})</div>
            <button style={AS.btnSm} onClick={() => setToonAfgerond(!toonAfgerond)}>{toonAfgerond ? 'Verberg' : 'Toon'}</button>
          </div>
          {toonAfgerond && afgerondeTaken.map(rij)}
        </div>
      )}
    </>
  )
}
