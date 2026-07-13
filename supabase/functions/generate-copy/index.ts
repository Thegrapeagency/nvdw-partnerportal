// generate-copy: schrijft wervende teksten voor een programma-item of
// partner-aankondiging (proeverij, artiest, foodtruck, wijnhuis, restaurant).
// Alleen voor ingelogde admins. De teksten gaan ALTIJD door de reviewstap in
// het portal; deze function zet nooit zelf iets live.
// Sleutel: ANTHROPIC_API_KEY als function-secret, of als rij in app_config.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const URL = Deno.env.get("SUPABASE_URL")!
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const MODEL = "claude-opus-4-8"

const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } })

const DAGEN: Record<string, string> = { fri: "vrijdag 6 november", sat: "zaterdag 7 november", sun: "zondag 8 november" }

// Geen em-dashes of gedachtestreepjes in zichtbare copy, wat het model ook doet
function schoon(tekst: string): string {
  return tekst
    .replaceAll(/\s*—\s*/g, ". ")
    .replaceAll(/\s+–\s+/g, ", ")
    .replaceAll("–", "-")
    .replaceAll(/\.\s*\./g, ".")
    .trim()
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

    let apiKey = Deno.env.get("ANTHROPIC_API_KEY")
    if (!apiKey) {
      const db = createClient(URL, SERVICE, { auth: { persistSession: false } })
      const { data } = await db.from("app_config").select("value").eq("key", "ANTHROPIC_API_KEY").maybeSingle()
      apiKey = data?.value
    }
    if (!apiKey) return json({ error: "geen_api_key", melding: "Er is nog geen Anthropic API key ingesteld. Zet ANTHROPIC_API_KEY als function-secret of in app_config." }, 503)

    const { proeverij } = await req.json()
    if (!proeverij?.titel) return json({ error: "titel_verplicht" }, 400)

    // toon per soort: waar gaat dit item over en welke woorden passen erbij
    const SOORT_INSTRUCTIE: Record<string, string> = {
      proeverij: "Dit is een begeleide proeverij of masterclass met tickets. Benadruk wat je proeft en wat je ervan opsteekt.",
      workshop: "Dit is een workshop met tickets. Benadruk wat je zelf doet en leert.",
      restaurant: "Dit is een shift in het pop-uprestaurant. Benadruk het menu, de producent en het samen aan tafel zitten.",
      podium: "Dit is een artiest of act op het podium, gratis bij je festivalticket. Schrijf als een line-up-aankondiging: energie, sfeer, waarom je erbij wil staan. Geen ticketverkoop-taal.",
      silent_disco: "Dit is de silent disco, gratis bij je festivalticket. Licht en speels.",
      foodtruck: "Dit is een foodtruck op het festivalterrein, geen reservering nodig. Schrijf over het eten: wat er uit de keuken komt, welke wijn erbij past als dat gegeven is. Hongermakend maar concreet.",
      wijnhuis: "Dit is een wijnhuis of wijnbar op het festival. Schrijf over de maker, de streek en wat er in het glas komt.",
      overig: "Dit is een programma-onderdeel van het festival.",
    }
    const toon = SOORT_INSTRUCTIE[proeverij.soort as string] ?? SOORT_INSTRUCTIE.overig

    const tijd = proeverij.start_tijd
      ? new Date(proeverij.start_tijd).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" })
      : null
    const feiten = [
      `Titel: ${proeverij.titel}`,
      proeverij.host ? `Wijnhuis/host: ${proeverij.host}` : null,
      proeverij.soort ? `Soort: ${proeverij.soort}` : null,
      proeverij.dag ? `Dag: ${DAGEN[proeverij.dag] ?? proeverij.dag}` : null,
      tijd ? `Starttijd: ${tijd} uur` : null,
      proeverij.locatie ? `Locatie in de Werkspoorkathedraal: ${proeverij.locatie}` : null,
      proeverij.capaciteit ? `Capaciteit: ${proeverij.capaciteit} plekken` : null,
      proeverij.prijs_cents ? `Prijs: ${(proeverij.prijs_cents / 100).toFixed(2).replace(".", ",")} euro` : null,
      proeverij.steekwoorden ? `Steekwoorden van de organisatie: ${proeverij.steekwoorden}` : null,
    ].filter(Boolean).join("\n")

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        system: [
          "Je schrijft festivalteksten voor Nacht van de Wijn, editie 7, op 6, 7 en 8 november 2026 in de Werkspoorkathedraal in Utrecht.",
          "Schrijfstijl: Nederlands. Korte, directe zinnen. Authentiek en enthousiast, nooit opgeklopt. Geen superlatieven-stapeling.",
          "Verboden: em-dashes en gedachtestreepjes, het woord 'unieke', frases als 'onderdompelen', 'beleving van jewelste', 'voor ieder wat wils'. Geen uitroeptekens-stapeling.",
          "Schrijf voor wijnliefhebbers die geen sommelier zijn. Concreet boven abstract: noem druiven, regio's en smaken als de steekwoorden die geven.",
          "Verzin geen feiten die niet in de invoer staan.",
        ].join(" "),
        messages: [{
          role: "user",
          content: `${toon}\n\nSchrijf teksten voor dit item:\n\n${feiten}\n\nLever drie teksten:\n1. beschrijving: wervende beschrijving voor website en app, 60 tot 100 woorden, twee alinea's mag.\n2. beschrijving_kort: een variant van maximaal 25 woorden voor overzichten en de ticketshop.\n3. social_copy: tekst voor een Instagram-post of story, maximaal 50 woorden, mag met een vraag of aansporing eindigen, geen hashtags.`,
        }],
        output_config: {
          format: {
            type: "json_schema",
            schema: {
              type: "object",
              properties: {
                beschrijving: { type: "string" },
                beschrijving_kort: { type: "string" },
                social_copy: { type: "string" },
              },
              required: ["beschrijving", "beschrijving_kort", "social_copy"],
              additionalProperties: false,
            },
          },
        },
      }),
    })

    if (!res.ok) {
      const detail = await res.text()
      console.error("anthropic error", res.status, detail)
      return json({ error: "generatie_mislukt", status: res.status }, 502)
    }
    const msg = await res.json()
    if (msg.stop_reason === "refusal") return json({ error: "generatie_geweigerd" }, 502)
    const tekst = (msg.content ?? []).find((b: { type: string }) => b.type === "text")?.text
    if (!tekst) return json({ error: "leeg_antwoord" }, 502)
    const uit = JSON.parse(tekst)

    return json({
      beschrijving: schoon(uit.beschrijving),
      beschrijving_kort: schoon(uit.beschrijving_kort),
      social_copy: schoon(uit.social_copy),
      model: MODEL,
    })
  } catch (e) {
    console.error(e)
    return json({ error: String(e) }, 500)
  }
})
