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
  // Waarom de link niet werkte, zodat de melding klopt en wij het kunnen zien.
  const [linkFout, setLinkFout] = useState<'verlopen' | 'geweigerd' | 'geen-link' | null>(null)
  const [linkDetail, setLinkDetail] = useState('')

  useEffect(() => {
    // De link kan in 3 vormen binnenkomen: #access_token (impliciet, auto via
    // detectSessionInUrl), ?code= (PKCE) of ?token_hash=&type= (OTP). Bij een
    // magic link (?magic=1) is er geen wachtwoord nodig, alleen doorsturen.
    const magic = new URL(window.location.href).searchParams.get('magic') === '1'
    setIsMagic(magic)
    const run = async () => {
      // Supabase zet de uitkomst in het fragment (#error=... of #access_token=...).
      // Die reden is hier het enige spoor: hij komt niet bij de server aan en
      // staat dus in geen enkel logboek. Eerst uitlezen, anders eindigt elke
      // oorzaak op dezelfde melding en valt er niets te onderzoeken.
      const url = new URL(window.location.href)
      const frag = new URLSearchParams(window.location.hash.replace(/^#/, ''))
      const foutCode = frag.get('error_code') || url.searchParams.get('error_code')
      const fout = frag.get('error') || url.searchParams.get('error')
      const foutTekst = frag.get('error_description') || url.searchParams.get('error_description')
      const heeftToken = !!(frag.get('access_token') || url.searchParams.get('code') || url.searchParams.get('token_hash'))
      setLinkFout(
        foutCode === 'otp_expired' ? 'verlopen'
          : fout ? 'geweigerd'
            : !heeftToken ? 'geen-link'
              : null,
      )
      setLinkDetail([fout, foutCode, foutTekst?.replace(/\+/g, ' ')].filter(Boolean).join(' · '))
      try {
        const code = url.searchParams.get('code')
        const token_hash = url.searchParams.get('token_hash')
        const type = url.searchParams.get('type')
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) setLinkDetail(d => d || 'code wisselen mislukte: ' + error.message)
        } else if (token_hash && type) {
          const { error } = await supabase.auth.verifyOtp({ token_hash, type: type as 'recovery' })
          if (error) setLinkDetail(d => d || 'token controleren mislukte: ' + error.message)
        }
      } catch (e) {
        setLinkDetail(d => d || (e instanceof Error ? e.message : 'onbekende fout'))
      }
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
              {linkFout === 'geen-link'
                ? 'Je bent hier zonder link binnengekomen.'
                : linkFout === 'verlopen'
                  ? 'Deze link is verlopen of al gebruikt.'
                  : 'Deze link werkt niet meer.'}
            </p>
            <p style={{ fontSize: '13px', color: 'rgba(1,3,65,0.7)', marginBottom: '18px', lineHeight: 1.6 }}>
              {linkFout === 'geen-link'
                ? 'Deze pagina hoort bij de link uit de mail. Open die mail en klik op de knop, of vraag hieronder een verse link aan.'
                : 'Er is per persoon steeds maar één link geldig, dus een nieuwe mail maakt de vorige ongeldig. Staan er meerdere mails in je inbox, gebruik dan de allerlaatste. Werkt dat niet, vraag hieronder een verse link aan en klik hem meteen aan.'}
            </p>
            {linkDetail && (
              <p style={{ fontSize: '11px', color: 'rgba(1,3,65,0.45)', marginBottom: '18px', lineHeight: 1.5 }}>
                Technische reden: {linkDetail}. Noem dit erbij als je het doorgeeft, dan is het meteen te herleiden.
              </p>
            )}
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
