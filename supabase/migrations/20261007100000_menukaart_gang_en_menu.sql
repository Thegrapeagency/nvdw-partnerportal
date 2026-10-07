-- Restaurantmenu's (Léo-Léo) bestaan uit twee varianten (standaard en vega) van
-- elk 3 gangen, plus een upsell. Tot nu toe leidde de app de gang af uit de
-- volgorde van de rijen, dat werkt niet meer met twee menu's. Daarom twee
-- optionele kolommen op menukaart. Foodtrucks laten ze leeg en merken niets.
--   gang: 1, 2 of 3
--   menu: 'standaard', 'vega', 'beide' (zelfde gerecht in allebei) of 'upsell'
alter table public.menukaart
  add column if not exists gang smallint check (gang between 1 and 3),
  add column if not exists menu text check (menu in ('standaard', 'vega', 'beide', 'upsell'));

-- Nieuwe kolommen achteraan, zodat bestaande lezers van de view niet breken.
create or replace view public.app_menu as
select m.id,
       m.partner_id,
       m.naam,
       m.omschrijving,
       m.prijs,
       m.allergenen,
       m.volgorde,
       coalesce(p.bedrijfsnaam, p.naam) as huis,
       p.type,
       p.barlocatie,
       m.gang,
       m.menu
from public.menukaart m
join public.partners p on p.id = m.partner_id
where p.zichtbaar_in_app = true;
