// /functions/v1/water-push
// Stuurt een pushbericht naar de cockpit-app van de organisatie voor elke
// watermelding die nog niet gepusht is (help_requests met water_product_id en
// zonder push_sent_at). De database roept dit aan zodra een bar onder de
// drempel komt (trigger water_alert). Het verzoek zelf draagt geen gegevens:
// de functie kijkt alleen wat er openstaat, dus vaker aanroepen kan geen kwaad.
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import webpush from "npm:web-push@3.6.7"

const sb = () =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    db: { schema: "festival_pos" },
    auth: { persistSession: false },
  })

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 })
  try {
    const db = sb()
    // Atomair claimen, zodat twee aanroepen tegelijk niet dubbel pushen.
    const { data: open, error } = await db.from("help_requests")
      .update({ push_sent_at: new Date().toISOString() })
      .is("push_sent_at", null)
      .not("water_product_id", "is", null)
      .gte("created_at", new Date(Date.now() - 60 * 60e3).toISOString())
      .select("id, organization_id, merchant_id, message")
    if (error) throw error
    if (!open?.length) return Response.json({ ok: true, sent: 0 })

    const { data: cfg } = await db.schema("public").from("app_config").select("key,value")
      .in("key", ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"])
    const c = new Map((cfg ?? []).map((r: { key: string; value: string }) => [r.key, r.value]))
    if (!c.get("VAPID_PUBLIC_KEY") || !c.get("VAPID_PRIVATE_KEY")) return Response.json({ ok: true, sent: 0, reason: "no_vapid" })
    webpush.setVapidDetails(c.get("VAPID_SUBJECT") ?? "mailto:cheers@nachtvandewijn.nl", c.get("VAPID_PUBLIC_KEY")!, c.get("VAPID_PRIVATE_KEY")!)

    const merchantIds = [...new Set(open.map((h) => h.merchant_id).filter(Boolean))]
    const { data: ms } = await db.from("merchants").select("id,name").in("id", merchantIds)
    const naam = new Map((ms ?? []).map((m: { id: string; name: string }) => [m.id, m.name.replace(/ \(house\)$/i, " (huisbar)")]))

    let sent = 0
    for (const h of open) {
      const { data: subs } = await db.from("push_subscriptions").select("id,endpoint,p256dh,auth").eq("organization_id", h.organization_id)
      const payload = JSON.stringify({
        title: `Water bijleveren: ${naam.get(h.merchant_id) ?? "onbekende bar"}`,
        body: h.message ?? "Water bijna op",
        url: "./?tab=help",
      })
      await Promise.all((subs ?? []).map(async (s: { id: string; endpoint: string; p256dh: string; auth: string }) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 900, urgency: "high" })
          sent++
        } catch (e: any) {
          if (e?.statusCode === 404 || e?.statusCode === 410) await db.from("push_subscriptions").delete().eq("id", s.id)
          else console.error("push naar", s.endpoint.slice(0, 40), e?.statusCode ?? String(e))
        }
      }))
    }
    return Response.json({ ok: true, meldingen: open.length, sent })
  } catch (e) {
    console.error("water-push mislukt", e)
    return Response.json({ ok: false, error: String(e) }, { status: 500 })
  }
})
