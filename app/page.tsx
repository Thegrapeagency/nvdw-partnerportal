'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [hulpBezig, setHulpBezig] = useState(false)
  const [hulpMelding, setHulpMelding] = useState('')
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setHulpMelding('')
    // Wachtwoorden worden vaak uit een mail of chat geplakt. Een spatie of
    // regeleinde die daarbij meekomt, of een hoofdletter die de telefoon er
    // zelf van maakt, kostte tot nu toe een rondje heen en weer met de
    // organisatie. Daarom hier normaliseren in plaats van het af te wijzen.
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password: password.trim(),
    })
    if (error) {
      setError('E-mail of wachtwoord klopt niet. Plakken uit een chat gaat vaak mis, vraag hieronder een nieuwe link aan.')
      setLoading(false)
      return
    }
    const { data: isAdmin } = await supabase.rpc('is_admin')
    if (isAdmin) router.push('/admin')
    else router.push('/dashboard')
  }

  // Zelf een verse wachtwoordlink aanvragen. De route antwoordt bewust altijd
  // hetzelfde, zodat je er niet mee kunt uitvissen welke adressen bestaan.
  const vraagLink = async () => {
    const adres = email.trim().toLowerCase()
    if (!adres) { setHulpMelding('Vul eerst je e-mailadres in, dan sturen we je een nieuwe link.'); return }
    setHulpBezig(true)
    setError('')
    try {
      await fetch('/api/hulp-inloggen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: adres }),
      })
    } catch { /* de melding hieronder blijft hetzelfde */ }
    setHulpBezig(false)
    setHulpMelding(`Als ${adres} bij ons bekend is, staat er binnen een paar minuten een mail met een nieuwe link in de inbox. Kijk ook even in de spam.`)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--sand)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
      <div style={{ width: '100%', maxWidth: '380px' }}>

        {/* Wordmark */}
        <div style={{ marginBottom: '40px' }}>
          <div style={{ fontSize: '11px', fontWeight: '500', letterSpacing: '3px', textTransform: 'uppercase', color: 'var(--bordeaux)', marginBottom: '10px' }}>
            Partner Portal
          </div>
          <div style={{ fontFamily: 'GoboldBlocky, sans-serif', fontSize: '32px', textTransform: 'uppercase', letterSpacing: '0', color: 'var(--navy)', lineHeight: 1 }}>
            Nacht van<br />de Wijn
          </div>
          <div style={{ fontSize: '12px', color: 'rgba(1,3,65,0.4)', marginTop: '8px' }}>
            6, 7 & 8 november 2026 — Utrecht
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(1,3,65,0.5)', marginBottom: '6px' }}>
              E-mailadres
            </label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)} required
              autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false}
              style={{ width: '100%', padding: '11px 14px', background: '#fff', border: '1px solid rgba(1,3,65,0.15)', borderRadius: '10px', color: 'var(--navy)', fontSize: '14px', outline: 'none' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(1,3,65,0.5)', marginBottom: '6px' }}>
              Wachtwoord
            </label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)} required
              autoComplete="current-password" autoCapitalize="none" autoCorrect="off" spellCheck={false}
              style={{ width: '100%', padding: '11px 14px', background: '#fff', border: '1px solid rgba(1,3,65,0.15)', borderRadius: '10px', color: 'var(--navy)', fontSize: '14px', outline: 'none' }}
            />
          </div>
          {error && <div style={{ fontSize: '13px', color: 'var(--bordeaux)', padding: '10px 0' }}>{error}</div>}
          <button type="submit" disabled={loading} style={{ padding: '12px', background: 'var(--navy)', color: 'var(--cream)', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: '600', letterSpacing: '0.2px', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1, marginTop: '4px' }}>
            {loading ? 'Laden...' : 'Inloggen'}
          </button>
        </form>

        {/* Zelfbediening bij een wachtwoord dat niet werkt. Zonder dit belandt
            elke mislukte login bij de organisatie in de app. */}
        <div style={{ marginTop: '20px', textAlign: 'center' }}>
          <button type="button" onClick={vraagLink} disabled={hulpBezig}
            style={{ background: 'none', border: 'none', padding: '6px', fontSize: '13px', color: 'var(--bordeaux)', fontWeight: 600, cursor: hulpBezig ? 'default' : 'pointer', textDecoration: 'underline' }}>
            {hulpBezig ? 'Bezig...' : 'Wachtwoord vergeten of werkt je wachtwoord niet?'}
          </button>
          {hulpMelding && (
            <div style={{ fontSize: '12px', color: 'var(--navy)', background: 'rgba(1,3,65,0.05)', borderRadius: '10px', padding: '10px 12px', marginTop: '8px', lineHeight: 1.6 }}>
              {hulpMelding}
            </div>
          )}
        </div>

        <p style={{ marginTop: '16px', fontSize: '12px', color: 'rgba(1,3,65,0.35)', textAlign: 'center' }}>
          Lukt het dan nog niet? Mail naar info@nachtvandewijn.nl
        </p>
      </div>
    </div>
  )
}
