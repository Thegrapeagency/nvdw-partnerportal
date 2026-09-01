import { createClient } from '@supabase/supabase-js'
import { wachtwoordHtml } from '../team-toegang/mail'

export const runtime = 'nodejs'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const RESEND_API_KEY = process.env.RESEND_API_KEY
const MAIL_FROM = process.env.MAIL_FROM || 'Nacht van de Wijn <noreply@nachtvandewijn.nl>'

// Zelf een verse wachtwoordlink aanvragen als je link niet meer werkt, zonder
// dat er iemand aan de beheerkant iets voor hoeft te doen.
//
// Deze route heeft géén login nodig, dus hij is bewust smal gehouden:
// - hij mailt alleen naar adressen die in het team staan
// - hij antwoordt altijd hetzelfde, zodat je er niet mee kunt uitvissen welke
//   adressen een account hebben
// - hij staat op een slot van één mail per twee minuten per adres
//
// Bewust via onze eigen Resend en niet via de ingebouwde mailer van Supabase:
// die verstuurt vanaf een vreemd afzenderadres en heeft een lage limiet.
const SLOT_SECONDEN = 120

export async function POST(req: Request) {
  // Altijd hetzelfde antwoord naar buiten, wat er intern ook gebeurt.
  const netjes = () => Response.json({ ok: true })

  try {
    if (!SERVICE_KEY || !RESEND_API_KEY) return netjes()

    const body = await req.json().catch(() => ({}))
    const email = String(body?.email || '').trim().toLowerCase()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) return netjes()

    const admin = createClient(SUPABASE_URL, SERVICE_KEY)

    // Slot: recent al een mail voor dit adres de deur uit?
    const bucket = `hulp-inloggen:${email}`
    const sinds = new Date(Date.now() - SLOT_SECONDEN * 1000).toISOString()
    const { count } = await admin.from('rate_events')
      .select('id', { count: 'exact', head: true })
      .eq('bucket', bucket).gte('at', sinds)
    if ((count ?? 0) > 0) return netjes()

    // Alleen voor adressen die we kennen: teamleden en partners met een login.
    // Dat is wat de route ervan weerhoudt een open mailmachine te zijn.
    // Partners stonden er eerst niet in, waardoor de knop voor hen niets deed.
    const { data: teamlid } = await admin
      .from('admins').select('naam, email, actief').ilike('email', email).maybeSingle()
    let naam: string | null = teamlid && teamlid.actief ? (teamlid.naam || '') : null
    if (naam === null) {
      const { data: partner } = await admin
        .from('partners').select('naam, bedrijfsnaam, user_id').ilike('email', email).maybeSingle()
      // Zonder user_id is er nog geen login en heeft een herstellink geen zin.
      if (partner?.user_id) naam = partner.naam || partner.bedrijfsnaam || ''
    }
    if (naam === null) return netjes()

    await admin.from('rate_events').insert({ bucket, ip: (req.headers.get('x-forwarded-for') || '0.0.0.0').split(',')[0].trim() })

    const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: `${origin}/wachtwoord` },
    })
    if (linkErr || !linkData?.properties?.action_link) {
      console.error('[hulp-inloggen] link genereren mislukt:', linkErr?.message)
      return netjes()
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: MAIL_FROM,
        to: [email],
        subject: 'Nieuwe link voor het partnerportal',
        html: wachtwoordHtml(naam, linkData.properties.action_link),
      }),
    })
    // Naar buiten blijft het antwoord hetzelfde, want anders is aan het
    // verschil te zien of een adres bestaat. Maar een stille mislukking is
    // erger dan geen knop, dus die moet in de serverlogs te vinden zijn.
    if (!res.ok) console.error('[hulp-inloggen] Resend weigerde:', res.status, await res.text())
    else console.log('[hulp-inloggen] mail verstuurd')

    return netjes()
  } catch (e) {
    console.error('[hulp-inloggen] onverwachte fout:', e instanceof Error ? e.message : e)
    return netjes()
  }
}
