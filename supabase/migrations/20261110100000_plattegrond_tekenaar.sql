-- Plattegrond-tekenaar: standmaat per partner (foodtruck vult zelf in,
-- bars krijgen de standaardmaat per pakket) + opgeslagen tekeningen.
alter table public.partners
  add column if not exists stand_breedte_m numeric(5,2),
  add column if not exists stand_diepte_m numeric(5,2);

create table if not exists public.plattegrond_standaardmaten (
  pakket text primary key,
  label text not null,
  breedte_m numeric(5,2) not null,
  diepte_m numeric(5,2) not null,
  kleur text not null default '#9b3737'
);
insert into public.plattegrond_standaardmaten values
  ('own_bar','Partnerbar',3,2,'#9b3737'),
  ('branded_bar','Branded bar',4,2.5,'#c9a24b'),
  ('foodtruck','Foodtruck',6,2.5,'#2e6b3a'),
  ('restaurant_host','Restaurant',10,8,'#010341'),
  ('personeel','Personeel',3,3,'#777162')
on conflict (pakket) do nothing;

create table if not exists public.plattegronden (
  id uuid primary key default gen_random_uuid(),
  naam text not null,
  data jsonb not null default '{}'::jsonb,
  bijgewerkt_door text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.plattegrond_standaardmaten enable row level security;
alter table public.plattegronden enable row level security;
create policy pm_lezen on public.plattegrond_standaardmaten for select using (mag_lezen('programma'));
create policy pm_schrijven on public.plattegrond_standaardmaten for all using (mag('programma')) with check (mag('programma'));
create policy pg_lezen on public.plattegronden for select using (mag_lezen('programma'));
create policy pg_schrijven on public.plattegronden for all using (mag('programma')) with check (mag('programma'));
