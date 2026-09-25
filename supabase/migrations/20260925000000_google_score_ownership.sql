begin;

-- Keep historic scores visible, but never claim them using a browser UUID.
drop policy if exists "insert scores" on public.scores;
drop policy if exists "update own score" on public.scores;

create policy "insert own Google score" on public.scores
for insert to authenticated with check (
  player_id = (select auth.uid())
  and (select auth.jwt() -> 'app_metadata' ->> 'provider') = 'google'
  and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
);
create policy "update own Google score" on public.scores
for update to authenticated using (
  player_id = (select auth.uid())
  and (select auth.jwt() -> 'app_metadata' ->> 'provider') = 'google'
  and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
) with check (
  player_id = (select auth.uid())
  and (select auth.jwt() -> 'app_metadata' ->> 'provider') = 'google'
  and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
);

-- Public leaderboard fields only. Device metadata is no longer public or writable.
revoke all on public.scores from anon, authenticated;
grant select (player_id, track, name, time_cs, speed_kmh) on public.scores to anon, authenticated;
grant insert (player_id, track, name, time_cs, speed_kmh) on public.scores to authenticated;
grant update (player_id, track, name, time_cs, speed_kmh) on public.scores to authenticated;

-- Upserts submit the current run, not another account's browser-local records.
-- Enforce the personal best atomically, including concurrent submissions.
create function public.preserve_score_best() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.time_cs := least(old.time_cs, new.time_cs);
  new.speed_kmh := greatest(old.speed_kmh, new.speed_kmh);
  return new;
end;
$$;
create trigger preserve_score_best before update on public.scores
for each row execute function public.preserve_score_best();

commit;
