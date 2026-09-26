-- Execute after all score migrations, inside a transaction that is rolled back.
do $$
declare
  player uuid := 'a6599077-7a44-42a1-960f-bb50f47fb720';
  request_number integer;
begin
  for request_number in 1..5 loop
    if not public.consume_score_rate_limit(player) then
      raise exception 'request % denied', request_number;
    end if;
  end loop;
  if public.consume_score_rate_limit(player) then raise exception 'request 6 allowed'; end if;

  update public.score_rate_limits
  set window_started_at = clock_timestamp() - interval '2 minutes', request_count = 5
  where player_id = player and window_name = 'minute';
  if not public.consume_score_rate_limit(player) then raise exception 'new minute denied'; end if;

  update public.score_rate_limits
  set request_count = 60
  where player_id = player and window_name = 'hour';
  update public.score_rate_limits
  set window_started_at = clock_timestamp() - interval '2 minutes'
  where player_id = player and window_name = 'minute';
  if public.consume_score_rate_limit(player) then raise exception 'hour request 61 allowed'; end if;
end $$;

set local role authenticated;
do $$ begin
  if has_table_privilege(current_user, 'public.score_rate_limits', 'SELECT')
    or has_function_privilege(current_user, 'public.consume_score_rate_limit(uuid)', 'EXECUTE') then
    raise exception 'rate limiter is exposed to authenticated clients';
  end if;
end $$;
reset role;
