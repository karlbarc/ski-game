-- Execute after the ownership migration, inside a transaction that is rolled back.
insert into public.scores (player_id, track, name, time_cs, speed_kmh)
values ('a6599077-7a44-42a1-960f-bb50f47fb711', '__auth_test', 'Other', 6000, 90);

set local role anon;
do $$ begin
  if has_column_privilege(current_user, 'public.scores', 'meta', 'SELECT') then
    raise exception 'anonymous metadata must be private';
  end if;
  begin
    insert into public.scores (player_id, track, name, time_cs)
    values ('a6599077-7a44-42a1-960f-bb50f47fb712', '__auth_test', 'Guest', 7000);
    raise exception 'guest insert succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a6599077-7a44-42a1-960f-bb50f47fb712","role":"authenticated","app_metadata":{"provider":"google"},"is_anonymous":false}', true);
do $$ declare changed integer; begin
  if has_column_privilege(current_user, 'public.scores', 'meta', 'SELECT') then
    raise exception 'authenticated metadata must be private';
  end if;
  begin
    insert into public.scores (player_id, track, name, time_cs)
    values ('a6599077-7a44-42a1-960f-bb50f47fb713', '__auth_test', 'Forged', 7000);
    raise exception 'forged owner insert succeeded';
  exception when insufficient_privilege then null;
  end;
  update public.scores set name = 'Hijacked'
  where player_id = 'a6599077-7a44-42a1-960f-bb50f47fb711' and track = '__auth_test';
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'another owner was updated'; end if;

  insert into public.scores (player_id, track, name, time_cs, speed_kmh)
  values ('a6599077-7a44-42a1-960f-bb50f47fb712', '__auth_test', 'Self', 8000, 80)
  on conflict (track, player_id) do update set
    player_id = excluded.player_id, track = excluded.track, name = excluded.name,
    time_cs = excluded.time_cs, speed_kmh = excluded.speed_kmh;
  insert into public.scores (player_id, track, name, time_cs, speed_kmh)
  values ('a6599077-7a44-42a1-960f-bb50f47fb712', '__auth_test', 'Self', 9000, 70)
  on conflict (track, player_id) do update set
    player_id = excluded.player_id, track = excluded.track, name = excluded.name,
    time_cs = excluded.time_cs, speed_kmh = excluded.speed_kmh;
  if not exists(select 1 from public.scores where player_id = 'a6599077-7a44-42a1-960f-bb50f47fb712'
    and track = '__auth_test' and time_cs = 8000 and speed_kmh = 80) then
    raise exception 'best score was overwritten by a worse run';
  end if;
  begin
    update public.scores set player_id = 'a6599077-7a44-42a1-960f-bb50f47fb713'
    where player_id = 'a6599077-7a44-42a1-960f-bb50f47fb712' and track = '__auth_test';
    raise exception 'ownership transfer succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claims', '{"sub":"a6599077-7a44-42a1-960f-bb50f47fb712","role":"authenticated","app_metadata":{"provider":"email"}}', true);
do $$ begin
  begin
    insert into public.scores (player_id, track, name, time_cs)
    values ('a6599077-7a44-42a1-960f-bb50f47fb712', '__email_test', 'Email', 7000);
    raise exception 'non-Google insert succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
