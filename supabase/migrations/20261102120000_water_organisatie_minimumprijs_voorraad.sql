-- Water is van de organisatie, minimumprijzen dicht, watervoorraad per bar.
--
-- 1. Producten met org_revenue (het Sea Water plat/bruis) zijn omzet van de
--    organisatie. Partners slaan ze aan in de kassa, maar zien ze niet terug in
--    hun omzet, uitbetaling of verkoopregels, en kunnen ze niet wijzigen.
-- 2. Partners wijzigen producten en prijzen alleen nog via de wijnlijst of
--    menukaart in de partnerportal. Daar geldt de minimumprijs altijd. In het
--    kassabeheer mogen ze alleen nog aan/uit zetten, sorteren en voorraad bijhouden.
-- 3. Watervoorraad per bar: de organisatie zet een standaardvoorraad neer, de
--    kassa telt af, onder de drempel komt er een melding in de cockpit (Hulp)
--    met een pushbericht. Bijleveren kan alleen tot wat er verkocht is.

-- ---------------------------------------------------------------------------
-- Kolommen
-- ---------------------------------------------------------------------------
alter table festival_pos.products
  add column if not exists org_revenue boolean not null default false,
  add column if not exists stock_target numeric,
  add column if not exists low_stock_alerted_at timestamptz;
comment on column festival_pos.products.org_revenue is
  'Omzet is voor de organisatie (water). Partner verkoopt, maar ziet het niet in omzet of uitbetaling en kan het niet wijzigen.';
comment on column festival_pos.products.stock_target is
  'Standaardvoorraad die de organisatie bij de bar neerzet. Bijleveren kan tot dit niveau.';

alter table festival_pos.order_items
  add column if not exists org_revenue boolean not null default false;
alter table festival_pos.orders
  add column if not exists org_cents integer not null default 0;
comment on column festival_pos.orders.org_cents is
  'Deel van total_cents dat omzet van de organisatie is (water). Partneromzet = total_cents - org_cents.';

alter table festival_pos.help_requests
  add column if not exists water_product_id uuid references festival_pos.products(id) on delete set null,
  add column if not exists push_sent_at timestamptz;

-- ---------------------------------------------------------------------------
-- Verkoopregels krijgen bij het aanslaan vast of ze van de organisatie zijn
-- ---------------------------------------------------------------------------
create or replace function festival_pos.tg_order_item_org()
returns trigger language plpgsql security definer
set search_path = festival_pos, public as $$
declare v boolean;
begin
  v := false;
  if new.product_id is not null then
    select p.org_revenue into v from festival_pos.products p where p.id = new.product_id;
  end if;
  new.org_revenue := coalesce(v, false);
  return new;
end $$;

drop trigger if exists order_item_org on festival_pos.order_items;
create trigger order_item_org before insert on festival_pos.order_items
  for each row execute function festival_pos.tg_order_item_org();

create or replace function festival_pos.tg_order_item_org_cents()
returns trigger language plpgsql security definer
set search_path = festival_pos, public as $$
begin
  if new.org_revenue then
    update festival_pos.orders set org_cents = org_cents + new.unit_price_cents * new.qty
     where id = new.order_id;
  end if;
  return null;
end $$;

drop trigger if exists order_item_org_cents on festival_pos.order_items;
create trigger order_item_org_cents after insert on festival_pos.order_items
  for each row execute function festival_pos.tg_order_item_org_cents();

-- Water markeren en bestaande verkopen bijwerken
update festival_pos.products set org_revenue = true
 where lower(name) in ('sea water plat', 'sea water bruis') and not org_revenue;

update festival_pos.order_items oi set org_revenue = true
  from festival_pos.products p
 where p.id = oi.product_id and p.org_revenue and not oi.org_revenue;

update festival_pos.orders o set org_cents = s.c
  from (select order_id, sum(unit_price_cents * qty)::integer as c
          from festival_pos.order_items where org_revenue group by order_id) s
 where s.order_id = o.id and o.org_cents is distinct from s.c;

-- Partners zien de waterregels niet in hun verkoopregels
drop policy if exists partner_select_order_items on festival_pos.order_items;
create policy partner_select_order_items on festival_pos.order_items for select
  using (not order_items.org_revenue and exists (
    select 1 from festival_pos.orders o
     where o.id = order_items.order_id and o.merchant_id = festival_pos.current_merchant_id()));

