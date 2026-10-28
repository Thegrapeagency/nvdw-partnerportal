// vraag-antwoord-mail: mailt een in de portal gegeven antwoord naar de vragensteller.
// - bezoeker: het antwoord zelf, met de oorspronkelijke vraag eronder
// - partner: een seintje dat er een antwoord in de portal staat, plus het antwoord
// Aangeroepen door de portal direct na "Antwoord opslaan". Auth: ingelogde
// admin met schrijfrecht op het gebied (public.mag: bezoekers of partners). Mailt per vraag maar één
// keer (antwoord_gemaild_at), tenzij opnieuw=true.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const URL = Deno.env.get("SUPABASE_URL")!
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const PORTAL = "https://nvdw-partnerportal.vercel.app"
const FROM = "Nacht van de Wijn <cheers@send.nachtvandewijn.nl>"

const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } })

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!))
const alinea = (s: string) => esc(s).replace(/\n/g, "<br/>")

function mailHtml(kop: string, intro: string, antwoord: string, vraag: string, knop?: { href: string; label: string }): string {
  return `<!doctype html><html lang="nl"><body style="margin:0;background:#f0e4c0;font-family:Georgia,serif;color:#010341;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <div style="background:#fef1d5;border:1px solid rgba(1,3,65,0.1);border-radius:14px;padding:36px 32px;">
      <div style="font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#9b3737;margin-bottom:10px;">Nacht van de Wijn</div>
      <h1 style="font-size:24px;line-height:1.2;margin:0 0 18px;color:#010341;">${kop}</h1>
      <p style="font-size:15px;line-height:1.7;margin:0 0 18px;">${intro}</p>
      <div style="font-size:15px;line-height:1.7;margin:0 0 22px;padding:16px 18px;background:#ffffff;border-left:3px solid #9b3737;border-radius:6px;">${alinea(antwoord)}</div>
      ${knop ? `<a href="${knop.href}" style="display:inline-block;background:#010341;color:#fef1d5;text-decoration:none;font-family:Helvetica,Arial,sans-serif;font-size:13px;font-weight:700;padding:13px 24px;border-radius:9px;margin:0 0 22px;">${knop.label}</a>` : ""}
      <div style="font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:rgba(1,3,65,0.55);border-top:1px solid rgba(1,3,65,0.12);padding-top:14px;">
        <div style="margin-bottom:4px;">Je vraag:</div>
        <div style="font-style:italic;">${alinea(vraag)}</div>
      </div>
      <p style="font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:rgba(1,3,65,0.55);margin:18px 0 0;">Nog iets? Beantwoord deze mail gewoon, dan komt je reactie bij ons binnen.</p>
    </div>
    <div style="text-align:center;font-family:Helvetica,Arial,sans-serif;font-size:11px;color:rgba(1,3,65,0.4);padding:18px 0;">Nacht van de Wijn · 6, 7 &amp; 8 november 2026 · Werkspoorkathedraal Utrecht</div>
  </div></body></html>`
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405)
  try {
    const authHeader = req.headers.get("Authorization") ?? ""
    if (!authHeader) return json({ error: "unauthorized" }, 401)
    const { soort, id, opnieuw } = await req.json() as { soort?: string; id?: string; opnieuw?: boolean }
    if ((soort !== "bezoeker" && soort !== "partner") || !id) return json({ error: "soort en id verplicht" }, 400)

    const caller = createClient(URL, ANON, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } })
    const { data: mag } = await caller.rpc("mag", { gebied: soort === "bezoeker" ? "bezoekers" : "partners" })
    if (!mag) return json({ error: "forbidden" }, 403)

    const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })
    const tabel = soort === "bezoeker" ? "bezoeker_vragen" : "partner_vragen"
    const { data: v, error: ve } = await admin.from(tabel).select("*").eq("id", id).single()
    if (ve || !v) return json({ error: "vraag niet gevonden" }, 404)
    if (!v.antwoord || !String(v.antwoord).trim()) return json({ error: "geen antwoord om te mailen" }, 400)
    if (v.antwoord_gemaild_at && !opnieuw) return json({ ok: true, al_gemaild: true })

    let to = "", subject = "", html = ""
    if (soort === "bezoeker") {
      to = String(v.email ?? "").trim()
      if (!to) {
        await admin.from(tabel).update({ antwoord_mail_status: "geen_email" }).eq("id", id)
        return json({ error: "geen e-mailadres bij deze vraag" }, 400)
      }
      const naam = v.naam ? String(v.naam).split(" ")[0] : ""
      subject = "Antwoord op je vraag aan Nacht van de Wijn"
      html = mailHtml(`Hoi${naam ? " " + esc(naam) : ""}, hier is ons antwoord`, "Bedankt voor je vraag. Dit is ons antwoord:", v.antwoord, v.bericht ?? "")
    } else {
      const { data: p } = await admin.from("partners").select("email, bedrijfsnaam").eq("id", v.partner_id).single()
      to = String(p?.email ?? "").trim()
      if (!to) {
        await admin.from(tabel).update({ antwoord_mail_status: "geen_email" }).eq("id", id)
        return json({ error: "partner heeft geen e-mailadres" }, 400)
      }
      subject = `Antwoord op je vraag: ${v.onderwerp ?? "partnerportal"}`
      html = mailHtml("Er staat een antwoord voor je klaar", `Hoi${p?.bedrijfsnaam ? " " + esc(p.bedrijfsnaam) : ""}, we hebben je vraag in het partnerportal beantwoord:`, v.antwoord, v.bericht ?? "", { href: PORTAL, label: "Naar het partnerportal" })
    }

    const { data: cfg } = await admin.from("app_config").select("value").eq("key", "RESEND_API_KEY").single()
    const key = Deno.env.get("RESEND_API_KEY") || cfg?.value
    if (!key) return json({ error: "mail niet geconfigureerd" }, 500)

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [to], reply_to: "cheers@nachtvandewijn.nl", subject, html }),
    })
    if (!res.ok) {
      console.error("resend failed", res.status, await res.text())
      await admin.from(tabel).update({ antwoord_mail_status: "mislukt" }).eq("id", id)
      return json({ error: "mail versturen mislukt" }, 502)
    }
    await admin.from(tabel).update({ antwoord_gemaild_at: new Date().toISOString(), antwoord_mail_status: "verstuurd" }).eq("id", id)
    return json({ ok: true, naar: to })
  } catch (e) {
    console.error("vraag-antwoord-mail failed", e)
    return json({ error: "internal" }, 500)
  }
})
