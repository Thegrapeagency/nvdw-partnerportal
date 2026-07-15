import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const RESEND_API_KEY = process.env.RESEND_API_KEY
const MAIL_FROM = process.env.MAIL_FROM || 'Nacht van de Wijn <noreply@nachtvandewijn.nl>'

function wachtwoordHtml(naam: string, link: string) {
  return `<!doctype html><html lang="nl"><body style="margin:0;background:#f0e4c0;font-family:Helvetica,Arial,sans-serif;color:#010341;">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px;">
    <div style="background:#fef1d5;border:1px solid rgba(1,3,65,0.1);padding:36px 32px;">
      <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#9b3737;margin-bottom:10px;">Partner Portal</div>
      <h1 style="font-size:26px;line-height:1.1;margin:0 0 18px;color:#010341;text-transform:uppercase;">Nieuw<br/>wachtwoord</h1>
      <p style="font-size:15px;line-height:1.7;margin:0 0 16px;">Hoi ${naam || 'daar'},</p>
      <p style="font-size:15px;line-height:1.7;margin:0 0 24px;">Er is een nieuw wachtwoord voor je account bij het Nacht van de Wijn portal aangevraagd. Klik op de knop hieronder om een nieuw wachtwoord te kiezen.</p>
      <a href="${link}" style="display:inline-block;background:#010341;color:#fef1d5;text-decoration:none;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;padding:14px 28px;">Wachtwoord instellen</a>
      <p style="font-size:12px;line-height:1.6;color:rgba(1,3,65,0.5);margin:28px 0 0;">Werkt de knop niet? Plak deze link in je browser:<br/><span style="color:#9b3737;word-break:break-all;">${link}</span></p>
      <p style="font-size:12px;line-height:1.6;color:rgba(1,3,65,0.45);margin:24px 0 0;">Deze link is een beperkte tijd geldig. Heb je dit niet aangevraagd? Dan kun je deze mail negeren.</p>
    </div>
    <div style="text-align:center;font-size:11px;color:rgba(1,3,65,0.4);padding:18px 0;">Nacht van de Wijn · 6, 7 &amp; 8 november 2026 · Utrecht</div>
  </div></body></html>`
}

function magicLinkHtml(naam: string, link: string) {
  return `<!doctype html><html lang="nl"><body style="margin:0;background:#f0e4c0;font-family:Helvetica,Arial,sans-serif;color:#010341;">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px;">
    <div style="background:#fef1d5;border:1px solid rgba(1,3,65,0.1);padding:36px 32px;">
      <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#9b3737;margin-bottom:10px;">Partner Portal</div>
      <h1 style="font-size:26px;line-height:1.1;margin:0 0 18px;color:#010341;text-transform:uppercase;">Inloglink</h1>
      <p style="font-size:15px;line-height:1.7;margin:0 0 16px;">Hoi ${naam || 'daar'},</p>
      <p style="font-size:15px;line-height:1.7;margin:0 0 24px;">Hier is een eenmalige inloglink voor het Nacht van de Wijn portal. Klik op de knop hieronder om direct in te loggen, je hebt geen wachtwoord nodig.</p>
      <a href="${link}" style="display:inline-block;background:#010341;color:#fef1d5;text-decoration:none;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;padding:14px 28px;">Inloggen</a>
      <p style="font-size:12px;line-height:1.6;color:rgba(1,3,65,0.5);margin:28px 0 0;">Werkt de knop niet? Plak deze link in je browser:<br/><span style="color:#9b3737;word-break:break-all;">${link}</span></p>
      <p style="font-size:12px;line-height:1.6;color:rgba(1,3,65,0.45);margin:24px 0 0;">Deze link is een beperkte tijd geldig en werkt maar één keer. Heb je dit niet aangevraagd? Dan kun je deze mail negeren.</p>
    </div>
    <div style="text-align:center;font-size:11px;color:rgba(1,3,65,0.4);padding:18px 0;">Nacht van de Wijn · 6, 7 &amp; 8 november 2026 · Utrecht</div>
  </div></body></html>`
}

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
    const { data: isAdmin } = await asUser.rpc('is_admin')
    if (!isAdmin) return Response.json({ error: 'Alleen admins mogen dit' }, { status: 403 })

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
