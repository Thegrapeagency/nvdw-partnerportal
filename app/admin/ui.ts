// Gedeelde admin-styling en helpers, zodat losse modules (Programma, Crew,
// Financieel, ...) er hetzelfde uitzien als de tabs in page.tsx.
import type React from 'react'

export const AS = {
  title: { fontFamily: 'Fraunces, Georgia, serif', fontSize: '24px', fontWeight: '700', letterSpacing: '0', color: 'var(--navy)', marginBottom: '6px' } as React.CSSProperties,
  sub: { fontSize: '13px', color: '#888', marginBottom: '24px' } as React.CSSProperties,
  card: { background: 'var(--card)', padding: '24px', marginBottom: '16px', borderRadius: '14px', border: '1px solid rgba(1,3,65,0.08)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' } as React.CSSProperties,
  cardTitle: { fontSize: '11px', fontWeight: '700', letterSpacing: '2px', textTransform: 'uppercase' as const, color: 'var(--bordeaux)', marginBottom: '16px' } as React.CSSProperties,
  label: { display: 'block', fontSize: '11px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase' as const, color: '#666', marginBottom: '6px', marginTop: '12px' } as React.CSSProperties,
  input: { width: '100%', padding: '9px 12px', border: '1px solid #ddd', fontSize: '13px', fontFamily: 'Inter, sans-serif', outline: 'none', borderRadius: '2px', color: 'var(--navy)', background: '#fff' } as React.CSSProperties,
  btn: { padding: '10px 20px', background: 'var(--navy)', color: 'var(--cream)', border: 'none', fontSize: '11px', fontWeight: '700', letterSpacing: '2px', textTransform: 'uppercase' as const, cursor: 'pointer', fontFamily: 'Inter, sans-serif', borderRadius: '2px', marginTop: '16px' } as React.CSSProperties,
  btnSm: { padding: '6px 12px', background: 'transparent', color: 'var(--bordeaux)', border: '1px solid var(--bordeaux)', fontSize: '10px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase' as const, cursor: 'pointer', borderRadius: '2px' } as React.CSSProperties,
  btnGold: { padding: '10px 20px', background: 'var(--gold)', color: 'var(--navy)', border: 'none', fontSize: '11px', fontWeight: '700', letterSpacing: '2px', textTransform: 'uppercase' as const, cursor: 'pointer', fontFamily: 'Inter, sans-serif', borderRadius: '2px', marginTop: '16px' } as React.CSSProperties,
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' } as React.CSSProperties,
  grid3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' } as React.CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: '13px' } as React.CSSProperties,
  th: { textAlign: 'left' as const, fontSize: '10px', fontWeight: '700', letterSpacing: '2px', textTransform: 'uppercase' as const, color: '#999', padding: '8px 12px', borderBottom: '2px solid #eee' } as React.CSSProperties,
  td: { padding: '10px 12px', borderBottom: '1px solid #f0f0f0', color: 'var(--navy)', verticalAlign: 'top' as const } as React.CSSProperties,
}

export const PROGRAMMA_DAGEN: { value: 'fri' | 'sat' | 'sun'; label: string; datum: string }[] = [
  { value: 'fri', label: 'Vrijdag 6 nov', datum: '2026-11-06' },
  { value: 'sat', label: 'Zaterdag 7 nov', datum: '2026-11-07' },
  { value: 'sun', label: 'Zondag 8 nov', datum: '2026-11-08' },
]

export const euro = (cents: number) => '€' + (cents / 100).toFixed(2).replace('.', ',')
export const tijdUit = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' }) : ''
