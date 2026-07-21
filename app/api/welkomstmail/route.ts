import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const RESEND_API_KEY = process.env.RESEND_API_KEY
const MAIL_FROM = process.env.MAIL_FROM || 'Nacht van de Wijn <noreply@nachtvandewijn.nl>'

function welkomHtml(naam: string, link: string, isFood: boolean) {
  const rol = isFood ? 'foodtruck' : 'partner'
  return `<!doctype html><html lang="nl"><body style="margin:0;background:#f0e4c0;font-family:Helvetica,Arial,sans-serif;color:#010341;">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px;">
    <div style="background:#fef1d5;border:1px solid rgba(1,3,65,0.1);padding:36px 32px;">
      <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#9b3737;margin-bottom:10px;">Partner Portal</div>
      <h1 style="font-size:26px;line-height:1.1;margin:0 0 18px;color:#010341;text-transform:uppercase;">Welkom bij<br/>Nacht van de Wijn</h1>
      <p style="font-size:15px;line-height:1.7;margin:0 0 16px;">Hoi ${naam || 'daar'},</p>
      <p style="font-size:15px;line-height:1.7;margin:0 0 16px;">Je bent toegevoegd aan het partnerportal van Nacht van de Wijn 2026. Hierin regel je als ${rol} alles voor het festival: je gegevens, ${isFood ? 'menukaart en allergenen' : 'wijnlijst'}, crewcatering, tickets en documenten.</p>
      <p style="font-size:15px;line-height:1.7;margin:0 0 24px;">Stel hieronder eenmalig je eigen wachtwoord in, dan kun je meteen aan de slag.</p>
      <a href="${link}" style="display:inline-block;background:#010341;color:#fef1d5;text-decoration:none;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;padding:14px 28px;">Wachtwoord instellen</a>
      <p style="font-size:12px;line-height:1.6;color:rgba(1,3,65,0.5);margin:28px 0 0;">Werkt de knop niet? Plak deze link in je browser:<br/><span style="color:#9b3737;word-break:break-all;">${link}</span></p>
      <p style="font-size:12px;line-height:1.6;color:rgba(1,3,65,0.45);margin:24px 0 0;">Deze link is een beperkte tijd geldig. Vragen? Mail naar info@nachtvandewijn.nl</p>
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
    // Partnerlogins aanmaken hoort bij partnerbeheer. Beheer mag het ook,
    // want die maakt teamleden aan via dezelfde mail.
    const [{ data: magPartners }, { data: magBeheer }] = await Promise.all([
      asUser.rpc('mag', { gebied: 'partners' }),
      asUser.rpc('mag', { gebied: 'beheer' }),
    ])
    if (!magPartners && !magBeheer) {
      return Response.json({ error: 'Hiervoor heb je partner- of beheer-rechten nodig' }, { status: 403 })
    }

    const body = await req.json()
    const email: string = (body.email || '').trim().toLowerCase()
    const naam: string = body.naam || ''
    const isFood: boolean = !!body.isFood
    if (!email) return Response.json({ error: 'E-mailadres ontbreekt' }, { status: 400 })

    // 2) Genereer een veilige "stel wachtwoord in"-link (service role)
    const admin = createClient(SUPABASE_URL, SERVICE_KEY)
    const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: `${origin}/wachtwoord` },
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
        subject: 'Welkom bij het partnerportal van Nacht van de Wijn',
        html: welkomHtml(naam, linkData.properties.action_link, isFood),
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
