-- Migration additive déjà appliquée au projet hébergé.
-- Conserve les fiches hors Supabase : seuls les choix de profil par défaut sont stockés.
alter table public.profiles
  add column if not exists default_moyens_presents jsonb not null default '[]'::jsonb,
  add column if not exists default_moyens_a_prevoir jsonb not null default '[]'::jsonb;

alter table public.profiles
  drop constraint if exists profiles_default_moyens_presents_check,
  add constraint profiles_default_moyens_presents_check check (
    jsonb_typeof(default_moyens_presents) = 'array'
    and jsonb_array_length(default_moyens_presents) <= 6
    and default_moyens_presents <@ '["m0","m1","m2","m3","m4","m5"]'::jsonb
  ),
  drop constraint if exists profiles_default_moyens_a_prevoir_check,
  add constraint profiles_default_moyens_a_prevoir_check check (
    jsonb_typeof(default_moyens_a_prevoir) = 'array'
    and jsonb_array_length(default_moyens_a_prevoir) <= 5
    and default_moyens_a_prevoir <@ '["f0","f1","f2","f3","f4"]'::jsonb
  );
