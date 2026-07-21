// schrijf: generator die teksten schrijft in de eigen stem van Nacht van de Wijn.
//
// De stem komt uit de database, niet uit deze code: schrijfstijl_voorbeelden
// (echte teksten die goed zijn) en schrijfstijl_regels (harde altijd/nooit).
// Het team beheert die zelf in de portal, deze function leest ze alleen.
//
// Twee acties:
//   genereer  -> drie varianten voor een teksttype, met echte festivalfeiten
//   pdf       -> haalt bruikbare voorbeelden en regels uit een geüploade PDF
//
// Alleen voor ingelogde admins. Sleutel: ANTHROPIC_API_KEY als function-secret,
// of als rij in app_config (zelfde patroon als generate-copy).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const URL = Deno.env.get("SUPABASE_URL")!
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const FALLBACK_MODEL = "claude-opus-4-8"

const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } })

const DAGEN: Record<string, string> = { fri: "vrijdag 6 november", sat: "zaterdag 7 november", sun: "zondag 8 november" }

// Geen em-dashes of gedachtestreepjes in zichtbare copy, wat het model ook doet.
// Dit is een harde huisregel, dus die borgen we hier en niet alleen in de prompt.
function schoon(tekst: string): string {
  return tekst
    .replaceAll(/\s*—\s*/g, ". ")
    .replaceAll(/\s+–\s+/g, ", ")
    .replaceAll("–", "-")
    .replaceAll(/\.\s*\./g, ".")
    .trim()
}

async function haalApiKey(db: ReturnType<typeof createClient>): Promise<string | null> {
  const uitEnv = Deno.env.get("ANTHROPIC_API_KEY")
  if (uitEnv) return uitEnv
  const { data } = await db.from("app_config").select("value").eq("key", "ANTHROPIC_API_KEY").maybeSingle()
  return (data?.value as string | undefined) ?? null
}

// Bouwt het stabiele deel van de prompt: identiteit, regels, voorbeelden.
// Deze volgorde is bewust stabiel-naar-variabel, zodat prompt caching werkt.
async function bouwStem(db: ReturnType<typeof createClient>, kanaal: string | null) {
  const [{ data: regels }, { data: voorbeelden }] = await Promise.all([
    db.from("schrijfstijl_regels").select("regel, soort").eq("actief", true).order("volgorde"),
    db.from("schrijfstijl_voorbeelden").select("titel, tekst, kanaal").eq("actief", true).order("created_at"),
  ])

  const altijd = (regels ?? []).filter((r: { soort: string }) => r.soort === "altijd").map((r: { regel: string }) => `- ${r.regel}`)
  const nooit = (regels ?? []).filter((r: { soort: string }) => r.soort === "nooit").map((r: { regel: string }) => `- ${r.regel}`)

  // Voorbeelden voor dit kanaal wegen het zwaarst; algemene voorbeelden
  // (kanaal leeg) doen altijd mee. Voorbeelden van andere kanalen laten we
  // weg, die vertroebelen de toon meer dan ze helpen.
  const relevant = (voorbeelden ?? []).filter((v: { kanaal: string | null }) => !v.kanaal || v.kanaal === kanaal)

  const stukken = [
    "Je schrijft teksten voor Nacht van de Wijn, editie 7, op 6, 7 en 8 november 2026 in de Werkspoorkathedraal in Utrecht.",
    "",
    "ZO SCHRIJVEN WE:",
    ...(altijd.length ? altijd : ["- Nederlands, kort en direct"]),
    "",
    "DIT NOOIT:",
    ...(nooit.length ? nooit : ["- Em-dashes en gedachtestreepjes"]),
  ]

  if (relevant.length) {
    stukken.push(
      "",
      "VOORBEELDEN VAN ONZE EIGEN TEKSTEN.",
      "Neem hier het ritme, de woordkeuze en de toon uit over. Kopieer geen zinnen en geen inhoud, alleen de manier van schrijven.",
      "",
      ...relevant.map((v: { titel: string; tekst: string }) => `[${v.titel}]\n${v.tekst}`),
    )
  }

  return { systeem: stukken.join("\n"), aantalVoorbeelden: relevant.length }
}

