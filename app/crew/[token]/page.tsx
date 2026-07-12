'use client'
// Publieke roosterpagina voor crewleden. Bereikbaar via een persoonlijke link
// (publiek token), zonder login. De RPC crew_mijn_rooster geeft server-side
// alleen het eigen rooster terug, meer data is met deze link niet op te vragen.
import { use, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Rij = {
  lid_naam: string
  rol: string
  dag: 'fri' | 'sat' | 'sun'
  start_tijd: string
  eind_tijd: string
  locatie: string | null
  contactpersoon: string | null
  opmerking: string | null
}

const DAGEN: { code: 'fri' | 'sat' | 'sun'; label: string }[] = [
  { code: 'fri', label: 'Vrijdag 6 november' },
  { code: 'sat', label: 'Zaterdag 7 november' },
  { code: 'sun', label: 'Zondag 8 november' },
]

const tijd = (iso: string) =>
  new Date(iso).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' })

const fraunces = 'Fraunces, Georgia, serif'
const inter = 'Inter, sans-serif'

export default function CrewRoosterPagina({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [rijen, setRijen] = useState<Rij[] | null>(null)
  const [fout, setFout] = useState(false)

  useEffect(() => {
    let weg = false
    supabase.rpc('crew_mijn_rooster', { p_token: token }).then(({ data, error }) => {
      if (weg) return
      if (error || !data || (data as Rij[]).length === 0) { setFout(true); return }
      setRijen(data as Rij[])
    })
    return () => { weg = true }
  }, [token])

  const wrap: React.CSSProperties = {
    maxWidth: '480px', margin: '0 auto', padding: '20px 16px 40px', fontFamily: inter, color: 'var(--navy)',
  }

  if (fout) {
    return (
      <div style={wrap}>
        <div style={{ background: 'var(--navy)', borderRadius: '16px', padding: '32px 24px', color: 'var(--cream)', textAlign: 'center', marginTop: '40px' }}>
          <div style={{ fontSize: '10px', letterSpacing: '3px', textTransform: 'uppercase', color: 'var(--gold)', fontWeight: 700, marginBottom: '14px' }}>
            Nacht van de Wijn · Crew
          </div>
          <h1 style={{ fontFamily: fraunces, fontSize: '24px', fontWeight: 700, margin: '0 0 10px' }}>
            Deze link klopt niet meer.
          </h1>
          <p style={{ fontSize: '14px', opacity: 0.85, margin: 0 }}>
            Vraag de organisatie om een nieuwe.
          </p>
        </div>
      </div>
    )
  }

  if (!rijen) {
    return (
      <div style={wrap}>
        <p style={{ textAlign: 'center', color: '#888', marginTop: '60px', fontSize: '14px' }}>Rooster laden...</p>
      </div>
    )
  }

  const voornaam = rijen[0].lid_naam.split(' ')[0]
  const totaal = rijen.length

  return (
    <div style={wrap}>
      <div style={{ background: 'var(--navy)', borderRadius: '16px', padding: '28px 24px', color: 'var(--cream)', marginBottom: '24px' }}>
        <div style={{ fontSize: '10px', letterSpacing: '3px', textTransform: 'uppercase', color: 'var(--gold)', fontWeight: 700, marginBottom: '10px' }}>
          Nacht van de Wijn · Crew
        </div>
        <h1 style={{ fontFamily: fraunces, fontSize: '30px', fontWeight: 700, margin: '0 0 8px', lineHeight: 1.15 }}>
          Hoi {voornaam}
        </h1>
        <p style={{ fontSize: '13px', opacity: 0.85, margin: 0, lineHeight: 1.5 }}>
          Dit is jouw rooster voor editie 7 in de Werkspoorkathedraal, Utrecht.
          Je staat op {totaal} {totaal === 1 ? 'shift' : 'shifts'}.
        </p>
      </div>

      {DAGEN.map(d => {
        const vanDag = rijen.filter(r => r.dag === d.code)
        if (vanDag.length === 0) return null
        return (
          <section key={d.code} style={{ marginBottom: '24px' }}>
            <h2 style={{ fontFamily: fraunces, fontSize: '19px', fontWeight: 700, color: 'var(--navy)', margin: '0 0 10px 4px' }}>
              {d.label}
            </h2>
            {vanDag.map((r, i) => (
              <div key={i} style={{ background: '#fffdf9', borderRadius: '12px', border: '1px solid rgba(1,3,65,0.08)', borderLeft: '4px solid var(--bordeaux)', padding: '16px 18px', marginBottom: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <div style={{ fontSize: '10px', letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--bordeaux)', fontWeight: 700, marginBottom: '4px' }}>
                  {r.rol}
                </div>
                <div style={{ fontFamily: fraunces, fontSize: '20px', fontWeight: 700, color: 'var(--navy)', marginBottom: '8px' }}>
                  {tijd(r.start_tijd)} tot {tijd(r.eind_tijd)}
                </div>
                {r.locatie && (
                  <div style={{ fontSize: '13px', marginBottom: '3px' }}>
                    <strong>Waar:</strong> {r.locatie}
                  </div>
                )}
                {r.contactpersoon && (
                  <div style={{ fontSize: '13px', marginBottom: '3px' }}>
                    <strong>Contact:</strong> {r.contactpersoon}
                  </div>
                )}
                {r.opmerking && (
                  <div style={{ fontSize: '13px', color: '#666', fontStyle: 'italic', marginTop: '6px' }}>
                    {r.opmerking}
                  </div>
                )}
              </div>
            ))}
          </section>
        )
      })}

      <p style={{ textAlign: 'center', fontSize: '13px', color: '#888', marginTop: '32px', lineHeight: 1.6 }}>
        Vragen? App je contactpersoon of de organisatie.
      </p>
    </div>
  )
}
