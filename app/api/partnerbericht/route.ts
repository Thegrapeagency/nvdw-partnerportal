import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const RESEND_API_KEY = process.env.RESEND_API_KEY
const MAIL_FROM = process.env.MAIL_FROM || 'Nacht van de Wijn <noreply@nachtvandewijn.nl>'

const esc = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;')

function berichtHtml(naam: string, bericht: string, link: string) {
  const aanhef = naam.trim() ? `Hoi ${esc(naam.trim())},` : 'Hoi,'
  const alinea = esc(bericht.trim()).replaceAll('\n', '<br/>')
  return `<!doctype html><html lang="nl"><body style="margin:0;background:#f0e4c0;font-family:Helvetica,Arial,sans-serif;color:#010341;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="background:#fef1d5;border:1px solid rgba(1,3,65,0.1);padding:36px 32px;">
      <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#9b3737;margin-bottom:10px;">Partnerportal</div>
      <h1 style="font-size:25px;line-height:1.15;margin:0 0 22px;color:#010341;text-transform:uppercase;">Nacht van de Wijn 2026</h1>
      <p style="font-size:15px;line-height:1.7;margin:0 0 14px;">${aanhef}</p>
      <p style="font-size:15px;line-height:1.7;margin:0 0 24px;">${alinea}</p>
      <a href="${esc(link)}" style="display:inline-block;background:#010341;color:#fef1d5;text-decoration:none;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;padding:14px 24px;">Open het partnerportal</a>
      <p style="font-size:12px;line-height:1.6;color:rgba(1,3,65,0.5);margin:24px 0 0;">Deze persoonlijke link werkt één keer. Werkt de knop niet meer, vraag dan op de inlogpagina direct een nieuwe link aan.</p>
    </div>
    <div style="text-align:center;font-size:11px;color:rgba(1,3,65,0.42);padding:18px 0;">Nacht van de Wijn · 6, 7 &amp; 8 november 2026 · Utrecht</div>
  </div></body></html>`
}

async function beveiligdeContext(req: Request) {
  if (!SERVICE_KEY) return { error: Response.json({ error: 'Serverconfiguratie ontbreekt.' }, { status: 503 }) }
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return { error: Response.json({ error: 'Niet geautoriseerd' }, { status: 401 }) }
  const asUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false },
  })
  const { data: magPartners } = await asUser.rpc('mag', { gebied: 'partners' })
  if (!magPartners) return { error: Response.json({ error: 'Hiervoor heb je partnerrechten nodig.' }, { status: 403 }) }
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const { data: caller } = await asUser.auth.getUser()
  return { asUser, admin, caller }
}

export async function GET(req: Request) {
  const ctx = await beveiligdeContext(req)
  if ('error' in ctx) return ctx.error
  const partnerId = new URL(req.url).searchParams.get('partner_id')
  let query = ctx.admin.from('partner_berichten')
    .select('id,batch_id,partner_id,ontvanger_email,onderwerp,bericht,status,provider_id,foutmelding,verzonden_door,created_at,partners(bedrijfsnaam)')
    .order('created_at', { ascending: false }).limit(100)
  if (partnerId) query = query.eq('partner_id', partnerId)
  const { data, error } = await query
  if (error) return Response.json({ error: 'Geschiedenis ophalen mislukte.' }, { status: 500 })
  return Response.json({ berichten: data || [] })
}

