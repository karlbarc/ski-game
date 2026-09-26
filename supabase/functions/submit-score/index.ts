import { createClient } from 'npm:@supabase/supabase-js@2.117.1';
import { validateScore } from './score-validation.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'Inicia sesión con Google.' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: 'Servicio no configurado.' }, 500);

  const token = authorization.slice('Bearer '.length);
  const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
  const { data: { user }, error: authError } = await authClient.auth.getUser(token);
  if (authError || !user || user.is_anonymous || user.app_metadata?.provider !== 'google') {
    return json({ error: 'Inicia sesión con Google.' }, 401);
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: allowed, error: rateError } = await admin.rpc('consume_score_rate_limit', {
    target_player_id: user.id,
  });
  if (rateError) {
    console.error('submit-score rate limit failed', rateError.code);
    return json({ error: 'No se pudo comprobar el límite de envíos.' }, 500);
  }
  if (!allowed) {
    return json({ error: 'Demasiados envíos. Espera antes de volver a publicar.' }, 429);
  }

  let score;
  try {
    score = validateScore(await request.json());
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Solicitud inválida.' }, 400);
  }

  const { data: nameClaimed, error: nameError } = await admin.rpc('claim_player_name', {
    candidate_name: score.name,
    claimed_player_id: user.id,
  });
  if (nameError) {
    console.error('submit-score name check failed', nameError.code);
    return json({ error: 'No se pudo comprobar el nombre de usuario.' }, 500);
  }
  if (!nameClaimed) return json({ error: 'Ese nombre de usuario ya está en uso.' }, 409);

  const { error } = await admin.from('scores').upsert({ player_id: user.id, ...score }, {
    onConflict: 'track,player_id',
  });
  if (error) {
    console.error('submit-score failed', error.code);
    return json({ error: 'No se pudo publicar la marca.' }, 500);
  }
  return json({ ok: true });
});
