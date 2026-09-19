export function createHud(doc = document) {
  const el = (id) => doc.getElementById(id);
  // El render corre hasta 60 veces por segundo, pero el texto no necesita esa
  // cadencia. Limitar las escrituras al DOM evita recalcular estilos y layout
  // en cada frame, algo especialmente costoso en móviles modestos.
  const DYNAMIC_UPDATE_MS = 100;
  let lastTimerUpdate = -Infinity;
  let lastSpeedUpdate = -Infinity;
  let lastProgressUpdate = -Infinity;
  let timerText = null;
  let speedText = null;
  let speedWidth = null;
  let progressText = null;
  let msgTimer = 0;
  return {
    setCountdown(cue) {
      const panel = el('race-start');
      panel.hidden = cue == null;
      if (cue == null || panel.dataset.cue === String(cue)) return;
      panel.dataset.cue = String(cue);
      el('start-number').textContent = cue === 0 ? '¡YA!' : cue;
      el('start-caption').textContent = cue === 0 ? 'PISTA LIBRE' : 'PREPÁRATE PARA SALIR';
      for (const [i, light] of [...panel.querySelectorAll('.start-light')].entries()) {
        light.classList.toggle('lit', cue === 0 || i < 4 - cue);
      }
    },
    setTimer(text, now = performance.now()) {
      if (now - lastTimerUpdate < DYNAMIC_UPDATE_MS) return;
      lastTimerUpdate = now;
      if (text === timerText) return;
      timerText = text;
      el('timer-text').textContent = text;
    },
    setProgress(s, total, now = performance.now()) {
      if (now - lastProgressUpdate < DYNAMIC_UPDATE_MS) return;
      lastProgressUpdate = now;
      const text = `${Math.round(Math.min(Math.max(s, 0), total))} m`;
      if (text === progressText) return;
      progressText = text;
      el('progress').textContent = text;
    },
    setSpeed(kmh, now = performance.now()) {
      if (now - lastSpeedUpdate < DYNAMIC_UPDATE_MS) return;
      lastSpeedUpdate = now;
      const pct = Math.min(100, (kmh / 120) * 100); // ~115 km/h es la punta real del juego
      const width = `${pct}%`;
      const text = String(Math.round(kmh));
      if (width !== speedWidth) {
        speedWidth = width;
        el('speed-fill').style.width = width;
      }
      if (text !== speedText) {
        speedText = text;
        el('speed-value').textContent = text;
      }
    },
    flash(text, ms = 1500) {
      const m = el('message');
      m.textContent = text;
      m.classList.add('visible');
      clearTimeout(msgTimer);
      msgTimer = setTimeout(() => m.classList.remove('visible'), ms);
    },
    showFinish(timeText, bestText, speedText, isRecord) {
      el('finish-time').textContent = timeText;
      el('finish-best').textContent = bestText;
      el('finish-speed').textContent = speedText;
      el('finish-record').style.display = isRecord ? 'block' : 'none';
      el('finish-screen').classList.add('visible');
    },
    hideFinish() { el('finish-screen').classList.remove('visible'); },
    hideStart() { el('start-screen').classList.remove('visible'); },
  };
}