export async function POST(req: Request) {
  if (!SERVICE_KEY || !RESEND_API_KEY) {
    return Response.json({ error: 'E-maildienst is niet geconfigureerd.' }, { status: 503 })
  }

  const ctx = await beveiligdeContext(req)
  if ('error' in ctx) return ctx.error
  const { asUser, admin, caller } = ctx

  const body = await req.json().catch(() => ({}))
  const partnerIds = Array.isArray(body.partner_ids) ? [...new Set(body.partner_ids.filter((x: unknown) => typeof x === 'string'))] as string[] : []
  const onderwerp = typeof body.onderwerp === 'string' ? body.onderwerp.trim() : ''
  const bericht = typeof body.bericht === 'string' ? body.bericht.trim() : ''
  if (!partnerIds.length || partnerIds.length > 100) return Response.json({ error: 'Kies één of meer partners.' }, { status: 400 })
  if (!onderwerp || onderwerp.length > 160) return Response.json({ error: 'Vul een kort onderwerp in.' }, { status: 400 })
  if (!bericht || bericht.length > 5000) return Response.json({ error: 'Vul een bericht in.' }, { status: 400 })

  const { data: partners, error: partnerError } = await admin.from('partners')
    .select('id,naam,bedrijfsnaam,email,user_id')
    .in('id', partnerIds)
  if (partnerError) return Response.json({ error: 'Partners ophalen mislukte.' }, { status: 500 })

  const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin
  const batchId = crypto.randomUUID()
  const resultaten: { partner_id: string; bedrijf: string; email: string; ok: boolean; error?: string }[] = []

  const registreer = async (partnerId: string, email: string, status: 'verstuurd' | 'mislukt', providerId?: string, foutmelding?: string) => {
    await admin.from('partner_berichten').insert({
      batch_id: batchId, partner_id: partnerId, ontvanger_email: email,
      onderwerp, bericht, status, provider_id: providerId || null,
      foutmelding: foutmelding || null, verzonden_door: caller.user?.email || null,
    })
  }

  for (const partner of partners || []) {
    const email = String(partner.email || '').trim().toLowerCase()
    if (!email) {
      await registreer(partner.id, '', 'mislukt', undefined, 'Geen e-mailadres')
      resultaten.push({ partner_id: partner.id, bedrijf: partner.bedrijfsnaam, email: '', ok: false, error: 'Geen e-mailadres' })
      continue
    }

    if (!partner.user_id) {
      const tijdelijk = `NvdW-${crypto.randomUUID()}!`
      const { error: loginError } = await asUser.rpc('admin_create_partner_login', {
        p_partner_id: partner.id,
        p_temp_password: tijdelijk,
      })
      if (loginError) {
        await registreer(partner.id, email, 'mislukt', undefined, 'Login aanmaken mislukte')
        resultaten.push({ partner_id: partner.id, bedrijf: partner.bedrijfsnaam, email, ok: false, error: 'Login aanmaken mislukte' })
        continue
      }
    }

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo: `${origin}/dashboard` },
    })
    const link = linkData?.properties?.action_link
    if (linkError || !link) {
      await registreer(partner.id, email, 'mislukt', undefined, 'Inloglink maken mislukte')
      resultaten.push({ partner_id: partner.id, bedrijf: partner.bedrijfsnaam, email, ok: false, error: 'Inloglink maken mislukte' })
      continue
    }

    const resend = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: MAIL_FROM,
        to: [email],
        reply_to: 'cheers@nachtvandewijn.nl',
        subject: onderwerp,
        html: berichtHtml(partner.naam || partner.bedrijfsnaam || '', bericht, link),
      }),
    })
    if (!resend.ok) {
      await registreer(partner.id, email, 'mislukt', undefined, 'Maildienst weigerde het bericht')
      resultaten.push({ partner_id: partner.id, bedrijf: partner.bedrijfsnaam, email, ok: false, error: 'Maildienst weigerde het bericht' })
      continue
    }

    const provider = await resend.json().catch(() => ({})) as { id?: string }
    await registreer(partner.id, email, 'verstuurd', provider.id)
    resultaten.push({ partner_id: partner.id, bedrijf: partner.bedrijfsnaam, email, ok: true })
    await admin.from('activiteit_log').insert({
      actor_email: caller.user?.email || null,
      actor_naam: caller.user?.email || null,
      actie: 'MAIL',
      tabel: 'partners',
      record_id: partner.id,
      partner_id: partner.id,
      omschrijving: `Partnerbericht verstuurd: ${onderwerp}`,
    })
  }

  const verstuurd = resultaten.filter(x => x.ok).length
  return Response.json({ ok: verstuurd === resultaten.length, verstuurd, mislukt: resultaten.length - verstuurd, resultaten })
}
