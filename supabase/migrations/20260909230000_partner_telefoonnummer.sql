alter table public.partners
  add column if not exists telefoon text;

comment on column public.partners.telefoon is
  'Contacttelefoonnummer van de partner, vrij formaat zodat internationale nummers behouden blijven.';
