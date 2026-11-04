-- Extra bestellen (koelingen, pins, ...) kan dicht. Staat er een melding in
-- portal_teksten.extras_gesloten_tekst, dan is de shop gesloten: partners zien
-- die melding, en kunnen niets meer aanvragen, aanpassen of verwijderen.
-- Leeg = shop open. Admins (mag('partners')) blijven gewoon alles kunnen.

insert into public.portal_teksten (sleutel, label, waarde, type, groep, volgorde)
values ('extras_gesloten_tekst', 'Extra bestellen gesloten: melding voor partners (leeg = shop open)', '', 'meerregelig', 'extra bestellen', 0)
on conflict (sleutel) do nothing;

create or replace function public.extras_open()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce((select trim(waarde) from portal_teksten where sleutel = 'extras_gesloten_tekst'), '') = ''
$$;

drop policy if exists "Partner bestellingen schrijven" on public.extra_bestellingen;
create policy "Partner bestellingen schrijven" on public.extra_bestellingen
  for insert with check (
    extras_open() and partner_id in (select partners.id from partners where partners.user_id = auth.uid())
  );

drop policy if exists "Partner eigen bestelling wijzigen" on public.extra_bestellingen;
create policy "Partner eigen bestelling wijzigen" on public.extra_bestellingen
  for update using (
    extras_open()
    and partner_id in (select partners.id from partners where partners.user_id = auth.uid())
    and coalesce(status, 'aangevraagd') = 'aangevraagd'
  ) with check (
    extras_open()
    and partner_id in (select partners.id from partners where partners.user_id = auth.uid())
    and coalesce(status, 'aangevraagd') = 'aangevraagd'
  );

drop policy if exists "Partner eigen bestelling verwijderen" on public.extra_bestellingen;
create policy "Partner eigen bestelling verwijderen" on public.extra_bestellingen
  for delete using (
    extras_open()
    and partner_id in (select partners.id from partners where partners.user_id = auth.uid())
    and coalesce(status, 'aangevraagd') = 'aangevraagd'
  );
