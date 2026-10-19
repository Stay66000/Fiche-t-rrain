-- Test transactionnel : utilisateurs synthétiques supprimés par ROLLBACK.
-- À exécuter avec le rôle postgres dans le projet Fiche terrain uniquement.
begin;
create temporary table fiche_test_users (kind text, id uuid) on commit drop;
insert into fiche_test_users values ('owner',gen_random_uuid()),('other',gen_random_uuid()),('third',gen_random_uuid());
insert into auth.users (id, email, aud, role)
select id, 'fiche-test-' || id || '@example.invalid', 'authenticated', 'authenticated' from fiche_test_users;
insert into public.profiles(id,entreprise,equipe)
select id,'Autre entreprise','Autre équipe' from fiche_test_users where kind='other';
select set_config('request.jwt.claims',json_build_object('sub',(select id from fiche_test_users where kind='owner'),'role','authenticated')::text,true);
select set_config('fiche_test.other',(select id::text from fiche_test_users where kind='other'),true);
select set_config('fiche_test.third',(select id::text from fiche_test_users where kind='third'),true);
set local role authenticated;
do $$
declare n integer;
begin
  if (select count(*) from public.profiles) <> 0 then raise exception 'RLS failure: another profile is visible'; end if;
  insert into public.profiles(id,entreprise,equipe) values(auth.uid(),'Entreprise test','Équipe test');
  update public.profiles set equipe='Équipe modifiée' where id=auth.uid();
  if (select equipe from public.profiles where id=auth.uid()) <> 'Équipe modifiée' then raise exception 'Cannot update own profile'; end if;
  if (select count(*) from public.profiles) <> 1 then raise exception 'RLS failure: invalid visible row count'; end if;
  update public.profiles set equipe='Intrusion' where id=current_setting('fiche_test.other')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'RLS failure: updated another profile'; end if;
  begin
    insert into public.profiles(id,entreprise,equipe) values(current_setting('fiche_test.third')::uuid,'Intrusion','Intrusion');
    raise exception 'RLS failure: inserted a profile for another user';
  exception when insufficient_privilege then null; end;
  begin
    update public.profiles set id=current_setting('fiche_test.third')::uuid where id=auth.uid();
    raise exception 'RLS failure: reassigned own profile to another user';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.profiles where id=auth.uid();
    raise exception 'Grant failure: delete was allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$
begin
  begin
    perform 1 from public.profiles;
    raise exception 'Grant failure: anonymous read allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.profiles(id,entreprise,equipe) values(gen_random_uuid(),'Intrusion','Intrusion');
    raise exception 'Grant failure: anonymous insert allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.profiles set entreprise='Intrusion';
    raise exception 'Grant failure: anonymous update allowed';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.profiles;
    raise exception 'Grant failure: anonymous delete allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'OK: own profile read/write allowed; cross-user access, anonymous access and reassignment denied; test data rolled back' as verification;
