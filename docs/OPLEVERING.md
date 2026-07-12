# NvdW Organisatieportal — oplevering

Datum: 12 juli 2026. Alles hieronder staat live op productie, tenzij anders vermeld.
De architectuurnotitie (wat er stond, wat er is gekozen en waarom) staat in
[ARCHITECTUUR.md](./ARCHITECTUUR.md).

## Waar vind je het

Het Organisatieportal is het admin-gedeelte van nvdw-partnerportal.vercel.app.
Inloggen met je bestaande teamlogin (Supabase Auth); je komt automatisch in de
Organisatie-omgeving. Eén login voor alles.

## Wat er per systeem gebouwd of gewijzigd is

### Portal (repo nvdw-partnerportal, Vercel)
- **Start**: dashboard met tickets vandaag/totaal, ticketomzet, POS-omzet,
  dagen tot festival en crew-gaten, boven de bestaande systeemtegels met live status.
- **Programma** (het hart): één invoerpunt voor proeverijen en programma-items.
  Flow concept naar review naar live. Bij live maakt de database automatisch het
  tickettype aan (prijs, capaciteit); website, app, ticketshop en wachtlijst lezen
  uit dezelfde bron. Wijzigingen propageren direct; annuleren stopt de verkoop en
  toont het item overal als geannuleerd, kopers blijven traceerbaar. Tekstgeneratie
  via de knop "Genereer teksten" (Anthropic API, edge function generate-copy) met
  verplichte review; gegenereerde tekst gaat nooit vanzelf live.
- **Marketing & attributie**: verkopen en omzet per kanaal met periodefilter,
  UTM-linkbouwer, handmatige ad-uitgaven en kosten per ticket.
- **Crew-rooster**: standalone module (los van het MvdW-platform). Rollen, shifts
  (met bulk-aanmaak over drie dagen), leden, inroosteren, gaten-signalering,
  dubbel inroosteren geblokkeerd door de database, printbaar dagrooster en per
  crewlid een publieke roosterlink (/crew/token, mobiel, zonder login).
- **Pushberichten**: direct versturen of inplannen, doelgroep alle appgebruikers
  of kopers van een specifieke proeverij, deeplink naar de app, verzendlog.
  Ingeplande berichten worden elke vijf minuten door de cron verstuurd.
- **Financieel**: live omzet (ticketing per type, POS bruto en NvdW-deel,
  standgelden), begroting met kosten- en omzetposten, begroot versus gerealiseerd,
  marge-indicatie en CSV-import vanuit het spreadsheet.
- **App-advertenties**: adruimte in de app verkopen aan wijnpartners; vier
  posities (home, wijnen, food, programma), periode, prijs en live preview.
- Partnercrew & catering (het oude Crew-tabblad) heet nu zo om verwarring met
  het nieuwe crew-rooster te voorkomen.

### Ticketing (repo Nachtvandewijn-website, Supabase functions)
- create-order slaat de herkomst (first-touch en last-touch UTM, verwijzer,
  fbp/fbclid) gesaneerd op bij elke order.
- mollie-webhook stuurt bij betaling een server-side Purchase naar de Meta
  Conversions API met event_id gelijk aan het order-id; de pixel op de
  bedanktpagina gebruikt hetzelfde id, dus Meta ontdubbelt zelf. Zonder token
  gebeurt er niets (nette degradatie).
- shop-config filtert extras op status live en geeft de korte beschrijving mee.
- Wachtlijst, e-mailflows en verlaten-winkelwagen zijn niet aangeraakt en werken door.

### Website (nachtvandewijn.nl)
- programma en proeverijen zijn dynamisch: ze lezen live uit de database
  (view app_programma), met nette staten voor uitverkocht en geannuleerd,
  koopknoppen naar de ticketshop, en dezelfde lege staat als degradatie bij
  een storing. marketing.js legt de herkomst vast voor attributie (first-party,
  alleen localStorage, gaat pas mee bij een bestelling).

### Bezoekersapp (nvdw-bezoekers-app.vercel.app)
- Nieuw Programma-scherm met dagtabs en boekbare proeverijen (zelfde Mollie-flow
  als het restaurant, nu als gedeelde component). Home-teaser toont echte items.
- Pushmeldingen: aan/uit in Account, service worker toont berichten en opent de
  deeplink. Na inloggen wordt het toestel gekoppeld voor gerichte berichten.
- Adposities op home, wijnen, food en programma (alleen zichtbaar als er een
  actieve advertentie is).
- De app-map is nu een git-repo (eerste commit staat lokaal).

