import { createClient } from '@supabase/supabase-js'
import { wachtwoordHtml, magicLinkHtml } from './mail'

export const runtime = 'nodejs'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const RESEND_API_KEY = process.env.RESEND_API_KEY
const MAIL_FROM = process.env.MAIL_FROM || 'Nacht van de Wijn <noreply@nachtvandewijn.nl>'

export async function POST(req: Request) {
  try {
    if (!SERVICE_KEY || !RESEND_API_KEY) {
      return Response.json({ error: 'E-maildienst is nog niet geconfigureerd (RESEND_API_KEY / SUPABASE_SERVICE_ROLE_KEY ontbreekt).' }, { status: 503 })
    }

    // 1) Verifieer dat de aanvrager een ingelogde admin is
    const authHeader = req.headers.get('authorization') || ''
    const token = authHeader.replace(/^Bearer\s+/i, '')
    if (!token) return Response.json({ error: 'Niet geautoriseerd' }, { status: 401 })

    const asUser = createClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    // Teamtoegang regelen valt onder beheer. Een login met alleen bijvoorbeeld
    // marketing-rechten mag hier dus niet bij, anders kon die zichzelf of
    // anderen via een wachtwoordlink toegang verschaffen.
    const { data: magBeheer } = await asUser.rpc('mag', { gebied: 'beheer' })
    if (!magBeheer) return Response.json({ error: 'Hiervoor heb je beheer-rechten nodig' }, { status: 403 })

    const body = await req.json()
    const email: string = (body.email || '').trim().toLowerCase()
    const naam: string = body.naam || ''
    const type: 'recovery' | 'magiclink' = body.type === 'magiclink' ? 'magiclink' : 'recovery'
    if (!email) return Response.json({ error: 'E-mailadres ontbreekt' }, { status: 400 })

    // 2) Genereer de link (service role)
    const admin = createClient(SUPABASE_URL, SERVICE_KEY)
    const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin
    const redirectTo = type === 'magiclink' ? `${origin}/wachtwoord?magic=1` : `${origin}/wachtwoord`
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type,
      email,
      options: { redirectTo },
    })
    if (linkErr || !linkData?.properties?.action_link) {
      return Response.json({ error: 'Link genereren mislukt: ' + (linkErr?.message || 'onbekend') }, { status: 500 })
    }

    // 3) Verstuur de mail via Resend
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: MAIL_FROM,
        to: [email],
        subject: type === 'magiclink' ? 'Je inloglink voor het partnerportal' : 'Nieuw wachtwoord voor het partnerportal',
        html: type === 'magiclink' ? magicLinkHtml(naam, linkData.properties.action_link) : wachtwoordHtml(naam, linkData.properties.action_link),
      }),
    })
    if (!res.ok) {
      const t = await res.text()
      return Response.json({ error: 'Mail versturen mislukt: ' + t }, { status: 502 })
    }

    return Response.json({ ok: true })
  } catch (e: any) {
    return Response.json({ error: e?.message || 'Onbekende fout' }, { status: 500 })
  }
}
