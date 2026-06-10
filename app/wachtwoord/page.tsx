'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function WachtwoordPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [hasSession, setHasSession] = useState(false)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    // De recovery-link kan in 3 vormen binnenkomen: #access_token (impliciet,
    // auto via detectSessionInUrl), ?code= (PKCE) of ?token_hash=&type= (OTP).
    const run = async () => {
      try {
        const url = new URL(window.location.href)
        const code = url.searchParams.get('code')
        const token_hash = url.searchParams.get('token_hash')
        const type = url.searchParams.get('type')
        if (code) {
          await supabase.auth.exchangeCodeForSession(code)
        } else if (token_hash && type) {
          await supabase.auth.verifyOtp({ token_hash, type: type as 'recovery' })
        }
      } catch { /* val terug op bestaande sessie hieronder */ }
      const { data: { session } } = await supabase.auth.getSession()
      setHasSession(!!session)
      setReady(true)
    }
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) { setHasSession(true); setReady(true) }
    })
    run()
    return () => { sub.subscription.unsubscribe() }
  }, [])

  const opslaan = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (pw.length < 8) { setError('Kies een wachtwoord van minstens 8 tekens.'); return }
    if (pw !== pw2) { setError('De twee wachtwoorden zijn niet gelijk.'); return }
    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password: pw })
    if (error) { setError('Opslaan mislukt: ' + error.message); setSaving(false); return }
    setDone(true)
    setSaving(false)
    const { data: isAdmin } = await supabase.rpc('is_admin')
    setTimeout(() => router.push(isAdmin ? '/admin' : '/dashboard'), 1500)
  }

  const inputStyle: React.CSSProperties = { width: '100%', padding: '11px 14px', background: 'var(--cream)', border: '1px solid rgba(1,3,65,0.15)', color: 'var(--navy)', fontSize: '14px', outline: 'none' }
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: '11px', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(1,3,65,0.5)', marginBottom: '6px' }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--sand)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
      <div style={{ width: '100%', maxWidth: '380px' }}>
        <div style={{ marginBottom: '32px' }}>
          <div style={{ fontSize: '11px', fontWeight: 500, letterSpacing: '3px', textTransform: 'uppercase', color: 'var(--bordeaux)', marginBottom: '10px' }}>Partner Portal</div>
          <div style={{ fontFamily: 'GoboldBlocky, sans-serif', fontSize: '28px', textTransform: 'uppercase', color: 'var(--navy)', lineHeight: 1 }}>Wachtwoord<br />instellen</div>
        </div>

        {!ready && <div style={{ fontSize: '13px', color: 'rgba(1,3,65,0.4)' }}>Even geduld...</div>}

        {ready && done && (
          <div style={{ fontSize: '14px', color: '#2e7d32', fontWeight: 500 }}>✓ Je wachtwoord is opgeslagen. Je wordt doorgestuurd...</div>
        )}

        {ready && !done && !hasSession && (
          <div>
            <p style={{ fontSize: '14px', color: 'var(--navy)', marginBottom: '16px', lineHeight: 1.6 }}>
              Deze link is verlopen of niet meer geldig. Log in en kies daar &quot;Wachtwoord wijzigen&quot;, of vraag een nieuwe link aan.
            </p>
            <button onClick={() => router.push('/')} style={{ padding: '12px 22px', background: 'var(--navy)', color: 'var(--cream)', border: 'none', fontSize: '11px', fontWeight: 600, letterSpacing: '2px', textTransform: 'uppercase', cursor: 'pointer' }}>Naar inloggen</button>
          </div>
        )}

        {ready && !done && hasSession && (
          <form onSubmit={opslaan} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={labelStyle}>Nieuw wachtwoord</label>
              <input type="password" value={pw} onChange={e => setPw(e.target.value)} required style={inputStyle} placeholder="minstens 8 tekens" />
            </div>
            <div>
              <label style={labelStyle}>Herhaal wachtwoord</label>
              <input type="password" value={pw2} onChange={e => setPw2(e.target.value)} required style={inputStyle} />
            </div>
            {error && <div style={{ fontSize: '13px', color: 'var(--bordeaux)' }}>{error}</div>}
            <button type="submit" disabled={saving} style={{ padding: '12px', background: 'var(--navy)', color: 'var(--cream)', border: 'none', fontSize: '11px', fontWeight: 600, letterSpacing: '2px', textTransform: 'uppercase', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1, marginTop: '4px' }}>
              {saving ? 'Opslaan...' : 'Wachtwoord opslaan'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
