export function createHud(doc = document) {
  const el = (id) => doc.getElementById(id);
  let msgTimer = 0;
  return {
    setTimer(text) { el('timer').textContent = text; },
    setSpeed(kmh) {
      const pct = Math.min(100, (kmh / 120) * 100); // ~115 km/h es la punta real del juego
      el('speed-fill').style.width = `${pct}%`;
      el('speed-num').textContent = `${Math.round(kmh)} km/h`;
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
