-- Alleen-lezen toegang per gebied. Het bestaande rechten-systeem is
-- alles-of-niets: sta je op een gebied, dan mag je alles binnen dat gebied
-- lezen en schrijven. rechten_lezen voegt een tussenniveau toe: gebieden die
-- je mag ZIEN zonder te mogen schrijven. mag() (schrijf-check, overal in de
-- app gebruikt) blijft ongewijzigd, zodat dit nul risico geeft voor andere
-- gebieden. Alleen de partners-gebied-tabellen krijgen een losse
-- lees-policy op basis van de nieuwe mag_lezen(); de schrijf-policies
-- blijven op de bestaande mag() staan.

alter table public.admins add column if not exists rechten_lezen text[];

create or replace function public.mag_lezen(gebied text)
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.admins
    where lower(email) = lower(auth.jwt() ->> 'email')
      and actief = true
      and (rechten is null or gebied = any(rechten) or gebied = any(rechten_lezen))
  );
$$;

do $$
declare
  t text;
  tabellen text[] := array['crewcatering','documenten','extra_bestellingen','faq','menukaart',
                            'partner_vragen','partners','portal_teksten','producten_catalogus','wijnlijst'];
begin
  foreach t in array tabellen loop
    execute format('drop policy if exists %I on public.%I', 'Partner-rechten beheren ' || t, t);
    execute format('create policy %I on public.%I for select using (mag_lezen(''partners''))',
                    'Partner-rechten lezen ' || t, t);
    execute format('create policy %I on public.%I for insert with check (mag(''partners''))',
                    'Partner-rechten aanmaken ' || t, t);
    execute format('create policy %I on public.%I for update using (mag(''partners'')) with check (mag(''partners''))',
                    'Partner-rechten bijwerken ' || t, t);
    execute format('create policy %I on public.%I for delete using (mag(''partners''))',
                    'Partner-rechten verwijderen ' || t, t);
  end loop;
end $$;

comment on column public.admins.rechten_lezen is 'Gebieden die iemand mag ZIEN zonder te mogen schrijven. Los van rechten (dat blijft lees+schrijf). Alleen afgedwongen waar RLS-policies mag_lezen() gebruiken (nu: de partners-gebied-tabellen).';