-- ---------------------------------------------------------------------------
-- Wie mag wat zien
-- ---------------------------------------------------------------------------
-- Organisatie (admin) en de server zien alles, partners niet het water.
create or replace function festival_pos.caller_sees_org_revenue()
returns boolean language sql stable security definer
set search_path = festival_pos, public as $$
  select auth.uid() is null or festival_pos.is_admin()
$$;

-- Een partner-caller: ingelogd en geen admin van de organisatie.
create or replace function festival_pos.is_partner_caller()
returns boolean language sql stable security definer
set search_path = festival_pos, public as $$
  select auth.uid() is not null and not festival_pos.is_admin()
$$;

-- Orders zoals de caller ze mag zien: zonder het waterdeel, en bonnen met
-- alleen water vallen weg. Alleen voor gebruik binnen de rapportagefuncties.
create or replace function festival_pos.orders_visible(p_hide boolean)
returns setof festival_pos.orders language sql stable
set search_path = festival_pos, public as $$
  select o.id, o.local_id, o.idempotency_key, o.bar_id, o.device_id, o.staff_id, o.shift_id,
         o.status, o.method,
         case when p_hide then o.subtotal_cents - o.org_cents else o.subtotal_cents end,
         case when p_hide then o.total_cents - o.org_cents else o.total_cents end,
         o.created_at, o.synced_at, o.merchant_id, o.event_id, o.organization_id, o.is_test,
         case when p_hide then 0 else o.org_cents end
    from festival_pos.orders o
   where not p_hide or o.org_cents = 0 or o.total_cents > o.org_cents
$$;

create or replace function festival_pos.refunds_visible(p_hide boolean)
returns setof festival_pos.refunds language sql stable
set search_path = festival_pos, public as $$
  select r.id, r.payment_id, r.order_id,
         case when p_hide then greatest(0, r.amount_cents - coalesce(o.org_cents, 0)) else r.amount_cents end,
         r.reason, r.staff_id, r.provider_ref, r.status, r.created_at, r.device_id, r.bar_id
    from festival_pos.refunds r
    left join festival_pos.orders o on o.id = r.order_id
   where not p_hide or r.amount_cents > coalesce(o.org_cents, 0)
$$;

revoke all on function festival_pos.orders_visible(boolean) from public, anon, authenticated;
revoke all on function festival_pos.refunds_visible(boolean) from public, anon, authenticated;

-- De drie rapportages die partners zelf opvragen (Omzet-tab, kassabeheer):
-- orders en refunds lezen via de *_visible-varianten, waterregels eruit.
do $$
declare f text; d text;
begin
  foreach f in array array['merchant_sales_summary', 'merchant_sales_timeseries', 'merchant_day_report'] loop
    select pg_get_functiondef(p.oid) into d
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'festival_pos' and p.proname = f;
    if d is null then raise exception 'functie % niet gevonden', f; end if;
    if position('orders_visible' in d) > 0 then continue; end if;
    d := replace(d, 'festival_pos.orders ', 'festival_pos.orders_visible(v_hide) ');
    d := replace(d, E'festival_pos.orders\n', E'festival_pos.orders_visible(v_hide)\n');
    d := replace(d, 'festival_pos.refunds ', 'festival_pos.refunds_visible(v_hide) ');
    d := replace(d, 'from festival_pos.order_items oi join paid p on p.id = oi.order_id',
                    'from festival_pos.order_items oi join paid p on p.id = oi.order_id where not (v_hide and oi.org_revenue)');
    d := regexp_replace(d, E'\\ndeclare\\s', E'\ndeclare v_hide boolean := not festival_pos.caller_sees_org_revenue();\n  ');
    if position('v_hide boolean' in d) = 0 then raise exception 'declare niet gevonden in %', f; end if;
    execute d;
  end loop;
end $$;

