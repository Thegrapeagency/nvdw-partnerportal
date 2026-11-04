-- Digitale tellijsten voor de eigen bars (Delta, Wijnbeurs) en de voorraad.
-- Eén rij per telling: welke bar (of voorraad), op welke datum, wie telde en
-- de aantallen per product als jsonb { "Productnaam": aantal }.
-- Zelfde rechten als de rest van het gebied Partners: lezen met mag_lezen(),
-- schrijven met mag().

create table if not exists public.tellijsten (
  id uuid primary key default uuid_generate_v4(),
  soort text not null check (soort in ('bar', 'voorraad')),
  bar text,
  geteld_op date not null default current_date,
  geteld_door text,
  aantallen jsonb not null default '{}'::jsonb,
  opmerking text,
  aangemaakt_door text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tellijsten_soort_bar_datum_idx
  on public.tellijsten (soort, bar, geteld_op desc, created_at desc);

alter table public.tellijsten enable row level security;

create policy "Tellijsten lezen" on public.tellijsten
  for select using (mag_lezen('partners'));
create policy "Tellijsten aanmaken" on public.tellijsten
  for insert with check (mag('partners'));
create policy "Tellijsten bijwerken" on public.tellijsten
  for update using (mag('partners')) with check (mag('partners'));
create policy "Tellijsten verwijderen" on public.tellijsten
  for delete using (mag('partners'));

comment on table public.tellijsten is 'Tellingen van de eigen bars en de voorraad tijdens Nacht van de Wijn. aantallen is een jsonb-object met productnaam als sleutel.';
