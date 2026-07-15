'use client'
// Publieke roosterpagina voor crewleden. Bereikbaar via een persoonlijke link
// (publiek token), zonder login. De RPC crew_zelf_overzicht geeft server-side
// alleen het eigen rooster + open shifts terug; meer is met deze link niet op
// te vragen. Vrijwilligers plannen zichzelf in via crew_zelf_inroosteren/
// crew_zelf_uitschrijven (de overlap-trigger blijft gewoon van kracht).
import { use, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type MijnShift = {
  shift_id: string; rol: string; dag: 'fri' | 'sat' | 'sun'
  start_tijd: string; eind_tijd: string
  locatie: string | null; contactpersoon: string | null; opmerking: string | null
}
type OpenShift = {
  shift_id: string; rol: string; dag: 'fri' | 'sat' | 'sun'
  start_tijd: string; eind_tijd: string; locatie: string | null
  tekort: number; matched_rol: boolean
}
type Overzicht = { geldig: boolean; naam?: string; mijn_shifts?: MijnShift[]; open_shifts?: OpenShift[] }

const DAGEN: { code: 'fri' | 'sat' | 'sun'; label: string }[] = [
  { code: 'fri', label: 'Vrijdag 6 november' },
  { code: 'sat', label: 'Zaterdag 7 november' },
  { code: 'sun', label: 'Zondag 8 november' },
]

const tijd = (iso: string) =>
  new Date(iso).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' })

const fraunces = 'Fraunces, Georgia, serif'
const inter = 'Inter, sans-serif'

const FOUT_LABEL: Record<string, string> = {
  ONGELDIGE_LINK: 'Deze link klopt niet meer.',
  SHIFT_VOL: 'Deze shift is net vol geraakt. Kies een andere.',
  SHIFT_NIET_GEVONDEN: 'Deze shift bestaat niet meer.',
}

export default function CrewRoosterPagina({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [data, setData] = useState<Overzicht | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [melding, setMelding] = useState<string | null>(null)

  const laad = async () => {
    const { data: res, error } = await supabase.rpc('crew_zelf_overzicht', { p_token: token })
    setData(error || !res ? { geldig: false } : (res as Overzicht))
  }
  useEffect(() => { laad() }, [token])

  const foutTekst = (msg: string) => {
    const code = Object.keys(FOUT_LABEL).find(k => msg.includes(k))
    return (code && FOUT_LABEL[code]) || 'Dat lukte niet. Probeer het opnieuw.'
  }

  const meldAan = async (shiftId: string) => {
    setBusyId(shiftId); setMelding(null)
    const { error } = await supabase.rpc('crew_zelf_inroosteren', { p_token: token, p_shift_id: shiftId })
    setBusyId(null)
    if (error) { setMelding(foutTekst(error.message)); return }
    setMelding('Ingepland. Staat hierboven bij jouw rooster.')
    await laad()
  }

  const meldAf = async (shiftId: string) => {
    if (!confirm('Van deze shift afmelden?')) return
    setBusyId(shiftId); setMelding(null)
    const { error } = await supabase.rpc('crew_zelf_uitschrijven', { p_token: token, p_shift_id: shiftId })
    setBusyId(null)
    if (error) { setMelding('Afmelden lukte niet, probeer het opnieuw.'); return }
    await laad()
  }

  const wrap: React.CSSProperties = {
    maxWidth: '480px', margin: '0 auto', padding: '20px 16px 40px', fontFamily: inter, color: 'var(--navy)',
  }
  const kaart = (bg: string, kleur: string): React.CSSProperties => ({
    background: bg, borderRadius: '12px', border: '1px solid rgba(1,3,65,0.08)', borderLeft: `4px solid ${kleur}`,
    padding: '16px 18px', marginBottom: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  })
  const knop = (kleur: string): React.CSSProperties => ({
    marginTop: '10px', padding: '9px 16px', fontSize: '12px', fontWeight: 700, letterSpacing: '0.5px',
    border: 'none', borderRadius: '8px', background: kleur, color: '#fff', cursor: 'pointer',
  })

  if (!data) {
    return <div style={wrap}><p style={{ textAlign: 'center', color: '#888', marginTop: '60px', fontSize: '14px' }}>Rooster laden...</p></div>
  }

  if (!data.geldig) {
    return (
      <div style={wrap}>
        <div style={{ background: 'var(--navy)', borderRadius: '16px', padding: '32px 24px', color: 'var(--cream)', textAlign: 'center', marginTop: '40px' }}>
          <div style={{ fontSize: '10px', letterSpacing: '3px', textTransform: 'uppercase', color: 'var(--gold)', fontWeight: 700, marginBottom: '14px' }}>
            Nacht van de Wijn · Crew
          </div>
          <h1 style={{ fontFamily: fraunces, fontSize: '24px', fontWeight: 700, margin: '0 0 10px' }}>Deze link klopt niet meer.</h1>
          <p style={{ fontSize: '14px', opacity: 0.85, margin: 0 }}>Vraag de organisatie om een nieuwe.</p>
        </div>
      </div>
    )
  }

  const mijnShifts = data.mijn_shifts || []
  const openShifts = (data.open_shifts || []).slice().sort((a, b) => (a.matched_rol === b.matched_rol ? 0 : a.matched_rol ? -1 : 1))
  const voornaam = (data.naam || '').split(' ')[0]

  return (
    <div style={wrap}>
      <div style={{ background: 'var(--navy)', borderRadius: '16px', padding: '28px 24px', color: 'var(--cream)', marginBottom: '24px' }}>
        <div style={{ fontSize: '10px', letterSpacing: '3px', textTransform: 'uppercase', color: 'var(--gold)', fontWeight: 700, marginBottom: '10px' }}>
          Nacht van de Wijn · Crew
        </div>
        <h1 style={{ fontFamily: fraunces, fontSize: '30px', fontWeight: 700, margin: '0 0 8px', lineHeight: 1.15 }}>Hoi {voornaam}</h1>
        <p style={{ fontSize: '13px', opacity: 0.85, margin: 0, lineHeight: 1.5 }}>
          Dit is jouw rooster voor editie 7 in de Werkspoorkathedraal, Utrecht.{' '}
          {mijnShifts.length > 0
            ? `Je staat op ${mijnShifts.length} ${mijnShifts.length === 1 ? 'shift' : 'shifts'}.`
            : 'Je staat nog nergens ingepland, kies hieronder een open shift.'}
        </p>
      </div>

      {melding && (
        <div style={{ background: '#fff3e0', border: '1px solid #ffe0b2', borderRadius: '10px', padding: '12px 16px', fontSize: '13px', color: '#e65100', marginBottom: '20px' }}>
          {melding}
        </div>
      )}

      {mijnShifts.length > 0 && (
        <section style={{ marginBottom: '28px' }}>
          <h2 style={{ fontFamily: fraunces, fontSize: '19px', fontWeight: 700, color: 'var(--navy)', margin: '0 0 10px 4px' }}>Mijn rooster</h2>
          {DAGEN.map(d => {
            const vanDag = mijnShifts.filter(r => r.dag === d.code)
            if (vanDag.length === 0) return null
            return (
              <div key={d.code}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#888', margin: '10px 0 6px 4px', textTransform: 'uppercase', letterSpacing: '1px' }}>{d.label}</div>
                {vanDag.map(r => (
                  <div key={r.shift_id} style={kaart('#fffdf9', 'var(--bordeaux)')}>
                    <div style={{ fontSize: '10px', letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--bordeaux)', fontWeight: 700, marginBottom: '4px' }}>{r.rol}</div>
                    <div style={{ fontFamily: fraunces, fontSize: '20px', fontWeight: 700, color: 'var(--navy)', marginBottom: '8px' }}>{tijd(r.start_tijd)} tot {tijd(r.eind_tijd)}</div>
                    {r.locatie && <div style={{ fontSize: '13px', marginBottom: '3px' }}><strong>Waar:</strong> {r.locatie}</div>}
                    {r.contactpersoon && <div style={{ fontSize: '13px', marginBottom: '3px' }}><strong>Contact:</strong> {r.contactpersoon}</div>}
                    {r.opmerking && <div style={{ fontSize: '13px', color: '#666', fontStyle: 'italic', marginTop: '6px' }}>{r.opmerking}</div>}
                    <button style={{ ...knop('transparent'), color: 'var(--bordeaux)', border: '1px solid var(--bordeaux)', background: 'none' }} disabled={busyId === r.shift_id} onClick={() => meldAf(r.shift_id)}>
                      {busyId === r.shift_id ? 'Bezig...' : 'Ik kan toch niet'}
                    </button>
                  </div>
                ))}
              </div>
            )
          })}
        </section>
      )}

      <section>
        <h2 style={{ fontFamily: fraunces, fontSize: '19px', fontWeight: 700, color: 'var(--navy)', margin: '0 0 10px 4px' }}>Open shifts</h2>
        {openShifts.length === 0 ? (
          <p style={{ fontSize: '13px', color: '#888', padding: '0 4px' }}>Op dit moment geen open shifts meer. Kijk later nog eens terug.</p>
        ) : (
          DAGEN.map(d => {
            const vanDag = openShifts.filter(r => r.dag === d.code)
            if (vanDag.length === 0) return null
            return (
              <div key={d.code}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#888', margin: '10px 0 6px 4px', textTransform: 'uppercase', letterSpacing: '1px' }}>{d.label}</div>
                {vanDag.map(r => (
                  <div key={r.shift_id} style={kaart('#fff', r.matched_rol ? '#2e7d32' : '#ccc')}>
                    <div style={{ fontSize: '10px', letterSpacing: '2px', textTransform: 'uppercase', color: r.matched_rol ? '#2e7d32' : '#888', fontWeight: 700, marginBottom: '4px' }}>
                      {r.rol}{r.matched_rol ? ' · past bij jouw rol' : ''}
                    </div>
                    <div style={{ fontFamily: fraunces, fontSize: '20px', fontWeight: 700, color: 'var(--navy)', marginBottom: '8px' }}>{tijd(r.start_tijd)} tot {tijd(r.eind_tijd)}</div>
                    {r.locatie && <div style={{ fontSize: '13px', marginBottom: '3px' }}><strong>Waar:</strong> {r.locatie}</div>}
                    <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>Nog {r.tekort} {r.tekort === 1 ? 'plek' : 'plekken'} nodig</div>
                    <button style={knop('var(--navy)')} disabled={busyId === r.shift_id} onClick={() => meldAan(r.shift_id)}>
                      {busyId === r.shift_id ? 'Bezig...' : 'Meld je aan'}
                    </button>
                  </div>
                ))}
              </div>
            )
          })
        )}
      </section>

      <p style={{ textAlign: 'center', fontSize: '13px', color: '#888', marginTop: '32px', lineHeight: 1.6 }}>
        Vragen? App je contactpersoon of de organisatie.
      </p>
    </div>
  )
}
