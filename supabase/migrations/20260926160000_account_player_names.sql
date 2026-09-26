begin;

create table if not exists public.player_names (
  player_id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 20),
  updated_at timestamptz not null default now()
);

create unique index if not exists player_names_normalized_name
  on public.player_names (lower(btrim(name)));

alter table public.player_names enable row level security;
revoke all on public.player_names from anon, authenticated;

create or replace function public.claim_player_name(
  candidate_name text,
  claimed_player_id uuid default null
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_player_id uuid := coalesce(claimed_player_id, auth.uid());
  clean_name text := btrim(candidate_name);
begin
  if target_player_id is null
    or char_length(clean_name) not between 2 and 20
    or (
      claimed_player_id is not null
      and auth.role() <> 'service_role'
      and claimed_player_id is distinct from auth.uid()
    )
  then
    return false;
  end if;

  -- Preserve names already owned by a different account in historic scores.
  if exists (
    select 1 from public.scores
    where lower(btrim(name)) = lower(clean_name)
      and player_id <> target_player_id
  ) then
    return false;
  end if;

  begin
    insert into public.player_names (player_id, name, updated_at)
    values (target_player_id, clean_name, now())
    on conflict (player_id) do update
      set name = excluded.name, updated_at = excluded.updated_at;
  exception when unique_violation then
    return false;
  end;

  -- A rename belongs to the account, so every prior leaderboard row changes too.
  update public.scores
    set name = clean_name
    where player_id = target_player_id
      and name is distinct from clean_name;

  return true;
end;
$$;

revoke all on function public.claim_player_name(text, uuid) from public;
grant execute on function public.claim_player_name(text, uuid) to authenticated, service_role;

commit;
