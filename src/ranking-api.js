export function createRankingApi(client) {
  return {
    async submitScore({ track, name, timeSec, speedKmh, expectedPlayerId }) {
      const { data, error: authError } = await client.auth.getSession();
      if (authError) throw authError;
      const user = data.session?.user;
      if (!user || user.is_anonymous || user.app_metadata?.provider !== 'google') {
        throw new Error('Inicia sesión con Google para publicar tu marca.');
      }
      if (user.id !== expectedPlayerId) throw new Error('Tu sesión cambió. Inicia una nueva bajada para publicar una marca.');
      const { error } = await client.from('scores').upsert({
        player_id: user.id, track, name: name.trim().slice(0, 12),
        time_cs: Math.round(timeSec * 100),
        speed_kmh: Math.min(200, Math.max(0, Math.round(speedKmh || 0))),
      }, { onConflict: 'track,player_id' });
      if (error) throw new Error('No se pudo publicar la marca. Comprueba tu conexión e inténtalo en otra bajada.');
    },
    async fetchTop(track, limit = 10) {
      const { data, error } = await client.from('scores')
        .select('player_id,name,time_cs').eq('track', track).order('time_cs')
        .limit(Math.min(50, Math.max(1, Math.trunc(limit) || 10)));
      if (error) throw error;
      return data;
    },
    async fetchMyRank(track) {
      const { data: sessionData, error: authError } = await client.auth.getSession();
      if (authError) throw authError;
      const id = sessionData.session?.user?.id;
      if (!id) return null;
      const { data, error } = await client.from('scores').select('name,time_cs')
        .eq('track', track).eq('player_id', id).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const { count, error: countError } = await client.from('scores')
        .select('player_id', { count: 'exact', head: true }).eq('track', track).lt('time_cs', data.time_cs);
      if (countError) throw countError;
      return { rank: count + 1, ...data };
    },
  };
}