// Haalt echte feiten op zodat er geen prijzen of tijden verzonnen worden.
async function haalFeiten(db: ReturnType<typeof createClient>, proeverijId?: string, partnerId?: string): Promise<string | null> {
  if (proeverijId) {
    const { data } = await db.from("proeverijen")
      .select("titel, host, soort, dag, start_tijd, locatie, capaciteit, prijs_cents, steekwoorden, beschrijving")
      .eq("id", proeverijId).maybeSingle()
    if (!data) return null
    const tijd = data.start_tijd
      ? new Date(data.start_tijd as string).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" })
      : null
    return [
      `Titel: ${data.titel}`,
      data.host ? `Host: ${data.host}` : null,
      data.soort ? `Soort: ${data.soort}` : null,
      data.dag ? `Dag: ${DAGEN[data.dag as string] ?? data.dag}` : null,
      tijd ? `Starttijd: ${tijd} uur` : null,
      data.locatie ? `Locatie: ${data.locatie}` : null,
      data.capaciteit ? `Capaciteit: ${data.capaciteit} plekken` : null,
      data.prijs_cents ? `Prijs: ${((data.prijs_cents as number) / 100).toFixed(2).replace(".", ",")} euro` : null,
      data.steekwoorden ? `Steekwoorden: ${data.steekwoorden}` : null,
      data.beschrijving ? `Bestaande beschrijving: ${data.beschrijving}` : null,
    ].filter(Boolean).join("\n")
  }
  if (partnerId) {
    const { data } = await db.from("partners")
      .select("bedrijfsnaam, type, publiek_beschrijving, notities")
      .eq("id", partnerId).maybeSingle()
    if (!data) return null
    const soortLabel: Record<string, string> = { wijn: "wijnhuis", food: "foodtruck", restaurant: "restaurant" }
    return [
      `Partner: ${data.bedrijfsnaam}`,
      data.type ? `Soort: ${soortLabel[data.type as string] ?? data.type}` : null,
      data.publiek_beschrijving ? `Bestaande beschrijving: ${data.publiek_beschrijving}` : null,
      data.notities ? `Interne notities: ${data.notities}` : null,
    ].filter(Boolean).join("\n")
  }
  return null
}

