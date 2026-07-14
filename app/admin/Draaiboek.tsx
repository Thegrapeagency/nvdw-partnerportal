'use client'
// Draaiboek: het ene overzicht met alles wat er rond de festivaldagen moet
// gebeuren. Drie secties: Tijdlijn (per dag momenten), Contacten (wie bel je
// waarvoor) en Checklist (per fase af te vinken). Puur organisatorisch, geen
// koppeling met ticketing of kassa.
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { AS, PROGRAMMA_DAGEN } from './ui'

type Dag = 'fri' | 'sat' | 'sun'
type Moment = {
  id: string; dag: Dag | null; tijd: string | null; titel: string
  verantwoordelijke: string | null; locatie: string | null; opmerking: string | null; volgorde: number
}
type Contact = { id: string; naam: string; rol: string | null; telefoon: string | null; email: string | null; opmerking: string | null; volgorde: number }
type Fase = 'vooraf' | 'opbouw' | 'tijdens' | 'afbouw' | 'achteraf'
type Taak = { id: string; fase: Fase; taak: string; gedaan: boolean; volgorde: number }

const FASE_LABEL: Record<Fase, string> = { vooraf: 'Vooraf', opbouw: 'Opbouw', tijdens: 'Tijdens het festival', afbouw: 'Afbouw', achteraf: 'Achteraf' }
const FASES: Fase[] = ['vooraf', 'opbouw', 'tijdens', 'afbouw', 'achteraf']
const DAG_KOLOMMEN: { value: Dag | 'algemeen'; label: string }[] = [
  { value: 'algemeen', label: 'Algemeen' },
  ...PROGRAMMA_DAGEN.map(d => ({ value: d.value, label: d.label })),
]

type Sectie = 'tijdlijn' | 'contacten' | 'checklist'
const SECTIES: { id: Sectie; label: string }[] = [
  { id: 'tijdlijn', label: 'Tijdlijn' },
  { id: 'contacten', label: 'Contacten' },
  { id: 'checklist', label: 'Checklist' },
]

const leegMoment = { dag: 'algemeen' as Dag | 'algemeen', tijd: '', titel: '', verantwoordelijke: '', locatie: '', opmerking: '' }
const leegContact = { naam: '', rol: '', telefoon: '', email: '', opmerking: '' }

