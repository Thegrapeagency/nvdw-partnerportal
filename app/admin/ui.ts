// Gedeelde admin-styling en helpers, zodat losse modules (Programma, Crew,
// Financieel, ...) er hetzelfde uitzien als de tabs in page.tsx.
import type React from 'react'

// Zelfde rustige SaaS-look als S in page.tsx: kleur als accent, zachte
// kaarten, ronde hoeken, geen schreeuwende uppercase meer.
export const AS = {
  title: { fontFamily: 'Fraunces, Georgia, serif', fontSize: '25px', fontWeight: '700', letterSpacing: '-0.3px', color: 'var(--navy)', marginBottom: '5px' } as React.CSSProperties,
  sub: { fontSize: '13px', color: '#8b8574', marginBottom: '22px' } as React.CSSProperties,
  card: { background: 'var(--card)', padding: '22px 24px', marginBottom: '14px', borderRadius: '16px', border: '1px solid rgba(1,3,65,0.06)', boxShadow: '0 1px 2px rgba(1,3,65,0.04), 0 6px 20px rgba(1,3,65,0.03)' } as React.CSSProperties,
  cardTitle: { fontSize: '13.5px', fontWeight: '700', letterSpacing: '-0.1px', color: 'var(--navy)', marginBottom: '14px' } as React.CSSProperties,
  label: { display: 'block', fontSize: '12px', fontWeight: '600', letterSpacing: '0', color: '#777162', marginBottom: '5px', marginTop: '12px' } as React.CSSProperties,
  input: { width: '100%', padding: '8px 12px', border: '1px solid #e3dcc9', fontSize: '13px', fontFamily: 'Inter, sans-serif', outline: 'none', borderRadius: '9px', color: 'var(--navy)', background: '#fff' } as React.CSSProperties,
  btn: { padding: '9px 18px', background: 'var(--navy)', color: 'var(--cream)', border: 'none', fontSize: '13px', fontWeight: '600', letterSpacing: '0.1px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', borderRadius: '9px', marginTop: '16px' } as React.CSSProperties,
  btnSm: { padding: '5px 12px', background: 'transparent', color: 'var(--bordeaux)', border: '1px solid rgba(155,55,55,0.35)', fontSize: '12px', fontWeight: '600', letterSpacing: '0.1px', cursor: 'pointer', borderRadius: '8px' } as React.CSSProperties,
  btnGold: { padding: '9px 18px', background: 'var(--gold)', color: 'var(--navy)', border: 'none', fontSize: '13px', fontWeight: '600', letterSpacing: '0.1px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', borderRadius: '9px', marginTop: '16px' } as React.CSSProperties,
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' } as React.CSSProperties,
  grid3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' } as React.CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: '13px' } as React.CSSProperties,
  th: { textAlign: 'left' as const, fontSize: '11px', fontWeight: '600', letterSpacing: '0.3px', color: '#9a9484', padding: '8px 12px', borderBottom: '1px solid rgba(1,3,65,0.1)' } as React.CSSProperties,
  td: { padding: '11px 12px', borderBottom: '1px solid rgba(1,3,65,0.05)', color: 'var(--navy)', verticalAlign: 'top' as const } as React.CSSProperties,
}

export const PROGRAMMA_DAGEN: { value: 'fri' | 'sat' | 'sun'; label: string; datum: string }[] = [
  { value: 'fri', label: 'Vrijdag 6 nov', datum: '2026-11-06' },
  { value: 'sat', label: 'Zaterdag 7 nov', datum: '2026-11-07' },
  { value: 'sun', label: 'Zondag 8 nov', datum: '2026-11-08' },
]

// Opent de carousel-generator op de site met de aankondigingstekst al in het
// AI-vak. Eén klik op "Genereer slides" daar en de social post staat klaar.
export const carouselUrl = (tekst: string) =>
  'https://www.nachtvandewijn.nl/tools/carousel-generator?tekst=' + encodeURIComponent(tekst)

export const euro = (cents: number) => '€' + (cents / 100).toFixed(2).replace('.', ',')
export const tijdUit = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' }) : ''
