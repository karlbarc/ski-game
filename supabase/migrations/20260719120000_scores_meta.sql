alter table public.scores add column if not exists meta jsonb not null default '{}'::jsonb;
alter table public.scores add constraint meta_size check (pg_column_size(meta) < 2048);
