-- Eén login (e-mailadres) kan meerdere partners beheren.
-- De portal ondersteunde al meerdere partnerrijen met dezelfde user_id
-- (RLS werkt met "partner_id in (select id from partners where user_id = auth.uid())").
-- Dit regelt de kassa-kant: kassatoegang meegeven aan een gedeelde login en
-- de Omzet-tab laten tonen voor de gekozen partner i.p.v. een willekeurige.

-- 1. Kassatoegang volgt partners.user_id: als een gekoppelde partner een login
--    krijgt (of de login wordt gedeeld), komt die login ook in merchant_users.
create or replace function public.partner_login_naar_kassa()
returns trigger language plpgsql security definer
set search_path = public, festival_pos as $$
begin
  if new.user_id is not null and new.user_id is distinct from old.user_id then
    insert into festival_pos.merchant_users (user_id, merchant_id, role)
    select new.user_id, m.id, 'partner_admin'
    from festival_pos.merchants m where m.partner_id = new.id
    on conflict do nothing;
  end if;
  return new;
end $$;

drop trigger if exists partner_login_naar_kassa on public.partners;
create trigger partner_login_naar_kassa
  after update of user_id on public.partners
  for each row execute function public.partner_login_naar_kassa();

-- 2. Kassa-merchant van een partner, alleen voor de eigen login (of admin).
create or replace function public.partner_merchant_id(p_partner_id uuid)
returns uuid language sql stable security definer
set search_path = public, festival_pos as $$
  select m.id from festival_pos.merchants m
  join public.partners p on p.id = m.partner_id
  where p.id = p_partner_id and (p.user_id = auth.uid() or public.is_admin())
  limit 1
$$;
grant execute on function public.partner_merchant_id(uuid) to authenticated;

-- 3. Partner met meerdere merchants mag een eigen merchant kiezen.
create or replace function festival_pos.effective_merchant_scope(p_merchant_id uuid)
returns uuid language plpgsql stable security definer
set search_path = festival_pos, public as $$
declare m uuid;
begin
  if festival_pos.is_platform_admin() then
    return p_merchant_id;
  end if;
  if festival_pos.is_org_admin() then
    if p_merchant_id is not null
       and not exists (select 1 from festival_pos.merchants
                       where id = p_merchant_id
                         and organization_id = festival_pos.current_org_id()) then
      raise exception 'not authorized';
    end if;
    return p_merchant_id;
  end if;
  if p_merchant_id is not null then
    if exists (select 1 from festival_pos.merchant_users mu
               join festival_pos.merchants mm on mm.id = mu.merchant_id
               where mu.user_id = auth.uid() and mu.merchant_id = p_merchant_id and mm.active) then
      return p_merchant_id;
    end if;
    raise exception 'not authorized';
  end if;
  m := festival_pos.current_merchant_id();
  if m is null then raise exception 'not authorized'; end if;
  return m;
end $$;

-- 4. merchant_users had user_id als primary key: één login kon maar aan één
--    kassa-merchant hangen. Verbreed naar (user_id, merchant_id).
alter table festival_pos.merchant_users drop constraint merchant_users_pkey;
alter table festival_pos.merchant_users add primary key (user_id, merchant_id);

-- admin_link_partner_user (POS-admin) behoudt zijn gedrag: login verplaatsen.
create or replace function festival_pos.admin_link_partner_user(p_user_id uuid, p_merchant_id uuid, p_role text default 'partner_admin')
returns void language plpgsql security definer
set search_path = festival_pos, public as $$
begin
  if not festival_pos.is_super_admin() then raise exception 'not authorized'; end if;
  delete from festival_pos.merchant_users where user_id = p_user_id and merchant_id <> p_merchant_id;
  insert into festival_pos.merchant_users (user_id, merchant_id, role)
  values (p_user_id, p_merchant_id, p_role)
  on conflict (user_id, merchant_id) do update set role = excluded.role;
end $$;
