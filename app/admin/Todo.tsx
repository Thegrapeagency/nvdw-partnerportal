'use client'
// Planner-bord voor het organisatieteam, naar het idee van Microsoft Planner:
// kolommen (buckets) die je zelf aanmaakt, taken als kaartjes die je versleept
// tussen en binnen kolommen. Afgeronde taken klappen per kolom in.
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { AS } from './ui'

type Bucket = { id: string; naam: string; volgorde: number }
type Taak = {
  id: string; tekst: string; gedaan: boolean; toegewezen_aan: string | null
  deadline: string | null; volgorde: number; bucket_id: string | null; notitie: string | null
}

const KOLOM_BREEDTE = 272

export default function Todo({ flash }: { flash: (m: string, ms?: number) => void }) {
  const [buckets, setBuckets] = useState<Bucket[]>([])
  const [taken, setTaken] = useState<Taak[]>([])
  const [geladen, setGeladen] = useState(false)
  // Zolang de todo_buckets-migratie nog niet op de database staat, draait het
  // bord op één virtuele kolom zodat alles wel al te zien en te slepen is.
  const [dbKlaar, setDbKlaar] = useState(true)
  const [nieuwOpen, setNieuwOpen] = useState<string | null>(null)
  const [nieuwTekst, setNieuwTekst] = useState('')
  const [openKaart, setOpenKaart] = useState<string | null>(null)
  const [toonAfgerond, setToonAfgerond] = useState<Record<string, boolean>>({})
  const [kolomToevoegen, setKolomToevoegen] = useState(false)
  const [kolomNaam, setKolomNaam] = useState('')
  const [hernoemId, setHernoemId] = useState<string | null>(null)
  const [hernoemNaam, setHernoemNaam] = useState('')
  // Sleepstatus. In een ref (geen re-render nodig) + state voor de indicator.
  const dragTaak = useRef<string | null>(null)
  const dragBucket = useRef<string | null>(null)
  const [dropDoel, setDropDoel] = useState<{ bucketId: string; index: number } | null>(null)
  const [sleepId, setSleepId] = useState<string | null>(null)

  const laad = async () => {
    const [b, t] = await Promise.all([
      supabase.from('todo_buckets').select('*').order('volgorde'),
      supabase.from('todos').select('*').order('volgorde'),
    ])
    if (b.error) {
      // Migratie nog niet toegepast: alles in één virtuele kolom.
      setDbKlaar(false)
      setBuckets([{ id: 'virtueel', naam: 'Te doen', volgorde: 0 }])
    } else {
      setDbKlaar(true)
      setBuckets((b.data || []) as Bucket[])
    }
    setTaken((t.data || []) as Taak[])
    setGeladen(true)
  }
  useEffect(() => { laad() }, [])

  const bucketVan = (t: Taak) => {
    if (!dbKlaar) return 'virtueel'
    return t.bucket_id && buckets.some(b => b.id === t.bucket_id) ? t.bucket_id : (buckets[0]?.id ?? null)
  }
  const openIn = (bucketId: string) => taken.filter(t => !t.gedaan && bucketVan(t) === bucketId).sort((a, b) => a.volgorde - b.volgorde)
  const afgerondIn = (bucketId: string) => taken.filter(t => t.gedaan && bucketVan(t) === bucketId)

  // ---- taken ----
  const voegToe = async (bucketId: string) => {
    const tekst = nieuwTekst.trim()
    if (!tekst) return
    const volgorde = openIn(bucketId).length
    const insert: Record<string, unknown> = { tekst, volgorde }
    if (dbKlaar) insert.bucket_id = bucketId
    const { data, error } = await supabase.from('todos').insert(insert).select().single()
    if (error) { flash('Toevoegen mislukte: ' + error.message, 7000); return }
    setTaken(x => [...x, data as Taak])
    setNieuwTekst('')
  }

  const wijzig = async (id: string, patch: Partial<Taak>) => {
    setTaken(x => x.map(t => t.id === id ? { ...t, ...patch } : t))
    const { error } = await supabase.from('todos').update(patch).eq('id', id)
    if (error) flash('Opslaan mislukte: ' + error.message, 7000)
  }

  const verwijder = async (t: Taak) => {
    if (!confirm('Taak verwijderen?')) return
    await supabase.from('todos').delete().eq('id', t.id)
    setTaken(x => x.filter(y => y.id !== t.id))
    setOpenKaart(null)
  }

  // Kaart naar een kolom + positie verplaatsen en de volgorde daar hernummeren.
  const verplaats = async (taakId: string, naarBucket: string, index: number) => {
    const taak = taken.find(t => t.id === taakId)
    if (!taak) return
    const doelLijst = openIn(naarBucket).filter(t => t.id !== taakId)
    doelLijst.splice(Math.min(index, doelLijst.length), 0, { ...taak, bucket_id: naarBucket })
    const nieuweVolgorde = new Map(doelLijst.map((t, i) => [t.id, i]))
    setTaken(x => x.map(t => {
      if (t.id === taakId) return { ...t, bucket_id: dbKlaar ? naarBucket : t.bucket_id, volgorde: nieuweVolgorde.get(t.id) ?? t.volgorde }
      if (nieuweVolgorde.has(t.id)) return { ...t, volgorde: nieuweVolgorde.get(t.id)! }
      return t
    }))
    if (!dbKlaar) return
    await Promise.all(doelLijst.map((t, i) => {
      const patch: Record<string, unknown> = { volgorde: i }
      if (t.id === taakId) patch.bucket_id = naarBucket
      return supabase.from('todos').update(patch).eq('id', t.id)
    }))
  }

  // ---- kolommen ----
  const maakKolom = async () => {
    const naam = kolomNaam.trim()
    if (!naam) return
    if (!dbKlaar) { flash('Kolommen kunnen pas opgeslagen worden zodra de databasemigratie is uitgevoerd (bij livegang).', 8000); return }
    const { data, error } = await supabase.from('todo_buckets').insert({ naam, volgorde: buckets.length }).select().single()
    if (error) { flash('Kolom aanmaken mislukte: ' + error.message, 7000); return }
    setBuckets(x => [...x, data as Bucket])
    setKolomNaam(''); setKolomToevoegen(false)
  }

  const hernoemKolom = async (id: string) => {
    const naam = hernoemNaam.trim()
    if (!naam) { setHernoemId(null); return }
    setBuckets(x => x.map(b => b.id === id ? { ...b, naam } : b))
    setHernoemId(null)
    if (dbKlaar) await supabase.from('todo_buckets').update({ naam }).eq('id', id)
  }

  const verwijderKolom = async (b: Bucket) => {
    const rest = buckets.filter(x => x.id !== b.id)
    if (rest.length === 0) { flash('Er moet minstens één kolom overblijven.', 6000); return }
    const inKolom = taken.filter(t => bucketVan(t) === b.id)
    if (inKolom.length > 0 && !confirm(`"${b.naam}" bevat ${inKolom.length} ${inKolom.length === 1 ? 'taak' : 'taken'}. Die verhuizen naar "${rest[0].naam}". Kolom verwijderen?`)) return
    if (dbKlaar) {
      if (inKolom.length > 0) await supabase.from('todos').update({ bucket_id: rest[0].id }).eq('bucket_id', b.id)
      await supabase.from('todo_buckets').delete().eq('id', b.id)
    }
    setTaken(x => x.map(t => bucketVan(t) === b.id ? { ...t, bucket_id: rest[0].id } : t))
    setBuckets(rest)
  }

  const verplaatsKolom = async (id: string, index: number) => {
    const zonder = buckets.filter(b => b.id !== id)
    const b = buckets.find(x => x.id === id)
    if (!b) return
    zonder.splice(Math.min(index, zonder.length), 0, b)
    setBuckets(zonder.map((x, i) => ({ ...x, volgorde: i })))
    if (dbKlaar) await Promise.all(zonder.map((x, i) => supabase.from('todo_buckets').update({ volgorde: i }).eq('id', x.id)))
  }

  // ---- weergave ----
  const initialen = (naam: string) => naam.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
  const verlopen = (t: Taak) => t.deadline && !t.gedaan && new Date(t.deadline) < new Date(new Date().toDateString())

  const dropIndicator = <div style={{ height: '3px', background: 'var(--gold)', borderRadius: '2px', margin: '2px 4px' }} />

  const kaart = (t: Taak, i: number, bucketId: string) => {
    const open = openKaart === t.id
    return (
      <div key={t.id}>
        {dropDoel?.bucketId === bucketId && dropDoel.index === i && sleepId && sleepId !== t.id && dropIndicator}
        <div
          draggable={!open}
          onDragStart={e => { dragTaak.current = t.id; setSleepId(t.id); e.dataTransfer.effectAllowed = 'move' }}
          onDragEnd={() => { dragTaak.current = null; setSleepId(null); setDropDoel(null) }}
          onDragOver={e => {
            if (!dragTaak.current || dragTaak.current === t.id) return
            e.preventDefault(); e.stopPropagation()
            const r = e.currentTarget.getBoundingClientRect()
            const voor = e.clientY - r.top < r.height / 2
            setDropDoel({ bucketId, index: voor ? i : i + 1 })
          }}
          onClick={() => !open && setOpenKaart(t.id)}
          style={{
            background: '#fff', borderRadius: '8px', border: '1px solid rgba(1,3,65,0.1)',
            boxShadow: '0 1px 2px rgba(0,0,0,0.06)', padding: '10px 12px', marginBottom: '8px',
            cursor: open ? 'default' : 'grab', opacity: sleepId === t.id ? 0.35 : 1,
            transition: 'opacity 0.1s',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
            <button
              title="Afronden"
              onClick={e => { e.stopPropagation(); wijzig(t.id, { gedaan: true }) }}
              style={{
                width: '16px', height: '16px', borderRadius: '50%', border: '2px solid #bbb',
                background: 'transparent', cursor: 'pointer', flexShrink: 0, marginTop: '2px', padding: 0,
              }}
            />
            <div style={{ flex: 1, fontSize: '13px', color: 'var(--navy)', lineHeight: 1.4 }}>{t.tekst}</div>
          </div>
          {(t.toegewezen_aan || t.deadline || t.notitie) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
              {t.deadline && (
                <span style={{
                  fontSize: '11px', padding: '2px 8px', borderRadius: '10px',
                  background: verlopen(t) ? '#fdecea' : '#f0f0f0', color: verlopen(t) ? '#b3261e' : '#666', fontWeight: 600,
                }}>
                  {new Date(t.deadline).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}{verlopen(t) ? ' · verlopen' : ''}
                </span>
              )}
              {t.notitie && <span title={t.notitie} style={{ fontSize: '11px', color: '#999' }}>≡</span>}
              {t.toegewezen_aan && (
                <span title={t.toegewezen_aan} style={{
                  marginLeft: 'auto', width: '22px', height: '22px', borderRadius: '50%', background: 'var(--navy)',
                  color: 'var(--cream)', fontSize: '9px', fontWeight: 700, display: 'inline-flex',
                  alignItems: 'center', justifyContent: 'center', letterSpacing: '0.5px',
                }}>{initialen(t.toegewezen_aan)}</span>
              )}
            </div>
          )}
          {open && (
            <div onClick={e => e.stopPropagation()} style={{ marginTop: '10px', borderTop: '1px solid #f0f0f0', paddingTop: '10px' }}>
              <textarea style={{ ...AS.input, height: '54px', resize: 'vertical', marginBottom: '8px' }} defaultValue={t.tekst}
                onBlur={e => e.target.value.trim() && e.target.value !== t.tekst && wijzig(t.id, { tekst: e.target.value.trim() })} />
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <input style={{ ...AS.input, flex: 1 }} placeholder="Wie" defaultValue={t.toegewezen_aan || ''}
                  onBlur={e => (e.target.value.trim() || null) !== t.toegewezen_aan && wijzig(t.id, { toegewezen_aan: e.target.value.trim() || null })} />
                <input style={{ ...AS.input, flex: 1 }} type="date" defaultValue={t.deadline || ''}
                  onChange={e => wijzig(t.id, { deadline: e.target.value || null })} />
              </div>
              {dbKlaar && (
                <textarea style={{ ...AS.input, height: '44px', resize: 'vertical', marginBottom: '8px' }} placeholder="Notitie (optioneel)" defaultValue={t.notitie || ''}
                  onBlur={e => (e.target.value.trim() || null) !== t.notitie && wijzig(t.id, { notitie: e.target.value.trim() || null })} />
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <button style={{ ...AS.btnSm, borderColor: '#ccc', color: '#999' }} onClick={() => verwijder(t)}>Verwijder</button>
                <button style={AS.btnSm} onClick={() => setOpenKaart(null)}>Sluit</button>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (!geladen) return <div style={{ padding: '20px', color: '#888' }}>To-do laden...</div>

  return (
    <>
      <div style={AS.title}>To-do</div>
      <div style={AS.sub}>Gedeeld takenbord voor het organisatieteam. Sleep kaartjes tussen kolommen; klik een kaartje om het te bewerken.</div>
      {!dbKlaar && (
        <div style={{ background: '#fff8e6', border: '1px solid var(--gold)', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#8a6d1a', marginBottom: '16px' }}>
          Voorbeeldweergave: eigen kolommen worden actief zodra de databasemigratie is uitgevoerd. Taken zelf werken gewoon.
        </div>
      )}

      <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', overflowX: 'auto', paddingBottom: '16px' }}>
        {buckets.map((b, bi) => {
          const open = openIn(b.id)
          const klaar = afgerondIn(b.id)
          return (
            <div key={b.id} style={{ width: KOLOM_BREEDTE, flexShrink: 0 }}>
              <div
                draggable={hernoemId !== b.id}
                onDragStart={e => { dragBucket.current = b.id; e.dataTransfer.effectAllowed = 'move' }}
                onDragEnd={() => { dragBucket.current = null }}
                onDragOver={e => {
                  if (!dragBucket.current || dragBucket.current === b.id) return
                  e.preventDefault()
                }}
                onDrop={e => {
                  if (!dragBucket.current || dragBucket.current === b.id) return
                  e.preventDefault()
                  verplaatsKolom(dragBucket.current, bi)
                  dragBucket.current = null
                }}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 6px 10px', cursor: 'grab' }}
              >
                {hernoemId === b.id ? (
                  <input autoFocus style={{ ...AS.input, padding: '5px 8px', fontSize: '13px', fontWeight: 700 }} value={hernoemNaam}
                    onChange={e => setHernoemNaam(e.target.value)}
                    onBlur={() => hernoemKolom(b.id)}
                    onKeyDown={e => { if (e.key === 'Enter') hernoemKolom(b.id); if (e.key === 'Escape') setHernoemId(null) }} />
                ) : (
                  <>
                    <span onClick={() => { setHernoemId(b.id); setHernoemNaam(b.naam) }} title="Klik om te hernoemen"
                      style={{ fontSize: '13px', fontWeight: 700, color: 'var(--navy)', cursor: 'text' }}>{b.naam}</span>
                    <span style={{ fontSize: '11px', color: '#999', fontWeight: 600 }}>{open.length}</span>
                    <button title="Kolom verwijderen" onClick={() => verwijderKolom(b)}
                      style={{ marginLeft: 'auto', border: 'none', background: 'none', color: '#ccc', cursor: 'pointer', fontSize: '14px', padding: '0 2px' }}>×</button>
                  </>
                )}
              </div>

              <div
                onDragOver={e => {
                  if (!dragTaak.current) return
                  e.preventDefault()
                  // Alleen als je onder de kaartjes hangt: achteraan invoegen.
                  if (e.target === e.currentTarget) setDropDoel({ bucketId: b.id, index: open.length })
                }}
                onDrop={e => {
                  if (!dragTaak.current) return
                  e.preventDefault()
                  const doel = dropDoel && dropDoel.bucketId === b.id ? dropDoel.index : open.length
                  verplaats(dragTaak.current, b.id, doel)
                  dragTaak.current = null; setSleepId(null); setDropDoel(null)
                }}
                style={{
                  background: dropDoel?.bucketId === b.id ? 'rgba(254,183,42,0.08)' : 'rgba(1,3,65,0.04)',
                  borderRadius: '10px', padding: '8px', minHeight: '80px', transition: 'background 0.1s',
                }}
              >
                {nieuwOpen === b.id ? (
                  <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid rgba(1,3,65,0.1)', padding: '10px', marginBottom: '8px' }}>
                    <textarea autoFocus style={{ ...AS.input, height: '48px', resize: 'none', marginBottom: '8px' }} placeholder="Wat moet er gebeuren?"
                      value={nieuwTekst} onChange={e => setNieuwTekst(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); voegToe(b.id) } if (e.key === 'Escape') { setNieuwOpen(null); setNieuwTekst('') } }} />
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button style={AS.btnSm} onClick={() => voegToe(b.id)}>Toevoegen</button>
                      <button style={{ ...AS.btnSm, borderColor: '#ccc', color: '#999' }} onClick={() => { setNieuwOpen(null); setNieuwTekst('') }}>Annuleer</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => { setNieuwOpen(b.id); setNieuwTekst('') }} style={{
                    width: '100%', padding: '8px', marginBottom: '8px', border: '1px dashed rgba(1,3,65,0.2)',
                    borderRadius: '8px', background: 'transparent', color: '#888', fontSize: '12px', fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                  }}>+ Taak toevoegen</button>
                )}

                {open.map((t, i) => kaart(t, i, b.id))}
                {dropDoel?.bucketId === b.id && dropDoel.index >= open.length && sleepId && dropIndicator}

                {klaar.length > 0 && (
                  <div style={{ marginTop: '4px' }}>
                    <button onClick={() => setToonAfgerond(x => ({ ...x, [b.id]: !x[b.id] }))} style={{
                      border: 'none', background: 'none', color: '#999', fontSize: '11px', fontWeight: 700,
                      cursor: 'pointer', padding: '6px 4px', fontFamily: 'Inter, sans-serif', letterSpacing: '0.5px',
                    }}>
                      {toonAfgerond[b.id] ? '▾' : '▸'} Afgerond ({klaar.length})
                    </button>
                    {toonAfgerond[b.id] && klaar.map(t => (
                      <div key={t.id} style={{
                        background: '#fff', borderRadius: '8px', border: '1px solid #eee', padding: '8px 12px',
                        marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px',
                      }}>
                        <button title="Terugzetten" onClick={() => wijzig(t.id, { gedaan: false })} style={{
                          width: '16px', height: '16px', borderRadius: '50%', border: 'none', background: '#2e7d32',
                          color: '#fff', fontSize: '10px', lineHeight: '16px', cursor: 'pointer', flexShrink: 0, padding: 0,
                        }}>✓</button>
                        <span style={{ flex: 1, fontSize: '12px', color: '#aaa', textDecoration: 'line-through' }}>{t.tekst}</span>
                        <button onClick={() => verwijder(t)} style={{ border: 'none', background: 'none', color: '#ccc', cursor: 'pointer', fontSize: '13px', padding: 0 }}>×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {/* Nieuwe kolom */}
        <div style={{ width: KOLOM_BREEDTE, flexShrink: 0 }}>
          {kolomToevoegen ? (
            <div style={{ background: 'rgba(1,3,65,0.04)', borderRadius: '10px', padding: '10px' }}>
              <input autoFocus style={{ ...AS.input, marginBottom: '8px' }} placeholder="Naam van de kolom" value={kolomNaam}
                onChange={e => setKolomNaam(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') maakKolom(); if (e.key === 'Escape') setKolomToevoegen(false) }} />
              <div style={{ display: 'flex', gap: '6px' }}>
                <button style={AS.btnSm} onClick={maakKolom}>Aanmaken</button>
                <button style={{ ...AS.btnSm, borderColor: '#ccc', color: '#999' }} onClick={() => setKolomToevoegen(false)}>Annuleer</button>
              </div>
            </div>
          ) : (
            <button onClick={() => { setKolomToevoegen(true); setKolomNaam('') }} style={{
              width: '100%', padding: '12px', border: '1px dashed rgba(1,3,65,0.25)', borderRadius: '10px',
              background: 'transparent', color: '#888', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
              fontFamily: 'Inter, sans-serif', letterSpacing: '0.5px',
            }}>+ Nieuwe kolom</button>
          )}
        </div>
      </div>
    </>
  )
}
