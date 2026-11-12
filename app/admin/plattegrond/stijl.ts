// Eigen UI-stijl van de tekenaar. Kleuren en lettertypes komen uit het thema
// van de app (Adapter.thema) via CSS-variabelen op de wrapper.
import type React from 'react'

export const AS = {
  title: { fontFamily: 'var(--pg-serif)', fontSize: '25px', fontWeight: 700, letterSpacing: '-0.3px', color: 'var(--pg-inkt)', marginBottom: '5px' } as React.CSSProperties,
  sub: { fontSize: '13px', color: '#8b8574', marginBottom: '22px' } as React.CSSProperties,
  card: { background: 'var(--pg-kaart)', padding: '22px 24px', marginBottom: '14px', borderRadius: '16px', border: '1px solid rgba(0,0,0,0.07)', boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 6px 20px rgba(0,0,0,0.03)' } as React.CSSProperties,
  cardTitle: { fontSize: '13.5px', fontWeight: 700, letterSpacing: '-0.1px', color: 'var(--pg-inkt)', marginBottom: '14px' } as React.CSSProperties,
  input: { width: '100%', padding: '8px 12px', border: '1px solid #e3dcc9', fontSize: '13px', fontFamily: 'var(--pg-sans)', outline: 'none', borderRadius: '9px', color: 'var(--pg-inkt)', background: '#fff', boxSizing: 'border-box' } as React.CSSProperties,
  btn: { padding: '9px 18px', background: 'var(--pg-inkt)', color: 'var(--pg-papier)', border: 'none', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--pg-sans)', borderRadius: '9px', marginTop: '16px' } as React.CSSProperties,
  btnSm: { padding: '5px 12px', background: 'transparent', color: 'var(--pg-accent)', border: '1px solid color-mix(in srgb, var(--pg-accent) 35%, transparent)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', borderRadius: '8px', fontFamily: 'var(--pg-sans)' } as React.CSSProperties,
}
