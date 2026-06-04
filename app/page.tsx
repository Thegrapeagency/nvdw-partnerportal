'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError('E-mail of wachtwoord klopt niet.'); setLoading(false); return }
    const { data: { user } } = await supabase.auth.getUser()
    if (user?.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL) router.push('/admin')
    else router.push('/dashboard')
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
              style={{ width: '100%', padding: '11px 14px', background: 'var(--cream)', border: '1px solid rgba(1,3,65,0.15)', color: 'var(--navy)', fontSize: '14px', outline: 'none' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(1,3,65,0.5)', marginBottom: '6px' }}>
              Wachtwoord
            </label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)} required
              style={{ width: '100%', padding: '11px 14px', background: 'var(--cream)', border: '1px solid rgba(1,3,65,0.15)', color: 'var(--navy)', fontSize: '14px', outline: 'none' }}
            />
          </div>
          {error && <div style={{ fontSize: '13px', color: 'var(--bordeaux)', padding: '10px 0' }}>{error}</div>}
          <button type="submit" disabled={loading} style={{ padding: '12px', background: 'var(--navy)', color: 'var(--cream)', border: 'none', fontSize: '11px', fontWeight: '600', letterSpacing: '2px', textTransform: 'uppercase', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1, marginTop: '4px' }}>
            {loading ? 'Laden...' : 'Inloggen'}
          </button>
        </form>

        <p style={{ marginTop: '24px', fontSize: '12px', color: 'rgba(1,3,65,0.35)', textAlign: 'center' }}>
          Geen toegang? Mail naar info@nachtvandewijn.nl
        </p>
      </div>
    </div>
  )
}
