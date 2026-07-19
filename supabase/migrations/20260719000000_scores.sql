create table if not exists public.scores (
  player_id uuid not null,
  track text not null check (char_length(track) between 1 and 20),
  name text not null check (char_length(name) between 1 and 12),
  time_cs integer not null check (time_cs between 500 and 180000),
  speed_kmh integer check (speed_kmh between 0 and 200),
  created_at timestamptz not null default now(),
  primary key (track, player_id)
);

alter table public.scores enable row level security;

drop policy if exists "read scores" on public.scores;
create policy "read scores" on public.scores for select using (true);
drop policy if exists "insert scores" on public.scores;
create policy "insert scores" on public.scores for insert with check (true);
drop policy if exists "update own score" on public.scores;
create policy "update own score" on public.scores for update using (true) with check (true);

create index if not exists scores_track_time on public.scores (track, time_cs);
