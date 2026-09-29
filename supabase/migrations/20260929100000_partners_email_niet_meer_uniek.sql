-- Eén login kan meerdere bars/standplaatsen beheren (bijv. Milan zelf met
-- meerdere eigen partners). De koppeling met de auth-login loopt via
-- user_id, dat was al niet uniek en de RLS-policies op wijnlijst,
-- menukaart, crew, etc. filteren al met "partner_id in (select id from
-- partners where user_id = auth.uid())", wat prima met meerdere rijen
-- werkt. Alleen deze unieke-email-constraint blokkeerde het aanmaken van
-- een tweede partnerrij met hetzelfde e-mailadres.
alter table public.partners drop constraint if exists partners_email_key;
