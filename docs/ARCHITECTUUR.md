# NvdW Organisatieportal — architectuurnotitie

Datum: 12 juli 2026. Geschreven bij de start van de bouw van het Organisatieportal, na verkenning van alle bestaande systemen.

## Wat er al stond

Alle NvdW-systemen draaien op **één Supabase-project** (`snfojphxsbzfewwfbfka`, naam "nvdw-partnerportal", eu-west-1):

| Systeem | Frontend | Data | Deploy |
|---|---|---|---|
| Website + ticketshop | statische HTML + `assets/shop.js` | `public` schema (orders, tickets, ticket_types, inventory, waitlist, ...) | Vercel `nachtvandewijn`, repo `Thegrapeagency/Nachtvandewijn-website` |
| Ticketing-backend | 17 edge functions (create-order, mollie-webhook, admin, scan, waitlist, ...) | idem | Supabase, bron in `nvdw-website/supabase/functions` |
| Partnerportal + admin | Next.js 16 app router | `public` schema (partners, wijnlijst, menukaart, admins, ...) | Vercel `nvdw-partnerportal`, repo `Thegrapeagency/nvdw-partnerportal` |
| POS | Vite React (admin + pos-web) in `~/festival-pos` | **apart schema `festival_pos`**, koppeling via DB-triggers op wijnlijst/menukaart | GitHub Pages (demo) |
| Bezoekersapp "Nocturne" | Vite React PWA in `~/nvdw-bezoekers-app` | `public` schema via views `app_wijnen`, `app_menu`, `app_proeverijen`, `app_programma` | Vercel `nvdw-bezoekers-app` |

Auth bestaat in twee smaken:
- **Supabase Auth** voor partnerportal en POS-admin, met tabel `admins` (6 teamleden) + RPC `is_admin()`.
- **Sleutel-headers** voor de ticketing-admin (`x-admin-key`, twee sleutels: Milan + Frank) en scanner (`x-scanner-key`).

## Kernbeslissingen

1. **Het Organisatieportal is een uitbreiding van `/admin` in nvdw-partnerportal.** Daar bestond al een proto-portal: login via Supabase Auth, `is_admin()`, 17 tabs, live health-check van alle systemen, POS-uitbetaaloverzicht. Eén login voor het team bestaat dus al; we bouwen de ontbrekende modules erbij in plaats van een vijfde app te maken.
2. **`proeverijen` is de ene bron van waarheid voor programma-items.** De tabel bestond al met een koppeling naar `ticket_types`. Wij voegen toe: statusflow (concept → review → live → geannuleerd), invoervelden voor tekstgeneratie, en een **database-trigger** die bij status "live" automatisch het tickettype aanmaakt/bijwerkt (capaciteit, prijs, naam). Dit volgt het bestaande koppelingspatroon van dit project (wijnlijst → POS gaat ook via triggers). Wie of wat de proeverij ook aanpast: ticketshop, website, app en wachtlijst kloppen automatisch.
3. **Website en app lezen uit dezelfde views** (`app_programma`, `app_proeverijen`). De statische placeholderpagina's `programma.html`/`proeverijen.html` worden dynamisch, naar het patroon van `restaurant.js`. De app krijgt een echt programmascherm in plaats van de hardcoded teaser.
4. **Tekstgeneratie via een edge function `generate-copy`** (Anthropic API), alleen voor admins. Gegenereerde tekst gaat áltijd door de reviewstap in het portal; niets gaat automatisch live.
5. **Schema-migraties blijven in `nvdw-website/supabase/migrations`** (0001–0008 staan daar al; wij nummeren door). Het portal-repo houdt alleen zijn eigen edge functions.
6. **Attributie**: UTM first/last-touch capture in `shop.js`, opslag op `orders`, server-side Meta CAPI purchase-event vanuit `mollie-webhook` met `event_id = order_id` (de pixel vuurt al met datzelfde ID, dus deduplicatie klopt).
7. **Crew-rooster staat volledig los** van het MvdW-sommelierplatform én van de bestaande `crew`-tabel (dat is partner-crewcatering). Nieuwe tabellen met prefix `crew_` voor rollen, shifts en toewijzingen.
8. **Push**: web-push (VAPID) is greenfield; subscriptions-tabel + service-worker-handler in de app + verstuur-function + log.

## Aangetroffen problemen (opgepakt in de audit, Deel 7)

- `~/nvdw-ticketshop` is een **verouderde kopie** van de ticketing-functions (mist waitlist en migrations). Canoniek is `nvdw-website/supabase`. Gemarkeerd als deprecated.
- **RLS uit** op `waitlist` en `prior_attendance`: beide tabellen zijn met de anon key te lezen/schrijven. Wachtlijst-writes lopen via de edge function (service role), dus RLS aanzetten kan veilig; wordt meegenomen.
- De publieke leespolicy op `proeverijen` filtert alleen op `actief`, niet op status; aangescherpt zodat concepten nooit publiek lekken.
- `~/nvdw-bezoekers-app` en `~/festival-pos` zijn **geen git-repo's**; de app krijgt er een zodat deploys traceerbaar zijn.
- Orders hebben nog geen attributiedata; Meta Pixel vuurt client-side al met `eventID = order_id` (voorbereid op CAPI).
