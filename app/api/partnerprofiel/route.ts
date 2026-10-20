import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY

const geldigEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function PATCH(req: Request) {
  if (!SERVICE) return Response.json({ error: 'Serverconfiguratie ontbreekt.' }, { status: 503 })
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return Response.json({ error: 'Niet geautoriseerd.' }, { status: 401 })

  const asUser = createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })
  const { data: magPartners } = await asUser.rpc('mag', { gebied: 'partners' })
  if (!magPartners) return Response.json({ error: 'Hiervoor heb je partnerrechten nodig.' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const partnerId = typeof body.partner_id === 'string' ? body.partner_id : ''
  const naam = typeof body.naam === 'string' ? body.naam.trim() : ''
  const bedrijfsnaam = typeof body.bedrijfsnaam === 'string' ? body.bedrijfsnaam.trim() : ''
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const telefoon = typeof body.telefoon === 'string' ? body.telefoon.trim() : ''
  if (!partnerId || !bedrijfsnaam || !email || !geldigEmail.test(email)) {
    return Response.json({ error: 'Bedrijfsnaam en een geldig e-mailadres zijn verplicht.' }, { status: 400 })
  }

  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })
  const { data: bestaand, error: zoekError } = await admin.from('partners')
    .select('id,email,user_id')
    .eq('id', partnerId)
    .single()
  if (zoekError || !bestaand) return Response.json({ error: 'Partner niet gevonden.' }, { status: 404 })

  const emailGewijzigd = bestaand.email.toLowerCase() !== email
  let koppelLogin: string | null = null
  let ontkoppel = false
  let authHernoemd = false
  if (emailGewijzigd) {
    const { data: dubbel } = await admin.from('partners').select('id,user_id').ilike('email', email).neq('id', partnerId)
    const logins = [...new Set((dubbel || []).map(d => d.user_id).filter(Boolean))] as string[]
    // Staat dit adres al bij precies één login, dan verhuist deze partner naar
    // die login: die beheert de partner er dan bij. Een eventuele eigen login
    // van deze partner blijft voor zijn andere partners gewoon bestaan.
    if (logins.length > 1) return Response.json({ error: 'Dit e-mailadres hoort al bij meer dan één login, dat moet eerst rechtgezet worden.' }, { status: 409 })
    if (logins.length === 1 && logins[0] !== bestaand.user_id) koppelLogin = logins[0]
  }

  // Alleen het inlogadres zelf aanpassen als de partner zijn eigen login houdt
  // en die login verder bij geen andere partner hoort.
  if (emailGewijzigd && bestaand.user_id && !koppelLogin) {
    const { count } = await admin.from('partners').select('id', { count: 'exact', head: true }).eq('user_id', bestaand.user_id).neq('id', partnerId)
    if (count) {
      // Login wordt gedeeld: niet hernoemen, deze partner krijgt een eigen login bij "Stuur inlog".
      koppelLogin = null
      ontkoppel = true
    } else {
      const { error: authError } = await admin.auth.admin.updateUserById(bestaand.user_id, { email, email_confirm: true })
      if (authError) return Response.json({ error: 'Het inlogadres kon niet worden gewijzigd: ' + authError.message }, { status: 409 })
      authHernoemd = true
    }
  }

  const { error: updateError } = await admin.from('partners').update({
    naam,
    bedrijfsnaam,
    email,
    telefoon: telefoon || null,
    ...(koppelLogin ? { user_id: koppelLogin } : ontkoppel ? { user_id: null } : {}),
  }).eq('id', partnerId)
  if (updateError) {
    if (authHernoemd) {
      await admin.auth.admin.updateUserById(bestaand.user_id, { email: bestaand.email, email_confirm: true })
    }
    return Response.json({ error: 'Opslaan mislukte: ' + updateError.message }, { status: 500 })
  }

  return Response.json({ ok: true, email_gewijzigd: emailGewijzigd, gekoppeld_aan_bestaande_login: !!koppelLogin })
}
