-- Execute after all score migrations, inside a transaction that is rolled back.
insert into public.scores (player_id, track, name, time_cs, speed_kmh)
values ('a6599077-7a44-42a1-960f-bb50f47fb711', '__auth_test', 'Other', 6000, 90);

set local role anon;
do $$ begin
  if has_column_privilege(current_user, 'public.scores', 'meta', 'SELECT') then
    raise exception 'anonymous metadata must be private';
  end if;
  if not has_column_privilege(current_user, 'public.scores', 'avatar_url', 'SELECT') then
    raise exception 'anonymous users must be able to read ranking avatars';
  end if;
  if has_any_column_privilege(current_user, 'public.scores', 'INSERT')
    or has_any_column_privilege(current_user, 'public.scores', 'UPDATE') then
    raise exception 'anonymous users must not be able to write scores';
  end if;
end $$;

reset role;

-- La tabla es de solo lectura para clientes. Las escrituras validadas usan la
-- Edge Function submit-score y su credencial de servicio.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a6599077-7a44-42a1-960f-bb50f47fb712","role":"authenticated","app_metadata":{"provider":"google"},"is_anonymous":false}', true);
do $$ begin
  if has_column_privilege(current_user, 'public.scores', 'meta', 'SELECT') then
    raise exception 'authenticated metadata must be private';
  end if;
  if not has_column_privilege(current_user, 'public.scores', 'avatar_url', 'SELECT') then
    raise exception 'authenticated users must be able to read ranking avatars';
  end if;
  if has_any_column_privilege(current_user, 'public.scores', 'INSERT')
    or has_any_column_privilege(current_user, 'public.scores', 'UPDATE') then
    raise exception 'authenticated users must not be able to write scores';
  end if;
  begin
    insert into public.scores (player_id, track, name, time_cs)
    values ('a6599077-7a44-42a1-960f-bb50f47fb712', '__auth_test', 'Self', 7000);
    raise exception 'authenticated insert succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.scores set name = 'Changed'
    where player_id = 'a6599077-7a44-42a1-960f-bb50f47fb711' and track = '__auth_test';
    raise exception 'authenticated update succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
