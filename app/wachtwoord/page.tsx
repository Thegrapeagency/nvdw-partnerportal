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
  const [isMagic, setIsMagic] = useState(false)
  const [nieuwMail, setNieuwMail] = useState('')
  const [nieuwBezig, setNieuwBezig] = useState(false)
  const [nieuwGestuurd, setNieuwGestuurd] = useState(false)
  const [nieuwFout, setNieuwFout] = useState('')

  useEffect(() => {
    // De link kan in 3 vormen binnenkomen: #access_token (impliciet, auto via
    // detectSessionInUrl), ?code= (PKCE) of ?token_hash=&type= (OTP). Bij een
    // magic link (?magic=1) is er geen wachtwoord nodig, alleen doorsturen.
    const magic = new URL(window.location.href).searchParams.get('magic') === '1'
    setIsMagic(magic)
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
      if (session && magic) {
        const { data: isAdmin } = await supabase.rpc('is_admin')
        router.push(isAdmin ? '/admin' : '/dashboard')
      }
    }
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) {
        setHasSession(true); setReady(true)
        if (magic) {
          supabase.rpc('is_admin').then(({ data: isAdmin }) => router.push(isAdmin ? '/admin' : '/dashboard'))
        }
      }
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

  // Zelf een verse link aanvragen, zodat een dode link geen doodlopende weg is
  // en er niemand aan de beheerkant iets voor hoeft te doen.
  const vraagNieuwe = async (e: React.FormEvent) => {
    e.preventDefault()
    setNieuwFout('')
    const mail = nieuwMail.trim().toLowerCase()
    if (!mail) return
    setNieuwBezig(true)
    // Via onze eigen route, zodat de mail van het eigen adres komt en in de
    // huisstijl staat. Die route antwoordt altijd hetzelfde, dus deze pagina
    // verklapt niet welke adressen een account hebben.
    try {
      const res = await fetch('/api/hulp-inloggen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: mail }),
      })
      setNieuwBezig(false)
      if (!res.ok) { setNieuwFout('Aanvragen lukte even niet. Probeer het opnieuw of vraag het iemand van het team.'); return }
      setNieuwGestuurd(true)
    } catch {
      setNieuwBezig(false)
      setNieuwFout('Aanvragen lukte even niet. Probeer het opnieuw of vraag het iemand van het team.')
    }
  }

  const inputStyle: React.CSSProperties = { width: '100%', padding: '11px 14px', background: 'var(--cream)', border: '1px solid rgba(1,3,65,0.15)', color: 'var(--navy)', fontSize: '14px', outline: 'none' }
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: '11px', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(1,3,65,0.5)', marginBottom: '6px' }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--sand)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
      <div style={{ width: '100%', maxWidth: '380px' }}>
        <div style={{ marginBottom: '32px' }}>
          <div style={{ fontSize: '11px', fontWeight: 500, letterSpacing: '3px', textTransform: 'uppercase', color: 'var(--bordeaux)', marginBottom: '10px' }}>Partner Portal</div>
          <div style={{ fontFamily: 'GoboldBlocky, sans-serif', fontSize: '28px', textTransform: 'uppercase', color: 'var(--navy)', lineHeight: 1 }}>{isMagic ? <>Inloggen</> : <>Wachtwoord<br />instellen</>}</div>
        </div>

        {!ready && <div style={{ fontSize: '13px', color: 'rgba(1,3,65,0.4)' }}>Even geduld...</div>}

        {ready && done && (
          <div style={{ fontSize: '14px', color: '#2e7d32', fontWeight: 500 }}>✓ Je wachtwoord is opgeslagen. Je wordt doorgestuurd...</div>
        )}

        {ready && isMagic && hasSession && (
          <div style={{ fontSize: '14px', color: '#2e7d32', fontWeight: 500 }}>✓ Ingelogd. Je wordt doorgestuurd...</div>
        )}

        {ready && !done && !hasSession && (
          <div>
            <p style={{ fontSize: '14px', color: 'var(--navy)', marginBottom: '12px', lineHeight: 1.6 }}>
              Deze link werkt niet meer.
            </p>
            <p style={{ fontSize: '13px', color: 'rgba(1,3,65,0.7)', marginBottom: '18px', lineHeight: 1.6 }}>
              Dat komt bijna altijd doordat er daarna nog een mail is verstuurd, of doordat de link al een keer
              gebruikt is. Er is er namelijk steeds maar één geldig. Staan er meerdere mails in je inbox, gebruik
              dan de allerlaatste. Of vraag hieronder een verse link aan.
            </p>
            {nieuwGestuurd ? (
              <div style={{ fontSize: '14px', color: '#2e7d32', fontWeight: 500, lineHeight: 1.6 }}>
                ✓ Staat dit adres in het team, dan is er nu een verse link onderweg naar {nieuwMail}.
                Gebruik die mail en negeer de oudere.
              </div>
            ) : (
              <form onSubmit={vraagNieuwe} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
                <div>
                  <label style={labelStyle}>Je e-mailadres</label>
                  <input type="email" value={nieuwMail} onChange={e => setNieuwMail(e.target.value)} required
                    style={inputStyle} placeholder="naam@nachtvandewijn.nl" />
                </div>
                {nieuwFout && <div style={{ fontSize: '13px', color: 'var(--bordeaux)' }}>{nieuwFout}</div>}
                <button type="submit" disabled={nieuwBezig} style={{ padding: '12px', background: 'var(--navy)', color: 'var(--cream)', border: 'none', fontSize: '11px', fontWeight: 600, letterSpacing: '2px', textTransform: 'uppercase', cursor: nieuwBezig ? 'not-allowed' : 'pointer', opacity: nieuwBezig ? 0.6 : 1 }}>
                  {nieuwBezig ? 'Versturen...' : 'Stuur mij een nieuwe link'}
                </button>
              </form>
            )}
            <button onClick={() => router.push('/')} style={{ padding: '10px 20px', background: 'transparent', color: 'var(--navy)', border: '1px solid rgba(1,3,65,0.3)', fontSize: '11px', fontWeight: 600, letterSpacing: '2px', textTransform: 'uppercase', cursor: 'pointer' }}>Naar inloggen</button>
          </div>
        )}

        {ready && !done && !isMagic && hasSession && (
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
