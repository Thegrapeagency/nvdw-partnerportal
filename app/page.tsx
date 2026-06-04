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
    <div style={{
      minHeight: '100vh',
      background: 'var(--sand)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 24px',
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '48px' }}>
        <div style={{
          fontFamily: 'Inter, sans-serif',
          fontSize: '10px',
          fontWeight: '700',
          letterSpacing: '3px',
          textTransform: 'uppercase',
          color: 'var(--bordeaux)',
          marginBottom: '12px',
        }}>
          Nacht van de Wijn — Editie 7
        </div>
        <div style={{
          fontFamily: 'GoboldBlocky, Inter, sans-serif',
          fontSize: '36px',
          fontWeight: '900',
          textTransform: 'uppercase',
          letterSpacing: '0',
          color: 'var(--navy)',
          lineHeight: '1',
          marginBottom: '4px',
        }}>
          Partner
        </div>
        <div style={{
          display: 'inline-block',
          background: 'var(--bordeaux)',
          padding: '4px 14px 3px',
        }}>
          <span style={{
            fontFamily: 'GoboldBlocky, Inter, sans-serif',
            fontSize: '36px',
            fontWeight: '900',
            textTransform: 'uppercase',
            letterSpacing: '0',
            color: 'var(--cream)',
            lineHeight: '1',
          }}>Portal</span>
        </div>
        <div style={{ marginTop: '16px', fontSize: '13px', color: 'var(--midnight)', fontFamily: 'Fraunces, serif', fontStyle: 'italic' }}>
          6, 7 & 8 november 2026 — Werkspoorkathedraal Utrecht
        </div>
      </div>

      {/* Form */}
      <div style={{
        width: '100%',
        maxWidth: '400px',
        background: 'var(--cream)',
        border: '1px solid rgba(1,3,65,0.12)',
        padding: '36px',
      }}>
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: '20px' }}>
            <label style={{
              display: 'block',
              fontFamily: 'Inter, sans-serif',
              fontSize: '10px',
              fontWeight: '700',
              letterSpacing: '2px',
              textTransform: 'uppercase',
              color: 'var(--navy)',
              marginBottom: '8px',
            }}>
              E-mailadres
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '11px 14px',
                background: 'var(--sand)',
                border: '1px solid rgba(1,3,65,0.2)',
                color: 'var(--navy)',
                fontSize: '14px',
                fontFamily: 'Inter, sans-serif',
                outline: 'none',
              }}
            />
          </div>
          <div style={{ marginBottom: '28px' }}>
            <label style={{
              display: 'block',
              fontFamily: 'Inter, sans-serif',
              fontSize: '10px',
              fontWeight: '700',
              letterSpacing: '2px',
              textTransform: 'uppercase',
              color: 'var(--navy)',
              marginBottom: '8px',
            }}>
              Wachtwoord
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '11px 14px',
                background: 'var(--sand)',
                border: '1px solid rgba(1,3,65,0.2)',
                color: 'var(--navy)',
                fontSize: '14px',
                fontFamily: 'Inter, sans-serif',
                outline: 'none',
              }}
            />
          </div>
          {error && (
            <div style={{
              background: 'rgba(155,55,55,0.1)',
              border: '1px solid var(--bordeaux)',
              padding: '10px 14px',
              marginBottom: '20px',
              fontSize: '13px',
              color: 'var(--bordeaux)',
              fontFamily: 'Inter, sans-serif',
            }}>
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '13px',
              background: 'var(--bordeaux)',
              color: 'var(--cream)',
              border: 'none',
              fontFamily: 'Inter, sans-serif',
              fontSize: '11px',
              fontWeight: '700',
              letterSpacing: '2px',
              textTransform: 'uppercase',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Inloggen...' : 'Inloggen'}
          </button>
        </form>
      </div>

      <p style={{
        marginTop: '24px',
        fontSize: '12px',
        color: 'rgba(1,3,65,0.4)',
        fontFamily: 'Inter, sans-serif',
        textAlign: 'center',
      }}>
        Nog geen toegang? Neem contact op via info@nachtvandewijn.nl
      </p>
    </div>
  )
}
