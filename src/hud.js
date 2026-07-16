export function createHud(doc = document) {
  const el = (id) => doc.getElementById(id);
  let msgTimer = 0;
  return {
    setTimer(text) { el('timer').textContent = text; },
    setSpeed(kmh) { el('speed').textContent = `${Math.round(kmh)} km/h`; },
    flash(text, ms = 1500) {
      const m = el('message');
      m.textContent = text;
      m.classList.add('visible');
      clearTimeout(msgTimer);
      msgTimer = setTimeout(() => m.classList.remove('visible'), ms);
    },
    showFinish(timeText, bestText, isRecord) {
      el('finish-time').textContent = timeText;
      el('finish-best').textContent = bestText;
      el('finish-record').style.display = isRecord ? 'block' : 'none';
      el('finish-screen').classList.add('visible');
    },
    hideFinish() { el('finish-screen').classList.remove('visible'); },
    hideStart() { el('start-screen').classList.remove('visible'); },
  };
}
