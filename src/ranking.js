import { supabase } from './supabase-client.js';
import { auth } from './auth.js';
import { createRankingApi } from './ranking-api.js';

// Legacy browser IDs are never accepted as proof of ownership.
export const playerId = () => auth.user()?.id || null;
export function playerName(storage = localStorage) {
  return storage.getItem('ski-player-name') || '';
}
export function savePlayerName(name, storage = localStorage) {
  storage.setItem('ski-player-name', name.trim().slice(0, 12));
}
export const { submitScore, fetchTop, fetchMyRank } = createRankingApi(supabase);
