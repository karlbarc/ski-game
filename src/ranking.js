// Ranking global (Supabase). Sin registro: nombre arcade + id anónimo por
// dispositivo (una entrada por jugador y pista, siempre su mejor tiempo).
const SUPABASE_URL = 'https://mvhsepsnncfviwizxmcy.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12aHNlcHNubmNmdml3aXp4bWN5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ0MzMyMzgsImV4cCI6MjEwMDAwOTIzOH0.5uU25WrijknHoqNO8O52fh6dEpVL7ETP8yGHDkQbHrc';

const headers = { apikey: SUPABASE_ANON, 'Content-Type': 'application/json' };

export function playerId(storage = localStorage) {
  let id = storage.getItem('ski-player-id');
  if (!id) {
    id = crypto.randomUUID();
    storage.setItem('ski-player-id', id);
  }
  return id;
}

export function playerName(storage = localStorage) {
  return storage.getItem('ski-player-name') || '';
}

export function savePlayerName(name, storage = localStorage) {
  storage.setItem('ski-player-name', name.trim().slice(0, 12));
}

// Sube (o actualiza) la entrada del jugador para una pista.
export async function submitScore({ track, name, timeSec, speedKmh }) {
  const body = {
    player_id: playerId(),
    track,
    name: name.trim().slice(0, 12),
    time_cs: Math.round(timeSec * 100),
    speed_kmh: Math.min(200, Math.max(0, Math.round(speedKmh || 0))),
  };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/scores`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`ranking HTTP ${res.status}`);
}

export async function fetchTop(track, limit = 10) {
  const url = `${SUPABASE_URL}/rest/v1/scores`
    + `?track=eq.${encodeURIComponent(track)}`
    + `&select=player_id,name,time_cs&order=time_cs.asc&limit=${limit}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`ranking HTTP ${res.status}`);
  return res.json();
}
