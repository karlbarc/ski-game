// Sonido procedural de los skis deslizando sobre la nieve (Web Audio, sin assets).
// Ruido blanco -> filtro paso banda -> ganancia; volumen y brillo siguen la velocidad
// y el carving añade "raspado". Debe arrancarse desde un gesto del usuario (iOS).
export function createSnowSound() {
  let ctx = null;
  let gain = null;
  let filter = null;

  function ensure() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 700;
    filter.Q.value = 0.7;
    gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start();
  }

  function resume() {
    if (ctx && ctx.state !== 'running') ctx.resume();
  }

  return {
    // Llamar dentro de un gesto del usuario (click/touch) para poder sonar en iOS.
    start() {
      // En iOS, que el audio suene aunque el interruptor de silencio esté activado.
      try {
        if (navigator.audioSession) navigator.audioSession.type = 'playback';
      } catch { /* API no disponible: seguimos igual */ }
      ensure();
      resume();
      // iOS suspende el contexto al cambiar de app; lo reactivamos al volver o al tocar.
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) resume();
      });
      window.addEventListener('touchend', resume);
    },
    // speed en m/s; steer en [-1,1]; grounded=false silencia (aire/caída/pausa).
    update(speed, steer, grounded) {
      if (!gain) return;
      const glide = Math.min(1, speed / 25);
      const target = grounded ? glide * (0.22 + 0.25 * Math.abs(steer)) : 0;
      gain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
      filter.frequency.setTargetAtTime(700 + 2500 * glide, ctx.currentTime, 0.15);
    },
    // Ovación al cruzar la meta: aplausos (ráfagas de ruido) + "woohoos" (glides).
    cheer() {
      if (!ctx) return;
      const t0 = ctx.currentTime;
      const dur = 3;
      const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
      const data = buf.getChannelData(0);
      let t = 0.05;
      while (t < dur - 0.1) {
        const start = Math.floor(t * ctx.sampleRate);
        const len = Math.floor(0.025 * ctx.sampleRate);
        const amp = 0.4 + Math.random() * 0.6;
        for (let i = 0; i < len && start + i < data.length; i++) {
          data[start + i] += (Math.random() * 2 - 1) * amp * (1 - i / len);
        }
        t += 0.02 + Math.random() * 0.06; // densidad de palmas
      }
      const claps = ctx.createBufferSource();
      claps.buffer = buf;
      const clapFilter = ctx.createBiquadFilter();
      clapFilter.type = 'bandpass';
      clapFilter.frequency.value = 1800;
      clapFilter.Q.value = 0.5;
      const clapGain = ctx.createGain();
      clapGain.gain.setValueAtTime(0.5, t0);
      clapGain.gain.setTargetAtTime(0, t0 + dur - 0.6, 0.25);
      claps.connect(clapFilter);
      clapFilter.connect(clapGain);
      clapGain.connect(ctx.destination);
      claps.start(t0);

      for (let v = 0; v < 3; v++) {
        const start = t0 + 0.15 + v * 0.35;
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        const og = ctx.createGain();
        og.gain.setValueAtTime(0, start);
        og.gain.linearRampToValueAtTime(0.16, start + 0.05);
        og.gain.setTargetAtTime(0, start + 0.55, 0.1);
        const base = 330 + v * 60;
        osc.frequency.setValueAtTime(base, start);            // "woo": sube
        osc.frequency.exponentialRampToValueAtTime(base * 2, start + 0.22);
        osc.frequency.setValueAtTime(base * 1.8, start + 0.3); // "hoo": cae
        osc.frequency.exponentialRampToValueAtTime(base * 0.9, start + 0.6);
        osc.connect(og);
        og.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.9);
      }
    },
  };
}
