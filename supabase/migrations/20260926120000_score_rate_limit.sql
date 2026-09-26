begin;

create table if not exists public.score_rate_limits (
  player_id uuid not null,
  window_name text not null check (window_name in ('minute', 'hour')),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  primary key (player_id, window_name)
);

alter table public.score_rate_limits enable row level security;
revoke all on public.score_rate_limits from public, anon, authenticated;

create or replace function public.consume_score_rate_limit(target_player_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  now_at timestamptz := clock_timestamp();
  minute_count integer;
  hour_count integer;
begin
  insert into public.score_rate_limits as limits
    (player_id, window_name, window_started_at, request_count)
  values (target_player_id, 'minute', now_at, 1)
  on conflict (player_id, window_name) do update set
    window_started_at = case
      when limits.window_started_at <= now_at - interval '1 minute' then now_at
      else limits.window_started_at
    end,
    request_count = case
      when limits.window_started_at <= now_at - interval '1 minute' then 1
      else limits.request_count + 1
    end
  returning request_count into minute_count;

  insert into public.score_rate_limits as limits
    (player_id, window_name, window_started_at, request_count)
  values (target_player_id, 'hour', now_at, 1)
  on conflict (player_id, window_name) do update set
    window_started_at = case
      when limits.window_started_at <= now_at - interval '1 hour' then now_at
      else limits.window_started_at
    end,
    request_count = case
      when limits.window_started_at <= now_at - interval '1 hour' then 1
      else limits.request_count + 1
    end
  returning request_count into hour_count;

  return minute_count <= 3 and hour_count <= 30;
end;
$$;

revoke all on function public.consume_score_rate_limit(uuid) from public, anon, authenticated;
grant execute on function public.consume_score_rate_limit(uuid) to service_role;

commit;
