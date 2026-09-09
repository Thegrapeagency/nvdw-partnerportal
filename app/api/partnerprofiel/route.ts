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
  if (emailGewijzigd) {
    const { data: dubbel } = await admin.from('partners').select('id').ilike('email', email).neq('id', partnerId).maybeSingle()
    if (dubbel) return Response.json({ error: 'Dit e-mailadres staat al bij een andere partner.' }, { status: 409 })
  }

  if (emailGewijzigd && bestaand.user_id) {
    const { error: authError } = await admin.auth.admin.updateUserById(bestaand.user_id, { email, email_confirm: true })
    if (authError) return Response.json({ error: 'Het inlogadres kon niet worden gewijzigd: ' + authError.message }, { status: 409 })
  }

  const { error: updateError } = await admin.from('partners').update({
    naam,
    bedrijfsnaam,
    email,
    telefoon: telefoon || null,
  }).eq('id', partnerId)
  if (updateError) {
    if (emailGewijzigd && bestaand.user_id) {
      await admin.auth.admin.updateUserById(bestaand.user_id, { email: bestaand.email, email_confirm: true })
    }
    return Response.json({ error: 'Opslaan mislukte: ' + updateError.message }, { status: 500 })
  }

  return Response.json({ ok: true, email_gewijzigd: emailGewijzigd })
}
