// partner-invite: stuurt een partner een mail MET inloggegevens voor het partnerportal.
// Hergebruikt de bestaande Resend-config (app_config.RESEND_API_KEY) van de ticketshop.
// Auth: alleen aanroepbaar door een ingelogde admin (public.is_admin).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const URL = Deno.env.get("SUPABASE_URL")!
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const PORTAL = "https://nvdw-partnerportal.vercel.app"

const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } })

function genPw(): string {
  const w = ["Wijn", "Druif", "Kurk", "Glas", "Vat", "Oogst", "Terroir", "Proost"]
  return `${w[Math.floor(Math.random() * w.length)]}${Math.floor(1000 + Math.random() * 9000)}!`
}

function inlogHtml(bedrijf: string, email: string, pw: string): string {
  return `<!doctype html><html lang="nl"><body style="margin:0;background:#f0e4c0;font-family:Helvetica,Arial,sans-serif;color:#010341;">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px;">
    <div style="background:#fef1d5;border:1px solid rgba(1,3,65,0.1);padding:36px 32px;">
      <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#9b3737;margin-bottom:10px;">Partner Portal</div>
      <h1 style="font-size:26px;line-height:1.1;margin:0 0 18px;color:#010341;text-transform:uppercase;">Welkom bij<br/>Nacht van de Wijn</h1>
      <p style="font-size:15px;line-height:1.7;margin:0 0 16px;">Hoi${bedrijf ? " " + bedrijf : ""},</p>
      <p style="font-size:15px;line-height:1.7;margin:0 0 20px;">Je hebt toegang tot het partnerportal van Nacht van de Wijn 2026. Hierin regel je alles voor het festival: je gegevens, je aanbod, crew, tickets en documenten.</p>
      <div style="background:#f0e4c0;padding:16px 20px;margin:0 0 20px;">
        <div style="font-size:12px;color:rgba(1,3,65,0.6);margin-bottom:8px;">Je inloggegevens:</div>
        <div style="font-size:14px;"><strong>E-mail:</strong> ${email}</div>
        <div style="font-size:14px;"><strong>Wachtwoord:</strong> ${pw}</div>
      </div>
      <a href="${PORTAL}" style="display:inline-block;background:#010341;color:#fef1d5;text-decoration:none;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;padding:14px 28px;">Inloggen</a>
      <p style="font-size:12px;line-height:1.6;color:rgba(1,3,65,0.5);margin:24px 0 0;">Tip: wijzig na het inloggen je wachtwoord via ‘Wachtwoord wijzigen’. Vragen? Mail naar cheers@nachtvandewijn.nl</p>
    </div>
    <div style="text-align:center;font-size:11px;color:rgba(1,3,65,0.4);padding:18px 0;">Nacht van de Wijn · 6, 7 &amp; 8 november 2026 · Utrecht</div>
  </div></body></html>`
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405)
  try {
    const authHeader = req.headers.get("Authorization") ?? ""
    if (!authHeader) return json({ error: "unauthorized" }, 401)

    const caller = createClient(URL, ANON, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } })
    const { data: isAdmin } = await caller.rpc("is_admin")
    if (!isAdmin) return json({ error: "forbidden" }, 403)

    const { partner_id } = await req.json()
    if (!partner_id) return json({ error: "partner_id verplicht" }, 400)

    const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })
    const { data: p, error: pe } = await admin.from("partners").select("*").eq("id", partner_id).single()
    if (pe || !p) return json({ error: "partner niet gevonden" }, 404)
    if (!p.email) return json({ error: "partner heeft geen e-mailadres" }, 400)

    const pw = genPw()
    // Zorg dat de login bestaat en gekoppeld is (SECURITY DEFINER rpc, draait met admin-rechten van de caller)
    const { data: linkRes, error: le } = await caller.rpc("admin_create_partner_login", { p_partner_id: partner_id, p_temp_password: pw })
    if (le) return json({ error: "login aanmaken mislukte: " + le.message }, 500)
    const userId = (linkRes as { user_id?: string })?.user_id
    // Forceer het wachtwoord naar pw (ook als de login al bestond), zodat de mail klopt
    if (userId) await admin.auth.admin.updateUserById(userId, { password: pw, email_confirm: true })

    const { data: cfgRows } = await admin.from("app_config").select("key,value").in("key", ["RESEND_API_KEY", "EMAIL_FROM"])
    const cfg: Record<string, string> = {}
    for (const r of cfgRows ?? []) cfg[r.key] = r.value
    if (!cfg.RESEND_API_KEY) return json({ error: "RESEND_API_KEY ontbreekt in app_config" }, 503)
    const from = cfg.EMAIL_FROM ?? "Nacht van de Wijn <noreply@send.nachtvandewijn.nl>"

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + cfg.RESEND_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [p.email],
        reply_to: "cheers@nachtvandewijn.nl",
        subject: "Je login voor het partnerportal van Nacht van de Wijn",
        html: inlogHtml(p.bedrijfsnaam && p.bedrijfsnaam !== p.email ? p.bedrijfsnaam : "", p.email, pw),
      }),
    })
    if (!res.ok) return json({ error: "mail versturen mislukt: " + (await res.text()) }, 502)

    return json({ ok: true, email: p.email })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