### Database (Supabase project nvdw-partnerportal)
Migraties 0009 t/m 0012 in nvdw-website/supabase/migrations:
statusflow en trigger-sync voor proeverijen, attributie plus kanaalindeling
(nvdw_kanaal), ad_spend, dashboard-leesrechten voor admins, crew-tabellen met
overlap-blokkade en publieke rooster-RPC, budget_posten, app_ads en push-tabellen.
RLS aangezet op waitlist en prior_attendance (stonden open). Nieuwe cron
nvdw-push-gepland (elke 5 minuten).

## Testresultaten

- **Proeverij-keten end-to-end** (via de portal-UI en de database): concept
  aanmaken (onzichtbaar publiek, geen tickettype), review, live zetten
  (tickettype automatisch aangemaakt, item direct in shop-config, app_programma
  en koopbaar via create-order met echte Mollie-checkout), capaciteit wijzigen
  (8 naar 12, direct overal), annuleren (verkoop stopt, item toont als
  geannuleerd), verwijderen geblokkeerd zodra er verkocht is. Alles geslaagd;
  testdata daarna opgeruimd.
- **Attributie**: testorder met UTM's, fbclid en fbp: correct gesaneerd
  opgeslagen (onbekende velden weggefilterd), kanaal geclassificeerd als
  meta_ads. Bestellingen zonder herkomst tellen als direct.
- **Crew**: dubbel inroosteren op overlappende shifts wordt geblokkeerd met een
  leesbare melding; gaten-view klopt; publieke roosterlink toont alleen het
  eigen rooster en is visueel gecontroleerd op mobiel formaat.
- **Push**: hele pijplijn getest (auth met interne sleutel en admin-JWT,
  claim-mechanisme tegen dubbel versturen, VAPID-ondertekening en versleuteling
  in de edge-runtime, opruimen van dode abonnementen). Let op: bezorging op een
  echt toestel is nog niet getest; zie handmatige stappen.
- **Visueel geverifieerd**: portal (dashboard, programma, attributie, crew,
  login), publieke crewpagina (mobiel), app (home-teaser, programmascherm,
  mobiel) en de live website-programmapagina op productie.
- **Live site**: ticketshop bleef gedurende alle wijzigingen werken
  (shop-config na elke deploy gecontroleerd; uptime-monitor bleef groen).

## Bewust niet gedaan / aanbevolen voor later

- **POS-integratie verdiepen**: het dashboard toont POS-omzet via de bestaande
  koppeling; het POS-systeem zelf (aparte codebase, geen git) is niet aangeraakt.
  Aanbeveling: ook die map onder git brengen.
- **App-orders krijgen geen attributie mee** (boekingen via de app tellen als
  direct). Klein, kan later in boeking-api.ts.
- **Foto-upload voor proeverijen**: nu een url-veld; upload naar Storage is een
  logische vervolgstap.
- **security_definer_view advisor**: de zes publieke app-views draaien bewust
  als definer (het bestaande patroon; ze tonen alleen gefilterde, publieke
  kolommen). Omzetten naar invoker-views met publieke leespolicies is netter
  maar raakt de hele app-keten; niet nu gedaan.
- **Oudere advisor-meldingen** (search_path op POS-functies, pg_net in public,
  wachtwoord-lekbescherming in Auth) stammen van voor deze opdracht en zijn
  blijven staan.
- **~/nvdw-ticketshop** is gemarkeerd als verouderde kopie (LET-OP-VEROUDERD.md);
  verwijderen kan zodra zeker is dat er niets meer uit nodig is.
- **Meta CAPI test-events**: pas zinvol zodra het token er is.

## Handmatige stappen (voor Milan)

1. **ANTHROPIC_API_KEY** zetten voor de tekstgeneratie: als rij in app_config
   (key ANTHROPIC_API_KEY) of als function-secret op generate-copy. Tot die tijd
   toont de knop een nette melding en kun je teksten zelf schrijven.
2. **META_CAPI_TOKEN** aanmaken in Meta Events Manager (pixel 3299993440321160,
   Conversions API, token genereren) en als rij in app_config zetten. Daarna
   in Events Manager controleren of server-events binnenkomen en ontdubbeld
   worden met de pixel.
3. **Pushmeldingen op een echt toestel testen**: app openen op je telefoon
   (app.nachtvandewijn.nl), Account, Meldingen aanzetten, daarna in het portal
   een testbericht naar alle appgebruikers sturen. VAPID-sleutels staan al klaar.
4. **GitHub-repo voor de bezoekersapp**: de lokale git-repo staat klaar in
   ~/nvdw-bezoekers-app; maak Thegrapeagency/nvdw-bezoekers-app aan en push
   (git remote add origin ... en git push -u origin main). Mag ook een andere naam zijn.
5. **Team informeren**: de proeverij-invoer loopt voortaan via het portal
   (Programma), niet meer los via ticket_types.
