begin;

alter table public.scores drop constraint if exists scores_name_check;
alter table public.scores add constraint scores_name_check
  check (char_length(name) between 1 and 20);

create index if not exists scores_normalized_name
  on public.scores (lower(btrim(name)));

create or replace function public.is_player_name_available(
  candidate_name text,
  claimed_player_id uuid default null
) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    char_length(btrim(candidate_name)) between 1 and 20
    and (
      claimed_player_id is null
      or auth.role() = 'service_role'
      or claimed_player_id = auth.uid()
    )
    and not exists (
      select 1
      from public.scores
      where lower(btrim(name)) = lower(btrim(candidate_name))
        and player_id is distinct from coalesce(claimed_player_id, auth.uid())
    );
$$;

revoke all on function public.is_player_name_available(text, uuid) from public;
grant execute on function public.is_player_name_available(text, uuid) to anon, authenticated, service_role;

commit;