-- Uitbetaling: water telt niet als partneromzet, wel apart zichtbaar voor de organisatie.
create or replace function festival_pos.partner_settlement(p_org_id uuid default null, p_event_id uuid default null)
returns json language plpgsql security definer
set search_path = festival_pos, public as $$
declare result json; v_org uuid; v_ev uuid;
begin
  if not festival_pos.is_super_admin() then
    return json_build_object('ok', false, 'error', 'alleen_admin');
  end if;
  v_org := festival_pos.reporting_org(p_org_id);
  v_ev  := festival_pos.reporting_event(p_event_id, v_org);
  select coalesce(json_agg(row_to_json(t) order by t.omzet_cents desc), '[]'::json) into result
  from (
    select m.id as merchant_id, m.name as merchant, m.partner_id,
      coalesce(nullif(p.bedrijfsnaam, ''), p.naam) as partner_naam,
      coalesce(em.afdracht_percentage, p.afdracht_percentage, 0) as afdracht_percentage,
      coalesce(sum(o.total_cents - o.org_cents) filter (where o.status = 'paid'), 0)::bigint as omzet_cents,
      coalesce(sum(o.total_cents - o.org_cents) filter (where o.status = 'refunded'), 0)::bigint as refunded_cents,
      count(o.id) filter (where o.status = 'paid' and o.total_cents > o.org_cents) as order_count,
      coalesce(sum(o.org_cents) filter (where o.status = 'paid'), 0)::bigint as water_cents,
      coalesce(sum(o.org_cents) filter (where o.status = 'refunded'), 0)::bigint as water_refunded_cents
    from festival_pos.merchants m
    join public.partners p on p.id = m.partner_id
    left join festival_pos.event_merchants em
      on em.merchant_id = m.id and (v_ev is not null and em.event_id = v_ev)
    left join festival_pos.orders o on o.merchant_id = m.id and o.status in ('paid', 'refunded')
      and (v_ev is null or o.event_id = v_ev)
    where m.partner_id is not null
      and (v_org is null or m.organization_id = v_org)
      and (v_ev is null or em.event_id is not null)
    group by m.id, m.name, m.partner_id, p.bedrijfsnaam, p.naam, p.afdracht_percentage, em.afdracht_percentage
  ) t;
  return json_build_object('ok', true, 'event_id', v_ev, 'partners', result);
end $$;

