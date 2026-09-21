-- Spiegelbeeld van mijn_rechten(): de alleen-lezen gebieden van de ingelogde
-- admin, zonder dat diegene de hele admins-tabel hoeft te mogen lezen.
create or replace function public.mijn_rechten_lezen()
returns text[]
language sql stable security definer
set search_path to 'public'
as $$
  select rechten_lezen from public.admins
  where lower(email) = lower(auth.jwt() ->> 'email')
    and actief = true
  limit 1;
$$;
