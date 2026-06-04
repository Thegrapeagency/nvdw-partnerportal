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
    if (error) {
      setError('E-mail of wachtwoord klopt niet.')
      setLoading(false)
      return
    }
    if (email === process.env.NEXT_PUBLIC_ADMIN_EMAIL) {
      router.push('/admin')
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--navy)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: '420px', padding: '0 24px' }}>
        {/* Logo area */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{
            fontFamily: 'Raleway, sans-serif',
            fontSize: '11px',
            fontWeight: '700',
            letterSpacing: '3px',
            textTransform: 'uppercase',
            color: 'var(--gold)',
            marginBottom: '8px'
          }}>
            Nacht van de Wijn 2026
          </div>
          <div style={{
            fontFamily: 'Raleway, sans-serif',
            fontSize: '28px',
            fontWeight: '800',
            textTransform: 'uppercase',
            color: 'var(--cream)',
            letterSpacing: '2px'
          }}>
            Partner Portal
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.1)',
          padding: '36px',
          borderRadius: '2px'
        }}>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--sand)', marginBottom: '8px' }}>
              E-mailadres
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '12px 14px',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.15)',
                color: 'white',
                fontSize: '14px',
                fontFamily: 'Raleway, sans-serif',
                outline: 'none',
                borderRadius: '2px'
              }}
            />
          </div>
          <div style={{ marginBottom: '28px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--sand)', marginBottom: '8px' }}>
              Wachtwoord
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '12px 14px',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.15)',
                color: 'white',
                fontSize: '14px',
                fontFamily: 'Raleway, sans-serif',
                outline: 'none',
                borderRadius: '2px'
              }}
            />
          </div>
          {error && (
            <div style={{ background: 'rgba(155,55,55,0.3)', border: '1px solid var(--bordeaux)', padding: '10px 14px', marginBottom: '20px', fontSize: '13px', color: '#ffaaaa', borderRadius: '2px' }}>
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '14px',
              background: 'var(--gold)',
              color: 'var(--navy)',
              border: 'none',
              fontFamily: 'Raleway, sans-serif',
              fontSize: '13px',
              fontWeight: '800',
              letterSpacing: '2px',
              textTransform: 'uppercase',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
              borderRadius: '2px'
            }}
          >
            {loading ? 'Inloggen...' : 'Inloggen'}
          </button>
        </form>
        <p style={{ textAlign: 'center', marginTop: '20px', fontSize: '12px', color: 'rgba(255,255,255,0.3)' }}>
          Nog geen toegang? Neem contact op met Milan.
        </p>
      </div>
    </div>
  )
}