-- NvdW-omzet: water telt voor 100% voor NvdW, ook bij partnerbars.
create or replace function festival_pos.horeca_omzet_nvdw(p_org_id uuid default null, p_event_id uuid default null)
returns json language plpgsql security definer
set search_path = festival_pos, public as $$
declare result json; v_org uuid; v_ev uuid;
begin
  if not festival_pos.is_super_admin() then
    return json_build_object('ok', false, 'error', 'alleen_admin');
  end if;
  if not public.mag('financieel') then
    return json_build_object('ok', false, 'error', 'geen_recht_financieel');
  end if;
  v_org := festival_pos.reporting_org(p_org_id);
  v_ev  := festival_pos.reporting_event(p_event_id, v_org);

  with rel as (
    -- Terugbetaalde orders tellen negatief, zodat alles hieronder netto is.
    select o.id, o.merchant_id, o.total_cents,
           case when o.status = 'paid' then 1 else -1 end as teken
      from festival_pos.orders o
      join festival_pos.merchants m on m.id = o.merchant_id
     where o.status in ('paid', 'refunded')
       and (v_ev is null or o.event_id = v_ev)
       and (v_org is null or m.organization_id = v_org)
  ),
  regels as (
    select r.merchant_id,
           coalesce(sum(r.teken * round(i.qty * i.unit_price_cents / (1 + i.vat_rate / 100.0))) filter (where not i.org_revenue), 0)::bigint as ex_cents,
           coalesce(sum(r.teken * round(i.qty * i.unit_price_cents / (1 + i.vat_rate / 100.0))) filter (where i.org_revenue), 0)::bigint as water_ex_cents,
           coalesce(sum(r.teken * i.qty * i.unit_price_cents) filter (where i.org_revenue), 0)::bigint as water_bruto_cents,
           sum(r.teken * i.qty * i.unit_price_cents)::bigint as bruto_cents
      from rel r
      join festival_pos.order_items i on i.order_id = r.id
     group by r.merchant_id
  ),
  bruto as (
    select r.merchant_id,
           sum(r.teken * r.total_cents)::bigint as netto_bruto_cents,
           count(*) filter (where r.teken = 1) as order_count
      from rel r group by r.merchant_id
  ),
  per_merchant as (
    select m.id as merchant_id,
           m.name as merchant,
           (m.partner_id is null) as eigen_bar,
           coalesce(nullif(p.bedrijfsnaam, ''), p.naam) as partner_naam,
           case when m.partner_id is null then 100
                else coalesce(em.afdracht_percentage, p.afdracht_percentage, 0) end as nvdw_pct,
           coalesce(b.netto_bruto_cents, 0)::bigint as netto_bruto_cents,
           coalesce(g.ex_cents, 0)::bigint as netto_ex_btw_cents,
           coalesce(g.water_ex_cents, 0)::bigint as water_ex_btw_cents,
           coalesce(g.water_bruto_cents, 0)::bigint as water_bruto_cents,
           (coalesce(b.netto_bruto_cents, 0) - coalesce(g.bruto_cents, 0))::bigint as zonder_regels_cents,
           coalesce(b.order_count, 0) as order_count
      from festival_pos.merchants m
      left join public.partners p on p.id = m.partner_id
      left join festival_pos.event_merchants em
        on em.merchant_id = m.id and (v_ev is not null and em.event_id = v_ev)
      left join bruto b on b.merchant_id = m.id
      left join regels g on g.merchant_id = m.id
     where (v_org is null or m.organization_id = v_org)
  )
  select coalesce(json_agg(row_to_json(t) order by t.netto_bruto_cents desc), '[]'::json)
    into result
  from (
    select pm.*,
           (round(pm.netto_ex_btw_cents * pm.nvdw_pct / 100.0) + pm.water_ex_btw_cents)::bigint as nvdw_ex_btw_cents
      from per_merchant pm
     where pm.netto_bruto_cents <> 0 or pm.netto_ex_btw_cents <> 0 or pm.water_ex_btw_cents <> 0
  ) t;

  return json_build_object(
    'ok', true,
    'event_id', v_ev,
    'bars', result,
    'nvdw_ex_btw_cents', (select coalesce(sum((x->>'nvdw_ex_btw_cents')::bigint), 0) from json_array_elements(result) x),
    'water_ex_btw_cents', (select coalesce(sum((x->>'water_ex_btw_cents')::bigint), 0) from json_array_elements(result) x),
    'bruto_cents', (select coalesce(sum((x->>'netto_bruto_cents')::bigint), 0) from json_array_elements(result) x),
    'zonder_regels_cents', (select coalesce(sum((x->>'zonder_regels_cents')::bigint), 0) from json_array_elements(result) x)
  );
end $$;

-- ---------------------------------------------------------------------------
-- Partners wijzigen producten alleen via de portal; water helemaal niet
-- ---------------------------------------------------------------------------
-- pg_trigger_depth() = 1: de partner past de kassatabel rechtstreeks aan
-- (kassabeheer of API). Dieper: het komt uit de wijnlijst/menukaart-sync van
-- de portal, waar de minimumprijs al wordt gecontroleerd.
create or replace function festival_pos.tg_products_guard()
returns trigger language plpgsql security definer
set search_path = festival_pos, public as $$
declare
  v_partner boolean := festival_pos.is_partner_caller();
  v_naam_bezet boolean;
begin
  if tg_op in ('INSERT', 'UPDATE') then
    select exists (
      select 1 from festival_pos.products x
       where x.org_revenue and x.id <> new.id
         and x.event_id is not distinct from new.event_id
         and lower(x.name) = lower(new.name)) into v_naam_bezet;
    if v_naam_bezet and not new.org_revenue then
      if v_partner then
        raise exception 'De naam "%" is gereserveerd voor het water van de organisatie. Kies een andere naam.', new.name
          using errcode = 'P0001';
      end if;
      new.org_revenue := true;
    end if;
  end if;

  if not v_partner then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if (tg_op <> 'INSERT' and old.org_revenue) or (tg_op <> 'DELETE' and new.org_revenue) then
    raise exception 'Water is van de organisatie. Dit product kun je niet aanpassen.' using errcode = 'P0001';
  end if;

  if pg_trigger_depth() = 1 then
    if tg_op = 'INSERT' then
      raise exception 'Nieuwe producten zet je in je wijnlijst of menukaart in de partnerportal. Daar geldt ook de minimumprijs.'
        using errcode = 'P0001';
    elsif tg_op = 'DELETE' then
      raise exception 'Producten haal je weg in je wijnlijst of menukaart in de partnerportal.' using errcode = 'P0001';
    elsif new.name is distinct from old.name or new.price_cents is distinct from old.price_cents
       or new.category_id is distinct from old.category_id or new.vat_rate is distinct from old.vat_rate
       or new.merchant_id is distinct from old.merchant_id or new.event_id is distinct from old.event_id
       or new.source is distinct from old.source or new.source_id is distinct from old.source_id
       or new.org_revenue is distinct from old.org_revenue or new.stock_target is distinct from old.stock_target then
      raise exception 'Naam en prijs pas je aan in je wijnlijst of menukaart in de partnerportal. Daar geldt ook de minimumprijs.'
        using errcode = 'P0001';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

