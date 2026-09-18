export function createHud(doc = document) {
  const el = (id) => doc.getElementById(id);
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
    setTimer(text) { el('timer-text').textContent = text; },
    setProgress(s, total) {
      el('progress').textContent = `${Math.round(Math.min(Math.max(s, 0), total))} m`;
    },
    setSpeed(kmh) {
      const pct = Math.min(100, (kmh / 120) * 100); // ~115 km/h es la punta real del juego
      el('speed-fill').style.width = `${pct}%`;
      el('speed-value').textContent = Math.round(kmh);
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