async function roepClaude(apiKey: string, body: Record<string, unknown>) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const detail = await res.text()
    console.error("anthropic error", res.status, detail)
    throw new Error(`generatie_mislukt_${res.status}`)
  }
  const msg = await res.json()
  if (msg.stop_reason === "refusal") throw new Error("generatie_geweigerd")
  const tekst = (msg.content ?? []).find((b: { type: string }) => b.type === "text")?.text
  if (!tekst) throw new Error("leeg_antwoord")
  return { data: JSON.parse(tekst), usage: msg.usage }
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

    const db = createClient(URL, SERVICE, { auth: { persistSession: false } })
    const apiKey = await haalApiKey(db)
    if (!apiKey) {
      return json({ error: "geen_api_key", melding: "Er is nog geen Anthropic API key ingesteld. Zet ANTHROPIC_API_KEY als function-secret of in app_config." }, 503)
    }

    const body = await req.json()
    const actie: string = body.actie ?? "genereer"

    // ---- PDF uitlezen: voorbeelden en regels eruit halen ter review ----
    if (actie === "pdf") {
      const pdf: string | undefined = body.pdf_base64
      if (!pdf) return json({ error: "pdf_ontbreekt" }, 400)

      const { data } = await roepClaude(apiKey, {
        model: FALLBACK_MODEL,
        max_tokens: 8000,
        system: "Je helpt een festivalorganisatie hun eigen schrijfstijl vastleggen. Je leest een document en haalt er bruikbaar materiaal uit. Je verzint niets.",
        messages: [{
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdf } },
            {
              type: "text",
              text: [
                "Haal twee dingen uit dit document.",
                "",
                "1. voorbeelden: losse stukken lopende tekst die geschikt zijn als stijlvoorbeeld. Alleen echte wervende of informerende teksten, dus geen inhoudsopgaves, colofons, adresgegevens, kopjes of tabellen. Geef elk voorbeeld een korte beschrijvende titel. Maximaal 12 stuks, en alleen als ze echt bruikbaar zijn.",
                "2. regels: expliciete schrijfstijl-afspraken die in het document staan (bijvoorbeeld tone-of-voice-regels of woorden die wel of niet gebruikt mogen worden). Soort is 'altijd' voor wat wel moet en 'nooit' voor wat niet mag. Alleen regels die er echt in staan, verzin er geen bij. Vaak zijn dit er nul.",
                "",
                "Staat er niets bruikbaars in, geef dan lege lijsten terug.",
              ].join("\n"),
            },
          ],
        }],
        output_config: {
          format: {
            type: "json_schema",
            schema: {
              type: "object",
              properties: {
                voorbeelden: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: { titel: { type: "string" }, tekst: { type: "string" } },
                    required: ["titel", "tekst"],
                    additionalProperties: false,
                  },
                },
                regels: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: { regel: { type: "string" }, soort: { type: "string", enum: ["altijd", "nooit"] } },
                    required: ["regel", "soort"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["voorbeelden", "regels"],
              additionalProperties: false,
            },
          },
        },
      })

      return json({
        voorbeelden: (data.voorbeelden ?? []).map((v: { titel: string; tekst: string }) => ({ titel: v.titel, tekst: schoon(v.tekst) })),
        regels: data.regels ?? [],
      })
    }

    // ---- Genereren: drie varianten voor een teksttype ----
    const typeSleutel: string = body.type_sleutel
    if (!typeSleutel) return json({ error: "type_verplicht" }, 400)

    const { data: type } = await db.from("tekst_types").select("*").eq("sleutel", typeSleutel).maybeSingle()
    if (!type) return json({ error: "type_onbekend" }, 400)

    const onderwerp: string = (body.onderwerp ?? "").trim()
    const steekwoorden: string = (body.steekwoorden ?? "").trim()
    const feiten = await haalFeiten(db, body.proeverij_id, body.partner_id)
    if (!onderwerp && !feiten) return json({ error: "onderwerp_verplicht" }, 400)

    const { systeem, aantalVoorbeelden } = await bouwStem(db, typeSleutel)

    const opdracht = [
      `Schrijf een tekst van het type: ${type.naam}.`,
      String(type.instructie),
      type.max_woorden ? `Houd het onder de ${type.max_woorden} woorden.` : null,
      "",
      onderwerp ? `Onderwerp: ${onderwerp}` : null,
      feiten ? `\nFEITEN. Gebruik deze exact, verzin er niets bij:\n${feiten}` : null,
      steekwoorden ? `\nSteekwoorden van de organisatie: ${steekwoorden}` : null,
      "",
      "Lever drie duidelijk verschillende varianten. Niet drie keer dezelfde tekst met andere woorden, maar drie verschillende invalshoeken.",
    ].filter(Boolean).join("\n")

    const { data, usage } = await roepClaude(apiKey, {
      model: String(type.model || FALLBACK_MODEL),
      max_tokens: 4000,
      thinking: { type: "adaptive" },
      system: [{ type: "text", text: systeem, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: opdracht }],
      output_config: {
        effort: "medium",
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: { varianten: { type: "array", items: { type: "string" } } },
            required: ["varianten"],
            additionalProperties: false,
          },
        },
      },
    })

    const varianten = (data.varianten ?? []).map((v: string) => schoon(v)).filter(Boolean)
    if (!varianten.length) return json({ error: "leeg_antwoord" }, 502)

    // Loggen zodat je terug kunt zien wat er gemaakt is en wat gekozen werd.
    const { data: generatie } = await db.from("tekst_generaties").insert({
      type_sleutel: typeSleutel,
      onderwerp: onderwerp || (feiten ? feiten.split("\n")[0] : null),
      steekwoorden: steekwoorden || null,
      varianten,
      auteur: body.auteur ?? null,
    }).select("id").maybeSingle()

    return json({
      varianten,
      generatie_id: generatie?.id ?? null,
      model: type.model,
      voorbeelden_gebruikt: aantalVoorbeelden,
      cache: { geschreven: usage?.cache_creation_input_tokens ?? 0, gelezen: usage?.cache_read_input_tokens ?? 0 },
    })
  } catch (e) {
    const melding = String((e as Error)?.message ?? e)
    console.error(melding)
    if (melding.includes("geweigerd")) return json({ error: "generatie_geweigerd" }, 502)
    return json({ error: melding }, 500)
  }
})