drop trigger if exists products_guard on festival_pos.products;
create trigger products_guard before insert or update or delete on festival_pos.products
  for each row execute function festival_pos.tg_products_guard();

create or replace function festival_pos.tg_variants_guard()
returns trigger language plpgsql security definer
set search_path = festival_pos, public as $$
declare v_org boolean;
begin
  if not festival_pos.is_partner_caller() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  select p.org_revenue into v_org from festival_pos.products p
   where p.id = case when tg_op = 'DELETE' then old.product_id else new.product_id end;
  if coalesce(v_org, false) then
    raise exception 'Water is van de organisatie. Dit product kun je niet aanpassen.' using errcode = 'P0001';
  end if;
  if pg_trigger_depth() = 1 then
    if tg_op <> 'UPDATE' or new.label is distinct from old.label or new.price_cents is distinct from old.price_cents
       or new.product_id is distinct from old.product_id then
      raise exception 'Prijzen pas je aan in je wijnlijst in de partnerportal. Daar geldt ook de minimumprijs.'
        using errcode = 'P0001';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

drop trigger if exists variants_guard on festival_pos.product_variants;
create trigger variants_guard before insert or update or delete on festival_pos.product_variants
  for each row execute function festival_pos.tg_variants_guard();

-- Minimumprijs bij varianten: ook controleren als alleen de naam wijzigt
-- (anders kon "Proefglas" van 2 euro hernoemd worden naar "Fles"), en bij
-- wijn alleen Half glas, Heel glas of Fles toestaan.
create or replace function festival_pos.tg_variant_floor()
returns trigger language plpgsql security definer
set search_path = festival_pos, public as $$
declare v_house boolean; v_event uuid; v_wijn boolean;
begin
  if tg_op = 'UPDATE' and new.price_cents is not distinct from old.price_cents
     and new.label is not distinct from old.label then return new; end if;
  select p.event_id, em.is_house,
         (p.source = 'wijnlijst' or lower(coalesce(c.name, '')) = 'wijn')
    into v_event, v_house, v_wijn
    from festival_pos.products p
    left join festival_pos.event_merchants em
      on em.event_id = p.event_id and em.merchant_id = p.merchant_id
    left join festival_pos.categories c on c.id = p.category_id
   where p.id = new.product_id;
  if v_event is null or coalesce(v_house, false) then return new; end if;
  if coalesce(v_wijn, false) and festival_pos.floor_key_for_label(new.label) is null then
    raise exception 'Gebruik bij wijn Half glas, Heel glas of Fles, dan geldt de minimumprijs.' using errcode = 'P0001';
  end if;
  perform festival_pos.assert_floor(v_event, festival_pos.floor_key_for_label(new.label), new.price_cents);
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Watervoorraad
-- ---------------------------------------------------------------------------
create table if not exists festival_pos.water_leveringen (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references festival_pos.events(id),
  organization_id uuid not null,
  merchant_id uuid not null references festival_pos.merchants(id) on delete cascade,
  product_id uuid not null references festival_pos.products(id) on delete cascade,
  soort text not null check (soort in ('start', 'bijgeleverd', 'correctie')),
  aantal numeric not null,
  voorraad_na numeric not null,
  toelichting text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index if not exists water_leveringen_product_idx on festival_pos.water_leveringen (product_id, created_at desc);
alter table festival_pos.water_leveringen enable row level security;
drop policy if exists admin_select_water_leveringen on festival_pos.water_leveringen;
create policy admin_select_water_leveringen on festival_pos.water_leveringen for select
  using (festival_pos.admin_can(organization_id));

-- Onder de drempel: melding in de cockpit (Hulp) en een pushbericht.
-- Weer boven de drempel (na bijleveren): de volgende keer komt er opnieuw een seintje.
create or replace function festival_pos.tg_water_alert()
returns trigger language plpgsql security definer
set search_path = festival_pos, public as $$
declare v_drempel numeric; v_bij numeric;
begin
  if not new.org_revenue or not new.track_stock or new.event_id is null then return new; end if;
  v_drempel := coalesce(new.low_stock_threshold, 0);
  if new.stock_qty > v_drempel then
    new.low_stock_alerted_at := null;
    return new;
  end if;
  if new.low_stock_alerted_at is not null then return new; end if;
  if tg_op = 'UPDATE' and new.stock_qty is not distinct from old.stock_qty
     and new.low_stock_threshold is not distinct from old.low_stock_threshold
     and new.track_stock = old.track_stock then return new; end if;

  v_bij := greatest(0, coalesce(new.stock_target, new.stock_initial, 0) - new.stock_qty);
  insert into festival_pos.help_requests (event_id, organization_id, merchant_id, kind, message, water_product_id)
  values (new.event_id, new.organization_id, new.merchant_id, 'voorraad',
          format('%s bijna op: volgens de kassa nog %s over. Bijleveren: %s (zoveel zijn er verkocht).',
                 new.name, trim(to_char(new.stock_qty, 'FM999990')), trim(to_char(v_bij, 'FM999990'))),
          new.id);
  new.low_stock_alerted_at := now();

  -- Pushbericht naar de cockpit-app. Gaat pas na de commit de deur uit.
  begin
    perform net.http_post(
      url := 'https://snfojphxsbzfewwfbfka.supabase.co/functions/v1/water-push',
      body := '{}'::jsonb,
      headers := '{"Content-Type": "application/json"}'::jsonb);
  exception when others then
    null; -- de melding staat in de cockpit, push is extra
  end;
  return new;
end $$;

drop trigger if exists water_alert on festival_pos.products;
create trigger water_alert before update on festival_pos.products
  for each row execute function festival_pos.tg_water_alert();

-- Het festival waar het water bij hoort. Platformbeheerders hebben geen eigen
-- organisatie; dan pakken we het actieve festival met waterproducten.
create or replace function festival_pos.water_event(p_event_id uuid)
returns uuid language plpgsql stable security definer
set search_path = festival_pos, public as $$
declare v uuid;
begin
  v := festival_pos.reporting_event(p_event_id, festival_pos.reporting_org(null));
  if v is null then
    select e.id into v from festival_pos.events e
     where e.active and exists (select 1 from festival_pos.products p where p.event_id = e.id and p.org_revenue)
     order by e.created_at desc limit 1;
  end if;
  return v;
end $$;

-- Overzicht voor de organisatie: per bar per watersoort.
create or replace function festival_pos.water_overzicht(p_event_id uuid default null)
returns json language plpgsql stable security definer
set search_path = festival_pos, public as $$
declare v_ev uuid;
begin
  if not festival_pos.is_admin() then raise exception 'not authorized'; end if;
  v_ev := festival_pos.water_event(p_event_id);
  return json_build_object('event_id', v_ev, 'rijen', coalesce((
    select json_agg(x order by x.is_house desc, x.merchant, x.product) from (
      select p.id as product_id, p.name as product, m.id as merchant_id, m.name as merchant,
             coalesce(em.is_house, false) as is_house, p.active, p.track_stock,
             p.stock_target as standaard, p.stock_initial as geleverd, p.stock_qty as rest,
             p.low_stock_threshold as drempel,
             greatest(0, coalesce(p.stock_target, 0) - p.stock_qty) as bij_te_leveren,
             coalesce((select sum(oi.qty) from festival_pos.order_items oi
                         join festival_pos.orders o on o.id = oi.order_id
                        where oi.product_id = p.id and o.status = 'paid'), 0) as verkocht,
             coalesce((select sum(oi.qty * oi.unit_price_cents) from festival_pos.order_items oi
                         join festival_pos.orders o on o.id = oi.order_id
                        where oi.product_id = p.id and o.status = 'paid'), 0) as omzet_cents,
             (select max(w.created_at) from festival_pos.water_leveringen w where w.product_id = p.id) as laatste_levering,
             exists (select 1 from festival_pos.help_requests h
                      where h.water_product_id = p.id and h.handled_at is null) as open_melding,
             case when not p.track_stock then 'niet_ingesteld'
                  when p.stock_qty <= 0 then 'op'
                  when p.stock_qty <= coalesce(p.low_stock_threshold, 0) then 'bijleveren'
                  else 'ok' end as status
        from festival_pos.products p
        join festival_pos.merchants m on m.id = p.merchant_id
        left join festival_pos.event_merchants em on em.event_id = p.event_id and em.merchant_id = p.merchant_id
       where p.org_revenue and p.event_id = v_ev and festival_pos.admin_can(p.organization_id)
         and (em.merchant_id is null or em.active)
    ) x), '[]'::json));
end $$;

-- Standaardvoorraad en drempel instellen. De eerste keer staat de voorraad
-- daarmee ook neer (startlevering). Daarna verandert alleen de instelling;
-- de echte voorraad loopt via bijleveren.
create or replace function festival_pos.water_instellen(p_product_id uuid, p_standaard numeric, p_drempel numeric)
returns json language plpgsql security definer
set search_path = festival_pos, public as $$
declare p festival_pos.products%rowtype;
begin
  if not festival_pos.is_admin() then raise exception 'not authorized'; end if;
  if p_standaard is null or p_standaard < 0 or p_drempel is null or p_drempel < 0 then
    raise exception 'Vul een standaardvoorraad en een drempel in van 0 of meer.' using errcode = 'P0001';
  end if;
  if p_drempel >= p_standaard and p_standaard > 0 then
    raise exception 'De drempel moet lager zijn dan de standaardvoorraad.' using errcode = 'P0001';
  end if;
  select * into p from festival_pos.products where id = p_product_id for update;
  if not found or not p.org_revenue then raise exception 'Dit is geen waterproduct van de organisatie.' using errcode = 'P0001'; end if;
  if not festival_pos.admin_can(p.organization_id) then raise exception 'not authorized'; end if;

  if not p.track_stock then
    update festival_pos.products
       set stock_target = p_standaard, low_stock_threshold = p_drempel, low_stock_is_percent = false,
           stock_qty = p_standaard, stock_initial = p_standaard, track_stock = true, low_stock_alerted_at = null
     where id = p.id;
    insert into festival_pos.water_leveringen (event_id, organization_id, merchant_id, product_id, soort, aantal, voorraad_na)
    values (p.event_id, p.organization_id, p.merchant_id, p.id, 'start', p_standaard, p_standaard);
  else
    update festival_pos.products
       set stock_target = p_standaard, low_stock_threshold = p_drempel, low_stock_is_percent = false
     where id = p.id;
  end if;
  return json_build_object('ok', true);
end $$;

-- Hetzelfde voor alle bars tegelijk, per watersoort (bijv. 'Sea Water plat').
create or replace function festival_pos.water_instellen_alle(p_naam text, p_standaard numeric, p_drempel numeric, p_event_id uuid default null)
returns json language plpgsql security definer
set search_path = festival_pos, public as $$
declare v_ev uuid; r record; n integer := 0;
begin
  if not festival_pos.is_admin() then raise exception 'not authorized'; end if;
  v_ev := festival_pos.water_event(p_event_id);
  for r in select p.id from festival_pos.products p
            where p.org_revenue and p.event_id = v_ev and lower(p.name) = lower(p_naam)
              and festival_pos.admin_can(p.organization_id) loop
    perform festival_pos.water_instellen(r.id, p_standaard, p_drempel);
    n := n + 1;
  end loop;
  return json_build_object('ok', true, 'aantal', n);
end $$;

-- Bijleveren: alleen tot wat er volgens de kassa verkocht is.
create or replace function festival_pos.water_bijleveren(p_product_id uuid, p_aantal numeric)
returns json language plpgsql security definer
set search_path = festival_pos, public as $$
declare p festival_pos.products%rowtype; v_max numeric;
begin
  if not festival_pos.is_admin() then raise exception 'not authorized'; end if;
  select * into p from festival_pos.products where id = p_product_id for update;
  if not found or not p.org_revenue then raise exception 'Dit is geen waterproduct van de organisatie.' using errcode = 'P0001'; end if;
  if not festival_pos.admin_can(p.organization_id) then raise exception 'not authorized'; end if;
  if not p.track_stock then raise exception 'Stel eerst de standaardvoorraad in.' using errcode = 'P0001'; end if;
  if p_aantal is null or p_aantal <= 0 then raise exception 'Vul een aantal in.' using errcode = 'P0001'; end if;
  v_max := greatest(0, coalesce(p.stock_target, 0) - p.stock_qty);
  if p_aantal > v_max then
    raise exception 'Volgens de kassa staan er nog % en is de standaard %. Je kunt maximaal % bijleveren, want meer is er niet verkocht.',
      trim(to_char(p.stock_qty, 'FM999990')), trim(to_char(coalesce(p.stock_target, 0), 'FM999990')), trim(to_char(v_max, 'FM999990'))
      using errcode = 'P0001';
  end if;
  update festival_pos.products
     set stock_qty = stock_qty + p_aantal, stock_initial = coalesce(stock_initial, 0) + p_aantal
   where id = p.id;
  insert into festival_pos.water_leveringen (event_id, organization_id, merchant_id, product_id, soort, aantal, voorraad_na)
  values (p.event_id, p.organization_id, p.merchant_id, p.id, 'bijgeleverd', p_aantal, p.stock_qty + p_aantal);
  update festival_pos.help_requests set handled_at = now(), handled_by = auth.uid()
   where water_product_id = p.id and handled_at is null;
  return json_build_object('ok', true, 'rest', p.stock_qty + p_aantal);
end $$;

-- Correctie na tellen (breuk, verkeerd neergezet). Met reden, staat in het logboek.
create or replace function festival_pos.water_correctie(p_product_id uuid, p_rest numeric, p_reden text)
returns json language plpgsql security definer
set search_path = festival_pos, public as $$
declare p festival_pos.products%rowtype;
begin
  if not festival_pos.is_admin() then raise exception 'not authorized'; end if;
  if p_rest is null or p_rest < 0 then raise exception 'Vul de getelde voorraad in.' using errcode = 'P0001'; end if;
  if coalesce(trim(p_reden), '') = '' then raise exception 'Vul een reden in.' using errcode = 'P0001'; end if;
  select * into p from festival_pos.products where id = p_product_id for update;
  if not found or not p.org_revenue then raise exception 'Dit is geen waterproduct van de organisatie.' using errcode = 'P0001'; end if;
  if not festival_pos.admin_can(p.organization_id) then raise exception 'not authorized'; end if;
  if not p.track_stock then raise exception 'Stel eerst de standaardvoorraad in.' using errcode = 'P0001'; end if;
  update festival_pos.products set stock_qty = p_rest where id = p.id;
  insert into festival_pos.water_leveringen (event_id, organization_id, merchant_id, product_id, soort, aantal, voorraad_na, toelichting)
  values (p.event_id, p.organization_id, p.merchant_id, p.id, 'correctie', p_rest - p.stock_qty, p_rest, trim(p_reden));
  return json_build_object('ok', true, 'rest', p_rest);
end $$;

revoke all on function festival_pos.water_event(uuid) from public, anon, authenticated;
revoke all on function festival_pos.water_overzicht(uuid) from public, anon;
revoke all on function festival_pos.water_instellen(uuid, numeric, numeric) from public, anon;
revoke all on function festival_pos.water_instellen_alle(text, numeric, numeric, uuid) from public, anon;
revoke all on function festival_pos.water_bijleveren(uuid, numeric) from public, anon;
revoke all on function festival_pos.water_correctie(uuid, numeric, text) from public, anon;
grant execute on function festival_pos.water_overzicht(uuid) to authenticated;
grant execute on function festival_pos.water_instellen(uuid, numeric, numeric) to authenticated;
grant execute on function festival_pos.water_instellen_alle(text, numeric, numeric, uuid) to authenticated;
grant execute on function festival_pos.water_bijleveren(uuid, numeric) to authenticated;
grant execute on function festival_pos.water_correctie(uuid, numeric, text) to authenticated;
