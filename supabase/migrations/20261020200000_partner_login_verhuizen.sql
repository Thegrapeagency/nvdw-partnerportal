-- Verhuist een partner naar een andere login, dan verliest de oude login
-- ook de kassatoegang tot die partner.
create or replace function public.partner_login_naar_kassa()
returns trigger language plpgsql security definer
set search_path = public, festival_pos as $$
begin
  if new.user_id is distinct from old.user_id then
    if old.user_id is not null then
      delete from festival_pos.merchant_users mu
      using festival_pos.merchants m
      where m.partner_id = new.id and mu.merchant_id = m.id and mu.user_id = old.user_id;
    end if;
    if new.user_id is not null then
      insert into festival_pos.merchant_users (user_id, merchant_id, role)
      select new.user_id, m.id, 'partner_admin'
      from festival_pos.merchants m where m.partner_id = new.id
      on conflict do nothing;
    end if;
  end if;
  return new;
end $$;
