import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

// Zelf een wachtwoord zetten voor een teamlid, zonder mail eraan te pas te
// laten komen. Bestaat omdat een mail met een link stuk kan gaan: vraag je er
// twee aan, dan maakt de tweede de eerste ongeldig, en dan krijgt de ontvanger
// "link verlopen" te zien terwijl er niks aan de hand is.
export async function POST(req: Request) {
  try {
    // Eerst wie-ben-jij, daarna pas of de server goed staat. Andersom zou een
    // ontbrekende sleutel de 401 en 403 verbergen achter een 503.
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
    if (!token) return Response.json({ error: 'Niet geautoriseerd' }, { status: 401 })

    const asUser = createClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    // Een wachtwoord van iemand anders zetten is de zwaarste actie in dit
    // portal: daarmee neem je een account over. Dus alleen beheer.
    const { data: magBeheer } = await asUser.rpc('mag', { gebied: 'beheer' })
    if (!magBeheer) return Response.json({ error: 'Hiervoor heb je beheer-rechten nodig' }, { status: 403 })

    const { data: { user: aanvrager } } = await asUser.auth.getUser()

    const body = await req.json()
    const email: string = (body.email || '').trim().toLowerCase()
    const wachtwoord: string = String(body.wachtwoord || '')
    if (!email) return Response.json({ error: 'E-mailadres ontbreekt' }, { status: 400 })
    if (wachtwoord.length < 12) {
      return Response.json({ error: 'Kies een wachtwoord van minstens 12 tekens.' }, { status: 400 })
    }

    if (!SERVICE_KEY) {
      return Response.json({ error: 'SUPABASE_SERVICE_ROLE_KEY ontbreekt op de server.' }, { status: 503 })
    }
    const admin = createClient(SUPABASE_URL, SERVICE_KEY)

    // Alleen voor mensen die echt in het team staan. Zonder deze check zou je
    // via deze route het wachtwoord van elk account in het project kunnen
    // zetten, ook dat van een partner of een bezoeker.
    const { data: teamlid, error: teamFout } = await admin
      .from('admins').select('id, naam, email').ilike('email', email).maybeSingle()
    if (teamFout) return Response.json({ error: 'Team ophalen mislukt: ' + teamFout.message }, { status: 500 })
    if (!teamlid) return Response.json({ error: 'Dit e-mailadres staat niet in het team.' }, { status: 404 })

    // Zoek de bijbehorende login op e-mailadres.
    const { data: lijst, error: zoekFout } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (zoekFout) return Response.json({ error: 'Accounts ophalen mislukt: ' + zoekFout.message }, { status: 500 })
    const account = lijst.users.find(u => (u.email || '').toLowerCase() === email)
    if (!account) return Response.json({ error: 'Er is nog geen login voor dit e-mailadres.' }, { status: 404 })

    const { error: zetFout } = await admin.auth.admin.updateUserById(account.id, {
      password: wachtwoord,
      email_confirm: true,
    })
    if (zetFout) return Response.json({ error: 'Wachtwoord zetten mislukt: ' + zetFout.message }, { status: 500 })

    // Vastleggen dat het gebeurd is. Het wachtwoord zelf gaat hier NIET in.
    await admin.from('activiteit_log').insert({
      actor_email: aanvrager?.email || null,
      actor_naam: aanvrager?.email?.split('@')[0] || 'onbekend',
      actie: 'UPDATE',
      tabel: 'auth.users',
      record_id: account.id,
      omschrijving: `Wachtwoord handmatig ingesteld voor ${teamlid.naam || email}`,
    })

    return Response.json({ ok: true, naam: teamlid.naam })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Onbekende fout' }, { status: 500 })
  }
}
