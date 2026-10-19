-- À appliquer uniquement au projet Supabase dédié à Fiche terrain.
-- Aucun enregistrement de fiche, de chantier ou de fichier PNG.
begin;
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  entreprise text not null check (char_length(btrim(entreprise)) between 1 and 30),
  equipe text not null check (char_length(btrim(equipe)) between 1 and 25)
);
alter table public.profiles enable row level security;
revoke all on public.profiles from public, anon, authenticated;
grant usage on schema public to authenticated;
grant select, insert, update on public.profiles to authenticated;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated
using ((select auth.uid()) = id);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles for insert to authenticated
with check ((select auth.uid()) = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);
-- Fonction d’événement éventuellement créée par l’option Supabase RLS automatique.
-- Réserver son exécution aux rôles administratifs.
do $$ begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end $$;
commit;
