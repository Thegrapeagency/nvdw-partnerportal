-- RLS filtert rijen, geen kolommen: Mick kon via de partners-gebied
-- lees-policy dus ook afdracht_percentage en standplaats_vergoeding
-- (standgeld) zien, terwijl hij alleen wijnen en partnernamen zou moeten
-- zien. Deze view maskeert de commerciele velden met NULL voor iedereen
-- zonder volledige (schrijf)toegang tot partners; wie wel mag() heeft
-- (echte partnerbeheerders) ziet alles gewoon, identiek aan de brontabel.
create or replace view public.partners_lezen
with (security_invoker = true) as
select
  id, user_id, naam, bedrijfsnaam, email, telefoon, pakket, avond, barlocatie, status,
  offerte_akkoord, offerte_akkoord_datum, type, contract_ondertekend, contract_ondertekend_datum,
  contract_ondertekenaar, zichtbaar_in_app, kaart_x, kaart_y, publiek_beschrijving, publiek_foto_url,
  social_copy, aangekondigd, aangekondigd_op, created_at, updated_at,
  gratis_tickets, crew_tickets, ticket_codes, kortingscode, notities,
  stroom_kw, stroom_aansluitingen, gas_nodig, water_nodig, techniek_opmerkingen,
  case when mag('partners') then afdracht_percentage end as afdracht_percentage,
  case when mag('partners') then standplaats_vergoeding end as standplaats_vergoeding,
  case when mag('partners') then standplaats_inbegrepen end as standplaats_inbegrepen,
  case when mag('partners') then contract_snapshot end as contract_snapshot,
  case when mag('partners') then contract_handtekening end as contract_handtekening
from public.partners
where mag_lezen('partners');

grant select on public.partners_lezen to authenticated;

comment on view public.partners_lezen is 'Voor de algemene partnerlijst/detailweergave. Maskeert afdracht_percentage, standplaats_vergoeding, standplaats_inbegrepen, contract_snapshot en contract_handtekening naar NULL voor wie geen volledige (schrijf)toegang tot partners heeft, zodat alleen-lezen gebruikers zoals een marketeer wel namen en wijnen zien maar geen commerciele afspraken.';
