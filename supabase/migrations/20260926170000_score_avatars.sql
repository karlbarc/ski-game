begin;

alter table public.scores
  add column if not exists avatar_url text;

alter table public.scores
  drop constraint if exists scores_avatar_url_check;
alter table public.scores
  add constraint scores_avatar_url_check check (
    avatar_url is null
    or (
      char_length(avatar_url) <= 2048
      and avatar_url ~* '^https://([a-z0-9-]+\.)*googleusercontent\.com/'
    )
  );

-- Las marcas existentes reciben la foto actual de su cuenta cuando está
-- disponible. Las siguientes publicaciones la mantendrán sincronizada.
update public.scores as score
set avatar_url = profile.avatar_url
from (
  select id, coalesce(
    raw_user_meta_data ->> 'avatar_url',
    raw_user_meta_data ->> 'picture'
  ) as avatar_url
  from auth.users
) as profile
where profile.id = score.player_id
  and char_length(profile.avatar_url) <= 2048
  and profile.avatar_url ~* '^https://([a-z0-9-]+\.)*googleusercontent\.com/';

grant select (avatar_url) on public.scores to anon, authenticated;

commit;
