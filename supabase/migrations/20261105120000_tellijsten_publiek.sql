-- Tellijsten zonder inlog: Sara en de bars tellen via een geheime link
-- (/tellen/<token>) in plaats van met een beheerderslogin. Zelfde aanpak als
-- de crewpagina: de tabel blijft dicht voor anonieme bezoekers, alleen twee
-- SECURITY DEFINER-functies kunnen er met het juiste token bij.
-- Via de link kun je een telling opslaan en de laatste tellingen bekijken.
-- Aanpassen of verwijderen blijft voorbehouden aan beheerders in het portaal.

create table if not exists public.tellijst_link (
  token text primary key default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  created_at timestamptz not null default now()
);

alter table public.tellijst_link enable row level security;

-- Beheerders met leesrechten op Partners zien de link in het portaal, zodat ze
-- hem kunnen kopiëren. Anonieme bezoekers komen er niet bij.
create policy "Tellijst-link lezen" on public.tellijst_link
  for select using (mag_lezen('partners'));

insert into public.tellijst_link (token)
select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
where not exists (select 1 from public.tellijst_link);

create or replace function public.tellijst_publiek_opslaan(
  p_token text,
  p_soort text,
  p_bar text,
  p_geteld_op date,
  p_geteld_door text,
  p_aantallen jsonb,
  p_opmerking text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from tellijst_link where token = p_token) then
    raise exception 'ONGELDIGE_LINK';
  end if;
  if p_soort not in ('bar', 'voorraad') then
    raise exception 'ONGELDIGE_SOORT';
  end if;
  if p_aantallen is null or jsonb_typeof(p_aantallen) <> 'object' or p_aantallen = '{}'::jsonb then
    raise exception 'GEEN_AANTALLEN';
  end if;
  if coalesce(trim(p_geteld_door), '') = '' then
    raise exception 'GEEN_NAAM';
  end if;

  insert into tellijsten (soort, bar, geteld_op, geteld_door, aantallen, opmerking, aangemaakt_door)
  values (
    p_soort,
    case when p_soort = 'bar' then left(p_bar, 60) else null end,
    coalesce(p_geteld_op, current_date),
    left(trim(p_geteld_door), 80),
    p_aantallen,
    nullif(left(trim(coalesce(p_opmerking, '')), 500), ''),
    'link zonder inlog'
  );

  return jsonb_build_object('ok', true);
end $$;

create or replace function public.tellijst_publiek_overzicht(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from tellijst_link where token = p_token) then
    return jsonb_build_object('geldig', false);
  end if;

  return jsonb_build_object(
    'geldig', true,
    'tellingen', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id, 'soort', t.soort, 'bar', t.bar, 'geteld_op', t.geteld_op,
        'geteld_door', t.geteld_door, 'regels', (select count(*) from jsonb_object_keys(t.aantallen)),
        'opmerking', t.opmerking
      ) order by t.geteld_op desc, t.created_at desc), '[]'::jsonb)
      from (select * from tellijsten order by geteld_op desc, created_at desc limit 30) t
    )
  );
end $$;

revoke all on function public.tellijst_publiek_opslaan(text, text, text, date, text, jsonb, text) from public;
revoke all on function public.tellijst_publiek_overzicht(text) from public;
grant execute on function public.tellijst_publiek_opslaan(text, text, text, date, text, jsonb, text) to anon, authenticated;
grant execute on function public.tellijst_publiek_overzicht(text) to anon, authenticated;

comment on table public.tellijst_link is 'Geheim token voor de tellijstpagina zonder inlog (/tellen/<token>). Alleen lezen voor beheerders; anonieme toegang loopt via tellijst_publiek_* functies.';
