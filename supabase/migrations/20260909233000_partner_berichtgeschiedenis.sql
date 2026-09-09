create table if not exists public.partner_berichten (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  partner_id uuid not null references public.partners(id) on delete cascade,
  ontvanger_email text not null,
  onderwerp text not null,
  bericht text not null,
  status text not null check (status in ('verstuurd', 'mislukt')),
  provider_id text,
  foutmelding text,
  verzonden_door text,
  created_at timestamptz not null default now()
);
create index if not exists partner_berichten_partner_created_idx on public.partner_berichten(partner_id, created_at desc);
create index if not exists partner_berichten_batch_idx on public.partner_berichten(batch_id);
alter table public.partner_berichten enable row level security;
revoke all on public.partner_berichten from anon, authenticated;
comment on table public.partner_berichten is 'Onveranderlijke verzendregistratie van partnerberichten, inclusief mislukte pogingen.';
