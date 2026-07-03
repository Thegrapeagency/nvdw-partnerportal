// health: mission control voor het NvdW-ecosysteem.
// Checkt ticketshop, kassa (festival_pos), portal-data en bezoekersapp-views
// en geeft per systeem ok/storing + detail terug. Alleen voor ingelogde admins.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const URL = Deno.env.get("SUPABASE_URL")!
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } })

// korte timeout per check zodat één traag systeem niet de hele status ophoudt
const fetchMetTimeout = async (input: string, init: RequestInit = {}, ms = 6000): Promise<Response> => {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), ms)
  try { return await fetch(input, { ...init, signal: ac.signal }) } finally { clearTimeout(t) }
}

const geleden = (iso: string | null | undefined): string => {
  if (!iso) return "nog geen activiteit"
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return "zojuist"
  if (min < 60) return `${min} min geleden`
  const uur = Math.round(min / 60)
  if (uur < 48) return `${uur} uur geleden`
  return `${Math.round(uur / 24)} dagen geleden`
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  try {
    const authHeader = req.headers.get("Authorization") ?? ""
    if (!authHeader) return json({ error: "unauthorized" }, 401)
    const caller = createClient(URL, ANON, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } })
    const { data: isAdmin } = await caller.rpc("is_admin")
    if (!isAdmin) return json({ error: "forbidden" }, 403)

    const db = createClient(URL, SERVICE, { auth: { persistSession: false } })
    const pos = createClient(URL, SERVICE, { db: { schema: "festival_pos" }, auth: { persistSession: false } })

    const systems: { key: string; label: string; ok: boolean; detail: string }[] = []

    // 1. Ticketshop (edge function shop-config = hart van de verkoop) + laatste bestelling
    try {
      const [cfg, lastOrder] = await Promise.all([
        fetchMetTimeout(`${URL}/functions/v1/shop-config`, { headers: { apikey: ANON } }),
        db.from("orders").select("created_at").eq("status", "paid").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ])
      systems.push({
        key: "ticketing", label: "Ticketshop & betalingen", ok: cfg.ok,
        detail: cfg.ok ? `shop draait · laatste betaalde bestelling ${geleden(lastOrder.data?.created_at)}` : `shop-config gaf status ${cfg.status}`,
      })
    } catch {
      systems.push({ key: "ticketing", label: "Ticketshop & betalingen", ok: false, detail: "shop-config niet bereikbaar" })
    }

    // 2. Kassa (festival_pos): edge function leeft (401 op nep-token = gezond) + laatste verkoop
    try {
      const [boot, lastSale] = await Promise.all([
        fetchMetTimeout(`${URL}/functions/v1/pos-bootstrap`, {
          method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
          body: JSON.stringify({ device_token: "healthcheck" }),
        }),
        pos.from("orders").select("created_at").eq("status", "paid").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ])
      const leeft = boot.status === 401 || boot.ok
      systems.push({
        key: "kassa", label: "Kassasysteem (POS)", ok: leeft,
        detail: leeft ? `kassa-API draait · laatste verkoop ${geleden(lastSale.data?.created_at)}` : `pos-bootstrap gaf status ${boot.status}`,
      })
    } catch {
      systems.push({ key: "kassa", label: "Kassasysteem (POS)", ok: false, detail: "kassa-API niet bereikbaar" })
    }

    // 3. Portal-data (partners + teksten lezen)
    try {
      const { error, count } = await db.from("partners").select("id", { count: "exact", head: true })
      systems.push({
        key: "portal", label: "Partnerportal", ok: !error,
        detail: error ? error.message : `database bereikbaar · ${count ?? 0} partners`,
      })
    } catch {
      systems.push({ key: "portal", label: "Partnerportal", ok: false, detail: "portaldata niet leesbaar" })
    }

    // 4. Bezoekersapp (views waar de app op draait)
    try {
      const { error } = await db.from("app_wijnen").select("*", { head: true, count: "exact" })
      systems.push({
        key: "app", label: "Bezoekersapp (Nocturne)", ok: !error,
        detail: error ? error.message : "app-views leesbaar · app haalt data live op",
      })
    } catch {
      systems.push({ key: "app", label: "Bezoekersapp (Nocturne)", ok: false, detail: "app-views niet leesbaar" })
    }

    return json({ ok: systems.every(s => s.ok), checked_at: new Date().toISOString(), systems })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
