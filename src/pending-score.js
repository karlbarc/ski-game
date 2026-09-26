const STORAGE_KEY = 'ski-pending-google-score';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function savePendingScore(storage, score, now = Date.now()) {
  storage.setItem(STORAGE_KEY, JSON.stringify({ ...score, savedAt: now }));
}

export function loadPendingScore(storage, now = Date.now()) {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const score = JSON.parse(raw);
    const valid = score
      && typeof score.trackKey === 'string'
      && typeof score.track === 'string'
      && typeof score.name === 'string'
      && score.name.trim().length >= 2
      && score.name.trim().length <= 20
      && Number.isFinite(score.timeSec)
      && Number.isFinite(score.speedKmh)
      && Number.isFinite(score.savedAt)
      && now - score.savedAt >= 0
      && now - score.savedAt <= MAX_AGE_MS;
    if (valid) return score;
  } catch {}
  storage.removeItem(STORAGE_KEY);
  return null;
}

export function clearPendingScore(storage) {
  storage.removeItem(STORAGE_KEY);
}
