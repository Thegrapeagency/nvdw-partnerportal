-- Opslag voor de locatieplattegrond (PDF wordt in de browser omgezet naar JPG).
-- Let op: Supabase leest na een upload het object terug, dus zonder
-- select-policy faalt elke upload met een RLS-fout.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('plattegronden','plattegronden', true, 52428800, array['image/png','image/jpeg','image/webp','application/pdf'])
on conflict (id) do nothing;
create policy plattegronden_upload on storage.objects for insert to authenticated with check (bucket_id = 'plattegronden' and public.mag('programma'));
create policy plattegronden_wijzig on storage.objects for update to authenticated using (bucket_id = 'plattegronden' and public.mag('programma'));
create policy plattegronden_wis on storage.objects for delete to authenticated using (bucket_id = 'plattegronden' and public.mag('programma'));
create policy plattegronden_lezen on storage.objects for select to authenticated using (bucket_id = 'plattegronden' and public.mag_lezen('programma'));
