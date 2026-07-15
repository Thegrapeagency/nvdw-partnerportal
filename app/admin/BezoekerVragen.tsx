'use client'
// Vragen van bezoekers (via het formulier op faq.html), los van de partnervragen.
// Zelfde afhandelpatroon: open -> antwoord opslaan -> beantwoord.
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { AS } from './ui'

type Vraag = {
  id: string; naam: string | null; email: string | null; categorie: string | null
  onderwerp: string; bericht: string; status: 'open' | 'beantwoord'
  antwoord: string | null; created_at: string
}

const CATEGORIE_LABEL: Record<string, string> = { tickets: 'Tickets', programma: 'Programma', praktisch: 'Praktisch', overig: 'Overig' }

export default function BezoekerVragen({ flash }: { flash: (m: string, ms?: number) => void }) {
  const [vragen, setVragen] = useState<Vraag[]>([])
  const [geladen, setGeladen] = useState(false)
  const [antwoordMap, setAntwoordMap] = useState<Record<string, string>>({})
  const [filter, setFilter] = useState<string>('alle')

  const laad = async () => {
    const { data } = await supabase.from('bezoeker_vragen').select('*').order('status').order('created_at', { ascending: false })
    setVragen((data || []) as Vraag[])
    setGeladen(true)
  }
  useEffect(() => { laad() }, [])

  const beantwoord = async (id: string) => {
    const antwoord = (antwoordMap[id] || '').trim()
    if (!antwoord) { flash('Vul een antwoord in.', 5000); return }
    const { error } = await supabase.from('bezoeker_vragen').update({ antwoord, status: 'beantwoord', antwoord_datum: new Date().toISOString() }).eq('id', id)
    if (error) { flash('Opslaan mislukte: ' + error.message, 7000); return }
    flash('Antwoord opgeslagen.')
    await laad()
  }

  const categorieen = ['alle', ...Object.keys(CATEGORIE_LABEL)]
  const zichtbaar = vragen.filter(v => filter === 'alle' || v.categorie === filter)
  const open = zichtbaar.filter(v => v.status === 'open')
  const beantwoordVragen = zichtbaar.filter(v => v.status === 'beantwoord')

  if (!geladen) return <div style={{ padding: '20px', color: '#888' }}>Vragen laden...</div>

  return (
    <>
      <div style={AS.title}>Bezoekersvragen</div>
      <div style={AS.sub}>Vragen die bezoekers via de FAQ-pagina hebben ingestuurd.</div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {categorieen.map(c => (
          <button key={c} onClick={() => setFilter(c)} style={{
            padding: '7px 16px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, letterSpacing: '1px',
            textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
            border: '1px solid', borderColor: filter === c ? 'var(--navy)' : '#ccc',
            background: filter === c ? 'var(--navy)' : 'transparent',
            color: filter === c ? 'var(--cream)' : 'var(--navy)',
          }}>
            {c === 'alle' ? 'Alle' : CATEGORIE_LABEL[c]}
          </button>
        ))}
      </div>

      <div style={AS.cardTitle}>Open ({open.length})</div>
      {open.length === 0 ? (
        <div style={{ ...AS.card, color: '#888', fontSize: '14px' }}>Geen open vragen.</div>
      ) : open.map(v => (
        <div key={v.id} style={{ ...AS.card, borderLeft: '3px solid var(--bordeaux)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', flexWrap: 'wrap', gap: '6px' }}>
            <div style={{ fontWeight: 700, fontSize: '13px' }}>{v.email || 'Onbekend e-mailadres'}</div>
            {v.categorie && <span style={{ fontSize: '10px', fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '1px' }}>{CATEGORIE_LABEL[v.categorie] || v.categorie}</span>}
          </div>
          <div style={{ fontSize: '13px', color: '#555', marginBottom: '12px' }}>{v.bericht}</div>
          <textarea style={{ ...AS.input, height: '70px', resize: 'vertical' }} value={antwoordMap[v.id] || ''} onChange={e => setAntwoordMap({ ...antwoordMap, [v.id]: e.target.value })} placeholder="Typ je antwoord..." />
          <button style={AS.btn} onClick={() => beantwoord(v.id)}>Antwoord opslaan</button>
        </div>
      ))}

      {beantwoordVragen.length > 0 && (
        <>
          <div style={{ ...AS.cardTitle, marginTop: '24px' }}>Beantwoord ({beantwoordVragen.length})</div>
          {beantwoordVragen.map(v => (
            <div key={v.id} style={{ ...AS.card, borderLeft: '3px solid #ccc' }}>
              <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '6px' }}>{v.email || 'Onbekend e-mailadres'}</div>
              <div style={{ fontSize: '13px', color: '#555', marginBottom: '10px' }}>{v.bericht}</div>
              <div style={{ background: '#f0f8f0', padding: '10px', borderRadius: '2px', fontSize: '13px', color: '#2e7d32' }}><strong>Antwoord:</strong> {v.antwoord}</div>
            </div>
          ))}
        </>
      )}
    </>
  )
}