export default function Draaiboek({ flash }: { flash: (m: string, ms?: number) => void }) {
  const [momenten, setMomenten] = useState<Moment[]>([])
  const [contacten, setContacten] = useState<Contact[]>([])
  const [taken, setTaken] = useState<Taak[]>([])
  const [geladen, setGeladen] = useState(false)
  const [sectie, setSectie] = useState<Sectie>('tijdlijn')

  const [momentFormOpen, setMomentFormOpen] = useState(false)
  const [momentDraft, setMomentDraft] = useState(leegMoment)
  const [contactFormOpen, setContactFormOpen] = useState(false)
  const [contactDraft, setContactDraft] = useState(leegContact)
  const [nieuweTaak, setNieuweTaak] = useState('')
  const [faseActief, setFaseActief] = useState<Fase>('vooraf')

  const laad = async () => {
    const [m, c, t] = await Promise.all([
      supabase.from('draaiboek_momenten').select('*').order('dag', { nullsFirst: true }).order('volgorde'),
      supabase.from('draaiboek_contacten').select('*').order('volgorde'),
      supabase.from('draaiboek_checklist').select('*').order('volgorde'),
    ])
    setMomenten((m.data || []) as Moment[])
    setContacten((c.data || []) as Contact[])
    setTaken((t.data || []) as Taak[])
    setGeladen(true)
  }
  useEffect(() => { laad() }, [])

  // ---------- Tijdlijn ----------

  const momentenPerKolom = useMemo(() => {
    const per: Record<string, Moment[]> = { algemeen: [] }
    for (const d of PROGRAMMA_DAGEN) per[d.value] = []
    for (const m of momenten) per[m.dag || 'algemeen'].push(m)
    return per
  }, [momenten])

  const maakMoment = async () => {
    if (!momentDraft.titel.trim()) { flash('Vul een titel in.', 5000); return }
    const rij = {
      dag: momentDraft.dag === 'algemeen' ? null : momentDraft.dag,
      tijd: momentDraft.tijd.trim() || null,
      titel: momentDraft.titel.trim(),
      verantwoordelijke: momentDraft.verantwoordelijke.trim() || null,
      locatie: momentDraft.locatie.trim() || null,
      opmerking: momentDraft.opmerking.trim() || null,
      volgorde: momenten.length,
    }
    const { error } = await supabase.from('draaiboek_momenten').insert(rij)
    if (error) { flash('Toevoegen mislukte: ' + error.message, 7000); return }
    flash('Moment toegevoegd.')
    setMomentDraft(leegMoment)
    setMomentFormOpen(false)
    await laad()
  }

  const verwijderMoment = async (m: Moment) => {
    if (!confirm(`"${m.titel}" verwijderen uit de tijdlijn?`)) return
    await supabase.from('draaiboek_momenten').delete().eq('id', m.id)
    flash('Verwijderd.')
    await laad()
  }

  const tijdlijnSectie = () => (
    <>
      <button style={{ ...AS.btn, marginTop: 0, marginBottom: '16px' }} onClick={() => setMomentFormOpen(!momentFormOpen)}>
        {momentFormOpen ? 'Sluit formulier' : '+ Nieuw moment'}
      </button>
      {momentFormOpen && (
        <div style={AS.card}>
          <div style={AS.cardTitle}>Nieuw moment</div>
          <div style={AS.grid3}>
            <div>
              <label style={AS.label}>Dag</label>
              <select style={AS.input} value={momentDraft.dag} onChange={e => setMomentDraft({ ...momentDraft, dag: e.target.value as Dag | 'algemeen' })}>
                {DAG_KOLOMMEN.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
            <div>
              <label style={AS.label}>Tijd (optioneel)</label>
              <input style={AS.input} value={momentDraft.tijd} onChange={e => setMomentDraft({ ...momentDraft, tijd: e.target.value })} placeholder="bijv. 14:00 of 'de hele dag'" />
            </div>
            <div>
              <label style={AS.label}>Verantwoordelijke</label>
              <input style={AS.input} value={momentDraft.verantwoordelijke} onChange={e => setMomentDraft({ ...momentDraft, verantwoordelijke: e.target.value })} placeholder="bijv. Milan" />
            </div>
          </div>
          <label style={AS.label}>Titel</label>
          <input style={AS.input} value={momentDraft.titel} onChange={e => setMomentDraft({ ...momentDraft, titel: e.target.value })} placeholder="bijv. Locatie open voor opbouw" />
          <div style={AS.grid2}>
            <div>
              <label style={AS.label}>Locatie</label>
              <input style={AS.input} value={momentDraft.locatie} onChange={e => setMomentDraft({ ...momentDraft, locatie: e.target.value })} placeholder="bijv. Werkspoorkathedraal" />
            </div>
            <div>
              <label style={AS.label}>Opmerking</label>
              <input style={AS.input} value={momentDraft.opmerking} onChange={e => setMomentDraft({ ...momentDraft, opmerking: e.target.value })} />
            </div>
          </div>
          <button style={AS.btn} onClick={maakMoment}>Toevoegen</button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${DAG_KOLOMMEN.length}, 1fr)`, gap: '14px' }}>
        {DAG_KOLOMMEN.map(kol => (
          <div key={kol.value}>
            <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: '15px', fontWeight: 700, color: 'var(--navy)', marginBottom: '10px' }}>{kol.label}</div>
            {(momentenPerKolom[kol.value] || []).length === 0 ? (
              <div style={{ fontSize: '12px', color: '#999' }}>Nog niets gepland.</div>
            ) : (
              momentenPerKolom[kol.value].map(m => (
                <div key={m.id} style={{ ...AS.card, padding: '12px 14px', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px' }}>
                    <div>
                      {m.tijd && <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--bordeaux)' }}>{m.tijd}</div>}
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--navy)' }}>{m.titel}</div>
                      {m.verantwoordelijke && <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>{m.verantwoordelijke}</div>}
                      {m.locatie && <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>{m.locatie}</div>}
                      {m.opmerking && <div style={{ fontSize: '11px', color: '#888', fontStyle: 'italic', marginTop: '2px' }}>{m.opmerking}</div>}
                    </div>
                    <button onClick={() => verwijderMoment(m)} style={{ border: 'none', background: 'none', color: '#bbb', cursor: 'pointer', fontSize: '14px', padding: 0 }}>×</button>
                  </div>
                </div>
              ))
            )}
          </div>
        ))}
      </div>
    </>
  )

  // ---------- Contacten ----------

  const maakContact = async () => {
    if (!contactDraft.naam.trim()) { flash('Vul een naam in.', 5000); return }
    const rij = {
      naam: contactDraft.naam.trim(), rol: contactDraft.rol.trim() || null,
      telefoon: contactDraft.telefoon.trim() || null, email: contactDraft.email.trim() || null,
      opmerking: contactDraft.opmerking.trim() || null, volgorde: contacten.length,
    }
    const { error } = await supabase.from('draaiboek_contacten').insert(rij)
    if (error) { flash('Toevoegen mislukte: ' + error.message, 7000); return }
    flash('Contact toegevoegd.')
    setContactDraft(leegContact)
    setContactFormOpen(false)
    await laad()
  }

  const verwijderContact = async (c: Contact) => {
    if (!confirm(`Contact "${c.naam}" verwijderen?`)) return
    await supabase.from('draaiboek_contacten').delete().eq('id', c.id)
    flash('Verwijderd.')
    await laad()
  }

  const contactenSectie = () => (
    <>
      <button style={{ ...AS.btn, marginTop: 0, marginBottom: '16px' }} onClick={() => setContactFormOpen(!contactFormOpen)}>
        {contactFormOpen ? 'Sluit formulier' : '+ Nieuw contact'}
      </button>
      {contactFormOpen && (
        <div style={AS.card}>
          <div style={AS.cardTitle}>Nieuw contact</div>
          <div style={AS.grid3}>
            <div><label style={AS.label}>Naam</label><input style={AS.input} value={contactDraft.naam} onChange={e => setContactDraft({ ...contactDraft, naam: e.target.value })} /></div>
            <div><label style={AS.label}>Rol / waarvoor bellen</label><input style={AS.input} value={contactDraft.rol} onChange={e => setContactDraft({ ...contactDraft, rol: e.target.value })} placeholder="bijv. Locatiebeheer Werkspoorkathedraal" /></div>
            <div><label style={AS.label}>Telefoon</label><input style={AS.input} value={contactDraft.telefoon} onChange={e => setContactDraft({ ...contactDraft, telefoon: e.target.value })} /></div>
          </div>
          <div style={AS.grid2}>
            <div><label style={AS.label}>E-mail</label><input style={AS.input} value={contactDraft.email} onChange={e => setContactDraft({ ...contactDraft, email: e.target.value })} /></div>
            <div><label style={AS.label}>Opmerking</label><input style={AS.input} value={contactDraft.opmerking} onChange={e => setContactDraft({ ...contactDraft, opmerking: e.target.value })} /></div>
          </div>
          <button style={AS.btn} onClick={maakContact}>Toevoegen</button>
        </div>
      )}
      <div style={AS.card}>
        <div style={AS.cardTitle}>Contacten ({contacten.length})</div>
        {contacten.length === 0 ? (
          <div style={{ color: '#888', fontSize: '14px' }}>Nog geen contacten toegevoegd.</div>
        ) : (
          <table style={AS.table}>
            <thead><tr>{['Naam', 'Rol', 'Telefoon', 'E-mail', ''].map(h => <th key={h} style={AS.th}>{h}</th>)}</tr></thead>
            <tbody>
              {contacten.map(c => (
                <tr key={c.id}>
                  <td style={AS.td}><strong>{c.naam}</strong>{c.opmerking && <div style={{ fontSize: '11px', color: '#888' }}>{c.opmerking}</div>}</td>
                  <td style={AS.td}>{c.rol || '-'}</td>
                  <td style={AS.td}>{c.telefoon ? <a href={`tel:${c.telefoon}`} style={{ color: 'var(--bordeaux)' }}>{c.telefoon}</a> : '-'}</td>
                  <td style={AS.td}>{c.email ? <a href={`mailto:${c.email}`} style={{ color: 'var(--bordeaux)' }}>{c.email}</a> : '-'}</td>
                  <td style={AS.td}><button style={{ ...AS.btnSm, borderColor: '#ccc', color: '#888' }} onClick={() => verwijderContact(c)}>Verwijder</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )

  // ---------- Checklist ----------

  const takenPerFase = (f: Fase) => taken.filter(t => t.fase === f)

  const voegTaakToe = async () => {
    if (!nieuweTaak.trim()) return
    const { error } = await supabase.from('draaiboek_checklist').insert({ fase: faseActief, taak: nieuweTaak.trim(), volgorde: takenPerFase(faseActief).length })
    if (error) { flash('Toevoegen mislukte: ' + error.message, 7000); return }
    setNieuweTaak('')
    await laad()
  }

  const toggleTaak = async (t: Taak) => {
    await supabase.from('draaiboek_checklist').update({ gedaan: !t.gedaan }).eq('id', t.id)
    setTaken(taken.map(x => x.id === t.id ? { ...x, gedaan: !x.gedaan } : x))
  }

  const verwijderTaak = async (t: Taak) => {
    await supabase.from('draaiboek_checklist').delete().eq('id', t.id)
    setTaken(taken.filter(x => x.id !== t.id))
  }

  const checklistSectie = () => (
    <>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {FASES.map(f => {
          const lijst = takenPerFase(f)
          const gedaan = lijst.filter(t => t.gedaan).length
          return (
            <button key={f} onClick={() => setFaseActief(f)} style={{
              padding: '8px 16px', fontSize: '11px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase',
              borderRadius: '2px', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
              border: '1px solid', borderColor: faseActief === f ? 'var(--navy)' : '#ccc',
              background: faseActief === f ? 'var(--navy)' : 'transparent',
              color: faseActief === f ? 'var(--cream)' : 'var(--navy)',
            }}>
              {FASE_LABEL[f]}{lijst.length > 0 ? ` (${gedaan}/${lijst.length})` : ''}
            </button>
          )
        })}
      </div>

      <div style={AS.card}>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <input style={AS.input} value={nieuweTaak} onChange={e => setNieuweTaak(e.target.value)} placeholder={`Nieuwe taak voor ${FASE_LABEL[faseActief].toLowerCase()}`} onKeyDown={e => e.key === 'Enter' && voegTaakToe()} />
          <button style={{ ...AS.btn, marginTop: 0, whiteSpace: 'nowrap' as const }} onClick={voegTaakToe}>Toevoegen</button>
        </div>
        {takenPerFase(faseActief).length === 0 ? (
          <div style={{ color: '#888', fontSize: '14px' }}>Nog geen taken voor {FASE_LABEL[faseActief].toLowerCase()}.</div>
        ) : (
          takenPerFase(faseActief).map(t => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
              <input type="checkbox" checked={t.gedaan} onChange={() => toggleTaak(t)} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
              <span style={{ flex: 1, fontSize: '13px', color: t.gedaan ? '#aaa' : 'var(--navy)', textDecoration: t.gedaan ? 'line-through' : 'none' }}>{t.taak}</span>
              <button onClick={() => verwijderTaak(t)} style={{ border: 'none', background: 'none', color: '#bbb', cursor: 'pointer', fontSize: '14px' }}>×</button>
            </div>
          ))
        )}
      </div>
    </>
  )

  if (!geladen) return <div style={{ padding: '20px', color: '#888' }}>Draaiboek laden...</div>

  return (
    <>
      <div style={AS.title}>Draaiboek</div>
      <div style={AS.sub}>De ene plek met alles wat er rond de festivaldagen moet gebeuren: tijdlijn, contacten en checklists.</div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        {SECTIES.map(s => (
          <button key={s.id} onClick={() => setSectie(s.id)} style={{
            padding: '8px 18px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, letterSpacing: '1px',
            textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
            border: '1px solid', borderColor: sectie === s.id ? 'var(--navy)' : '#ccc',
            background: sectie === s.id ? 'var(--navy)' : 'transparent',
            color: sectie === s.id ? 'var(--cream)' : 'var(--navy)',
          }}>
            {s.label}
          </button>
        ))}
      </div>

      {sectie === 'tijdlijn' && tijdlijnSectie()}
      {sectie === 'contacten' && contactenSectie()}
      {sectie === 'checklist' && checklistSectie()}
    </>
  )
}
