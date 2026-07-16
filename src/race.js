export function createRace(startS, finishS) {
  return { status: 'ready', startS, finishS, startTime: 0, elapsed: 0 };
}

export function updateRace(race, playerS, nowMs) {
  const r = { ...race };
  if (r.status === 'ready' && playerS >= r.startS) {
    r.status = 'running';
    r.startTime = nowMs;
  }
  if (r.status === 'running') {
    r.elapsed = (nowMs - r.startTime) / 1000;
    if (playerS >= r.finishS) r.status = 'finished';
  }
  return r;
}

export function pauseRace(race, nowMs) {
  if (race.status !== 'running' || race.pausedAt != null) return race;
  return { ...race, pausedAt: nowMs };
}

export function resumeRace(race, nowMs) {
  if (race.pausedAt == null) return race;
  // Desplaza el inicio para que el tiempo en pausa no cuente.
  const r = { ...race, startTime: race.startTime + (nowMs - race.pausedAt) };
  delete r.pausedAt;
  return r;
}

export function formatTime(sec) {
  const pad = (n) => String(n).padStart(2, '0');
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const c = Math.floor((sec * 100) % 100);
  return `${pad(m)}:${pad(s)}.${pad(c)}`;
}

export function loadBest(storage, trackName) {
  const v = storage.getItem(`ski-best-${trackName}`);
  if (v == null) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

export function saveBest(storage, trackName, time) {
  const best = loadBest(storage, trackName);
  if (best === null || time < best) {
    storage.setItem(`ski-best-${trackName}`, String(time));
    return true;
  }
  return false;
}

export function loadBestSpeed(storage, trackName) {
  const v = storage.getItem(`ski-maxspeed-${trackName}`);
  if (v == null) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

export function saveBestSpeed(storage, trackName, kmh) {
  const best = loadBestSpeed(storage, trackName);
  if (best === null || kmh > best) {
    storage.setItem(`ski-maxspeed-${trackName}`, String(kmh));
    return true;
  }
  return false;
}
