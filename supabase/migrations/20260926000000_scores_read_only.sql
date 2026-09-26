begin;

-- La simulacion y el cronometro viven en un cliente no confiable. La tabla
-- queda de solo lectura para los clientes; las nuevas marcas pasan por la
-- Edge Function submit-score, que valida identidad, pista y rangos.
drop policy if exists "insert own Google score" on public.scores;
drop policy if exists "update own Google score" on public.scores;

revoke insert, update on public.scores from anon, authenticated;
revoke insert (player_id, track, name, time_cs, speed_kmh)
  on public.scores from anon, authenticated;
revoke update (player_id, track, name, time_cs, speed_kmh)
  on public.scores from anon, authenticated;

commit;
