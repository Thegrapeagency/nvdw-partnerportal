-- Of een crewlid betaald personeel is of vrijwilliger, alleen voor intern
-- gebruik. Partners vullen hun eigen crew in via het dashboard en mogen dit
-- veld niet zien of zetten, dus we maskeren 'm net als bij partners_lezen
-- met een view die de kolom weglaat i.p.v. 'm te tonen als leeg/false (dat
-- zou nog steeds info lekken). security_invoker zorgt dat de bestaande RLS
-- van de crew-tabel (partner ziet alleen eigen crew) gewoon van toepassing
-- blijft op de view, dit voegt alleen kolom-afscherming toe.
alter table public.crew add column if not exists betaald boolean not null default false;
comment on column public.crew.betaald is 'Alleen admin-intern: betaald crewlid (true) of vrijwilliger (false). Partners zien dit veld niet, ook niet via de API (zie crew_partner_lezen).';

create or replace view public.crew_partner_lezen
with (security_invoker = true) as
select id, partner_id, naam, functie, email, dagen, catering_dagen, dieet, created_at, updated_at
from public.crew;

grant select on public.crew_partner_lezen to authenticated;

comment on view public.crew_partner_lezen is 'Voor de partnerkant (dashboard): dezelfde rijen als crew onder dezelfde RLS, maar zonder de kolom betaald.';
